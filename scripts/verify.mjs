import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import {
  ROOT,
  loadProject,
  displayOutputHash,
  run,
  writeJSON,
  readJSON,
} from "./lib.mjs";
import { duration, timeline, assertProject } from "../src/model.mjs";
import { generate } from "../src/google.mjs";
import { getSettings } from "../src/settings.mjs";
const snapshot = process.argv.indexOf("--snapshot");
const p =
  snapshot >= 0
    ? assertProject(await readJSON(process.argv[snapshot + 1]))
    : await loadProject(process.argv[2] ?? "subgroup-matrix");
const out = path.join(ROOT, "outputs", p.id, displayOutputHash(p));
const target = path.join(out, "film.mp4");
const result = JSON.parse(
  (
    await run("ffprobe", [
      "-v",
      "error",
      "-show_format",
      "-show_streams",
      "-of",
      "json",
      target,
    ])
  ).out,
);
const vid = result.streams.find((s) => s.codec_type === "video"),
  aud = result.streams.find((s) => s.codec_type === "audio");
const checks = {
  duration: Math.abs(Number(result.format.duration) - duration(p)) < 0.1,
  dimensions: vid.width === p.width && vid.height === p.height,
  frameRate: vid.avg_frame_rate === "24/1",
  videoCodec: vid.codec_name === "h264",
  audioPresent: aud?.codec_name === "aac",
};
const scan = await run("ffmpeg", [
  "-hide_banner",
  "-i",
  target,
  "-vf",
  "blackdetect=d=0.12:pix_th=0.03:pic_th=0.98",
  "-af",
  "ebur128=peak=true",
  "-f",
  "null",
  "-",
]);
const black = scan.err.split("\n").filter((x) => x.includes("black_start:"));
checks.noBlackFrames = black.length === 0;
const integrated = [...scan.err.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].at(-1);
const peak = [...scan.err.matchAll(/Peak:\s+(-?[\d.]+) dBFS/g)].at(-1);
const lufs = Number(integrated?.[1]);
checks.loudness = Number.isFinite(lufs) && Math.abs(lufs + 14) <= 1;
const peakDb = peak ? Number(peak[1]) : null;
checks.truePeak = peakDb !== null && peakDb <= -1.0;
await run("ffmpeg", [
  "-y",
  "-v",
  "error",
  "-i",
  target,
  "-vf",
  `fps=1/2,scale=320:180,tile=5x${Math.ceil(duration(p) / 10)}:padding=6:margin=6:color=0x111713`,
  "-frames:v",
  "1",
  path.join(out, "contact-sheet.jpg"),
]);
await run("ffmpeg", [
  "-y",
  "-v",
  "error",
  "-ss",
  String(Math.max(0, (timeline(p)[2]?.start ?? 0.6) - 0.6)),
  "-i",
  target,
  "-vf",
  "fps=5,scale=400:225,tile=5x2:padding=5:margin=5:color=0x111713",
  "-frames:v",
  "1",
  path.join(out, "transition-strip.jpg"),
]);
const qa = {
  createdAt: new Date().toISOString(),
  project: p.id,
  automatedChecks: checks,
  measured: {
    duration: Number(result.format.duration),
    lufs,
    truePeakDb: peakDb,
    frames: vid.nb_frames,
  },
  blackFrames: black,
  visualReview: "Contact sheets generated; agent must inspect separately.",
  fullSpeedListening: "Not performed by an independent human reviewer.",
  asr: { status: "not run" },
};
if (
  process.argv.includes("--asr") &&
  p.scenes.some((s) => s.narration.trim())
) {
  try {
    const input = path.join(out, "asr-input.wav");
    await run("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-i",
      path.join(out, "soundtrack.wav"),
      "-ar",
      "16000",
      "-ac",
      "1",
      input,
    ]);
    const source = await readFile(input);
    const settings = getSettings();
    const parts = await generate(
      "gemini-3.8-flash",
      [
        {
          role: "user",
          parts: [
            {
              text: `Transcribe all spoken ${p.language === "zh" ? "Chinese" : "English"} words in this audio faithfully, in order. Do not summarize, explain, or correct technical claims. Ignore music. Return only the transcript.`,
            },
            {
              inlineData: {
                mimeType: "audio/wav",
                data: source.toString("base64"),
              },
            },
          ],
        },
      ],
      { temperature: 0 },
      {
        settings: {
          ...settings,
          director: { ...settings.director, provider: "gemini" },
        },
      },
    );
    const transcript = parts
      .filter((x) => x.text)
      .map((x) => x.text)
      .join("\n");
    await writeFile(path.join(out, "asr-transcript.txt"), transcript);
    const tokens = (s) =>
      p.language === "zh"
        ? [...s.replace(/[^\p{L}\p{N}]/gu, "")]
        : s
            .toLowerCase()
            .replace(/[^a-z0-9 ]/g, " ")
            .split(/\s+/)
            .filter(Boolean);
    const expected = tokens(p.scenes.map((x) => x.narration).join(" ")),
      actual = tokens(transcript);
    let previous = Array.from({ length: actual.length + 1 }, (_, i) => i);
    for (let i = 1; i <= expected.length; i++) {
      const row = [i];
      for (let j = 1; j <= actual.length; j++)
        row[j] = Math.min(
          row[j - 1] + 1,
          previous[j] + 1,
          previous[j - 1] + (expected[i - 1] === actual[j - 1] ? 0 : 1),
        );
      previous = row;
    }
    const wer = previous.at(-1) / expected.length;
    qa.asr = {
      status: "transcribed; wording review required",
      wordErrorRate: Number(wer.toFixed(4)),
      expectedWords: expected.length,
      transcribedWords: actual.length,
      provider: "gemini-3.8-flash",
      note: "Acronyms and spoken numbers can differ in transcription. Do not treat a low WER as human listening approval.",
    };
  } catch (e) {
    qa.asr = { status: "failed", reason: e.message };
  }
}
await writeJSON(path.join(out, "qa.json"), qa);
console.log(JSON.stringify(qa, null, 2));
if (Object.values(checks).some((x) => !x)) process.exitCode = 1;
