import { readFileSync, existsSync } from "node:fs";
import { mkdir, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
try {
  process.loadEnvFile?.();
} catch {}
export const SETTINGS_FILE =
  process.env.MOVIE_STUDIO_SETTINGS_FILE ||
  path.join(os.homedir(), ".movie-studio", "connections.json");
const defaults = (environment = process.env) => ({
  director: {
    provider: "gemini",
    model: environment.GOOGLE_DIRECTOR_MODEL || "gemini-3.8-flash",
  },
  google: {
    apiKey: environment.GOOGLE_API_KEY || "",
    imageModel: environment.GOOGLE_IMAGE_MODEL || "gemini-3.1-flash-image",
    imageMode: "nano-banana",
  },
  copilot: { token: environment.COPILOT_GITHUB_TOKEN || "", model: "auto" },
  speech: {
    provider: "azure",
    key: environment.SPEECH_KEY || "",
    region: environment.SPEECH_REGION || "",
    subscription: environment.AZURE_SPEECH_SUBSCRIPTION || "",
    resourceGroup: environment.AZURE_SPEECH_RESOURCE_GROUP || "",
    resourceName: environment.AZURE_SPEECH_RESOURCE_NAME || "",
    englishVoice: "en-US-AndrewMultilingualNeural",
    chineseVoice: "zh-CN-XiaoxiaoNeural",
  },
});
const allowed = {
  director: ["provider", "model"],
  google: ["apiKey", "imageModel", "imageMode"],
  copilot: ["token", "model"],
  speech: [
    "provider",
    "key",
    "region",
    "subscription",
    "resourceGroup",
    "resourceName",
    "englishVoice",
    "chineseVoice",
  ],
};
const secrets = new Set(["google.apiKey", "copilot.token", "speech.key"]);
export function getSettings(file = SETTINGS_FILE, environment = process.env) {
  let saved = {};
  if (existsSync(file)) {
    try {
      saved = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      throw new Error("连接配置无法读取，请检查本机 connections.json。");
    }
  }
  const settings = defaults(environment);
  for (const [group, fields] of Object.entries(allowed))
    for (const field of fields)
      if (typeof saved[group]?.[field] === "string")
        settings[group][field] = saved[group][field];
  return settings;
}
export function publicSettings(settings = getSettings()) {
  const view = structuredClone(settings);
  for (const name of secrets) {
    const [group, key] = name.split(".");
    view[group][key + "Configured"] = !!view[group][key];
    delete view[group][key];
  }
  return view;
}
export function prepareSettings(
  input,
  file = SETTINGS_FILE,
  environment = process.env,
) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("连接配置格式无效");
  const next = getSettings(file, environment);
  for (const [group, fields] of Object.entries(allowed)) {
    if (!input[group]) continue;
    for (const field of fields)
      if (input[group][field] !== undefined) {
        const value = input[group][field];
        if (
          typeof value !== "string" ||
          value.length > 4096 ||
          /[\r\n\0]/.test(value)
        )
          throw new Error("连接字段格式无效");
        // Blank password fields retain the stored credential. Explicit clear is separate.
        if (secrets.has(`${group}.${field}`) && !value) continue;
        next[group][field] = value.trim();
      }
  }
  for (const name of input.clearSecrets || []) {
    if (!secrets.has(name)) throw new Error("未知密钥字段");
    const [group, key] = name.split(".");
    next[group][key] = "";
  }
  if (
    !["gemini", "copilot"].includes(next.director.provider) ||
    !["azure", "local"].includes(next.speech.provider)
  )
    throw new Error("请选择支持的服务");
  if (!["nano-banana", "uploads"].includes(next.google.imageMode))
    throw new Error("请选择图片来源");
  for (const model of [
    next.director.model,
    next.google.imageModel,
    next.copilot.model,
  ])
    if (!/^[a-zA-Z0-9._:-]{1,120}$/.test(model))
      throw new Error("模型名称格式无效");
  if (next.speech.region && !/^[a-z0-9]+$/.test(next.speech.region))
    throw new Error("Azure 区域格式无效，例如 japaneast");
  for (const key of ["englishVoice", "chineseVoice"])
    if (!/^[a-zA-Z0-9-]+$/.test(next.speech[key]))
      throw new Error("Azure 声线名称格式无效");
  if (
    !["en-US-AndrewMultilingualNeural", "en-US-AvaMultilingualNeural"].includes(
      next.speech.englishVoice,
    ) ||
    !["zh-CN-XiaoxiaoNeural", "zh-CN-YunxiNeural"].includes(
      next.speech.chineseVoice,
    )
  )
    throw new Error("请选择当前支持的声线");
  for (const key of ["subscription", "resourceGroup", "resourceName"])
    if (next.speech[key] && !/^[a-zA-Z0-9._-]+$/.test(next.speech[key]))
      throw new Error("Azure 资源名称格式无效");
  return next;
}
export async function saveSettings(
  input,
  file = SETTINGS_FILE,
  environment = process.env,
) {
  const next = prepareSettings(input, file, environment);
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = file + "." + randomUUID() + ".tmp";
  await writeFile(tmp, JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });
  await rename(tmp, file);
  return publicSettings(next);
}
export function redactError(message, settings = getSettings()) {
  let text = String(message);
  const s = settings;
  for (const key of [s.google.apiKey, s.copilot.token, s.speech.key])
    if (key) text = text.replaceAll(key, "[redacted]");
  return text;
}
export function directorConfigured() {
  const s = getSettings();
  return s.director.provider === "copilot" || !!s.google.apiKey;
}
export function preferredVoice(language) {
  const s = getSettings().speech;
  return s.provider === "local"
    ? language === "zh"
      ? "Microsoft Huihui Desktop"
      : "Microsoft David Desktop"
    : "Azure " + (language === "zh" ? s.chineseVoice : s.englishVoice);
}
export function speechConfigured() {
  const s = getSettings().speech;
  return s.provider === "local"
    ? process.platform === "win32"
    : !!(
        s.region &&
        (s.key || (s.subscription && s.resourceGroup && s.resourceName))
      );
}
export function imageConfigured() {
  const s = getSettings().google;
  return s.imageMode === "uploads" || !!s.apiKey;
}
export function speechEnvironment() {
  const s = getSettings().speech;
  return {
    ...process.env,
    SPEECH_KEY: s.key,
    SPEECH_REGION: s.region,
    AZURE_SPEECH_SUBSCRIPTION: s.subscription,
    AZURE_SPEECH_RESOURCE_GROUP: s.resourceGroup,
    AZURE_SPEECH_RESOURCE_NAME: s.resourceName,
  };
}
