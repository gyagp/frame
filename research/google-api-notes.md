# Google API integration evidence

Checked 2026-10-04. `GOOGLE_API_KEY` is read from server process environment or an
ignored `.env`; it is never sent to the browser or stored in project metadata.

- Image generation: <https://ai.google.dev/gemini-api/docs/image-generation>
- Speech generation: <https://ai.google.dev/gemini-api/docs/speech-generation>
- Live model enumeration: `GET https://generativelanguage.googleapis.com/v1beta/models`

The documentation currently emphasizes the Interactions API. The live model list
also advertises `generateContent`, used by this studio to keep a small REST adapter.
Verified image model: `gemini-3.1-flash-image` (Nano Banana); tested against the real
API and retained the generated image plus prompt sidecar in the first project.

Speech: an initial `gemini-2.5-flash-preview-tts` request returned empty `OTHER`.
`gemini-3.8-flash-tts` was listed as available and returned audio in a direct test,
and returned audio. The user subsequently selected Azure Speech and explicitly
excluded Google narration; all Google TTS code and choices have been removed.
Director drafts use `gemini-3.8-flash`: despite being listed, `gemini-2.5-flash`
returned a 404 explaining that it was unavailable to new users and recommending 3.8.

Model IDs can be overridden through documented environment variables. Requests have
timeouts and errors are visible; no unlimited retries or silent provider downgrades.
Generated image prompts and narration text are sent to Google when those actions
are run. Billing and quotas follow the user's Google account.
