import { drawFrame as draw2DFrame } from "/src/film.mjs";
import { productionUnavailable } from "/src/production.mjs";
import { SHOT_DIRECTION_FIELDS } from "/src/engine/shot-plan.mjs";
import { reviewTime } from "/src/engine/review.mjs";
import { workflowView, briefSuggestions } from "/src/workflow.mjs";
import { mountConnections } from "/settings.js";
import { filmType } from "/src/presets.mjs";
import {
  mountPresets,
  showPalette,
  showFilmType,
  selectPreserving,
  resetCustomOptions,
} from "/presets.js";
import {
  duration,
  timeline,
  sceneAt,
  validate,
  createProject,
} from "/src/model.mjs";
const $ = (id) => document.getElementById(id),
  canvas = $("preview"),
  ctx = canvas.getContext("2d");
function drawFrame(context, p, seconds, loaded, captionCues, options) {
  if (!productionUnavailable(p))
    return draw2DFrame(context, p, seconds, loaded, captionCues, options);
  const { width, height } = context.canvas;
  context.save();
  context.fillStyle = "#ede6d6";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#335b52";
  context.textAlign = "center";
  context.font = `500 ${height * 0.18}px 'Microsoft YaHei', sans-serif`;
  context.fillText("3D", width / 2, height * 0.46, width * 0.82);
  context.font = `400 ${height * 0.065}px 'Microsoft YaHei', sans-serif`;
  context.fillText("分镜文字稿", width / 2, height * 0.62);
  context.restore();
}
mountPresets();
document
  .querySelector(".project-settings")
  .insertAdjacentHTML(
    "beforebegin",
    `<details class="director-controls"><summary>和导演一起打磨镜头</summary><p id="director-note"></p><label for="shot-feedback">这一镜头，想怎么改？</label><textarea id="shot-feedback" rows="3" placeholder="例如：先慢慢靠近，再让形状展开。少放文字，结尾停一下。"></textarea><button id="revise-shot" class="button primary wide">让导演改这一镜头</button></details>`,
  );
$("delivery-checks").insertAdjacentHTML(
  "afterend",
  `<details class="director-controls" open><summary>导演审片建议</summary><div id="quality-report"></div><button id="critique" class="button quiet">重新检查实际画面</button></details>`,
);
let project,
  selected = 0,
  t = 0,
  playing = false,
  last = 0,
  assets = {},
  cues = null,
  currentTab = "story",
  saveTimer,
  dirty = false,
  saveChain = Promise.resolve(),
  job = null,
  config,
  previewAudioBase = null,
  audioLoadFailed = false,
  polling = false,
  jobSeen = null,
  editingBrief = false,
  review = {},
  currentOutput = null,
  allOutputs = [],
  guideState = null,
  editorMode = false,
  guideRenderKey = "",
  actionPending = false;
const retryRequests = new Map(),
  touchedBrief = new Set();
const time = (x) =>
  `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(Math.floor(x % 60)).padStart(2, "0")}`;
const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
async function api(url, method = "GET", data) {
  const response = await fetch(url, {
    method,
    headers:
      method === "GET"
        ? {}
        : { "Content-Type": "application/json", "X-Studio-Client": "local" },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
  });
  const j = await response.json();
  if (!response.ok) throw new Error(j.error || "请求失败");
  return j;
}
const route = (action) =>
  `/api/projects/${project.id}${action ? "/" + action : ""}`;
