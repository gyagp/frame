import { THEMES, sceneAt, duration, subtitles } from "./model.mjs";
import { drawComposition } from "./engine/renderer.mjs";

export const WIDTH = 1600,
  HEIGHT = 900;
const clamp = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => 1 - (1 - clamp(x)) ** 3;
function box(c, x, y, w, h, fill, radius = 14, stroke) {
  c.beginPath();
  c.roundRect(x, y, w, h, radius);
  c.fillStyle = fill;
  c.fill();
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = 1;
    c.stroke();
  }
}
function txt(
  c,
  text,
  x,
  y,
  size,
  color,
  weight = 400,
  align = "left",
  family = "Studio Sans",
) {
  c.font = `${weight} ${size}px "${family}", Arial, sans-serif`;
  c.fillStyle = color;
  c.textAlign = align;
  c.textBaseline = "top";
  c.fillText(String(text), x, y);
}
export function wrap(c, text, maxWidth, size, weight = 400) {
  c.font = `${weight} ${size}px "Studio Sans", Arial, sans-serif`;
  return String(text)
    .split("\n")
    .flatMap((paragraph) => {
      const words = /[\u3400-\u9fff]/.test(paragraph)
        ? [...paragraph]
        : paragraph.split(" ");
      const separator = /[\u3400-\u9fff]/.test(paragraph) ? "" : " ";
      const lines = [];
      let line = "";
      for (const word of words) {
        const candidate = line ? line + separator + word : word;
        if (c.measureText(candidate).width > maxWidth && line) {
          lines.push(line);
          line = word;
        } else line = candidate;
      }
      if (line) lines.push(line);
      return lines;
    });
}
function paragraph(
  c,
  text,
  x,
  y,
  maxWidth,
  size,
  color,
  weight = 400,
  leading = 1.3,
  maxLines = 5,
) {
  const lines = wrap(c, text, maxWidth, size, weight).slice(0, maxLines);
  lines.forEach((line, i) =>
    txt(c, line, x, y + i * size * leading, size, color, weight),
  );
  return lines.length * size * leading;
}
function rule(c, x1, y1, x2, y2, color, width = 1) {
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.strokeStyle = color;
  c.lineWidth = width;
  c.stroke();
}
function pill(c, text, x, y, color, fill) {
  c.font = '600 17px "Studio Sans", Arial';
  const w = c.measureText(text).width + 30;
  box(c, x, y, w, 34, fill, 17);
  txt(c, text, x + 15, y + 7, 17, color, 600);
}
function matrix(c, data, x, y, label, color, p, highlight = -1, cell = 66) {
  txt(c, label, x, y - 47, 25, color, 600);
  data.forEach((row, r) =>
    row.forEach((n, col) => {
      const i = r * row.length + col;
      const on = i === highlight;
      box(
        c,
        x + col * (cell + 7),
        y + r * (cell + 7),
        cell,
        cell,
        on ? color : p.panel,
        7,
        on ? color : "#53647055",
      );
      txt(
        c,
        n,
        x + col * (cell + 7) + cell / 2,
        y + r * (cell + 7) + cell / 2 - 16,
        27,
        on ? p.bg : p.ink,
        600,
        "center",
      );
    }),
  );
}
function background(c, p, t) {
  c.fillStyle = p.bg;
  c.fillRect(0, 0, WIDTH, HEIGHT);
  const glow = c.createRadialGradient(1260, 300, 20, 1260, 300, 800);
  glow.addColorStop(0, p.accent + "0d");
  glow.addColorStop(1, p.bg + "00");
  c.fillStyle = glow;
  c.fillRect(0, 0, WIDTH, HEIGHT);
  for (let x = 80; x < WIDTH; x += 80) rule(c, x, 0, x, HEIGHT, p.muted + "09");
  for (let y = 20; y < HEIGHT; y += 80) rule(c, 0, y, WIDTH, y, p.muted + "09");
  rule(c, 80, 110, 1520, 110, p.muted + "38");
  txt(c, "FRAME / MOVIE STUDIO", 80, 48, 16, p.muted, 600);
  txt(c, "A FILM BUILT FROM IDEAS", 1520, 48, 14, p.muted, 400, "right");
}
export function drawFrame(
  c,
  project,
  seconds,
  assets = {},
  cues = null,
  options = {},
) {
  const compositionTime = Math.max(
      0,
      Math.min(duration(project) - 0.001, seconds),
    ),
    compositionScene = sceneAt(project, compositionTime);
  if (compositionScene?.composition)
    return drawComposition(
      c,
      project,
      compositionScene,
      compositionTime,
      assets,
      cues ?? subtitles(project),
      options,
    );
  if (c.canvas.width < c.canvas.height)
    return drawPortrait(c, project, seconds, assets, cues, options);
  const t = Math.max(0, Math.min(duration(project) - 0.001, seconds));
  const s = sceneAt(project, t);
  if (!s) return;
  const local = t - s.start;
  const p = THEMES[project.theme] ?? THEMES.midnight;
  const intro = ease(local / 0.8);
  c.save();
  c.scale(c.canvas.width / WIDTH, c.canvas.height / HEIGHT);
  background(c, p, t);
  const cameraProgress = clamp(local / s.duration);
  const camera = s.camera ?? "locked";
  const hero =
    (s.kind === "image" || s.kind === "title" || s.kind === "closing") &&
    assets[s.image];
  if (hero) {
    c.save();
    c.beginPath();
    c.rect(0, 112, WIDTH, 660);
    c.clip();
    const scale =
      Math.max(WIDTH / hero.width, HEIGHT / hero.height) *
      (camera === "pull"
        ? 1.1 - 0.08 * cameraProgress
        : camera === "push"
          ? 1.01 + 0.09 * cameraProgress
          : 1.07);
    const w = hero.width * scale,
      h = hero.height * scale;
    const pan =
      camera === "track"
        ? (cameraProgress - 0.5) * 100
        : camera === "reveal"
          ? (1 - ease(cameraProgress)) * 80
          : 0;
    c.drawImage(hero, (WIDTH - w) / 2 + pan, (HEIGHT - h) / 2, w, h);
    const shade = c.createLinearGradient(0, 0, WIDTH, 0);
    shade.addColorStop(0, p.bg + "f5");
    shade.addColorStop(0.65, p.bg + "75");
    shade.addColorStop(1, p.bg + "18");
    c.fillStyle = shade;
    c.fillRect(0, 0, WIDTH, HEIGHT);
    const bottom = c.createLinearGradient(0, 550, 0, 780);
    bottom.addColorStop(0, p.bg + "00");
    bottom.addColorStop(1, p.bg);
    c.fillStyle = bottom;
    c.fillRect(0, 550, WIDTH, 250);
    c.restore();
  }
  txt(c, s.eyebrow, 80, 145, 17, p.accent, 600);
  c.save();
  c.globalAlpha = 0.3 + 0.7 * intro;
  c.translate(0, 18 * (1 - intro));
  if (!hero) {
    const z =
      camera === "push"
        ? 1 + cameraProgress * 0.025
        : camera === "pull"
          ? 1.025 - cameraProgress * 0.025
          : 1;
    const x = camera === "track" ? (cameraProgress - 0.5) * 22 : 0,
      y = camera === "reveal" ? (1 - ease(cameraProgress)) * 16 : 0;
    c.translate(800 + x, 450 + y);
    c.scale(z, z);
    c.translate(-800, -450);
  }
  const big = ["title", "closing"].includes(s.kind);
  const headingHeight = paragraph(
    c,
    s.title,
    80,
    big ? 228 : 193,
    big ? 1000 : 1420,
    big ? 88 : 51,
    p.ink,
    700,
    1.08,
    3,
  );
  if (big) {
    paragraph(
      c,
      s.body,
      85,
      Math.max(487, 228 + headingHeight + 28),
      830,
      27,
      p.muted,
      400,
      1.5,
      3,
    );
    const cells = 6,
      size = 43,
      gap = 8;
    const baseX = 1150,
      baseY = 275;
    if (!hero)
      for (let r = 0; r < cells; r++)
        for (let col = 0; col < cells; col++) {
          const phase = (r + col) * 0.24;
          const bright = (Math.sin(local * 1.3 - phase) + 1) / 2;
          const grow = ease((local - r * 0.07 - col * 0.04) / 1.2);
          c.save();
          c.translate(baseX + col * (size + gap), baseY + r * (size + gap));
          c.rotate((1 - grow) * 0.35);
          box(
            c,
            0,
            0,
            size * grow,
            size * grow,
            bright > 0.6 ? p.accent : bright > 0.25 ? p.second : p.panel,
            5,
          );
          c.restore();
        }
    pill(
      c,
      s.kind === "closing"
        ? "BUILD → VALIDATE → MEASURE"
        : "01 / THE EXECUTION SHIFT",
      85,
      665,
      p.accent,
      p.accent + "13",
    );
  } else if (s.kind === "matrix") {
    txt(c, s.body, 80, 287, 29, p.muted, 500);
    const step = Math.floor(local / 3) % 4;
    matrix(
      c,
      [
        [1, 2, 3],
        [4, 5, 6],
      ],
      155,
      409,
      "A · 2 × 3",
      p.second,
      p,
      -1,
      65,
    );
    txt(c, "×", 410, 455, 40, p.muted);
    matrix(
      c,
      [
        [7, 8],
        [9, 10],
        [11, 12],
      ],
      485,
      372,
      "B · 3 × 2",
      p.second,
      p,
      -1,
      59,
    );
    txt(c, "+", 650, 455, 40, p.muted);
    matrix(
      c,
      [
        [1, 1],
        [1, 1],
      ],
      720,
      409,
      "C · 2 × 2",
      p.muted,
      p,
      -1,
      65,
    );
    txt(c, "=", 905, 455, 40, p.muted);
    matrix(
      c,
      [
        [59, 65],
        [140, 155],
      ],
      1000,
      409,
      "C′ · 2 × 2",
      p.accent,
      p,
      step,
      80,
    );
    const equations = [
      "1 × 7 + 2 × 9 + 3 × 11 + 1 = 59",
      "1 × 8 + 2 × 10 + 3 × 12 + 1 = 65",
      "4 × 7 + 5 × 9 + 6 × 11 + 1 = 140",
      "4 × 8 + 5 × 10 + 6 × 12 + 1 = 155",
    ];
    box(c, 150, 663, 1250, 65, p.panel, 9);
    txt(c, equations[step], 775, 681, 29, p.accent, 500, "center");
  } else if (s.kind === "lanes") {
    [80, 830].forEach((x, index) => {
      box(c, x, 353, 690, 350, p.panel, 20);
      txt(
        c,
        index ? "COOPERATIVE MATRIX PATH" : "LANE-LEVEL FMA PATH",
        x + 30,
        382,
        21,
        index ? p.accent : p.second,
        600,
      );
      for (let i = 0; i < 8; i++) {
        const y = 439;
        box(
          c,
          x + 29 + i * 79,
          y,
          65,
          42,
          index ? p.accent + "28" : p.second + "28",
          6,
        );
        txt(
          c,
          `L${i}`,
          x + 62 + i * 79,
          y + 10,
          20,
          index ? p.accent : p.second,
          500,
          "center",
        );
        const prog = (local * (index ? 0.3 : 0.6) + i * 0.12) % 1;
        rule(
          c,
          x + 62 + i * 79,
          484,
          x + (index ? 345 : 62 + i * 79),
          553,
          p.muted + "44",
          2,
        );
        box(
          c,
          x + 62 + i * 79 + (index ? (345 - 62 - i * 79) * prog : 0) - 3,
          485 + prog * 66,
          6,
          6,
          index ? p.accent : p.second,
          2,
        );
      }
      if (index) {
        box(c, x + 84, 555, 520, 74, p.accent, 10);
        txt(
          c,
          "MATRIX MULTIPLY + ACCUMULATE",
          x + 344,
          580,
          23,
          p.bg,
          700,
          "center",
        );
      } else
        for (let i = 0; i < 8; i++) {
          box(c, x + 29 + i * 79, 563, 65, 58, p.second + "22", 6);
          txt(c, "FMA", x + 62 + i * 79, 581, 18, p.second, 600, "center");
        }
      txt(
        c,
        index
          ? "Lanes cooperate on distributed fragments"
          : "Many operations build the output tile",
        x + 345,
        658,
        21,
        p.muted,
        400,
        "center",
      );
    });
  } else if (s.kind === "pipeline") {
    box(c, 490, 302, 620, 85, p.accent, 13);
    txt(c, "WebGPU / WGSL", 800, 317, 29, p.bg, 700, "center");
    txt(c, "Dawn validates · Tint lowers", 800, 355, 19, p.bg, 500, "center");
    const data = [
      ["Vulkan", "SPIR-V", "Cooperative matrices"],
      ["Metal", "MSL", "SIMD-group matrices"],
      ["D3D12", "HLSL → DXIL", "SM 6.10 LinAlg"],
    ];
    data.forEach((d, i) => {
      const x = 80 + i * 490;
      rule(c, 800, 390, x + 230, 457, p.muted + "55", 2);
      const z = ease((local - 0.5 - i * 0.5) / 1);
      c.save();
      c.globalAlpha = 0.25 + 0.75 * z;
      box(c, x, 457, 460, 220, p.panel, 15, p.muted + "33");
      txt(c, d[0], x + 28, 484, 37, i === 2 ? p.accent : p.ink, 600);
      txt(c, d[1], x + 28, 542, 24, p.second, 500);
      txt(c, d[2], x + 28, 606, 23, p.muted);
      c.restore();
    });
    txt(c, s.body, 800, 718, 23, p.muted, 400, "center");
  } else if (
    s.kind === "benchmark" &&
    (!Number.isFinite(s.baseline) ||
      !Number.isFinite(s.result) ||
      s.baseline <= 0 ||
      s.result <= 0)
  ) {
    paragraph(
      c,
      "Add positive measured values in the shot details.",
      80,
      400,
      1300,
      38,
      p.muted,
    );
  } else if (s.kind === "benchmark") {
    txt(c, s.body, 80, 275, 25, p.muted);
    const ratio = s.result / s.baseline;
    const anim = ease((local - 1.8) / 3);
    const max = s.result;
    [
      ["FP16 FMA", s.baseline, p.second],
      ["LinAlg", s.result, p.accent],
    ].forEach(([label, value, color], i) => {
      const y = 386 + i * 127;
      txt(c, label, 83, y + 13, 26, p.ink, 500);
      box(c, 310, y, 820, 65, p.panel, 7);
      box(c, 310, y, Math.max(1, (value / max) * 820 * anim), 65, color, 7);
      txt(c, value.toFixed(2), 1190, y - 1, 43, color, 600);
      txt(c, "TFLOP/s", 1193, y + 50, 19, p.muted);
    });
    txt(c, `${ratio.toFixed(2)}×`, 87, 660, 77, p.accent, 700);
    txt(c, "RECORDED SPEEDUP", 337, 696, 21, p.muted, 500);
  } else if (s.kind === "image" && hero) {
    paragraph(c, s.body, 80, 650, 1150, 32, p.ink, 500, 1.3, 2);
  } else if (s.kind === "demo" || s.kind === "image") {
    const which =
      s.kind === "demo" && local > s.duration / 2 && s.imageAlt
        ? s.imageAlt
        : s.image;
    const img = assets[which];
    const area = { x: 180, y: 288, w: 1240, h: 450 };
    box(c, area.x - 8, area.y - 8, area.w + 16, area.h + 16, p.panel, 10);
    if (img) {
      const scale = Math.min(area.w / img.width, area.h / img.height);
      const w = img.width * scale,
        h = img.height * scale;
      c.drawImage(
        img,
        area.x + (area.w - w) / 2,
        area.y + (area.h - h) / 2,
        w,
        h,
      );
    } else {
      txt(c, "Your visual goes here", 800, 465, 36, p.muted, 500, "center");
      txt(
        c,
        "Add an image in the studio",
        800,
        520,
        22,
        p.muted,
        400,
        "center",
      );
    }
    if (s.kind === "demo")
      pill(
        c,
        local > s.duration / 2 ? "MLP UP / 4.13×" : "PREFILL 2048 / 3.74×",
        1150,
        240,
        p.accent,
        p.panel,
      );
  } else if (s.kind === "compare") {
    const cards = [
      ["D3D12 / RX 9070 XT", "FP16 FMA baseline", "2.70–4.13×", p.accent],
      ["Vulkan / cross-vendor", "INT8 DP4A baseline", "0.89–1.68×", p.second],
    ];
    cards.forEach(([a, b, d, color], i) => {
      const x = 80 + i * 750;
      box(c, x, 350, 690, 268, p.panel, 15);
      txt(c, a, x + 30, 384, 23, p.ink, 600);
      txt(c, b, x + 30, 432, 23, p.muted);
      txt(c, d, x + 30, 489, 62, color, 600);
    });
    paragraph(c, s.body, 80, 671, 1400, 31, p.ink, 500, 1.3, 2);
  } else {
    const items = s.items?.length ? s.items : [];
    if (items.length) {
      txt(c, s.body, 80, 282, 26, p.muted);
      items.forEach((item, i) => {
        const y = 348 + i * 88;
        const alpha = ease((local - i * 0.6) / 0.8);
        c.save();
        c.globalAlpha = 0.3 + 0.7 * alpha;
        box(c, 80, y, 1440, 71, p.panel, 10);
        txt(
          c,
          `${String(i + 1).padStart(2, "0")}`,
          104,
          y + 20,
          26,
          p.accent,
          600,
        );
        txt(c, item, 181, y + 19, 28, p.ink, 500);
        c.restore();
      });
    } else {
      paragraph(c, s.body, 80, 355, 1300, 44, p.muted, 400, 1.5, 6);
      rule(c, 80, 700, 80 + 600 * ease(local / 2), 700, p.accent, 6);
    }
  }
  c.restore();
  // A short matrix-shaped wipe reveals the new scene without fading to black.
  if (local < 0.45 && s.start > 0) {
    const prog = local / 0.45;
    for (let col = 0; col < 12; col++) {
      const remaining = 1 - ease((prog - col * 0.025) / 0.65);
      if (remaining > 0) {
        c.fillStyle = p.panel;
        c.fillRect((col * WIDTH) / 12, 112, WIDTH / 12 + 1, 660 * remaining);
      }
    }
  }
  // Evidence remains on screen even while titles and bars move.
  paragraph(c, s.note, 80, 774, 1440, 15, p.muted, 400, 1.2, 2);
  const cue = (cues ?? subtitles(project)).find(
    (x) => t >= x.start && t < x.end,
  );
  if (cue && options.captions !== false) {
    const lines = wrap(c, cue.text, 1330, 25, 500);
    const h = lines.length * 30 + 20;
    box(c, 100, 871 - h, 1400, h, p.bg + "ef", 7);
    lines.forEach((line, i) =>
      txt(c, line, 800, 881 - h + i * 30, 25, p.ink, 500, "center"),
    );
  }
  c.fillStyle = p.accent;
  c.fillRect(0, 897, (WIDTH * t) / duration(project), 3);
  c.restore();
}

