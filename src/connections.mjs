import path from "node:path";
import { getSettings, redactError } from "./settings.mjs";
import { testCopilot } from "./copilot.mjs";
import { ROOT, run } from "../scripts/lib.mjs";
export async function testConnection(
  kind,
  { fetchImpl = fetch, settings = getSettings() } = {},
) {
  const s = settings;
  try {
    if (kind === "director" && s.director.provider === "copilot")
      return { ok: true, ...(await testCopilot(s.copilot)) };
    if (kind === "director" || kind === "image") {
      if (kind === "image" && s.google.imageMode === "uploads")
        return {
          ok: true,
          message: "已选择上传素材与代码画面，无需连接生图服务。",
        };
      if (!s.google.apiKey) throw new Error("请填写 Google API Key 后保存。");
      const r = await fetchImpl(
        "https://generativelanguage.googleapis.com/v1beta/models",
        {
          headers: { "x-goog-api-key": s.google.apiKey },
          signal: AbortSignal.timeout(20000),
        },
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j.error?.message || "连接失败");
      const target = kind === "image" ? s.google.imageModel : s.director.model;
      const available = j.models?.some((m) => m.name === "models/" + target);
      return {
        ok: !!available,
        message: available
          ? "连接成功，账号列出了所选模型。"
          : "连接成功，但账号未列出所选模型，请检查模型名称。",
        models:
          j.models?.map((m) => ({
            id: m.name.replace(/^models\//, ""),
            name: m.displayName,
          })) ?? [],
      };
    }
    if (kind === "speech") {
      if (s.speech.provider === "local")
        return {
          ok: process.platform === "win32",
          message:
            process.platform === "win32"
              ? "已选择 Windows 本地配音，无需云端密钥。"
              : "当前系统不支持 Windows 本地配音，请选择 Azure。",
        };
      let key = s.speech.key;
      if (
        !key &&
        s.speech.subscription &&
        s.speech.resourceGroup &&
        s.speech.resourceName
      ) {
        const r = await run("powershell.exe", [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          path.join(ROOT, "scripts", "azure-key.ps1"),
          "-Subscription",
          s.speech.subscription,
          "-ResourceGroup",
          s.speech.resourceGroup,
          "-ResourceName",
          s.speech.resourceName,
        ]);
        key = r.out.trim();
      }
      if (!key || !s.speech.region)
        throw new Error(
          "请填写 Azure Speech Key 和服务区域，或配置 Azure CLI 资源。",
        );
      const r = await fetchImpl(
        `https://${s.speech.region}.tts.speech.microsoft.com/cognitiveservices/voices/list`,
        {
          headers: { "Ocp-Apim-Subscription-Key": key },
          signal: AbortSignal.timeout(20000),
        },
      );
      if (!r.ok)
        throw new Error(
          `Azure Speech 返回 ${r.status}，请检查区域、密钥和账号权限。`,
        );
      const voices = await r.json();
      return {
        ok: true,
        message: "Azure Speech 已连接。",
        voices: voices
          .filter((v) => ["en-US", "zh-CN"].includes(v.Locale))
          .map((v) => ({ id: v.ShortName, name: v.DisplayName })),
      };
    }
    throw new Error("未知连接类型");
  } catch (e) {
    return { ok: false, message: redactError(e.message, s) };
  }
}
