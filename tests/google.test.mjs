import test from "node:test";
import assert from "node:assert/strict";
import { generate } from "../src/google.mjs";
test("Google key travels in server header and provider errors redact it", async () => {
  const old = process.env.GOOGLE_API_KEY;
  process.env.GOOGLE_API_KEY = "test-secret";
  try {
    await assert.rejects(
      () =>
        generate(
          "model",
          [{ role: "user", parts: [{ text: "test" }] }],
          {},
          {
            settings: {
              director: { provider: "gemini" },
              google: { apiKey: "test-secret" },
            },
            fetchImpl: async (url, init) => {
              assert.equal(init.headers["x-goog-api-key"], "test-secret");
              assert.ok(!url.includes("test-secret"));
              assert.ok(!init.body.includes("test-secret"));
              return {
                ok: false,
                status: 403,
                json: async () => ({ error: { message: "bad test-secret" } }),
              };
            },
          },
        ),
      (e) =>
        e.message.includes("[redacted]") && !e.message.includes("test-secret"),
    );
  } finally {
    if (old === undefined) delete process.env.GOOGLE_API_KEY;
    else process.env.GOOGLE_API_KEY = old;
  }
});
test("provider surfaces blocked or empty candidates clearly", async () => {
  const old = process.env.GOOGLE_API_KEY;
  process.env.GOOGLE_API_KEY = "test";
  try {
    await assert.rejects(
      () =>
        generate(
          "model",
          [],
          {},
          {
            settings: {
              director: { provider: "gemini" },
              google: { apiKey: "test" },
            },
            fetchImpl: async () => ({
              ok: true,
              json: async () => ({ promptFeedback: { blockReason: "SAFETY" } }),
            }),
          },
        ),
      /SAFETY/,
    );
  } finally {
    if (old === undefined) delete process.env.GOOGLE_API_KEY;
    else process.env.GOOGLE_API_KEY = old;
  }
});
