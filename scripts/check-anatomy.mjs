// Smoke-test the vendored skill without writing into its pinned source snapshot.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skill = path.join(root, ".agents", "skills", "anatomy");
const output = path.join(root, "outputs", "anatomy");
await mkdir(output, { recursive: true });
const run = await mkdtemp(path.join(output, "smoke-"));
const provenance = JSON.parse(
  await readFile(path.join(skill, "UPSTREAM.json"), "utf8"),
);
const report = {
  revision: provenance.revision,
  date: new Date().toISOString(),
  node: process.version,
  status: "failed",
  checks: [],
  screenshots: [],
};
let browser;
try {
  for (const file of [
    "kit/iso-kit.mjs",
    "scripts/inline-kit.mjs",
    "examples/dial-indicator/build.mjs",
  ]) {
    await mkdir(path.dirname(path.join(run, file)), { recursive: true });
    await copyFile(path.join(skill, file), path.join(run, file));
  }
  const example = path.join(run, "examples", "dial-indicator");
  const text = async (file) =>
    (await readFile(file, "utf8")).replaceAll("\r\n", "\n");
  for (const theme of ["dark", "light"]) {
    const file = `dial-indicator${theme === "light" ? "-light" : ""}.html`;
    const args = [
      path.join(example, "build.mjs"),
      ...(theme === "light" ? ["--light"] : []),
    ];
    execFileSync(process.execPath, args, {
      cwd: run,
      timeout: 30_000,
      windowsHide: true,
    });
    const built = await text(path.join(example, file));
    assert.equal(
      built,
      await text(path.join(skill, "examples", "dial-indicator", file)),
      `${theme}: matches pinned page`,
    );
    execFileSync(process.execPath, args, {
      cwd: run,
      timeout: 30_000,
      windowsHide: true,
    });
    assert.equal(
      await text(path.join(example, file)),
      built,
      `${theme}: repeatable build`,
    );
    report.checks.push(
      `${theme}: build matches upstream page and repeat build`,
    );
  }

  browser = await chromium.launch({
    headless: true,
    channel: process.env.BROWSER_CHANNEL || "msedge",
  });
  report.browser = browser.version();
  const errors = [];
  const externalRequests = [];
  const open = async (file, viewport, reducedMotion) => {
    const page = await browser.newPage({ viewport, reducedMotion });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.route(/^https?:/, (route) => {
      externalRequests.push(route.request().url());
      return route.abort();
    });
    await page.goto(pathToFileURL(path.join(example, file)).href);
    await page.locator(".iso-stage[aria-valuetext]").waitFor();
    return page;
  };
  const pose = (page) =>
    page.evaluate(() => ({
      carriage: document
        .querySelector('[data-part="carriage"]')
        .getAttribute("transform"),
      plunger: document
        .querySelector('[data-part="plunger"]')
        .getAttribute("transform"),
      needle: document.querySelector('[data-part="needle"]').getAttribute("d"),
      readout: document.querySelector("[data-readout]").textContent,
    }));
  const reading = (page, value) =>
    page.waitForFunction(
      (expected) =>
        document.querySelector("[data-readout]").textContent === expected &&
        document.querySelector(".iso-stage").getAttribute("aria-valuetext") ===
          expected,
      value,
    );
  const shot = async (page, name) => {
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `${name}: no horizontal overflow`,
    );
    await page.screenshot({
      path: path.join(run, `${name}.png`),
      fullPage: true,
    });
    report.screenshots.push(`${name}.png`);
  };

  const desktop = await open(
    "dial-indicator.html",
    { width: 1440, height: 1000 },
    "no-preference",
  );
  await desktop.locator(".iso-stage").press("Home");
  await reading(desktop, "block 1 · reads 18.0 px");
  const initial = await pose(desktop);
  await shot(desktop, "desktop-dark-start");
  await desktop.locator(".iso-stage").press("End");
  await reading(desktop, "block 3 · reads 10.0 px");
  const end = await pose(desktop);
  for (const part of ["carriage", "plunger", "needle"])
    assert.notEqual(
      end[part],
      initial[part],
      `${part} follows changed reading`,
    );
  await shot(desktop, "desktop-dark-end");
  await desktop.locator(".iso-stage").press("Home");
  await reading(desktop, "block 1 · reads 18.0 px");
  await desktop.waitForFunction(
    (expected) =>
      document.querySelector('[data-part="needle"]').getAttribute("d") ===
        expected.needle &&
      document
        .querySelector('[data-part="carriage"]')
        .getAttribute("transform") === expected.carriage &&
      document
        .querySelector('[data-part="plunger"]')
        .getAttribute("transform") === expected.plunger,
    initial,
  );
  report.checks.push(
    "desktop: Home/End update all three moving parts and accessible readout; Home restores geometry",
  );
  await desktop.close();

  const mobile = await open(
    "dial-indicator-light.html",
    { width: 390, height: 844 },
    "reduce",
  );
  await reading(mobile, "block 1 · reads 18.0 px");
  const still = await pose(mobile);
  // Beyond the example's 2.2-second idle-tour transition.
  await mobile.waitForTimeout(2600);
  assert.deepEqual(
    await pose(mobile),
    still,
    "reduced motion holds its idle pose",
  );
  await mobile.locator(".iso-stage").press("ArrowLeft");
  await reading(mobile, "block 2 · reads 14.0 px");
  await shot(mobile, "mobile-light-keyboard");
  report.checks.push(
    "390px light: no horizontal overflow; reduced motion holds; arrow key reaches block 2",
  );
  assert.deepEqual(errors, [], "no browser errors");
  assert.deepEqual(
    externalRequests,
    [],
    "standalone example needs no network requests",
  );
  report.checks.push("no browser errors or external HTTP requests");
  report.status = "passed";
} catch (error) {
  report.error = error.message;
  throw error;
} finally {
  if (browser) await browser.close();
  await writeFile(
    path.join(run, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(`Anatomy ${report.status}: ${run}`);
}
