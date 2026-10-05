import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createCanvas } from "@napi-rs/canvas";
import { FILM_TYPES, PALETTES, createPresetProject } from "../src/presets.mjs";
import { validate } from "../src/model.mjs";
import { drawFrame } from "../src/film.mjs";
import { hashProject, storySignature, reviewState } from "../scripts/lib.mjs";
import { planFilm } from "../src/google.mjs";

test("film types produce valid, distinct narrative starting points in both languages", () => {
  for (const language of ["en", "zh"]) {
    const structures = new Set();
    for (const type of FILM_TYPES) {
      const p = createPresetProject(
        { title: "Test", template: type.id, theme: type.theme, language },
        "test",
      );
      assert.deepEqual(validate(p), []);
      structures.add(
        p.scenes
          .slice(1)
          .map((s) => s.title)
          .join("|"),
      );
    }
    assert.equal(structures.size, FILM_TYPES.length);
  }
  assert.throws(() =>
    createPresetProject({ title: "Test", template: "unknown" }, "test"),
  );
  assert.throws(() =>
    createPresetProject({ title: "Test", theme: "constructor" }, "test"),
  );
});

test("all palettes reach the real renderer and retain readable text contrast", () => {
  const lum = (hex) => {
    const c = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
  };
  const contrast = (a, b) =>
    (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  const frames = new Set();
  for (const palette of PALETTES) {
    const p = createPresetProject(
      { title: "A readable story", theme: palette.id },
      "test",
    );
    assert.deepEqual(validate(p), []);
    for (const bg of ["bg", "panel"])
      assert.ok(
        contrast(palette.colors.ink, palette.colors[bg]) >= 4.5,
        palette.id + " body text contrast",
      );
    const canvas = createCanvas(480, 270);
    drawFrame(canvas.getContext("2d"), p, 5);
    frames.add(createHash("sha256").update(canvas.data()).digest("hex"));
  }
  assert.equal(frames.size, PALETTES.length);
});

test("palette revisions invalidate affected renders without invalidating other films", () => {
  const jade = PALETTES.find((x) => x.id === "jade"),
    old = jade.colors.accent;
  const p = createPresetProject({ title: "Test", theme: "jade" }, "test");
  const legacy = createPresetProject(
    { title: "Test", theme: "midnight" },
    "legacy",
  );
  const before = hashProject(legacy);
  p.review = {
    story: storySignature(p),
    frames: hashProject(p),
    sample: hashProject(p),
  };
  try {
    jade.colors.accent = "#abcdef";
    assert.equal(hashProject(legacy), before);
    assert.equal(reviewState(p).storyApproved, true);
    assert.equal(reviewState(p).framesApproved, false);
    assert.equal(reviewState(p).sampleApproved, false);
  } finally {
    jade.colors.accent = old;
  }
});

test("director receives the selected genre and palette even with an older color bible", async () => {
  const p = createPresetProject(
    {
      title: "Test",
      template: "documentary",
      theme: "porcelain",
      brief: { paletteOverride: "true", style: "quiet documentary" },
    },
    "preset-prompt-test",
  );
  p.targetDuration = 60;
  p.bible = { visualRules: "Old lime highlights" };
  let prompt;
  const result = await planFilm(p, {
    generateImpl: async (_model, contents) => {
      prompt = contents[0].parts[0].text;
      return [
        {
          text: JSON.stringify({
            scenes: p.scenes.map((s) => ({ ...s, duration: 15 })),
          }),
        },
      ];
    },
  });
  assert.match(prompt, /Film type: documentary/);
  assert.match(prompt, /observed detail/);
  assert.match(prompt, /#f5f3ed/);
  assert.match(prompt, /replaces earlier color instructions/);
  assert.match(prompt, /quiet documentary/);
  assert.equal(
    result.scenes.reduce((n, s) => n + s.duration, 0),
    60,
  );
});
