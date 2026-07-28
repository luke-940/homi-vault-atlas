import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.resolve(process.env.ATLAS_PUBLIC_OUTPUT_DIR ?? path.join(projectDir, "dist-public"));
const auditPath = path.resolve(
  process.env.ATLAS_PUBLIC_AUDIT_RECEIPT
    ?? path.join(projectDir, "artifacts", "v7.8-publication-audit.json"),
);
const outputPath = path.resolve(
  process.env.ATLAS_LOCAL_QA_RECEIPT
    ?? path.join(projectDir, "artifacts", "local-qa", "local-qa.json"),
);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const [buildBody, assetsBody, graphBody, publicationBody, auditBody] = await Promise.all([
  readFile(path.join(distDir, "build-receipt.json")),
  readFile(path.join(distDir, "asset-manifest.json")),
  readFile(path.join(distDir, "data", "graph.json")),
  readFile(path.join(distDir, "data", "publication.json")),
  readFile(auditPath),
]);
const build = JSON.parse(buildBody.toString("utf8"));
const assets = JSON.parse(assetsBody.toString("utf8"));
const graph = JSON.parse(graphBody.toString("utf8"));
const publication = JSON.parse(publicationBody.toString("utf8"));
const audit = JSON.parse(auditBody.toString("utf8"));
const findings = [];

if (build.schema !== "atlas.public_build.v2" || build.profile !== "public") {
  findings.push("public build receipt is missing or malformed");
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
if (audit.verdict !== "pass" || audit.findings?.length) {
  findings.push("publication audit is not clean");
}
if (build.stylesheet?.bytes > 48 * 1024) findings.push("CSS hard gate exceeded");
if (build.javascript?.gzipBytes > 180 * 1024) findings.push("shell JavaScript hard gate exceeded");
if (build.semanticSpace?.gzipBytes > 240 * 1024) findings.push("semantic-space hard gate exceeded");
if (build.initialRawBytes > 3 * 1024 * 1024) findings.push("initial transfer hard gate exceeded");
if (assets.unhashedJavaScriptOrCss?.length) findings.push("unhashed runtime assets found");

const receipt = {
  schema: "atlas.local_qa.v2",
  activityId: "REL-ATLAS-V7-8-20260728-01",
  completedAt: new Date().toISOString(),
  profile: "public",
  verdict: findings.length ? "fail" : "pass",
  findings,
  publicSnapshotDigest: publication.publicSnapshotDigest,
  graph: {
    nodes: graph.manifest.nodeCount,
    directedEdges: graph.manifest.edgeCount,
    domains: graph.manifest.domainCount,
    projectionDigest: graph.manifest.projectionDigest,
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
    publication: sha256(publicationBody),
    publicationAudit: sha256(auditBody),
  },
  browserBoundary: "Browser interaction and visual evidence are verified separately; this receipt does not claim visual QA.",
  changedSurfaces: [],
};
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`);
if (findings.length) throw new Error(`Local static QA failed: ${findings.join("; ")}`);
console.log(JSON.stringify({ receiptPath: outputPath, ...receipt }, null, 2));
