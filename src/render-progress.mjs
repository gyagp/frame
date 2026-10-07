// Progress/ETA is observer state. It never participates in frame evaluation.
export function frameProgress({
  scenes,
  fps,
  activeIndex,
  files,
  startedAt,
  now = Date.now(),
}) {
  if (
    !Number.isInteger(activeIndex) ||
    activeIndex < 0 ||
    activeIndex >= scenes.length
  )
    throw new Error("Invalid active shot");
  const totals = scenes.map((s) => Math.round(s.duration * fps));
  const total = totals.reduce((a, b) => a + b, 0),
    shotTotal = totals[activeIndex];
  const unique = new Map();
  for (const file of files) {
    if (
      Number.isInteger(file.frame) &&
      file.frame >= 1 &&
      file.frame <= shotTotal &&
      file.mtime > startedAt &&
      file.mtime <= now - 750 &&
      file.size > 0
    )
      unique.set(file.frame, file);
  }
  const recent = [...unique.values()]
    .sort((a, b) => a.frame - b.frame)
    .slice(-30);
  const first = recent[0],
    last = recent.at(-1);
  const secondsPerFrame =
    recent.length >= 5 && last.mtime > first.mtime
      ? (last.mtime - first.mtime) / 1000 / (last.frame - first.frame)
      : null;
  const done =
    totals.slice(0, activeIndex).reduce((a, b) => a + b, 0) + unique.size;
  const remainingSeconds =
    secondsPerFrame === null
      ? null
      : Math.ceil((total - done) * secondsPerFrame);
  return {
    activeSceneId: scenes[activeIndex].id,
    sceneIndex: activeIndex + 1,
    sceneCount: scenes.length,
    shotDone: unique.size,
    shotTotal,
    done,
    total,
    picturePercent: (100 * done) / total,
    progress: Math.floor(12 + (65 * done) / total),
    secondsPerFrame,
    remainingSeconds,
    lastFrameAt: last ? new Date(last.mtime).toISOString() : null,
  };
}
export function progressMessage(title, state) {
  if (state.done === state.total)
    return `画面 ${state.total} 帧已完成，正在编码与合成电影`;
  let eta = "正在估算剩余时间";
  if (state.remainingSeconds !== null) {
    const minutes = Math.max(1, Math.ceil(state.remainingSeconds / 60));
    eta =
      minutes >= 60
        ? `画面预计还需约 ${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`
        : `画面预计还需约 ${minutes} 分钟`;
  }
  return `镜头 ${state.sceneIndex}/${state.sceneCount} · ${title} · ${state.shotDone}/${state.shotTotal} 帧；全片画面 ${state.done}/${state.total} 帧（${state.picturePercent.toFixed(1)}%）；${eta}`;
}