function toast(message) {
  $("toast").textContent = message;
  $("toast").hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($("toast").hidden = true), 6500);
}
function guarded(fn) {
  return async (...args) => {
    try {
      await fn(...args);
    } catch (e) {
      toast(e.message);
    }
  };
}
function pause() {
  playing = false;
  $("play").textContent = "▶";
  $("play").setAttribute("aria-label", "播放");
  $("soundtrack").pause();
}
function updateAudioStatus() {
  if (!project) return;
  const button = $("preview-audio");
  const busy = job?.projectId === project.id && job.status === "running";
  // Background rendering must not prevent muting an already available preview.
  button.disabled = busy && !previewAudioBase;
  button.removeAttribute("aria-pressed");
  if (audioLoadFailed) {
    $("preview-mode").textContent = "声音加载失败 · 点击重试";
    button.textContent = "重新加载声音";
  } else if (previewAudioBase) {
    const muted = $("soundtrack").muted;
    $("preview-mode").textContent = muted
      ? "预览已静音"
      : "有声预览 · 声音已就绪";
    button.textContent = muted ? "打开声音" : "静音";
    button.setAttribute("aria-pressed", String(muted));
  } else if (busy && ["audio", "render"].includes(job.type)) {
    $("preview-mode").textContent = "声音生成中 · 当前仅预览画面";
    button.textContent = "声音生成中…";
  } else {
    const intendedSound =
      project.music || project.scenes.some((s) => s.narration.trim());
    $("preview-mode").textContent = !intendedSound
      ? "无声作品"
      : dirty
        ? "无声预览 · 声音待更新"
        : "无声预览 · 尚未生成声音";
    button.textContent = "生成声音";
    button.hidden = !intendedSound;
  }
  if (previewAudioBase || audioLoadFailed || busy) button.hidden = false;
}
function redraw() {
  if (!project) return;
  drawFrame(ctx, project, t, assets, cues, {
    captions: $("captions").classList.contains("active"),
  });
  $("timecode").textContent = `${time(t)} / ${time(duration(project))}`;
  $("scrubber").value = t;
}
function frame(now) {
  if (playing && project) {
    t += (now - last) / 1000;
    if (previewAudioBase && !$("soundtrack").paused)
      t = $("soundtrack").currentTime;
    if (t >= duration(project)) {
      t = duration(project) - 0.001;
      pause();
    }
    redraw();
  }
  last = now;
  requestAnimationFrame(frame);
}
function selectShot(index, seek = true) {
  selected = Math.max(0, Math.min(project.scenes.length - 1, index));
  const s = project.scenes[selected];
  if (seek) {
    pause();
    t = timeline(project)[selected].start + 0.1;
    if (previewAudioBase) $("soundtrack").currentTime = t;
  }
  $("shot-number").textContent = String(selected + 1).padStart(2, "0");
  for (const [element, key] of [
    ["scene-title", "title"],
    ["scene-duration", "duration"],
    ["scene-kind", "kind"],
    ["scene-body", "body"],
    ["scene-narration", "narration"],
    ["scene-note", "note"],
  ])
    $(element).value = s[key];
  $("scene-camera").value = s.camera ?? "locked";
  $("image-prompt").value = s.imagePrompt ?? "";
  $("director-note").textContent = s.direction
    ? Object.values(s.direction).filter(Boolean).join(" · ")
    : "每个镜头都可以交给导演重新设计。";
  readingHint();
  document
    .querySelectorAll(".scene-card")
    .forEach((x, i) => x.classList.toggle("active", i === selected));
  redraw();
}
function readingHint() {
  const s = project.scenes[selected],
    words = s.narration.trim().split(/\s+/).filter(Boolean).length;
  const estimate = /[\u3400-\u9fff]/.test(s.narration)
    ? s.narration.length / 4
    : words / 2.5;
  $("reading-time").textContent = s.narration
    ? `约 ${Math.ceil(estimate)} 秒`
    : "";
  $("narration-hint").textContent =
    estimate > s.duration - 1
      ? "旁白可能偏长：缩短文字或增加镜头时长。"
      : s.narration
        ? "声音生成后，字幕将按实际语音时长同步。"
        : "无旁白的镜头会保留配乐和画面。";
  $("narration-hint").classList.toggle("warn", estimate > s.duration - 1);
  $("benchmark-fields").hidden = s.kind !== "benchmark";
  $("baseline").value = s.baseline ?? "";
  $("result").value = s.result ?? "";
  $("items-field").hidden = s.kind !== "checklist";
  $("items").value = s.items?.join("\n") ?? "";
}
function thumbnails() {
  const container = $("scene-strip");
  container.replaceChildren();
  timeline(project).forEach((s, i) => {
    const card = document.createElement("button");
    card.className = `scene-card ${i === selected ? "active" : ""}`;
    card.setAttribute("aria-label", `镜头 ${i + 1}: ${s.title}`);
    card.innerHTML = `<div class="scene-thumb"><span class="shot-id">${String(i + 1).padStart(2, "0")}</span></div><div class="scene-info"><b>${escape(s.title.replaceAll("\n", " "))}</b><span>${time(s.start)} · ${s.duration}s</span></div>`;
    const thumb = document.createElement("canvas");
    thumb.width = project.width < project.height ? 216 : 384;
    thumb.height = project.width < project.height ? 384 : 216;
    card
      .querySelector(".scene-thumb")
      .classList.toggle("portrait", project.width < project.height);
    drawFrame(
      thumb.getContext("2d"),
      project,
      s.start + reviewTime(s),
      assets,
      null,
      { captions: false },
    );
    card.querySelector(".scene-thumb").prepend(thumb);
    card.onclick = () => selectShot(i);
    container.append(card);
  });
  $("scene-count").textContent = `${project.scenes.length} 个镜头`;
  $("runtime").textContent = time(duration(project));
  $("scrubber").max = duration(project);
}
async function loadAssets() {
  const next = {};
  const names = [
    ...new Set(
      project.scenes.flatMap((s) => [s.image, s.imageAlt]).filter(Boolean),
    ),
  ];
  await Promise.all(
    names.map(async (name) => {
      try {
        const img = new Image();
        img.src = `/projects/${project.id}/${name}`;
        await img.decode();
        next[name] = img;
      } catch {
        toast("有图片素材未能加载，请在素材库重新选择。");
      }
    }),
  );
  assets = next;
}
async function projectList() {
  const list = await api("/api/projects");
  $("projects").replaceChildren();
  list.forEach((p) => {
    const b = document.createElement("button");
    b.className = `project-link ${project?.id === p.id ? "active" : ""}`;
    b.textContent = p.title;
    b.title = p.title;
    b.onclick = guarded(async () => {
      await flush();
      await openProject(p.id);
    });
    $("projects").append(b);
  });
  document.querySelector(".nav-caption span").textContent = String(
    list.length,
  ).padStart(2, "0");
  return list;
}
async function openProject(id) {
  pause();
  $("guided-video").pause();
  project = await api(`/api/projects/${id}`);
  selected = 0;
  t = 0.1;
  dirty = false;
  cues = null;
  jobSeen = null;
  job = null;
  guideRenderKey = "";
  previewAudioBase = null;
  audioLoadFailed = false;
  $("soundtrack").muted = false;
  $("soundtrack").removeAttribute("src");
  $("soundtrack").load();
  updateAudioStatus();
  $("project-title").textContent = project.title;
  $("breadcrumb").textContent = project.title;
  $("voice").value = project.voice;
  $("music").checked = project.music;
  $("theme").value = project.theme;
  showPalette("theme");
  $("save-status").textContent = "已保存";
  const address = new URL(location.href);
  address.searchParams.set("project", id);
  history.replaceState(null, "", address);
  canvas.width = project.width;
  canvas.height = project.height;
  document
    .querySelector(".screen")
    .classList.toggle("portrait", project.width < project.height);
  $("aspect-label").textContent =
    project.width < project.height ? "9:16" : "16:9";
  await loadAssets();
  thumbnails();
  selectShot(0);
  await projectList();
  await refreshOutputs();
  await changeTab(currentTab);
  await refreshReview();
  await pollJob(true);
}
function changed() {
  dirty = true;
  cues = null;
  previewAudioBase = null;
  audioLoadFailed = false;
  pause();
  $("soundtrack").removeAttribute("src");
  $("soundtrack").load();
  updateAudioStatus();
  $("save-status").textContent = "尚未保存";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => flush().catch((e) => toast(e.message)), 900);
  thumbnails();
  redraw();
}
async function flush() {
  clearTimeout(saveTimer);
  if (!dirty) {
    await saveChain;
    return;
  }
  const errors = validate(project);
  if (errors.length) throw new Error(errors[0]);
  const snapshot = structuredClone(project);
  dirty = false;
  $("save-status").textContent = "保存中…";
  saveChain = saveChain
    .catch(() => {})
    .then(() => api(`/api/projects/${snapshot.id}`, "PUT", snapshot));
  try {
    await saveChain;
    $("save-status").textContent = dirty ? "尚未保存" : "已保存";
    await refreshReview();
  } catch (e) {
    dirty = true;
    $("save-status").textContent = "保存失败";
    throw e;
  }
}
async function changeTab(tab) {
  currentTab = tab;
  for (const name of ["story", "assets", "sound", "delivery"])
    $(name + "-panel").hidden = name !== tab;
  document
    .querySelectorAll("[data-tab]")
    .forEach((x) => x.classList.toggle("active", x.dataset.tab === tab));
  if (tab === "assets") await refreshAssets();
  if (tab === "delivery") {
    await refreshOutputs();
    await revisions();
  }
}
async function refreshAssets() {
  const list = await api(route("assets"));
  $("asset-grid").replaceChildren();
  for (const a of list) {
    const card = document.createElement("article");
    card.className = "asset-card";
    if (/\.(png|jpe?g)$/i.test(a.file)) {
      const img = document.createElement("img");
      img.src = `/projects/${project.id}/${a.file}`;
      img.alt = a.prompt || "项目素材";
      card.append(img);
      const p = document.createElement("p");
      p.textContent = a.prompt || a.file.split("/").pop();
      card.append(p);
      const b = document.createElement("button");
      b.className = "button quiet";
      b.textContent = "用于当前镜头";
      b.onclick = guarded(async () => {
        const s = project.scenes[selected];
        s.image = a.file;
        s.kind = "image";
        if (!s.camera || s.camera === "locked") s.camera = "push";
        changed();
        await loadAssets();
        thumbnails();
        selectShot(selected, false);
        toast("已应用画面，可在右侧调整运镜。");
      });
      card.append(b);
    } else {
      const aLink = document.createElement("a");
      aLink.href = `/projects/${project.id}/${a.file}`;
      aLink.target = "_blank";
      aLink.textContent = "↗ 文本素材";
      card.append(aLink);
    }
    $("asset-grid").append(card);
  }
  if (!list.length)
    $("asset-grid").innerHTML =
      '<p class="empty-state">生成一张画面，或上传已有素材。</p>';
  $("source-list").replaceChildren();
  for (const source of project.sources ?? []) {
    const link = document.createElement("a");
    link.className = "source-link";
    const href = source.url.startsWith("assets/")
      ? `/projects/${project.id}/${source.url}`
      : source.url;
    if (!/^(https?:\/\/|\/projects\/)/.test(href)) continue;
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = `${source.label} ↗`;
    $("source-list").append(link);
  }
}
async function refreshOutputs() {
  const list = await api(route("outputs"));
  allOutputs = list;
  currentOutput = list.find((x) => x.current);
  const current = list.find(
    (x) =>
      x.current &&
      x.files.includes("audio.json") &&
      x.files.includes("soundtrack.wav"),
  );
  if (current && !dirty) {
    try {
      const a = await api(current.base + "/audio.json");
      cues = a.cues;
      previewAudioBase = current.base;
      const next = location.origin + current.base + "/soundtrack.wav";
      if ($("soundtrack").src !== next) {
        audioLoadFailed = false;
        $("soundtrack").src = next;
      }
    } catch {
      previewAudioBase = null;
      audioLoadFailed = true;
      pause();
    }
  } else if (!current) {
    if (previewAudioBase) pause();
    previewAudioBase = null;
    cues = null;
    $("soundtrack").removeAttribute("src");
  }
  updateAudioStatus();
  $("deliveries").replaceChildren();
  for (const item of list.filter(
    (x) =>
      x.files.includes("film.mp4") ||
      x.files.includes("sample.mp4") ||
      x.files.includes("storyboard.jpg"),
  )) {
    const card = document.createElement("article");
    card.className = "delivery-card";
    const heading = document.createElement("h3");
    heading.textContent =
      (item.current
        ? "当前版本"
        : "历史导出 · " + new Date(item.updatedAt).toLocaleString()) +
      (item.files.includes("film.mp4")
        ? " · 完整电影"
        : item.files.includes("sample.mp4")
          ? " · 短样片"
          : " · 关键画面");
    card.append(heading);
    const movie = item.files.includes("film.mp4")
      ? "film.mp4"
      : item.files.includes("sample.mp4")
        ? "sample.mp4"
        : null;
    if (movie) {
      const video = document.createElement("video");
      video.controls = true;
      video.preload = "metadata";
      video.src = item.base + "/" + movie;
      card.append(video);
    }
    for (const [file, label] of [
      ["film.mp4", "下载 MP4"],
      ["sample.mp4", "下载样片"],
      ["subtitles.srt", "下载字幕"],
      ["poster.jpg", "查看封面"],
      ["storyboard.jpg", "查看分镜总览"],
      ["qa.json", "查看检查记录"],
    ])
      if (item.files.includes(file)) {
        const a = document.createElement("a");
        a.className = "button quiet";
        a.href = item.base + "/" + file;
        a.textContent = label;
        a.target = "_blank";
        if (file.endsWith("mp4") || file.endsWith("srt")) a.download = file;
        card.append(a);
      }
    $("deliveries").append(card);
  }
  if (!$("deliveries").children.length)
    $("deliveries").innerHTML =
      '<div class="empty-state">先预览分镜，再点击右上角「导出电影」。成片会出现在这里。</div>';
  const narration = project.scenes.filter((s) => s.narration.trim()).length;
  $("delivery-checks").innerHTML =
    `<span>✓ ${time(duration(project))} / ${project.scenes.length} 个镜头</span><span>✓ 1080p / 24 fps</span><span>${narration ? "✓ " + narration + " 段旁白" : "无旁白"}</span><span>${current ? "✓ 声音已生成" : "声音待生成"}</span><span>人工审片待确认</span>`;
  redraw();
}
async function refreshReview() {
  if (!project) return;
  review = await api(route("review"));
  const all = await api(route("outputs"));
  allOutputs = all;
  currentOutput = all.find((x) => x.current);
  const hasFrames = currentOutput?.files.includes("storyboard.jpg"),
    hasSample = currentOutput?.files.includes("sample.mp4");
  const area = $("review-visuals");
  area.replaceChildren();
  area.hidden = !hasFrames && !hasSample;
  if (hasFrames) {
    const a = document.createElement("a");
    a.className = "review-sheet";
    a.href = currentOutput.base + "/storyboard.jpg";
    a.target = "_blank";
    a.textContent = "↗ 查看分镜与关键画面总览";
    area.append(a);
  }
  const quality = await api(route("quality"));
  $("quality-report").replaceChildren();
  if (quality) {
    const summary = document.createElement("p");
    summary.textContent = quality.summary;
    $("quality-report").append(summary);
    for (const finding of quality.findings ?? []) {
      const row = document.createElement("p");
      row.className = "quality-finding";
      row.textContent = `${finding.severity === "blocking" ? "需重点检查" : finding.severity === "warning" ? "建议调整" : "观察"} · ${finding.sceneId}：${finding.issue} ${finding.suggestion ?? ""}`;
      $("quality-report").append(row);
    }
    const scope = document.createElement("small");
    scope.textContent = "本次为实际静帧抽查；运镜、音画节奏仍需预览样片。";
    $("quality-report").append(scope);
  } else
    $("quality-report").textContent =
      "关键画面生成后，AI 导演会检查实际画面并给出建议。";
  renderGuidance();
}
function setEditorMode(enabled) {
  pause();
  document.querySelectorAll("video").forEach((v) => v.pause());
  editorMode = enabled;
  document.body.dataset.mode = enabled ? "editor" : "guided";
  $("toggle-editor").textContent = enabled ? "返回引导工作台" : "精细调整";
  $("toggle-editor").setAttribute("aria-pressed", String(enabled));
  renderGuidance();
}
function renderGuidance() {
  if (!project) return;
  guideState = workflowView({ project, review, outputs: allOutputs, job });
  const g = guideState;
  if (job?.status === "failed" && !g.failed) $("job-panel").hidden = true;
  $("review-title").textContent = g.title;
  $("review-description").textContent = g.description;
  $("review-next").textContent = g.label;
  $("review-next").disabled = !!g.busy || !!g.disabled || actionPending;
  document
    .querySelector(".review-panel")
    .classList.toggle("is-complete", g.phase === "complete" && !g.busy);
  ["story", "frames", "sample", "film"].forEach(
    (name, i) =>
      ($("step-" + name).className =
        i < g.step ? "done" : i === g.step ? "current" : ""),
  );
  $("guided-media").hidden = !g.media;
  $("guided-plan").hidden = !!g.media;
  $("sample-options").hidden = !["frames", "sample", "sample-review"].includes(
    g.phase,
  );
  $("guide-redo-sample").hidden = g.phase !== "sample-review";
  $("guide-connections").hidden = !g.failed;
  $("guide-edit").textContent =
    g.phase === "complete" ? "继续打磨作品" : "想改一下";
  $("guided-video").classList.toggle(
    "portrait",
    project.width < project.height,
  );
  if (g.media) {
    const url = location.origin + g.output.base + "/" + g.media;
    if ($("guided-video").src !== url) {
      pause();
      $("guided-video").src = url;
      $("guided-video").poster =
        g.output.base +
        (g.media === "film.mp4" ? "/poster.jpg" : "/sample-poster.jpg");
    }
    $("guided-media-label").textContent =
      g.media === "film.mp4" ? "完整电影" : "有声试看片";
    $("guided-media-sound").textContent =
      (project.scenes.some((s) => s.narration.trim()) ? "旁白" : "") +
        (project.music ? " · 配乐" : "") || "无声作品";
    $("guided-downloads").replaceChildren();
    for (const [name, label] of [
      ["subtitles.srt", "字幕文件"],
      ["poster.jpg", "封面图片"],
    ])
      if (g.output.files.includes(name)) {
        const link = document.createElement("a");
        link.href = g.output.base + "/" + name;
        link.download = name;
        link.className = "download-extra";
        link.textContent = label + " ↗";
        $("guided-downloads").append(link);
      }
  } else $("guided-video").pause();
  const key = JSON.stringify([
    project.id,
    g.phase,
    g.output?.key,
    project.scenes,
  ]);
  if (guideRenderKey !== key) {
    guideRenderKey = key;
    $("guided-shots").replaceChildren();
    const frames = ["frames", "sample"].includes(g.phase);
    $("guided-plan-title").textContent = frames
      ? "电影会是什么样子"
      : "故事怎样展开";
    $("guided-plan-count").textContent =
      `${project.scenes.length} 个镜头 · ${time(duration(project))}`;
    $("guided-synopsis").textContent = project.bible?.logline || project.idea;
    timeline(project).forEach((s, i) => {
      const card = document.createElement("article");
      card.className = "guided-shot";
      const thumb = document.createElement("canvas");
      thumb.width = project.width < project.height ? 270 : 480;
      thumb.height = project.width < project.height ? 480 : 270;
      drawFrame(
        thumb.getContext("2d"),
        project,
        s.start + reviewTime(s),
        assets,
        null,
        { captions: false },
      );
      thumb.setAttribute("aria-label", s.title);
      const visual = document.createElement("div");
      visual.className = "guided-shot-visual";
      visual.append(thumb);
      if (g.phase === "story" && !s.composition && !s.image) {
        const placeholder = document.createElement("span");
        placeholder.className = "guided-shot-placeholder";
        placeholder.textContent = productionUnavailable(project)
          ? "3D 画面待制作"
          : "分镜占位 · 美术待制作";
        visual.append(placeholder);
      }
      card.append(visual);
      const content = document.createElement("div");
      content.className = "guided-shot-content";
      const label = document.createElement("small");
      label.textContent = `镜头 ${String(i + 1).padStart(2, "0")} · ${time(s.start)} — ${time(s.end)}`;
      const title = document.createElement("h3");
      title.textContent = s.title.replaceAll("\n", " ");
      const summary = document.createElement("p");
      summary.textContent =
        s.direction?.purpose || s.body || "这个镜头的细节可以交给导演完善。";
      content.append(label, title, summary);
      if (s.narration) {
        const details = document.createElement("details");
        const heading = document.createElement("summary");
        heading.textContent = "看这段旁白";
        const text = document.createElement("p");
        text.textContent = s.narration;
        details.append(heading, text);
        content.append(details);
      }
      if (s.direction) {
        const details = document.createElement("details");
        details.className = "guided-direction";
        const heading = document.createElement("summary");
        heading.textContent = "镜头、运镜与声音";
        details.append(heading);
        for (const [key, label] of SHOT_DIRECTION_FIELDS) {
          if (!s.direction[key]) continue;
          const line = document.createElement("p");
          const title = document.createElement("strong");
          title.textContent = label + "：";
          line.append(title, document.createTextNode(s.direction[key]));
          details.append(line);
        }
        if (s.note) {
          const evidence = document.createElement("p");
          evidence.textContent = "证据注记：" + s.note;
          details.append(evidence);
        }
        content.append(details);
      }
      const edit = document.createElement("button");
      edit.className = "guided-shot-edit";
      edit.textContent = "改这一镜头";
      edit.onclick = () => {
        setEditorMode(true);
        changeTab("story");
        selectShot(i);
        document
          .querySelector(".inspector")
          .scrollIntoView({ behavior: "smooth", block: "nearest" });
      };
      content.append(edit);
      card.append(content);
      $("guided-shots").append(card);
    });
    const previous = $("sample-choice").value;
    $("sample-choice").replaceChildren();
    timeline(project).forEach((s, i) => {
      const o = new Option(
        `${i === 0 ? "开场（推荐）" : `镜头 ${i + 1}`} · ${s.title.replaceAll("\n", " ")}`,
        s.id,
      );
      $("sample-choice").add(o);
    });
    if (project.scenes.some((s) => s.id === previous))
      $("sample-choice").value = previous;
  }
  $("guided-quality").hidden = !["frames", "sample"].includes(g.phase);
  $("guided-quality-content").replaceChildren(
    ...[...$("quality-report").childNodes].map((n) => n.cloneNode(true)),
  );
}
function downloadMovie() {
  const out = allOutputs.find((x) => x.current && x.files.includes("film.mp4"));
  if (!out) return;
  const link = document.createElement("a");
  link.href = out.base + "/film.mp4";
  link.download = project.title + ".mp4";
  document.body.append(link);
  link.click();
  link.remove();
}
async function advanceWorkflow() {
  if (actionPending) return;
  actionPending = true;
  try {
    await flush();
    await refreshReview();
    const action = guideState.action;
    if (
      ["plan", "prepare", "approve-story"].includes(action) &&
      !(action === "approve-story" && productionUnavailable(project)) &&
      !config.director
    ) {
      await openConnections();
      toast("先连接一位导演助手，就可以开始自动制作。");
      return;
    }
    if (
      ["sample", "approve-frames", "approve-sample", "render"].includes(
        action,
      ) &&
      project.scenes.some((s) => s.narration.trim()) &&
      !config.speech
    ) {
      await openConnections();
      toast("先配置配音连接，样片会自动带上声音。");
      return;
    }
    const sampleStart = editorMode
      ? timeline(project)[selected].start
      : (timeline(project).find((s) => s.id === $("sample-choice").value)
          ?.start ?? 0);
    if (action === "download") {
      downloadMovie();
      return;
    }
    if (action === "retry") {
      const last = retryRequests.get(project.id);
      if (last) {
        await runJob(last.type, last.data);
        return;
      }
      if (
        [
          "plan",
          "prepare",
          "audio",
          "render",
          "stills",
          "sample",
          "critique",
        ].includes(job?.type)
      ) {
        await runJob(
          job.type,
          job.type === "sample" ? { start: sampleStart } : {},
        );
        return;
      }
      setEditorMode(true);
      await changeTab(job?.type === "image" ? "assets" : "story");
      toast("请在这里调整后重新生成，已有内容会保留。");
      return;
    }
    if (action === "approve-story") {
      await api(route("approve-story"), "POST", {});
      if (!productionUnavailable(project)) await runJob("prepare");
    } else if (action === "approve-frames") {
      await api(route("approve-frames"), "POST", {});
      await runJob("sample", { start: sampleStart });
    } else if (action === "approve-sample") {
      await api(route("approve-sample"), "POST", {});
      await runJob("render");
    } else if (action)
      await runJob(action, action === "sample" ? { start: sampleStart } : {});
    await refreshReview();
  } finally {
    actionPending = false;
    renderGuidance();
  }
}
$("review-next").onclick = guarded(advanceWorkflow);
async function revisions() {
  const items = await api(route("revisions"));
  $("revisions").replaceChildren();
  for (const revision of items) {
    const row = document.createElement("div");
    row.className = "revision-row";
    const label = document.createElement("span");
    label.textContent = new Date(
      Number(revision.split("-")[0]),
    ).toLocaleString();
    row.append(label);
    const b = document.createElement("button");
    b.className = "button quiet";
    b.textContent = "恢复此版本";
    b.onclick = guarded(async () => {
      await flush();
      await api(route("restore"), "POST", { revision });
      await openProject(project.id);
      toast("已恢复，恢复前的版本也已保留。");
    });
    row.append(b);
    $("revisions").append(row);
  }
  if (!items.length)
    $("revisions").textContent = "每次修改保存后，旧版本会保留在这里。";
}
async function runJob(type, data = {}) {
  await flush();
  pause();
  $("guided-video").pause();
  retryRequests.set(project.id, { type, data: structuredClone(data) });
  jobSeen = null;
  job = await api(route(type), "POST", data);
  await pollJob();
}
async function pollJob(initial = false) {
  if (!project || polling) return;
  polling = true;
  try {
    const id = project.id;
    job = await api(route("job"));
    if (id !== project.id) return;
    if (!job) {
      $("job-panel").hidden = true;
      updateAudioStatus();
      return;
    }
    if (initial && job.status === "complete") jobSeen = job.id;
    $("job-panel").hidden = job.status === "complete";
    $("job-panel").classList.toggle("failed", job.status === "failed");
    $("job-message").textContent =
      job.status === "failed" ? "制作遇到问题，已有内容会保留。" : job.message;
    $("job-error-details").hidden = job.status !== "failed";
    $("job-error").textContent = job.status === "failed" ? job.message : "";
    $("job-progress").textContent =
      job.status === "running"
        ? `${job.progress || 0}%`
        : job.status === "failed"
          ? "失败"
          : "完成";
    $("job-bar").value = job.progress || 0;
    updateAudioStatus();
    document.querySelector(".spinner").hidden = job.status !== "running";
    for (const x of [
      "export",
      "ai-plan",
      "generate-image",
      "prepare-audio",
      "make-stills",
    ])
      $(x).disabled = job.status === "running";
    renderGuidance();
    document
      .querySelectorAll(
        ".inspector input,.inspector textarea,.inspector select,.inspector button",
      )
      .forEach(
        (el) =>
          (el.disabled = job.status === "running" && job.type === "prepare"),
      );
    if (job.status === "complete" && jobSeen !== job.id) {
      jobSeen = job.id;
      if (["plan", "prepare", "revise"].includes(job.type)) {
        const preserve = job.type === "revise" ? selected : 0;
        project = await api(route(""));
        await loadAssets();
        thumbnails();
        selectShot(preserve);
        await projectList();
      }
      if (job.type === "image") {
        await refreshAssets();
      }
      await refreshOutputs();
      await refreshReview();
      if (["render", "sample"].includes(job.type)) await changeTab("delivery");
    }
  } catch (e) {
    console.warn(e.message);
  } finally {
    polling = false;
  }
}
document
  .querySelectorAll("[data-tab]")
  .forEach((b) => (b.onclick = guarded(() => changeTab(b.dataset.tab))));
