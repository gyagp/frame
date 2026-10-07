import os from "node:os";
import path from "node:path";
import { readFile, writeFile, mkdir, stat, copyFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { validateSpatial } from "./blender-schema.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const BLENDER_CONFIG = path.join(
  os.homedir(),
  ".movie-studio",
  "blender.json",
);
// This local file is configured by CLI only. The browser cannot supply an executable.
export async function blenderConfig() {
  let config;
  try {
    config = JSON.parse(await readFile(BLENDER_CONFIG, "utf8"));
  } catch {
    throw new Error(
      "Blender 尚未配置：运行 npm run blender:setup -- <blender.exe 的绝对路径>",
    );
  }
  if (
    !path.isAbsolute(config.executable) ||
    !/blender(?:\.exe)?$/i.test(path.basename(config.executable))
  )
    throw new Error("Invalid local Blender executable");
  await stat(config.executable);
  return config;
}
export function blenderProcess(executable, args, timeout = 30 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      shell: false,
      windowsHide: true,
      cwd: root,
    });
    let output = "",
      expired = false;
    const timer = setTimeout(() => {
      expired = true;
      child.kill();
    }, timeout);
    const collect = (d) => {
      output = (output + d).slice(-64000);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0 && !expired
        ? resolve(output)
        : reject(
            new Error(
              `Blender ${expired ? "timeout" : `exit ${code}`}: ${output.slice(-5000)}`,
            ),
          );
    });
  });
}
export async function probeBlender() {
  const config = await blenderConfig();
  const version = (
    await blenderProcess(config.executable, ["--version"], 15000)
  ).split(/\r?\n/)[0];
  if (!/^Blender 4\.5\./.test(version))
    throw new Error("此构建器当前只验证 Blender 4.5 LTS");
  if (config.version !== version)
    throw new Error(
      "Blender 版本已更换，请重新运行 blender:setup，避免复用旧版渲染。",
    );
  return { version, executable: config.executable };
}
export async function blenderStatus() {
  try {
    const { version } = await probeBlender();
    return {
      installed: true,
      version,
      stage: "blocking",
      message: `${version} · 可编辑场景与预演渲染`,
    };
  } catch (e) {
    return { installed: false, stage: "unavailable", message: e.message };
  }
}
export async function configureBlender(executable) {
  if (
    !path.isAbsolute(executable) ||
    !/blender(?:\.exe)?$/i.test(path.basename(executable))
  )
    throw new Error("Use an absolute Blender executable path");
  const version = (
    await blenderProcess(executable, ["--version"], 15000)
  ).split(/\r?\n/)[0];
  if (!/^Blender 4\.5\./.test(version))
    throw new Error("Expected Blender 4.5 LTS");
  await mkdir(path.dirname(BLENDER_CONFIG), { recursive: true });
  await writeFile(
    BLENDER_CONFIG,
    JSON.stringify({ executable, version }, null, 2) + "\n",
  );
  return { version };
}
export async function renderBlenderShot({
  scene,
  out,
  width,
  height,
  fps,
  frames,
}) {
  const errors = validateSpatial(scene.spatial);
  if (!scene.spatial || errors.length)
    throw new Error(errors.join("; ") || "Missing Blender scene");
  if (
    !/^[a-z0-9-]+$/.test(scene.id) ||
    !Number.isFinite(scene.duration) ||
    scene.duration < 1 ||
    scene.duration > 60 ||
    ![12, 24].includes(fps) ||
    !Number.isInteger(width) ||
    width < 160 ||
    width > 1920 ||
    !Number.isInteger(height) ||
    height < 90 ||
    height > 1920 ||
    !Array.isArray(frames) ||
    !frames.length ||
    frames.length > 1440 ||
    frames.some(
      (f) =>
        !Number.isInteger(f) || f < 1 || f > Math.ceil(scene.duration * fps),
    )
  )
    throw new Error("Invalid Blender render range");
  const { executable, version } = await probeBlender();
  const folder = path.join(out, "blender", scene.id);
  await mkdir(folder, { recursive: true });
  const manifest = {
    version: 1,
    sceneId: scene.id,
    duration: scene.duration,
    spatial: scene.spatial,
    width,
    height,
    fps,
    frames,
  };
  const manifestPath = path.join(folder, "manifest.json");
  const sourceFiles = [
    "scripts/blender/build.py",
    "scripts/blender/natural_assets.py",
    "scripts/blender/camera_tools.py",
    "scripts/blender/performance.py",
    "assets/3d/jjmoser-horse/mesh.json",
    "assets/3d/jjmoser-horse/albedo.png",
    "assets/3d/jjmoser-horse/normal.png",
  ];
  const signature = createHash("sha256").update(
    JSON.stringify({
      ...manifest,
      frames: undefined,
      rendererVersion: version,
    }),
  );
  for (const file of sourceFiles)
    signature.update(await readFile(path.join(root, file)));
  const executionKey = signature.digest("hex");
  const digest = async (file) =>
    createHash("sha256")
      .update(await readFile(file))
      .digest("hex");
  try {
    const cached = JSON.parse(
      await readFile(path.join(folder, "execution.json"), "utf8"),
    );
    if (
      cached.key === executionKey &&
      (await digest(path.join(folder, "scene.blend"))) === cached.blendHash
    ) {
      let intact = true;
      for (const frame of frames)
        if (
          cached.frameHashes[frame] !==
          (await digest(
            path.join(folder, `frame-${String(frame).padStart(5, "0")}.png`),
          ))
        )
          intact = false;
      if (intact)
        return {
          folder,
          ...JSON.parse(
            await readFile(path.join(folder, "report.json"), "utf8"),
          ),
          builderHash: cached.builderHash,
          executionKey,
          cacheHit: true,
        };
    }
  } catch {}
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  const builder = path.join(root, "scripts", "blender", "build.py");
  await copyFile(builder, path.join(folder, "scene-builder.py"));
  await copyFile(
    path.join(root, "scripts", "blender", "natural_assets.py"),
    path.join(folder, "natural_assets.py"),
  );
  await copyFile(
    path.join(root, "scripts", "blender", "camera_tools.py"),
    path.join(folder, "camera_tools.py"),
  );
  await copyFile(
    path.join(root, "scripts/blender/performance.py"),
    path.join(folder, "performance.py"),
  );
  // All CLI arguments and paths are server-owned; spatial data only reaches JSON.
  const log = await blenderProcess(executable, [
    "--background",
    "--factory-startup",
    "--disable-autoexec",
    "--python-exit-code",
    "1",
    "--python",
    builder,
    "--",
    manifestPath,
    folder,
  ]);
  await writeFile(path.join(folder, "render.log"), log);
  for (const frame of frames)
    await stat(
      path.join(folder, `frame-${String(frame).padStart(5, "0")}.png`),
    );
  const report = JSON.parse(
    await readFile(path.join(folder, "report.json"), "utf8"),
  );
  const builderHash = await digest(builder),
    frameHashes = {};
  for (const frame of frames)
    frameHashes[frame] = await digest(
      path.join(folder, `frame-${String(frame).padStart(5, "0")}.png`),
    );
  await writeFile(
    path.join(folder, "execution.json"),
    JSON.stringify(
      {
        key: executionKey,
        version,
        builderHash,
        frameHashes,
        blendHash: await digest(path.join(folder, "scene.blend")),
      },
      null,
      2,
    ),
  );
  return {
    folder,
    version,
    ...report,
    builderHash,
    executionKey,
    cacheHit: false,
  };
}
