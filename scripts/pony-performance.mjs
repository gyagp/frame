// Bounded visual revision of the existing screenplay; genuine approval fields
// and narration remain intact. New visual hashes require the next user review.
import path from "node:path";
import {
  loadProject,
  projectDir,
  writeJSON,
  storySignature,
  hashProject,
} from "./lib.mjs";
import { assertProject } from "../src/model.mjs";
const p = await loadProject("little-pony-crosses-river"),
  before = storySignature(p);
await writeJSON(
  path.join(
    projectDir(p.id),
    "revisions",
    `${Date.now()}-before-performance.json`,
  ),
  p,
);
const actor = (index, id = "pony") =>
  p.scenes[index - 1].spatial.actors.find((a) => a.id === id);
const performance = (a, keys) => {
  a.performance = { keys };
};
const walk = (
  index,
  position,
  distance,
  id = "pony",
  start = 0.1,
  end = 0.9,
) => {
  const a = actor(index, id);
  a.position = position;
  a.action = "walk";
  a.travel = distance;
  performance(a, [
    { k: 0, travel: 0, headPitch: 0.05, headYaw: 0 },
    { k: start, travel: 0 },
    { k: end, travel: distance },
    { k: 1, travel: distance, headPitch: 0, headYaw: 0 },
  ]);
};
// Turn toward a partner/water, hold a readable reaction, then settle. Avoid a
// uniform tiny neck twist spanning the whole shot.
for (const scene of p.scenes)
  for (const [i, a] of scene.spatial.actors.entries()) {
    if (a.action === "look" || a.action === "idle") {
      a.action = "look";
      const sign = i % 2 ? -1 : 1;
      performance(a, [
        { k: 0, headPitch: 0, headYaw: 0 },
        { k: 0.18, headPitch: 0.13, headYaw: sign * 0.34 },
        { k: 0.42, headPitch: 0.13, headYaw: sign * 0.34 },
        { k: 0.65, headPitch: -0.06, headYaw: -sign * 0.12 },
        { k: 0.84, headPitch: 0, headYaw: 0 },
        { k: 1, headPitch: 0, headYaw: 0 },
      ]);
    }
  }
walk(3, [-6.6, 0, 0.26], 3.1);
walk(12, [-5.2, 0, 0.26], 2.6);
walk(12, [-6.7, 1.5, 0.26], 2.2, "mother");
walk(14, [-1.7, 0, 0], 3.5, "pony", 0.08, 0.95);
walk(15, [1.8, 0, 0.13], 0.8, "pony", 0.63, 0.96);
performance(actor(15), [
  { k: 0, travel: 0, headYaw: 0 },
  { k: 0.18, travel: 0, headYaw: 0.65, headPitch: -0.06 },
  { k: 0.42, travel: 0, headYaw: 0.65 },
  { k: 0.63, travel: 0, headYaw: 0, headPitch: 0 },
  { k: 0.96, travel: 0.8 },
  { k: 1, travel: 0.8 },
]);
walk(16, [2.6, 0, 0.26], 0.9, "pony", 0.04, 0.45);
walk(18, [-3, 0, 0.26], 3);
walk(18, [-3, 1.7, 0.26], 3, "mother");
// The water test: observe, lift, reach, lower, then transfer weight. The target
// height comes from the same terrain as the supporting feet.
for (const index of [1, 13]) {
  const a = actor(index);
  a.position = [-2.6, 0, 0.26];
  performance(a, [
    {
      k: 0,
      headPitch: 0,
      headYaw: 0,
      probeLift: 0,
      probeReach: 0,
      bodyShift: 0,
      bodyDrop: 0,
    },
    { k: 0.14, headPitch: 0.27, headYaw: -0.16, probeLift: 0, probeReach: 0 },
    { k: 0.25, headPitch: 0.27, probeLift: 0.28, probeReach: 0.04 },
    { k: 0.34, probeLift: 0.28, probeReach: 0.48 },
    { k: 0.49, probeLift: 0, probeReach: 0.48, bodyShift: 0.18, bodyDrop: 0.26 },
    { k: 0.7, bodyShift: 0.18, bodyDrop: 0.26, headYaw: 0 },
    { k: 0.87, headPitch: 0.06, bodyShift: 0.18, bodyDrop: 0.26 },
    {
      k: 1,
      headPitch: 0.06,
      headYaw: 0,
      probeLift: 0,
      probeReach: 0.48,
      bodyShift: 0.18,
      bodyDrop: 0.26,
    },
  ]);
}
const squirrel = actor(7, "squirrel");
performance(squirrel, [
  { k: 0, probeLift: 0.36, headYaw: 0 },
  { k: 0.13, probeLift: 0.36 },
  { k: 0.19, probeLift: 0, headYaw: -0.25 },
  { k: 0.27, probeLift: 0.04 },
  { k: 0.34, probeLift: 0 },
  { k: 1, probeLift: 0, headYaw: 0 },
]);
// Camera tracks show relative background motion but leave the performance clear.
function camera(index, from, to, target, endTarget, lens = 43) {
  const old = p.scenes[index - 1].spatial.camera;
  p.scenes[index - 1].spatial.camera = {
    position: from,
    target,
    lens,
    keys: [
      { k: 0, position: from, target },
      { k: 0.1, position: from, target },
      { k: 0.9, position: to, target: endTarget },
      { k: 1, position: to, target: endTarget },
    ],
    safety: {
      ...old.safety,
      framing: index === 1 ? "detail" : "full",
      subjects: ["pony"],
    },
  };
}
camera(
  3,
  [-5.2, -8.2, 2.7],
  [-2.5, -8.2, 2.7],
  [-6.0, 0, 1.25],
  [-3.4, 0, 1.25],
);
camera(
  12,
  [-4, -8.4, 2.8],
  [-1.8, -8.4, 2.8],
  [-5.1, 0.7, 1.25],
  [-2.9, 0.7, 1.25],
);
camera(
  13,
  [-0.9, -6.4, 2.2],
  [-0.7, -6.1, 1.9],
  [-2.3, 0, 1.12],
  [-2.2, 0, 1.05],
  48,
);
camera(14, [-1.3, -7.7, 2.4], [1.7, -7.7, 2.4], [-1.5, 0, 1], [1.6, 0, 1], 45);
camera(
  15,
  [3.2, -6.5, 2.5],
  [3.7, -6.5, 2.5],
  [1.9, 0, 1.1],
  [2.5, 0, 1.1],
  46,
);
camera(18, [-3, -13, 6], [-5, -14, 7], [-3, 0.8, 1], [-5, 0.8, 1], 35);
if (storySignature(p) !== before)
  throw new Error("Visual revision changed the approved story");
assertProject(p);
await writeJSON(path.join(projectDir(p.id), "project.json"), p);
console.log(
  JSON.stringify({
    hash: hashProject(p),
    storyUnchanged: true,
    visualReviewRequired: true,
  }),
);
