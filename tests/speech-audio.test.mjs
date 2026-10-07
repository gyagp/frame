import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  narrationPhrases,
  validateSpeechWav,
  wavSamples,
  cachedSpeech,
} from "../src/speech-audio.mjs";

function chunk(name, bytes) {
  const b = Buffer.alloc(8 + bytes.length + (bytes.length % 2));
  b.write(name);
  b.writeUInt32LE(bytes.length, 4);
  bytes.copy(b, 8);
  return b;
}
function wav(samples = [-32768, -4096, 0, 4096, 32767], extra = []) {
  const fmt = Buffer.alloc(16);
  fmt.writeUInt16LE(1, 0);
  fmt.writeUInt16LE(1, 2);
  fmt.writeUInt32LE(24000, 4);
  fmt.writeUInt32LE(48000, 8);
  fmt.writeUInt16LE(2, 12);
  fmt.writeUInt16LE(16, 14);
  const pcm = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => pcm.writeInt16LE(s, i * 2));
  const body = Buffer.concat([
    Buffer.from("WAVE"),
    ...extra,
    chunk("fmt ", fmt),
    chunk("data", pcm),
  ]);
  const header = Buffer.alloc(8);
  header.write("RIFF");
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

test("Chinese closing quotes never become narration; normal spoken fragments keep cache keys", () => {
  assert.deepEqual(narrationPhrases("妈妈说：“慢慢走。”"), [
    "妈妈说：“慢慢走。”".slice(0, -1),
  ]);
  assert.deepEqual(narrationPhrases("“当然！我已经长大啦。”"), [
    "“当然！",
    "我已经长大啦。",
  ]);
  assert.deepEqual(narrationPhrases("” ‘ ’ … — ， ： （）"), []);
  assert.deepEqual(narrationPhrases("One sentence. Another one! 24 fps."), [
    "One sentence.",
    "Another one!",
    "24 fps.",
  ]);
  assert.deepEqual(
    narrationPhrases(
      "小马看了看水流，又找了块稳稳的河底。他轻轻放下一只蹄子。",
    ),
    ["小马看了看水流，又找了块稳稳的河底。", "他轻轻放下一只蹄子。"],
  );
});

test("PCM16 samples remain exact and odd-sized metadata chunks are padded correctly", () => {
  const samples = [-32768, -4096, 0, 4096, 32767];
  const b = wav(samples, [chunk("JUNK", Buffer.from("x"))]);
  assert.equal(validateSpeechWav(b).sampleCount, samples.length);
  assert.deepEqual(
    [...wavSamples(b)],
    samples.map((v) => v / 32768),
  );
});

test("invalid provider WAV headers, truncated data, empty audio and other encodings fail", () => {
  const emptyAzure = Buffer.alloc(44);
  emptyAzure.write("RIFF");
  emptyAzure.writeUInt32LE(36, 4);
  emptyAzure.write("WAVEfmt ", 8);
  emptyAzure.writeUInt32LE(16, 16);
  emptyAzure.write("data", 36);
  emptyAzure.writeUInt32LE(0x7fff0000, 40);
  assert.throws(() => wavSamples(emptyAzure), /data chunk exceeds/);
  assert.throws(() => wavSamples(wav([])), /empty/);
  for (const mutate of [
    (b) => b.write("AVI ", 8),
    (b) => b.writeUInt16LE(3, 20),
    (b) => b.writeUInt16LE(2, 22),
    (b) => b.writeUInt32LE(48000, 24),
    (b) => b.writeUInt16LE(8, 34),
    (b) => b.writeUInt32LE(100000, 40),
  ]) {
    const b = wav();
    mutate(b);
    assert.throws(() => wavSamples(b), { code: "INVALID_SPEECH_WAV" });
  }
  assert.throws(() => wavSamples(wav().subarray(0, 45)), /truncated/);
});

test("valid speech cache is reused; corruption is replaced only after validating the new response", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "studio-speech-test-")),
    file = path.join(dir, "voice.wav"),
    good = wav();
  let calls = 0;
  try {
    await writeFile(file, good);
    assert.deepEqual(
      await cachedSpeech(file, async () => {
        calls++;
        return good;
      }),
      good,
    );
    assert.equal(calls, 0);
    await writeFile(file, Buffer.from("broken"));
    await assert.rejects(
      cachedSpeech(file, async () => {
        calls++;
        return Buffer.from("invalid provider body");
      }),
      { code: "INVALID_SPEECH_WAV" },
    );
    assert.equal((await readFile(file)).toString(), "broken");
    assert.deepEqual(await readdir(dir), ["voice.wav"]);
    assert.deepEqual(
      await cachedSpeech(file, async () => {
        calls++;
        return good;
      }),
      good,
    );
    assert.equal(calls, 2);
    assert.deepEqual(await readFile(file), good);
  } finally {
    assert.ok(
      path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep),
    );
    assert.ok(path.basename(dir).startsWith("studio-speech-test-"));
    await rm(dir, { recursive: true, force: true });
  }
});
