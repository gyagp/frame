import test from "node:test";
import assert from "node:assert/strict";
import { repairTextAnchors } from "../src/engine/layout.mjs";
import { reviewTime } from "../src/engine/review.mjs";

test("edge-anchored generated headings are corrected without mutating source or good layouts", () => {
  const c = {
    version: 1,
    background: "#000000",
    layers: [
      { id: "left", type: "text", x: 0.08, w: 0.84, align: "left" },
      { id: "right", type: "text", x: 0.92, w: 0.84, align: "right" },
      { id: "good", type: "text", x: 0.5, w: 0.84, align: "left" },
    ],
  };
  const r = repairTextAnchors(c);
  assert.deepEqual(r.adjustedLayerIds, ["left", "right"]);
  assert.ok(Math.abs(r.composition.layers[0].x - 0.5) < 1e-10);
  assert.ok(Math.abs(r.composition.layers[1].x - 0.5) < 1e-10);
  assert.equal(r.composition.layers[2], c.layers[2]);
  assert.equal(c.layers[0].x, 0.08);
  assert.deepEqual(repairTextAnchors(r.composition).adjustedLayerIds, []);
});

test("review stills honor complete reveals and safely retain legacy frame selection", () => {
  assert.equal(
    reviewTime({ duration: 16, composition: { posterTime: 12 } }),
    12,
  );
  assert.equal(
    reviewTime({ duration: 16, composition: { posterTime: -1 } }),
    4,
  );
  assert.equal(
    reviewTime({ duration: 16, composition: { posterTime: 19 } }, 6),
    6,
  );
  assert.equal(reviewTime({ duration: 8 }, 6), 4);
});

test("intentional entrances, camera-independent geometry and moving text are preserved", () => {
  const nodes = [
    { id: "outside", type: "text", x: -0.2, w: 0.4, align: "left" },
    {
      id: "moves",
      type: "text",
      x: 0.1,
      w: 0.4,
      align: "left",
      tracks: [{ property: "x", keys: [] }],
    },
    {
      id: "rotated",
      type: "text",
      x: 0.1,
      w: 0.4,
      align: "left",
      rotation: 30,
    },
    { id: "shape", type: "rect", x: 0.1, w: 0.4 },
  ];
  const r = repairTextAnchors({ layers: nodes });
  assert.deepEqual(r.adjustedLayerIds, []);
  assert.deepEqual(r.composition.layers, nodes);
});
