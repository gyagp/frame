import test from "node:test";
import assert from "node:assert/strict";
import { assertProductionAvailable, requires3D } from "../src/production.mjs";
import { workflowView } from "../src/workflow.mjs";
import { loadProject, storySignature, hashProject } from "../scripts/lib.mjs";
import { duration, validate } from "../src/model.mjs";
import { planFilm } from "../src/google.mjs";
import { createPresetProject } from "../src/presets.mjs";

test("3D intent cannot fall through to the 2D renderer or be enabled by metadata", () => {
  assert.doesNotThrow(() => assertProductionAvailable({}));
  for (const p of [
    { brief: { renderMedium: "3d" } },
    { production: { backend: "blender", implementation: "ready" } },
    { production: { backend: "three" } },
    { production: { backend: "arbitrary" } },
  ])
    assert.throws(() => assertProductionAvailable(p));
});

test("a 3D story can be reviewed without requesting images from the 2D pipeline", () => {
  const project = {
    id: "fixture",
    brief: { renderMedium: "3d" },
    scenes: [{ narration: "Story", body: "" }],
  };
  assert.equal(workflowView({ project }).action, "approve-story");
  const view = workflowView({
    project,
    review: { storyApproved: true },
    outputs: [{ current: true, files: ["film.mp4", "storyboard.jpg"] }],
  });
  assert.equal(view.action, null);
  assert.equal(view.disabled, true);
  assert.equal(view.media, null);
  const busy = workflowView({
    project,
    job: { projectId: project.id, status: "running", type: "plan" },
  });
  assert.equal(busy.busy, true);
  assert.equal(busy.action, null);
});

test("pony screenplay stays under five minutes with backend-bound review", async () => {
  const p = await loadProject("little-pony-crosses-river");
  assert.deepEqual(validate(p), []);
  assert.equal(duration(p), 210);
  assert.ok(duration(p) < 300);
  assert.ok(requires3D(p));
  const before = storySignature(p);
  const next = structuredClone(p);
  next.production.backend = "three";
  assert.notEqual(storySignature(next), before);
  assert.notEqual(hashProject(next), hashProject(p));
});

test("director output retains action, contact, sound and ending plans in the reviewable project", async () => {
  const p = createPresetProject(
    { title: "Contact study", language: "en" },
    "shot-plan-test",
  );
  p.targetDuration = 60;
  const result = await planFilm(p, {
    generateImpl: async () => [
      {
        text: JSON.stringify({
          scenes: p.scenes.map((s) => ({
            ...s,
            duration: 15,
            ending: "Front hoof planted; camera settles.",
            sound: "Water contact follows the hoof.",
            transitionIntent: "Match the planted pose.",
            referenceRoles: "Identity stays fixed; camera may move.",
            checks: "Inspect hoof sliding.",
          })),
        }),
      },
    ],
  });
  assert.equal(
    result.scenes[0].direction.ending,
    "Front hoof planted; camera settles.",
  );
  assert.equal(
    result.scenes[0].direction.transitionIntent,
    "Match the planted pose.",
  );
  assert.equal(
    result.scenes[0].direction.sound,
    "Water contact follows the hoof.",
  );
  assert.equal(result.scenes[0].direction.checks, "Inspect hoof sliding.");
  assert.deepEqual(validate({ ...p, ...result }), []);
});
