// An isolated engineering fixture, never an approval or a render of a user's film.
import path from "node:path";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { renderBlenderShot } from "../src/blender.mjs";
import { ROOT, writeJSON, run } from "./lib.mjs";
const out = path.join(ROOT, "outputs", "blender-fixture", "v1");
const scene = {
  id: "geometry-motion",
  duration: 2,
  spatial: {
    version: 1,
    seed: 42,
    environment: "studio-v1",
    camera: { position: [4, -6, 3], target: [0, 0, 0.7], lens: 48 },
    actors: [
      {
        id: "cube",
        asset: "cube-v1",
        position: [0, 0, 0.6],
        heading: 0,
        action: "walk",
        travel: 1,
        bag: false,
      },
    ],
  },
};
scene.spatial.camera.keys = [
  { k: 0, position: [4, -6, 3], target: [0, 0, 0.7] },
  { k: 0.5, position: [3, -6, 3.5], target: [0.3, 0, 0.7] },
  { k: 1, position: [2, -6, 3], target: [0.7, 0, 0.7] },
];
await mkdir(out, { recursive: true });
const first = await renderBlenderShot({
  scene,
  out: path.join(out, "random-order"),
  width: 320,
  height: 180,
  fps: 12,
  frames: [24, 1, 12],
});
async function pixels(file) {
  const c = createCanvas(320, 180);
  c.getContext("2d").drawImage(await loadImage(file), 0, 0);
  return c.data();
}
const report = await renderBlenderShot({
  scene,
  out,
  width: 320,
  height: 180,
  fps: 12,
  frames: Array.from({ length: 24 }, (_, i) => i + 1),
});
const hashes = [];
for (const f of [1, 12, 24])
  hashes.push(
    createHash("sha256")
      .update(
        await readFile(
          path.join(report.folder, `frame-${String(f).padStart(5, "0")}.png`),
        ),
      )
      .digest("hex"),
  );
if (new Set(hashes).size !== 3)
  throw new Error("Fixture motion did not change the rendered image");
const cached = await renderBlenderShot({
  scene,
  out,
  width: 320,
  height: 180,
  fps: 12,
  frames: [1, 12, 24],
});
if (!cached.cacheHit) throw new Error("Verified render cache was not reused");
const low = structuredClone(scene);
low.id = "camera-safety";
delete low.spatial.camera.keys;
low.spatial.camera.position = [4, -6, -1];
low.spatial.camera.safety = {
  clearance: 0.08,
  avoidGround: true,
  framing: "detail",
};
const safety = await renderBlenderShot({
  scene: low,
  out,
  width: 160,
  height: 90,
  fps: 12,
  frames: [1],
});
if (
  !safety.cameraDiagnostics.some(
    (w) => w.code === "camera-ground" && w.corrected,
  )
)
  throw new Error("Camera correction was not reported");
const pixelComparisons = [];
for (const frame of [1, 12, 24]) {
  const name = `frame-${String(frame).padStart(5, "0")}.png`;
  // Compare pixels, excluding Blender's per-render PNG timing metadata.
  const a = await pixels(path.join(first.folder, name)),
    b = await pixels(path.join(report.folder, name));
  let max = 0,
    sum = 0,
    changed = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    max = Math.max(max, d);
    sum += d;
    if (d) changed++;
  }
  const comparison = {
    frame,
    maxChannelDelta: max,
    meanChannelDelta: sum / a.length,
    changedChannels: changed,
  };
  pixelComparisons.push(comparison);
  // Cycles/OptiX floating-point denoising can differ by one 8-bit level on a
  // handful of channels. Geometry/time is deterministic; pixels are tolerance-bound.
  if (max > 1 || sum / a.length > 0.001)
    throw new Error("Random-access rendering exceeded pixel tolerance");
}
await run("ffmpeg", [
  "-y",
  "-v",
  "error",
  "-framerate",
  "12",
  "-i",
  path.join(report.folder, "frame-%05d.png"),
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  path.join(out, "motion-fixture.mp4"),
]);
const media = JSON.parse(
  (
    await run("ffprobe", [
      "-v",
      "error",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      path.join(out, "motion-fixture.mp4"),
    ])
  ).out,
);
if (
  media.streams[0].codec_name !== "h264" ||
  Number(media.format.duration) !== 2
)
  throw new Error("Unexpected fixture encode");
await writeJSON(path.join(out, "verification.json"), {
  ...report,
  sampledFrameHashes: hashes,
  distinctMotionFrames: true,
  randomAccessWithinTolerance: true,
  cacheVerified: true,
  cameraGuardVerified: true,
  tolerance: { maxChannelDelta: 1, meanChannelDelta: 0.001 },
  pixelComparisons,
  media,
  checkedAt: new Date().toISOString(),
  claims:
    "Real geometry, camera, baked animation, PNG and H.264 export; no character-quality or audio claim.",
});
console.log(JSON.stringify({ out, ...report }, null, 2));
