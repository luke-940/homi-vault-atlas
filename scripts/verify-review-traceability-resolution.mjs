import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const builderRoot = path.resolve(projectDir, "../..");
const outputsRoot = path.join(builderRoot, "outputs");
const outputCandidates = [];
for (const entry of await readdir(outputsRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const candidate = path.join(outputsRoot, entry.name);
  try {
    const baseline = JSON.parse(await readFile(path.join(candidate, "review", "review-baseline.json"), "utf8"));
    if (baseline.schema === "homi.atlas.review_baseline.v1" && baseline.handling?.github_inclusion_allowed === false) {
      outputCandidates.push(candidate);
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}
if (outputCandidates.length !== 1) throw new Error("Expected exactly one local-only v7.4 review baseline output");
const outputDir = outputCandidates[0];
const activityId = path.basename(outputDir);
const reviewDir = path.join(outputDir, "review");
const sourcePath = path.join(reviewDir, "source", "homi-vault-atlas-v7.3-통합전달본-Sol.md");
const originalPath = path.join(reviewDir, "review-traceability.json");
const resolutionPath = path.join(reviewDir, "review-traceability-resolution.json");
const receiptPath = path.join(reviewDir, "review-traceability-coverage-receipt.json");
const reviewBaseline = JSON.parse(await readFile(path.join(reviewDir, "review-baseline.json"), "utf8"));
const expectedReviewSha = reviewBaseline.source.sha256;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function binding(filePath) {
  const [bytes, metadata] = await Promise.all([readFile(filePath), stat(filePath)]);
  if (!metadata.isFile()) throw new Error(`Expected file binding: ${filePath}`);
  return { path: filePath, bytes: bytes.byteLength, sha256: sha256(bytes) };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function unique(values) {
  return new Set(values).size === values.length;
}

function exactSet(actual, expected, label) {
  assert(actual.length === expected.length, `${label} count mismatch`);
  const expectedSet = new Set(expected);
  assert(unique(actual), `${label} contains duplicate IDs`);
  assert(actual.every((value) => expectedSet.has(value)), `${label} contains a missing or unexpected ID`);
}

function collectUnresolvedTokens(value, location = "root", findings = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectUnresolvedTokens(entry, `${location}[${index}]`, findings));
    return findings;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (key === "test_placeholder" || key === "evidence_placeholder") findings.push(`${location}.${key}`);
      collectUnresolvedTokens(entry, `${location}.${key}`, findings);
    }
    return findings;
  }
  if (typeof value === "string" && /^(TEST|EVIDENCE)-[A-Z0-9-]+$/.test(value)) findings.push(location);
  return findings;
}

async function verifyBoundFiles(entries, label) {
  let count = 0;
  for (const entry of entries) {
    for (const field of ["implementation", "tests", "evidence"]) {
      assert(Array.isArray(entry[field]) && entry[field].length > 0, `${label} ${entry.id} has no ${field} bindings`);
      for (const expected of entry[field]) {
        const actual = await binding(expected.path);
        assert(actual.bytes === expected.bytes, `${label} ${entry.id} byte mismatch: ${expected.path}`);
        assert(actual.sha256 === expected.sha256, `${label} ${entry.id} hash mismatch: ${expected.path}`);
        count += 1;
      }
    }
  }
  return count;
}

const [sourceBytes, originalBytes, resolutionBytes] = await Promise.all([
  readFile(sourcePath),
  readFile(originalPath),
  readFile(resolutionPath),
]);
assert(sha256(sourceBytes) === expectedReviewSha, "Immutable review SHA mismatch");
const sourceLines = sourceBytes.toString("utf8").split(/\r?\n/);
if (sourceLines.at(-1) === "") sourceLines.pop();
const nonblankLines = sourceLines
  .map((line, index) => ({ line, number: index + 1 }))
  .filter(({ line }) => line.trim().length > 0)
  .map(({ number }) => number);
assert(sourceLines.length === 720, "Review line count mismatch");
assert(nonblankLines.length === 515, "Review nonblank line count mismatch");

const original = JSON.parse(originalBytes.toString("utf8"));
const resolution = JSON.parse(resolutionBytes.toString("utf8"));
assert(resolution.schema === "homi.atlas.review_traceability_resolution.v1", "Unexpected resolution schema");
assert(resolution.source.review.sha256 === expectedReviewSha, "Resolution review binding mismatch");
assert(resolution.source.original_traceability.sha256 === sha256(originalBytes), "Original traceability binding mismatch");
assert(resolution.line_coverage.ranges.length === 16, "Resolved range count mismatch");
assert(resolution.findings.length === 62, "Resolved finding count mismatch");
assert(Array.isArray(resolution.release_blocker_corrections)
  && resolution.release_blocker_corrections.length === 1,
"Expected one independently discovered release-blocker correction");

const originalRangeIds = original.line_coverage.ranges.map(({ id }) => id);
const originalFindingIds = original.findings.map(({ id }) => id);
exactSet(resolution.line_coverage.ranges.map(({ id }) => id), originalRangeIds, "range IDs");
exactSet(resolution.findings.map(({ id }) => id), originalFindingIds, "finding IDs");

const covered = new Map();
for (const range of resolution.line_coverage.ranges) {
  const [start, end] = range.source_lines;
  assert(Number.isInteger(start) && Number.isInteger(end) && start <= end, `Invalid line range ${range.id}`);
  for (let line = start; line <= end; line += 1) {
    covered.set(line, (covered.get(line) ?? 0) + 1);
  }
}
assert(sourceLines.every((_, index) => covered.get(index + 1) === 1), "Source ranges must cover every line exactly once");
assert(nonblankLines.every((line) => covered.get(line) === 1), "A nonblank source line is uncovered");

const unresolved = collectUnresolvedTokens(resolution);
assert(unresolved.length === 0, `Unresolved binding tokens remain: ${unresolved.join(", ")}`);
assert(resolution.coverage_summary.silent_drops === 0, "Resolution reports silent drops");
assert(resolution.coverage_summary.unresolved_binding_tokens === 0, "Resolution reports unresolved binding tokens");

const rangeBindingCount = await verifyBoundFiles(resolution.line_coverage.ranges, "range");
const findingBindingCount = await verifyBoundFiles(resolution.findings, "finding");
const blockerBindingCount = await verifyBoundFiles(resolution.release_blocker_corrections, "release blocker");
const sourceFindingIdSet = new Set(originalFindingIds);
for (const correction of resolution.release_blocker_corrections) {
  assert(correction.mapped_source_findings.every((id) => sourceFindingIdSet.has(id)),
    `Release blocker ${correction.id} maps an unknown source finding`);
}
for (const gate of resolution.pending_gates) {
  assert(gate.state === "pending_gate", `Traceability must not infer PASS for gate ${gate.id}`);
  assert(path.isAbsolute(gate.expected_path), `Gate path must be absolute: ${gate.id}`);
  if (gate.current_binding) {
    const actual = await binding(gate.expected_path);
    assert(actual.bytes === gate.current_binding.bytes, `Gate evidence byte mismatch: ${gate.id}`);
    assert(actual.sha256 === gate.current_binding.sha256, `Gate evidence hash mismatch: ${gate.id}`);
  }
}
const gate3 = resolution.pending_gates.find(({ id }) => id === "luke_gate3_visual_approval");
assert(gate3?.state === "pending_gate", "Luke Gate 3 must remain explicitly pending");

const receipt = {
  schema: "homi.atlas.review_traceability_coverage_receipt.v1",
  activity_id: activityId,
  validated_at: new Date().toISOString(),
  verdict: "pass",
  release_readiness: "pending_gate",
  source: await binding(sourcePath),
  original_traceability: await binding(originalPath),
  resolution: await binding(resolutionPath),
  coverage: {
    source_lines: sourceLines.length,
    nonblank_lines: nonblankLines.length,
    source_ranges: resolution.line_coverage.ranges.length,
    normalized_findings: resolution.findings.length,
    release_blocker_corrections: resolution.release_blocker_corrections.length,
    silent_drops: 0,
    unresolved_binding_tokens: 0,
    duplicate_ids: 0,
    bound_file_references_verified: rangeBindingCount + findingBindingCount + blockerBindingCount,
    binding_mismatches: 0,
  },
  pending_gates: resolution.pending_gates.map(({ id, expected_path, state }) => ({ id, expected_path, state })),
  stop_boundary: "This receipt validates review coverage and file bindings only; it does not approve visual QA, Luke Gate 3, publication, production, tag, or Release.",
};

await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ receipt: await binding(receiptPath), resolution: await binding(resolutionPath) }, null, 2)}\n`);
