import path from "node:path";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";
import { loadImage } from "@napi-rs/canvas";
import { probeBlender, renderBlenderShot } from "./blender.mjs";
import { validateSpatial } from "./blender-schema.mjs";
import { atomicJSON } from "./render-io.mjs";
export { atomicJSON } from "./render-io.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const GPU_PROFILE = "optix-oidn-gpu-persistent-png0-v1";
export const digest = (data) => createHash("sha256").update(data).digest("hex");
export const readJSON = async (file) =>
  JSON.parse(await readFile(file, "utf8"));
export const frameName = (n) => `frame-${String(n).padStart(5, "0")}.png`;

const executionFiles = [
  "render-cached.py",
  "blender-fast.mjs",
  "blender-fast-render.mjs",
  "render-io.mjs",
];
async function archiveExecutor(out, sources) {
  const hash = digest(Buffer.concat(sources));
  const folder = path.join(out, "executors", hash);
  await mkdir(folder, { recursive: true });
  for (const [i, bytes] of sources.entries()) {
    const file = path.join(folder, executionFiles[i]);
    try {
      await writeFile(file, bytes, { flag: "wx" });
    } catch (error) {
      if (error.code !== "EEXIST" || !bytes.equals(await readFile(file)))
        throw error;
    }
  }
  return hash;
}

// Raw PNG reuse depends on the exact Python renderer and scene identity. Changes
// to Node's progress/file handling do not change pixels. Verify and preserve the
// old execution sources before accepting that checkpoint; never trust a label.
export async function compatibleExecutor(
  out,
  sourceFolder,
  record,
  currentWorker,
) {
  if (
    record?.profile !== GPU_PROFILE ||
    !/^[a-f0-9]{64}$/.test(record?.executorHash)
  )
    return false;
  for (const archived of [true, false]) {
    try {
      const base = archived
        ? path.join(out, "executors", record.executorHash)
        : out;
      const sources = await Promise.all(
        executionFiles
          .slice(0, 3)
          .map((name, i) =>
            readFile(
              path.join(!archived && i === 0 ? sourceFolder : base, name),
            ),
          ),
      );
      if (archived) {
        const io = await readFile(path.join(base, "render-io.mjs")).catch(
          (e) => {
            if (e.code !== "ENOENT") throw e;
            return null;
          },
        );
        if (io) sources.push(io);
      }
      if (
        !sources[0].equals(currentWorker) ||
        digest(Buffer.concat(sources)) !== record.executorHash
      )
        continue;
      await archiveExecutor(out, sources);
      return true;
    } catch {
      /* Missing or modified source evidence cannot authorize cache reuse. */
    }
  }
  return false;
}

// A filename alone is never a checkpoint. Bind each reusable PNG to its scene,
// project, dimensions and content digest; preview and partially written files fail.
export async function verifiedFrames(folder, record, identity, total) {
  const valid = {};
  if (!record || !isDeepStrictEqual(record.identity, identity)) return valid;
  for (const [number, hash] of Object.entries(record.frameHashes ?? {})) {
    const n = Number(number);
    if (
      !Number.isInteger(n) ||
      n < 1 ||
      n > total ||
      !/^[a-f0-9]{64}$/.test(hash)
    )
      continue;
    try {
      const bytes = await readFile(path.join(folder, frameName(n)));
      if (digest(bytes) !== hash) continue;
      const img = await loadImage(bytes);
      if (img.width === identity.width && img.height === identity.height)
        valid[n] = hash;
    } catch {
      /* Missing/corrupt frames are regenerated. */
    }
  }
  return valid;
}

