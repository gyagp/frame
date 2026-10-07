// Restricted cue grammar inspired by code-doc-film, reimplemented for Studio's
// measured Azure cues. No eval; missing cues fail instead of silently guessing.
const grammar = /^(?:(cue|cueEnd):(\d+)|(end))([+-]\d+(?:\.\d+)?)?$/;
export function validTimeAnchor(value) {
  return (
    (Number.isFinite(value) && value >= 0 && value <= 60) ||
    (typeof value === "string" && value.length <= 40 && grammar.test(value))
  );
}
export function resolveTimeAnchor(
  value,
  { duration, cues = [], sceneStart = 0 },
) {
  if (!validTimeAnchor(value)) throw new Error("Invalid cue time anchor");
  let time = value;
  if (typeof value === "string") {
    const [, type, index, end, offset] = value.match(grammar);
    if (end) time = duration;
    else {
      const cue = cues[Number(index)];
      if (!cue) throw new Error(`Missing measured narration cue: ${index}`);
      time = cue[type === "cue" ? "start" : "end"] - sceneStart;
    }
    time += Number(offset || 0);
  }
  if (!Number.isFinite(time) || time < 0 || time > duration)
    throw new Error("Cue anchor outside shot");
  return time;
}
export function compileCameraCues(scene, cues, sceneStart = 0) {
  if (!scene.spatial?.camera.cueKeys) return scene;
  const next = structuredClone(scene),
    camera = next.spatial.camera;
  camera.keys = camera.cueKeys.map(({ at, ...key }) => ({
    ...key,
    k:
      resolveTimeAnchor(at, { duration: scene.duration, cues, sceneStart }) /
      scene.duration,
  }));
  delete camera.cueKeys;
  if (
    camera.keys[0].k !== 0 ||
    camera.keys.at(-1).k !== 1 ||
    camera.keys.some((x, i) => i && x.k <= camera.keys[i - 1].k)
  )
    throw new Error("Camera cues must increase from 0 through shot end");
  return next;
}
