import http from "node:http";
import path from "node:path";
import {
  readFile,
  writeFile,
  readdir,
  mkdir,
  rename,
  stat,
} from "node:fs/promises";
import { createReadStream } from "node:fs";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
  ROOT,
  projectDir,
  loadProject,
  hashProject,
  readJSON,
  writeJSON,
  run,
  storySignature,
  reviewState,
  displayOutputHash,
} from "./scripts/lib.mjs";
import { assertProject, duration } from "./src/model.mjs";
import { createPresetProject as createProject } from "./src/presets.mjs";
import { configured, models, makeImage, planFilm } from "./src/google.mjs";
import { azureConfigured } from "./src/azure.mjs";
import { compileMotion, critiqueFrames } from "./src/engine/director.mjs";
import {
  getSettings,
  publicSettings,
  saveSettings,
  prepareSettings,
  preferredVoice,
  speechConfigured,
  imageConfigured,
  speechEnvironment,
  redactError,
} from "./src/settings.mjs";
import { testConnection } from "./src/connections.mjs";

const PORT = Number(process.env.PORT || 4173),
  jobs = new Map(),
  locks = new Set();
const json = (res, status, value) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
};
async function body(req, max = 12 * 1024 * 1024) {
  const parts = [];
  let size = 0;
  for await (const part of req) {
    size += part.length;
    if (size > max) throw new Error("上传内容过大");
    parts.push(part);
  }
  return Buffer.concat(parts);
}
async function parsed(req) {
  return JSON.parse((await body(req)).toString("utf8"));
}
async function save(p) {
  assertProject(p);
  const dir = projectDir(p.id);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, "project.json");
  try {
    const old = await readJSON(file);
    if (hashProject(old) !== hashProject(p))
      await writeJSON(
        path.join(dir, "revisions", `${Date.now()}-${hashProject(old)}.json`),
        old,
      );
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const tmp = path.join(dir, `${randomUUID()}.tmp`);
  await writeJSON(tmp, p);
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(tmp, file);
      break;
    } catch (e) {
      if (
        process.platform !== "win32" ||
        !["EPERM", "EBUSY", "EACCES"].includes(e.code) ||
        attempt >= 5
      )
        throw e;
      await delay(25 * 2 ** attempt);
    }
  }
  return p;
}
async function startJob(id, type, task) {
  if (locks.has(id)) throw new Error("这个作品已有任务在运行，请等待完成。");
  locks.add(id);
  const job = {
    id: randomUUID(),
    projectId: id,
    type,
    status: "running",
    progress: 0,
    message: "正在准备",
    startedAt: new Date().toISOString(),
  };
  jobs.set(id, job);
  await writeJSON(path.join(projectDir(id), "render-state.json"), job);
  (async () => {
    try {
      await task(job);
      job.status = "complete";
      job.progress = 100;
    } catch (e) {
      job.status = "failed";
      job.message = redactError(e.message);
      console.error(`${type}: ${job.message}`);
    } finally {
      locks.delete(id);
      job.finishedAt = new Date().toISOString();
      await writeJSON(path.join(projectDir(id), "render-state.json"), job);
    }
  })();
  return job;
}
async function jobStatus(id) {
  let job = jobs.get(id);
  if (!job) {
    try {
      job = await readJSON(path.join(projectDir(id), "render-state.json"));
      if (job.status === "running") {
        job.status = "failed";
        job.message = "上次任务因 studio 重启而中断，可以重新运行。";
      }
    } catch {
      return null;
    }
  }
  if (job.outputKey && job.status === "running") {
    try {
      const progress = await readJSON(
        path.join(ROOT, "outputs", id, job.outputKey, "progress.json"),
      );
      Object.assign(job, {
        progress: progress.progress,
        message: progress.message,
      });
    } catch {}
  }
  return job;
}
async function listProjects() {
  let dirs = [];
  try {
    dirs = await readdir(path.join(ROOT, "projects"), { withFileTypes: true });
  } catch {}
  const result = [];
  for (const dir of dirs.filter((d) => d.isDirectory())) {
    try {
      const p = await loadProject(dir.name);
      result.push({
        id: p.id,
        title: p.title,
        theme: p.theme,
        language: p.language,
        duration: duration(p),
        scenes: p.scenes.length,
        createdAt: p.createdAt,
      });
    } catch {}
  }
  return result.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
async function file(res, req, target) {
  const st = await stat(target);
  if (!st.isFile())
    throw Object.assign(new Error("Not found"), { status: 404 });
  const ext = path.extname(target);
  const mime =
    {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".mjs": "text/javascript; charset=utf-8",
      ".json": "application/json",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".mp4": "video/mp4",
      ".wav": "audio/wav",
      ".srt": "text/plain; charset=utf-8",
      ".ttf": "font/ttf",
      ".txt": "text/plain; charset=utf-8",
      ".md": "text/plain; charset=utf-8",
    }[ext] ?? "application/octet-stream";
  const headers = {
    "Content-Type": mime,
    "Cache-Control": "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
  };
  let start = 0,
    end = st.size - 1,
    code = 200;
  if (req.headers.range) {
    const m = req.headers.range.match(/^bytes=(\d+)-(\d*)$/);
    if (!m) {
      res.writeHead(416, { "Content-Range": `bytes */${st.size}` });
      res.end();
      return;
    }
    start = Number(m[1]);
    end = m[2] ? Math.min(Number(m[2]), end) : end;
    if (start > end || start >= st.size) {
      res.writeHead(416, { "Content-Range": `bytes */${st.size}` });
      res.end();
      return;
    }
    code = 206;
    headers["Content-Range"] = `bytes ${start}-${end}/${st.size}`;
  }
  headers["Content-Length"] = end - start + 1;
  res.writeHead(code, headers);
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(target, { start, end }).pipe(res);
}
const server = http.createServer(async (req, res) => {
  try {
    if (
      ![`127.0.0.1:${PORT}`, `localhost:${PORT}`].includes(req.headers.host)
    ) {
      json(res, 403, { error: "Local access only" });
      return;
    }
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const pathname = decodeURIComponent(url.pathname);
    if (req.method !== "GET" && req.method !== "HEAD") {
      if (
        req.headers["x-studio-client"] !== "local" ||
        (req.headers.origin &&
          !["http://127.0.0.1:" + PORT, "http://localhost:" + PORT].includes(
            req.headers.origin,
          ))
      ) {
        json(res, 403, { error: "Local studio request required" });
        return;
      }
    }
    if (pathname === "/api/config") {
      json(res, 200, {
        google: configured(),
        director: configured(),
        image: imageConfigured(),
        speech: speechConfigured(),
        azure: speechConfigured(),
        providers: {
          director: getSettings().director.provider,
          image: getSettings().google.imageMode,
          speech: getSettings().speech.provider,
        },
        models,
        version: "0.1.0",
        platform: process.platform,
      });
      return;
    }
    if (pathname === "/api/settings" && req.method === "GET") {
      json(res, 200, publicSettings());
      return;
    }
    if (pathname === "/api/settings" && req.method === "PUT") {
      if (locks.size)
        throw new Error("有作品正在制作，请完成后再修改连接设置。");
      json(res, 200, await saveSettings(await parsed(req)));
      return;
    }
    if (pathname === "/api/settings/test" && req.method === "POST") {
      const input = await parsed(req);
      json(
        res,
        200,
        await testConnection(
          input.kind,
          input.settings ? { settings: prepareSettings(input.settings) } : {},
        ),
      );
      return;
    }
    if (pathname === "/api/projects" && req.method === "GET") {
      json(res, 200, await listProjects());
      return;
    }
    if (pathname === "/api/projects" && req.method === "POST") {
      const input = await parsed(req);
      if (typeof input.title !== "string" || !input.title.trim())
        input.title =
          typeof input.idea === "string"
            ? input.idea.split(/[。.!?\n]/)[0].slice(0, 40)
            : "";
      if (!input.title) throw new Error("请描述你想拍的电影");
      const id = `film-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;
      const p = createProject(input, id);
      if (!speechConfigured())
        p.voice =
          p.language === "zh"
            ? "Microsoft Huihui Desktop"
            : "Microsoft David Desktop";
      else if (!input.brief?.voiceTone || input.brief.voiceTone === "auto")
        p.voice = preferredVoice(p.language);
      p.targetDuration = Math.max(
        30,
        Math.min(180, Number(input.targetDuration) || 90),
      );
      await save(p);
      json(res, 201, p);
      return;
    }
    const route = pathname.match(/^\/api\/projects\/([a-z0-9-]+)(?:\/(.*))?$/);
    if (route) {
      const id = route[1],
        action = route[2] ?? "";
      projectDir(id);
      if (!action && req.method === "GET") {
        json(res, 200, await loadProject(id));
        return;
      }
      if (!action && req.method === "PUT") {
        if (locks.has(id) && jobs.get(id)?.type === "prepare")
          throw new Error("正在准备画面，请完成后再修改分镜。");
        const p = await parsed(req);
        if (p.id !== id) throw new Error("Project ID mismatch");
        const existing = await loadProject(id);
        p.review = existing.review;
        json(res, 200, await save(p));
        return;
      }
      if (action === "review" && req.method === "GET") {
        json(res, 200, reviewState(await loadProject(id)));
        return;
      }
      if (
        ["approve-story", "approve-frames", "approve-sample"].includes(
          action,
        ) &&
        req.method === "POST"
      ) {
        if (locks.has(id)) throw new Error("请等待当前任务完成后再确认。");
        const p = await loadProject(id);
        p.review ??= {};
        const state = reviewState(p),
          out = path.join(ROOT, "outputs", id, hashProject(p));
        if (action === "approve-story") {
          p.review.story = storySignature(p);
          p.review.frames = null;
          p.review.sample = null;
        }
        if (action === "approve-frames") {
          if (!state.storyApproved) throw new Error("请先确认故事与分镜");
          await stat(path.join(out, "storyboard.jpg"));
          p.review.frames = hashProject(p);
          p.review.sample = null;
        }
        if (action === "approve-sample") {
          if (!state.framesApproved) throw new Error("请先确认关键画面");
          await stat(path.join(out, "sample.mp4"));
          p.review.sample = hashProject(p);
        }
        await save(p);
        json(res, 200, reviewState(p));
        return;
      }
      if (action === "job" && req.method === "GET") {
        json(res, 200, await jobStatus(id));
        return;
      }
      if (action === "revisions" && req.method === "GET") {
        let files = [];
        try {
          files = await readdir(path.join(projectDir(id), "revisions"));
        } catch {}
        json(
          res,
          200,
          files
            .filter((x) => x.endsWith(".json"))
            .sort()
            .reverse()
            .slice(0, 30),
        );
        return;
      }
      if (action === "restore" && req.method === "POST") {
        if (locks.has(id)) throw new Error("请先等待当前任务结束");
        const { revision } = await parsed(req);
        if (!/^\d+-[a-f0-9]+\.json$/.test(revision))
          throw new Error("Invalid revision");
        const p = await readJSON(
          path.join(projectDir(id), "revisions", revision),
        );
        if (p.id !== id) throw new Error("Revision mismatch");
        await save(p);
        json(res, 200, p);
        return;
      }
      if (action === "assets" && req.method === "GET") {
        let files = [];
        try {
          files = await readdir(path.join(projectDir(id), "assets"));
        } catch {}
        const assets = [];
        for (const name of files.filter((x) =>
          /\.(png|jpe?g|txt|md)$/i.test(x),
        )) {
          let meta = {};
          try {
            meta = await readJSON(
              path.join(projectDir(id), "assets", name + ".json"),
            );
          } catch {}
          assets.push({ ...meta, file: `assets/${name}` });
        }
        json(res, 200, assets);
        return;
      }
      if (action === "upload" && req.method === "POST") {
        await loadProject(id);
        const bytes = await body(req);
        let ext;
        if (
          bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        )
          ext = "png";
        else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
          ext = "jpg";
        else if (
          ["text/plain", "text/markdown"].includes(req.headers["content-type"])
        )
          ext = "txt";
        else throw new Error("支持 PNG、JPEG 图片和 TXT / Markdown 素材。");
        const name = `upload-${randomUUID()}.${ext}`;
        const dir = path.join(projectDir(id), "assets");
        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, name), bytes);
        json(res, 201, { file: `assets/${name}` });
        return;
      }
      if (action === "generate-image" && req.method === "POST") {
        const input = await parsed(req);
        const p = await loadProject(id);
        const job = await startJob(id, "image", async (j) => {
          j.message = "Nano Banana 正在生成画面";
          j.asset = await makeImage(id, {
            ...input,
            theme: p.theme,
            paletteOverride: p.brief?.paletteOverride === "true",
            aspect: p.width < p.height ? "9:16" : "16:9",
            style: p.brief?.style || "technical editorial",
          });
          j.message = "画面已加入素材库，选择镜头后即可使用";
        });
        json(res, 202, job);
        return;
      }
      if (action === "plan" && req.method === "POST") {
        const p = await loadProject(id);
        const job = await startJob(id, "plan", async (j) => {
          j.message = "AI 导演正在编排故事、镜头和旁白";
          const next = { ...p, ...(await planFilm(p)) };
          assertProject(next);
          if (hashProject(await loadProject(id)) !== hashProject(p))
            throw new Error("生成期间作品已修改，请保留当前版本并重新生成");
          await save(next);
          j.message = "分镜与创作设定已完成，请预览并调整";
        });
        json(res, 202, job);
        return;
      }
      if (action === "revise-shot" && req.method === "POST") {
        const p = await loadProject(id),
          input = await parsed(req);
        const scene = p.scenes.find((s) => s.id === input.sceneId);
        if (
          !scene ||
          typeof input.feedback !== "string" ||
          input.feedback.length < 3 ||
          input.feedback.length > 2000
        )
          throw new Error("请选择镜头并描述想如何修改");
        const job = await startJob(id, "revise", async (j) => {
          j.message = "导演正在调整当前镜头的编排与动画";
          const [result] = await compileMotion(p, [scene], input.feedback);
          if (hashProject(await loadProject(id)) !== hashProject(p))
            throw new Error("作品已修改，请重新发起镜头改稿");
          Object.assign(scene, result);
          await save(p);
          j.message = "镜头已更新；故事保留，画面需要重新确认";
        });
        json(res, 202, job);
        return;
      }
      if (action === "quality" && req.method === "GET") {
        try {
          const p = await loadProject(id),
            q = await readJSON(
              path.join(ROOT, "outputs", id, hashProject(p), "quality.json"),
            );
          json(res, 200, q);
        } catch {
          json(res, 200, null);
        }
        return;
      }
      if (action === "critique" && req.method === "POST") {
        const p = await loadProject(id);
        const job = await startJob(id, "critique", async (j) => {
          const key = hashProject(p),
            out = path.join(ROOT, "outputs", id, key);
          await mkdir(out, { recursive: true });
          await writeJSON(path.join(out, "project.json"), p);
          j.message = "正在渲染实际画面供 AI 审片";
          await run(process.execPath, [
            path.join(ROOT, "scripts", "stills.mjs"),
            id,
            "--snapshot",
            path.join(out, "project.json"),
          ]);
          j.message = "AI 导演正在检查构图、可读性和连续性";
          await writeJSON(
            path.join(out, "quality.json"),
            await critiqueFrames(p, out),
          );
          j.outputKey = key;
          j.outputBase = `/outputs/${id}/${key}`;
          j.message = "画面审阅完成，请查看具体建议";
        });
        json(res, 202, job);
        return;
      }
      if (action === "prepare" && req.method === "POST") {
        let p = await loadProject(id);
        if (!reviewState(p).storyApproved)
          throw new Error("请先确认故事与分镜");
        const job = await startJob(id, "prepare", async (j) => {
          const missing =
            getSettings().google.imageMode === "uploads"
              ? []
              : p.scenes.filter(
                  (s) => ["title", "image"].includes(s.kind) && !s.image,
                );
          let firstImage = p.scenes.find((s) => s.image)?.image;
          for (let i = 0; i < missing.length; i++) {
            const s = missing[i];
            j.message = `正在生成电影画面 ${i + 1} / ${missing.length}`;
            j.progress = 8 + Math.floor((i / Math.max(1, missing.length)) * 55);
            const a = await makeImage(id, {
              prompt:
                (s.imagePrompt ||
                  `${p.idea}. Visualize: ${s.title}. ${s.body}`) +
                `\nContinuity bible: ${JSON.stringify(p.bible ?? {})}`,
              theme: p.theme,
              paletteOverride: p.brief?.paletteOverride === "true",
              aspect: p.width < p.height ? "9:16" : "16:9",
              style: p.brief?.style || "technical editorial",
              referenceImage: firstImage,
            });
            s.image = a.file;
            firstImage ??= a.file;
            await save(p);
          }
          if (firstImage)
            for (const s of p.scenes.filter(
              (s) => s.kind === "closing" && !s.image,
            ))
              s.image = firstImage;
          const needsMotion = p.scenes.filter(
            (s) =>
              ["title", "card", "image", "closing"].includes(s.kind) &&
              !s.composition,
          );
          if (needsMotion.length && configured()) {
            j.message = "摄影与动画设计：把分镜编排为可执行的 2D 镜头";
            j.progress = 68;
            const alreadyDone = p.scenes.filter((s) => s.composition).length;
            await compileMotion(p, needsMotion, "", {
              onProgress: ({ sceneId, index, phase }) => {
                const label =
                  phase === "writing" ? "正在编写动画" : "正在设计镜头";
                j.message = `${label} ${alreadyDone + index + 1} / ${alreadyDone + needsMotion.length} · ${p.scenes.find((s) => s.id === sceneId).title}（完成即保存）`;
                j.progress = 68 + Math.floor((index / needsMotion.length) * 18);
              },
              onCompiled: async (shot, { index }) => {
                Object.assign(
                  p.scenes.find((s) => s.id === shot.id),
                  shot,
                );
                await save(p);
                j.completedScenes = p.scenes.filter(
                  (s) => s.composition,
                ).length;
                j.progress =
                  68 + Math.floor(((index + 1) / needsMotion.length) * 18);
                await writeJSON(
                  path.join(projectDir(id), "render-state.json"),
                  j,
                );
              },
            });
          }
          await save(p);
          const key = hashProject(p),
            out = path.join(ROOT, "outputs", id, key);
          await mkdir(out, { recursive: true });
          await writeJSON(path.join(out, "project.json"), p);
          j.outputKey = key;
          j.projectHash = key;
          j.message = "正在制作分镜与关键画面总览";
          const result = await run(process.execPath, [
            path.join(ROOT, "scripts", "stills.mjs"),
            id,
            "--snapshot",
            path.join(out, "project.json"),
          ]);
          await writeFile(
            path.join(out, "stills.log"),
            result.out + "\n" + result.err,
          );
          j.outputBase = `/outputs/${id}/${key}`;
          if (configured()) {
            j.message = "AI 导演正在审阅实际渲染的关键画面";
            try {
              await writeJSON(
                path.join(out, "quality.json"),
                await critiqueFrames(p, out),
              );
            } catch (e) {
              await writeJSON(path.join(out, "quality.json"), {
                summary: "AI 画面审阅暂未完成：" + e.message,
                findings: [],
                scope: "Not reviewed",
                projectHash: key,
              });
            }
          }
          j.message = "关键画面已就绪，请检查审阅建议并确认后生成短样片";
        });
        json(res, 202, job);
        return;
      }
      if (
        ["render", "audio", "stills", "sample"].includes(action) &&
        req.method === "POST"
      ) {
        const p = await loadProject(id),
          key = hashProject(p),
          out = path.join(ROOT, "outputs", id, key);
        await mkdir(out, { recursive: true });
        await writeJSON(path.join(out, "project.json"), p);
        const state = reviewState(p);
        if (action === "render" && !state.sampleApproved)
          throw new Error("请先确认分镜、关键画面和短样片，再制作全片。");
        if (action === "sample" && !state.framesApproved)
          throw new Error("请先确认故事与关键画面，再制作样片。");
        const input = action === "sample" ? await parsed(req) : {};
        const sampleStart = Math.max(
          0,
          Math.min(duration(p) - 4, Number(input.start) || 0),
        );
        const job = await startJob(id, action, async (j) => {
          j.outputKey = key;
          j.projectHash = key;
          j.message = "正在准备电影";
          const script = action === "stills" ? "stills.mjs" : "render.mjs";
          const args = [
            path.join(ROOT, "scripts", script),
            id,
            "--snapshot",
            path.join(out, "project.json"),
          ];
          if (action === "audio") args.push("--audio-only");
          if (action === "sample")
            args.push(
              "--sample",
              "--start",
              String(sampleStart),
              "--length",
              "12",
            );
          const result = await run(process.execPath, args, {
            env: speechEnvironment(),
          });
          await writeFile(
            path.join(out, `${action}.log`),
            result.out + "\n" + result.err,
          );
          j.message =
            action === "render"
              ? "成片已导出"
              : action === "sample"
                ? "带声音的样片已完成，请预览确认"
                : action === "audio"
                  ? "旁白和配乐已准备好"
                  : "分镜图已生成";
          j.outputBase = `/outputs/${id}/${key}`;
        });
        json(res, 202, job);
        return;
      }
      if (action === "outputs" && req.method === "GET") {
        const currentKey = displayOutputHash(await loadProject(id));
        let keys = [];
        try {
          keys = await readdir(path.join(ROOT, "outputs", id));
        } catch {}
        const list = [];
        for (const key of keys.filter((x) => /^[a-f0-9]{16}$/.test(x))) {
          const dir = path.join(ROOT, "outputs", id, key);
          const files = await readdir(dir);
          const st = await stat(dir);
          list.push({
            key,
            base: `/outputs/${id}/${key}`,
            files: files.filter((x) =>
              /^(film.mp4|sample.mp4|sample-poster.jpg|poster.jpg|subtitles.srt|storyboard.jpg|soundtrack.wav|audio.json|qa.json)$/.test(
                x,
              ),
            ),
            current: key === currentKey,
            updatedAt: st.mtime.toISOString(),
          });
        }
        json(
          res,
          200,
          list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        );
        return;
      }
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      json(res, 404, { error: "Not found" });
      return;
    }
    let target;
    if (pathname === "/") target = path.join(ROOT, "public", "index.html");
    else if (
      /^\/(app.js|settings.js|presets.js|style.css|fonts\/[a-zA-Z0-9.-]+)$/.test(
        pathname,
      )
    )
      target = path.join(ROOT, "public", pathname.slice(1));
    else if (
      /^\/src\/(film|model|workflow|presets)\.mjs$/.test(pathname) ||
      /^\/src\/engine\/(motion|schema|renderer|recipes|review)\.mjs$/.test(
        pathname,
      )
    )
      target = path.join(ROOT, pathname.slice(1));
    else if (/^\/projects\/[a-z0-9-]+\/assets\/[a-zA-Z0-9._-]+$/.test(pathname))
      target = path.join(ROOT, pathname.slice(1));
    else if (
      /^\/outputs\/[a-z0-9-]+\/[a-f0-9]{16}\/[a-zA-Z0-9._-]+\.(mp4|wav|png|jpg|srt|json)$/.test(
        pathname,
      )
    )
      target = path.join(ROOT, pathname.slice(1));
    if (!target) {
      json(res, 404, { error: "Not found" });
      return;
    }
    await file(res, req, target);
  } catch (e) {
    if (!res.headersSent)
      json(res, e.code === "ENOENT" ? 404 : (e.status ?? 400), {
        error: e.message,
      });
    else res.destroy();
  }
});
server.listen(PORT, "127.0.0.1", () =>
  console.log(`Movie Studio → http://127.0.0.1:${PORT}`),
);
