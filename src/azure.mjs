import path from "node:path";
import { ROOT, run } from "../scripts/lib.mjs";
try {
  process.loadEnvFile?.();
} catch {}
let keyPromise;
export const azureConfigured = () =>
  Boolean(
    process.env.SPEECH_REGION &&
      (process.env.SPEECH_KEY ||
        (process.env.AZURE_SPEECH_SUBSCRIPTION &&
          process.env.AZURE_SPEECH_RESOURCE_GROUP &&
          process.env.AZURE_SPEECH_RESOURCE_NAME)),
  );
async function speechKey() {
  if (process.env.SPEECH_KEY) return process.env.SPEECH_KEY;
  if (!keyPromise)
    keyPromise = (async () => {
      const fields = [
        process.env.AZURE_SPEECH_SUBSCRIPTION,
        process.env.AZURE_SPEECH_RESOURCE_GROUP,
        process.env.AZURE_SPEECH_RESOURCE_NAME,
      ];
      if (fields.some((x) => !x || !/^[a-zA-Z0-9._-]+$/.test(x)))
        throw new Error(
          "请配置 Azure Speech 密钥和区域，或 Azure CLI 资源信息。",
        );
      try {
        const result = await run("powershell.exe", [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          path.join(ROOT, "scripts", "azure-key.ps1"),
          "-Subscription",
          fields[0],
          "-ResourceGroup",
          fields[1],
          "-ResourceName",
          fields[2],
        ]);
        return result.out.trim();
      } catch {
        throw new Error(
          "Azure 密钥读取失败。请检查 az login 和 Speech 资源权限。",
        );
      }
    })().catch((e) => {
      keyPromise = null;
      throw e;
    });
  return keyPromise;
}
const xml = (s) =>
  s.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
export async function azureSpeech(
  text,
  voice = "en-US-AndrewMultilingualNeural",
) {
  const region = process.env.SPEECH_REGION;
  if (!region || !/^[a-z0-9]+$/.test(region))
    throw new Error("请设置正确的 SPEECH_REGION。");
  const key = await speechKey();
  const lang = voice.startsWith("zh-") ? "zh-CN" : "en-US";
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}"><voice name="${xml(voice)}"><prosody rate="-3%">${xml(text)}</prosody></voice></speak>`;
  const response = await fetch(
    `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
    {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "riff-24khz-16bit-mono-pcm",
        "User-Agent": "MovieStudio",
      },
      body: ssml,
      signal: AbortSignal.timeout(60000),
    },
  );
  if (!response.ok) {
    const detail = (await response.text())
      .replaceAll(key, "[redacted]")
      .slice(0, 250);
    const error = new Error(
      `Azure Speech (${response.status}): ${detail || "检查语音、额度与区域设置"}`,
    );
    error.status = response.status;
    error.retryAfterMs = 15000;
    throw error;
  }
  const wav = Buffer.from(await response.arrayBuffer());
  if (wav.toString("ascii", 0, 4) !== "RIFF")
    throw new Error("Azure 没有返回有效 WAV 音频。");
  return wav;
}
