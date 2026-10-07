// Diagnostic summaries do not score realism or approve the user's frames.
export function summarizeBlenderFrames(diagnostics, manual = {}) {
  if (!Array.isArray(diagnostics?.frames) || !diagnostics.frames.length)
    throw new Error("请先制作关键帧，再运行实际画面检查");
  const grouped = new Map();
  for (const frame of diagnostics.frames)
    for (const finding of [...frame.findings, ...frame.cameraFindings]) {
      const key = `${frame.sceneId}:${finding.code}:${finding.actorId ?? ""}`;
      if (!grouped.has(key))
        grouped.set(key, {
          sceneId: frame.sceneId,
          severity: finding.severity ?? "warning",
          code: finding.code,
          issue: finding.issue,
          frames: [],
          suggestion: finding.corrected
            ? "自动修正已记录，请检查修正后的构图。"
            : "查看三帧对照，区分镜头意图与需要修正的问题。",
        });
      grouped.get(key).frames.push(frame.frame);
    }
  return {
    summary: `已检查 ${diagnostics.frames.length} 个实际静帧，发现 ${grouped.size} 类技术提醒。写实程度与自然表演仍需逐项审阅。`,
    scope:
      "Local pixel and camera diagnostics; not AI art review, natural-motion review, listening or ASR",
    findings: [...grouped.values(), ...(manual.findings ?? [])],
    manualSummary: manual.summary ?? null,
    checkedFrames: diagnostics.frames.length,
  };
}
