// Carry genuine approvals across a code-only repair only after reproducing the
// approved MP4 byte-for-byte. Does not modify project.json or approval fields.
import assert from "node:assert/strict";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { ROOT, loadProject, hashProject, writeJSON } from "./lib.mjs";
import { paletteFingerprint } from "../src/presets.mjs";

const [baselineFile, revision] = process.argv.slice(2);
if (!baselineFile || !/^[a-f0-9]{40}$/.test(revision ?? ""))
  throw new Error(
    "Usage: node scripts/check-engine-equivalence.mjs <captured-baseline.json> <approved-git-revision>",
  );
const entries = JSON.parse(await readFile(baselineFile, "utf8"));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const content = (p) => JSON.stringify({ ...p, review: undefined });
const visualFiles = [
  "src/film.mjs",
  "src/model.mjs",
  "src/engine/motion.mjs",
  "src/engine/schema.mjs",
  "src/engine/renderer.mjs",
];
const oldSources = [
  "src/film.mjs",
  "src/model.mjs",
  "src/azure.mjs",
  "src/engine/motion.mjs",
  "src/engine/schema.mjs",
  "src/engine/renderer.mjs",
  "scripts/audio.mjs",
  "scripts/render.mjs",
];
for (const prior of entries) {
  const p = await loadProject(prior.id),
    currentHash = hashProject(p);
  assert.equal(p.review?.frames, prior.approvedHash);
  assert.equal(p.review?.sample, prior.approvedHash);
  assert.equal(
    content(p),
    content(prior.project),
    "Creative content changed; a new review is required",
  );
  // Recompute the approved fingerprint with the old engine and today's assets.
  // This verifies that asset bytes did not change after the baseline capture.
  const oldHash = createHash("sha256").update(content(p));
  const palette = paletteFingerprint(p.theme);
  if (palette) oldHash.update(palette);
  for (const file of oldSources)
    oldHash.update(
      execFileSync("git", ["show", `${revision}:${file}`], {
        cwd: ROOT,
        maxBuffer: 5 * 1024 * 1024,
      }),
    );
  const assets = [
    ...new Set(
      p.scenes
        .flatMap((s) => [
          s.image,
          s.imageAlt,
          ...(s.composition?.layers ?? [])
            .filter((n) => n.type === "image")
            .map((n) => n.asset),
        ])
        .filter(Boolean),
    ),
  ].sort();
  for (const asset of assets)
    oldHash.update(await readFile(path.join(ROOT, "projects", p.id, asset)));
  assert.equal(
    oldHash.digest("hex").slice(0, 16),
    prior.approvedHash,
    "Approved inputs could not be reproduced",
  );
  const visualAfter = sha(
    Buffer.concat(
      await Promise.all(visualFiles.map((f) => readFile(path.join(ROOT, f)))),
    ),
  );
  assert.equal(
    visualAfter,
    prior.visualSha256,
    "Visual engine changed; a new review is required",
  );
  const sampleBefore = sha(
    await readFile(
      path.join(ROOT, "outputs", p.id, prior.approvedHash, "sample.mp4"),
    ),
  );
  const sampleAfter = sha(
    await readFile(path.join(ROOT, "outputs", p.id, currentHash, "sample.mp4")),
  );
  assert.equal(
    sampleBefore,
    prior.sampleSha256,
    "Approved sample was replaced",
  );
  assert.equal(
    sampleBefore,
    sampleAfter,
    "Sample differs; do not inherit its approval",
  );
  const proof = {
    version: 1,
    projectId: p.id,
    approvedHash: prior.approvedHash,
    currentHash,
    inputBefore: sha(content(prior.project)),
    inputAfter: sha(content(p)),
    visualBefore: prior.visualSha256,
    visualAfter,
    sampleBefore,
    sampleAfter,
    approvedRevision: revision,
    verifiedAt: new Date().toISOString(),
    reason:
      "Code-only audio fitting repair; creative inputs, visuals and approved sample are unchanged. Human approval fields were not modified.",
  };
  await writeJSON(
    path.join(
      ROOT,
      ".studio-local",
      "approval-equivalence",
      `${p.id}-${currentHash}.json`,
    ),
    proof,
  );
  console.log(
    JSON.stringify({
      id: p.id,
      currentHash,
      approvedHash: prior.approvedHash,
      exactSampleMatch: true,
    }),
  );
}
