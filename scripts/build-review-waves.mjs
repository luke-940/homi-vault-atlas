import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createKnowledgeReviewSeed,
} from "./lib/knowledge-publication.mjs";
import {
  parseFrontmatterScalarMap,
  privacySafeDigestToken,
} from "./lib/profile-contract.mjs";
import { scanOperatingExposure, scanPrivacyText } from "./lib/privacy-scanner.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const builderRoot = path.resolve(projectDir, "../..");
const activityId = "REL-ATLAS-V7-9-20260729-01";
const capturePath = path.resolve(process.env.ATLAS_CAPTURE_MANIFEST
  ?? path.join(builderRoot, "outputs", activityId, "gate-2", "canonical-capture-rc1", "canonical-capture-manifest.json"));
const graphPath = path.resolve(process.env.ATLAS_PUBLIC_GRAPH
  ?? path.join(projectDir, ".generated", "gate2-profiles", "public", "data", "graph.json"));
const policyPath = path.join(projectDir, "public-safe", "atlas-publication-policy.v3.json");
const existingReviewsPath = path.join(projectDir, "public-safe", "reviewed-dossiers.v1.json");
const candidatePath = path.resolve(process.env.ATLAS_REVIEW_CANDIDATE
  ?? path.join(projectDir, "public-safe", "reviewed-dossiers.gate2-candidate.v1.json"));
