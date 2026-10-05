import test from "node:test";
import assert from "node:assert/strict";
import { createCanvas } from "@napi-rs/canvas";
import { valueAt, evaluate } from "../src/engine/motion.mjs";
import { validateComposition } from "../src/engine/schema.mjs";
import { drawFrame } from "../src/film.mjs";
import { createProject, validate } from "../src/model.mjs";
const fixture = () => ({
  id: "motion",
  kind: "card",
  title: "An idea takes shape",
  eyebrow: "",
  body: "",
  note: "",
  narration: "",
  duration: 6,
  camera: "push",
  composition: {
    version: 1,
    background: "#10231b",
    camera: {
      x: 0.5,
      y: 0.5,
      zoom: 1,
      tracks: [
        {
          property: "zoom",
          keys: [
            { t: 0, value: 1 },
            { t: 6, value: 1.06 },
          ],
        },
      ],
    },
    layers: [
      {
        id: "shape",
        type: "rect",
        x: 0.5,
        y: 0.5,
        w: 0.3,
        h: 0.3,
        fill: "#d1edab",
        radius: 0,
        tracks: [
          {
            property: "rotation",
            keys: [
              { t: 0, value: 0 },
              { t: 6, value: 90 },
            ],
          },
          {
            property: "radius",
            keys: [
              { t: 0, value: 0 },
              { t: 6, value: 0.2 },
            ],
          },
        ],
      },
      {
        id: "particles",
        type: "particles",
        x: 0.5,
        y: 0.5,
        w: 0.8,
        h: 0.8,
        count: 30,
        seed: 123,
        fill: "#72cfc3",
        size: 0.004,
      },
      {
        id: "heading",
        type: "text",
        x: 0.5,
        y: 0.2,
        w: 0.8,
        h: 0.1,
        text: "AN IDEA TAKES SHAPE",
        fontSize: 0.045,
        fill: "#f2f5df",
      },
    ],
  },
  soundCues: [{ t: 1, type: "chime", gain: 0.02 }],
});
test("keyframes interpolate and clamp without previous-frame state", () => {
  const keys = [
    { t: 1, value: 10 },
    { t: 3, value: 30, ease: "linear" },
  ];
  assert.equal(valueAt(keys, 0), 10);
  assert.equal(valueAt(keys, 2), 20);
  assert.equal(valueAt(keys, 9), 30);
  assert.equal(evaluate({ x: 0, tracks: [{ property: "x", keys }] }, 2).x, 20);
});
test("data-only film program renders deterministically in both formats", () => {
  for (const portrait of [false, true]) {
    const p = createProject(
      { title: "Generic film", brief: { aspect: portrait ? "9:16" : "16:9" } },
      "engine-test",
    );
    p.scenes = [fixture()];
    assert.deepEqual(validate(p), []);
    const canvas = createCanvas(portrait ? 180 : 320, portrait ? 320 : 180),
      c = canvas.getContext("2d");
    drawFrame(c, p, 2);
    const a = Buffer.from(canvas.data());
    drawFrame(c, p, 5);
    const b = Buffer.from(canvas.data());
    assert.notDeepEqual(a, b, "Animation must change the frame");
    drawFrame(c, p, 2);
    assert.deepEqual(Buffer.from(canvas.data()), a);
  }
});
test("reject malformed tracks, filesystem escape, invalid colors and unknown primitives", () => {
  for (const mutate of [
    (s) => (s.composition.layers[0].type = "javascript"),
    (s) => (s.composition.layers[0].fill = "#12345"),
    (s) => (s.composition.layers[0].tracks[0].keys[1].t = -1),
    (s) =>
      s.composition.layers.push({
        id: "bad",
        type: "image",
        asset: "../../.env",
      }),
    (s) => (s.composition.layers[1].count = 999999),
  ]) {
    const scene = fixture();
    mutate(scene);
    assert.ok(validateComposition(scene).length);
  }
});
