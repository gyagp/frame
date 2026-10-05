import { EASINGS } from "./motion.mjs";
export const NODE_TYPES = [
  "rect",
  "ellipse",
  "text",
  "line",
  "path",
  "image",
  "particles",
];
const PROPERTIES = [
  "x",
  "y",
  "w",
  "h",
  "opacity",
  "rotation",
  "scale",
  "progress",
  "zoom",
  "radius",
];
const isColor = (s) =>
  typeof s === "string" &&
  /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s);
const number = (n, lo, hi) =>
  typeof n === "number" && Number.isFinite(n) && n >= lo && n <= hi;
export function validateComposition(scene) {
  const c = scene.composition,
    errors = [];
  if (!c) return errors;
  if (c.version !== 1) errors.push("Unknown composition version");
  if (!isColor(c.background)) errors.push("Composition needs a hex background");
  if (!Array.isArray(c.layers) || c.layers.length < 1 || c.layers.length > 60)
    return [...errors, "Use 1–60 composition layers"];
  const ids = new Set();
  for (const n of c.layers) {
    if (!n || !NODE_TYPES.includes(n.type)) {
      errors.push("Unknown layer type");
      continue;
    }
    if (typeof n.id !== "string" || ids.has(n.id))
      errors.push("Layer IDs must be unique");
    ids.add(n.id);
    for (const k of ["x", "y", "w", "h"])
      if (n[k] !== undefined && !number(n[k], -3, 4))
        errors.push(`Invalid layer ${k}`);
    for (const k of ["fill", "stroke"])
      if (n[k] !== undefined && !isColor(n[k])) errors.push("Use hex colors");
    if (n.opacity !== undefined && !number(n.opacity, 0, 1))
      errors.push("Invalid opacity");
    if (n.rotation !== undefined && !number(n.rotation, -1440, 1440))
      errors.push("Invalid rotation");
    if (n.scale !== undefined && !number(n.scale, 0.001, 5))
      errors.push("Invalid scale");
    if (
      n.type === "text" &&
      (typeof n.text !== "string" ||
        n.text.length > 400 ||
        !number(n.fontSize, 0.01, 0.2))
    )
      errors.push(
        "Text layer requires text and fontSize (fraction of canvas height)",
      );
    if (
      n.type === "image" &&
      (typeof n.asset !== "string" ||
        !/^assets\/[a-zA-Z0-9._-]+\.(png|jpe?g)$/.test(n.asset))
    )
      errors.push("Image layer requires a local image asset");
    if (
      ["line", "path"].includes(n.type) &&
      (!Array.isArray(n.points) ||
        n.points.length < 2 ||
        n.points.length > 100 ||
        n.points.some(
          (p) =>
            !Array.isArray(p) ||
            p.length !== 2 ||
            p.some((v) => !number(v, -3, 4)),
        ))
    )
      errors.push("Path requires 2–100 normalized points");
    if (
      n.type === "particles" &&
      (!Number.isInteger(n.count) || n.count < 1 || n.count > 300)
    )
      errors.push("Particle count must be 1–300");
    for (const k of ["radius", "strokeWidth", "size"])
      if (n[k] !== undefined && !number(n[k], 0, 0.3))
        errors.push(`Invalid ${k}`);
    if (
      n.weight !== undefined &&
      (!number(n.weight, 100, 900) || n.weight % 100 !== 0)
    )
      errors.push("Font weight must be 100-step");
    if (n.align && !["left", "center", "right"].includes(n.align))
      errors.push("Invalid text alignment");
    if (n.fit && !["contain", "cover"].includes(n.fit))
      errors.push("Invalid image fit");
    checkTracks(n.tracks, errors, scene.duration);
  }
  if (c.camera) {
    for (const k of ["x", "y"])
      if (c.camera[k] !== undefined && !number(c.camera[k], -1, 2))
        errors.push("Invalid camera position");
    if (c.camera.zoom !== undefined && !number(c.camera.zoom, 0.25, 4))
      errors.push("Invalid camera zoom");
    checkTracks(c.camera.tracks, errors, scene.duration);
  }
  if (c.transition && !["none", "wipe", "iris"].includes(c.transition))
    errors.push("Unknown transition");
  if (scene.soundCues && !Array.isArray(scene.soundCues))
    errors.push("Sound cues must be an array");
  else
    for (const cue of scene.soundCues ?? []) {
      if (
        !["tick", "whoosh", "impact", "chime"].includes(cue.type) ||
        !number(cue.t, 0, scene.duration) ||
        !number(cue.gain ?? 0.03, 0, 0.2)
      )
        errors.push("Invalid sound cue");
    }
  return errors;
}
function checkTracks(tracks, errors, duration) {
  if (tracks === undefined) return;
  if (!Array.isArray(tracks) || tracks.length > 12) {
    errors.push("Invalid animation tracks");
    return;
  }
  const props = new Set();
  for (const track of tracks) {
    if (!PROPERTIES.includes(track.property) || props.has(track.property))
      errors.push("Duplicate or unknown animation property");
    props.add(track.property);
    if (
      !Array.isArray(track.keys) ||
      track.keys.length < 1 ||
      track.keys.length > 30
    ) {
      errors.push("Use 1–30 keyframes");
      continue;
    }
    let prev = -1;
    for (const key of track.keys) {
      if (
        !number(key.t, 0, duration) ||
        key.t <= prev ||
        !number(key.value, -1440, 1440) ||
        (key.ease && !EASINGS.includes(key.ease))
      )
        errors.push("Invalid or unordered keyframe");
      prev = key.t;
      if (track.property === "opacity" && !number(key.value, 0, 1))
        errors.push("Opacity keyframe outside 0–1");
      if (
        ["scale", "zoom"].includes(track.property) &&
        !number(key.value, 0.001, 5)
      )
        errors.push("Scale keyframe outside range");
      if (
        ["x", "y", "w", "h"].includes(track.property) &&
        !number(key.value, -3, 4)
      )
        errors.push("Coordinate keyframe outside range");
      if (track.property === "radius" && !number(key.value, 0, 0.5))
        errors.push("Invalid animated radius");
    }
  }
}
