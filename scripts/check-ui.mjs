import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { ROOT, projectDir, loadProject } from "./lib.mjs";
const base = "http://127.0.0.1:4173",
  folder = path.join(ROOT, "outputs", "ui-review");
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL || "msedge",
});
const errors = [];
let testProjectId;
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1100 },
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/?project=subgroup-matrix");
  await page
    .getByRole("heading", { name: "Subgroup Matrix", exact: true })
    .waitFor();
  await page.getByText("你的电影做好了", { exact: true }).waitFor();
  await page.locator(".scene-card").first().waitFor({state:'attached'});
  await page.screenshot({
    path: path.join(folder, "studio-desktop.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "精细调整", exact: true }).click();
  await page
    .getByRole("button", { name: "镜头 6: Prefill 2048. A clear difference." })
    .click();
  assert.equal(
    await page.locator("#scene-title").inputValue(),
    "Prefill 2048. A clear difference.",
  );
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await page.getByRole("button", { name: "暂停", exact: true }).waitFor();
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  await page.locator('[data-tab="assets"]').click();
  await page.getByText("你想看到怎样的画面？").waitFor();
  await page.screenshot({
    path: path.join(folder, "studio-assets.png"),
    fullPage: true,
  });
  await page.locator('[data-tab="sound"]').click();
  await page.getByRole("button", { name: "生成旁白并试听" }).waitFor();
  await page.locator('[data-tab="delivery"]').click();
  await page
    .getByRole("heading", { name: "审片与交付", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "＋ 新建作品", exact: true }).click();
  await page.screenshot({ path: path.join(folder, "studio-create.png") });
  await page.locator("#advanced-create > summary").click();
  await page.locator("#new-title").fill("UI verification draft");
  await page.locator("#new-idea").fill("Explain how a seed grows into a tree.");
  await page.locator("#new-ai").uncheck();
  const created = page.waitForResponse(
    (r) =>
      r.url() === base + "/api/projects" && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "生成创作方案 →" }).click();
  testProjectId = (await (await created).json()).id;
  await page
    .getByRole("heading", { name: "UI verification draft", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "精细调整", exact: true }).click();
  await page.locator("#scene-narration").fill("A seed begins a new story.");
  await page.getByRole("button", { name: "保存版本", exact: true }).click();
  await page
    .getByText("作品已保存，旧版本可在「审片与交付」中恢复。", { exact: true })
    .waitFor();
  await page.reload();
  await page.getByRole("button", { name: "精细调整", exact: true }).click();
  await page
    .locator(".project-link")
    .filter({ hasText: "UI verification draft" })
    .click();
  await page
    .getByRole("heading", { name: "UI verification draft", exact: true })
    .waitFor();
  await page.waitForFunction(
    () =>
      document.getElementById("scene-narration").value ===
      "A seed begins a new story.",
  );
  assert.equal(
    await page.locator("#scene-narration").inputValue(),
    "A seed begins a new story.",
  );
  await page.getByRole("button", { name: "复制镜头", exact: true }).click();
  assert.equal(await page.locator(".scene-card").count(), 5);
  await page.getByRole("button", { name: "保存版本", exact: true }).click();
  await page
    .locator(".project-link")
    .filter({ hasText: /^Subgroup Matrix$/ })
    .click();
  await page.getByText("你的电影做好了", { exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: path.join(folder, "studio-mobile.png"),
    fullPage: true,
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  assert.equal(overflow, false, "Mobile has horizontal overflow");
  const response = await page.request.post(base + "/api/projects", {
    data: { title: "Bad origin" },
    headers: {
      Origin: "https://unrelated.example",
      "X-Studio-Client": "local",
    },
  });
  assert.equal(response.status(), 403);
  assert.deepEqual(errors, []);
  console.log(
    "UI passed: preview, navigation, project creation, durable save, duplicate, responsive layout, origin guard.",
  );
} finally {
  await browser.close();
  if (testProjectId) {
    const p = await loadProject(testProjectId);
    const target = projectDir(testProjectId);
    if (
      p.title === "UI verification draft" &&
      target.startsWith(path.join(ROOT, "projects") + path.sep)
    )
      await rm(target, { recursive: true, force: true });
  }
}
