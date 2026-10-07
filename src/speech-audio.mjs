import { readFile, writeFile, rename, mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export function narrationPhrases(text) {
  // Preserve existing spoken fragments/cache keys; discard only fragments with
  // no letters or numbers (e.g. a closing Chinese quotation mark after 。).
  return (text.match(/[^.!?。！？]+[.!?。！？]+|[^.!?。！？]+$/g) ?? [])
    .map((part) => part.trim())
    .filter((part) => /[\p{L}\p{N}]/u.test(part));
}

function invalid(reason) {
  const error = new Error(`Invalid speech WAV: ${reason}`);
  error.code = "INVALID_SPEECH_WAV";
  return error;
}

export function validateSpeechWav(buf) {
  if (
    !Buffer.isBuffer(buf) ||
    buf.length < 12 ||
    buf.toString("ascii", 0, 4) !== "RIFF" ||
    buf.toString("ascii", 8, 12) !== "WAVE"
  )
    throw invalid("expected a RIFF/WAVE container");
  const end = buf.readUInt32LE(4) + 8;
  if (end < 12 || end > buf.length) throw invalid("truncated RIFF container");
  let offset = 12,
    format,
    data;
  while (offset < end) {
    if (offset + 8 > end) throw invalid("truncated chunk header");
    const name = buf.toString("ascii", offset, offset + 4),
      size = buf.readUInt32LE(offset + 4),
      start = offset + 8;
    if (size > end - start)
      throw invalid(`${name} chunk exceeds available bytes`);
    if (name === "fmt ") {
      if (format || size < 16)
        throw invalid("missing or duplicate PCM format fields");
      format = {
        encoding: buf.readUInt16LE(start),
        channels: buf.readUInt16LE(start + 2),
        rate: buf.readUInt32LE(start + 4),
        byteRate: buf.readUInt32LE(start + 8),
        blockAlign: buf.readUInt16LE(start + 12),
        bits: buf.readUInt16LE(start + 14),
      };
    }
    if (name === "data") {
      if (data) throw invalid("duplicate data chunks");
      data = buf.subarray(start, start + size);
    }
    offset = start + size + (size % 2);
    if (offset > end) throw invalid("missing chunk padding");
  }
  if (!format) throw invalid("missing fmt chunk");
  if (
    format.encoding !== 1 ||
    format.channels !== 1 ||
    format.rate !== 24000 ||
    format.bits !== 16 ||
    format.blockAlign !== 2 ||
    format.byteRate !== 48000
  )
    throw invalid(
      `expected PCM16 / 24000 Hz / mono, got encoding=${format.encoding}, rate=${format.rate}, channels=${format.channels}, bits=${format.bits}`,
    );
  if (!data?.length || data.length % 2)
    throw invalid("empty or misaligned PCM16 data");
  return { data, rate: format.rate, sampleCount: data.length / 2 };
}

export function wavSamples(buf) {
  const { data, sampleCount } = validateSpeechWav(buf);
  const samples = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++)
    samples[i] = data.readInt16LE(i * 2) / 32768;
  return samples;
}

export async function cachedSpeech(file, synthesize) {
  try {
    const wav = await readFile(file);
    validateSpeechWav(wav);
    return wav;
  } catch (error) {
    if (error.code !== "ENOENT" && error.code !== "INVALID_SPEECH_WAV")
      throw error;
  }
  const wav = await synthesize();
  validateSpeechWav(wav); // Never publish/cache an empty or malformed provider response.
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, wav);
    await rename(temporary, file);
  } finally {
    await unlink(temporary).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
  return wav;
}
