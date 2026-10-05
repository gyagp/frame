// A narrow adapter for generated text that mistakenly uses an edge as its center.
// Correct only static, axis-aligned boxes when that interpretation fits on screen.
// Preserve animated/off-screen staging and all already valid centered coordinates.
export function repairTextAnchors(composition) {
  const adjustedLayerIds = [];
  if (!composition || !Array.isArray(composition.layers))
    return { composition, adjustedLayerIds };
  const layers = composition.layers.map((node) => {
    if (
      !node ||
      node.type !== "text" ||
      !Number.isFinite(node.x) ||
      !Number.isFinite(node.w) ||
      node.w <= 0 ||
      node.w > 1 ||
      node.rotation ||
      (node.scale !== undefined && node.scale !== 1) ||
      (Array.isArray(node.tracks) &&
        node.tracks.some((t) =>
          ["x", "w", "scale", "rotation"].includes(t.property),
        ))
    )
      return node;
    let x = node.x;
    if (
      node.align === "left" &&
      x >= 0 &&
      x - node.w / 2 < 0 &&
      x + node.w <= 1
    )
      x += node.w / 2;
    else if (
      node.align === "right" &&
      x <= 1 &&
      x + node.w / 2 > 1 &&
      x - node.w >= 0
    )
      x -= node.w / 2;
    if (x === node.x) return node;
    adjustedLayerIds.push(node.id);
    return { ...node, x };
  });
  return { composition: { ...composition, layers }, adjustedLayerIds };
}
