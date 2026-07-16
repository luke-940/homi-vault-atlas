import path from "node:path";

export const V73_VISUAL_GOLDEN_SCHEMA = "homi.atlas_v7_3.visual_golden_manifest.v1";
export const V73_VISUAL_GOLDEN_APPROVED_STATUS = "approved_iab_and_ubuntu_parity";
export const V73_VISUAL_GOLDEN_PENDING_STATUS = "incomplete_pending_iab_and_ubuntu_review";
export const V73_VISUAL_GOLDEN_RUNNER = "ubuntu-24.04";
export const V73_VISUAL_GOLDEN_PROJECT = "chromium";
export const V73_VISUAL_GOLDEN_PLATFORM = "linux";
export const V73_VISUAL_GOLDEN_SPEC = "v7-3-golden.spec.mjs";
export const V73_VISUAL_GOLDEN_ROUTE_IDS = Object.freeze([
  "home-default",
  "home-selected",
  "home-independent",
  "home-knowledge-return",
  "agency-default",
  "agency-actor",
  "agency-evolution",
  "explore",
  "observe",
  "flow",
  "time",
  "search-overlay",
  "data-overlay",
]);

const sha256Pattern = /^[a-f0-9]{64}$/;
const pngSignatureHex = "89504e470d0a1a0a";

function posixPath(value) {
  return String(value).replaceAll(path.sep, "/");
}

export function visualGoldenBaselinePath(route) {
  const name = `${route.id}-${route.viewport.width}x${route.viewport.height}`;
  return posixPath(path.join(
    "tests-visual",
    "__screenshots__",
    V73_VISUAL_GOLDEN_SPEC,
    `${name}-${V73_VISUAL_GOLDEN_PROJECT}-${V73_VISUAL_GOLDEN_PLATFORM}.png`,
  ));
}

export function resolveVisualGoldenCases(routeCases) {
  const byId = new Map(routeCases.map((route) => [route.id, route]));
  const missing = V73_VISUAL_GOLDEN_ROUTE_IDS.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    throw new Error(`Visual golden route contract drift: missing ${missing.join(", ")}`);
  }
  return Object.freeze(V73_VISUAL_GOLDEN_ROUTE_IDS.map((id) => {
    const route = byId.get(id);
    return Object.freeze({
      ...route,
      baselinePath: visualGoldenBaselinePath(route),
    });
  }));
}

export function hasVisualGoldenPngMagic(body) {
  return Buffer.isBuffer(body)
    && body.length >= 8
    && body.subarray(0, 8).toString("hex") === pngSignatureHex;
}

export function validateVisualGoldenManifest({ manifest, expectedCases, baselineEvidence }) {
  const failures = [];
  if (manifest?.schema !== V73_VISUAL_GOLDEN_SCHEMA) failures.push("manifest-schema");
  if (manifest?.status !== V73_VISUAL_GOLDEN_APPROVED_STATUS) failures.push("manifest-not-approved");
  if (manifest?.environment?.runner !== V73_VISUAL_GOLDEN_RUNNER) failures.push("manifest-runner");
  if (manifest?.environment?.project !== V73_VISUAL_GOLDEN_PROJECT) failures.push("manifest-project");
  if (manifest?.environment?.platform !== V73_VISUAL_GOLDEN_PLATFORM) failures.push("manifest-platform");
  if (manifest?.environment?.workers !== 1) failures.push("manifest-workers");
  if (!sha256Pattern.test(manifest?.reviewEvidenceDigest ?? "")) failures.push("manifest-review-evidence-digest");

  const manifestCases = Array.isArray(manifest?.cases) ? manifest.cases : [];
  const manifestIds = manifestCases.map((entry) => entry?.id);
  const expectedIds = expectedCases.map((entry) => entry.id);
  if (manifestIds.length !== expectedIds.length
    || new Set(manifestIds).size !== manifestIds.length
    || manifestIds.some((id, index) => id !== expectedIds[index])) {
    failures.push("manifest-case-inventory");
  }

  const evidenceByPath = new Map(baselineEvidence.map((entry) => [entry.path, entry]));
  const expectedPaths = expectedCases.map((entry) => entry.baselinePath);
  const observedPaths = baselineEvidence.map((entry) => entry.path).sort();
  if (observedPaths.length !== expectedPaths.length
    || new Set(observedPaths).size !== observedPaths.length
    || observedPaths.some((value, index) => value !== [...expectedPaths].sort()[index])) {
    failures.push("baseline-file-inventory");
  }

  for (let index = 0; index < expectedCases.length; index += 1) {
    const expected = expectedCases[index];
    const entry = manifestCases[index];
    if (!entry || entry.id !== expected.id) continue;
    if (entry.viewport?.width !== expected.viewport.width || entry.viewport?.height !== expected.viewport.height) {
      failures.push(`case-viewport:${expected.id}`);
    }
    if (entry.baselinePath !== expected.baselinePath) failures.push(`case-baseline-path:${expected.id}`);
    if (entry.verdict !== "approved_visual_parity") failures.push(`case-verdict:${expected.id}`);
    if (!sha256Pattern.test(entry.iabEvidenceSha256 ?? "")) failures.push(`case-iab-sha256:${expected.id}`);
    if (!sha256Pattern.test(entry.baselineSha256 ?? "")) failures.push(`case-baseline-sha256:${expected.id}`);
    const evidence = evidenceByPath.get(expected.baselinePath);
    if (!evidence) {
      failures.push(`case-baseline-missing:${expected.id}`);
      continue;
    }
    if (!evidence.pngMagic) failures.push(`case-baseline-not-png:${expected.id}`);
    if (evidence.bytes <= 8) failures.push(`case-baseline-empty:${expected.id}`);
    if (entry.baselineSha256 !== evidence.sha256) failures.push(`case-baseline-hash:${expected.id}`);
  }

  return { pass: failures.length === 0, failures };
}
