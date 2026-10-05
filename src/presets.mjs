import { THEMES, createProject } from "./model.mjs";

// Presets extend the existing theme registry in both browser and CLI entrypoints.
// Keep the three shipped palettes unchanged so finished films remain reproducible.
export const FILM_TYPES = [
  {
    id: "explainer",
    label: "科普 / 技术讲解",
    group: "知识与实证",
    description: "先提出问题，再讲清原理，用例子验证。",
    style: "technical editorial",
    theme: "midnight",
    zh: ["提出问题", "理解原理", "看看例子", "记住这一点"],
    en: ["The question", "How it works", "See an example", "The takeaway"],
    direction:
      "Explain one central mechanism through a concrete example. Hold diagrams and evidence long enough to read.",
  },
  {
    id: "tutorial",
    label: "教程 / 操作演示",
    group: "知识与实证",
    description: "先看成果，再按关键步骤带观众完成任务。",
    style: "Swiss motion graphics",
    theme: "cobalt",
    zh: ["你将学会什么", "准备与第一步", "关键操作", "完成与检查"],
    en: ["The outcome", "Get ready", "The key steps", "Check the result"],
    direction:
      "Show the intended result first, then a small number of ordered, observable actions and a final check. Never invent working UI or successful execution.",
  },
  {
    id: "documentary",
    label: "纪录片 / 调查观察",
    group: "知识与实证",
    description: "从真实细节切入，以证据推进发现与变化。",
    style: "cinematic realism",
    theme: "porcelain",
    zh: ["现场的一个细节", "追问与背景", "证据改变认识", "余韵与发现"],
    en: [
      "An observed detail",
      "The question behind it",
      "Evidence changes the picture",
      "What remains",
    ],
    direction:
      "Start with an observed detail, develop context, let evidence change the viewer's understanding, and close with a considered implication. No invented testimony or staged footage passed off as documentary evidence.",
  },
  {
    id: "case-study",
    label: "案例 / 成果报告",
    group: "知识与实证",
    description: "问题、行动、结果与边界，讲清一次实际改变。",
    style: "technical editorial",
    theme: "jade",
    zh: ["真实挑战", "我们的行动", "可验证的结果", "经验与边界"],
    en: [
      "The challenge",
      "The intervention",
      "Measured results",
      "Lessons and limits",
    ],
    direction:
      "Connect a concrete challenge, intervention and verifiable outcome. Preserve baselines and limitations. Never replace causal evidence with unrelated before/after numbers.",
  },
  {
    id: "product",
    label: "产品 / 功能介绍",
    group: "产品与品牌",
    description: "从用户痛点出发，用一次使用过程展示价值。",
    style: "cinematic realism",
    theme: "ember",
    zh: ["遇见问题", "认识产品", "看看它如何工作", "下一步"],
    en: [
      "The problem",
      "Meet the product",
      "See it in action",
      "What comes next",
    ],
    direction:
      "Anchor the product in a user problem, demonstrate one specific use and finish with a clear next step. Keep feature claims grounded in supplied evidence.",
  },
  {
    id: "brand",
    label: "品牌 / 广告短片",
    group: "产品与品牌",
    description: "一个鲜明感受，一个记忆点，一个明确落点。",
    style: "Swiss motion graphics",
    theme: "noir",
    zh: ["抓住注意", "建立感受", "独特价值", "品牌落点"],
    en: [
      "An arresting moment",
      "Build the feeling",
      "A distinct value",
      "The brand impression",
    ],
    direction:
      "Build a distinctive sensory idea around one value and one memorable visual motif. Give the ending room. Do not invent endorsements, testimonials or performance claims.",
  },
  {
    id: "trailer",
    label: "预告片 / 发布预热",
    group: "产品与品牌",
    description: "设置悬念、逐步加速，留下期待。",
    style: "cinematic realism",
    theme: "ocean",
    zh: ["悬念", "世界与冲突", "层层升级", "留下期待"],
    en: ["A question", "The world and conflict", "Escalation", "An invitation"],
    direction:
      "Use a question, escalating fragments, an intentional pause and a memorable invitation. Preserve the central surprise; do not invent release dates or force constant impact effects.",
  },
  {
    id: "story",
    label: "故事 / 创意短片",
    group: "叙事与表达",
    description: "一个角色、一个愿望、一次转折。",
    style: "watercolor",
    theme: "paper",
    zh: ["一个愿望", "遇到阻碍", "做出选择", "新的开始"],
    en: ["A wish", "An obstacle", "A choice", "A new beginning"],
    direction:
      "Follow one subject with a desire, obstacle and consequential choice. Show actions and reactions instead of explaining the plot on title cards.",
  },
  {
    id: "essay",
    label: "观点 / 影像随笔",
    group: "叙事与表达",
    description: "从一个问题展开思考，让结尾回应开头。",
    style: "Swiss motion graphics",
    theme: "lavender",
    zh: ["一个问题", "观察与联想", "换个角度", "回应开头"],
    en: [
      "A question",
      "Observation and association",
      "A different angle",
      "Return to the opening",
    ],
    direction:
      "Connect personal or analytical observations through one question. Use a visual motif to link ideas; distinguish interpretation from documented facts.",
  },
  {
    id: "travel",
    label: "旅行 / 城市风物",
    group: "叙事与表达",
    description: "建立地点感，走进细节，再带着感受离开。",
    style: "cinematic realism",
    theme: "forest",
    zh: ["抵达", "走入街巷", "遇见细节", "带走的记忆"],
    en: ["Arrival", "Into the place", "An encounter", "A memory to keep"],
    direction:
      "Move from place-establishing views to human-scale details and a reflective departure. Keep geography honest; identify imagined settings instead of inventing documentary location evidence.",
  },
  {
    id: "music-video",
    label: "音乐 / 节奏视觉",
    group: "音乐与意境",
    description: "用动作、重复与变化形成音乐主导的视觉段落。",
    style: "Swiss motion graphics",
    theme: "sunset",
    zh: ["建立动机", "节奏生长", "变化与高潮", "回到动机"],
    en: [
      "Introduce the motif",
      "Build the rhythm",
      "Variation and peak",
      "Return and resolve",
    ],
    direction:
      "Organize visual motifs into repetition, variation, contrast and resolution. Plan musical synchronization without claiming audio has been composed or beat-detected. Follow the user's narration setting.",
  },
  {
    id: "visual-poem",
    label: "意境 / 视觉诗",
    group: "音乐与意境",
    description: "以色彩、空间与少量意象营造情绪。",
    style: "Chinese ink wash",
    theme: "rose",
    zh: ["一个意象", "情绪流动", "意象转化", "留白"],
    en: ["An image", "A feeling moves", "Transformation", "Space to linger"],
    direction:
      "Use a few coherent images, negative space and subtle transformations. Let movement have emotional purpose. Favor restraint over explanatory paragraphs; follow the user's narration choice.",
  },
];

