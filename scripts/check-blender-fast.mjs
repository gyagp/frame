// Isolated GPU smoke render: never overwrites approved or completed movie frames.
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { ROOT, loadProject, hashProject, readJSON, writeJSON } from "./lib.mjs";
import {
  prepareCachedShot,
  renderCachedShot,
  verifiedFrames,
  frameName,
} from "../src/blender-fast.mjs";
import { timeline } from "../src/model.mjs";
import { compileCameraCues } from "../src/cue-timing.mjs";
import { createCanvas, loadImage } from "@napi-rs/canvas";

const p = await loadProject(process.argv[2] ?? "little-pony-crosses-river");
const projectHash = hashProject(p),
  out = path.join(ROOT, "outputs", p.id, projectHash);
const audio = await readJSON(path.join(out, "audio.json"));
const checkFolder = path.join(ROOT, ".cache", "gpu-switch", "validation");
await mkdir(checkFolder, { recursive: true });
const results = [],
  canvas = createCanvas(960, 540 * 3),
  ctx = canvas.getContext("2d");
for (const [row, index] of [0, 12, 17].entries()) {
  const scene = timeline(p)[index];
  const plan = await prepareCachedShot({
    scene: compileCameraCues(
      scene,
      audio.cues.filter((c) => c.sceneId === scene.id),
      scene.start,
    ),
    out,
    width: p.width,
    height: p.height,
    fps: p.fps,
    projectHash,
  });
  plan.folder = path.join(checkFolder, scene.id);
  plan.frameHashes = {};
  plan.missing = [Math.round(plan.total / 2)];
  await renderCachedShot(plan, (event) =>
    console.log(scene.id, JSON.stringify(event)),
  );
  const checkpoint = await readJSON(path.join(plan.folder, "fast-frames.json"));
  const valid = await verifiedFrames(
    plan.folder,
    checkpoint,
    plan.identity,
    plan.total,
  );
  if (Object.keys(valid).length !== 1)
    throw new Error("GPU smoke frame failed integrity check");
  const profile = await readJSON(path.join(plan.folder, "gpu-profile.json"));
  if (
    !profile.gpuDenoising ||
    !profile.persistentData ||
    profile.samples !== 64
  )
    throw new Error("GPU profile mismatch");
  ctx.drawImage(
    await loadImage(path.join(plan.folder, frameName(plan.missing[0]))),
    0,
    row * 540,
    960,
    540,
  );
  results.push(profile);
}
await writeFile(
  path.join(checkFolder, "contact.jpg"),
  await canvas.encode("jpeg", 90),
);
await writeJSON(path.join(checkFolder, "checks.json"), {
  projectHash,
  results,
  visualReview: "pending",
});
console.log("GPU validation frames ready: " + checkFolder);
