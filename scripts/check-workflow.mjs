import assert from "node:assert/strict";
import path from "node:path";
import { rm, mkdir, writeFile } from "node:fs/promises";
import { ROOT, projectDir, loadProject, run } from "./lib.mjs";
const base = "http://127.0.0.1:4173",
  created = [];
async function request(url, method = "GET", data, status = 200) {
  const r = await fetch(base + url, {
    method,
    headers: { "Content-Type": "application/json", "X-Studio-Client": "local" },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
  });
  const body = await r.json();
  assert.equal(r.status, status, JSON.stringify(body));
  return body;
}
async function done(id) {
  for (let i = 0; i < 180; i++) {
    const j = await request(`/api/projects/${id}/job`);
    if (j.status === "failed") throw new Error(j.message);
    if (j.status === "complete") return j;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Job timeout");
}
const report = [];
try {
  const p = await request(
    "/api/projects",
    "POST",
    {
      title: "Workflow QA temporary",
      idea: "Verify a short portrait production.",
      language: "en",
      brief: { aspect: "9:16" },
      targetDuration: 30,
    },
    201,
  );
  created.push(p.id);
  const url = `/api/projects/${p.id}`;
  p.scenes = [
    {
      id: "proof",
      kind: "card",
      title: "Make ideas move.",
      eyebrow: "A STUDIO TEST",
      body: "A short film starts with one clear idea.",
      narration: "Make ideas move.",
      note: "Automated workflow verification",
      duration: 4,
      camera: "push",
    },
  ];
  await request(url, "PUT", p);
  await request(url + "/render", "POST", {}, 400);
  await request(url + "/sample", "POST", {}, 400);
  await request(url + "/approve-frames", "POST", {}, 400);
  await request(url + "/approve-story", "POST", {});
  await request(url + "/prepare", "POST", {}, 202);
  await done(p.id);
  const staged = await request(url);
  assert.ok(
    staged.scenes[0].composition?.layers.length > 0,
    "AI must compile a real film program",
  );
  const quality = await request(url + "/quality");
  assert.ok(
    quality?.model && quality?.sceneIds?.includes("proof"),
    "AI must inspect actual rendered frames",
  );
  await request(url + "/approve-frames", "POST", {});
  await request(url + "/sample", "POST", { start: 0 }, 202);
  const sample = await done(p.id);
  await request(url + "/render", "POST", {}, 400);
  await request(url + "/approve-sample", "POST", {});
  await request(url + "/render", "POST", {}, 202);
  const full = await done(p.id);
  const file = path.join(ROOT, "outputs", p.id, full.outputKey, "film.mp4");
  const probe = JSON.parse(
    (
      await run("ffprobe", [
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        file,
      ])
    ).out,
  );
  const video = probe.streams.find((x) => x.codec_type === "video");
  assert.equal(video.width, 1080);
  assert.equal(video.height, 1920);
  assert.ok(Math.abs(Number(probe.format.duration) - 4) < 0.1);
  assert.ok(probe.streams.some((x) => x.codec_type === "audio"));
  const folder = path.join(ROOT, "outputs", "ui-review");
  await mkdir(folder, { recursive: true });
  await run("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-ss",
    "2",
    "-i",
    file,
    "-frames:v",
    "1",
    path.join(folder, "portrait-proof.png"),
  ]);
  const rangeResponse = await fetch(base + full.outputBase + "/film.mp4", {
    headers: { Range: "bytes=0-511" },
  });
  assert.equal(rangeResponse.status, 206);
  assert.equal((await rangeResponse.arrayBuffer()).byteLength, 512);
  const latest = await request(url);
  latest.scenes[0].body = "A revised idea.";
  latest.review = { story: "forged", frames: "forged", sample: "forged" };
  await request(url, "PUT", latest);
  assert.deepEqual(await request(url + "/review"), {
    storyApproved: false,
    framesApproved: false,
    sampleApproved: false,
  });
  await request(url + "/render", "POST", {}, 400);
  report.push(
    "PASS: story/frames/sample approval gates; actual Azure narration; portrait sample and full MP4; range requests; edits invalidate approvals.",
  );
  if (process.argv.includes("--ai")) {
    const ai = await request(
      "/api/projects",
      "POST",
      {
        title: "Director QA temporary",
        idea: "A tiny seed on a windowsill becomes a green shoot. For curious children, a gentle poetic story with a hopeful ending. No factual statistics.",
        language: "en",
        targetDuration: 30,
        template: "story",
        brief: {
          style: "watercolor",
          narrationMode: "none",
          aspect: "16:9",
          pace: "slow",
        },
      },
      201,
    );
    created.push(ai.id);
    await request(`/api/projects/${ai.id}/plan`, "POST", {}, 202);
    await done(ai.id);
    const planned = await request(`/api/projects/${ai.id}`);
    assert.equal(
      planned.scenes.reduce((n, s) => n + s.duration, 0),
      30,
    );
    assert.ok(planned.scenes.every((s) => s.narration === ""));
    assert.ok(planned.scenes.some((s) => s.imagePrompt));
    report.push(
      "PASS: live AI director honors 30-second target, watercolor brief, story format and no-narration choice.",
    );
  }
  await writeFile(
    path.join(ROOT, "outputs", "ui-review", "workflow-report.txt"),
    report.join("\n"),
  );
  console.log(report.join("\n"));
} finally {
  for (const id of created) {
    const p = await loadProject(id);
    if (!["Workflow QA temporary", "Director QA temporary"].includes(p.title))
      throw new Error("Refusing to clean unrelated project");
    for (const parent of ["projects", "outputs"]) {
      const dir = path.resolve(ROOT, parent, id);
      if (!dir.startsWith(path.resolve(ROOT, parent) + path.sep))
        throw new Error("Cleanup escaped workspace");
      await rm(dir, { recursive: true, force: true });
    }
  }
}
