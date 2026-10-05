// A script-only review package: no approvals, image generation, or rendering.
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { loadProject, projectDir } from "./lib.mjs";
import { timeline, duration } from "../src/model.mjs";
import { SHOT_DIRECTION_FIELDS } from "../src/engine/shot-plan.mjs";

const id = process.argv[2];
if (!id) throw new Error("Usage: node scripts/story-review.mjs <project-id>");
const p = await loadProject(id);
const escape = (s = "") =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
const time = (t) =>
  `${Math.floor(t / 60)}`.padStart(2, "0") + ":" + `${t % 60}`.padStart(2, "0");
const fields = SHOT_DIRECTION_FIELDS;
const shots = timeline(p)
  .map(
    (s, i) => `<article id="${escape(s.id)}">
  <div class="shot-index"><span>${`${i + 1}`.padStart(2, "0")}</span><small>${time(s.start)} — ${time(s.end)}</small></div>
  <div class="shot-body"><h2>${escape(s.title)}</h2><p class="purpose">${escape(s.direction?.purpose || s.body)}</p>
    <div class="script"><small>${p.language === "zh" ? "中文旁白与对白" : "ENGLISH NARRATION"}</small><blockquote>${escape(s.narration)}</blockquote></div>
    <dl>${fields
      .filter(([key]) => s.direction?.[key])
      .map(
        ([key, label]) =>
          `<dt>${label}</dt><dd>${escape(s.direction[key])}</dd>`,
      )
      .join("")}</dl>
    <p class="evidence">${escape(s.note)}</p></div>
</article>`,
  )
  .join("\n");
const links = p.sources
  .filter((s) => s.url !== "assets/story-review.html")
  .map(
    (s) =>
      `<li><a href="${escape(s.url.startsWith("assets/") ? s.url.slice(7) : s.url)}">${escape(s.label)}</a></li>`,
  )
  .join("");
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(p.title)} · 故事审阅</title><style>
@font-face{font-family:Inter;src:url('/fonts/InterVariable.ttf')}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#0a1016;color:#f1eee7;font:16px/1.8 Inter,'Microsoft YaHei',sans-serif}a{color:#64d8cb;text-underline-offset:4px}main{max-width:1120px;margin:auto;padding:64px 36px}header{padding-bottom:48px;border-bottom:1px solid #29363e}.kicker{letter-spacing:.2em;color:#64d8cb;font-size:12px}h1{font-size:clamp(34px,5vw,60px);line-height:1.13;letter-spacing:-.04em;max-width:950px;margin:24px 0}h2{font-size:28px;line-height:1.3;letter-spacing:-.025em;margin:0 0 14px}p{margin:10px 0}.synopsis{max-width:790px;color:#b8c4cb;font-size:19px}.meta{display:flex;flex-wrap:wrap;gap:12px;margin:24px 0}.meta span{border:1px solid #34434d;border-radius:24px;padding:4px 13px;font-size:13px}.status{border-left:3px solid #dfa861;padding:10px 18px;color:#dcc49e;background:#171b1c;font-size:14px}.studio{display:inline-block;margin-top:24px;padding:10px 20px;border-radius:6px;background:#64d8cb;color:#0a1016;text-decoration:none;font-weight:600}.brief{padding:34px 0;border-bottom:1px solid #29363e}.brief h2{font-size:20px}.brief p{color:#afbcc4;font-size:14px}article{display:grid;grid-template-columns:140px minmax(0,1fr);gap:28px;padding:42px 0;border-bottom:1px solid #29363e}.shot-index span{display:block;font-size:50px;line-height:1.1;color:#64d8cb;font-weight:500}.shot-index small{display:block;color:#8c9ba8;font-size:12px;margin-top:15px}.purpose{color:#bcc8cf}.script{background:#131e26;border-left:3px solid #64d8cb;padding:20px 24px;margin:24px 0}.script small{font-size:10px;letter-spacing:.17em;color:#64d8cb}blockquote{margin:10px 0 0;font-size:19px;line-height:1.65}dl{display:grid;grid-template-columns:108px minmax(0,1fr);gap:10px 20px;margin:24px 0;font-size:14px}dt{color:#8c9ba8}dd{margin:0;color:#bdc9d0}.evidence{font-size:12px;color:#91a1ac;border-top:1px solid #26343c;padding-top:14px}footer{padding-top:32px;font-size:13px;color:#8c9ba8}footer li{margin:8px 0}footer ul{padding-left:18px}details summary{cursor:pointer}@media(max-width:650px){main{padding:32px 20px}article{grid-template-columns:1fr;gap:15px}.shot-index{display:flex;align-items:center;gap:20px}.shot-index span{font-size:30px}.shot-index small{margin:0}h2{font-size:23px}dl{grid-template-columns:1fr;gap:3px}dd{margin-bottom:12px}blockquote{font-size:17px}}
</style></head><body><main><header><div class="kicker">MOVIE STUDIO / STORY REVIEW</div><h1>${escape(p.title)}</h1><p class="synopsis">${escape(p.bible?.logline || p.idea)}</p><div class="meta"><span>${time(duration(p))}</span><span>${p.scenes.length} 个镜头</span><span>${escape(p.language)} · ${p.width} × ${p.height} · ${p.fps} fps</span><span>${escape(p.voice)}</span></div><div class="status">故事与分镜审阅稿。此页展示编排与设计意图，不是成片画面或已生成声音。确认顺序：故事 → 关键画面 → 有声短样片 → 全片。</div><a class="studio" href="/?project=${encodeURIComponent(p.id)}">在 Studio 审阅与确认 →</a></header>
<section class="brief"><h2>视觉与声音方向</h2><p>${escape(p.brief?.style)}</p><p>${escape(p.brief?.sound)}</p></section>
${shots}<footer><details><summary>查看来源与证据</summary><ul>${links}</ul></details><p>由 project.json 生成 · ${escape(new Date().toISOString())}。本页只展示剧本与镜头设计；不代表画面、声音或制作检查已经完成。</p></footer></main></body></html>`;
const folder = path.join(projectDir(id), "assets");
await mkdir(folder, { recursive: true });
await writeFile(path.join(folder, "story-review.html"), html);
console.log(
  JSON.stringify({
    id,
    seconds: duration(p),
    shots: p.scenes.length,
    file: path.join(folder, "story-review.html"),
  }),
);