function drawPortrait(c, pj, seconds, assets, cues, options) {
  const t = Math.max(0, Math.min(duration(pj) - 0.001, seconds)),
    s = sceneAt(pj, t),
    p = THEMES[pj.theme],
    local = t - s.start;
  c.save();
  c.scale(c.canvas.width / 900, c.canvas.height / 1600);
  c.fillStyle = p.bg;
  c.fillRect(0, 0, 900, 1600);
  for (let x = 50; x < 900; x += 80) rule(c, x, 0, x, 1600, p.muted + "0c");
  const img =
    assets[
      s.kind === "demo" && local > s.duration / 2 && s.imageAlt
        ? s.imageAlt
        : s.image
    ];
  if (img && s.kind !== "demo") {
    c.save();
    const progress = local / s.duration,
      scale =
        Math.max(900 / img.width, 1600 / img.height) *
        (s.camera === "pull"
          ? 1.12 - progress * 0.1
          : s.camera === "push"
            ? 1 + progress * 0.1
            : 1.1),
      w = img.width * scale,
      h = img.height * scale;
    c.drawImage(
      img,
      (900 - w) / 2 + (s.camera === "track" ? (progress - 0.5) * 60 : 0),
      (1600 - h) / 2,
      w,
      h,
    );
    const shade = c.createLinearGradient(0, 0, 0, 1600);
    shade.addColorStop(0, p.bg + "e8");
    shade.addColorStop(0.45, p.bg + "42");
    shade.addColorStop(0.72, p.bg + "bb");
    shade.addColorStop(1, p.bg);
    c.fillStyle = shade;
    c.fillRect(0, 0, 900, 1600);
    c.restore();
  }
  txt(c, "FRAME / MOVIE STUDIO", 56, 52, 18, p.muted, 600);
  rule(c, 56, 95, 844, 95, p.muted + "44");
  paragraph(c, s.eyebrow, 56, 130, 788, 20, p.accent, 600, 1.4, 2);
  const titleSize = ["title", "closing"].includes(s.kind) ? 72 : 57;
  const titleHeight = paragraph(
    c,
    s.title,
    56,
    213,
    780,
    titleSize,
    p.ink,
    700,
    1.1,
    5,
  );
  const top = Math.max(460, 213 + titleHeight + 60);
  if (s.kind === "matrix") {
    matrix(
      c,
      [
        [1, 2, 3],
        [4, 5, 6],
      ],
      65,
      top + 40,
      "A · 2×3",
      p.second,
      p,
      -1,
      75,
    );
    txt(c, "×", 345, top + 90, 48, p.muted);
    matrix(
      c,
      [
        [7, 8],
        [9, 10],
        [11, 12],
      ],
      460,
      top,
      "B · 3×2",
      p.second,
      p,
      -1,
      75,
    );
    txt(c, "C′ = A × B + C", 450, top + 300, 45, p.accent, 600, "center");
    matrix(
      c,
      [
        [59, 65],
        [140, 155],
      ],
      300,
      top + 420,
      "C′ · 2×2",
      p.accent,
      p,
      Math.floor(local / 3) % 4,
      124,
    );
  } else if (s.kind === "lanes") {
    ["LANE-LEVEL FMA", "COOPERATIVE MATRIX"].forEach((label, i) => {
      const y = top + i * 295;
      box(c, 56, y, 788, 245, p.panel, 18);
      txt(c, label, 86, y + 25, 28, i ? p.accent : p.second, 600);
      for (let n = 0; n < 6; n++) {
        box(
          c,
          88 + n * 120,
          y + 85,
          96,
          55,
          (i ? p.accent : p.second) + "28",
          6,
        );
        txt(c, `L${n}`, 136 + n * 120, y + 98, 26, p.ink, 500, "center");
      }
      txt(
        c,
        i ? "One distributed matrix operation" : "Many lane-level operations",
        450,
        y + 180,
        29,
        i ? p.accent : p.second,
        500,
        "center",
      );
    });
  } else if (
    s.kind === "benchmark" &&
    (!Number.isFinite(s.baseline) ||
      !Number.isFinite(s.result) ||
      s.baseline <= 0 ||
      s.result <= 0)
  ) {
    paragraph(
      c,
      "Add measured values in shot details.",
      56,
      top,
      780,
      39,
      p.muted,
    );
  } else if (s.kind === "benchmark") {
    paragraph(c, s.body, 56, top, 780, 30, p.muted);
    [
      ["FP16 FMA", s.baseline, p.second],
      ["LinAlg", s.result, p.accent],
    ].forEach(([label, val, color], i) => {
      const y = top + 140 + i * 170;
      txt(c, label, 56, y, 31, p.ink, 500);
      box(c, 56, y + 53, 630, 62, p.panel, 8);
      box(
        c,
        56,
        y + 53,
        Math.max(1, (val / s.result) * 630 * ease((local - 1) / 3)),
        62,
        color,
        8,
      );
      txt(c, val.toFixed(2), 710, y + 58, 32, color, 600);
    });
    txt(
      c,
      `${(s.result / s.baseline).toFixed(2)}×`,
      56,
      top + 530,
      116,
      p.accent,
      700,
    );
    txt(c, "RECORDED SPEEDUP", 56, top + 668, 29, p.muted, 500);
  } else if (s.kind === "pipeline") {
    [
      "WebGPU / WGSL",
      "Dawn validates · Tint lowers",
      "Vulkan · Metal · D3D12",
    ].forEach((label, i) => {
      box(c, 56, top + i * 170, 788, 105, i === 1 ? p.accent : p.panel, 14);
      txt(
        c,
        label,
        450,
        top + 34 + i * 170,
        31,
        i === 1 ? p.bg : p.ink,
        600,
        "center",
      );
      if (i < 2)
        txt(c, "↓", 450, top + 112 + i * 170, 35, p.muted, 400, "center");
    });
    paragraph(c, s.body, 56, top + 560, 760, 32, p.muted);
  } else if (s.kind === "demo" && img) {
    const k = Math.min(788 / img.width, 800 / img.height),
      w = img.width * k,
      h = img.height * k;
    box(c, 46, top - 10, 808, h + 20, p.panel, 10);
    c.drawImage(img, (900 - w) / 2, top, w, h);
    paragraph(c, s.body, 56, top + h + 65, 780, 38, p.ink);
  } else if (s.kind === "compare") {
    ["D3D12 · FP16 FMA baseline", "Vulkan · INT8 DP4A baseline"].forEach(
      (label, i) => {
        box(c, 56, top + i * 240, 788, 197, p.panel, 16);
        txt(c, label, 90, top + 30 + i * 240, 28, p.muted);
        txt(
          c,
          i ? "0.89–1.68×" : "2.70–4.13×",
          90,
          top + 92 + i * 240,
          61,
          i ? p.second : p.accent,
          700,
        );
      },
    );
    paragraph(c, s.body, 56, top + 555, 780, 33, p.ink);
  } else if (s.items?.length) {
    s.items.slice(0, 5).forEach((item, i) => {
      const y = top + i * 133;
      box(c, 56, y, 788, 114, p.panel, 12);
      txt(c, String(i + 1).padStart(2, "0"), 80, y + 35, 31, p.accent, 600);
      paragraph(c, item, 156, y + 30, 648, 31, p.ink, 500, 1.3, 2);
    });
  } else {
    paragraph(c, s.body, 56, img ? 1030 : top, 770, 43, p.ink, 400, 1.45, 5);
    if (!img) {
      rule(
        c,
        56,
        top + 430,
        56 + 650 * ease(local / 2),
        top + 430,
        p.accent,
        7,
      );
    }
  }
  const cue = (cues ?? subtitles(pj)).find((x) => t >= x.start && t < x.end);
  if (cue && options.captions !== false) {
    const lines = wrap(c, cue.text, 760, 34, 500);
    const h = lines.length * 43 + 30;
    box(c, 40, 1480 - h, 820, h, p.bg + "f2", 10);
    lines.forEach((line, i) =>
      txt(c, line, 450, 1495 - h + i * 43, 34, p.ink, 500, "center"),
    );
  }
  paragraph(c, s.note, 56, 1510, 790, 18, p.muted, 400, 1.3, 3);
  c.fillStyle = p.accent;
  c.fillRect(0, 1595, (900 * t) / duration(pj), 5);
  c.restore();
}
