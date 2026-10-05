---
name: film-motion
description: Build reproducible cinematic frames and motion in Movie Studio, including Nano Banana keyframes, code graphics, image camera moves and transitions.
---

Choose the medium by the shot: code for exact typography, charts, mathematical
diagrams and UI; generated images for atmosphere, environments and art direction;
supplied footage or photography when it is the subject. Do not bake important
numbers, formulas or UI labels into generated artwork.

Generate frames through `src/google.mjs` using the server-only `GOOGLE_API_KEY`.
Keep prompts, model, creation date and file identity in the asset sidecar. Match
palette, subject description and lighting across prompts. Review candidates before
using them. A generated keyframe with a camera move is not generated live-action
footage; describe the implementation accurately.

Use `drawFrame(context, project, time, assets, cues)` in `src/film.mjs` for both
preview and export. Every frame must render independently: no wall clock, unseeded
randomness, previous-frame accumulation or live network dependencies.

Use push for emphasis, pull for context, track for following and locked frames for
evidence. Frame content before motion; keep captions and evidence in safe areas.
Design transitions in the film's visual language and avoid an accidental blank.
Render at least the opening, signature moment and dense frame, plus strips across
critical transitions. Inspect final-resolution exports, not only browser thumbnails.

Run `npm run stills`; generated review images belong in `outputs/`. The Node canvas
font parser requires conventional 100-step font weights; avoid intermediate weights
such as 650 that can be misparsed. Freeze canvas images before tiling a contact sheet.
