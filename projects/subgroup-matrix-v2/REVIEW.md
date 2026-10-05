# V2 production verification — 2026-10-05

Stage: **full film exported after the user's story, frame and sample approvals**.
The selected palette is Ocean. Current movie:
`outputs/subgroup-matrix-v2/1b7a1e7f41cd99ea/film.mp4`.
The earlier keyframe output remains at `215e396510d34f10`.
Automated checks and sampled-frame review do not replace full-speed listening.

## Audio recovery and export

The first full render stopped at the 14-second matrix-bottleneck shot: its three
Azure clips totaled 17.4924 seconds including clip-edge silence. The repair
preserved the complete script, scene lengths and visuals. Only that overflowing
shot removed 0.7264 seconds of near-digital edge padding (with phoneme margins)
and used smaller scene/sentence gaps. Its pitch-preserving tempo is 1.2917,
within the existing 1.3 limit. All other shots retain their original audio path.

The engine now checks every scene's measured speech before creating a sample.
Longer narration that still cannot fit is rejected rather than cut off. Actual
stretched clip durations are checked against scene boundaries.

Both previously approved opening samples were reproduced byte-for-byte with the
fixed engine, and unchanged creative inputs, asset bytes and visual code were
verified. Local equivalence proofs retain those genuine approvals for this exact
new runtime fingerprint; the user's approval fields were not rewritten. V1's
finished movie remains available under its original output key.

Final validation: 168 seconds, 4032 frames, H.264 1920×1080/24fps, stereo AAC,
−14.7 LUFS, −4.2 dBTP, no detected black frames, all 32 subtitle cues inside their
scenes. Browser playback decoded audible media at both the opening and the repaired
second shot. Full-film contact sheet and the second-to-third-shot transition strip
were inspected. Independent transcription retained the second shot's full wording
and the final closing sentence; raw WER is 0.1095, largely affected by numeric and
acronym forms, with at least “controlled comparisons” transcribed as “control
comparisons”. This is an ASR check, not a human listening pass.

39 unit checks and the editor UI regression passed. Detailed media checks and
transcription are in the current output's `qa.json` and `asr-transcript.txt`.

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
critique is in the earlier keyframe output's `quality.json`; it is not a motion or audio review.

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

Remaining artistic work:

- The separately authored sectional score redesign is not implemented; this export
  uses the existing original procedural score.
- Independent full-speed listening and a complete artistic motion review are not
  claimed by these technical checks.

The review webpage can be regenerated after story edits with:

```powershell
node scripts/story-review.mjs subgroup-matrix-v2
```

This reusable command reads project.json and writes only the script-review HTML;
it does not approve a project or invoke any image, voice or video service.
