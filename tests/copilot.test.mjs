import test from "node:test";
import assert from "node:assert/strict";
import { testCopilot, copilotGenerate } from "../src/copilot.mjs";

test("Copilot connection checks the chosen model without saving or substituting it", async () => {
  const models = [{ id: "gpt-6-astra", name: "GPT-6 Astra" }];
  const withClient = async (task, { settings }) => {
    assert.equal(settings.token, "test-token");
    return task({
      getAuthStatus: async () => ({ isAuthenticated: true }),
      listModels: async () => models,
    });
  };
  const selected = await testCopilot(
    { model: "gpt-6-astra", token: "test-token" },
    { withClient },
  );
  assert.equal(selected.ok, true);
  assert.match(selected.message, /GPT-6 Astra/);
  const missing = await testCopilot(
    { model: "unavailable-model", token: "test-token" },
    { withClient },
  );
  assert.equal(missing.ok, false);
  assert.deepEqual(missing.models, models);
  assert.ok(!missing.message.includes("test-token"));
});

test("Copilot honors creative timeout, reports phases without reasoning text, and cleans up on timeout", async () => {
  let callback,
    unsubscribed = false;
  const cleaned = [],
    progress = [];
  const session = {
    sessionId: "studio-owned-test-session",
    on: (handler) => {
      callback = handler;
      return () => {
        unsubscribed = true;
      };
    },
    sendAndWait: async (_request, timeout) => {
      assert.equal(timeout, 600000);
      callback({
        type: "assistant.reasoning_delta",
        data: { deltaContent: "private reasoning" },
      });
      callback({
        type: "assistant.message_delta",
        data: { deltaContent: '{"scenes":' },
      });
      throw new Error("Timeout after 600000ms waiting for session.idle");
    },
    abort: async () => cleaned.push("abort"),
    disconnect: async () => cleaned.push("disconnect"),
  };
  await assert.rejects(
    copilotGenerate(
      [{ role: "user", parts: [{ text: "A film" }] }],
      {},
      {
        settings: { model: "gpt-6-astra" },
        timeoutMs: 600000,
        onProgress: (p) => progress.push(p),
        withClient: async (task) =>
          task({
            getAuthStatus: async () => ({ isAuthenticated: true }),
            createSession: async (config) => {
              assert.equal(config.model, "gpt-6-astra");
              assert.equal(config.streaming, true);
              assert.deepEqual(config.availableTools, []);
              return session;
            },
            deleteSession: async (id) => {
              assert.equal(id, session.sessionId);
              cleaned.push("delete");
            },
          }),
      },
    ),
    /Timeout/,
  );
  assert.equal(unsubscribed, true);
  assert.deepEqual(cleaned, ["abort", "disconnect", "delete"]);
  assert.deepEqual(
    progress.map((p) => p.phase),
    ["thinking", "writing"],
  );
  assert.ok(!JSON.stringify(progress).includes("private reasoning"));
});
