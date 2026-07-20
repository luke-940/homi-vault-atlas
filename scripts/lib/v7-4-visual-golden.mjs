import { createHash } from "node:crypto";
import path from "node:path";

export const V74_VISUAL_GOLDEN_SCHEMA = "homi.atlas_v7_4.visual_golden_manifest.v1";
export const V74_VISUAL_GOLDEN_APPROVED_STATUS = "approved_iab_and_ubuntu_parity";
export const V74_VISUAL_GOLDEN_PENDING_STATUS = "incomplete_pending_iab_and_ubuntu_review";
export const V74_VISUAL_GOLDEN_RUNNER = "ubuntu-24.04";
export const V74_VISUAL_GOLDEN_PROJECT = "chromium";
export const V74_VISUAL_GOLDEN_PLATFORM = "linux";
export const V74_VISUAL_GOLDEN_SPEC = "v7-4-golden.spec.mjs";
export const V74_INDEPENDENT_VISUAL_QA_SCHEMA = "homi.atlas_v7_4.independent_visual_qa_receipt.v1";
export const V74_INDEPENDENT_VISUAL_QA_APPROVED_STATUS = "approved_independent_visual_qa";
export const V74_INDEPENDENT_VISUAL_QA_RECEIPT_PATH = "tests-visual/independent-visual-qa-receipt.json";
export const V74_INDEPENDENT_VISUAL_QA_SCHEMA_PATH = "tests-visual/independent-visual-qa-receipt.v1.schema.json";
export const V74_INDEPENDENT_VISUAL_QA_EVIDENCE_ROOT = "tests-visual/independent-evidence";
export const V74_VISUAL_GOLDEN_ROUTE_IDS = Object.freeze([
  "home-default",
  "home-selected",
  "home-activity",
  "home-coverage",
  "agency-default",
  "agency-actor",
  "agency-evolution",
  "explore",
  "explore-hubs",
  "explore-sources",
  "observe",
  "observe-hub",
  "flow",
  "time",
  "search-overlay",
  "data-overlay",
]);

const sha256Pattern = /^[a-f0-9]{64}$/;
const pngSignatureHex = "89504e470d0a1a0a";
const receiptTopLevelKeys = [
  "schema", "status", "releaseVersion", "reviewerSeparation", "scope", "cases", "completedAt",
];
const checklistKeys = [
  "labelNodeCollisions", "clippedLabels", "requiredTextUnder12Px", "horizontalOverflowPx",
  "mobileInteractiveUnder44Px", "visualParity", "accessibilityEncoding",
];

function posixPath(value) {
  return String(value).replaceAll(path.sep, "/");
}

export function visualGoldenBaselinePath(route) {
  const name = `${route.id}-${route.viewport.width}x${route.viewport.height}`;
  return posixPath(path.join(
    "tests-visual",
    "__screenshots__",
    V74_VISUAL_GOLDEN_SPEC,
    `${name}-${V74_VISUAL_GOLDEN_PROJECT}-${V74_VISUAL_GOLDEN_PLATFORM}.png`,
  ));
}

export function independentVisualQaEvidencePath(route) {
  return posixPath(path.join(
    V74_INDEPENDENT_VISUAL_QA_EVIDENCE_ROOT,
    `${route.id}-${route.viewport.width}x${route.viewport.height}-iab.png`,
  ));
}

