import { configureBlender, blenderStatus } from "../src/blender.mjs";
console.log(
  process.argv[2]
    ? await configureBlender(process.argv[2])
    : await blenderStatus(),
);
