import path from "node:path";
import { mkdir, writeFile, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { loadImage } from "@napi-rs/canvas";
import {
  renderContext,
  reviewState,
  writeJSON,
  graphics,
  run,
  hashProject,
} from "./lib.mjs";
import {
  prepareCachedShot,
  renderCachedShot,
  resumedProgress,
  GPU_PROFILE,
} from "../src/blender-fast.mjs";
import { progressWriter } from "../src/render-io.mjs";
import { progressMessage } from "../src/render-progress.mjs";
import { buildAudio } from "./audio.mjs";
import { timeline, duration } from "../src/model.mjs";
import { mediaExecutable } from "../src/media-tools.mjs";
import { compileCameraCues } from "../src/cue-timing.mjs";

// Execution settings are recorded separately from the approved scene fingerprint.
const { p, out } = await renderContext({ backend: "blender" });
if (process.argv.includes("--sample") || process.argv.includes("--audio-only"))
  throw new Error("Cached GPU executor is for approved full films");
const sample = process.argv.includes("--sample"),
  audioOnly = process.argv.includes("--audio-only");
const state = reviewState(p);
if (!state.framesApproved)
  throw new Error("请先确认故事与关键画面，再制作有声样片。");
if (!sample && !audioOnly && !state.sampleApproved)
  throw new Error("请先确认有声短样片，再制作全片。");
if (!p.voice.startsWith("Azure "))
  throw new Error("3D 影片使用 Azure Speech 配音");
const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i < 0 ? fallback : Number(process.argv[i + 1]);
};
const start = sample ? arg("--start", 0) : 0,
  length = sample
    ? Math.min(arg("--length", 12), duration(p) - start)
    : duration(p);
if (
  !Number.isFinite(start) ||
  !Number.isFinite(length) ||
  start < 0 ||
  length < 1 ||
  start + length > duration(p)
)
  throw new Error("Invalid render range");
const writeProgress = progressWriter(path.join(out, "progress.json"));
const status = (progress, message) =>
  writeProgress({
    phase: "blender",
    progress,
    message,
  });
const audioOut = sample ? path.join(out, "sample-audio") : out;
await mkdir(audioOut, { recursive: true });
const audioProject = sample
  ? {
      ...p,
      scenes: timeline(p).map(({ start: s, end, ...scene }) => ({
        ...scene,
        narration: end > start && s < start + length ? scene.narration : "",
      })),
    }
  : p;
const audio = await buildAudio(audioProject, audioOut, (done, total) =>
  status(Math.round((done / total) * 10), `Azure 配音 ${done} / ${total}`),
);
if (audioOnly) {
  await status(100, "Azure 旁白已生成");
  process.exit(0);
}
// The three representative stills are required before an animation export.
for (const s of [
  p.scenes[0],
  p.scenes[Math.floor(p.scenes.length / 2)],
  p.scenes.at(-1),
])
  await stat(path.join(out, `frame-${s.id}.png`));
const frames = [],
  plans = [],
  projectHash = hashProject(p);
await status(12, "验证已完成的画面，准备 GPU 加速续渲");
for (const s of timeline(p)) {
  plans.push(
    await prepareCachedShot({
      scene: compileCameraCues(
        s,
        audio.cues.filter((c) => c.sceneId === s.id),
        s.start,
      ),
      out,
      width: p.width,
      height: p.height,
      fps: p.fps,
      projectHash,
    }),
  );
}
const retained = plans.reduce(
  (n, plan) => n + Object.keys(plan.frameHashes).length,
  0,
);
await writeJSON(path.join(out, "gpu-execution.json"), {
  profile: GPU_PROFILE,
  projectHash,
  startedAt: new Date().toISOString(),
  retained,
  width: p.width,
  height: p.height,
  fps: p.fps,
  sceneChanges: false,
  samplesChanged: false,
  shots: plans.map((plan) => ({
    sceneId: plan.scene.id,
    identity: plan.identity,
    executorHash: plan.executorHash,
    retained: Object.keys(plan.frameHashes).length,
    missing: plan.missing.length,
  })),
});
console.log(`GPU resume: retained ${retained} completed frames`);
// prepareCachedShot archives each executor by content hash, keeping older
// checkpoints reproducible across progress/file-handling fixes.
const timings = [];
const publish = async (i) => {
  const state = resumedProgress(plans, i, timings);
  await writeProgress({
    phase: "blender",
    progress: state.progress,
    message: progressMessage(plans[i].scene.title, state),
    observer: {
      ...state,
      retained,
      profile: GPU_PROFILE,
      observedAt: new Date().toISOString(),
      scope:
        "Verified picture frames; ETA excludes encoding and varies by shot",
    },
  });
};
for (const [i, plan] of plans.entries()) {
  await publish(i);
  let first = true;
  await renderCachedShot(plan, async (event) => {
    // First frame of each scene includes GPU/scene initialization.
    if (!first) timings.push(event.seconds);
    first = false;
    await publish(i);
  });
  for (let f = 1; f <= plan.total; f++)
    frames.push({
      file: path.join(plan.folder, `frame-${String(f).padStart(5, "0")}.png`),
      time: plan.scene.start + (f - 1) / p.fps,
    });
}
await status(80, "画面渲染完成，正在编码与合成电影");
const { canvas } = await graphics(p),
  c = canvas.getContext("2d");
