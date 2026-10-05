import { generate, models } from "../google.mjs";
import { THEMES } from "../model.mjs";
import { SHOT_RECIPES } from "./recipes.mjs";
import { validateComposition } from "./schema.mjs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { hashProject } from "../../scripts/lib.mjs";
import { filmType, paletteDirection } from "../presets.mjs";
import { repairTextAnchors } from "./layout.mjs";

const CONTRACT = `Return only JSON: {"scenes":[{"id":"EXISTING_ID","composition":{"version":1,"background":"#hex","transition":"none|wipe|iris","camera":{"x":0.5,"y":0.5,"zoom":1,"tracks":[]},"layers":[]},"soundCues":[{"t":1,"type":"tick|whoosh|impact|chime","gain":0.03}]}]}.
Composition is a safe, data-only 2D film program, not HTML, JavaScript or a static slide. Use 4-16 carefully staged layers per scene and meaningful motion. Layer types: rect, ellipse, text, line, path, image, particles. Each layer has unique id, type, normalized center x,y, normalized width w and height h, fill and/or stroke as hex colors, opacity 0-1, rotation degrees, scale. Text: text, fontSize as fraction of canvas HEIGHT (0.025-0.08 typically), weight 400/500/600/700, align left/center/right; w is the wrap width. Image: asset must equal an existing supplied asset path, fit cover/contain. Rect: radius as fraction of HEIGHT. Line/path: points [[dx,dy],...] relative to the layer center, in normalized canvas coordinates; use x:0,y:0 for absolute points. Path progress 0-1 draws a path progressively. Particles: count 1-100, seed integer, size .001-.005; w,h define the motion field.
Layer and camera tracks use [{"property":"x|y|w|h|opacity|rotation|scale|progress|zoom","keys":[{"t":0,"value":0,"ease":"linear|easeIn|easeOut|easeInOut|spring"},{"t":2,"value":1,"ease":"easeOut"}]}]. Keys must be strictly increasing, within scene duration; use only properties relevant to that node. Camera x,y are normalized focus position, zoom is magnification. No per-frame mutable state. No expressions, URLs, scripts or external fonts. Use positive shape sizes. Keep text safe and readable. Captions and evidence will be overlaid by the engine: reserve the lower 17% of frame. Do NOT draw narration as a paragraph. Use the exact scene title, useful concise supporting text and visual action. Images may be backgrounds or separate subjects; leave breathing room. Four readable words beats a wall of text. Preserve provided facts and numbers. Think anticipation-action-follow-through, varied framing, continuity of movement and coherent transition grammar. Avoid a collection of UI cards. This is a movie, not a webpage. Do not imitate another movie's specific shots or characters.`;

export async function compileMotion(
  project,
  shots,
  feedback = "",
  {
    onCompiled,
    onProgress,
    generateImpl = generate,
    model = models.director,
  } = {},
) {
  const results = [];
  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i];
    const progress = (detail = {}) =>
      onProgress?.({
        sceneId: shot.id,
        index: i,
        total: shots.length,
        ...detail,
      });
    progress({ phase: "starting" });
    const [compiled] = await compileShot(project, [shot], feedback, {
      generateImpl,
      model,
      onProgress: progress,
    });
    await onCompiled?.(compiled, { index: i, total: shots.length });
    results.push(compiled);
  }
  return results;
}

