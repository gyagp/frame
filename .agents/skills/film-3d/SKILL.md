---
name: film-3d
description: Plan and build editable 3D film assets, blocking, animation and rendering for Movie Studio when a film explicitly needs 3D. Distinguish real geometry and rigged performance from image parallax or video-model restyling.
---

Choose the backend for the shot. Three.js can render genuine geometry and is useful
for web previews and technical scenes; Blender is a suitable local authoring and
offline-rendering backend for rigged characters, materials and simulations. Neither
automatically provides good models or acting. Record actual capability separately
from the requested medium. Do not feed an unimplemented 3D project into the 2D
renderer and label the result 3D.

Read [the X reference synthesis](../../../research/x-filmmaking-3d.md) for the
previsualization/art direction split and [the shot-execution digest](../../../research/kangarooking-digest.md)
when designing spatial or action scenes. Some source films used paid video models
after Blender; their final appearance is not evidence of local Blender output.

Keep reusable assets separate: character mesh/rig/material, props, environment,
lighting and shot cameras. Store asset identity, version, scale, axes, origin and
provenance. A single reference image leaves unseen geometry undefined. Reuse one
approved character across shots instead of rebuilding its identity from prose.

Before high-quality frames, block the important spatial relationship and action
with simple geometry. Check the action can be seen, the camera route is possible,
and the exit pose can connect to the next shot. Blocking is a production technique
within the existing visual-review stage, not an extra mandatory user approval.

For character action, author anticipation, initiation, contact, weight transfer,
follow-through and settle as applicable. Synchronize root travel with gait; planted
feet remain planted. Eye/head/body reactions have motivated timing. Secondary
motion supports the main action. Bake simulations to versioned caches for random
frame access; a changing wall clock or previous-frame state must not determine export.

Separate structure references, identity references, material/lighting references,
motion references and camera references. Say which attributes stay fixed and which
may change. Generated art is a visual reference or texture, not a rigged 3D asset.

Use validated data, fixed asset IDs and trusted renderer/build scripts. Do not
execute arbitrary generated Python, JavaScript, shaders, expressions or shell from
project data. Prefer a background CLI worker for repeatable export; MCP is optional
for interactive authoring and does not confer visual quality. Local configuration
and executable locations belong to personal settings, not shared film projects.

Check the installed version and actual renderer availability before promising a
backend. Verify an isolated engineering fixture without touching approved films.
For production, preserve story approval → visual approval → voiced sample → sample
approval → full film. Inspect three actual representative frames and a motion sample;
still images cannot establish natural motion. Keep geometry/rigging, motion, camera,
materials, audio and playback checks separately marked passed, failed or not checked.
