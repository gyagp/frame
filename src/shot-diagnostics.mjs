// Original implementation, informed by bangbuilds/code-doc-film's camera/QA method.
// Numbers and vectors only; no expressions or executable project content.
export function sampleCamera(camera, progress) {
  const keys = camera.keys ?? [
    {
      k: 0,
      position: camera.position,
      target: camera.target,
      lens: camera.lens,
    },
    {
      k: 1,
      position: camera.endPosition ?? camera.position,
      target: camera.endTarget ?? camera.target,
      lens: camera.lens,
    },
  ];
  const k = Math.max(0, Math.min(1, progress));
  const right = keys.findIndex((x) => x.k >= k);
  const b = keys[right < 0 ? keys.length - 1 : right],
    a = keys[Math.max(0, right - 1)];
  const u = a === b ? 0 : (k - a.k) / (b.k - a.k),
    f = u * u * (3 - 2 * u);
  return {
    position: a.position.map((v, i) => v + (b.position[i] - v) * f),
    target: a.target.map((v, i) => v + (b.target[i] - v) * f),
    lens:
      (a.lens ?? camera.lens) +
      ((b.lens ?? camera.lens) - (a.lens ?? camera.lens)) * f,
  };
}
export function reviewSamples(scene, fps = 24) {
  return [
    ...new Set([
      1,
      Math.max(
        1,
        Math.round(scene.duration * (scene.spatial?.reviewAt ?? 0.5) * fps),
      ),
      Math.max(1, Math.round(scene.duration * fps)),
    ]),
  ];
}
export function imageDiagnostics(rgba) {
  let sum = 0,
    sum2 = 0,
    dark = 0,
    bright = 0;
  const count = rgba.length / 4;
  for (let i = 0; i < rgba.length; i += 4) {
    const y =
      (0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]) / 255;
    sum += y;
    sum2 += y * y;
    if (y < 0.02) dark++;
    if (y > 0.95) bright++;
  }
  const mean = sum / count,
    std = Math.sqrt(Math.max(0, sum2 / count - mean * mean));
  const findings = [];
  if (mean < 0.02 || dark / count > 0.97)
    findings.push({
      severity: "blocking",
      code: "near-black",
      issue: "画面几乎全黑",
    });
  else if (mean > 0.8 || bright / count > 0.5)
    findings.push({
      severity: "warning",
      code: "overexposure",
      issue: "画面大面积过曝，需检查是否符合镜头意图",
    });
  else if (std < 0.012)
    findings.push({
      severity: "warning",
      code: "flat-frame",
      issue: "画面几乎没有可辨认细节",
    });
  return {
    mean,
    std,
    darkFraction: dark / count,
    brightFraction: bright / count,
    findings,
    scope: "Pixel statistics only; not an aesthetic or realism score",
  };
}
