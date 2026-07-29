import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { auditPublicAgencyContract } from "./lib/agency-contract.mjs";
import { verifyAtlasGraphV2 } from "./lib/atlas-graph-v2.mjs";
import { auditPublicPackBinding } from "./lib/public-data-wire.mjs";
import { scanOperatingExposure, scanPrivacyText } from "./lib/privacy-scanner.mjs";
import { stableJson } from "./lib/data-model.mjs";
import {
  auditKnowledgeArtifacts,
  validateKnowledgeIndex,
  validatePublicationV3,
} from "./lib/knowledge-pack-contract.mjs";

const execFileAsync = promisify(execFile);
const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDataDir = path.resolve(
  process.env.ATLAS_PUBLIC_DATA_DIR ?? path.join(projectDir, "public-safe", "data"),
);
const distDir = path.resolve(
  process.env.ATLAS_PUBLIC_OUTPUT_DIR ?? path.join(projectDir, "dist-public"),
);
const receiptPath = path.resolve(
  process.env.ATLAS_PUBLIC_AUDIT_RECEIPT
    ?? path.join(projectDir, "artifacts", "v7.9-publication-audit.json"),
);
const ownerDataDir = path.resolve(
  process.env.ATLAS_OWNER_DATA_DIR
    ?? path.join(projectDir, ".generated", "profiles", "owner", "data"),
);
const gate1Slice = process.env.ATLAS_GATE1_SLICE === "true";
const reviewCandidate = process.env.ATLAS_REVIEW_CANDIDATE === "true";
const packNames = ["agency", "inventory", "graph", "meaning", "knowledge", "publication"];
const requiredDomains = ["MOC", "Papers", "Signals", "Rocket", "Groot", "Intelligence Layer"];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

if (gate1Slice && path.basename(distDir) !== "dist-gate1") {
  throw new Error("Gate 1 non-release audit may only inspect dist-gate1.");
}
if (reviewCandidate
  && (gate1Slice || path.basename(distDir) !== "dist-gate2")) {
  throw new Error("Gate 2 review audit may only inspect dist-gate2.");
}

async function filesUnder(root, current = root) {
  const rows = [];
  for (const entry of (await readdir(current, { withFileTypes: true }))
    .sort((left, right) => left.name.localeCompare(right.name, "en"))) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) rows.push(...await filesUnder(root, absolute));
    else if (entry.isFile()) {
      const body = await readFile(absolute);
      rows.push({
        absolute,
        path: path.relative(root, absolute).replaceAll("\\", "/"),
        bytes: body.length,
        sha256: sha256(body),
      });
    }
  }
  return rows;
}

function finding(id, target, extra = {}) {
  return { id, path: target, ...extra };
}

const findings = [];
const packs = {};
const bindings = [];
for (const name of packNames) {
  const jsonText = await readFile(path.join(sourceDataDir, `${name}.json`), "utf8");
  const jsText = await readFile(path.join(sourceDataDir, `${name}.js`), "utf8");
  const distJson = await readFile(path.join(distDir, "data", `${name}.json`), "utf8");
  const distJs = await readFile(path.join(distDir, "data", `${name}.js`), "utf8");
  packs[name] = JSON.parse(jsonText);
  const binding = auditPublicPackBinding({ name, jsonText, jsText });
  const distBinding = auditPublicPackBinding({ name, jsonText: distJson, jsText: distJs });
  const exactSourceDist = jsonText === distJson && jsText === distJs;
  bindings.push({
    name,
    jsonSha256: binding.jsonSha256,
    javascriptSha256: binding.jsSha256,
    exactJsonBytesEmbedded: binding.exactJsonBytesEmbedded,
    deepEqual: binding.deepEqual,
    exactSourceDist,
    pass: binding.pass && distBinding.pass && exactSourceDist,
  });
  findings.push(...binding.findings, ...distBinding.findings);
  if (!exactSourceDist) findings.push(finding("stale-dist-pack", `data/${name}`));
  findings.push(
    ...scanPrivacyText(jsonText, { path: `data/${name}.json` }),
    ...scanOperatingExposure(jsonText, { path: `data/${name}.json` }),
  );
}

