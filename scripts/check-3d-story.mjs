// Tests approvals on a disposable fixture, never on the user's movie.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { ROOT, projectDir, loadProject } from "./lib.mjs";
const base = "http://127.0.0.1:4173";
const out = path.join(ROOT, "outputs/ui-review");
await mkdir(out, { recursive: true });
const original = await loadProject("little-pony-crosses-river");
const originalReview = JSON.stringify(original.review);
const headers = {
  "X-Studio-Client": "local",
  "Content-Type": "application/json",
};
const browser = await chromium.launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL || "msedge",
});
let fixture;
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1100 },
  });
  const errors = [],
    writes = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (r.method() === "POST") writes.push(r.url());
  });
  await page.goto(base + "/?project=" + original.id);
  await page
    .getByRole("heading", { name: original.title, exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "确认故事与分镜", exact: true })
    .waitFor();
  assert.equal(await page.locator(".guided-shot").count(), 18);
  await page.screenshot({ path: path.join(out, "pony-story-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(out, "pony-story-mobile.png") });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  const story = await page.request.get(
    base + "/projects/" + original.id + "/assets/story-review.html",
  );
  const text = await story.text();
  assert.ok(text.includes("中文旁白与对白"));
  assert.ok(text.includes("环境响应"));

  const created = await page.request.post(base + "/api/projects", {
    headers,
    data: {
      title: "3D workflow verification",
      idea: "Disposable test fixture",
    },
  });
  assert.equal(created.status(), 201);
  fixture = await created.json();
  const draft = { ...original, id: fixture.id, title: fixture.title };
  assert.equal(
    (
      await page.request.put(base + "/api/projects/" + fixture.id, {
        headers,
        data: draft,
      })
    ).status(),
    200,
  );
  await page.goto(base + "/?project=" + fixture.id);
  await page
    .getByRole("button", { name: "确认故事与分镜", exact: true })
    .click();
  await page
    .getByText("故事已确认，3D 制作尚待接入", { exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "3D 制作暂未就绪", exact: true })
      .isDisabled(),
    true,
  );
  assert.equal(
    writes.some((u) => u.endsWith("/prepare")),
    false,
  );
  for (const action of [
    "prepare",
    "sample",
    "stills",
    "render",
    "approve-frames",
  ]) {
    const response = await page.request.post(
      base + "/api/projects/" + fixture.id + "/" + action,
      { headers, data: {} },
    );
    assert.equal(response.status(), 400);
    assert.match((await response.json()).error, /3D/);
  }
  assert.equal(
    JSON.stringify((await loadProject(original.id)).review),
    originalReview,
  );
  assert.deepEqual(errors, []);
  console.log(
    "3D story UI passed: 18 shots, Chinese review, responsive layout, real approvals unchanged, no 2D fallback.",
  );
} finally {
  await browser.close();
  if (fixture) {
    const saved = await loadProject(fixture.id),
      target = projectDir(fixture.id);
    if (
      saved.title === "3D workflow verification" &&
      target.startsWith(path.join(ROOT, "projects") + path.sep)
    )
      await rm(target, { recursive: true, force: true });
  }
}
