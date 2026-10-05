import { FILM_TYPES, PALETTES, filmType, palette } from "/src/presets.mjs";

const $ = (id) => document.getElementById(id);
function options(select, items, value) {
  select.replaceChildren();
  for (const group of new Set(items.map((p) => p.group))) {
    const optgroup = document.createElement("optgroup");
    optgroup.label = group;
    for (const item of items.filter((p) => p.group === group))
      optgroup.append(
        new Option(item.label, item.id, item.id === value, item.id === value),
      );
    select.append(optgroup);
  }
}
export function selectPreserving(id, value, label = value) {
  const select = $(id);
  value = String(value);
  if (![...select.options].some((o) => o.value === value)) {
    const option = new Option(label, value);
    option.dataset.custom = "true";
    select.append(option);
  }
  select.value = value;
}
export function resetCustomOptions() {
  for (const id of ["new-style", "new-duration", "new-template"])
    $(id)
      .querySelectorAll('[data-custom="true"]')
      .forEach((o) => o.remove());
}
function swatches(colors) {
  const strip = document.createElement("span");
  strip.className = "palette-swatches";
  strip.setAttribute("aria-hidden", "true");
  for (const key of ["bg", "panel", "ink", "accent", "second"]) {
    const dot = document.createElement("i");
    dot.style.backgroundColor = colors[key];
    strip.append(dot);
  }
  return strip;
}
export function showPalette(selectId) {
  const p = palette($(selectId).value);
  const preview = $(selectId + "-preview");
  if (!p || !preview) return;
  preview.replaceChildren();
  const sample = document.createElement("div");
  sample.className = "palette-sample";
  sample.style.backgroundColor = p.colors.bg;
  sample.style.color = p.colors.ink;
  const title = document.createElement("strong");
  title.textContent = "让故事有自己的颜色";
  const subtitle = document.createElement("span");
  subtitle.style.color = p.colors.accent;
  subtitle.textContent = "LIGHT · COLOR · EMOTION";
  sample.append(title, subtitle, swatches(p.colors));
  const hint = document.createElement("p");
  hint.textContent = p.description;
  preview.append(sample, hint);
  if (selectId === "new-theme")
    document
      .querySelectorAll("[data-palette]")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.palette === p.id)),
      );
}
export function showFilmType() {
  const type = filmType($("new-template").value);
  $("new-template-hint").textContent =
    type?.description ?? "保留当前作品的自定义类型。";
  $("new-template-beats").textContent = type?.zh.join(" → ") ?? "";
}
export function mountPresets() {
  options($("new-template"), FILM_TYPES, "explainer");
  for (const id of ["new-theme", "theme"]) options($(id), PALETTES, "midnight");
  for (const p of PALETTES) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "palette-choice";
    b.dataset.palette = p.id;
    b.setAttribute("aria-label", p.label + "：" + p.description);
    b.append(swatches(p.colors), document.createTextNode(p.label));
    b.onclick = () => {
      $("new-theme").value = p.id;
      $("new-theme").dispatchEvent(new Event("change", { bubbles: true }));
    };
    $("palette-library").append(b);
  }
  showFilmType();
  showPalette("new-theme");
  showPalette("theme");
}