findings.push(...verifyAtlasGraphV2(packs.graph).map((id) => finding(`graph-v2-${id}`, "data/graph.json")));
const graphNodeIds = packs.graph.nodes.map((node) => packs.graph.strings[node[0]]);
findings.push(...auditPublicAgencyContract(packs.agency, { knowledgeEntityIds: graphNodeIds }));
findings.push(...validateKnowledgeIndex(packs.knowledge, packs.graph, {
  gate1: gate1Slice,
  reviewCandidate,
}).map((id) => finding(`knowledge-${id}`, "data/knowledge.json")));
findings.push(...validatePublicationV3(packs.publication, packs, {
  gate1: gate1Slice,
  reviewCandidate,
}).map((id) => finding(`publication-v3-${id}`, "data/publication.json")));

const sourceKnowledgeAudit = await auditKnowledgeArtifacts(sourceDataDir, packs.knowledge, {
  graph: packs.graph,
});
const distKnowledgeAudit = await auditKnowledgeArtifacts(
  path.join(distDir, "data"),
  JSON.parse(await readFile(path.join(distDir, "data", "knowledge.json"), "utf8")),
  { graph: packs.graph },
);
findings.push(...sourceKnowledgeAudit.findings, ...distKnowledgeAudit.findings);
const sourceArtifactIdentity = sourceKnowledgeAudit.shardPairs
  .concat(sourceKnowledgeAudit.searchPairs)
  .map((item) => ({
    kind: item.kind,
    jsonPath: item.jsonPath,
    javascriptPath: item.javascriptPath,
    jsonSha256: item.jsonSha256,
    javascriptSha256: item.javascriptSha256,
  }));
const distArtifactIdentity = distKnowledgeAudit.shardPairs
  .concat(distKnowledgeAudit.searchPairs)
  .map((item) => ({
    kind: item.kind,
    jsonPath: item.jsonPath,
    javascriptPath: item.javascriptPath,
    jsonSha256: item.jsonSha256,
    javascriptSha256: item.javascriptSha256,
  }));
if (JSON.stringify(sourceArtifactIdentity) !== JSON.stringify(distArtifactIdentity)) {
  findings.push(finding("stale-dist-knowledge-artifact", "data/knowledge-shards"));
}

const inventoryTotal = packs.inventory.namedCount
  + packs.inventory.aggregateCount
  + packs.inventory.excludedCount;
if (packs.inventory.schema !== "atlas.inventory.v1"
  || packs.inventory.profile !== "atlas-public"
  || packs.inventory.unclassifiedCount !== 0
  || packs.inventory.physicalMarkdownCount !== inventoryTotal
  || packs.inventory.reconciliation?.pass !== true) {
  findings.push(finding("inventory-reconciliation", "data/inventory.json"));
}
if (packs.meaning.schema !== "atlas.meaning.v2"
  || packs.meaning.manifest?.graphProjectionDigest !== packs.graph.manifest.projectionDigest) {
  findings.push(finding("meaning-graph-binding", "data/meaning.json"));
}
for (const name of ["agency", "inventory", "graph", "meaning", "knowledge"]) {
  const sourceText = await readFile(path.join(sourceDataDir, `${name}.json`), "utf8");
  if (packs.publication.packDigests?.[name] !== sha256(sourceText)) {
    findings.push(finding("publication-pack-digest", `data/${name}.json`));
  }
}
const expectedSnapshotDigest = sha256(stableJson({
  agency: packs.agency,
  graph: packs.graph,
  inventory: packs.inventory,
  meaning: packs.meaning,
  knowledge: packs.knowledge,
}));
if (packs.publication.profile !== "public"
  || packs.publication.publicSnapshotDigest !== expectedSnapshotDigest) {
  findings.push(finding("publication-binding", "data/publication.json"));
}
const domains = packs.graph.domains.map((domain) => packs.graph.strings[domain[1]]);
for (const domain of requiredDomains) {
  if (!domains.includes(domain)) findings.push(finding("required-domain-missing", `data/graph.json#${domain}`));
}
if (packs.graph.nodes.some((node) => packs.graph.strings[node[0]].startsWith("actor:")
  || packs.graph.strings[node[1]] === "Homi")) {
  findings.push(finding("knowledge-node-namespace", "data/graph.json"));
}
if (packs.graph.edges.some((edge) => edge[1] === edge[2] || edge[3] < 1)) {
  findings.push(finding("directed-edge-invalid", "data/graph.json"));
}