export const PALETTES = [
  {
    id: "midnight",
    label: "深色科技",
    group: "深色与电影感",
    description: "石墨黑与青柠点缀，适合技术讲解和发布。",
    colors: THEMES.midnight,
  },
  {
    id: "jade",
    label: "墨黑青玉",
    group: "深色与电影感",
    description: "墨黑、暖白、青玉，适合精密工程与高端纪录片。",
    colors: {
      bg: "#0a1016",
      panel: "#14232b",
      ink: "#f1eee7",
      muted: "#a1b2bd",
      accent: "#64d8cb",
      second: "#dfa861",
    },
  },
  {
    id: "ocean",
    label: "深海蓝金",
    group: "深色与电影感",
    description: "深海蓝与柔金，适合宏观叙事、预告和探索。",
    colors: {
      bg: "#091b2b",
      panel: "#152e44",
      ink: "#f0f5f8",
      muted: "#a4b9ca",
      accent: "#e4bd77",
      second: "#79c7df",
    },
  },
  {
    id: "ember",
    label: "琥珀电影",
    group: "深色与电影感",
    description: "暗酒红与暖琥珀，适合有温度的产品故事。",
    colors: THEMES.ember,
  },
  {
    id: "noir",
    label: "黑白银幕",
    group: "深色与电影感",
    description: "近黑与银白，适合品牌、悬念和简约叙事。",
    colors: {
      bg: "#101112",
      panel: "#242628",
      ink: "#f4f4ef",
      muted: "#b2b4b6",
      accent: "#e2e2dc",
      second: "#aab6c0",
    },
  },
  {
    id: "paper",
    label: "温暖纸感",
    group: "明亮与编辑感",
    description: "米白与墨绿，适合手绘、科普和纸上故事。",
    colors: THEMES.paper,
  },
  {
    id: "porcelain",
    label: "瓷白墨蓝",
    group: "明亮与编辑感",
    description: "清透暖白与墨蓝，适合访谈、纪录与理性表达。",
    colors: {
      bg: "#f5f3ed",
      panel: "#e5e8e7",
      ink: "#172b3b",
      muted: "#526674",
      accent: "#245b76",
      second: "#9a542d",
    },
  },
  {
    id: "cobalt",
    label: "钴蓝白昼",
    group: "明亮与编辑感",
    description: "冷白与鲜明钴蓝，适合教程、软件和动态图形。",
    colors: {
      bg: "#f1f5fc",
      panel: "#dfe8f5",
      ink: "#132742",
      muted: "#4b617d",
      accent: "#2457c5",
      second: "#98502d",
    },
  },
  {
    id: "forest",
    label: "森绿麦穗",
    group: "自然与情绪",
    description: "深森林绿与麦穗金，适合自然、旅行和人文。",
    colors: {
      bg: "#11241e",
      panel: "#203b30",
      ink: "#f1eee0",
      muted: "#acc0ae",
      accent: "#d8c58d",
      second: "#8dccaa",
    },
  },
  {
    id: "rose",
    label: "玫瑰奶油",
    group: "自然与情绪",
    description: "奶油粉与莓红，适合生活、情感和视觉诗。",
    colors: {
      bg: "#faf0ec",
      panel: "#eddbd6",
      ink: "#472c3a",
      muted: "#765b65",
      accent: "#a34263",
      second: "#527a70",
    },
  },
  {
    id: "lavender",
    label: "雾紫月光",
    group: "自然与情绪",
    description: "浅雾紫与深紫，适合随笔、幻想和安静思考。",
    colors: {
      bg: "#f1eff9",
      panel: "#e0ddef",
      ink: "#302840",
      muted: "#655b7d",
      accent: "#7252a5",
      second: "#356d7b",
    },
  },
  {
    id: "sunset",
    label: "暮色珊瑚",
    group: "自然与情绪",
    description: "暗靛紫与珊瑚橙，适合音乐、都市和情绪递进。",
    colors: {
      bg: "#211c32",
      panel: "#373049",
      ink: "#fff0e6",
      muted: "#c7b1c5",
      accent: "#f5a38a",
      second: "#b9ade9",
    },
  },
];

