import test from "node:test";
import assert from "node:assert/strict";
import { validateSpatial, blenderReady } from "../src/blender-schema.mjs";
import {
  loadProject,
  hashProject,
  storySignature,
  reviewState,
  run,
} from "../scripts/lib.mjs";
import { validate } from "../src/model.mjs";
import { productionUnavailable } from "../src/production.mjs";
import { workflowView } from "../src/workflow.mjs";

test("Blender contract rejects executable input, paths, unknown assets and unbounded coordinates", async () => {
  const p = await loadProject("little-pony-crosses-river");
  assert.equal(blenderReady(p), true);
  assert.equal(productionUnavailable(p), null);
  const s = p.scenes[0].spatial;
  for (const mutate of [
    (x) => (x.script = "import os"),
    (x) => (x.environment = "../../arbitrary.blend"),
    (x) => (x.actors[0].asset = "https://example.com/model.blend"),
    (x) => (x.actors[0].position[0] = Infinity),
    (x) => (x.camera.position = [0, 0]),
    (x) => (x.camera.target = [...x.camera.position]),
    (x) => x.actors.push({ ...x.actors[0] }),
    (x) => (x.actors[0].expression = "frame*10"),
    (x) => (x.camera.lens = 0),
  ]) {
    const bad = structuredClone(s);
    mutate(bad);
    assert.ok(validateSpatial(bad).length);
  }
  const bad = structuredClone(p);
  bad.scenes[0].spatial.command = "cmd.exe";
  assert.ok(validate(bad).length);
  assert.equal(blenderReady(bad), false);
});

test("visual Blender edits preserve the approved story but invalidate frames and samples", async () => {
  const p = await loadProject("little-pony-crosses-river"),
    s = storySignature(p),
    h = hashProject(p);
  const next = structuredClone(p);
  next.review = { story: s, frames: h, sample: h };
  next.scenes[0].spatial.camera.lens += 1;
  assert.equal(storySignature(next), s);
  assert.notEqual(hashProject(next), h);
  assert.deepEqual(reviewState(next), {
    storyApproved: true,
    framesApproved: false,
    sampleApproved: false,
  });
  const view = workflowView({ project: next, review: reviewState(next) });
  assert.equal(view.action, "prepare");
  next.scenes[0].narration += " 新的一句。";
  assert.equal(reviewState(next).storyApproved, false);
});

test("legacy render entry points cannot consume a configured Blender film", async () => {
  for (const script of ["scripts/stills.mjs", "scripts/render.mjs"]) {
    await assert.rejects(
      run(process.execPath, [script, "little-pony-crosses-river"]),
      /2D fallback is forbidden/,
    );
  }
});
