import path from "node:path";
import { writeFile, copyFile } from "node:fs/promises";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { renderContext, reviewState, writeJSON, graphics } from "./lib.mjs";
import { renderBlenderShot } from "../src/blender.mjs";
import { timeline } from "../src/model.mjs";
import { reviewSamples, imageDiagnostics } from "../src/shot-diagnostics.mjs";
const { p, out } = await renderContext({ backend: "blender" });
if (!reviewState(p).storyApproved) throw new Error("请先确认故事与分镜");
await graphics(p); // Register the studio's fonts, including Chinese.
const shots = timeline(p);
const requested = process.argv.indexOf("--scenes");
const ids =
  requested >= 0
    ? process.argv[requested + 1].split(",")
    : shots.map((s) => s.id);
if (ids.some((id) => !shots.some((s) => s.id === id)))
  throw new Error("Unknown shot");
const reports = [];
const diagnostics = [];
for (const [i, s] of shots.filter((s) => ids.includes(s.id)).entries()) {
  await writeJSON(path.join(out, "progress.json"), {
    phase: "blender",
    progress: Math.round((i / ids.length) * 95),
    message: `Blender 正在制作关键帧 ${i + 1} / ${ids.length} · ${s.title}`,
  });
  const frames = reviewSamples(s, p.fps),
    frame = frames[Math.floor(frames.length / 2)];
  const report = await renderBlenderShot({
    scene: s,
    out,
    width: p.width,
    height: p.height,
    fps: p.fps,
    frames,
  });
  await copyFile(
    path.join(report.folder, `frame-${String(frame).padStart(5, "0")}.png`),
    path.join(out, `frame-${s.id}.png`),
  );
  reports.push({ sceneId: s.id, ...report });
  const strip = createCanvas(1440, 305),
    sc = strip.getContext("2d");
  sc.fillStyle = "#18201d";
  sc.fillRect(0, 0, strip.width, strip.height);
  for (const [index, f] of frames.entries()) {
    const img = await loadImage(
      path.join(report.folder, `frame-${String(f).padStart(5, "0")}.png`),
    );
    sc.drawImage(img, index * 480, 0, 480, 270);
    sc.fillStyle = "#efeadc";
    sc.font = "16px 'Microsoft YaHei', Arial";
    sc.fillText(
      `${s.id} · ${["开始", "中段", "结束"][index]} · ${((f - 1) / p.fps).toFixed(2)}s`,
      index * 480 + 10,
      293,
    );
    const probe = createCanvas(160, 90);
    probe.getContext("2d").drawImage(img, 0, 0, 160, 90);
    diagnostics.push({
      sceneId: s.id,
      frame: f,
      ...imageDiagnostics(probe.data()),
      cameraFindings:
        report.cameraDiagnostics?.filter((w) => w.frame === f) ?? [],
    });
  }
  await writeFile(
    path.join(out, `review-strip-${s.id}.jpg`),
    await strip.encode("jpeg", 90),
  );
}
await writeJSON(path.join(out, "frame-diagnostics.json"), {
  scope:
    "Beginning, review midpoint and ending stills; no natural-motion or listening verdict",
  frames: diagnostics,
});
if (ids.length === shots.length) {
  const sheet = createCanvas(1200, Math.ceil(shots.length / 2) * 380),
    c = sheet.getContext("2d");
  c.fillStyle = "#18201d";
  c.fillRect(0, 0, sheet.width, sheet.height);
  for (let i = 0; i < shots.length; i++) {
    const x = (i % 2) * 600,
      y = Math.floor(i / 2) * 380;
    c.drawImage(
      await loadImage(path.join(out, `frame-${shots[i].id}.png`)),
      x + 10,
      y + 10,
      580,
      326,
    );
    c.fillStyle = "#efeadc";
    c.font = "17px 'Microsoft YaHei', Arial";
    c.fillText(
      `${i + 1} · ${shots[i].title} · 3D 预演稿`,
      x + 12,
      y + 360,
      575,
    );
  }
  await writeFile(
    path.join(out, "storyboard.jpg"),
    await sheet.encode("jpeg", 90),
  );
}
await writeJSON(path.join(out, "blender-stills.json"), {
  stage: "blocking",
  reports,
  checks: {
    geometry: "rendered",
    rig: "articulated prototype",
    naturalMotion: "not checked",
    audio: "not checked",
    asr: "not checked",
  },
});
await writeJSON(path.join(out, "progress.json"), {
  phase: "complete",
  progress: 100,
  message: "Blender 关键帧已生成；这是角色与空间预演稿，待画面审阅。",
});
console.log(out);
