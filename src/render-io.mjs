import path from "node:path";
import { mkdir, writeFile, rename, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

const shareErrors = new Set(["EPERM", "EACCES", "EBUSY"]);
export const isFileBusy = (error) => shareErrors.has(error?.code);

export async function replaceWithRetry(
  from,
  to,
  { replace = rename, sleep = delay, retries = 8 } = {},
) {
  for (let attempt = 0; ; attempt++) {
    try {
      await replace(from, to);
      return;
    } catch (error) {
      if (!isFileBusy(error) || attempt >= retries) throw error;
      await sleep(Math.min(25 * 2 ** attempt, 400));
    }
  }
}

export async function atomicJSON(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(tmp, JSON.stringify(value, null, 2) + "\n");
    await replaceWithRetry(tmp, file);
  } finally {
    await unlink(tmp).catch(() => {});
  }
}

// Telemetry is optional; frame/checkpoint writes remain strict. A Windows reader
// or scanner must not terminate a healthy renderer by briefly holding this file.
export function progressWriter(
  file,
  { write = atomicJSON, warn = console.warn } = {},
) {
  let warned = false;
  return async (value) => {
    try {
      await write(file, value);
      warned = false;
      return true;
    } catch (error) {
      if (!isFileBusy(error)) throw error;
      if (!warned)
        warn(
          `Progress file temporarily busy (${error.code}); rendering continues; next update will retry.`,
        );
      warned = true;
      return false;
    }
  };
}
