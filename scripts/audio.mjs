import path from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { ROOT, readJSON, writeJSON, run, hashProject } from "./lib.mjs";
import { duration, timeline } from "../src/model.mjs";
import { createHash } from "node:crypto";
import { azureSpeech } from "../src/azure.mjs";
import { narrationFit } from "../src/audio-fit.mjs";

const RATE = 24000;
function wavSamples(buf) {
  if (buf.toString("ascii", 0, 4) !== "RIFF")
    throw new Error("Invalid speech WAV");
  let pos = 12,
    rate,
    channels,
    bits,
    data;
  while (pos + 8 <= buf.length) {
    const name = buf.toString("ascii", pos, pos + 4),
      size = buf.readUInt32LE(pos + 4);
    if (name === "fmt ") {
      channels = buf.readUInt16LE(pos + 10);
      rate = buf.readUInt32LE(pos + 12);
      bits = buf.readUInt16LE(pos + 22);
    }
    if (name === "data") data = buf.subarray(pos + 8, pos + 8 + size);
    pos += 8 + size + (size % 2);
  }
  if (rate !== RATE || channels !== 1 || bits !== 16 || !data)
    throw new Error("Speech format must be 24 kHz / mono / PCM16");
  const samples = new Float32Array(data.length / 2);
  for (let i = 0; i < samples.length; i++)
    samples[i] = data.readInt16LE(i * 2) / 32768;
  return samples;
}
function stamp(sec) {
  const ms = Math.round(sec * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
}
export async function buildAudio(
  p,
  out,
  onProgress = () => {},
  { preflightOnly = false } = {},
) {
  const cache = path.join(
    out,
    preflightOnly ? "narration-fit.json" : "audio.json",
  );
  try {
    const old = await readJSON(cache);
    if (old.projectHash === hashProject(p)) {
      if (!preflightOnly) await readFile(path.join(out, "soundtrack.wav"));
      if (old.issues?.length)
        throw new Error("Narration preflight needs repair");
      return old;
    }
  } catch {}
  const dir = path.join(out, "speech");
  await mkdir(dir, { recursive: true });
  const lines = timeline(p).flatMap((s) => {
    const phrases =
      s.narration
        .match(/[^.!?。！？]+[.!?。！？]+|[^.!?。！？]+$/g)
        ?.map((x) => x.trim())
        .filter(Boolean) ?? [];
    return phrases.map((text, i) => ({
      id: `${s.id}-${i}`,
      sceneId: s.id,
      text,
    }));
  });
  await writeJSON(path.join(dir, "lines.json"), lines);
  if (lines.length) {
    if (p.voice.startsWith("Azure ")) {
      const engine = "azure-speech-rest";
      const cacheDir = path.join(ROOT, ".cache", "speech");
      await mkdir(cacheDir, { recursive: true });
      let lastRequest = 0;
      for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        const key = createHash("sha256")
          .update(engine + p.voice + line.text)
          .digest("hex");
        const cached = path.join(cacheDir, `${key}.wav`);
        let wav;
        try {
          wav = await readFile(cached);
        } catch {
          const wait = Math.max(0, 200 - (Date.now() - lastRequest));
          if (wait) await new Promise((r) => setTimeout(r, wait));
          for (let attempt = 0; attempt < 3; attempt++) {
            lastRequest = Date.now();
            try {
              wav = await azureSpeech(line.text, p.voice.slice(6));
              break;
            } catch (e) {
              if (e.status !== 429 || attempt === 2) throw e;
              console.log(
                `Speech rate limit: resume after ${Math.ceil(e.retryAfterMs / 1000)}s`,
              );
              await new Promise((r) => setTimeout(r, e.retryAfterMs));
            }
          }
          await writeFile(cached, wav);
        }
        await writeFile(path.join(dir, `${line.id}.wav`), wav);
        console.log(`Narration ${index + 1}/${lines.length}`);
        await onProgress(index + 1, lines.length);
      }
    } else {
      if (process.platform !== "win32")
        throw new Error(
          "Built-in narration currently needs Windows System.Speech. Set narration empty for a music-only film.",
        );
      console.log("Preparing local English/Chinese narration…");
      await run("powershell.exe", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        path.join(ROOT, "scripts", "speak.ps1"),
        "-LinesFile",
        path.join(dir, "lines.json"),
        "-OutputDirectory",
        dir,
        "-Voice",
        p.voice,
      ]);
    }
  }
  const prepared = [],
    issues = [];
  for (const scene of timeline(p)) {
    const entries = await Promise.all(
      lines
        .filter((x) => x.sceneId === scene.id)
        .map(async (line) => ({
          ...line,
          samples: wavSamples(await readFile(path.join(dir, `${line.id}.wav`))),
        })),
    );
    const fit = narrationFit(entries, scene.duration, RATE);
    prepared.push({ scene, fit });
    if (fit.tempo > 1.3)
      issues.push({
        sceneId: scene.id,
        title: scene.title,
        sceneDuration: scene.duration,
        normalSpeechDuration: fit.original,
        requiredSeconds: Math.ceil(
          fit.fitted / 1.3 + 0.7 + Math.max(0, entries.length - 1) * 0.16,
        ),
      });
  }
  const preflight = {
    projectHash: hashProject(p),
    issues,
    scenes: prepared.map(({ scene, fit }) => ({
      sceneId: scene.id,
      tempo: fit.tempo,
      originalSpeechDuration: fit.original,
      trimmedPaddingSeconds: fit.trimmedSeconds,
      fittingMode: fit.mode,
    })),
  };
  await writeJSON(path.join(out, "narration-fit.json"), preflight);
  if (issues.length)
    throw new Error(
      "Too much narration: " +
        issues
          .map(
            (s) =>
              `\"${s.title}\" needs at least ${s.requiredSeconds}s, has ${s.sceneDuration}s`,
          )
          .join("; "),
    );
  if (preflightOnly) return preflight;
  const total = duration(p);
  const mix = new Float32Array(Math.ceil(total * RATE));
  const voice = new Float32Array(mix.length);
  const cues = [];
  const timings = [];
  for (const { scene, fit } of prepared) {
    const { entries, original, tempo } = fit;
    if (tempo > 1.3)
      throw new Error(
        `Scene "${scene.title}" has too much narration. Shorten it or increase its duration (needs ${Math.ceil(original + 1.2)}s at normal speed).`,
      );
    let cursor = scene.start + fit.leadIn;
    for (const e of entries) {
      let samples = e.samples;
      if (tempo > 1.005) {
        const pcm = path.join(dir, `${e.id}.pcm`);
        let input = path.join(dir, `${e.id}.wav`);
        const inputFormat = [];
        if (fit.mode !== "original") {
          input = path.join(dir, `${e.id}-trimmed.pcm`);
          const raw = Buffer.alloc(samples.length * 2);
          for (let i = 0; i < samples.length; i++)
            raw.writeInt16LE(Math.round(samples[i] * 32768), i * 2);
          await writeFile(input, raw);
          inputFormat.push("-f", "s16le", "-ar", String(RATE), "-ac", "1");
        }
        await run("ffmpeg", [
          "-y",
          "-v",
          "error",
          ...inputFormat,
          "-i",
          input,
          "-af",
          `atempo=${tempo}`,
          "-f",
          "s16le",
          "-ar",
          String(RATE),
          "-ac",
          "1",
          pcm,
        ]);
        const b = await readFile(pcm);
        samples = new Float32Array(b.length / 2);
        for (let i = 0; i < samples.length; i++)
          samples[i] = b.readInt16LE(i * 2) / 32768;
      }
      const start = cursor,
        end = start + samples.length / RATE;
      if (end > scene.end - 0.08)
        throw new Error(
          `Narration exceeds scene boundary: ${scene.id}. Speech was not truncated.`,
        );
      const offset = Math.round(start * RATE);
      for (let i = 0; i < samples.length && offset + i < voice.length; i++)
        voice[offset + i] += samples[i];
      cues.push({
        sceneId: scene.id,
        start,
        end: Math.min(scene.end - 0.1, end + 0.16),
        text: e.text,
      });
      cursor = end + fit.gap;
    }
    timings.push({
      sceneId: scene.id,
      originalSpeechDuration: original,
      tempo: Number(tempo.toFixed(4)),
      sceneDuration: scene.duration,
      fittingMode: fit.mode,
      trimmedPaddingSeconds: Number(fit.trimmedSeconds.toFixed(4)),
    });
  }
  const boundaries = timeline(p)
    .slice(1)
    .map((s) => s.start);
  const mutePoints = boundaries.filter((_, i) => i === 1 || i === 4);
  // Original minimal electronic score; all cues derive from the same project timeline.
  let voiceEnvelope = 0;
  for (let i = 0; i < mix.length; i++) {
    const t = i / RATE,
      pace = p.brief?.pace;
    const beat =
      pace === "build"
        ? (76 * t + (36 * t * t) / (2 * total)) / 60
        : (t * (pace === "fast" ? 132 : pace === "slow" ? 72 : 90)) / 60;
    const phase = beat % 1;
    const chord = [130.8128, 164.8138, 195.9977, 164.8138][
      Math.floor(beat / 8) % 4
    ];
    const envelope = Math.min(1, t / 2, (total - t) / 2);
    const silence = mutePoints.some((x) => t > x - 0.35 && t < x + 0.08)
      ? 0
      : 1;
    const amplitude = Math.abs(voice[i]);
    voiceEnvelope +=
      (amplitude - voiceEnvelope) *
      (amplitude > voiceEnvelope ? 0.008 : 0.00012);
    const duck = 1 - 0.72 * Math.min(1, voiceEnvelope / 0.025);
    const pulse =
      Math.sin(2 * Math.PI * chord * 2 * t) * Math.exp(-phase * 10) * 0.018;
    const pad =
      (Math.sin(2 * Math.PI * chord * t) +
        0.5 * Math.sin(2 * Math.PI * chord * 1.5 * t)) *
      0.008;
    mix[i] =
      voice[i] * 0.85 +
      (p.music ? (pulse + pad) * duck * envelope * silence : 0);
  }
  if (p.music)
    for (const point of boundaries) {
      const start = Math.round(point * RATE);
      for (let i = 0; i < RATE * 0.13; i++) {
        const t = i / RATE;
        mix[start + i] +=
          0.025 *
          Math.sin(2 * Math.PI * (880 - 2000 * t) * t) *
          Math.exp(-t * 35);
      }
    }
  if (p.music)
    for (const scene of timeline(p))
      for (const cue of scene.soundCues ?? []) {
        const offset = Math.round((scene.start + cue.t) * RATE),
          length =
            cue.type === "whoosh" ? 0.4 : cue.type === "chime" ? 0.45 : 0.18,
          gain = cue.gain ?? 0.03;
        for (let i = 0; i < length * RATE && offset + i < mix.length; i++) {
          const t = i / RATE,
            phase = t / length;
          let signal;
          if (cue.type === "whoosh")
            signal =
              ((Math.sin(i * 12.9898) * 43758.5453) % 1) *
              Math.sin(Math.PI * phase);
          else if (cue.type === "impact")
            signal =
              Math.sin(2 * Math.PI * (95 - 100 * t) * t) * Math.exp(-t * 24);
          else if (cue.type === "chime")
            signal =
              (Math.sin(2 * Math.PI * 1046.5 * t) +
                0.4 * Math.sin(2 * Math.PI * 1569.8 * t)) *
              Math.exp(-t * 10);
          else signal = Math.sin(2 * Math.PI * 1400 * t) * Math.exp(-t * 55);
          mix[offset + i] += gain * signal;
        }
      }
  const raw = Buffer.alloc(mix.length * 2);
  for (let i = 0; i < mix.length; i++)
    raw.writeInt16LE(
      Math.max(-32768, Math.min(32767, Math.round(mix[i] * 32767))),
      i * 2,
    );
  const pcm = path.join(out, "mix.pcm");
  await writeFile(pcm, raw);
  const measure = await run("ffmpeg", [
    "-hide_banner",
    "-f",
    "s16le",
    "-ar",
    String(RATE),
    "-ac",
    "1",
    "-i",
    pcm,
    "-af",
    "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json",
    "-f",
    "null",
    "-",
  ]);
  const match = measure.err.match(/\{\s*"input_i"[\s\S]*?\}/);
  if (!match) throw new Error("Loudness measurement failed");
  const loud = JSON.parse(match[0]);
  const filter = Number.isFinite(Number(loud.input_i))
    ? `loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${loud.input_i}:measured_TP=${loud.input_tp}:measured_LRA=${loud.input_lra}:measured_thresh=${loud.input_thresh}:offset=${loud.target_offset}:linear=true:print_format=json`
    : "anull";
  const normalized = await run("ffmpeg", [
    "-y",
    "-hide_banner",
    "-f",
    "s16le",
    "-ar",
    String(RATE),
    "-ac",
    "1",
    "-i",
    pcm,
    "-af",
    filter,
    "-ar",
    "48000",
    "-ac",
    "2",
    path.join(out, "soundtrack.wav"),
  ]);
  await writeFile(
    path.join(out, "subtitles.srt"),
    cues
      .map(
        (x, i) =>
          `${i + 1}\n${stamp(x.start)} --> ${stamp(x.end)}\n${x.text}\n`,
      )
      .join("\n"),
  );
  const result = {
    projectHash: hashProject(p),
    engine: p.voice.startsWith("Azure ")
      ? "Azure Speech REST"
      : "Windows System.Speech",
    voice: p.voice,
    cues,
    timings,
    asr: "not performed",
    loudnessMeasurement: loud,
    normalizationLog: normalized.err.slice(-2200),
  };
  await writeJSON(cache, result);
  return result;
}