const assetManifest = JSON.parse(await readFile(path.join(distDir, "asset-manifest.json"), "utf8"));
const buildReceipt = JSON.parse(await readFile(path.join(distDir, "build-receipt.json"), "utf8"));
if (assetManifest.schema !== "atlas.public_assets.v3"
  || assetManifest.profile !== "public"
  || assetManifest.publicSnapshotDigest !== expectedSnapshotDigest
  || assetManifest.runtimeClassAliases !== 0
  || assetManifest.unhashedJavaScriptOrCss?.length
  || assetManifest.knowledge?.initialBodies !== 0
  || assetManifest.knowledge?.shards?.length !== packs.knowledge.manifest.dossierCount
  || !assetManifest.knowledge?.search) {
  findings.push(finding("asset-manifest", "asset-manifest.json"));
}
if (buildReceipt.schema !== "atlas.public_build.v3"
  || buildReceipt.profile !== "public"
  || buildReceipt.publicSnapshotDigest !== expectedSnapshotDigest
  || buildReceipt.stylesheet?.bytes > 48 * 1024
  || buildReceipt.javascript?.gzipBytes > 180 * 1024
  || buildReceipt.semanticSpace?.gzipBytes > 240 * 1024
  || buildReceipt.initialRawBytes > 3 * 1024 * 1024
  || buildReceipt.knowledge?.initialBodies !== 0
  || buildReceipt.knowledge?.releaseEligible !== !(gate1Slice || reviewCandidate)
  || buildReceipt.gate1Slice !== gate1Slice
  || buildReceipt.reviewCandidate !== reviewCandidate) {
  findings.push(finding("build-budget-or-binding", "build-receipt.json"));
}

const distFiles = await filesUnder(distDir);
const totalArtifactBytes = distFiles.reduce((sum, file) => sum + file.bytes, 0);
if (totalArtifactBytes > 15 * 1024 * 1024) {
  findings.push(finding("public-artifact-size", "dist-public", { bytes: totalArtifactBytes }));
}
const indexHtml = await readFile(path.join(distDir, "index.html"), "utf8");
if (/knowledge-shards\/|search\.[a-f0-9]{16,64}\.js/.test(indexHtml)) {
  findings.push(finding("knowledge-body-eager-load", "index.html"));
}
for (const file of distFiles) {
  if (/\.(?:js|css)$/.test(file.path)
    && !/^(?:app|semantic-space)\.[a-f0-9]{16}\.(?:js|css)$/.test(file.path)
    && !file.path.startsWith("data/")
    && !file.path.startsWith("assets/")) {
    findings.push(finding("unhashed-runtime-asset", file.path));
  }
  if (/\.(?:html|json|webmanifest)$/.test(file.path)) {
    const text = await readFile(file.absolute, "utf8");
    const legal = file.path.startsWith("licenses/") || file.path === "THIRD_PARTY_NOTICES.md";
    const tooling = file.path === "index.html"
      || file.path === "asset-manifest.json"
      || file.path === "build-receipt.json";
    const decodedKnowledgeWire = file.path.startsWith("data/knowledge-shards/")
      || /^data\/search\.[a-f0-9]{16,64}\.json$/.test(file.path);
    if (!decodedKnowledgeWire) {
      findings.push(...scanPrivacyText(text, {
        path: `dist-public/${file.path}`,
        legalText: legal,
        toolingText: tooling,
      }));
      if (file.path === "index.html" || file.path.startsWith("data/")) {
        findings.push(...scanOperatingExposure(text, { path: `dist-public/${file.path}`, legalText: legal }));
      }
    }
  }
}

