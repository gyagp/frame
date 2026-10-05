import http from "node:http";
import path from "node:path";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { chromium } from "playwright";
const dir = path.dirname(fileURLToPath(import.meta.url)),
  root = path.resolve(dir, "../..");
const dependencyDir = path.join(root, ".cache/code-doc-film-probe");
const upstream = path.join(root, ".cache/code-doc-film"),
  commit = "d3078a857fbc70f78121ed0f919aa9d15c854e57";
assert.equal(
  execFileSync("git", ["-C", upstream, "rev-parse", "HEAD"]).toString().trim(),
  commit,
);
const out = path.join(root, "outputs/three-feasibility", commit.slice(0, 16));
await mkdir(out, { recursive: true });
const sha = (b) => createHash("sha256").update(b).digest("hex");
const server = http.createServer(async (req, res) => {
  try {
    const name = decodeURIComponent(new URL(req.url, "http://local").pathname);
    let file;
    if (name === "/favicon.ico") {
      res.writeHead(204).end();
      return;
    }
    if (name === "/" || name === "/index.html")
      file = path.join(dir, "code-doc-film.html");
    else if (name === "/scenes/f01_hook.js")
      file = path.join(upstream, "examples/zheng-he/scenes/f01_hook.js");
    else
      for (const [prefix, base] of [
        ["/film/", path.join(upstream, "template/film")],
        ["/three/", path.join(dependencyDir, "node_modules/three")],
      ])
        if (name.startsWith(prefix)) {
          const candidate = path.resolve(base, name.slice(prefix.length));
          if (candidate.startsWith(path.resolve(base) + path.sep))
            file = candidate;
        }
    if (!file) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      "Content-Type": file.endsWith(".html")
        ? "text/html; charset=utf-8"
        : "text/javascript",
      "Cache-Control": "no-store",
    });
    res.end(await readFile(file));
  } catch (e) {
    res.writeHead(404).end("Not found");
  }
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, channel: "msedge" });
let encoder;
const errors = [],
  warnings = [],
  blocked = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
    if (m.type() === "warning") warnings.push(m.text());
  });
  await page.route("**/*", (r) => {
    if (new URL(r.request().url()).origin !== origin) {
      blocked.push(r.request().url());
      return r.abort();
    }
    return r.continue();
  });
  await page.goto(origin);
  await page.waitForFunction(
    () => window.probeReady || window.probeError,
    {},
    { timeout: 60000 },
  );
  const issue = await page.evaluate(() => window.probeError);
  if (issue) throw new Error(issue);
  const info = await page.evaluate(() => window.probeInfo);
  console.log(JSON.stringify({ ready: info }));
  const cameraStart = await page.evaluate(() => renderAt(0));
  await page.screenshot({ path: path.join(out, "reference-start.png") });
  const middle = await page.evaluate(() => renderAt(3));
  const a = await page.screenshot({
    path: path.join(out, "reference-middle.png"),
  });
  await page.evaluate(() => {
    renderAt(5.5);
    clearShot();
    renderAt(0.2);
    renderAt(3);
  });
  const b = await page.screenshot();
  const deterministic = sha(a) === sha(b);
  assert.ok(deterministic, "Frame changed after out-of-order rendering");
  const cameraEnd = await page.evaluate(() => renderAt(5.9));
  await page.screenshot({ path: path.join(out, "reference-end.png") });
  console.log(
    JSON.stringify({
      deterministic,
      drawCalls: middle.calls,
      triangles: middle.triangles,
      cameraStart: cameraStart.camera,
      cameraEnd: cameraEnd.camera,
      errors,
    }),
  );
  assert.equal(errors.length, 0);
  assert.equal(blocked.length, 0);
  let stderr = "";
  encoder = spawn(
    "ffmpeg",
    [
      "-y",
      "-v",
      "error",
      "-f",
      "image2pipe",
      "-framerate",
      "24",
      "-vcodec",
      "png",
      "-i",
      "pipe:0",
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      path.join(out, "reference-probe.mp4"),
    ],
    { windowsHide: true },
  );
  encoder.stderr.on("data", (d) => (stderr += d));
  let pipeError;
  encoder.stdin.on("error", (e) => (pipeError = e));
  const finish = once(encoder, "close");
  const began = Date.now();
  for (let f = 0; f < 144; f++) {
    await page.evaluate((t) => renderAt(t), f / 24);
    const bytes = await page.screenshot();
    if (pipeError) throw pipeError;
    if (!encoder.stdin.write(bytes)) await once(encoder.stdin, "drain");
    if (f % 24 === 0) console.log(`Frame ${f}/144`);
  }
  encoder.stdin.end();
  const [code] = await finish;
  if (code !== 0) throw new Error(stderr);
  const captureSeconds = (Date.now() - began) / 1000;
  const media = JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      path.join(out, "reference-probe.mp4"),
    ]).toString(),
  );
  await copyFile(
    path.join(upstream, "LICENSE"),
    path.join(out, "UPSTREAM-LICENSE.txt"),
  );
  const report = {
    testedAt: new Date().toISOString(),
    repository: "https://github.com/bangbuilds/code-doc-film",
    commit,
    scope:
      "Reviewed upstream fleet scene and local Three.js renderer only. Not HyperFrames, terrain downloads, speech, music, full pipeline, or Movie Studio integration.",
    ...info,
    deterministic,
    cameraStart: cameraStart.camera,
    cameraEnd: cameraEnd.camera,
    drawCalls: middle.calls,
    triangles: middle.triangles,
    cameraWarnings: [
      ...new Set([
        ...cameraStart.warnings,
        ...middle.warnings,
        ...cameraEnd.warnings,
      ]),
    ],
    browserErrors: errors,
    browserWarnings: [...new Set(warnings)],
    blockedRequests: blocked,
    captureSeconds,
    media: {
      duration: Number(media.format.duration),
      codec: media.streams[0].codec_name,
      width: media.streams[0].width,
      height: media.streams[0].height,
      frames: media.streams[0].nb_frames,
      frameRate: media.streams[0].avg_frame_rate,
      audio: media.streams.some((s) => s.codec_type === "audio"),
    },
  };
  await writeFile(
    path.join(out, "probe.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify({ finished: report }));
} finally {
  if (encoder?.exitCode === null) encoder.kill();
  await browser.close();
  server.close();
}
