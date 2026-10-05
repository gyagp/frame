import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "./lib.mjs";

const base = "http://127.0.0.1:4173";
const browser = await chromium.launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL || "msedge",
});
const errors = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page.getByRole("button", { name: "精细调整", exact: true }).click();
  await page.getByText("有声预览 · 声音已就绪", { exact: true }).waitFor();
  await page.waitForFunction(
    () => document.getElementById("soundtrack").readyState >= 2,
  );
  // Measure the actual browser media signal, not just a file's existence or play icon.
  await page.evaluate(() => {
    window.testAudioContext = new AudioContext();
    const source = testAudioContext.createMediaElementSource(
      document.getElementById("soundtrack"),
    );
    window.testAnalyser = testAudioContext.createAnalyser();
    source.connect(testAnalyser);
    testAnalyser.connect(testAudioContext.destination);
    document
      .getElementById("play")
      .addEventListener("click", () => testAudioContext.resume());
  });
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await page.waitForFunction(() => {
    const samples = new Float32Array(testAnalyser.fftSize);
    testAnalyser.getFloatTimeDomainData(samples);
    const rms = Math.sqrt(
      samples.reduce((sum, x) => sum + x * x, 0) / samples.length,
    );
    window.testRms = Math.max(window.testRms || 0, rms);
    return document.getElementById("soundtrack").currentTime > 1 && rms > 0.005;
  });
  const actual = await page.evaluate(() => ({
    audioTime: document.getElementById("soundtrack").currentTime,
    pictureTime: Number(document.getElementById("scrubber").value),
    duration: document.getElementById("soundtrack").duration,
    rms: testRms,
    paused: document.getElementById("soundtrack").paused,
  }));
  assert.equal(actual.paused, false);
  assert.ok(Math.abs(actual.pictureTime - actual.audioTime) < 0.25);
  assert.ok(Math.abs(actual.duration - 150) < 0.1);
  await page.getByRole("button", { name: "静音", exact: true }).click();
  assert.equal(
    await page.locator("#soundtrack").evaluate((a) => a.muted),
    true,
  );
  await page.getByRole("button", { name: "打开声音", exact: true }).click();
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  assert.equal(
    await page.locator("#soundtrack").evaluate((a) => a.paused),
    true,
  );
  await page.locator("#scrubber").fill("80");
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await page.waitForFunction(
    () => document.getElementById("soundtrack").currentTime > 80.1,
  );
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  // A rejected media play must not leave the picture running silently.
  await page.evaluate(() => {
    document.getElementById("soundtrack").play = () =>
      Promise.reject(new Error("Playback blocked"));
  });
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await page
    .getByText("声音未能播放，请重新点击播放；如仍无声，可重新加载声音。", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: "暂停", exact: true }).count(),
    0,
  );

  // Missing audio is explicit, and the shortcut starts the preparation action.
  // Mock the job so this regression check does not charge for additional synthesis.
  let requested = false;
  const silent = await browser.newPage();
  silent.on("pageerror", (e) => errors.push(e.message));
  await silent.route(
    "**/api/projects/subgroup-matrix/outputs",
    async (route) => {
      const result = await route.fetch();
      const list = await result.json();
      await route.fulfill({
        json: list.map((x) => ({
          ...x,
          files: x.files.filter(
            (f) => !["audio.json", "soundtrack.wav"].includes(f),
          ),
        })),
      });
    },
  );
  const fakeJob = {
    id: "audio-ui-test",
    projectId: "subgroup-matrix",
    type: "audio",
    status: "running",
    progress: 25,
    message: "Preparing audio",
  };
  await silent.route("**/api/projects/subgroup-matrix/job", (route) =>
    route.fulfill({ json: requested ? fakeJob : null }),
  );
  await silent.route("**/api/projects/subgroup-matrix/audio", (route) => {
    requested = true;
    return route.fulfill({ status: 202, json: fakeJob });
  });
  await silent.goto(base);
  await silent.getByRole("button", { name: "精细调整", exact: true }).click();
  await silent.getByText("无声预览 · 尚未生成声音", { exact: true }).waitFor();
  await silent.getByRole("button", { name: "生成声音", exact: true }).click();
  await silent
    .getByText("声音生成中 · 当前仅预览画面", { exact: true })
    .waitFor();
  assert.equal(requested, true);
  assert.equal(await silent.locator("#preview-audio").isDisabled(), true);
  assert.deepEqual(errors, []);
  const folder = path.join(ROOT, "outputs", "ui-review");
  await mkdir(folder, { recursive: true });
  await writeFile(
    path.join(folder, "audio-preview-check.json"),
    JSON.stringify(actual, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        passed: true,
        checks: [
          "actual audible media signal",
          "150-second audio",
          "synchronized playback",
          "mute",
          "pause and seek",
          "rejected playback",
          "explicit missing-audio state",
          "generation shortcut",
        ],
        actual,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
