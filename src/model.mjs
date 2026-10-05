export const KINDS = [
  "title",
  "matrix",
  "lanes",
  "pipeline",
  "benchmark",
  "demo",
  "compare",
  "checklist",
  "closing",
  "card",
  "image",
];
export const VOICES = [
  "Azure en-US-AndrewMultilingualNeural",
  "Azure en-US-AvaMultilingualNeural",
  "Azure zh-CN-XiaoxiaoNeural",
  "Azure zh-CN-YunxiNeural",
  "Microsoft David Desktop",
  "Microsoft Zira Desktop",
  "Microsoft Huihui Desktop",
];
export const THEMES = {
  midnight: {
    bg: "#0b1118",
    panel: "#131e29",
    ink: "#f0f4ee",
    muted: "#a4b5bd",
    accent: "#bcf574",
    second: "#78cbd8",
  },
  paper: {
    bg: "#f4f0e6",
    panel: "#e6e0d2",
    ink: "#1b2929",
    muted: "#58665f",
    accent: "#216351",
    second: "#3d7189",
  },
  ember: {
    bg: "#1e1115",
    panel: "#321f24",
    ink: "#fff0dc",
    muted: "#cdb8ae",
    accent: "#ffac74",
    second: "#f0da96",
  },
};
export function duration(p) {
  return p.scenes.reduce((sum, s) => sum + s.duration, 0);
}
export function timeline(p) {
  let t = 0;
  return p.scenes.map((s) => {
    const row = { ...s, start: t, end: t + s.duration };
    t = row.end;
    return row;
  });
}
export function sceneAt(p, t) {
  const shots = timeline(p);
  return shots.find((s) => t >= s.start && t < s.end) ?? shots.at(-1);
}
export function subtitles(p, cues) {
  const rows =
    cues ??
    timeline(p).flatMap((s) => {
      const lines =
        s.narration
          .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
          ?.map((x) => x.trim())
          .filter(Boolean) ?? [];
      const total = lines.reduce((n, x) => n + x.length, 0);
      let t = s.start + 0.7;
      return lines.map((text) => {
        const start = t;
        t += ((s.duration - 1.4) * text.length) / total;
        return { start, end: t, text, sceneId: s.id };
      });
    });
  return rows;
}
export function validate(p) {
  const errors = [];
  if (!p || typeof p !== "object") return ["Project must be an object"];
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(p.id))
    errors.push("Invalid project ID");
  if (typeof p.title !== "string" || !p.title.trim() || p.title.length > 140)
    errors.push("Title must have 1–140 characters");
  if (!THEMES[p.theme]) errors.push("Unknown theme");
  if (!["en", "zh"].includes(p.language))
    errors.push("Unsupported narration language");
  if (!VOICES.includes(p.voice)) errors.push("Unknown voice");
  if (
    !(
      (p.width === 1920 && p.height === 1080) ||
      (p.width === 1080 && p.height === 1920)
    ) ||
    p.fps !== 24
  )
    errors.push("Use 1080p landscape or portrait at 24 fps");
  if (typeof p.idea !== "string" || p.idea.length > 6000)
    errors.push("Invalid project brief");
  if (typeof p.music !== "boolean") errors.push("Invalid music setting");
  if (
    p.brief &&
    (typeof p.brief !== "object" ||
      Array.isArray(p.brief) ||
      Object.values(p.brief).some(
        (v) => typeof v !== "string" || v.length > 6000,
      ))
  )
    errors.push("Invalid creative brief");
  if (
    !Array.isArray(p.sources) ||
    p.sources.length > 100 ||
    p.sources.some(
      (s) =>
        !s ||
        typeof s.label !== "string" ||
        typeof s.url !== "string" ||
        !/^(https?:\/\/|assets\/[a-zA-Z0-9._-]+$)/.test(s.url),
    )
  )
    errors.push("Invalid sources");
  if (!Array.isArray(p.scenes) || !p.scenes.length || p.scenes.length > 60)
    return [...errors, "Use 1–60 scenes"];
  const ids = new Set();
  for (const s of p.scenes) {
    if (!s || typeof s !== "object") {
      errors.push("Invalid scene");
      continue;
    }
    if (!/^[a-z0-9-]+$/.test(s.id) || ids.has(s.id))
      errors.push("Scene IDs must be unique");
    ids.add(s.id);
    if (!KINDS.includes(s.kind)) errors.push(`Unknown scene kind: ${s.kind}`);
    if (!Number.isFinite(s.duration) || s.duration < 4 || s.duration > 60)
      errors.push("Scene length must be 4–60 seconds");
    for (const key of ["title", "eyebrow", "body", "narration", "note"])
      if (
        typeof s[key] !== "string" ||
        s[key].length > (key === "narration" ? 1600 : 800)
      )
        errors.push(`Invalid scene ${key}`);
    for (const image of [s.image, s.imageAlt].filter(Boolean))
      if (!/^assets\/[a-zA-Z0-9._-]+\.(png|jpe?g)$/.test(image))
        errors.push("Invalid image path");
    if (
      s.camera &&
      !["push", "pull", "track", "reveal", "locked"].includes(s.camera)
    )
      errors.push("Invalid camera");
    if (
      s.imagePrompt &&
      (typeof s.imagePrompt !== "string" || s.imagePrompt.length > 6000)
    )
      errors.push("Invalid image prompt");
    if (
      s.kind === "benchmark" &&
      (!Number.isFinite(s.baseline) ||
        s.baseline <= 0 ||
        !Number.isFinite(s.result) ||
        s.result <= 0)
    )
      errors.push("Benchmark requires positive baseline and result");
    if (
      s.items &&
      (!Array.isArray(s.items) ||
        s.items.length > 8 ||
        s.items.some((x) => typeof x !== "string" || x.length > 200))
    )
      errors.push("Invalid list items");
    errors.push(...validateComposition(s));
  }
  if (duration(p) > 900)
    errors.push("First release supports films up to 15 minutes");
  return errors;
}
export function assertProject(p) {
  const errors = validate(p);
  if (errors.length) throw new Error(errors.join("; "));
  return p;
}
export function createProject(
  {
    title,
    idea = "",
    language = "en",
    template = "explainer",
    theme = "midnight",
    brief = {},
  },
  id,
) {
  const zh = language === "zh";
  const beats =
    template === "story"
      ? zh
        ? ["一个愿望", "遇到阻碍", "做出选择", "新的开始"]
        : ["A wish", "An obstacle", "A choice", "A new beginning"]
      : template === "product"
        ? zh
          ? ["遇见问题", "认识产品", "看看它如何工作", "下一步"]
          : [
              "The problem",
              "Meet the product",
              "See it in action",
              "What comes next",
            ]
        : zh
          ? ["提出问题", "理解原理", "看看例子", "记住这一点"]
          : ["The question", "How it works", "See an example", "The takeaway"];
  const voice = zh
    ? brief.voiceTone === "warm-male"
      ? "Azure zh-CN-YunxiNeural"
      : "Azure zh-CN-XiaoxiaoNeural"
    : brief.voiceTone === "clear-female"
      ? "Azure en-US-AvaMultilingualNeural"
      : "Azure en-US-AndrewMultilingualNeural";
  return {
    schemaVersion: 1,
    id,
    title,
    idea,
    brief,
    language,
    template,
    theme,
    voice,
    music: true,
    fps: 24,
    width: brief.aspect === "9:16" ? 1080 : 1920,
    height: brief.aspect === "9:16" ? 1920 : 1080,
    status: "draft",
    createdAt: new Date().toISOString(),
    sources: [],
    scenes: beats.map((beat, i) => ({
      id: `scene-${i + 1}`,
      kind: i === 0 ? "title" : i === 3 ? "closing" : "card",
      title: i === 0 ? title : beat,
      eyebrow: `${String(i + 1).padStart(2, "0")} / ${template.toUpperCase()}`,
      body: i === 0 ? idea.slice(0, 180) : "",
      narration: "",
      note: "",
      duration: 12,
      camera: "push",
    })),
  };
}
import { validateComposition } from "./engine/schema.mjs";
