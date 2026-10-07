import { validTimeAnchor } from "./cue-timing.mjs";
// Data only. IDs map to trusted, versioned builders; no paths or scripts.
export const BLENDER_ASSETS = [
  "pony-v1",
  "mother-v1",
  "ox-v1",
  "squirrel-v1",
  "cube-v1",
  "pony-v2",
  "mother-v2",
  "ox-v2",
  "squirrel-v2",
  "pony-v3",
  "mother-v3",
];
const record = (v) => v && typeof v === "object" && !Array.isArray(v);
const number = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;
const vector = (v) =>
  Array.isArray(v) && v.length === 3 && v.every((n) => number(n, -100, 100));
function keys(v, allowed) {
  return record(v) && Object.keys(v).every((k) => allowed.includes(k));
}
export function validateSpatial(s) {
  if (s === undefined) return [];
  const errors = [];
  if (
    !keys(s, [
      "version",
      "environment",
      "camera",
      "actors",
      "seed",
      "reviewAt",
    ]) ||
    s.version !== 1 ||
    ![
      "river-v1",
      "yard-v1",
      "mill-v1",
      "studio-v1",
      "river-v2",
      "yard-v2",
      "mill-v2",
    ].includes(s.environment) ||
    !Number.isInteger(s.seed) ||
    !number(s.seed, 0, 65535)
  )
    return ["Invalid Blender scene contract"];
  if (s.reviewAt !== undefined && !number(s.reviewAt, 0, 0.99))
    errors.push("Invalid Blender review time");
  const c = s.camera;
  if (
    !keys(c, [
      "position",
      "target",
      "endPosition",
      "endTarget",
      "lens",
      "keys",
      "cueKeys",
      "safety",
    ]) ||
    !vector(c.position) ||
    !vector(c.target) ||
    !number(c.lens, 18, 100) ||
    (c.endPosition !== undefined && !vector(c.endPosition)) ||
    (c.endTarget !== undefined && !vector(c.endTarget)) ||
    JSON.stringify(c.position) === JSON.stringify(c.target)
  )
    errors.push("Invalid Blender camera");
  if (c?.keys !== undefined) {
    const tracks = c.keys;
    if (
      !Array.isArray(tracks) ||
      tracks.length < 2 ||
      tracks.length > 16 ||
      tracks[0]?.k !== 0 ||
      tracks.at(-1)?.k !== 1 ||
      tracks.some(
        (v, i) =>
          !keys(v, ["k", "position", "target", "lens"]) ||
          !number(v.k, 0, 1) ||
          !vector(v.position) ||
          !vector(v.target) ||
          (v.lens !== undefined && !number(v.lens, 18, 100)) ||
          (i > 0 && v.k <= tracks[i - 1].k),
      )
    )
      errors.push("Invalid normalized camera keys");
  }
  if (c?.cueKeys !== undefined) {
    const tracks = c.cueKeys;
    if (
      c.keys ||
      !Array.isArray(tracks) ||
      tracks.length < 2 ||
      tracks.length > 16 ||
      tracks.some(
        (v) =>
          !keys(v, ["at", "position", "target", "lens"]) ||
          !validTimeAnchor(v.at) ||
          !vector(v.position) ||
          !vector(v.target) ||
          (v.lens !== undefined && !number(v.lens, 18, 100)),
      )
    )
      errors.push("Invalid measured-cue camera keys");
  }
  if (c?.safety !== undefined) {
    const q = c.safety;
    if (
      !keys(q, ["clearance", "avoidGround", "framing", "subjects"]) ||
      (q.clearance !== undefined && !number(q.clearance, 0, 2)) ||
      (q.avoidGround !== undefined && typeof q.avoidGround !== "boolean") ||
      (q.framing !== undefined && !["full", "detail"].includes(q.framing)) ||
      (q.subjects !== undefined &&
        (!Array.isArray(q.subjects) ||
          q.subjects.length > 12 ||
          q.subjects.some((id) => !s.actors?.some((a) => a.id === id))))
    )
      errors.push("Invalid camera safety settings");
  }
  if (!Array.isArray(s.actors) || !s.actors.length || s.actors.length > 12)
    return [...errors, "Invalid Blender actors"];
  const ids = new Set();
  for (const a of s.actors) {
    if (
      !keys(a, [
        "id",
        "asset",
        "position",
        "heading",
        "action",
        "travel",
        "bag",
        "performance",
      ]) ||
      !/^[a-z][a-z0-9-]{0,40}$/.test(a.id) ||
      ids.has(a.id) ||
      !BLENDER_ASSETS.includes(a.asset) ||
      !vector(a.position) ||
      !number(a.heading, -360, 360) ||
      !["idle", "look", "probe", "walk"].includes(a.action) ||
      !number(a.travel, 0, 12) ||
      typeof a.bag !== "boolean"
    )
      errors.push("Invalid Blender actor");
    if (a.performance !== undefined) {
      const p = a.performance,
        channels = {
          travel: [0, 12],
          headPitch: [-0.6, 0.6],
          headYaw: [-0.9, 0.9],
          bodyShift: [-0.2, 0.2],
          bodyDrop: [0, 0.28],
          probeLift: [0, 0.4],
          probeReach: [0, 0.5],
          bagDrop: [0, 1],
        };
      if (
        !keys(p, ["keys", "stride", "stepHeight"]) ||
        (p.stride !== undefined && !number(p.stride, 0.3, 1)) ||
        (p.stepHeight !== undefined && !number(p.stepHeight, 0.04, 0.3)) ||
        !Array.isArray(p.keys) ||
        p.keys.length < 2 ||
        p.keys.length > 16 ||
        p.keys[0]?.k !== 0 ||
        p.keys.at(-1)?.k !== 1 ||
        p.keys.some(
          (key, i) =>
            !keys(key, ["k", ...Object.keys(channels)]) ||
            !number(key.k, 0, 1) ||
            (i > 0 && key.k <= p.keys[i - 1].k) ||
            Object.entries(channels).some(
              ([name, [lo, hi]]) =>
                key[name] !== undefined && !number(key[name], lo, hi),
            ) ||
            (key.travel !== undefined &&
              (a.action !== "walk" || key.travel > a.travel)),
        )
      )
        errors.push("Invalid Blender performance");
    }
    ids.add(a?.id);
  }
  return errors;
}
export function blenderReady(p) {
  return (
    p?.production?.backend === "blender" &&
    p.scenes?.length > 0 &&
    p.scenes.every((s) => s.spatial && validateSpatial(s.spatial).length === 0)
  );
}
