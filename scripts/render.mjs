import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { writeFile } from "node:fs/promises";
import { renderContext, graphics, writeJSON, run } from "./lib.mjs";
import { buildAudio } from "./audio.mjs";
import { drawFrame } from "../src/film.mjs";
import { duration, timeline } from "../src/model.mjs";
import { mkdir } from "node:fs/promises";

try {
  const { p, out } = await renderContext();
  const status = (data) =>
    writeJSON(path.join(out, "progress.json"), {
      ...data,
      updatedAt: new Date().toISOString(),
    });
  const sample = process.argv.includes("--sample");
  const argNumber = (flag, fallback) => {
    const i = process.argv.indexOf(flag);
    return i < 0 ? fallback : Number(process.argv[i + 1]);
  };
  const start = sample ? argNumber("--start", 0) : 0,
    clipDuration = sample
      ? Math.min(argNumber("--length", 12), duration(p) - start)
      : duration(p);
  if (
    !Number.isFinite(start) ||
    start < 0 ||
    !Number.isFinite(clipDuration) ||
    clipDuration < 1 ||
    start + clipDuration > duration(p)
  )
    throw new Error("Invalid render range");
  const audioOut = sample ? path.join(out, "sample-audio") : out;
  await mkdir(audioOut, { recursive: true });
  if (sample) {
    await status({
      phase: "audio-check",
      progress: 1,
      message: "先检查整片旁白的实际时长，避免完成样片后才发现后续镜头放不下",
    });
    await buildAudio(
      p,
      path.join(out, "preflight"),
      (done, total) =>
        status({
          phase: "audio-check",
          progress: Math.round(1 + (done / total) * 6),
          message: `正在检查整片旁白 ${done} / ${total} 句（复用已有声音）`,
        }),
      { preflightOnly: true },
    );
  }
  const audioProject = sample
    ? {
        ...p,
        scenes: timeline(p).map((s) => {
          const { start: sceneStart, end, ...scene } = s;
          return {
            ...scene,
            narration:
              end > start && sceneStart < start + clipDuration
                ? s.narration
                : "",
          };
        }),
      }
    : p;
  await status({
    phase: "audio",
    progress: 2,
    message: "正在生成旁白、字幕和配乐",
  });
  const audio = await buildAudio(audioProject, audioOut, (done, total) =>
    status({
      phase: "audio",
      progress: Math.round(2 + (done / total) * 8),
      message: `正在生成旁白 ${done} / ${total} 句（会复用已有缓存）`,
    }),
  );
  if (process.argv.includes("--audio-only")) {
    await status({
      phase: "audio-ready",
      progress: 100,
      message: "旁白已准备好，可以带声音预览",
    });
    process.exit(0);
  }
  const { canvas, assets } = await graphics(p);
  const c = canvas.getContext("2d");
  const fps = p.fps ?? 24,
    totalFrames = Math.round(clipDuration * fps),
    picture = sample ? "sample-picture.mp4" : "picture.mp4";
  const child = spawn(
    "ffmpeg",
    [
      "-y",
      "-v",
      "error",
      "-f",
      "rawvideo",
      "-pixel_format",
      "rgba",
      "-video_size",
      `${canvas.width}x${canvas.height}`,
      "-framerate",
      String(fps),
      "-i",
      "pipe:0",
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "19",
      "-pix_fmt",
      "yuv420p",
      path.join(out, picture),
    ],
    { windowsHide: true },
  );
  let failure = "",
    pipeError;
  child.stderr.on("data", (d) => (failure += d));
  child.stdin.on("error", (e) => (pipeError = e));
  const finished = once(child, "close");
  for (let f = 0; f < totalFrames; f++) {
    if (pipeError) throw pipeError;
    drawFrame(c, p, start + f / fps, assets, audio.cues);
    if (!child.stdin.write(canvas.data())) await once(child.stdin, "drain");
    if (f % (fps * 2) === 0) {
      const progress = 10 + Math.floor((80 * f) / totalFrames);
      await status({
        phase: "picture",
        progress,
        message: `正在渲染${sample ? "样片" : ""} ${Math.floor(f / fps)} / ${clipDuration} 秒`,
      });
      console.log(`${progress}% · ${f}/${totalFrames} frames`);
    }
  }
  child.stdin.end();
  const [code] = await finished;
  if (code !== 0) throw new Error(failure);
  await status({ phase: "mux", progress: 94, message: "正在合成最终电影" });
  const outputFile = sample ? "sample.mp4" : "film.mp4";
  await run("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-i",
    path.join(out, picture),
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
    String(clipDuration),
    "-movflags",
    "+faststart",
    path.join(out, outputFile),
  ]);
  drawFrame(c, p, start + Math.min(4, clipDuration / 2), assets, audio.cues, {
    captions: false,
  });
  await writeFile(
    path.join(out, sample ? "sample-poster.jpg" : "poster.jpg"),
    await canvas.encode("jpeg", 90),
  );
  if (sample)
    await writeJSON(path.join(out, "sample-range.json"), {
      start,
      duration: clipDuration,
      projectHash: (await import("./lib.mjs")).hashProject(p),
    });
  await status({
    phase: "complete",
    progress: 100,
    message: sample ? "样片已导出，请预览确认" : "电影已导出",
  });
  console.log(`Film: ${path.join(out, outputFile)}`);
} catch (e) {
  console.error(e.stack);
  process.exitCode = 1;
}
