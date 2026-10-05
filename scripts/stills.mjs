import path from "node:path";
import { writeFile } from "node:fs/promises";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { renderContext, graphics } from "./lib.mjs";
import { drawFrame } from "../src/film.mjs";
import { timeline } from "../src/model.mjs";
import { reviewTime } from "../src/engine/review.mjs";
const { p, out } = await renderContext();
const { canvas, assets } = await graphics(p);
const c = canvas.getContext("2d");
const shots = timeline(p);
const sheet = createCanvas(1200, Math.ceil(shots.length / 2) * 380);
const ctx = sheet.getContext("2d");
ctx.fillStyle = "#10151c";
ctx.fillRect(0, 0, sheet.width, sheet.height);
for (let i = 0; i < shots.length; i++) {
  const s = shots[i],
    t = s.start + reviewTime(s, 6);
  drawFrame(c, p, t, assets, null, { captions: false });
  const png = await canvas.encode("png");
  await writeFile(path.join(out, `frame-${s.id}.png`), png);
  const still = await loadImage(png);
  const x = (i % 2) * 600,
    y = Math.floor(i / 2) * 380;
  ctx.drawImage(still, x + 10, y + 10, 580, 326);
  ctx.fillStyle = "#f0f4ee";
  ctx.font = "17px Arial";
  ctx.fillText(
    `${String(i + 1).padStart(2, "0")} · ${s.start}s · ${s.title.replaceAll("\n", " ")}`,
    x + 12,
    y + 362,
    574,
  );
}
await writeFile(
  path.join(out, "storyboard.jpg"),
  await sheet.encode("jpeg", 88),
);
console.log(path.join(out, "storyboard.jpg"));
