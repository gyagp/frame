import test from "node:test";
import assert from "node:assert/strict";
import { narrationFit, trimSpeechPadding } from "../src/audio-fit.mjs";

test("existing fitting speech is byte-for-byte and timing compatible", () => {
  const samples = new Float32Array(24000).fill(0.01),
    entries = [{ samples }];
  const fit = narrationFit(entries, 4);
  assert.equal(fit.entries, entries);
  assert.equal(fit.entries[0].samples, samples);
  assert.equal(fit.mode, "original");
  assert.equal(fit.leadIn, 0.6);
  assert.equal(fit.gap, 0.18);
});
test("silence trimming preserves quiet phonemes, safety margins and internal pauses", () => {
  const a = new Float32Array(1000);
  a.fill(0.0003, 200, 300);
  a.fill(-0.0003, 700, 800);
  const trimmed = trimSpeechPadding(a, 1000);
  assert.deepEqual(trimmed, a.subarray(140, 900));
  assert.equal(trimmed[300], 0); // internal silence is preserved
  const silent = new Float32Array(1000);
  assert.equal(trimSpeechPadding(silent, 1000), silent);
});
test("overflows can reclaim padding but cannot bypass the 1.3 speech-speed cap", () => {
  const a = new Float32Array(5900);
  a.fill(0.01, 100, 5550);
  const fit = narrationFit(
    [{ samples: a }, { samples: a }, { samples: a }],
    14,
    1000,
  );
  assert.equal(fit.mode, "trimmed-padding");
  assert.ok(fit.tempo <= 1.3 && fit.tempo > 1);
  assert.ok(fit.trimmedSeconds > 0);
  const tooLong = narrationFit(
    [{ samples: new Float32Array(20000).fill(0.1) }],
    4,
    1000,
  );
  assert.ok(tooLong.tempo > 1.3);
});