const picture = path.join(out, sample ? "sample-picture.mp4" : "picture.mp4");
const child = spawn(
  mediaExecutable("ffmpeg"),
  [
    "-y",
    "-v",
    "error",
    "-f",
    "rawvideo",
    "-pixel_format",
    "rgba",
    "-video_size",
    `${p.width}x${p.height}`,
    "-framerate",
    String(p.fps),
    "-i",
    "pipe:0",
    "-an",
    "-c:v",
    "libx264",
    "-crf",
    "19",
    "-pix_fmt",
    "yuv420p",
    picture,
  ],
  { windowsHide: true },
);
let failure = "",
  pipeError;
child.stderr.on("data", (d) => (failure += d));
child.stdin.on("error", (e) => (pipeError = e));
const finished = once(child, "close");
for (const [i, f] of frames.entries()) {
  if (pipeError) throw pipeError;
  c.drawImage(await loadImage(f.file), 0, 0, p.width, p.height);
  if (i === Math.min(48, frames.length - 1))
    await writeFile(
      path.join(out, sample ? "sample-poster.jpg" : "poster.jpg"),
      await canvas.encode("jpeg", 90),
    );
  const cue = audio.cues.find((q) => f.time >= q.start && f.time < q.end);
  if (cue) {
    c.font = "38px 'Microsoft YaHei', 'Studio Sans', sans-serif";
    const lines = [];
    let line = "";
    for (const ch of cue.text) {
      if (c.measureText(line + ch).width > p.width * 0.82) {
        lines.push(line);
        line = "";
      }
      line += ch;
    }
    if (line) lines.push(line);
    const h = lines.length * 48 + 32,
      y = p.height * 0.92 - h;
    c.fillStyle = "#14201ddd";
    c.fillRect(p.width * 0.07, y, p.width * 0.86, h);
    c.fillStyle = "#fff9e9";
    c.textAlign = "center";
    c.textBaseline = "top";
    lines.forEach((l, n) => c.fillText(l, p.width / 2, y + 16 + n * 48));
  }
  if (!child.stdin.write(canvas.data())) await once(child.stdin, "drain");
}
child.stdin.end();
const [code] = await finished;
if (code !== 0) throw new Error(failure);
await status(95, "合成画面、Azure 旁白与字幕");
await run("ffmpeg", [
  "-y",
  "-v",
  "error",
  "-i",
  picture,
  "-ss",
  String(start),
  "-i",
  path.join(audioOut, "soundtrack.wav"),
  "-map",
  "0:v",
  "-map",
  "1:a",
  "-c:v",
  "copy",
  "-c:a",
  "aac",
  "-b:a",
  "192k",
  "-t",
  String(length),
  "-movflags",
  "+faststart",
  path.join(out, sample ? "sample.mp4" : "film.mp4"),
]);
if (sample)
  await writeJSON(path.join(out, "sample-range.json"), {
    start,
    duration: length,
    projectHash: hashProject(p),
  });
await writeJSON(path.join(out, "blender-video-checks.json"), {
  backend: "blender",
  stage: "rendered-awaiting-review",
  executionProfile: GPU_PROFILE,
  renderedFrames: frames.length,
  voice: p.voice,
  listening: "not checked",
  asr: "not checked",
  naturalMotion: "not checked",
});
await status(
  100,
  sample ? "有声样片已生成，等待审阅" : "电影已导出，等待质量验收",
);
