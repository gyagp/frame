---
name: film-quality-review
description: Review actual film frames and previews against the brief, produce actionable findings, and guide bounded shot revisions. Use when evaluating cinematic quality or deciding what to improve before completing a film.
---

Review an output, not merely its prompt. Render actual representative frames, then
use `critiqueFrames` in `src/engine/director.mjs` for a multimodal still-frame review.
Tie every finding to a scene, evidence, severity and specific correction.

Evaluate hierarchy, legibility, staging, consistent identity and visual direction.
Do not infer animation continuity or audio quality from stills. Check the voiced
sample at normal playback speed for timing, movement, pronunciation and musical
balance. Clearly mark checks not performed.

Prefer a targeted revision through `compileMotion(project, [scene], feedback)`.
Keep the approved story and facts intact unless the user requests a story change.
Use the old version as an explicit comparison and preserve it for recovery.

An AI judgment informs the user's decision; it is not a replacement for the
requested story, keyframe and sample approvals. Do not invent a quality score or
claim that an engine guarantees good art. A useful engine makes good decisions
reproducible, visible and easier to correct.

For 3D character films, review geometry/rig, performance, camera, surface/light and
sound separately. Check planted-foot sliding, weight transfer, self-intersection,
prop attachment, causal water/cloth response, camera acceleration and matching
entry/exit states. Review at playback speed as well as contact/transition frame
strips. A codec frame-rate check does not prove natural motion, and frame sampling
does not prove the whole clip is smooth. Record exactly what was inspected.

Repair one major cause per iteration, keep the before/after version and state what
remains unresolved. Do not regenerate unaffected assets or narration to fix a
camera path. See [the research synthesis](../../../research/x-filmmaking-3d.md).
