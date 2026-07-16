import { createHash } from "node:crypto";
import { stableJson } from "./data-model.mjs";

export const publicSnapshotSemanticPackNames = Object.freeze([
  "agency",
  "entity",
  "flow",
  "health",
  "insight",
  "relation",
  "structure",
  "temporal",
]);

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export function publicSnapshotDigestProjection(packs) {
  if (!packs || typeof packs !== "object" || Array.isArray(packs)) {
    throw new TypeError("Public snapshot digest requires a pack map.");
  }
  const missing = publicSnapshotSemanticPackNames.filter((name) => !Object.hasOwn(packs, name));
  if (missing.length) {
    throw new Error(`Public snapshot digest is missing semantic packs: ${missing.join(", ")}.`);
  }
  return Object.fromEntries(
    publicSnapshotSemanticPackNames.map((name) => [name, packs[name]]),
  );
}

export function computePublicSnapshotDigest(packs) {
  return sha256(stableJson(publicSnapshotDigestProjection(packs)));
}

export function auditPublicSnapshotDigest(packs) {
  const actual = packs?.publication?.publicSnapshotDigest ?? null;
  let expected = null;
  try {
    expected = computePublicSnapshotDigest(packs);
  } catch (error) {
    return {
      pass: false,
      expected,
      actual,
      findings: [{
        id: "public-snapshot-digest-input-invalid",
        path: "publication.publicSnapshotDigest",
        message: error instanceof Error ? error.message : String(error),
      }],
    };
  }
  const pass = actual === expected;
  return {
    pass,
    expected,
    actual,
    findings: pass ? [] : [{
      id: "public-snapshot-digest-mismatch",
      path: "publication.publicSnapshotDigest",
      expected,
      actual,
    }],
  };
}
