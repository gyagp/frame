// Pick the authored hold frame instead of capturing an unfinished chart reveal.
export function reviewTime(scene, fallbackMax = 4) {
  const t = scene.composition?.posterTime;
  return Number.isFinite(t) && t >= 0 && t < scene.duration
    ? t
    : Math.min(fallbackMax, scene.duration / 2);
}
