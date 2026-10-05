import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "./lib.mjs";
const base = "http://127.0.0.1:4173",
  out = path.join(ROOT, "outputs", "ui-review");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL || "msedge",
});
const errors = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1500, height: 1050 },
  });
  page.on("pageerror", (e) => errors.push(e.message));
  const before = await (
    await fetch(base + "/api/projects/subgroup-matrix/review")
  ).json();
  let writes = 0;
  await page.route("**/api/projects/subgroup-matrix/*", async (route) => {
    if (route.request().method() !== "GET") {
      writes++;
      return route.abort();
    }
    return route.continue();
  });
  await page.goto(base);
  await page.getByText("你的电影做好了", { exact: true }).waitFor();
  assert.equal(await page.locator("video:visible").count(), 1);
  assert.equal(await page.locator(".inspector").isVisible(), false);
  await page.screenshot({
    path: path.join(out, "guided-complete.png"),
    fullPage: true,
  });
  const downloaded = page.waitForEvent("download");
  await page.locator("#review-next").click();
  const download = await downloaded;
  assert.ok(download.suggestedFilename().endsWith(".mp4"));
  assert.equal(writes, 0, "Download must never trigger rendering or approvals");
  await page.getByRole("button", { name: "精细调整", exact: true }).click();
  assert.equal(await page.locator("#scene-narration").isVisible(), true);
  await page
    .getByRole("button", { name: "返回引导工作台", exact: true })
    .click();
  assert.equal(await page.locator(".inspector").isVisible(), false);
  await page.locator("#new-project").click();
  await page
    .locator("#new-idea")
    .fill("给新用户做一部英文产品演示，2-3分钟，竖屏。");
  assert.equal(await page.locator("#new-language").inputValue(), "en");
  assert.equal(await page.locator("#new-duration").inputValue(), "150");
  assert.equal(await page.locator("#new-aspect").inputValue(), "9:16");
  assert.equal(await page.locator("#new-language").isVisible(), false);
  await page.screenshot({ path: path.join(out, "guided-new.png") });
  await page.locator("#format-options summary").click();
  await page.locator("#new-language").selectOption("zh");
  await page.locator("#new-idea").fill("English video, 90 seconds");
  assert.equal(
    await page.locator("#new-language").inputValue(),
    "zh",
    "Explicit settings win over inferred defaults",
  );
  assert.equal(await page.locator("#new-duration").inputValue(), "90");
  await page.locator("#close-dialog").click();
  await page.locator("#open-settings").click();
  await page.locator("#connections-dialog").waitFor();
  assert.equal(await page.locator("#google-key").inputValue(), "");
  assert.equal(await page.locator("#speech-key").inputValue(), "");
  const publicConfig = await (await fetch(base + "/api/settings")).json();
  assert.ok(!("apiKey" in publicConfig.google));
  assert.ok(!("token" in publicConfig.copilot));
  assert.ok(!("key" in publicConfig.speech));
  await page.locator("#director-provider").selectOption("copilot");
  await page.screenshot({ path: path.join(out, "connections.png") });
  let saved;
  await page.route("**/api/settings", async (route) => {
    if (route.request().method() === "PUT") {
      saved = route.request().postDataJSON();
      return route.fulfill({
        json: {
          ...publicConfig,
          director: saved.director,
          copilot: {
            ...publicConfig.copilot,
            model: saved.copilot.model,
            tokenConfigured: true,
          },
        },
      });
    }
    return route.continue();
  });
  await page.route("**/api/settings/test", (route) =>
    route.fulfill({
      json: {
        ok: true,
        message: "Test connection verified",
        models: [
          { id: "auto", name: "Auto" },
          { id: "gpt-6-astra", name: "GPT-6 Astra" },
          { id: "gpt-6-sol", name: "GPT-6 Sol" },
        ],
      },
    }),
  );
  await page.locator("#copilot-token").fill("test-placeholder-token");
  await page.locator('[data-test-connection="director"]').click();
  await page.getByText("Test connection verified", { exact: true }).waitFor();
  await page.locator("#copilot-model").selectOption("gpt-6-astra");
  assert.equal(
    saved,
    undefined,
    "Connection checks must not overwrite working settings",
  );
  await page.locator("#connections-save").click();
  await page
    .getByText("设置已保存，接下来的制作会使用这些连接。", { exact: true })
    .waitFor();
  assert.equal(saved.copilot.token, "test-placeholder-token");
  assert.equal(saved.copilot.model, "gpt-6-astra");
  assert.equal(await page.locator("#copilot-token").inputValue(), "");
  await page.locator("#connections-close").click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: path.join(out, "guided-mobile.png"),
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );

  // Review behavior is isolated with mocked endpoints, without touching the user's film.
  const staged = await browser.newPage({
    viewport: { width: 1500, height: 1050 },
  });
  staged.on("pageerror", (e) => errors.push(e.message));
  const outputs = await (
    await fetch(base + "/api/projects/subgroup-matrix/outputs")
  ).json();
  const current = outputs.find((o) => o.current);
  let job = null;
  const called = [];
  await staged.route("**/api/projects/subgroup-matrix/review", (r) =>
    r.fulfill({
      json: {
        storyApproved: true,
        framesApproved: false,
        sampleApproved: false,
      },
    }),
  );
  await staged.route("**/api/projects/subgroup-matrix/outputs", (r) =>
    r.fulfill({ json: [{ ...current, files: ["storyboard.jpg"] }] }),
  );
  await staged.route("**/api/projects/subgroup-matrix/job", (r) =>
    r.fulfill({ json: job }),
  );
  for (const action of ["approve-frames", "sample", "render"])
    await staged.route("**/api/projects/subgroup-matrix/" + action, (r) => {
      called.push(action);
      if (action === "sample")
        job = {
          id: "mock",
          projectId: "subgroup-matrix",
          type: "sample",
          status: "running",
          message: "正在制作有声试看片",
          progress: 40,
        };
      return r.fulfill({
        status: action === "approve-frames" ? 200 : 202,
        json: job ?? {},
      });
    });
  await staged.goto(base);
  await staged
    .getByText("看看画面，确认你喜欢的感觉", { exact: true })
    .waitFor();
  await staged.screenshot({
    path: path.join(out, "guided-review.png"),
    fullPage: true,
  });
  await staged.locator("#review-next").click();
  await staged.getByText("工作室正在制作，请稍候", { exact: true }).waitFor();
  assert.deepEqual(called, ["approve-frames", "sample"]);
  assert.equal(await staged.locator("#review-next").isDisabled(), true);
  const after = await (
    await fetch(base + "/api/projects/subgroup-matrix/review")
  ).json();
  assert.deepEqual(after, before);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: guided completion, one player, download without rendering, full editor, inferred defaults with explicit overrides, private connection form, responsive layout, explicit approvals and sample-first workflow.",
  );
} finally {
  await browser.close();
}
