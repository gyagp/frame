import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createCanvas } from "@napi-rs/canvas";
import {
  createProject,
  validate,
  duration,
  timeline,
  sceneAt,
  subtitles,
} from "../src/model.mjs";
import { drawFrame } from "../src/film.mjs";
import { hashProject, storySignature, reviewState } from "../scripts/lib.mjs";
const fresh = () =>
  createProject({ title: "Test", idea: "A simple explanation" }, "test-film");
test("timeline is contiguous and scene boundaries select the new scene", () => {
  const p = fresh(),
    rows = timeline(p);
  assert.equal(duration(p), 48);
  for (let i = 1; i < rows.length; i++) {
    assert.equal(rows[i].start, rows[i - 1].end);
    assert.equal(sceneAt(p, rows[i].start).id, rows[i].id);
  }
  assert.equal(sceneAt(p, 48).id, rows.at(-1).id);
});
test("reject nonfinite times, invalid scene IDs, path traversal and oversized render surfaces", () => {
  for (const mutate of [
    (p) => (p.scenes[0].duration = NaN),
    (p) => (p.scenes[1].id = p.scenes[0].id),
    (p) => (p.scenes[0].image = "../../.env"),
    (p) => (p.scenes[0].imageAlt = "assets/../.env"),
    (p) => (p.width = 99999),
    (p) => (p.voice = "shell-command"),
    (p) => (p.sources = [{ label: "x", url: "javascript:alert(1)" }]),
  ]) {
    const p = fresh();
    mutate(p);
    assert.ok(validate(p).length);
  }
});
test("subtitle intervals remain inside their scene and do not overlap", () => {
  const p = fresh();
  p.scenes[0].narration = "One line. Another longer sentence here.";
  const cues = subtitles(p);
  assert.equal(cues.length, 2);
  assert.ok(cues[0].start >= 0);
  assert.ok(cues[0].end <= cues[1].start);
  assert.ok(cues[1].end <= 12);
});
test("recorded benchmark values match the supplied source and arithmetic", async () => {
  const p = JSON.parse(
    await readFile(
      new URL("../projects/subgroup-matrix/project.json", import.meta.url),
      "utf8",
    ),
  );
  assert.deepEqual(validate(p), []);
  assert.equal(duration(p), 150);
  const b = p.scenes.find((s) => s.kind === "benchmark");
  assert.equal((b.result / b.baseline).toFixed(2), "3.74");
  const source = await readFile(
    new URL("../projects/subgroup-matrix/assets/demo.html", import.meta.url),
    "utf8",
  );
  assert.ok(source.includes("fma: 13.09, matrix: 48.97"));
  assert.equal(1 + 1 * 7 + 2 * 9 + 3 * 11, 59);
  assert.equal(1 + 4 * 8 + 5 * 10 + 6 * 12, 155);
});
test("rendering is independent of frame order", () => {
  const p = fresh();
  const canvas = createCanvas(320, 180),
    ctx = canvas.getContext("2d");
  drawFrame(ctx, p, 7);
  const first = Buffer.from(canvas.data());
  drawFrame(ctx, p, 23);
  drawFrame(ctx, p, 0);
  drawFrame(ctx, p, 7);
  assert.deepEqual(Buffer.from(canvas.data()), first);
});
test("review signatures exclude approvals but invalidate after creative edits", () => {
  const p = fresh();
  p.review = { story: storySignature(p) };
  p.review.frames = hashProject(p);
  p.review.sample = hashProject(p);
  assert.deepEqual(reviewState(p), {
    storyApproved: true,
    framesApproved: true,
    sampleApproved: true,
  });
  p.scenes[0].body = "A changed story";
  assert.deepEqual(reviewState(p), {
    storyApproved: false,
    framesApproved: false,
    sampleApproved: false,
  });
});
test("portrait projects validate and render independently", () => {
  const p = createProject(
    { title: "Portrait", idea: "A portrait test", brief: { aspect: "9:16" } },
    "portrait-test",
  );
  assert.deepEqual(validate(p), []);
  const c = createCanvas(180, 320);
  drawFrame(c.getContext("2d"), p, 5);
  assert.equal(c.data().length, 180 * 320 * 4);
});