const promote = process.argv.includes("--promote");
const evidenceRoot = path.resolve(process.env.ATLAS_GATE_OUTPUT
  ?? path.join(builderRoot, "outputs", activityId, "gate-2"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const compareText = (left, right) => String(left).localeCompare(String(right), "en");

function qualityFlags(record) {
  const title = String(record.title ?? "");
  const summary = String(record.summary ?? "");
  const flags = [];
  if (summary.length < 72) flags.push("summary_too_short");
  if (summary.length > 900) flags.push("summary_too_long");
  if (!/[가-힣]/.test(summary)) flags.push("no_korean_reader_context");
  if (/^(?:Candidate Source|Source |Class Examples|Layer Current|Relation From|Edit only\b)/i.test(summary)
    || (summary.match(/\b(?:index-only|watch)\b/gi)?.length ?? 0) >= 4) {
    flags.push("catalog_or_metadata_first");
  }
  if (/\b(?:current state|resume|receipt|work order|handoff|closeout|release|gate|qa|validation)\b/i.test(summary)) {
    flags.push("operational_language_review");
  }
  if (/^(?:P\d+-[A-Z]-\d|prompt\b)/i.test(title)
    || /(?:prompt|revision)$/i.test(title)
    || /^Edit only\b/i.test(summary)) {
    flags.push("prompt_or_production_artifact");
  }
  if ((record.safeCandidateCount ?? 0) <= 2) flags.push("thin_safe_evidence");
  return flags;
}

const [captureBody, graphBody, policyBody, existingReviewsBody] = await Promise.all([
  readFile(capturePath),
  readFile(graphPath),
  readFile(policyPath),
  readFile(existingReviewsPath),
]);
const capture = JSON.parse(captureBody.toString("utf8"));
const graph = JSON.parse(graphBody.toString("utf8"));
const policy = JSON.parse(policyBody.toString("utf8"));
const existingReviews = JSON.parse(existingReviewsBody.toString("utf8"));
if (capture?.schema !== "atlas.canonical_capture.v1" || capture.pass !== true || capture.tornRead !== false) {
  throw new Error("Review wave build blocked: capture is missing or torn.");
}
if (graph?.schema !== "atlas.graph.v2" || graph.profile !== "atlas-public") {
  throw new Error("Review wave build blocked: public graph v2 is missing.");
}

const graphNodes = new Map(graph.nodes.map((node) => {
  const id = graph.strings[node[0]];
  return [id, {
    id,
    title: graph.strings[node[1]],
    kind: graph.kinds[node[2]],
    domain: graph.strings[graph.domains[node[3]][1]],
  }];
}));
const existingByNodeId = new Map(existingReviews.dossiers.map((review) => [review.nodeId, review]));
const sourceByNodeId = new Map();
for (const file of capture.vault.files) {
  const nodeId = `n:${privacySafeDigestToken(file.relativePath, 16)}`;
  if (!graphNodes.has(nodeId)) continue;
  const absolute = path.join(capture.sourceBoundary.vaultRoot, file.relativePath);
  const body = await readFile(absolute);
  if (body.length !== file.bytes || sha256(body) !== file.sha256) {
    throw new Error(`Review wave build blocked: source drift at ${file.relativePath}.`);
  }
  const markdown = body.toString("utf8");
  sourceByNodeId.set(nodeId, {
    nodeId,
    title: path.posix.basename(file.relativePath, ".md"),
    relativePath: file.relativePath,
    sourceSha256: file.sha256,
    frontmatter: parseFrontmatterScalarMap(markdown),
    markdown,
  });
}
if (sourceByNodeId.size !== graphNodes.size) {
  throw new Error(`Review wave build blocked: ${sourceByNodeId.size}/${graphNodes.size} graph sources resolved.`);
}

const reviews = [];
const audits = [];
for (const graphNode of [...graphNodes.values()].sort((left, right) => (
  compareText(left.domain, right.domain) || compareText(left.title, right.title) || compareText(left.id, right.id)
))) {
  const source = sourceByNodeId.get(graphNode.id);
  const seeded = createKnowledgeReviewSeed({
    nodeId: graphNode.id,
    title: graphNode.title,
    domain: graphNode.domain,
    kind: graphNode.kind,
    markdown: source.markdown,
    policy,
  });
  if (!seeded.review) {
    audits.push({
      ...seeded.audit,
      relativePath: source.relativePath,
      sourceSha256: source.sourceSha256,
    });
    continue;
  }
  const existing = existingByNodeId.get(graphNode.id);
  const manuallyAuthored = existing?.reviewMode === "atlas_builder_manual" ? existing : null;
  reviews.push(manuallyAuthored
    ? {
        ...manuallyAuthored,
        reviewMode: "atlas_builder_manual",
      }
    : seeded.review);
  audits.push({
    ...seeded.audit,
    relativePath: source.relativePath,
    sourceSha256: source.sourceSha256,
    reviewMode: manuallyAuthored?.reviewMode ?? seeded.review.reviewMode,
    qualityFlags: qualityFlags(seeded.audit),
  });
}

const missing = audits.filter((audit) => audit.status !== "review_seed_ready");
if (missing.length) {
  await mkdir(path.join(evidenceRoot, "review-waves"), { recursive: true });
  await writeFile(
    path.join(evidenceRoot, "review-waves", "blocked-no-safe-knowledge.json"),
    `${JSON.stringify(missing, null, 2)}\n`,
  );
  throw new Error(`Review wave build blocked: ${missing.length} graph nodes have no safe knowledge evidence.`);
}
if (reviews.length !== graphNodes.size) {
  throw new Error(`Review wave build blocked: ${reviews.length}/${graphNodes.size} reviews created.`);
}

const candidate = {
  schema: "atlas.reviewed_dossiers.v1",
  scope: "gate2_full_domain_review_candidate",
  releaseEligible: false,
  reviewedAt: capture.capturedAt,
  reviewer: "atlas-builder",
  capture: {
    vaultTreeDigest: capture.vault.treeDigest,
    graphProjectionDigest: graph.manifest.projectionDigest,
  },
  dossiers: reviews,
};
const candidateBody = `${JSON.stringify(candidate, null, 2)}\n`;
const reviewSafetyFindings = reviews.flatMap((review) => {
  const body = JSON.stringify(review);
  return [
    ...scanPrivacyText(body, { path: review.nodeId }),
    ...scanOperatingExposure(body, { path: review.nodeId }),
  ].map((finding) => ({
    ...finding,
    privateContext: body.slice(
      Math.max(0, finding.offset - 120),
      Math.min(body.length, finding.offset + 220),
    ),
  }));
});
const publicFindings = [
  ...scanPrivacyText(candidateBody, { path: "reviewed-dossiers.gate2-candidate.v1.json" }),
  ...scanOperatingExposure(candidateBody, { path: "reviewed-dossiers.gate2-candidate.v1.json" }),
];
if (publicFindings.length && process.env.ATLAS_STRICT_REVIEW_SOURCE_SAFETY === "true") {
  await mkdir(path.join(evidenceRoot, "review-waves"), { recursive: true });
  await writeFile(
    path.join(evidenceRoot, "review-waves", "blocked-candidate-public-findings.json"),
    `${JSON.stringify({
      candidateFindings: publicFindings.map((finding) => ({
        ...finding,
        privateContext: candidateBody.slice(
          Math.max(0, finding.offset - 120),
          Math.min(candidateBody.length, finding.offset + 220),
        ),
      })),
      reviewFindings: reviewSafetyFindings,
    }, null, 2)}\n`,
  );
  throw new Error(`Review wave build blocked: candidate has ${publicFindings.length} public-safety findings.`);
}
const promptOrProductionArtifactCount = audits.filter(
  (record) => record.qualityFlags.includes("prompt_or_production_artifact"),
).length;
if (promote && (publicFindings.length || promptOrProductionArtifactCount)) {
  throw new Error(
    `Review promotion blocked: ${publicFindings.length} safety findings and `
    + `${promptOrProductionArtifactCount} prompt/production artifacts remain.`,
  );
}

const waves = [
  { id: "01-moc", domains: ["MOC"] },
  { id: "02-papers", domains: ["Papers"] },
  { id: "03-signals-strategy", domains: ["Signals", "Strategy"] },
  { id: "04-rocket", domains: ["Rocket"] },
  { id: "05-groot", domains: ["Groot"] },
  { id: "06-intelligence-layer", domains: ["Intelligence Layer"] },
];
await mkdir(path.dirname(candidatePath), { recursive: true });
await mkdir(path.join(evidenceRoot, "review-waves"), { recursive: true });
await writeFile(candidatePath, candidateBody);
let promoted = null;
if (promote) {
  const releaseReview = {
    ...candidate,
    scope: "release_full_domain_review",
    releaseEligible: true,
    promotion: {
      sourceCandidateSha256: sha256(candidateBody),
      manuallyAuthored: audits.filter((record) => record.reviewMode === "atlas_builder_manual").length,
      evidenceExtractReviewed: audits.filter((record) => record.reviewMode !== "atlas_builder_manual").length,
      publicSafetyFindings: publicFindings.length,
      promptOrProductionArtifacts: promptOrProductionArtifactCount,
      sourceDrift: 0,
    },
  };
  const releaseReviewBody = `${JSON.stringify(releaseReview, null, 2)}\n`;
  await writeFile(existingReviewsPath, releaseReviewBody);
  promoted = {
    path: existingReviewsPath,
    sha256: sha256(releaseReviewBody),
    dossiers: reviews.length,
    releaseEligible: true,
  };
}
const waveReceipts = [];
for (const wave of waves) {
  const records = audits.filter((audit) => wave.domains.includes(audit.domain));
  const value = {
    schema: "atlas.domain_review_wave.v1",
    activityId,
    wave: wave.id,
    generatedAt: capture.capturedAt,
    domains: wave.domains,
    capture: {
      manifestSha256: sha256(captureBody),
      vaultTreeDigest: capture.vault.treeDigest,
      graphProjectionDigest: graph.manifest.projectionDigest,
    },
    counts: {
      sourceDocuments: records.length,
      reviewedDossiers: records.length,
      manuallyAuthored: records.filter((record) => record.reviewMode === "atlas_builder_manual").length,
      evidenceExtractReviewed: records.filter((record) => record.reviewMode !== "atlas_builder_manual").length,
      safeEvidenceCandidates: records.reduce((sum, record) => sum + record.safeCandidateCount, 0),
      qualityFlagged: records.filter((record) => record.qualityFlags.length).length,
      promptOrProductionArtifacts: records.filter(
        (record) => record.qualityFlags.includes("prompt_or_production_artifact"),
      ).length,
      catalogOrMetadataFirst: records.filter(
        (record) => record.qualityFlags.includes("catalog_or_metadata_first"),
      ).length,
      operationalLanguageReview: records.filter(
        (record) => record.qualityFlags.includes("operational_language_review"),
      ).length,
      excluded: 0,
      unclassified: 0,
    },
    records,
    verdict: promote ? "promoted_release_review" : "candidate_requires_builder_readback",
  };
  const body = `${JSON.stringify(value, null, 2)}\n`;
  const outputPath = path.join(evidenceRoot, "review-waves", `${wave.id}.json`);
  await writeFile(outputPath, body);
  waveReceipts.push({
    wave: wave.id,
    path: outputPath,
    sha256: sha256(body),
    documents: records.length,
  });
}
const index = {
  schema: "atlas.domain_review_index.v1",
  activityId,
  generatedAt: capture.capturedAt,
  candidate: {
    path: candidatePath,
    sha256: sha256(candidateBody),
    dossiers: reviews.length,
    releaseEligible: false,
  },
  ...(promoted ? { promoted } : {}),
  waves: waveReceipts,
  invariants: {
    graphNodeCount: graphNodes.size,
    dossierCount: reviews.length,
    sourceDrift: 0,
    reviewSourceSafetyFindings: publicFindings.length,
    publicArtifactSafetyPending: !promote,
    unclassifiedDocuments: 0,
  },
  verdict: promote ? "promoted_release_review" : "candidate_requires_builder_readback",
};
await writeFile(
  path.join(evidenceRoot, "review-waves", "index.json"),
  `${JSON.stringify(index, null, 2)}\n`,
);
console.log(JSON.stringify(index, null, 2));
