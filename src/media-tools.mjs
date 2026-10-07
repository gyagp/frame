import path from "node:path";
import os from "node:os";
import { existsSync, readdirSync } from "node:fs";
export function mediaExecutable(name) {
  if (!["ffmpeg", "ffprobe"].includes(name)) return name;
  const tools = path.join(
    os.homedir(),
    "AppData",
    "Local",
    "MovieStudio",
    "tools",
  );
  if (process.platform === "win32" && existsSync(tools)) {
    for (const dir of readdirSync(tools)
      .filter((d) => /^ffmpeg-[\w.-]+$/.test(d))
      .sort()
      .reverse()) {
      const executable = path.join(tools, dir, "bin", name + ".exe");
      if (existsSync(executable)) return executable;
    }
  }
  return name;
}
