import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdtemp, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  atomicJSON,
  replaceWithRetry,
  progressWriter,
} from "../src/render-io.mjs";

const busy = (code) =>
  Object.assign(new Error("File held by reader"), { code });
test("atomic replacement recovers from Windows share violations and bounds retries", async () => {
  let calls = 0;
  const pauses = [];
  await replaceWithRetry("tmp", "dest", {
    replace: async () => {
      if (calls++ < 3) throw busy(["EPERM", "EACCES", "EBUSY"][calls - 1]);
    },
    sleep: async (ms) => pauses.push(ms),
  });
  assert.equal(calls, 4);
  assert.deepEqual(pauses, [25, 50, 100]);
  calls = 0;
  await assert.rejects(
    replaceWithRetry("tmp", "dest", {
      replace: async () => {
        calls++;
        throw busy("EPERM");
      },
      sleep: async () => {},
      retries: 2,
    }),
    { code: "EPERM" },
  );
  assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(
    replaceWithRetry("tmp", "dest", {
      replace: async () => {
        calls++;
        throw busy("ENOSPC");
      },
      sleep: async () => {
        throw new Error("Must not retry");
      },
    }),
    { code: "ENOSPC" },
  );
  assert.equal(calls, 1);
});

test("busy progress cannot kill rendering and the next update catches up", async () => {
  let attempts = 0;
  const written = [],
    warnings = [];
  const update = progressWriter("progress.json", {
    write: async (file, value) => {
      if (attempts++ < 2) throw busy("EPERM");
      written.push(value);
    },
    warn: (msg) => warnings.push(msg),
  });
  assert.equal(await update({ done: 1 }), false);
  assert.equal(await update({ done: 2 }), false);
  assert.equal(await update({ done: 3 }), true);
  assert.deepEqual(written, [{ done: 3 }]);
  assert.equal(warnings.length, 1);
  await assert.rejects(
    progressWriter("x", {
      write: async () => {
        throw busy("ENOSPC");
      },
    })({ done: 4 }),
    { code: "ENOSPC" },
  );
});

test(
  "atomic JSON survives an actual Windows handle denying file replacement",
  { skip: process.platform !== "win32" },
  async () => {
    const folder = await mkdtemp(path.join(os.tmpdir(), "studio-file-lock-"));
    let holder;
    try {
      const file = path.join(folder, "progress.json");
      await writeFile(file, '{"done":1}');
      holder = spawn(
        "powershell.exe",
        [
          "-NoProfile",
          "-Command",
          "$stream=[IO.File]::Open($env:STUDIO_LOCK_TEST_FILE,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::ReadWrite); [Console]::Out.WriteLine('locked'); Start-Sleep -Milliseconds 600; $stream.Dispose()",
        ],
        {
          env: { ...process.env, STUDIO_LOCK_TEST_FILE: file },
          windowsHide: true,
        },
      );
      const closed = once(holder, "close");
      await once(holder.stdout, "data");
      // Establish that this is the same failure as production before retrying it.
      await writeFile(path.join(folder, "probe.tmp"), "{}");
      const { rename } = await import("node:fs/promises");
      await assert.rejects(
        rename(path.join(folder, "probe.tmp"), file),
        (error) => ["EPERM", "EACCES", "EBUSY"].includes(error.code),
      );
      await atomicJSON(file, { done: 2 });
      assert.deepEqual(JSON.parse(await readFile(file, "utf8")), { done: 2 });
      assert.equal((await closed)[0], 0);
      assert.deepEqual((await readdir(folder)).sort(), [
        "probe.tmp",
        "progress.json",
      ]);
    } finally {
      holder?.kill();
      await rm(folder, { recursive: true, force: true });
    }
  },
);
