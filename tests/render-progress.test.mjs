import test from "node:test";
import assert from "node:assert/strict";
import { frameProgress, progressMessage } from "../src/render-progress.mjs";
const scenes = [
  { id: "a", duration: 10 },
  { id: "b", duration: 14 },
];
test("live frame counts ignore copied previews, unfinished writes and frames outside the shot", () => {
  const state = frameProgress({
    scenes,
    fps: 24,
    activeIndex: 0,
    startedAt: 1000,
    now: 20000,
    files: [
      { frame: 1, mtime: 500, size: 100 },
      { frame: 2, mtime: 5000, size: 100 },
      { frame: 3, mtime: 19000, size: 0 },
      { frame: 4, mtime: 19800, size: 100 },
      { frame: 241, mtime: 6000, size: 100 },
    ],
  });
  assert.equal(state.done, 1);
  assert.equal(state.total, 576);
  assert.equal(state.shotTotal, 240);
  assert.equal(state.remainingSeconds, null);
});
test("completed previous shots count even when cached; ETA uses recent per-frame timings", () => {
  const files = Array.from({ length: 10 }, (_, i) => ({
    frame: i + 1,
    mtime: 2000 + i * 3700,
    size: 100,
  }));
  const state = frameProgress({
    scenes,
    fps: 24,
    activeIndex: 1,
    startedAt: 1000,
    now: 40000,
    files,
  });
  assert.equal(state.done, 250);
  assert.equal(state.shotDone, 10);
  assert.ok(Math.abs(state.secondsPerFrame - 3.7) < 1e-9);
  assert.equal(state.remainingSeconds, Math.ceil(326 * 3.7));
  assert.match(progressMessage("镜头", state), /250\/576/);
  assert.match(progressMessage("镜头", { ...state, done: 576 }), /编码与合成/);
});