const legacyThemes = new Set(["midnight", "paper", "ember"]);
for (const p of PALETTES) if (!legacyThemes.has(p.id)) THEMES[p.id] = p.colors;

export const filmType = (id) => FILM_TYPES.find((p) => p.id === id);
export const palette = (id) => PALETTES.find((p) => p.id === id);
export function paletteFingerprint(id) {
  return legacyThemes.has(id) ? "" : JSON.stringify(palette(id)?.colors ?? {});
}
export function paletteDirection(id, override = false) {
  const p = palette(id);
  if (!p) throw new Error("Unknown palette");
  return `Palette ${p.id}: ${JSON.stringify(p.colors)}. Use bg/panel for surfaces, ink/muted for readable text, accent/second for selective emphasis. ${override ? "This explicitly selected palette replaces earlier color instructions in the brief, continuity bible and scene prompts; preserve their other creative requirements. Existing supplied photos are references, not a reason to ignore this palette." : "Use as the base palette, while respecting more specific authored scene and continuity color direction."}`;
}
export function createPresetProject(input, id) {
  const type = filmType(input.template ?? "explainer");
  if (!type) throw new Error("请选择支持的影片类型。");
  if (!palette(input.theme ?? "midnight"))
    throw new Error("请选择支持的配色。");
  const p = createProject(input, id);
  // Keep legacy drafts identical; new types have their own narrative starting points.
  if (!["explainer", "product", "story"].includes(type.id)) {
    const beats = p.language === "zh" ? type.zh : type.en;
    p.scenes.forEach((s, i) => {
      if (i) s.title = beats[i];
    });
  }
  return p;
}
