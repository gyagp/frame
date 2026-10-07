// Attach to an existing full-film job without restarting or changing its renderer.
import path from "node:path";
import {
  readFile,
  readdir,
  stat,
  writeFile,
  rename,
  unlink,
} from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { ROOT, projectDir } from "./lib.mjs";
import { frameProgress, progressMessage } from "../src/render-progress.mjs";
const [id, jobId] = process.argv.slice(2),
  once = process.argv.includes("--once");
projectDir(id);
if (!/^[a-f0-9-]{36}$/.test(jobId ?? "")) throw new Error("Invalid job ID");
const base = `http://127.0.0.1:${Number(process.env.PORT || 4173)}`;
let failures = 0;
async function update() {
  const response = await fetch(`${base}/api/projects/${id}/job`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Progress service unavailable");
  const job = await response.json();
  if (job?.id !== jobId || job.status !== "running" || job.type !== "render")
    return false;
  if (!/^[a-f0-9]{16}$/.test(job.outputKey ?? "")) return true;
  const out = path.join(ROOT, "outputs", id, job.outputKey),
    progressFile = path.join(out, "progress.json");
  let original;
  try {
    original = await readFile(progressFile, "utf8");
  } catch (e) {
    if (e.code === "ENOENT") return true;
    throw e;
  }
  const current = JSON.parse(original);
  if (current.progress >= 90 || current.phase === "complete") return true;
  const p = JSON.parse(await readFile(path.join(out, "project.json"), "utf8"));
  const startedAt = Date.parse(job.startedAt);
  if (
    p.id !== id ||
    p.production?.backend !== "blender" ||
    !Number.isFinite(startedAt)
  )
    return false;
  let activeIndex = -1;
  if (current.message?.startsWith("Blender 渲染动画 · "))
    activeIndex = p.scenes.findIndex(
      (s) => current.message === `Blender 渲染动画 · ${s.title}`,
    );
  if (current.observer?.jobId === jobId)
    activeIndex = Math.max(
      activeIndex,
      p.scenes.findIndex((s) => s.id === current.observer.activeSceneId),
    );
  // A new manifest identifies the current shot even if the native worker changed
  // phase while this observer was collecting file stats.
  for (const [i, s] of p.scenes.entries()) {
    try {
      const m = await stat(path.join(out, "blender", s.id, "manifest.json"));
      if (m.mtimeMs > startedAt) activeIndex = Math.max(activeIndex, i);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  if (activeIndex < 0) return true; // Narration or initial scene preparation.
  const folder = path.join(out, "blender", p.scenes[activeIndex].id);
  let names = [];
  try {
    names = await readdir(folder);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const files = [];
  for (const name of names) {
    const match = name.match(/^frame-(\d{5})\.png$/);
    if (!match) continue;
    const info = await stat(path.join(folder, name));
    files.push({
      frame: Number(match[1]),
      mtime: info.mtimeMs,
      size: info.size,
    });
  }
  const state = frameProgress({
    scenes: p.scenes,
    fps: p.fps,
    activeIndex,
    files,
    startedAt,
  });
  // Do not overwrite a newly published worker state after the filesystem scan.
  if ((await readFile(progressFile, "utf8")) !== original) return true;
  const next = {
    ...current,
    progress: Math.max(current.progress ?? 0, state.progress),
    message: progressMessage(p.scenes[activeIndex].title, state),
    observer: {
      jobId,
      ...state,
      observedAt: new Date().toISOString(),
      scope:
        "Completed picture frames; ETA excludes encoding and varies by shot",
    },
  };
  const tmp = path.join(out, `progress-${jobId}-${process.pid}.tmp`);
  try {
    await writeFile(tmp, JSON.stringify(next, null, 2) + "\n");
    await rename(tmp, progressFile);
  } finally {
    await unlink(tmp).catch((e) => {
      if (e.code !== "ENOENT") throw e;
    });
  }
  if (once) console.log(JSON.stringify(next, null, 2));
  return true;
}
if (!once) console.log(`Live progress attached: ${id} / ${jobId}`);
do {
  try {
    if (!(await update())) break;
    failures = 0;
  } catch (e) {
    if (++failures >= 6) throw e;
  }
  if (once) break;
  await delay(5000);
} while (true);
