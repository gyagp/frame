import test from "node:test";
import assert from "node:assert/strict";
import { physicalEvents, addPhysicalSound } from "../src/physical-sound.mjs";
test("physical sounds use measured scene time, deduplicate contacts and reject invalid actors", () => {
  const scene = {
    id: "s",
    duration: 2,
    spatial: { environment: "river-v2", actors: [{ id: "pony" }] },
  };
  const p = { scenes: [{ ...scene, id: "intro" }, scene] };
  const reports = {
    intro: {},
    s: {
      contacts: { pony: { time: 0.5 } },
      contactEvents: [
        { actorId: "pony", time: 0.5, kind: "water" },
        { actorId: "pony", time: 1, kind: "hoof" },
      ],
    },
  };
  const events = physicalEvents(p, reports);
  assert.deepEqual(
    events.map((e) => [e.time, e.kind]),
    [
      [2.5, "water"],
      [3, "hoof"],
    ],
  );
  reports.s.contactEvents[0].actorId = "not-in-scene";
  assert.throws(() => physicalEvents(p, reports), /Invalid physical/);
  assert.throws(() => physicalEvents(p, {}), /Missing contact/);
});
test("physical mix is deterministic, finite and leaves the narration array length intact", () => {
  const p = {
    scenes: [{ id: "s", duration: 1, spatial: { environment: "river-v2" } }],
  };
  const a = new Float32Array(24000),
    b = new Float32Array(24000);
  const events = [
    { time: 0.3, kind: "water", gain: 0.026 },
    { time: 0.7, kind: "hoof", gain: 0.02 },
  ];
  addPhysicalSound(a, 24000, p, events);
  addPhysicalSound(b, 24000, p, events);
  assert.deepEqual(a, b);
  assert.ok(a.every(Number.isFinite));
  assert.ok(a.some((x) => Math.abs(x) > 0.002));
  assert.ok(a.every((x) => Math.abs(x) < 0.06));
});
