// Initial visual layout for the approved screenplay. No narration or approval edits.
import { loadProject, projectDir, writeJSON, storySignature } from "./lib.mjs";
import path from "node:path";
const p = await loadProject("little-pony-crosses-river"),
  before = storySignature(p);
await writeJSON(
  path.join(projectDir(p.id), "revisions", `${Date.now()}-before-blender.json`),
  p,
);
const actor = (
  id,
  asset,
  position,
  action = "idle",
  heading = 0,
  travel = 0,
  bag = false,
) => ({ id, asset, position, action, heading, travel, bag });
const pony = (
  pos = [-2.8, 0, 0.26],
  action = "idle",
  heading = 0,
  travel = 0,
  bag = true,
) => actor("pony", "pony-v1", pos, action, heading, travel, bag);
const mother = (pos = [-4, 1, 0.26], heading = 0) =>
  actor("mother", "mother-v1", pos, "look", heading);
const ox = (pos = [-2.7, 1.7, 0.26], heading = -30) =>
  actor("ox", "ox-v1", pos, "idle", heading);
const squirrel = (pos = [-2.3, -0.65, 0.37]) =>
  actor("squirrel", "squirrel-v1", pos, "idle", 0);
const camera = (position, target, lens = 48, endPosition) => ({
  position,
  target,
  lens,
  ...(endPosition ? { endPosition } : {}),
});
const layouts = [
  [
    "river-v1",
    camera([-0.25, -2.6, 0.52], [-1.6, -0.15, 0.5], 58),
    [pony([-2.25, 0, 0.26], "probe")],
  ],
  [
    "yard-v1",
    camera([-3, -9, 3.4], [-5.8, 1.6, 1.6], 43),
    [pony([-4.9, 0.6, 0.26], "look"), mother([-7.0, 1.2, 0.26])],
  ],
  [
    "river-v1",
    camera([-4, -9, 3.6], [-3, 1, 1.2], 43, [-3.5, -9, 3.6]),
    [pony([-4.4, 0, 0.26], "walk", 0, 0.8)],
  ],
  [
    "river-v1",
    camera([-5, -3, 2.4], [-0.5, 1, 1.2], 40),
    [pony([-2.9, 0, 0.26], "look")],
  ],
  ["river-v1", camera([0, -10, 3.2], [-2.8, 0.7, 1.8], 44), [pony(), ox()]],
  [
    "river-v1",
    camera([-1, -5, 5.5], [-1.7, 0.3, 0.55], 40),
    [pony([-3.2, -0.8, 0.26]), ox([-1.25, 1, 0], 0)],
  ],
  [
    "river-v1",
    camera([-0.6, -6.5, 2.0], [-2.6, 0, 1.2], 43),
    [pony([-2.9, 0.3, 0.26], "look"), squirrel()],
  ],
  [
    "river-v1",
    camera([-2, -2.1, 0.55], [-1.25, 0.2, 0.5], 28),
    [pony([-3, 0.9, 0.26]), squirrel([-2.2, 0, 0.37])],
  ],
  [
    "river-v1",
    camera([1.0, -3.6, 2.1], [-2.5, 0, 1.6], 62),
    [pony([-2.9, 0, 0.26], "look")],
  ],
  [
    "yard-v1",
    camera([-3, -8, 3.2], [-6, 1.5, 1.55], 48),
    [pony([-5.8, 1, 0.26], "look"), mother([-6.2, 2.7, 0.26])],
  ],
  [
    "river-v1",
    camera([0, -13, 4.1], [-3, 0.5, 1.8], 42),
    [
      pony([-2.9, -0.6, 0.26]),
      ox([-3.4, 2.2, 0.26], 0),
      squirrel([-2.9, -2, 0.26]),
    ],
  ],
  [
    "river-v1",
    camera([-2, -9, 3.4], [-3.2, 0.7, 1.4], 45),
    [pony([-3.1, 0, 0.26], "walk", 0, 0.45), mother([-4, 1.5, 0.26])],
  ],
  [
    "river-v1",
    camera([-0.2, -3.4, 1.0], [-1.9, -0.12, 0.85], 50, [-0.2, -3.25, 0.8]),
    [pony([-2.2, 0, 0.26], "probe"), mother([-4, 1, 0.26])],
  ],
  [
    "river-v1",
    camera([0, -7, 2.6], [0, 0.3, 1.1], 43, [1, -7, 2.6]),
    [pony([-0.95, 0, 0], "walk", 0, 1.4), mother([-3.6, 1, 0.26])],
  ],
  [
    "river-v1",
    camera([2, -7, 2.6], [0.9, 0.4, 1.5], 48),
    [pony([0.6, 0, 0], "look"), mother([-3.6, 1, 0.26])],
  ],
  [
    "river-v1",
    camera([4, -6, 2.8], [2.8, 0, 1.6], 43, [4.8, -7, 3]),
    [pony([2.5, 0, 0.26], "look")],
  ],
  [
    "mill-v1",
    camera([1, -5, 3.2], [4.7, 2.6, 1.6], 42),
    [pony([3.9, 1.4, 0.26], "look", 0, 0, false)],
  ],
  [
    "river-v1",
    camera([-1, -13, 6], [0, 2, 1], 32, [-1, -14, 7]),
    [
      pony([-3, 0, 0.26], "walk", 180, 0.6, false),
      mother([-3, 1.7, 0.26], 180),
    ],
  ],
];
p.scenes.forEach((s, i) => {
  const [environment, shotCamera, actors] = layouts[i];
  s.spatial = { version: 1, seed: 21, environment, camera: shotCamera, actors };
  if (i === 0) s.spatial.reviewAt = 0.12;
  if (i === 8) s.spatial.camera = camera([1, -5.8, 2.7], [-2.3, 0, 1.5], 55);
  if (i === 9) s.spatial = structuredClone(p.scenes[1].spatial);
});
if (storySignature(p) !== before)
  throw new Error("Visual layout changed the approved story");
await writeJSON(path.join(projectDir(p.id), "project.json"), p);
console.log("18 Blender layouts saved. Story and approval fields unchanged.");
