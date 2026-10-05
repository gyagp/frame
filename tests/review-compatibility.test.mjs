import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { equivalentApproval } from "../src/review-compatibility.mjs";

test("engine equivalence requires genuine prior approval and identical reproduced media", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "studio-equivalence-"));
  const old = "a".repeat(16),
    current = "b".repeat(16),
    bytes = Buffer.from("identical approved sample");
  const hash = createHash("sha256").update(bytes).digest("hex");
  const p = { id: "test", review: { frames: old, sample: old } };
  try {
    await mkdir(path.join(root, ".studio-local", "approval-equivalence"), {
      recursive: true,
    });
    for (const key of [old, current]) {
      await mkdir(path.join(root, "outputs", p.id, key), { recursive: true });
      await writeFile(
        path.join(root, "outputs", p.id, key, "sample.mp4"),
        bytes,
      );
    }
    const proof = {
      version: 1,
      projectId: p.id,
      currentHash: current,
      approvedHash: old,
      inputBefore: hash,
      inputAfter: hash,
      visualBefore: hash,
      visualAfter: hash,
      sampleBefore: hash,
      sampleAfter: hash,
    };
    const file = path.join(
      root,
      ".studio-local",
      "approval-equivalence",
      `${p.id}-${current}.json`,
    );
    await writeFile(file, JSON.stringify(proof));
    assert.equal(equivalentApproval(root, p, current), old);
    assert.equal(equivalentApproval(root, { ...p, review: {} }, current), null);
    assert.equal(equivalentApproval(root, p, "c".repeat(16)), null);
    await writeFile(
      file,
      JSON.stringify({ ...proof, inputAfter: "f".repeat(64) }),
    );
    assert.equal(equivalentApproval(root, p, current), null);
    await writeFile(file, JSON.stringify(proof));
    await writeFile(
      path.join(root, "outputs", p.id, current, "sample.mp4"),
      "changed",
    );
    assert.equal(equivalentApproval(root, p, current), null);
  } finally {
    assert.ok(
      path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep),
    );
    assert.ok(path.basename(root).startsWith("studio-equivalence-"));
    await rm(root, { recursive: true, force: true });
  }
});
