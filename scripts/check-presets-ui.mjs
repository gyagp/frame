import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { ROOT, projectDir, loadProject, hashProject } from "./lib.mjs";

const base = "http://127.0.0.1:4173";
const out = path.join(ROOT, "outputs", "ui-review", "presets");
await mkdir(out, { recursive: true });
const originals = await Promise.all(
  ["subgroup-matrix", "subgroup-matrix-v2"].map(async (id) => [
    id,
    hashProject(await loadProject(id)),
  ]),
);
const browser = await chromium.launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL || "msedge",
});
const errors = [];
let testId;
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/?project=subgroup-matrix-v2");
  await page
    .getByRole("heading", {
      name: "Subgroup Matrix — Closing the Gap",
      exact: true,
    })
    .waitFor();
  await page.locator("#new-project").click();
  await page
    .locator("#new-idea")
    .fill("A quiet documentary about restoring a local garden.");
  await page.locator("#advanced-create > summary").click();
  assert.equal(await page.locator("#new-template option").count(), 12);
  assert.equal(await page.locator("#new-theme option").count(), 12);
  await page.locator("#new-title").fill("Preset UI verification");
  await page.locator("#new-template").selectOption("documentary");
  assert.match(
    await page.locator("#new-template-hint").textContent(),
    /真实细节/,
  );
  assert.equal(await page.locator("#new-theme").inputValue(), "porcelain");
  await page.locator(".palette-library-details > summary").click();
  await page.locator('[data-palette="cobalt"]').click();
  assert.equal(await page.locator("#new-theme").inputValue(), "cobalt");
  await page.locator("#new-template").selectOption("trailer");
  assert.equal(
    await page.locator("#new-theme").inputValue(),
    "cobalt",
    "Explicit palette survives genre defaults",
  );
  await page.locator("#new-template").selectOption("documentary");
  await page.locator("#new-ai").uncheck();
  await page.locator("#new-template").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(out, "palette-library.png") });
  const created = page.waitForResponse(
    (r) =>
      r.url() === base + "/api/projects" && r.request().method() === "POST",
  );
  await page.locator("#create-submit").click();
  const createdResponse = await created;
  assert.equal(createdResponse.status(), 201);
  const p = await createdResponse.json();
  testId = p.id;
  assert.equal(p.template, "documentary");
  assert.equal(p.theme, "cobalt");
  assert.equal(p.scenes[1].title, "追问与背景");
  await page
    .getByText("结构已创建，填写各镜头内容即可开始。", { exact: true })
    .waitFor();

  // Use only our temporary film to exercise round-tripping authored custom fields.
  p.targetDuration = 168;
  p.brief.style = "Custom documentary: jade light, wide negative space";
  p.brief.sound = "An authored score direction that must survive form edits";
  p.brief.references = "A retained source reference";
  delete p.brief.reference;
  p.voice = "Azure en-US-AvaMultilingualNeural";
  p.scenes[0].composition = {
    version: 1,
    background: "#102030",
    layers: [
      {
        id: "tile",
        type: "rect",
        x: 0.5,
        y: 0.5,
        w: 0.2,
        h: 0.2,
        fill: "#ffffff",
      },
    ],
  };
  const saved = await page.request.put(base + `/api/projects/${testId}`, {
    headers: { "X-Studio-Client": "local" },
    data: p,
  });
  assert.equal(saved.status(), 200, await saved.text());
  await page.goto(base + `/?project=${testId}`);
  await page
    .getByRole("heading", { name: "Preset UI verification", exact: true })
    .waitFor();
  await page.locator("#edit-brief").click();
  assert.equal(await page.locator("#new-style").inputValue(), p.brief.style);
  assert.equal(await page.locator("#new-duration").inputValue(), "168");
  assert.equal(
    await page.locator("#new-reference").inputValue(),
    p.brief.references,
  );
  await page.locator("#advanced-create > summary").click();
  await page.locator("#new-theme").selectOption("jade");
  const updated = page.waitForResponse(
    (r) =>
      r.url() === base + `/api/projects/${testId}` &&
      r.request().method() === "PUT",
  );
  await page.locator("#create-submit").click();
  assert.equal((await updated).status(), 200);
  const persisted = await loadProject(testId);
  assert.equal(persisted.theme, "jade");
  assert.equal(persisted.targetDuration, 168);
  assert.equal(persisted.brief.style, p.brief.style);
  assert.equal(persisted.brief.sound, p.brief.sound);
  assert.equal(persisted.brief.reference, p.brief.references);
  assert.equal(persisted.voice, p.voice);
  assert.equal(persisted.brief.paletteOverride, "true");
  assert.equal(persisted.scenes[0].composition, undefined);
  await page
    .getByText("简报已保存；可点「AI 编排」按新方向改写分镜。", { exact: true })
    .waitFor();
  await page.reload();
  await page
    .getByRole("heading", { name: "Preset UI verification", exact: true })
    .waitFor();
  await page.locator("#edit-brief").click();
  await page.locator("#advanced-create > summary").click();
  await page.locator(".palette-library-details > summary").click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#new-theme-preview").scrollIntoViewIfNeeded();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  assert.equal(
    await page
      .locator("#new-dialog")
      .evaluate((e) => e.scrollWidth > e.clientWidth),
    false,
  );
  await page.screenshot({ path: path.join(out, "palette-mobile.png") });
  assert.deepEqual(errors, []);
  for (const [id, hash] of originals)
    assert.equal(hashProject(await loadProject(id)), hash);
  console.log(
    "Preset UI passed: 12 types/palettes, recommended defaults, explicit choices, durable save, custom field preservation, animation invalidation, mobile layout; user films unchanged.",
  );
} finally {
  await browser.close();
  if (testId) {
    const p = await loadProject(testId),
      target = projectDir(testId);
    if (
      p.title === "Preset UI verification" &&
      target.startsWith(path.join(ROOT, "projects") + path.sep)
    )
      await rm(target, { recursive: true, force: true });
  }
}