async function compileShot(
  project,
  shots,
  feedback,
  { generateImpl, model, onProgress },
) {
  if (!shots.length) return [];
  const context = {
    brief: project.brief,
    bible: project.bible,
    format: [project.width, project.height],
    palette: THEMES[project.theme],
    paletteDirection: paletteDirection(
      project.theme,
      project.brief?.paletteOverride === "true",
    ),
    filmTypeDirection: filmType(project.template)?.direction,
    shots,
    posterRule:
      "Set composition.posterTime to the local time in seconds of a stable, fully revealed representative frame. All chart values and the result must be visible then. Do not choose an entrance, incomplete bar animation or blank transition.",
    layoutRules:
      "Text x is ALWAYS the center of its wrapping box, including align:left and align:right. Example: left edge 0.08 and width 0.84 requires x:0.50, not x:0.08. Never duplicate scene.note; the renderer overlays it automatically.",
    sequence: project.scenes.map((s) => ({
      id: s.id,
      title: s.title,
      duration: s.duration,
      purpose: s.direction?.purpose,
    })),
    recipes: SHOT_RECIPES,
    feedback,
  };
  let repair = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const parts = await generateImpl(
      model,
      [
        {
          role: "user",
          parts: [
            {
              text: `You are the cinematographer and motion designer of our own 2D film engine. Compile the approved shot plans into original executable motion design. ${CONTRACT}\n\nProject data: ${JSON.stringify(context)}\n${repair}`,
            },
          ],
        },
      ],
      { responseMimeType: "application/json", temperature: 0.5 },
      { timeoutMs: 600000, onProgress },
    );
    let result;
    try {
      result = JSON.parse(
        parts
          .filter((x) => x.text)
          .map((x) => x.text)
          .join(""),
      );
    } catch {
      if (attempt === 1)
        throw new Error(
          "镜头设计未返回完整 JSON，请继续制作此镜头；此前镜头已保存。",
        );
      repair =
        "Previous response was not complete valid JSON. Return exactly one complete JSON object, no markdown. Keep the requested scene within 4-16 layers.";
      continue;
    }
    if (!result || !Array.isArray(result.scenes)) {
      if (attempt === 1)
        throw new Error("镜头设计缺少 scenes 数组，此前镜头已保存。");
      repair =
        "Return a JSON object with a scenes array containing the requested scene.";
      continue;
    }
    const output = result.scenes ?? [];
    let errors = [];
    if (output.length !== shots.length)
      errors.push("Return exactly one entry for every requested scene");
    const seen = new Set();
    const assets = new Set(
      project.scenes.flatMap((s) => [s.image, s.imageAlt]).filter(Boolean),
    );
    for (const item of output) {
      if (!item || typeof item !== "object") {
        errors.push("Each scene must be an object");
        continue;
      }
      const source = shots.find((s) => s.id === item.id);
      if (!source || seen.has(item.id)) {
        errors.push("Unknown or duplicate scene id");
        continue;
      }
      seen.add(item.id);
      if (!item.composition) {
        errors.push("Missing composition");
        continue;
      }
      item.composition = repairTextAnchors(item.composition).composition;
      errors.push(...validateComposition({ ...source, ...item }));
      for (const node of item.composition.layers ?? [])
        if (node.type === "image" && !assets.has(node.asset))
          errors.push("Use only a supplied image asset");
    }
    if (!errors.length)
      return output.map((s) => ({
        id: s.id,
        composition: s.composition,
        soundCues: s.soundCues ?? [],
      }));
    repair =
      "Previous response violated the contract. Correct these issues: " +
      errors.slice(0, 20).join("; ");
    if (attempt === 1)
      throw new Error(
        "镜头设计未通过引擎校验：" + errors.slice(0, 3).join("; "),
      );
  }
}
export async function critiqueFrames(project, out) {
  const picks = [
    project.scenes[0],
    project.scenes[Math.floor(project.scenes.length / 2)],
    project.scenes.at(-1),
  ].filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i);
  const parts = [
    {
      text: `Act as an independent film art director. Review only these sampled actual rendered frames, against the brief: ${JSON.stringify(project.brief)}. Project: ${project.title}. Give specific actionable findings for composition, legibility, visual hierarchy, visual continuity and fit to purpose. Never claim to have reviewed motion or listened to sound from stills. This is not a promise of professional quality. Return JSON {summary:string,findings:[{sceneId:string,severity:"blocking"|"warning"|"note",issue:string,suggestion:string}],strengths:[string]}. Respond in Chinese. Sampled scene IDs: ${picks.map((x) => x.id).join(", ")}.`,
    },
  ];
  for (const scene of picks) {
    parts.push({ text: `Scene ${scene.id}: ${scene.title}` });
    parts.push({
      inlineData: {
        mimeType: "image/png",
        data: (
          await readFile(path.join(out, `frame-${scene.id}.png`))
        ).toString("base64"),
      },
    });
  }
  const response = await generate(
    models.director,
    [{ role: "user", parts }],
    {
      responseMimeType: "application/json",
      temperature: 0.2,
    },
    { timeoutMs: 300000 },
  );
  const result = JSON.parse(
    response
      .filter((x) => x.text)
      .map((x) => x.text)
      .join(""),
  );
  return {
    ...result,
    projectHash: hashProject(project),
    scope: "Sampled still frames only; motion and listening not reviewed",
    sceneIds: picks.map((s) => s.id),
    createdAt: new Date().toISOString(),
    model: models.director,
  };
}
