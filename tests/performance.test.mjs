import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { validateSpatial } from "../src/blender-schema.mjs";
import { loadProject } from "../scripts/lib.mjs";
test("performance data rejects executable fields, unsorted times and excessive displacement", async () => {
  const p = await loadProject("little-pony-crosses-river");
  for (const mutate of [
    (a) => (a.performance = { keys: [{ k: 0 }, { k: 1 }], script: "run()" }),
    (a) =>
      (a.performance = { keys: [{ k: 0 }, { k: 0.5 }, { k: 0.4 }, { k: 1 }] }),
    (a) => (a.performance = { keys: [{ k: 0, headYaw: Infinity }, { k: 1 }] }),
    (a) => (a.performance = { keys: [{ k: 0, travel: 99 }, { k: 1 }] }),
  ]) {
    const s = structuredClone(p.scenes[0].spatial);
    mutate(s.actors[0]);
    assert.ok(validateSpatial(s).length);
  }
});
test("baked performance is independent of frame order and stance feet stay planted", () => {
  const result = execFileSync(
    "python",
    [
      "-c",
      `
import sys,math
sys.path.insert(0,'scripts/blender')
from performance import pose,foot
a={'action':'walk','travel':3,'performance':{'keys':[{'k':0,'travel':0},{'k':.2,'travel':0},{'k':.8,'travel':3},{'k':1,'travel':3}]}}
sequential={u:pose(a,u,u*10) for u in [0,.2,.4,.8,1]}
assert sequential=={u:pose(a,u,u*10) for u in [1,.4,0,.8,.2]}
assert sequential[0]['travel']==0 and sequential[1]['travel']==3
# World foot position = root travel + local target offset during stance.
positions=[d+foot(d,1,0)[0] for d in [.02,.10,.20,.30]]
assert max(positions)-min(positions)<1e-9
assert foot(.40,1,0)[1]>.1
print('performance invariants passed')
`,
    ],
    { encoding: "utf8", windowsHide: true },
  );
  assert.match(result, /passed/);
});
