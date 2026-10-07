import test from "node:test";
import assert from "node:assert/strict";
import { workflowView, briefSuggestions } from "../src/workflow.mjs";
import { loadProject } from "../scripts/lib.mjs";
const project = {
  id: "test",
  scenes: [{ narration: "One clear idea.", body: "Start here." }],
};
const output = (files) => [
  { current: true, key: "current", base: "/output", files },
];

test("silent Blender performance preview appears without advancing the approval gate", async () => {
  const p = await loadProject("little-pony-crosses-river");
  const view = workflowView({
    project: p,
    review: { storyApproved: true },
    outputs: output(["storyboard.jpg", "motion-review-after.mp4"]),
  });
  assert.equal(view.action, "approve-frames");
  assert.equal(view.phase, "frames");
  assert.equal(view.media, "motion-review-after.mp4");
  assert.equal(view.visualPreview, true);
  const voiced = workflowView({
    project: p,
    review: { storyApproved: true, framesApproved: true },
    outputs: output([
      "storyboard.jpg",
      "motion-review-after.mp4",
      "sample.mp4",
    ]),
  });
  assert.equal(voiced.media, "sample.mp4");
  assert.equal(voiced.action, "approve-sample");
});
test("one explicit action guides every approval stage", () => {
  const cases = [
    [{}, [], "approve-story"],
    [{ storyApproved: true }, [], "prepare"],
    [{ storyApproved: true }, ["storyboard.jpg"], "approve-frames"],
    [
      { storyApproved: true, framesApproved: true },
      ["storyboard.jpg"],
      "sample",
    ],
    [
      { storyApproved: true, framesApproved: true },
      ["storyboard.jpg", "sample.mp4"],
      "approve-sample",
    ],
    [
      { storyApproved: true, framesApproved: true, sampleApproved: true },
      ["sample.mp4"],
      "render",
    ],
    [
      { storyApproved: true, framesApproved: true, sampleApproved: true },
      ["sample.mp4", "film.mp4"],
      "download",
    ],
  ];
  for (const [review, files, action] of cases)
    assert.equal(
      workflowView({ project, review, outputs: output(files) }).action,
      action,
    );
});
test("finished film is shown instead of asking for another paid render", () => {
  const view = workflowView({
    project,
    review: { storyApproved: true, framesApproved: true, sampleApproved: true },
    outputs: output(["film.mp4", "sample.mp4"]),
    job: { projectId: "test", type: "render", status: "complete" },
  });
  assert.equal(view.phase, "complete");
  assert.equal(view.media, "film.mp4");
  assert.equal(view.action, "download");
});
test("missing approval and stale outputs cannot advance the workflow", () => {
  assert.equal(
    workflowView({
      project,
      outputs: [{ current: false, files: ["film.mp4", "sample.mp4"] }],
      review: {},
    }).action,
    "approve-story",
  );
  assert.equal(
    workflowView({
      project,
      outputs: output(["film.mp4"]),
      review: { storyApproved: true },
    }).action,
    "prepare",
  );
});
test("busy jobs disable advance; failures preserve retry without inventing approval", () => {
  const busy = workflowView({
    project,
    job: { projectId: "test", status: "running", message: "Drawing" },
  });
  assert.equal(busy.action, null);
  assert.equal(busy.busy, true);
  const fail = workflowView({
    project,
    job: { projectId: "test", status: "failed", message: "429 quota" },
  });
  assert.equal(fail.action, "retry");
  assert.match(fail.description, /额度/);
});
test("optional critique failure does not hide a completed film", () => {
  const view = workflowView({
    project,
    review: { storyApproved: true, framesApproved: true, sampleApproved: true },
    outputs: output(["film.mp4"]),
    job: { projectId: "test", status: "failed", type: "critique" },
  });
  assert.equal(view.action, "download");
});
test("editing after a failed render restores the correct approval step", () => {
  const view = workflowView({
    project,
    review: {
      storyApproved: false,
      framesApproved: false,
      sampleApproved: false,
    },
    outputs: [],
    job: {
      projectId: "test",
      type: "render",
      status: "failed",
      projectHash: "old-version",
      message: "too much narration",
    },
  });
  assert.equal(view.action, "approve-story");
  assert.equal(view.failed, undefined);
});
test("a written brief can suggest defaults while fields remain independently editable", () => {
  assert.deepEqual(briefSuggestions("给开发者做英文演示，2-3分钟，竖屏"), {
    language: "en",
    aspect: "9:16",
    duration: 150,
  });
  assert.deepEqual(briefSuggestions("中文产品介绍，75秒"), {
    language: "zh",
    duration: 75,
  });
  assert.equal(briefSuggestions("10分钟长片").duration, undefined);
});
