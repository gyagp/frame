import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const digest = (b) => createHash("sha256").update(b).digest("hex");
const sha = (value) =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
// A code-only repair may retain a real approval only after reproducing its exact
// approved sample. Proofs are local, tied to this precise new runtime fingerprint,
// and never replace or write the user's review fields.
export function equivalentApproval(root, project, currentHash) {
  if (!/^[a-z0-9-]+$/.test(project.id) || !/^[a-f0-9]{16}$/.test(currentHash))
    return null;
  try {
    const proof = JSON.parse(
      readFileSync(
        path.join(
          root,
          ".studio-local",
          "approval-equivalence",
          `${project.id}-${currentHash}.json`,
        ),
        "utf8",
      ),
    );
    if (
      proof.version !== 1 ||
      proof.projectId !== project.id ||
      proof.currentHash !== currentHash ||
      !/^[a-f0-9]{16}$/.test(proof.approvedHash) ||
      project.review?.frames !== proof.approvedHash ||
      project.review?.sample !== proof.approvedHash
    )
      return null;
    for (const [before, after] of [
      [proof.inputBefore, proof.inputAfter],
      [proof.visualBefore, proof.visualAfter],
      [proof.sampleBefore, proof.sampleAfter],
    ])
      if (!sha(before) || before !== after) return null;
    for (const key of [proof.approvedHash, currentHash])
      if (
        digest(
          readFileSync(
            path.join(root, "outputs", project.id, key, "sample.mp4"),
          ),
        ) !== proof.sampleBefore
      )
        return null;
    return proof.approvedHash;
  } catch {
    return null;
  }
}
