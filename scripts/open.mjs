import { spawn } from "node:child_process";
import path from "node:path";
import { ROOT } from "./lib.mjs";
const port = Number(process.env.PORT || 4173),
  url = `http://127.0.0.1:${port}`;
let available = false;
try {
  const r = await fetch(url + "/api/config");
  available = r.ok && (await r.json()).version === "0.1.0";
} catch {}
if (!available) {
  const child = spawn(process.execPath, [path.join(ROOT, "server.mjs")], {
    cwd: ROOT,
    windowsHide: true,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try {
      const r = await fetch(url + "/api/config");
      if (r.ok) {
        available = true;
        break;
      }
    } catch {}
  }
}
if (!available)
  throw new Error("Studio could not start. Run npm start to see the error.");
if (process.platform === "win32") {
  const child = spawn(
    "powershell.exe",
    ["-NoProfile", "-Command", `Start-Process '${url}'`],
    { windowsHide: true, stdio: "ignore" },
  );
  child.unref();
}
console.log(`Movie Studio: ${url}`);
