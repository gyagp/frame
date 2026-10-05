import { chromium } from "playwright";
import path from "node:path";
import { projectDir } from "./lib.mjs";
const browser = await chromium.launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL || "msedge",
});
try {
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  await page.goto(
    "http://127.0.0.1:4173/projects/subgroup-matrix/assets/demo.html#7",
  );
  await page.evaluate(() => document.fonts.ready);
  await page.locator("#workload").selectOption("prefill-2048");
  await page.waitForFunction(
    () => document.getElementById("matrixBar").style.width === "100%",
  );
  await page
    .locator(".demo-wrap")
    .screenshot({
      path: path.join(
        projectDir("subgroup-matrix"),
        "assets",
        "demo-prefill.png",
      ),
      animations: "disabled",
    });
  await page.locator("#workload").selectOption("mlp-up");
  // Browser renders the page's own replay; finish CSS transitions for a deterministic still.
  await page.locator("#matrixValue").filter({ hasText: "51.3" }).waitFor();
  await page.waitForFunction(
    () => document.getElementById("matrixBar").style.width === "100%",
  );
  await page
    .locator(".demo-wrap")
    .screenshot({
      path: path.join(projectDir("subgroup-matrix"), "assets", "demo-mlp.png"),
      animations: "disabled",
    });
  console.log("Captured original demo: Prefill 2048 and MLP up.");
} finally {
  await browser.close();
}
