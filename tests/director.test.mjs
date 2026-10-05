import test from "node:test";
import assert from "node:assert/strict";
import { createProject } from "../src/model.mjs";
import { compileMotion } from "../src/engine/director.mjs";
import { storySignature, reviewState } from "../scripts/lib.mjs";

const composition = {
  version: 1,
  background: "#101820",
  layers: [
    {
      id: "tile",
      type: "rect",
      x: 0.5,
      y: 0.4,
      w: 0.2,
      h: 0.2,
      fill: "#abcdef",
    },
  ],
};
const response = (id) => [
  { text: JSON.stringify({ scenes: [{ id, composition }] }) },
];

test("motion checkpoints survive a later timeout and resume without redoing completed shots", async () => {
  const p = createProject({ title: "A story" }, "test");
  p.review = { story: storySignature(p) };
  const calls = [],
    stored = [];
  const checkpoint = async (shot) => {
    Object.assign(
      p.scenes.find((s) => s.id === shot.id),
      shot,
    );
    stored.push(shot.id);
  };
  await assert.rejects(
    compileMotion(p, p.scenes.slice(0, 3), "", {
      model: "gpt-6-astra",
      onCompiled: checkpoint,
      generateImpl: async (model, contents, config, options) => {
        assert.equal(model, "gpt-6-astra");
        assert.equal(options.timeoutMs, 600000);
        const context = JSON.parse(
          contents[0].parts[0].text.split("Project data: ")[1].trim(),
        );
        assert.equal(context.shots.length, 1);
        const id = context.shots[0].id;
        calls.push(id);
        if (calls.length === 2) {
          assert.deepEqual(stored, [p.scenes[0].id]);
          throw new Error("Timeout waiting for session.idle");
        }
        return response(id);
      },
    }),
    /Timeout/,
  );
  assert.deepEqual(stored, [p.scenes[0].id]);
  const remaining = p.scenes.slice(0, 3).filter((s) => !s.composition);
  const resumed = [];
  await compileMotion(p, remaining, "", {
    onCompiled: checkpoint,
    generateImpl: async (_model, contents) => {
      const context = JSON.parse(
        contents[0].parts[0].text.split("Project data: ")[1].trim(),
      );
      resumed.push(context.shots[0].id);
      return response(context.shots[0].id);
    },
  });
  assert.deepEqual(resumed, [p.scenes[1].id, p.scenes[2].id]);
  assert.equal(reviewState(p).storyApproved, true);
  assert.equal(reviewState(p).framesApproved, false);
});

test("invalid motion JSON gets one bounded repair and is never checkpointed", async () => {
  const p = createProject({ title: "A story" }, "test");
  let attempts = 0,
    writes = 0;
  await assert.rejects(
    compileMotion(p, [p.scenes[0]], "", {
      generateImpl: async () => {
        attempts++;
        return [{ text: "incomplete {" }];
      },
      onCompiled: async () => {
        writes++;
      },
    }),
    /JSON/,
  );
  assert.equal(attempts, 2);
  assert.equal(writes, 0);
});

test("malformed scene entries are rejected and repaired before saving", async () => {
  const p = createProject({ title: "A story" }, "test");
  let attempts = 0;
  const result = await compileMotion(p, [p.scenes[0]], "", {
    generateImpl: async () =>
      ++attempts === 1
        ? [{ text: '{"scenes":[null]}' }]
        : response(p.scenes[0].id),
  });
  assert.equal(attempts, 2);
  assert.equal(result[0].id, p.scenes[0].id);
});
