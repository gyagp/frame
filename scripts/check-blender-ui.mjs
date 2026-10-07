import { chromium } from "playwright";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, rm } from "node:fs/promises";
import { ROOT, loadProject, projectDir } from "./lib.mjs";
const base = "http://127.0.0.1:4173",
  folder = path.join(ROOT, "outputs/ui-review");
await mkdir(folder, { recursive: true });
const original = await loadProject("little-pony-crosses-river"),
  approval = JSON.stringify(original.review);
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
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/?project=" + original.id);
  await page.getByText("先检查角色与空间预演", { exact: true }).waitFor();
  assert.equal(await page.locator(".guided-shot").count(), 18);
  assert.equal(
    await page
      .getByRole("link", { name: "查看开始、中段与结束画面 ↗", exact: true })
      .count(),
    18,
  );
  const stripHref = await page
    .getByRole("link", { name: "查看开始、中段与结束画面 ↗", exact: true })
    .first()
    .getAttribute("href");
  assert.equal((await page.request.get(base + stripHref)).status(), 200);
  await page.screenshot({
    path: path.join(folder, "blender-pony-desktop.png"),
  });
  await page.getByRole("button", { name: "精细调整", exact: true }).click();
  await page.locator("#spatial-editor > summary").click();
  assert.equal(
    JSON.parse(await page.locator("#spatial-data").inputValue()).version,
    1,
  );
  assert.equal(await page.locator("#scene-camera").isDisabled(), true);
  const blend = await page.request.head(
    base + (await page.locator("#blend-source").getAttribute("href")),
  );
  assert.equal(blend.status(), 200);
  assert.ok(Number(blend.headers()["content-length"]) > 1000);
  await page.screenshot({ path: path.join(folder, "blender-pony-editor.png") });
  await page
    .getByRole("button", { name: "返回引导工作台", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(folder, "blender-pony-mobile.png") });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  for (const action of ["sample", "render"]) {
    const r = await page.request.post(
      base + `/api/projects/${original.id}/${action}`,
      { headers, data: { start: 142 } },
    );
    assert.equal(r.status(), 400);
    assert.match((await r.json()).error, /确认/);
  }
  const critique = await page.request.post(
    base + `/api/projects/${original.id}/critique`,
    { headers, data: {} },
  );
  assert.equal(critique.status(), 202);
  let reviewJob;
  for (let i = 0; i < 30; i++) {
    reviewJob = await (
      await page.request.get(base + `/api/projects/${original.id}/job`)
    ).json();
    if (reviewJob.status !== "running") break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(reviewJob.status, "complete", reviewJob.message);
  const actualReview = await (
    await page.request.get(base + `/api/projects/${original.id}/quality`)
  ).json();
  assert.equal(actualReview.checkedFrames, 54);
  assert.match(actualReview.scope, /not AI art review/);
  const created = await page.request.post(base + "/api/projects", {
    headers,
    data: { title: "Blender disposable integration fixture" },
  });
  fixture = await created.json();
  const draft = {
    ...original,
    id: fixture.id,
    title: fixture.title,
    scenes: [
      {
        ...original.scenes[0],
        duration: 4,
        narration: "",
        spatial: {
          version: 1,
          seed: 42,
          environment: "studio-v1",
          camera: { position: [4, -6, 3], target: [0, 0, 0.7], lens: 48 },
          actors: [
            {
              id: "cube",
              asset: "cube-v1",
              position: [0, 0, 0.6],
              heading: 0,
              action: "idle",
              travel: 0,
              bag: false,
            },
          ],
        },
      },
    ],
  };
  assert.equal(
    (
      await page.request.put(base + `/api/projects/${fixture.id}`, {
        headers,
        data: draft,
      })
    ).status(),
    200,
  );
  const post = (action, data = {}) =>
    page.request.post(base + `/api/projects/${fixture.id}/${action}`, {
      headers,
      data,
    });
  assert.equal((await post("prepare")).status(), 400);
  assert.equal((await post("approve-story")).status(), 200);
  assert.equal((await post("prepare")).status(), 202);
  let job;
  for (let i = 0; i < 90; i++) {
    job = await (
      await page.request.get(base + `/api/projects/${fixture.id}/job`)
    ).json();
    if (job.status !== "running") break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  assert.equal(job.status, "complete", job.message);
  const report = await (
    await page.request.get(base + job.outputBase + "/blender-stills.json")
  ).json();
  assert.equal(report.reports[0].engine, "CYCLES");
  assert.equal((await post("sample")).status(), 400);
  assert.equal((await post("approve-frames")).status(), 200);
  assert.equal((await post("render")).status(), 400);
  const bad = structuredClone(draft);
  bad.scenes[0].spatial.script = "print('unsafe')";
  assert.equal(
    (
      await page.request.put(base + `/api/projects/${fixture.id}`, {
        headers,
        data: bad,
      })
    ).status(),
    400,
  );
  assert.equal(
    JSON.stringify((await loadProject(original.id)).review),
    approval,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Blender UI/API passed: actual thumbnails, responsive editor, isolated Cycles prepare, approval gates, unsafe data rejected; film approvals unchanged.",
  );
} finally {
  await browser.close();
  if (fixture) {
    const p = await loadProject(fixture.id),
      target = projectDir(fixture.id);
    if (
      p.title === "Blender disposable integration fixture" &&
      target.startsWith(path.join(ROOT, "projects") + path.sep)
    )
      await rm(target, { recursive: true, force: true });
  }
}