const ownerHashes = new Set();
const publicSourceHashes = new Set((await filesUnder(sourceDataDir)).map((file) => file.sha256));
try {
  for (const file of await filesUnder(ownerDataDir)) {
    if (!publicSourceHashes.has(file.sha256)) ownerHashes.add(file.sha256);
  }
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
for (const file of distFiles) {
  if (ownerHashes.has(file.sha256)) findings.push(finding("owner-byte-exact-leak", `dist-public/${file.path}`));
}
const { stdout: trackedOutput } = await execFileAsync("git", ["ls-files", "-z"], {
  cwd: projectDir,
  encoding: "utf8",
});
const trackedPaths = trackedOutput.split("\0").filter(Boolean);
if (trackedPaths.some((item) => item === ".generated/owner" || item.startsWith(".generated/owner/"))) {
  findings.push(finding("owner-generated-tracked", ".generated/owner"));
}

const uniqueFindings = [
  ...new Map(findings.map((item) => [`${item.id}\0${item.path}`, item])).values(),
];
const receipt = {
  schema: "atlas.publication_audit.v3",
  activityId: "REL-ATLAS-V7-9-20260729-01",
  auditedAt: new Date().toISOString(),
  profile: "public",
  gate1Slice,
  reviewCandidate,
  releaseEligible: packs.publication.releaseEligible,
  publicSnapshotDigest: expectedSnapshotDigest,
  graph: {
    schema: packs.graph.schema,
    nodes: packs.graph.manifest.nodeCount,
    directedEdges: packs.graph.manifest.edgeCount,
    domains,
    requiredDomainsPresent: requiredDomains.every((domain) => domains.includes(domain)),
  },
  inventory: {
    physical: packs.inventory.physicalMarkdownCount,
    named: packs.inventory.namedCount,
    aggregate: packs.inventory.aggregateCount,
    excluded: packs.inventory.excludedCount,
    unclassified: packs.inventory.unclassifiedCount,
  },
  bindings,
  knowledge: {
    schema: packs.knowledge.schema,
    dossiers: packs.knowledge.manifest.dossierCount,
    documents: packs.knowledge.manifest.documentCount,
    claims: packs.knowledge.manifest.claimCount,
    evidence: packs.knowledge.manifest.evidenceCount,
    relationExplanations: packs.knowledge.manifest.relationExplanationCount,
    publishedSections: packs.knowledge.manifest.publishedSectionCount,
    omittedSections: packs.knowledge.manifest.omittedSectionCount,
    shards: sourceKnowledgeAudit.shardPairs.length,
    searchIndexes: sourceKnowledgeAudit.searchPairs.length,
    initialBodies: 0,
  },
  budgets: {
    cssBytes: buildReceipt.stylesheet.bytes,
    shellGzipBytes: buildReceipt.javascript.gzipBytes,
    semanticSpaceGzipBytes: buildReceipt.semanticSpace.gzipBytes,
    initialRawBytes: buildReceipt.initialRawBytes,
    totalArtifactBytes,
  },
  privacyFindings: uniqueFindings.filter((item) => (
    !item.id.startsWith("graph-v2-")
    && !item.id.startsWith("agency-")
    && ![
      "inventory-reconciliation",
      "meaning-graph-binding",
      "publication-binding",
      "publication-pack-digest",
      "required-domain-missing",
      "knowledge-node-namespace",
      "directed-edge-invalid",
      "asset-manifest",
      "build-budget-or-binding",
      "unhashed-runtime-asset",
      "owner-generated-tracked",
    ].includes(item.id)
  )).length,
  findings: uniqueFindings,
  residualRisks: gate1Slice
    ? ["knowledge-workbench chunk split pending Gate 2"]
    : reviewCandidate
      ? ["Gate 2 domain-review candidate is not release eligible."]
      : [],
  verdict: uniqueFindings.length
    ? "fail"
    : gate1Slice
      ? "pass_gate1_nonrelease"
      : reviewCandidate
        ? "pass_gate2_review_candidate"
        : "pass",
};
await mkdir(path.dirname(receiptPath), { recursive: true });
await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
if (uniqueFindings.length) {
  throw new Error(`Publication audit blocked with ${uniqueFindings.length} findings; see ${receiptPath}.`);
}
console.log(JSON.stringify({ receiptPath, ...receipt }, null, 2));
