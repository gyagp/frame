import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { createCanvas } from "@napi-rs/canvas";
import {
  verifiedFrames,
  digest,
  frameName,
  resumedProgress,
  compatibleExecutor,
  GPU_PROFILE,
} from "../src/blender-fast.mjs";

test("progress-only executor updates retain frames only with intact identical renderer evidence", async () => {
  const out = await mkdtemp(path.join(os.tmpdir(), "studio-executor-"));
  try {
    const shot = path.join(out, "shot-01");
    await mkdir(shot);
    const worker = Buffer.from("trusted renderer"),
      wrapper = Buffer.from("old file handling"),
      main = Buffer.from("approved timeline executor");
    await writeFile(path.join(shot, "render-cached.py"), worker);
    await writeFile(path.join(out, "blender-fast.mjs"), wrapper);
    await writeFile(path.join(out, "blender-fast-render.mjs"), main);
    const record = {
      profile: GPU_PROFILE,
      executorHash: digest(Buffer.concat([worker, wrapper, main])),
    };
    assert.equal(
      await compatibleExecutor(
        out,
        shot,
        record,
        Buffer.from("different rendering settings"),
      ),
      false,
    );
    assert.equal(
      await compatibleExecutor(
        out,
        shot,
        { ...record, executorHash: "0".repeat(64) },
        worker,
      ),
      false,
    );
    assert.equal(
      await compatibleExecutor(
        out,
        shot,
        { ...record, profile: "different" },
        worker,
      ),
      false,
    );
    assert.equal(await compatibleExecutor(out, shot, record, worker), true);
    const archived = path.join(
      out,
      "executors",
      record.executorHash,
      "blender-fast.mjs",
    );
    assert.deepEqual(await readFile(archived), wrapper);
    await writeFile(path.join(out, "blender-fast.mjs"), "new file handling");
    assert.equal(await compatibleExecutor(out, shot, record, worker), true);
    await writeFile(archived, "tampered evidence");
    assert.equal(await compatibleExecutor(out, shot, record, worker), false);
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});

test("GPU resume verifies identity, hashes, dimensions and decodable PNGs", async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "studio-resume-"));
  try {
    const identity = {
      projectHash: "a",
      sceneId: "shot-01",
      blendHash: "b",
      width: 160,
      height: 90,
      fps: 24,
    };
    const good = await createCanvas(160, 90).encode("png");
    const preview = await createCanvas(80, 45).encode("png");
    const broken = Buffer.from("incomplete PNG");
    await writeFile(path.join(folder, frameName(1)), good);
    await writeFile(path.join(folder, frameName(2)), preview);
    await writeFile(path.join(folder, frameName(3)), broken);
    await writeFile(path.join(folder, frameName(4)), good);
    const record = {
      identity,
      frameHashes: {
        1: digest(good),
        2: digest(preview),
        3: digest(broken),
        4: "0".repeat(64),
        5: digest(good),
        99: digest(good),
      },
    };
    assert.deepEqual(await verifiedFrames(folder, record, identity, 5), {
      1: digest(good),
    });
    for (const field of [
      "projectHash",
      "sceneId",
      "blendHash",
      "width",
      "height",
      "fps",
    ])
      assert.deepEqual(
        await verifiedFrames(
          folder,
          record,
          { ...identity, [field]: "changed" },
          5,
        ),
        {},
      );
    assert.deepEqual(await verifiedFrames(folder, null, identity, 5), {});
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("resumed progress includes completed later shots and excludes cached frames from timing", () => {
  const plans = [
    { scene: { id: "a" }, total: 3, frameHashes: { 1: "x", 2: "x", 3: "x" } },
    { scene: { id: "b" }, total: 4, frameHashes: { 1: "x" } },
    { scene: { id: "c" }, total: 3, frameHashes: { 1: "x", 2: "x" } },
  ];
  const state = resumedProgress(plans, 1, [2, 2, 2]);
  assert.equal(state.done, 6);
  assert.equal(state.total, 10);
  assert.equal(state.shotDone, 1);
  assert.equal(state.secondsPerFrame, 2);
  assert.equal(state.remainingSeconds, 8);
  assert.equal(resumedProgress(plans, 1, [2]).remainingSeconds, null);
  plans[1].frameHashes[2] = "new";
  assert.equal(resumedProgress(plans, 1, [2, 2, 2]).done, 7);
});
