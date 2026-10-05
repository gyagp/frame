// Capability is code-owned. Project metadata records intent, never enables a backend.
export function requires3D(project) {
  return (
    project?.brief?.renderMedium === "3d" ||
    ["three", "blender"].includes(project?.production?.backend)
  );
}

export function productionUnavailable(project) {
  if (requires3D(project))
    return "3D 制作管线尚未接入。故事可以保存和确认；角色、场景、动画及渲染接入后，再制作关键画面与有声样片。";
  if (project?.production?.backend && project.production.backend !== "canvas2d")
    return "尚不支持这个作品指定的制作引擎。";
  return null;
}

export function assertProductionAvailable(project) {
  const message = productionUnavailable(project);
  if (message) throw new Error(message);
}
