// Original execution guidance synthesized from credited production references.
// This is planning data, not a renderer, simulation or quality certificate.
export const SHOT_DIRECTION_FIELDS = [
  ["framing", "构图"],
  ["space", "空间与尺度"],
  ["staging", "镜内节奏"],
  ["action", "运镜与动作"],
  ["environment", "环境响应"],
  ["ending", "结束状态"],
  ["transitionIntent", "衔接"],
  ["sound", "声音设计"],
  ["referenceRoles", "参考素材分工"],
  ["checks", "验收重点"],
];

export const SHOT_PLANNING_GUIDANCE = `For each scene also return these short string fields:
space: useful scale anchors, actor positions and readable foreground/midground/background;
staging: event phases with a clear beginning, change and settling interval, allowing time to read or feel;
action: visible actor action, target/contact, response and one dominant motivated camera path, its relative position, speed changes and stopping point; distinguish camera translation from zoom;
environment: a restrained causal response to the main action, or empty if not appropriate;
ending: final subject pose/position, prop state, camera framing and motion needed to join the next shot;
transitionIntent: how that final state connects to the following scene;
sound: voice intention and near/mid/far sound events as useful, synchronized with the visible cause;
referenceRoles: which provided reference controls identity, structure, appearance, movement or camera, what stays fixed and what may change; leave empty when none is supplied;
checks: concrete visible failure conditions to inspect, not a claim they passed.
Do not add epic effects, camera movement or physical action where a held evidence view is better. Camera and environment support one clear visual focus. Follow the user's medium and style; a reference's genre or exclusions are not universal rules. A 3D brief describes assets/rigging/animation still needed; image prompts are art direction, not proof of a 3D asset. Preserve story, visual and voiced-sample approval before full production.`;

export function normalizeDirection(scene) {
  const direction = scene.direction ?? {};
  return Object.fromEntries(
    ["purpose", ...SHOT_DIRECTION_FIELDS.map(([key]) => key)].map((key) => {
      const value =
        scene[key] ??
        direction[key] ??
        (key === "transitionIntent" ? direction.transition : undefined);
      return [key, typeof value === "string" ? value.slice(0, 1600) : ""];
    }),
  );
}
