import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  getSettings,
  publicSettings,
  saveSettings,
  prepareSettings,
} from "../src/settings.mjs";
test("settings persist locally and public responses never reveal credentials", async () => {
  const file = path.resolve(
    ".cache",
    "settings-tests",
    randomUUID(),
    "connections.json",
  );
  const view = await saveSettings(
    {
      director: { provider: "copilot" },
      copilot: { token: "test-copilot-token", model: "auto" },
      google: { apiKey: "test-google-secret" },
      speech: { key: "test-speech-secret", region: "japaneast" },
    },
    file,
    {},
  );
  assert.ok(view.google.apiKeyConfigured);
  assert.ok(view.copilot.tokenConfigured);
  assert.ok(!JSON.stringify(view).includes("test-google-secret"));
  assert.ok(!("key" in view.speech));
  assert.equal(getSettings(file, {}).director.provider, "copilot");
  assert.equal(getSettings(file, {}).speech.region, "japaneast");
  await saveSettings({ google: { apiKey: "" } }, file, {});
  assert.equal(getSettings(file, {}).google.apiKey, "test-google-secret");
  await saveSettings({ clearSecrets: ["google.apiKey"] }, file, {});
  assert.equal(
    publicSettings(getSettings(file, {})).google.apiKeyConfigured,
    false,
  );
});
test("invalid configuration is rejected without echoing sensitive values", async () => {
  const file = path.resolve(
    ".cache",
    "settings-tests",
    randomUUID(),
    "connections.json",
  );
  await assert.rejects(
    saveSettings({ speech: { region: "bad/region?key=secret" } }, file, {}),
    (e) => !e.message.includes("secret"),
  );
  await assert.rejects(
    saveSettings({ director: { provider: "pika" } }, file, {}),
  );
});
test("empty user configuration can use environment values without writing them", () => {
  const file = path.resolve(
    ".cache",
    "settings-tests",
    randomUUID(),
    "missing.json",
  );
  const s = getSettings(file, {
    GOOGLE_API_KEY: "env-only",
    SPEECH_REGION: "eastus",
  });
  assert.equal(s.google.apiKey, "env-only");
  assert.equal(s.speech.region, "eastus");
  assert.ok(!JSON.stringify(publicSettings(s)).includes("env-only"));
});
test("testing draft settings never changes the saved working connection", async () => {
  const file = path.resolve(
    ".cache",
    "settings-tests",
    randomUUID(),
    "connections.json",
  );
  await saveSettings({ google: { apiKey: "working-key" } }, file, {});
  const before = await readFile(file, "utf8");
  const draft = prepareSettings(
    { director: { provider: "copilot" }, copilot: { token: "candidate-key" } },
    file,
    {},
  );
  assert.equal(draft.director.provider, "copilot");
  assert.equal(draft.copilot.token, "candidate-key");
  assert.equal(await readFile(file, "utf8"), before);
});