export function resolveVisualGoldenCases(routeCases) {
  const byId = new Map(routeCases.map((route) => [route.id, route]));
  const missing = V74_VISUAL_GOLDEN_ROUTE_IDS.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    throw new Error(`Visual golden route contract drift: missing ${missing.join(", ")}`);
  }
  return Object.freeze(V74_VISUAL_GOLDEN_ROUTE_IDS.map((id) => {
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

function sha256(body) {
  return createHash("sha256").update(body).digest("hex");
}

function hasExactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === [...expected].sort()[index]);
}

export function validateIndependentVisualQaReceipt({ receiptBody, expectedCases, reviewEvidence }) {
  const failures = [];
  if (!Buffer.isBuffer(receiptBody) || receiptBody.length === 0) {
    return { pass: false, failures: ["independent-receipt-bytes-missing"], receipt: null, receiptSha256: null };
  }
  let receipt;
  try {
    receipt = JSON.parse(receiptBody.toString("utf8"));
  } catch {
    return { pass: false, failures: ["independent-receipt-json-invalid"], receipt: null, receiptSha256: sha256(receiptBody) };
  }
  const receiptSha256 = sha256(receiptBody);
  if (!hasExactKeys(receipt, receiptTopLevelKeys)) failures.push("independent-receipt-top-level-fields");
  if (receipt.schema !== V74_INDEPENDENT_VISUAL_QA_SCHEMA) failures.push("independent-receipt-schema");
  if (receipt.status !== V74_INDEPENDENT_VISUAL_QA_APPROVED_STATUS) failures.push("independent-receipt-not-approved");
  if (receipt.releaseVersion !== "7.4.0") failures.push("independent-receipt-release-version");

  const separation = receipt.reviewerSeparation;
  if (!hasExactKeys(separation, ["identityMode", "implementer", "reviewer", "differentRole", "differentSession"])) {
    failures.push("independent-reviewer-separation-fields");
  }
  if (!hasExactKeys(separation?.implementer, ["role", "sessionFingerprint"])
    || !hasExactKeys(separation?.reviewer, ["role", "sessionFingerprint"])
    || separation?.identityMode !== "domain_separated_sha256_fingerprint"
    || separation?.implementer?.role !== "atlas_builder"
    || separation?.reviewer?.role !== "independent_visual_qa"
    || !sha256Pattern.test(separation?.implementer?.sessionFingerprint ?? "")
    || !sha256Pattern.test(separation?.reviewer?.sessionFingerprint ?? "")
    || separation?.implementer?.sessionFingerprint === separation?.reviewer?.sessionFingerprint
    || separation?.differentRole !== true
    || separation?.differentSession !== true) {
    failures.push("independent-reviewer-session-not-separated");
  }

  if (!hasExactKeys(receipt.scope, ["profile", "surface", "caseCount", "geometryChecklistRequired", "ubuntuBaselineComparisonRequired"])
    || receipt.scope?.profile !== "atlas-public"
    || receipt.scope?.surface !== "in_app_browser"
    || receipt.scope?.caseCount !== expectedCases.length
    || receipt.scope?.geometryChecklistRequired !== true
    || receipt.scope?.ubuntuBaselineComparisonRequired !== true) {
    failures.push("independent-review-scope");
  }
  if (!Number.isFinite(Date.parse(receipt.completedAt ?? ""))) failures.push("independent-review-completed-at");

  const cases = Array.isArray(receipt.cases) ? receipt.cases : [];
  if (cases.length !== expectedCases.length
    || new Set(cases.map((entry) => entry?.id)).size !== cases.length
    || cases.some((entry, index) => entry?.id !== expectedCases[index].id)) {
    failures.push("independent-review-case-inventory");
  }
  const evidenceByPath = new Map((reviewEvidence ?? []).map((entry) => [entry.path, entry]));
  const expectedEvidencePaths = expectedCases.map(independentVisualQaEvidencePath);
  const actualEvidencePaths = [...evidenceByPath.keys()].sort();
  if (actualEvidencePaths.length !== expectedEvidencePaths.length
    || actualEvidencePaths.some((entry, index) => entry !== [...expectedEvidencePaths].sort()[index])) {
    failures.push("independent-review-evidence-inventory");
  }

  for (let index = 0; index < expectedCases.length; index += 1) {
    const expected = expectedCases[index];
    const entry = cases[index];
    if (!entry || entry.id !== expected.id) continue;
    const expectedPath = independentVisualQaEvidencePath(expected);
    if (!hasExactKeys(entry, ["id", "viewport", "evidence", "checks", "verdict"])) failures.push(`independent-case-fields:${expected.id}`);
    if (!hasExactKeys(entry.viewport, ["width", "height"])
      || entry.viewport?.width !== expected.viewport.width || entry.viewport?.height !== expected.viewport.height) {
      failures.push(`independent-case-viewport:${expected.id}`);
    }
    if (!hasExactKeys(entry.evidence, ["path", "bytes", "sha256"])
      || entry.evidence?.path !== expectedPath || !sha256Pattern.test(entry.evidence?.sha256 ?? "")) {
      failures.push(`independent-case-evidence-binding:${expected.id}`);
    }
    if (!hasExactKeys(entry.checks, checklistKeys)
      || entry.checks.labelNodeCollisions !== 0
      || entry.checks.clippedLabels !== 0
      || entry.checks.requiredTextUnder12Px !== 0
      || entry.checks.horizontalOverflowPx !== 0
      || entry.checks.mobileInteractiveUnder44Px !== 0
      || entry.checks.visualParity !== "pass"
      || entry.checks.accessibilityEncoding !== "pass") {
      failures.push(`independent-case-checklist:${expected.id}`);
    }
    if (entry.verdict !== "approved_independent_visual_qa") failures.push(`independent-case-verdict:${expected.id}`);
    const evidence = evidenceByPath.get(expectedPath);
    if (!evidence) {
      failures.push(`independent-case-evidence-missing:${expected.id}`);
      continue;
    }
    if (!evidence.pngMagic || evidence.bytes <= 8) failures.push(`independent-case-evidence-not-png:${expected.id}`);
    if (entry.evidence?.bytes !== evidence.bytes || entry.evidence?.sha256 !== evidence.sha256) {
      failures.push(`independent-case-evidence-hash:${expected.id}`);
    }
  }
  return { pass: failures.length === 0, failures, receipt, receiptSha256 };
}

export function validateVisualGoldenManifest({ manifest, expectedCases, baselineEvidence, independentReview }) {
  const failures = [];
  if (manifest?.schema !== V74_VISUAL_GOLDEN_SCHEMA) failures.push("manifest-schema");
  if (manifest?.status !== V74_VISUAL_GOLDEN_APPROVED_STATUS) failures.push("manifest-not-approved");
  if (manifest?.environment?.runner !== V74_VISUAL_GOLDEN_RUNNER) failures.push("manifest-runner");
  if (manifest?.environment?.project !== V74_VISUAL_GOLDEN_PROJECT) failures.push("manifest-project");
  if (manifest?.environment?.platform !== V74_VISUAL_GOLDEN_PLATFORM) failures.push("manifest-platform");
  if (manifest?.environment?.workers !== 1) failures.push("manifest-workers");
  if (manifest?.reviewEvidencePath !== V74_INDEPENDENT_VISUAL_QA_RECEIPT_PATH) failures.push("manifest-review-evidence-path");
  const independentResult = validateIndependentVisualQaReceipt({
    receiptBody: independentReview?.receiptBody,
    expectedCases,
    reviewEvidence: independentReview?.evidence ?? [],
  });
  if (!independentResult.pass) failures.push(...independentResult.failures);
  if (!sha256Pattern.test(manifest?.reviewEvidenceDigest ?? "")
    || manifest.reviewEvidenceDigest !== independentResult.receiptSha256) {
    failures.push("manifest-review-evidence-digest");
  }

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
    const reviewCase = independentResult.receipt?.cases?.[index];
    if (entry.iabEvidenceSha256 !== reviewCase?.evidence?.sha256) failures.push(`case-iab-receipt-hash:${expected.id}`);
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
