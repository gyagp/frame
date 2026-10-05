# V2 production verification — 2026-10-05

Stage: **keyframes ready, awaiting visual approval**. The user approved the story
in Studio and selected the Ocean palette. Frame and sample approvals remain false.
Current output: `outputs/subgroup-matrix-v2/215e396510d34f10/`.
This record does not certify finished film quality or audio quality.

## Production recovery

The initial preparation failed because a single Copilot / GPT-6 Astra request for
all 12 shots exceeded the former 150-second timeout. Compilation now requests one
shot at a time, awaits a durable checkpoint before the next request, and allows
up to 600 seconds for a complex shot. Progress reports the shot and whether the
model is designing or writing. Failed retries reuse completed shots and images.

All 12 scene programs were generated and saved in the recovered run. Existing
Nano Banana device artwork was reused. A subsequent actual-frame inspection found
edge-versus-center text coordinates that cropped headings. The generated-data
adapter now corrects the narrow static-text case; this film's affected headings
and native benchmark value/axis labels were repaired without changing the approved
story. Exact duplicate evidence notes were removed where the renderer already
overlays the same note. The opening title now keeps “Right here.” on one line.

Each scene now has an authored representative frame time. The review grid and
contact sheet show completed chart reveals rather than half-grown bars without
their results. Actual opening, hardware, API/LinAlg, contribution and both AMD
evidence frames were inspected; the declared bars, hardware and numerical labels
are preserved. The 12-shot contact sheet was also inspected. Automated still-frame
critique is in the current output's `quality.json`; it is not a motion or audio review.

Verification: 35 unit checks passed, editor UI regression passed, and the V1 film
retains fingerprint `a2f0e7a165a985d7` with its existing approvals.

## Earlier story package checks

Completed:

- Project schema validation: 12 unique shots, contiguous 168-second timeline,
  English narration, 1920×1080 at 24 fps, Azure voice.
- Every scene's claim IDs resolve to the evidence ledger. Both source snapshots
  match the original SHA-256 hashes. Native 4.13× and ORT 1.82× arithmetic checked.
- Five credited Dawn CLs independently confirmed MERGED through Gerrit; Microsoft
  Agility release page checked for preview status. Source access limits and dated
  ORT integration status are explicitly recorded.
- Browser check: V2 appears in Studio, all 12 shot plans and voice texts are
  accessible, directing/sound details expand, placeholder artwork is labeled.
- Desktop and 390-pixel mobile review pages inspected from actual screenshots;
  no horizontal overflow or browser page errors. Checks did not submit any
  project edits, approvals or production jobs.
- `npm test`: 23 tests passed. `npm run test:ui`: editor navigation, temporary
  project creation/save/duplication, mobile layout and origin check passed.
- V1 still has all approvals; its current fingerprint remains
  `a2f0e7a165a985d7`. No V1 source, soundtrack or movie was replaced.

Not yet performed:

- The newly directed sectional score implementation, speech synthesis,
  pronunciation checking, measured subtitle timing, audio normalization or ASR.
- Normal-speed motion review, listening review, short sample approval or full render.

The review webpage can be regenerated after story edits with:

```powershell
node scripts/story-review.mjs subgroup-matrix-v2
```

This reusable command reads project.json and writes only the script-review HTML;
it does not approve a project or invoke any image, voice or video service.
