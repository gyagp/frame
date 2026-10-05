---
name: film-sound
description: Direct narration, score, sound effects and subtitle timing for Movie Studio films. Use when preparing audio, improving pacing or checking a mix.
---

Treat sound as part of the shot plan. Choose a narrator's intention and a consistent
voice. Azure neural voices are the online default; Windows voices are an
explicit offline option, not a silent downgrade when the provider fails.

Keep the screenplay in scene narration. Generate sentence-level WAVs and measure
their real durations. Place subtitle cues from those measured clips, not estimated
reading speed. Cache by model, voice, direction and text. Spell ambiguous numbers or
acronyms for pronunciation; retain precise numerical labels on screen.

Use `scripts/audio.mjs`: voice, original score and transition effects follow the
same scene boundaries. Keep music below speech with a smoothed ducking envelope;
sample-by-sample threshold switching introduces modulation artifacts. Build quiet
pauses before meaningful reveals. Choose music density for the story, not a stock
emotional preset.

If narration does not fit, rewrite or lengthen the scene; moderate time stretching
is permitted, but fail rather than cut off speech. Inspect line boundaries and the
last word. Target -14 LUFS with two-pass loudness normalization and a true-peak
ceiling around -1.5 dBTP. Re-measure the encoded output.

Transcribe generated speech back when available, inspect mismatches, and listen
before claiming human listening QA. Report automated transcription and listening
as distinct checks. Deliver burned captions plus an editable SRT.

For physical scenes, distinguish near contact sounds, mid-distance activity and
far ambience. Tie the first audible contact to the visible event, then let the
response decay. Keep the primary action readable; constant impacts and dense BGM
do not substitute for weight. Planned woodwind/water/cloth cues are not delivered
audio until corresponding assets or synthesis exist and the mix has been heard.
