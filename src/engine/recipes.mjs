export const SHOT_RECIPES = [
  {
    id: "establish",
    name: "建立空间",
    intent: "先让观众看清场景与关系，再进入动作。",
    camera:
      "Slow pullback, then hold; foreground and background move at different rates.",
  },
  {
    id: "reveal",
    name: "揭示答案",
    intent: "让信息由动作自然出现，而非换一页。",
    camera:
      "Controlled push or mask reveal; preserve the subject position across the transition.",
  },
  {
    id: "follow",
    name: "跟随主体",
    intent: "跟着主体的目标走，保持运动方向。",
    camera:
      "Lateral track; the subject remains readable and never exits the safe frame.",
  },
  {
    id: "match",
    name: "形状衔接",
    intent: "用共同形状或位置把两个想法连起来。",
    camera:
      "Match the last key pose of one shot to the first pose of the next.",
  },
  {
    id: "contrast",
    name: "并置对比",
    intent: "同时呈现差异，让观众自己看到结论。",
    camera:
      "Locked comparison; shared scale and aligned labels; emphasize one difference at a time.",
  },
  {
    id: "anticipation",
    name: "蓄势与释放",
    intent: "重要动作先有准备，再发生，再留出反应。",
    camera:
      "Hold before impact, quick action, then slower follow-through. Couple sound to the action.",
  },
  {
    id: "depth",
    name: "层次与景深感",
    intent: "前景、中景、背景分开运动，建立 2D 深度。",
    camera:
      "Parallax from independent layers; avoid claiming a physical 3D camera.",
  },
  {
    id: "breath",
    name: "留白与停顿",
    intent: "给情绪或复杂信息被理解的时间。",
    camera:
      "Stable composition, restrained secondary movement; lower music density.",
  },
];
