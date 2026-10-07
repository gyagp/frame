import { blenderReady } from "./blender-schema.mjs";
// Capability is code-owned. Only the trusted Blender scene contract enables dispatch.
export function requires3D(project) {
  return (
    project?.brief?.renderMedium === "3d" ||
    ["three", "blender"].includes(project?.production?.backend)
  );
}

export function productionUnavailable(project) {
  if (blenderReady(project)) return null;
  if (requires3D(project))
    return "3D 镜头尚未配置。请先准备受支持的 Blender 场景数据，再制作关键画面。";
  if (project?.production?.backend && project.production.backend !== "canvas2d")
    return "尚不支持这个作品指定的制作引擎。";
  return null;
}

export function assertProductionAvailable(project) {
  const message = productionUnavailable(project);
  if (message) throw new Error(message);
}
