import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditKnowledgeArtifacts,
  validateKnowledgeIndex,
  validatePublicationV3,
} from "./lib/knowledge-pack-contract.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gate1Slice = process.env.ATLAS_GATE1_SLICE === "true";
const distDir = path.resolve(process.env.ATLAS_PUBLIC_OUTPUT_DIR ?? path.join(projectDir, "dist-public"));
const auditPath = path.resolve(
  process.env.ATLAS_PUBLIC_AUDIT_RECEIPT
    ?? path.join(projectDir, "artifacts", "v7.9-publication-audit.json"),
);
const outputPath = path.resolve(
  process.env.ATLAS_LOCAL_QA_RECEIPT
    ?? path.join(projectDir, "artifacts", "local-qa", "local-qa.json"),
);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

if (gate1Slice && path.basename(distDir) !== "dist-gate1") {
  throw new Error("Gate 1 non-release local QA may only inspect dist-gate1.");
}

const [
  buildBody,
  assetsBody,
  graphBody,
  meaningBody,
  knowledgeBody,
  publicationBody,
  auditBody,
] = await Promise.all([
  readFile(path.join(distDir, "build-receipt.json")),
  readFile(path.join(distDir, "asset-manifest.json")),
  readFile(path.join(distDir, "data", "graph.json")),
  readFile(path.join(distDir, "data", "meaning.json")),
  readFile(path.join(distDir, "data", "knowledge.json")),
  readFile(path.join(distDir, "data", "publication.json")),
  readFile(auditPath),
]);
const build = JSON.parse(buildBody.toString("utf8"));
const assets = JSON.parse(assetsBody.toString("utf8"));
const graph = JSON.parse(graphBody.toString("utf8"));
const meaning = JSON.parse(meaningBody.toString("utf8"));
const knowledge = JSON.parse(knowledgeBody.toString("utf8"));
const publication = JSON.parse(publicationBody.toString("utf8"));
const audit = JSON.parse(auditBody.toString("utf8"));
const findings = [];

if (build.schema !== "atlas.public_build.v3"
  || build.profile !== "public"
  || build.gate1Slice !== gate1Slice) {
  findings.push("public build receipt is missing or malformed");
}
if (assets.schema !== "atlas.public_assets.v3" || assets.profile !== "public") {
  findings.push("public asset manifest is missing or malformed");
}
if (graph.schema !== "atlas.graph.v2"
  || graph.manifest?.nodeCount !== graph.nodes?.length
  || graph.manifest?.edgeCount !== graph.edges?.length) {
  findings.push("graph v2 manifest does not reconcile");
}
if (publication.publicSnapshotDigest !== build.publicSnapshotDigest
  || publication.publicSnapshotDigest !== assets.publicSnapshotDigest) {
  findings.push("public snapshot digest is not bound across build assets and publication");
}
const expectedAuditVerdict = gate1Slice ? "pass_gate1_nonrelease" : "pass";
if (audit.schema !== "atlas.publication_audit.v3"
  || audit.verdict !== expectedAuditVerdict
  || audit.findings?.length) {
  findings.push("publication audit is not clean");
}
findings.push(...validateKnowledgeIndex(knowledge, graph, { gate1: gate1Slice })
  .map((finding) => `knowledge index ${finding}`));
findings.push(...validatePublicationV3(publication, {
  agency: {},
  graph,
  inventory: {},
  meaning,
  knowledge,
}, { gate1: gate1Slice }).map((finding) => `publication v3 ${finding}`));
const knowledgeAudit = await auditKnowledgeArtifacts(path.join(distDir, "data"), knowledge, { graph });
findings.push(...knowledgeAudit.findings.map((finding) => `${finding.id}:${finding.path}`));
if (build.stylesheet?.bytes > 48 * 1024) findings.push("CSS hard gate exceeded");
if (build.javascript?.gzipBytes > 180 * 1024) findings.push("shell JavaScript hard gate exceeded");
if (build.semanticSpace?.gzipBytes > 240 * 1024) findings.push("semantic-space hard gate exceeded");
if (build.initialRawBytes > 3 * 1024 * 1024) findings.push("initial transfer hard gate exceeded");
if (assets.unhashedJavaScriptOrCss?.length) findings.push("unhashed runtime assets found");
if (assets.knowledge?.initialBodies !== 0
  || build.knowledge?.initialBodies !== 0
  || knowledgeAudit.shardPairs.length !== knowledge.manifest.dossierCount
  || knowledgeAudit.searchPairs.length !== 1) {
  findings.push("lazy knowledge artifact boundary is malformed");
}
const indexHtml = await readFile(path.join(distDir, "index.html"), "utf8");
if (/knowledge-shards\/|search\.[a-f0-9]{16,64}\.js/.test(indexHtml)) {
  findings.push("initial HTML eagerly loads dossier or Reader bodies");
}

const receipt = {
  schema: "atlas.local_qa.v3",
  activityId: "REL-ATLAS-V7-9-20260729-01",
  completedAt: new Date().toISOString(),
  profile: "public",
  gate1Slice,
  releaseEligible: knowledge.releaseEligible,
  verdict: findings.length
    ? "fail"
    : gate1Slice
      ? "pass_gate1_nonrelease"
      : "pass",
  findings,
  publicSnapshotDigest: publication.publicSnapshotDigest,
  graph: {
    nodes: graph.manifest.nodeCount,
    directedEdges: graph.manifest.edgeCount,
    domains: graph.manifest.domainCount,
    projectionDigest: graph.manifest.projectionDigest,
  },
  knowledge: {
    dossiers: knowledge.manifest.dossierCount,
    documents: knowledge.manifest.documentCount,
    claims: knowledge.manifest.claimCount,
    evidence: knowledge.manifest.evidenceCount,
    relationExplanations: knowledge.manifest.relationExplanationCount,
    shards: knowledgeAudit.shardPairs.length,
    searchIndexes: knowledgeAudit.searchPairs.length,
    initialBodies: 0,
  },
  budgets: {
    cssBytes: build.stylesheet.bytes,
    shellGzipBytes: build.javascript.gzipBytes,
    semanticSpaceGzipBytes: build.semanticSpace.gzipBytes,
    initialRawBytes: build.initialRawBytes,
  },
  evidenceHashes: {
    buildReceipt: sha256(buildBody),
    assetManifest: sha256(assetsBody),
    graph: sha256(graphBody),
    knowledge: sha256(knowledgeBody),
    publication: sha256(publicationBody),
    publicationAudit: sha256(auditBody),
  },
  browserBoundary: "Browser interaction and visual evidence are verified separately; this receipt does not claim visual QA.",
  executionBoundary: "One static pass only; no browser matrix, GitHub, Pages, tag, or Release mutation.",
  residualRisks: gate1Slice
    ? ["knowledge-workbench chunk split pending Gate 2"]
    : [],
  changedSurfaces: [],
};
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`);
if (findings.length) throw new Error(`Local static QA failed: ${findings.join("; ")}`);
console.log(JSON.stringify({ receiptPath: outputPath, ...receipt }, null, 2));
