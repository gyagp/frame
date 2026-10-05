import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { GlobalFonts, createCanvas, loadImage } from "@napi-rs/canvas";
import { assertProject } from "../src/model.mjs";
import { paletteFingerprint } from "../src/presets.mjs";
export const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const projectDir = (id) => {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id))
    throw new Error("Invalid project ID");
  return path.join(ROOT, "projects", id);
};
export const readJSON = async (filename) =>
  JSON.parse(await readFile(filename, "utf8"));
export const writeJSON = async (filename, data) => {
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, JSON.stringify(data, null, 2) + "\n");
};
export const hashProject = (p) => {
  const hash = createHash("sha256").update(
    JSON.stringify({ ...p, review: undefined }),
  );
  const paletteData = paletteFingerprint(p.theme);
  if (paletteData) hash.update(paletteData);
  for (const source of [
    "src/film.mjs",
    "src/model.mjs",
    "src/azure.mjs",
    "src/engine/motion.mjs",
    "src/engine/schema.mjs",
    "src/engine/renderer.mjs",
    "scripts/audio.mjs",
    "scripts/render.mjs",
  ])
    hash.update(readFileSync(path.join(ROOT, source)));
  for (const name of [
    ...new Set(
      p.scenes
        .flatMap((s) => [
          s.image,
          s.imageAlt,
          ...(s.composition?.layers ?? [])
            .filter((x) => x.type === "image")
            .map((x) => x.asset),
        ])
        .filter(Boolean),
    ),
  ].sort()) {
    if (!/^assets\/[a-zA-Z0-9._-]+\.(png|jpe?g)$/.test(name))
      throw new Error("Invalid image path");
    try {
      hash.update(readFileSync(path.join(projectDir(p.id), name)));
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      hash.update("missing:" + name);
    }
  }
  return hash.digest("hex").slice(0, 16);
};
export const storySignature = (p) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        title: p.title,
        idea: p.idea,
        brief: p.brief,
        bible: p.bible,
        language: p.language,
        voice: p.voice,
        width: p.width,
        height: p.height,
        theme: p.theme,
        music: p.music,
        scenes: p.scenes.map(
          ({ image, imageAlt, composition, soundCues, ...scene }) => scene,
        ),
      }),
    )
    .digest("hex");
export const reviewState = (p) => {
  const storyApproved = p.review?.story === storySignature(p),
    framesApproved = storyApproved && p.review?.frames === hashProject(p);
  return {
    storyApproved,
    framesApproved,
    sampleApproved: framesApproved && p.review?.sample === hashProject(p),
  };
};
export async function loadProject(id) {
  return assertProject(
    await readJSON(path.join(projectDir(id), "project.json")),
  );
}
export async function graphics(p) {
  GlobalFonts.registerFromPath(
    path.join(ROOT, "public", "fonts", "InterVariable.ttf"),
    "Studio Sans",
  );
  if (process.platform === "win32")
    GlobalFonts.registerFromPath(
      "C:/Windows/Fonts/msyh.ttc",
      "Microsoft YaHei",
    );
  const assets = {};
  for (const s of p.scenes)
    for (const name of [
      s.image,
      s.imageAlt,
      ...(s.composition?.layers ?? [])
        .filter((x) => x.type === "image")
        .map((x) => x.asset),
    ].filter(Boolean)) {
      if (!/^assets\/[a-zA-Z0-9._-]+\.(png|jpe?g)$/.test(name))
        throw new Error("Invalid image reference");
      assets[name] = await loadImage(path.join(projectDir(p.id), name));
    }
  return { assets, canvas: createCanvas(p.width ?? 1920, p.height ?? 1080) };
}
export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      windowsHide: true,
      ...options,
    });
    let out = "",
      err = "";
    child.stdout?.on("data", (d) => (out += d));
    child.stderr?.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve({ out, err })
        : reject(
            new Error(
              `${command} exited ${code}: ${err.slice(-3000) || out.slice(-3000)}`,
            ),
          ),
    );
  });
}
export async function renderContext() {
  const id = process.argv[2] ?? "subgroup-matrix";
  const snapshot = process.argv.indexOf("--snapshot");
  const p =
    snapshot >= 0
      ? assertProject(await readJSON(process.argv[snapshot + 1]))
      : await loadProject(id);
  if (p.id !== id) throw new Error("Snapshot project mismatch");
  const out = path.join(ROOT, "outputs", id, hashProject(p));
  await mkdir(out, { recursive: true });
  await writeJSON(path.join(out, "project.json"), p);
  return { p, out };
}
