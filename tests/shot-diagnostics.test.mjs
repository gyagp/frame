import test from "node:test";
import assert from "node:assert/strict";
import {
  sampleCamera,
  reviewSamples,
  imageDiagnostics,
} from "../src/shot-diagnostics.mjs";
import { resolveTimeAnchor, compileCameraCues } from "../src/cue-timing.mjs";
import { validateSpatial } from "../src/blender-schema.mjs";
import { summarizeBlenderFrames } from "../src/blender-review.mjs";

test("review aggregates repeated warnings while preserving unapproved manual findings", () => {
  const frames = [1, 24, 48].map((frame) => ({
    sceneId: "shot",
    frame,
    findings: [],
    cameraFindings: [
      { code: "subject-crop", issue: "Cropped", actorId: "pony" },
    ],
  }));
  const result = summarizeBlenderFrames(
    { frames },
    {
      findings: [
        { sceneId: "shot", issue: "Still too stylized", severity: "blocking" },
      ],
    },
  );
  assert.equal(result.findings.length, 2);
  assert.deepEqual(result.findings[0].frames, [1, 24, 48]);
  assert.equal(result.findings[1].issue, "Still too stylized");
  assert.match(result.scope, /not AI art review/);
  assert.throws(() => summarizeBlenderFrames({ frames: [] }));
});

test("multi-key camera paths hold endpoints and are independent of sample order", () => {
  const camera = {
    lens: 45,
    position: [0, -3, 2],
    target: [0, 0, 1],
    keys: [
      { k: 0, position: [0, -3, 2], target: [0, 0, 1] },
      { k: 0.5, position: [2, -3, 2], target: [1, 0, 1], lens: 55 },
      { k: 1, position: [3, -3, 3], target: [2, 0, 1] },
    ],
  };
  const a = sampleCamera(camera, 0.31);
  sampleCamera(camera, 0.95);
  sampleCamera(camera, 0.04);
  assert.deepEqual(sampleCamera(camera, 0.31), a);
  assert.deepEqual(sampleCamera(camera, 0.5), {
    position: [2, -3, 2],
    target: [1, 0, 1],
    lens: 55,
  });
  assert.deepEqual(sampleCamera(camera, 2).position, [3, -3, 3]);
  assert.deepEqual(
    reviewSamples({ duration: 4, spatial: { reviewAt: 0.25 } }, 24),
    [1, 24, 96],
  );
});
test("measured cue compiler uses actual voice timing and rejects code and missing cues", () => {
  const cues = [
      { start: 20.7, end: 23.2 },
      { start: 23.5, end: 26.4 },
    ],
    context = { duration: 8, cues, sceneStart: 20 };
  assert.ok(Math.abs(resolveTimeAnchor("cueEnd:0+0.3", context) - 3.5) < 1e-8);
  assert.equal(resolveTimeAnchor("end-0.5", context), 7.5);
  for (const expression of [
    "process.exit()",
    "cue:100",
    "cue:0-2",
    "end+3",
    NaN,
  ])
    assert.throws(() => resolveTimeAnchor(expression, context));
  const scene = {
    duration: 8,
    spatial: {
      camera: {
        lens: 45,
        cueKeys: [
          { at: 0, position: [0, 0, 3], target: [0, 0, 1] },
          { at: "cueEnd:0", position: [1, 0, 3], target: [0, 0, 1] },
          { at: "end", position: [2, 0, 3], target: [0, 0, 1] },
        ],
      },
    },
  };
  const compiled = compileCameraCues(scene, cues, 20);
  assert.ok(Math.abs(compiled.spatial.camera.keys[1].k - 0.4) < 1e-8);
  assert.equal(scene.spatial.camera.keys, undefined);
});
test("camera schema rejects unordered tracks, arbitrary anchors and invalid subject IDs", () => {
  const spatial = {
    version: 1,
    seed: 1,
    environment: "studio-v1",
    camera: { lens: 45, position: [0, -3, 2], target: [0, 0, 1] },
    actors: [
      {
        id: "test",
        asset: "cube-v1",
        position: [0, 0, 0],
        heading: 0,
        action: "idle",
        travel: 0,
        bag: false,
      },
    ],
  };
  spatial.camera.safety = { subjects: ["missing"] };
  assert.ok(validateSpatial(spatial).length);
  delete spatial.camera.safety;
  spatial.camera.keys = [
    { k: 0, position: [0, 0, 2], target: [0, 0, 0] },
    { k: 0, position: [1, 0, 2], target: [0, 0, 0] },
  ];
  assert.ok(validateSpatial(spatial).length);
  delete spatial.camera.keys;
  spatial.camera.cueKeys = [
    { at: "eval(1)", position: [0, 0, 2], target: [0, 0, 0] },
    { at: "end", position: [1, 0, 2], target: [0, 0, 0] },
  ];
  assert.ok(validateSpatial(spatial).length);
});
test("pixel diagnostics find empty and overexposed output without claiming visual quality", () => {
  const pixels = (v) => Uint8Array.from([v, v, v, 255, v, v, v, 255]);
  assert.equal(imageDiagnostics(pixels(0)).findings[0].code, "near-black");
  assert.equal(imageDiagnostics(pixels(255)).findings[0].code, "overexposure");
  assert.equal(imageDiagnostics(pixels(120)).findings[0].code, "flat-frame");
  assert.match(imageDiagnostics(pixels(120)).scope, /not an aesthetic/);
});