for (const [element, key] of [
  ["scene-title", "title"],
  ["scene-duration", "duration"],
  ["scene-kind", "kind"],
  ["scene-body", "body"],
  ["scene-narration", "narration"],
  ["scene-note", "note"],
  ["scene-camera", "camera"],
])
  $(element).addEventListener("input", () => {
    const s = project.scenes[selected];
    s[key] = key === "duration" ? Number($(element).value) : $(element).value;
    delete s.composition;
    delete s.soundCues;
    readingHint();
    changed();
  });
for (const name of ["baseline", "result"])
  $(name).oninput = () => {
    project.scenes[selected][name] = Number($(name).value);
    changed();
  };
$("items").oninput = () => {
  project.scenes[selected].items = $("items")
    .value.split("\n")
    .filter(Boolean)
    .slice(0, 4);
  changed();
};
$("theme").onchange = () => {
  project.theme = $("theme").value;
  project.brief = { ...project.brief, paletteOverride: "true" };
  showPalette("theme");
  project.scenes.forEach((s) => {
    delete s.composition;
    delete s.soundCues;
  });
  changed();
};
$("voice").onchange = () => {
  project.voice = $("voice").value;
  changed();
};
$("music").onchange = () => {
  project.music = $("music").checked;
  changed();
};
$("play").onclick = guarded(async () => {
  if (playing) {
    pause();
    return;
  }
  if (t >= duration(project) - 0.1) t = 0;
  if (previewAudioBase) {
    $("soundtrack").currentTime = t;
    try {
      await $("soundtrack").play();
    } catch {
      pause();
      toast("声音未能播放，请重新点击播放；如仍无声，可重新加载声音。");
      return;
    }
  } else {
    toast("当前仅播放画面。点击监视器旁的「生成声音」，即可准备旁白与配乐。");
  }
  playing = true;
  last = performance.now();
  $("play").textContent = "Ⅱ";
  $("play").setAttribute("aria-label", "暂停");
});
$("preview-audio").onclick = guarded(async () => {
  if (audioLoadFailed) {
    audioLoadFailed = false;
    if (previewAudioBase) $("soundtrack").load();
    else await refreshOutputs();
    updateAudioStatus();
  } else if (previewAudioBase) {
    $("soundtrack").muted = !$("soundtrack").muted;
    updateAudioStatus();
  } else {
    await runJob("audio");
  }
});
$("soundtrack").addEventListener("error", () => {
  if (!previewAudioBase) return;
  audioLoadFailed = true;
  pause();
  updateAudioStatus();
});
$("scrubber").oninput = () => {
  pause();
  t = Number($("scrubber").value);
  if (previewAudioBase) $("soundtrack").currentTime = t;
  redraw();
};
$("previous").onclick = () => selectShot(selected - 1);
$("next").onclick = () => selectShot(selected + 1);
$("captions").onclick = () => {
  $("captions").classList.toggle("active");
  redraw();
};
$("fullscreen").onclick = guarded(() =>
  document.querySelector(".screen").requestFullscreen(),
);
$("save").onclick = guarded(async () => {
  await flush();
  toast("作品已保存，旧版本可在「审片与交付」中恢复。");
});
$("export").onclick = guarded(async () => {
  await flush();
  await refreshReview();
  if (guideState.phase === "complete") downloadMovie();
  else {
    document
      .querySelector(".review-panel")
      .scrollIntoView({ behavior: "smooth" });
    toast("按上方提示确认方案、画面和试看片，就会自动完成电影。");
  }
});
$("prepare-audio").onclick = guarded(() => runJob("audio"));
$("make-stills").onclick = guarded(() => runJob("stills"));
$("ai-plan").onclick = guarded(() => runJob("plan"));
$("revise-shot").onclick = guarded(() =>
  runJob("revise-shot", {
    sceneId: project.scenes[selected].id,
    feedback: $("shot-feedback").value,
  }),
);
$("critique").onclick = guarded(() => runJob("critique"));
$("generate-image").onclick = guarded(async () => {
  const prompt = $("image-prompt").value;
  project.scenes[selected].imagePrompt = prompt;
  dirty = true;
  await runJob("generate-image", { prompt, theme: project.theme });
});
$("upload").onchange = guarded(async () => {
  const f = $("upload").files[0];
  if (!f) return;
  const contentType = /\.(txt|md)$/i.test(f.name) ? "text/plain" : f.type;
  const res = await fetch(route("upload"), {
    method: "POST",
    headers: { "Content-Type": contentType, "X-Studio-Client": "local" },
    body: f,
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error);
  await refreshAssets();
  $("upload").value = "";
  toast("素材已上传。");
});
$("add-scene").onclick = () => {
  project.scenes.push({
    id: "scene-" + crypto.randomUUID().slice(0, 8),
    kind: "card",
    duration: 10,
    title: "新的镜头",
    eyebrow: "NEXT SCENE",
    body: "",
    narration: "",
    note: "",
    camera: "locked",
  });
  changed();
  selectShot(project.scenes.length - 1);
};
$("duplicate").onclick = () => {
  const copy = structuredClone(project.scenes[selected]);
  copy.id = "scene-" + crypto.randomUUID().slice(0, 8);
  project.scenes.splice(selected + 1, 0, copy);
  changed();
  selectShot(selected + 1);
};
$("delete-scene").onclick = () => {
  if (project.scenes.length === 1) {
    toast("作品至少需要一个镜头。");
    return;
  }
  project.scenes.splice(selected, 1);
  changed();
  selectShot(Math.min(selected, project.scenes.length - 1));
};
for (const [id, offset] of [
  ["move-left", -1],
  ["move-right", 1],
])
  $(id).onclick = () => {
    const to = selected + offset;
    if (to < 0 || to >= project.scenes.length) return;
    [project.scenes[to], project.scenes[selected]] = [
      project.scenes[selected],
      project.scenes[to],
    ];
    changed();
    selectShot(to);
  };
$("new-project").onclick = () => {
  editingBrief = false;
  touchedBrief.clear();
  resetCustomOptions();
  $("create-form").reset();
  $("new-dialog")
    .querySelectorAll("details")
    .forEach((d) => (d.open = false));
  $("new-ai").checked = config.director;
  $("new-ai").disabled = !config.director;
  $("create-submit").textContent = "生成创作方案 →";
  updateBriefSummary();
  $("new-dialog").showModal();
};
$("close-dialog").onclick = () => $("new-dialog").close();
$("edit-brief").onclick = () => {
  editingBrief = true;
  touchedBrief.clear();
  resetCustomOptions();
  $("brief-upload").value = "";
  const b = project.brief ?? {};
  $("new-title").value = project.title;
  $("new-idea").value = project.idea;
  $("new-language").value = project.language;
  const seconds = project.targetDuration ?? duration(project);
  selectPreserving("new-duration", seconds, `${seconds} 秒 · 当前作品`);
  $("new-aspect").value = project.width < project.height ? "9:16" : "16:9";
  selectPreserving("new-template", project.template, "自定义类型 · 当前作品");
  $("new-theme").value = project.theme;
  for (const [id, key] of [
    ["new-audience", "audience"],
    ["new-story", "story"],
    ["new-reference", "reference"],
    ["new-materials", "materials"],
    ["new-must", "mustInclude"],
  ])
    $(id).value = b[key] ?? (key === "reference" ? b.references : "") ?? "";
  selectPreserving(
    "new-style",
    b.style ?? "technical editorial",
    "自定义风格 · 当前作品",
  );
  $("new-pace").value = b.pace ?? "balanced";
  $("new-narration").value =
    b.narrationMode === "none" ? "none" : (b.voiceTone ?? "auto");
  $("create-submit").textContent = "保存创作简报";
  updateBriefSummary();
  $("new-dialog").showModal();
};
$("create-form").onsubmit = guarded(async (e) => {
  e.preventDefault();
  $("create-submit").disabled = true;
  try {
    await flush();
    const narration = $("new-narration").value;
    const input = {
      title: $("new-title").value,
      idea: $("new-idea").value,
      language: $("new-language").value,
      template: $("new-template").value,
      theme: $("new-theme").value,
      targetDuration: Number($("new-duration").value),
      brief: {
        ...(editingBrief ? project.brief : {}),
        audience: $("new-audience").value,
        style: $("new-style").value,
        story: $("new-story").value || "导演编排，要有一个转折",
        pace: $("new-pace").value,
        reference: $("new-reference").value,
        materials: $("new-materials").value,
        mustInclude: $("new-must").value,
        aspect: $("new-aspect").value,
        narrationMode: narration === "none" ? "none" : "voice",
        voiceTone: narration,
        duration: $("new-duration").value,
      },
    };
    if (!editingBrief || input.theme !== project.theme)
      input.brief.paletteOverride = "true";
    if (editingBrief && "references" in (project.brief ?? {}))
      input.brief.references = input.brief.reference;
    let p;
    if (editingBrief) {
      p = {
        ...project,
        ...input,
        title: input.title || project.title,
        voice:
          input.language === project.language &&
          !touchedBrief.has("new-narration")
            ? project.voice
            : createProject(input, "voice-preview").voice,
        width: input.brief.aspect === "9:16" ? 1080 : 1920,
        height: input.brief.aspect === "9:16" ? 1920 : 1080,
      };
      if (input.brief.narrationMode === "none")
        p.scenes = p.scenes.map((s) => ({ ...s, narration: "" }));
      if (p.theme !== project.theme)
        p.scenes = p.scenes.map(({ composition, soundCues, ...s }) => s);
      p = await api(route(""), "PUT", p);
    } else p = await api("/api/projects", "POST", input);
    for (const f of $("brief-upload").files) {
      const res = await fetch(`/api/projects/${p.id}/upload`, {
        method: "POST",
        headers: {
          "Content-Type": /\.(txt|md)$/i.test(f.name) ? "text/plain" : f.type,
          "X-Studio-Client": "local",
        },
        body: f,
      });
      if (!res.ok) throw new Error((await res.json()).error);
    }
    $("new-dialog").close();
    setEditorMode(false);
    await openProject(p.id);
    await changeTab("story");
    if (!editingBrief && $("new-ai").checked) await runJob("plan");
    else
      toast(
        editingBrief
          ? "简报已保存；可点「AI 编排」按新方向改写分镜。"
          : "结构已创建，填写各镜头内容即可开始。",
      );
  } finally {
    $("create-submit").disabled = false;
  }
});
window.addEventListener("beforeunload", (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});
$("new-style").onchange = () => {
  if (!editingBrief && !touchedBrief.has("new-theme"))
    $("new-theme").value = [
      "watercolor",
      "Chinese ink wash",
      "paper pop-up",
    ].includes($("new-style").value)
      ? "paper"
      : $("new-style").value === "cinematic realism"
        ? "ember"
        : "midnight";
  updateBriefSummary();
};
function updateBriefSummary() {
  showFilmType();
  showPalette("new-theme");
  const style =
    $("new-style").selectedOptions[0]?.textContent.split("·")[0].trim() ||
    "导演推荐";
  $("brief-defaults").textContent =
    `${style} · ${$("new-duration").value} 秒 · ${$("new-language").value === "en" ? "英文" : "中文"} · ${$("new-aspect").value === "9:16" ? "竖屏" : "横屏"}`;
  document
    .querySelectorAll("[data-template]")
    .forEach((b) =>
      b.setAttribute(
        "aria-pressed",
        String(b.dataset.template === $("new-template").value),
      ),
    );
}
for (const id of [
  "new-style",
  "new-duration",
  "new-language",
  "new-aspect",
  "new-template",
  "new-theme",
  "new-narration",
])
  $(id).addEventListener("change", () => {
    touchedBrief.add(id);
    updateBriefSummary();
  });
$("new-idea").addEventListener("input", () => {
  if (editingBrief) return;
  const s = briefSuggestions($("new-idea").value);
  for (const [key, id] of [
    ["language", "new-language"],
    ["duration", "new-duration"],
    ["aspect", "new-aspect"],
  ]) {
    if (s[key] !== undefined && !touchedBrief.has(id)) {
      if (
        key === "duration" &&
        ![...$(id).options].some((o) => o.value === String(s[key]))
      )
        $(id).add(new Option(`${s[key]} 秒`, s[key]));
      $(id).value = String(s[key]);
    }
  }
  updateBriefSummary();
});
function applyTypeDefaults() {
  const type = filmType($("new-template").value);
  if (type && !editingBrief) {
    if (!touchedBrief.has("new-style")) $("new-style").value = type.style;
    if (!touchedBrief.has("new-theme")) $("new-theme").value = type.theme;
  }
  updateBriefSummary();
}
$("new-template").addEventListener("change", applyTypeDefaults);
document.querySelectorAll("[data-template]").forEach((b) => {
  b.onclick = () => {
    $("new-template").value = b.dataset.template;
    applyTypeDefaults();
  };
});
$("toggle-editor").onclick = guarded(async () => {
  await flush();
  setEditorMode(!editorMode);
});
$("guide-edit").onclick = () => setEditorMode(true);
$("guide-redo-sample").onclick = guarded(() =>
  runJob("sample", {
    start:
      timeline(project).find((s) => s.id === $("sample-choice").value)?.start ??
      0,
  }),
);
$("guided-video").addEventListener("play", pause);
window.addEventListener("keydown", (e) => {
  if (
    e.code === "Space" &&
    !["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(
      document.activeElement.tagName,
    ) &&
    !$("new-dialog").open
  ) {
    e.preventDefault();
    if (!editorMode && guideState?.media) {
      const v = $("guided-video");
      if (v.paused) v.play().catch(() => toast("请点击播放器上的播放按钮。"));
      else v.pause();
    } else if (editorMode) $("play").click();
  }
});
async function loadConfig() {
  config = await api("/api/config");
  $("connection").textContent =
    config.director && config.image && config.speech
      ? "创作连接已配置"
      : "点下方配置创作连接";
  $("image-model").textContent =
    `${config.models.image} · 生成时调用 Google API`;
  $("brief-services").textContent =
    `导演：${config.providers.director === "copilot" ? "GitHub Copilot" : "Gemini"} · 画面：${config.providers.image === "uploads" ? "你的素材" : "Nano Banana"} · 配音：${config.providers.speech === "local" ? "本地语音" : "Azure"}。你确认后才进入下一步，生成会使用你的服务额度。`;
  document.querySelector(".generation-card").hidden =
    config.providers.image === "uploads";
}
const openConnections = mountConnections({ api, onSaved: loadConfig });
const openConnectionsPaused = async () => {
  pause();
  $("guided-video").pause();
  await openConnections();
};
$("open-settings").onclick = guarded(openConnectionsPaused);
$("guide-connections").onclick = guarded(openConnectionsPaused);
await document.fonts.ready;
await loadConfig();
const list = await projectList();
if (list.length)
  await openProject(
    list.find(
      (p) => p.id === new URL(location.href).searchParams.get("project"),
    )?.id ?? list[0].id,
  );
else {
  $("empty").hidden = false;
  $("new-project").click();
}
requestAnimationFrame(frame);
setInterval(pollJob, 1500);
