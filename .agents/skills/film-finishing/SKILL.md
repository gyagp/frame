---
name: film-finishing
description: Render, inspect and package a Movie Studio film with reproducible source, explicit QA results and revision-safe outputs.
---

Validate the project before rendering. Freeze a project snapshot and preserve prior
outputs. Failures must surface in the studio with useful recovery guidance; keep
completed assets and do not retry paid generation indefinitely.

Run `node scripts/stills.mjs <id>` and inspect representative frames. After the user
confirms story and visuals, render a short sample with
`node scripts/render.mjs <id> --sample --start 0 --length 12`. Only after the user's
sample approval render the full film using `node scripts/render.mjs <id>`.
`node scripts/verify.mjs <id>` checks media structure,
duration, loudness and black frames and produces a contact sheet. Review whole-film
coverage and 0.2-second strips around meaningful motion. A passing codec check does
not prove a good film.

Check legibility at normal viewing size, frame and caption overlap, title dwell,
motion continuity, voiced terminology and evidence labels. Separate automatic QA,
visual review, ASR and full-speed listening in `qa.json`. Never mark skipped work as
passed. If the user wants a polished release, close significant findings before
calling it final.

Deliver MP4, poster, SRT, treatment, credits, project snapshot and rebuild command.
Use `outputs/<id>/<snapshot>/` for generated artifacts; do not put video binaries,
API keys or model caches into Git. After revisions, rebuild from the new snapshot.

The user reviews a concrete artifact in the studio. Do not require a new approval
for reversible local edits already requested; external publication remains separate.
