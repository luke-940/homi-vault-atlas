import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildAtlasGraphV2,
  verifyAtlasGraphV2,
} from "./lib/atlas-graph-v2.mjs";
import {
  classifyRecordsWithPublicationPolicy,
  validatePublicationPolicyV2,
} from "./lib/atlas-publication-policy-v2.mjs";
import { scanOperatingExposure, scanPrivacyText } from "./lib/privacy-scanner.mjs";
import {
  buildResolvedLinkEdges,
  extractWikilinkTargets,
  parseFrontmatterScalarMap,
  stableJson,
} from "./lib/v7-4-profile-contract.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const captureDir = path.resolve(
  process.env.ATLAS_V7_8_CAPTURE_DIR
    ?? path.join(projectDir, ".generated", "capture"),
);
const capturePath = path.join(captureDir, "canonical-capture-manifest.json");
const policyPath = path.join(projectDir, "public-safe", "atlas-publication-policy.v2.json");
const outputRoot = path.resolve(
  process.env.ATLAS_V7_8_GENERATED_ROOT
    ?? path.join(projectDir, ".generated", "v7.8"),
);
const gateOutput = process.env.ATLAS_GATE_OUTPUT ? path.resolve(process.env.ATLAS_GATE_OUTPUT) : null;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const captureBody = await readFile(capturePath);
const capture = JSON.parse(captureBody);
if (capture?.schema !== "atlas.canonical_capture.v1" || capture.pass !== true || capture.tornRead !== false) {
  throw new Error("Graph v2 build blocked: canonical capture is missing or torn.");
}
const policyBody = await readFile(policyPath);
const policy = JSON.parse(policyBody);
const policyFailures = validatePublicationPolicyV2(policy);
if (policyFailures.length) throw new Error(`Graph v2 build blocked: invalid policy (${policyFailures.join(", ")}).`);

const records = [];
for (const file of capture.vault.files) {
  const absolute = path.join(capture.sourceBoundary.vaultRoot, file.relativePath);
  const body = await readFile(absolute);
  if (body.length !== file.bytes || sha256(body) !== file.sha256) {
    throw new Error(`Graph v2 build blocked: source drift at ${file.relativePath}.`);
  }
  const markdown = body.toString("utf8");
  records.push({
    relativePath: file.relativePath,
    title: path.posix.basename(file.relativePath, ".md"),
    frontmatter: parseFrontmatterScalarMap(markdown),
    wikilinks: extractWikilinkTargets(markdown),
  });
}
if (records.length !== capture.vault.markdownCount) {
  throw new Error("Graph v2 build blocked: physical inventory count changed.");
}
const resolvedEdges = buildResolvedLinkEdges(records);

function buildProfile(profile) {
  const reconciliation = classifyRecordsWithPublicationPolicy(records, resolvedEdges, profile, policy);
  reconciliation.inventory.generatedAt = capture.capturedAt;
  const graph = buildAtlasGraphV2({
    records: reconciliation.classified,
    resolvedEdges,
    profile,
    generatedAt: capture.capturedAt,
  });
  const verificationFailures = verifyAtlasGraphV2(graph);
  if (verificationFailures.length) {
    throw new Error(`Graph v2 verification blocked for ${profile}: ${verificationFailures.join(", ")}.`);
  }
  return { reconciliation, graph };
}

const publicResult = buildProfile("atlas-public");
const ownerResult = buildProfile("atlas-owner");
const publicReplay = buildProfile("atlas-public");
const ownerReplay = buildProfile("atlas-owner");
if (stableJson(publicResult.graph) !== stableJson(publicReplay.graph)
  || stableJson(ownerResult.graph) !== stableJson(ownerReplay.graph)) {
  throw new Error("Graph v2 build blocked: identical input produced non-deterministic bytes.");
}

const publicNodeIds = new Set(publicResult.graph.nodes.map((node) => publicResult.graph.strings[node[0]]));
const ownerNodeIds = new Set(ownerResult.graph.nodes.map((node) => ownerResult.graph.strings[node[0]]));
if ([...publicNodeIds].some((id) => !ownerNodeIds.has(id))) {
  throw new Error("Graph v2 build blocked: Public source set is not an Owner subset.");
}
const publicBody = `${JSON.stringify(publicResult.graph)}\n`;
const ownerBody = `${JSON.stringify(ownerResult.graph)}\n`;
if (Buffer.byteLength(publicBody) > 250 * 1024) {
  throw new Error(`Graph v2 build blocked: Public JSON ${Buffer.byteLength(publicBody)}B exceeds 250KiB.`);
}
if (Buffer.byteLength(ownerBody) > 750 * 1024) {
  throw new Error(`Graph v2 build blocked: Owner JSON ${Buffer.byteLength(ownerBody)}B exceeds 750KiB.`);
}
const publicFindings = [
  ...scanPrivacyText(publicBody, { path: "atlas.graph.v2.json" }),
  ...scanOperatingExposure(publicBody, { path: "atlas.graph.v2.json" }),
];
if (publicFindings.length) {
  throw new Error(`Graph v2 build blocked: Public privacy findings ${JSON.stringify(publicFindings)}.`);
}

await mkdir(path.join(outputRoot, "public", "data"), { recursive: true });
await mkdir(path.join(outputRoot, "owner", "data"), { recursive: true });
await writeFile(path.join(outputRoot, "public", "data", "graph.json"), publicBody);
await writeFile(path.join(outputRoot, "owner", "data", "graph.json"), ownerBody);
await writeFile(
  path.join(outputRoot, "public", "data", "inventory.json"),
  `${JSON.stringify(publicResult.reconciliation.inventory, null, 2)}\n`,
);
await writeFile(
  path.join(outputRoot, "owner", "data", "inventory.json"),
  `${JSON.stringify(ownerResult.reconciliation.inventory, null, 2)}\n`,
);

const receipt = {
  schema: "atlas.graph_v2_projection_receipt.v1",
  activityId: "REL-ATLAS-V7-8-20260728-01",
  generatedAt: capture.capturedAt,
  inputs: {
    captureManifestSha256: sha256(captureBody),
    vaultTreeDigest: capture.vault.treeDigest,
    publicationPolicySha256: sha256(policyBody),
  },
  public: {
    bytes: Buffer.byteLength(publicBody),
    sha256: sha256(publicBody),
    inventory: publicResult.reconciliation.inventory,
    manifest: publicResult.graph.manifest,
  },
  owner: {
    bytes: Buffer.byteLength(ownerBody),
    sha256: sha256(ownerBody),
    inventory: ownerResult.reconciliation.inventory,
    manifest: ownerResult.graph.manifest,
  },
  invariants: {
    deterministicReplay: true,
    publicSubsetOfOwner: true,
    publicPrivacyFindings: 0,
    dateAxis: false,
    unclassified: 0,
  },
  verdict: "pass",
};
if (gateOutput) {
  await mkdir(gateOutput, { recursive: true });
  await writeFile(path.join(gateOutput, "graph-v2-projection-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
}
console.log(JSON.stringify(receipt, null, 2));
