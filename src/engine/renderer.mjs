import { evaluate, ease, seeded } from "./motion.mjs";

function lines(c, text, width) {
  const chunks = /[\u3400-\u9fff]/.test(text) ? [...text] : text.split(" "),
    space = /[\u3400-\u9fff]/.test(text) ? "" : " ";
  let line = "",
    out = [];
  for (const word of chunks) {
    if (word === "\n") {
      out.push(line);
      line = "";
      continue;
    }
    const next = line ? line + space + word : word;
    if (c.measureText(next).width > width && line) {
      out.push(line);
      line = word;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}
function paintLayer(c, source, t, W, H, assets) {
  const n = evaluate(source, t),
    x = (n.x ?? 0.5) * W,
    y = (n.y ?? 0.5) * H,
    w = (n.w ?? 0.2) * W,
    h = (n.h ?? 0.2) * H;
  c.save();
  c.globalAlpha = Math.max(0, Math.min(1, n.opacity ?? 1));
  c.translate(x, y);
  c.rotate(((n.rotation ?? 0) * Math.PI) / 180);
  c.scale(n.scale ?? 1, n.scale ?? 1);
  c.fillStyle = n.fill ?? "#ffffff";
  c.strokeStyle = n.stroke ?? n.fill ?? "#ffffff";
  c.lineWidth = Math.max(1, (n.strokeWidth ?? 0.002) * H);
  if (n.type === "rect") {
    c.beginPath();
    c.roundRect(
      -w / 2,
      -h / 2,
      Math.max(0, w),
      Math.max(0, h),
      Math.min(Math.abs(w / 2), Math.abs(h / 2), (n.radius ?? 0.01) * H),
    );
    if (n.fill) c.fill();
    if (n.stroke) c.stroke();
  }
  if (n.type === "ellipse") {
    c.beginPath();
    c.ellipse(0, 0, Math.max(0, w / 2), Math.max(0, h / 2), 0, 0, Math.PI * 2);
    if (n.fill) c.fill();
    if (n.stroke) c.stroke();
  }
  if (n.type === "text") {
    const size = n.fontSize * H,
      weight = Math.round((n.weight ?? 600) / 100) * 100;
    c.font = `${weight} ${size}px "Studio Sans", Arial, sans-serif`;
    c.textBaseline = "middle";
    c.textAlign = n.align ?? "center";
    const rows = n.text.split("\n").flatMap((s) => lines(c, s, Math.abs(w)));
    const leading = size * (n.leading ?? 1.2);
    rows.forEach((s, i) =>
      c.fillText(
        s,
        n.align === "left" ? -w / 2 : n.align === "right" ? w / 2 : 0,
        (i - (rows.length - 1) / 2) * leading,
      ),
    );
  }
  if (n.type === "image") {
    const image = assets[n.asset];
    if (image) {
      c.save();
      c.beginPath();
      c.rect(-w / 2, -h / 2, w, h);
      c.clip();
      const k =
        n.fit === "contain"
          ? Math.min(w / image.width, h / image.height)
          : Math.max(w / image.width, h / image.height);
      c.drawImage(
        image,
        (-image.width * k) / 2,
        (-image.height * k) / 2,
        image.width * k,
        image.height * k,
      );
      c.restore();
    }
  }
  if (n.type === "path" || n.type === "line") {
    const pts = n.points.map(([px, py]) => [px * W, py * H]);
    const lengths = pts
      .slice(1)
      .map((v, i) => Math.hypot(v[0] - pts[i][0], v[1] - pts[i][1]));
    let remaining =
      lengths.reduce((a, b) => a + b, 0) *
      Math.max(0, Math.min(1, n.progress ?? 1));
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length && remaining > 0; i++) {
      const amount = Math.min(1, remaining / Math.max(0.001, lengths[i - 1]));
      c.lineTo(
        pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * amount,
        pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * amount,
      );
      remaining -= lengths[i - 1];
    }
    c.stroke();
  }
  if (n.type === "particles") {
    const rand = seeded(n.seed ?? 42);
    for (let i = 0; i < n.count; i++) {
      const phase = rand() * Math.PI * 2,
        r = rand(),
        speed = 0.04 + rand() * 0.12;
      const angle = phase + t * speed * (n.speed ?? 1);
      const px = (Math.cos(angle) * r * w) / 2,
        py = (Math.sin(angle) * r * h) / 2;
      const size = (n.size ?? 0.003) * H * (0.4 + rand());
      c.beginPath();
      c.arc(px, py, Math.max(0.3, size), 0, Math.PI * 2);
      c.fill();
    }
  }
  c.restore();
}
export function drawComposition(
  c,
  project,
  scene,
  time,
  assets,
  cues,
  options = {},
) {
  const W = c.canvas.width,
    H = c.canvas.height,
    local = time - scene.start,
    composition = scene.composition;
  c.save();
  c.fillStyle = composition.background;
  c.fillRect(0, 0, W, H);
  if (local < 0.7 && composition.transition === "iris") {
    c.beginPath();
    c.arc(W / 2, H / 2, Math.hypot(W, H) * ease(local / 0.7), 0, 2 * Math.PI);
    c.clip();
  }
  if (local < 0.5 && composition.transition === "wipe") {
    c.beginPath();
    c.rect(0, 0, W * ease(local / 0.5), H);
    c.clip();
  }
  c.save();
  const camera = evaluate(composition.camera ?? {}, local);
  c.translate(W / 2, H / 2);
  c.scale(camera.zoom ?? 1, camera.zoom ?? 1);
  c.rotate(((camera.rotation ?? 0) * Math.PI) / 180);
  c.translate(-(camera.x ?? 0.5) * W, -(camera.y ?? 0.5) * H);
  for (const layer of composition.layers)
    paintLayer(c, layer, local, W, H, assets);
  c.restore();
  if (options.captions !== false) {
    const cue = cues?.find((x) => time >= x.start && time < x.end);
    if (cue) {
      const size = H * (W < H ? 0.024 : 0.028);
      c.font = `500 ${size}px "Studio Sans", Arial`;
      const rows = lines(c, cue.text, W * 0.86);
      const lineHeight = size * 1.3,
        h = rows.length * lineHeight + size;
      c.fillStyle = "#07110de8";
      c.beginPath();
      c.roundRect(W * 0.04, H * 0.94 - h, W * 0.92, h, 8);
      c.fill();
      c.fillStyle = "#f4f6f1";
      c.textAlign = "center";
      c.textBaseline = "middle";
      rows.forEach((s, i) =>
        c.fillText(s, W / 2, H * 0.94 - h + size * 0.8 + i * lineHeight),
      );
    }
  }
  // Evidence is a separate readable overlay, never baked into a generated image.
  if (scene.note) {
    c.font = `400 ${H * (W < H ? 0.011 : 0.015)}px "Studio Sans", Arial`;
    c.fillStyle = "#c3d2c9";
    c.textAlign = "left";
    c.textBaseline = "bottom";
    c.fillText(scene.note, W * 0.045, H * 0.985, W * 0.91);
  }
  c.restore();
}
