# Anatomy in Movie Studio

Use Anatomy for isometric technical illustrations, mechanism studies, and
standalone interactive explainers. For film work, pair it with
[technical-demo-film](../../technical-demo-film/SKILL.md) and
[film-motion](../../film-motion/SKILL.md).

## Design and evidence

Write the concept-to-mechanism mapping before geometry: what moves, what the
movement means, and which source supports each readout. A mechanical analogy is
conceptual animation; keep it distinct from recorded measurements and live GPU
execution. Carry baseline, precision, hardware and measurement date into evidence
captions. Keep sources and asset credit in the film's `sources.json` and credits.

Apply Anatomy's purposeful detail, solid shading, real supports, resolved line
ends and painter's order. Choose density, palette, framing and labels for the
film's audience, runtime and legibility. Upstream Figure/Hero/Epic counts and
estimates are planning examples, not quotas or additional approval gates. Preserve
the user's requested subject and visual language when a physical analogy does not fit.

## Authoring and rendering

The vendored `kit/`, `examples/` and local CLI helpers support standalone SVG/HTML
authoring. Run reviewed local build scripts; keep experiments and screenshots in
the repository's ignored `outputs/anatomy/` directory. The upstream examples are
references credited to Ryan, not new Studio film assets.

For a film, translate the design into the supported data-only scene graph or
prepare a reviewed static PNG asset through the existing image workflow. An
exported still remains a still. The Studio has no Anatomy HTML, arbitrary SVG,
JavaScript or shader importer; do not add executable content to `project.json`
or accept it through the browser API. Never evaluate LLM-written JavaScript as
project content.

The interactive examples use animation loops, springs and interaction history.
They are not seekable film timelines. Film animation must remain a pure function
of project data, time and loaded assets in `src/film.mjs`, including when frames
are rendered out of order. Implement any adapter as reviewed engine code with
validation and tests before claiming it is supported.

Anatomy's optional WebGL effects and beta rotating-figure engine are separate
from Movie Studio's production renderers. A successful SVG example does not verify
either one. Explicitly requested 3D films still follow
[film-3d](../../film-3d/SKILL.md); do not substitute an isometric illustration for
editable geometry, rigging or animation.

Preserve story/shot approval → keyframe approval → voiced sample → sample approval
→ full film. Use Azure Speech for narration. Installing this skill grants no film
approval and does not alter existing projects.

## Verification and sharing

From the repository root, run `npm run test:anatomy` to rebuild the dial-indicator
example in an isolated output directory, compare it with the pinned pages, and
check keyboard interaction, synchronized geometry/readouts, reduced motion and
desktop/mobile layout. Inspect its saved PNGs. This checks the standalone SVG
path, not all upstream examples or the WebGL/3D engine. For new artwork use the
applicable geometry, line-end and visual checks in `verify.md`; report actual
failures instead of treating bundled examples as pre-approved.

Before a full film render, inspect three representative actual frames. Run
`npm test` for engine/API/timeline changes and `npm run test:ui` for Studio UI
changes. Use existing film QA for audio; do not infer listening or ASR results
from illustration checks.

The optional community publisher is not part of Studio rendering or verification.
Use it only for a user-requested gallery submission, following `publish.md`; use
`--no-session` to omit automatic session-log metadata. Authorization to push this
repository's milestones does not authorize submitting figures to another repository.
