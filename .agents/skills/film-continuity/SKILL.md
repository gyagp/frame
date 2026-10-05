---
name: film-continuity
description: Maintain subjects, visual rules, spatial direction and asset continuity across a film's shots. Use for multishot story films, generated keyframes or revisions that must preserve identity.
---

Read `project.bible` before generating or revising a shot. Keep identity, palette,
material language, recurring props and movement direction explicit. Distinguish
what the reference fixes from what the new shot may change.

Use approved or supplied references through the image provider's `referenceImage`
input. The first frame is a useful visual anchor, not a guarantee of perfect
character consistency. Store the reference path in the generated asset's sidecar.
Do not pretend that a text-only repeated character description is an image reference.

Compare adjacent ending and starting states: subject scale, screen direction,
positions, held objects, light source and color. For graphics, match the shape,
anchor and motion momentum. Changes should have a narrative reason.

Preserve editable layers and scene data. Altering a background should not force a
new narrator; changing a line should not regenerate every image. Invalidate only
relevant approvals and never silently replace approved artwork.

Current implementation is 2D. Blender is an allowed future local backend, but do
not install or build a 3D dependency for a 2D task. Pika and Seedance are excluded.
