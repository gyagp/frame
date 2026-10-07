// Compare actual rendered revisions. This never writes approval fields.
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { loadProject, hashProject, ROOT, graphics, readJSON } from "./lib.mjs";
const [id, before, ...ids] = process.argv.slice(2);
if (!/^[a-f0-9]{16}$/.test(before ?? ""))
  throw new Error("Use a prior output fingerprint");
const p = await loadProject(id),
  out = path.join(ROOT, "outputs", id, hashProject(p));
const old = await readJSON(
  path.join(ROOT, "outputs", id, before, "project.json"),
);
if (
  old.id !== id ||
  !ids.length ||
  ids.some(
    (s) =>
      !p.scenes.some((x) => x.id === s) || !old.scenes.some((x) => x.id === s),
  )
)
  throw new Error("Comparison scene mismatch");
await graphics(p);
const sheet = createCanvas(1600, 96 + ids.length * 484 + 68),
  c = sheet.getContext("2d");
c.fillStyle = "#111b18";
c.fillRect(0, 0, sheet.width, sheet.height);
c.fillStyle = "#f0eddd";
c.font = "30px 'Microsoft YaHei', sans-serif";
c.fillText(`${p.title} · 画面修订对照`, 24, 45);
c.font = "18px 'Microsoft YaHei', sans-serif";
c.fillStyle = "#b5c4bc";
c.fillText("原预演", 24, 80);
c.fillText("当前修订 · 实际 Blender 渲染，仍需精修", 820, 80);
for (const [i, sceneId] of ids.entries()) {
  const y = 96 + i * 484;
  for (const [x, key] of [
    [16, before],
    [816, hashProject(p)],
  ])
    c.drawImage(
      await loadImage(
        path.join(ROOT, "outputs", id, key, `frame-${sceneId}.png`),
      ),
      x,
      y,
      768,
      432,
    );
  c.fillStyle = "#f0eddd";
  c.font = "20px 'Microsoft YaHei', sans-serif";
  c.fillText(
    `${sceneId} · ${p.scenes.find((s) => s.id === sceneId).title}`,
    24,
    y + 465,
  );
}
c.fillStyle = "#b5c4bc";
c.font = "15px 'Microsoft YaHei', sans-serif";
c.fillText(
  "马体原始网格与纹理：jjmoser · Horse lowpoly · CC-BY 3.0 · opengameart.org/content/horse-lowpoly",
  24,
  sheet.height - 39,
);
c.fillText(
  "本对照不证明动画自然度、真实动物行为或音画同步；关键帧与样片审批尚未通过。",
  24,
  sheet.height - 15,
);
await writeFile(
  path.join(out, "look-review.jpg"),
  await sheet.encode("jpeg", 91),
);
console.log(path.join(out, "look-review.jpg"));