export async function prepareCachedShot({
  scene,
  out,
  width,
  height,
  fps,
  projectHash,
}) {
  const total = Math.round(scene.duration * fps);
  if (
    !/^[a-z0-9-]+$/.test(scene.id) ||
    !/^[a-f0-9]{16}$/.test(projectHash) ||
    !scene.spatial ||
    validateSpatial(scene.spatial).length ||
    ![12, 24].includes(fps) ||
    !Number.isFinite(scene.duration) ||
    scene.duration < 1 ||
    scene.duration > 60 ||
    !Number.isInteger(width) ||
    width < 160 ||
    width > 1920 ||
    !Number.isInteger(height) ||
    height < 90 ||
    height > 1920
  )
    throw new Error("Invalid cached Blender scene");
  const folder = path.join(out, "blender", scene.id);
  let blendHash, legacy, fast;
  const inspect = async () => {
    const m = await readJSON(path.join(folder, "manifest.json"));
    if (
      m.sceneId !== scene.id ||
      m.duration !== scene.duration ||
      m.fps !== fps ||
      !isDeepStrictEqual(m.spatial, scene.spatial)
    )
      throw new Error("Cached scene differs");
    for (const [saved, source] of [
      ["scene-builder.py", "build.py"],
      ["natural_assets.py", "natural_assets.py"],
      ["camera_tools.py", "camera_tools.py"],
      ["performance.py", "performance.py"],
    ])
      if (
        digest(await readFile(path.join(folder, saved))) !==
        digest(await readFile(path.join(ROOT, "scripts/blender", source)))
      )
        throw new Error("Cached scene builder differs");
    blendHash = digest(await readFile(path.join(folder, "scene.blend")));
    legacy = await readJSON(path.join(folder, "resume-frames.json")).catch(
      () => null,
    );
    fast = await readJSON(path.join(folder, "fast-frames.json")).catch(
      () => null,
    );
    const built = await readJSON(path.join(folder, "execution.json")).catch(
      () => null,
    );
    const bound = (r) =>
      r?.identity?.blendHash === blendHash &&
      r.identity.projectHash === projectHash &&
      r.identity.sceneId === scene.id;
    if (!bound(legacy) && !bound(fast) && built?.blendHash !== blendHash)
      throw new Error("Unverified cached scene");
  };
  try {
    await inspect();
  } catch {
    // Future projects may not have a compiled, voice-timed scene yet. The existing
    // trusted builder creates it; it never loads a project-supplied .blend path.
    await renderBlenderShot({ scene, out, width, height, fps, frames: [1] });
    await inspect();
  }
  const identity = {
    projectHash,
    sceneId: scene.id,
    blendHash,
    width,
    height,
    fps,
  };
  const worker = path.join(ROOT, "scripts/blender/render-cached.py");
  const workerBytes = await readFile(worker);
  const executorHash = await archiveExecutor(out, [
    workerBytes,
    await readFile(fileURLToPath(import.meta.url)),
    await readFile(path.join(ROOT, "scripts/blender-fast-render.mjs")),
    await readFile(path.join(ROOT, "src/render-io.mjs")),
  ]);
  const legacyFrames = await verifiedFrames(folder, legacy, identity, total);
  const fastFrames =
    fast?.profile === GPU_PROFILE &&
    (fast?.executorHash === executorHash ||
      (await compatibleExecutor(out, folder, fast, workerBytes)))
      ? await verifiedFrames(folder, fast, identity, total)
      : {};
  const frameHashes = { ...legacyFrames, ...fastFrames };
  return {
    folder,
    sourceFolder: folder,
    scene,
    total,
    identity,
    worker,
    executorHash,
    frameHashes,
    missing: Array.from({ length: total }, (_, i) => i + 1).filter(
      (n) => !frameHashes[n],
    ),
  };
}

export async function renderCachedShot(plan, onFrame = async () => {}) {
  if (!plan.missing.length) return;
  const { executable } = await probeBlender();
  await mkdir(plan.folder, { recursive: true });
  await copyFile(plan.worker, path.join(plan.folder, "render-cached.py"));
  const request = path.join(plan.folder, "fast-request.json");
  await atomicJSON(request, {
    folder: plan.folder,
    identity: plan.identity,
    profile: GPU_PROFILE,
    executorHash: plan.executorHash,
    frames: plan.missing,
    frameHashes: plan.frameHashes,
  });
  await new Promise((resolve, reject) => {
    const child = spawn(
      executable,
      [
        "--background",
        "--factory-startup",
        "--disable-autoexec",
        path.join(plan.sourceFolder, "scene.blend"),
        "--python-exit-code",
        "1",
        "--python",
        path.join(plan.folder, "render-cached.py"),
        "--",
        request,
      ],
      { cwd: ROOT, windowsHide: true, shell: false },
    );
    const log = createWriteStream(path.join(plan.folder, "fast-render.log"), {
      flags: "a",
    });
    let pending = "",
      tail = "",
      queue = Promise.resolve(),
      callbackError;
    const collect = (data) => {
      log.write(data);
      tail = (tail + data).slice(-5000);
      pending += data;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop();
      for (const line of lines)
        if (line.startsWith("STUDIO_FRAME ")) {
          queue = queue
            .then(async () => {
              const event = JSON.parse(line.slice(13));
              if (
                !plan.missing.includes(event.frame) ||
                !/^[a-f0-9]{64}$/.test(event.sha256)
              )
                throw new Error("Invalid frame event");
              plan.frameHashes[event.frame] = event.sha256;
              await onFrame(event);
            })
            .catch((error) => {
              callbackError = error;
              child.kill();
            });
        }
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", (data) => {
      log.write(data);
      tail = (tail + data).slice(-5000);
    });
    log.on("error", (error) => {
      callbackError = error;
      child.kill();
    });
    child.on("error", (error) => {
      log.end();
      reject(error);
    });
    child.on("close", async (code) => {
      await queue;
      log.end();
      if (callbackError) reject(callbackError);
      else if (code !== 0)
        reject(new Error(`Cached Blender exited ${code}: ${tail}`));
      else if (plan.missing.some((n) => !plan.frameHashes[n]))
        reject(new Error("Blender did not finish requested frames"));
      else resolve();
    });
  });
}

export function resumedProgress(plans, activeIndex, seconds = []) {
  const total = plans.reduce((n, p) => n + p.total, 0);
  const done = plans.reduce((n, p) => n + Object.keys(p.frameHashes).length, 0);
  const recent = seconds.filter((s) => Number.isFinite(s) && s > 0).slice(-30);
  const secondsPerFrame =
    recent.length >= 3
      ? recent.reduce((a, b) => a + b, 0) / recent.length
      : null;
  return {
    activeSceneId: plans[activeIndex].scene.id,
    sceneIndex: activeIndex + 1,
    sceneCount: plans.length,
    shotDone: Object.keys(plans[activeIndex].frameHashes).length,
    shotTotal: plans[activeIndex].total,
    done,
    total,
    picturePercent: (100 * done) / total,
    progress: Math.floor(12 + (65 * done) / total),
    secondsPerFrame,
    remainingSeconds:
      secondsPerFrame === null
        ? null
        : Math.ceil((total - done) * secondsPerFrame),
  };
}
