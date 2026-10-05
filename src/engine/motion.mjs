export const EASINGS = ["linear", "easeIn", "easeOut", "easeInOut", "spring"];
export function ease(t, name = "easeInOut") {
  const x = Math.max(0, Math.min(1, t));
  if (name === "linear") return x;
  if (name === "easeIn") return x * x * x;
  if (name === "easeOut") return 1 - (1 - x) ** 3;
  if (name === "spring")
    return x === 0 || x === 1 ? x : 1 - Math.exp(-7 * x) * Math.cos(10 * x);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}
export function valueAt(keys, time) {
  if (time <= keys[0].t) return keys[0].value;
  for (let i = 1; i < keys.length; i++)
    if (time <= keys[i].t) {
      const a = keys[i - 1],
        b = keys[i];
      return (
        a.value + (b.value - a.value) * ease((time - a.t) / (b.t - a.t), b.ease)
      );
    }
  return keys.at(-1).value;
}
export function evaluate(node, time) {
  const result = { ...node };
  for (const track of node.tracks ?? [])
    result[track.property] = valueAt(track.keys, time);
  return result;
}
export function seeded(seed = 1) {
  let n = seed >>> 0;
  return () => {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    return n / 4294967296;
  };
}
