# Anatomy skill integration

Source: Ryan / [wheresryan22/anatomy](https://github.com/wheresryan22/anatomy),
revision [`e9488296a44211c42701ff71705b7901470ec78f`](https://github.com/wheresryan22/anatomy/tree/e9488296a44211c42701ff71705b7901470ec78f).
Retrieved 2026-10-18 (Asia/Shanghai) through GitHub API inspection and the
skill-installer's commit-pinned archive download. License: MIT, copyright 2026
Ryan; the complete notice is retained in
[the vendored LICENSE](../.agents/skills/anatomy/LICENSE).

## What is incorporated

[`.agents/skills/anatomy/`](../.agents/skills/anatomy/SKILL.md) contains the upstream
skill, SVG/geometry toolkit, reference guides, eight example directories, and
verification helpers. The complete upstream snapshot is retained; its nested
`.github/workflows/` is upstream reference material, not a root Studio CI workflow.

The useful method is to explain a concept through a recognizable physical
mechanism: derive numbers and motion from one model; build purposeful supported
parts; shade solids consistently; resolve line ends; and check depth order and
actual rendered detail. This supplements technical-film visual development.

Local changes are limited to the skill entrypoint's discovery description,
moving compatibility information into supported `metadata`, and an introduction
linking the [Movie Studio notes](../.agents/skills/anatomy/references/movie-studio.md).
Those notes and [UPSTREAM.json](../.agents/skills/anatomy/UPSTREAM.json) are additions.
Git blob comparison against the pinned upstream tree verified 152 unchanged files,
only `SKILL.md` modified, and no missing upstream files.

`AGENTS.md`, `film-motion` and `technical-demo-film` route suitable work to the
new skill. The original toolkit and examples are unmodified. Future upgrades
should compare against the recorded revision, preserve the Studio notes and MIT
notice, and rerun the standalone check before updating the provenance record.

## Production boundary

This is a repository skill and local authoring toolkit, not a newly integrated
Studio rendering backend. It adds no browser API, renderer, provider, project
schema, runtime dependency or automatic community publishing.

Standalone figures can use the upstream browser runtime. Movie Studio film
shots still require its validated data-only 2D scene graph or reviewed image
assets. Interactive springs, idle tours and wall-clock history must not enter
`src/film.mjs`. Any future adapter needs independent frame-time evaluation,
validation, and matching preview/export results before being described as supported.
Optional WebGL and the beta rotating-figure engine remain unverified here and do
not replace the separate Blender workflow for explicitly requested 3D films.

The Studio notes preserve brief/audience/language/runtime, factual provenance,
Azure narration and story → keyframe → voiced sample → full-film approvals.
Upstream aesthetic quotas do not override a film brief. Existing film projects
and approval records were not changed.

## Reproduction and validation

From the repository root with dependencies installed:

```powershell
npm run test:anatomy
npm test
```

`test:anatomy` uses the existing Playwright dependency and Edge by default, matching
the Studio UI checks; `BROWSER_CHANNEL` can select another installed Playwright
channel. It runs without the Studio server or credentials. Each run creates an
isolated `outputs/anatomy/smoke-*/` folder holding rebuilt pages, three screenshots
and `report.json`. It never rebuilds over the vendored examples or publishes them.

Verified 2026-10-18 (Asia/Shanghai), Windows, Node v23.11.0, Edge 155.0.4283.45:

| Check | Result |
| --- | --- |
| Dark and light dial-indicator builds | Both match the pinned pages, normalizing line endings; repeat builds also match |
| Desktop interaction | Home/End change carriage, plunger, needle and accessible readout; Home restores the starting geometry |
| Mobile and reduced motion | 390 px light layout has no horizontal overflow; idle pose holds past the tour interval; arrow key reaches the second block |
| Standalone behavior | No browser errors or external HTTP requests |
| Visual inspection | All three saved PNGs inspected: desktop at blocks 1 and 3, light mobile at block 2; figure and captions fit |
| Skill validation | Anatomy, film-motion and technical-demo-film pass `quick_validate.py` |
| Studio regression tests | `npm test`: 70 passed, 0 failed |

The upstream dark theme has deliberately faint structural lines and small
captions; choose contrast and type sizes for a film's actual output resolution.
The mobile image includes the expected keyboard focus outline. These captures
verify the installation's basic appearance and controls, not final film quality.

The complete upstream regression suite, dense geometry/line-end audits, React
examples, WebGL and 3D modes, performance, movie export and audio were not tested
in this milestone. The Studio UI was not changed. Upstream frame-rate figures
remain author-reported examples, not new measurements on this machine.
