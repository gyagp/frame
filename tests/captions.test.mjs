import test from "node:test";
import assert from "node:assert/strict";
import { captionPhrases, captionTextForSpeech } from "../src/captions.mjs";
import { narrationPhrases } from "../src/speech-audio.mjs";
import { loadProject } from "../scripts/lib.mjs";
test("Chinese closing quotes stay with their sentence and each caption is balanced", () => {
  assert.deepEqual(
    captionPhrases("妈妈问：“你愿意吗？”小马说：“当然！我长大啦。”"),
    ["妈妈问：“你愿意吗？”", "小马说：“当然！”", "“我长大啦。”"],
  );
  assert.deepEqual(captionPhrases("“我们一起去看看。”妈妈说，“慢慢走。”"), [
    "“我们一起去看看。”",
    "妈妈说，“慢慢走。”",
  ]);
  assert.deepEqual(captionPhrases("One sentence. Another one!"), [
    "One sentence.",
    "Another one!",
  ]);
  assert.deepEqual(captionPhrases("” ……"), []);
});
test("all pony caption fixes retain existing spoken words, cue count and speech cache fragments", async () => {
  const p = await loadProject("little-pony-crosses-river");
  let total = 0;
  for (const s of p.scenes) {
    const speech = narrationPhrases(s.narration),
      captions = captionTextForSpeech(s.narration, speech);
    assert.equal(captions.length, speech.length);
    for (const caption of captions) {
      assert.ok(!caption.startsWith("”"));
      assert.equal(
        [...caption].filter((x) => x === "“").length,
        [...caption].filter((x) => x === "”").length,
      );
    }
    total += captions.length;
  }
  assert.equal(total, 49);
  assert.throws(() => captionTextForSpeech("“别急！”", ["走吧。"]));
});
