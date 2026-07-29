import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  compileKnowledgePublicationV1,
  verifyKnowledgeProjectionV1,
} from "./lib/knowledge-publication.mjs";
import {
  parseFrontmatterScalarMap,
  privacySafeDigestToken,
} from "./lib/profile-contract.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const builderRoot = path.resolve(projectDir, "../..");
const activityId = "REL-ATLAS-V7-9-20260729-01";
const capturePath = path.resolve(
  process.env.ATLAS_CAPTURE_MANIFEST
    ?? path.join(
      builderRoot,
      "outputs",
      activityId,
      "gate-2",
      "canonical-capture-rc1",
      "canonical-capture-manifest.json",
    ),
);
const outputRoot = path.resolve(
  process.env.ATLAS_GENERATED_ROOT
    ?? path.join(projectDir, ".generated", "profiles"),
);
const evidenceRoot = path.resolve(
  process.env.ATLAS_GATE_OUTPUT
    ?? path.join(builderRoot, "outputs", activityId, "gate-2"),
);
const policyPath = path.join(projectDir, "public-safe", "atlas-publication-policy.v3.json");
const reviewsPath = path.resolve(
  process.env.ATLAS_REVIEW_SOURCE
    ?? path.join(projectDir, "public-safe", "reviewed-dossiers.gate2-candidate.v1.json"),
);
const releaseEligible = process.env.ATLAS_RELEASE_ELIGIBLE === "true";
const gateLabel = process.env.ATLAS_GATE_LABEL ?? "gate_2_domain_review";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const [captureBody, policyBody, reviewsBody] = await Promise.all([
  readFile(capturePath),
  readFile(policyPath),
  readFile(reviewsPath),
]);
const capture = JSON.parse(captureBody.toString("utf8"));
const policy = JSON.parse(policyBody.toString("utf8"));
const reviewedDossiers = JSON.parse(reviewsBody.toString("utf8"));
if (capture?.schema !== "atlas.canonical_capture.v1"
  || capture?.pass !== true
  || capture?.tornRead !== false) {
  throw new Error("Knowledge build blocked: canonical capture is missing or torn.");
}

const sourceRecords = [];
for (const file of capture.vault.files) {
  const absolute = path.join(capture.sourceBoundary.vaultRoot, file.relativePath);
  const body = await readFile(absolute);
  if (body.length !== file.bytes || sha256(body) !== file.sha256) {
    throw new Error(`Knowledge build blocked: source drift at ${file.relativePath}.`);
  }
  const markdown = body.toString("utf8");
  sourceRecords.push({
    nodeId: `n:${privacySafeDigestToken(file.relativePath, 16)}`,
    title: path.posix.basename(file.relativePath, ".md"),
    relativePath: file.relativePath,
    frontmatter: parseFrontmatterScalarMap(markdown),
    markdown,
  });
}
if (sourceRecords.length !== capture.vault.markdownCount) {
  throw new Error("Knowledge build blocked: physical inventory changed.");
}

async function clearOldKnowledgeArtifacts(dataRoot) {
  await rm(path.join(dataRoot, "knowledge-shards"), { recursive: true, force: true });
  await mkdir(path.join(dataRoot, "knowledge-shards"), { recursive: true });
  let names = [];
  try {
    names = await readdir(dataRoot);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await Promise.all(names
    .filter((name) => /^search\.[a-f0-9]{16,64}\.(?:json|js)$/.test(name))
    .map((name) => rm(path.join(dataRoot, name), { force: true })));
  await rm(path.join(dataRoot, "knowledge.json"), { force: true });
  await rm(path.join(dataRoot, "knowledge.js"), { force: true });
}

async function materializeProfile(profile) {
  const dataRoot = path.join(outputRoot, profile, "data");
  const graphText = await readFile(path.join(dataRoot, "graph.json"), "utf8");
  const graph = JSON.parse(graphText);
  const graphNodes = new Map(graph.nodes.map((node) => {
    const id = graph.strings[node[0]];
    return [id, {
      displayTitle: graph.strings[node[1]],
      domain: graph.strings[graph.domains[node[3]][1]],
      kind: graph.kinds[node[2]],
    }];
  }));
  const records = sourceRecords
    .filter((record) => graphNodes.has(record.nodeId))
    .map((record) => ({
      ...record,
      ...graphNodes.get(record.nodeId),
    }));
  const compiled = compileKnowledgePublicationV1({
    graph,
    records,
    reviewedDossiers,
    policy,
    generatedAt: capture.capturedAt,
    releaseEligible: releaseEligible && profile === "public",
  });
  const failures = verifyKnowledgeProjectionV1({
    graph,
    index: compiled.index,
    shards: compiled.shards,
    search: compiled.search,
  });
  if (failures.length) {
    throw new Error(`Knowledge ${profile} verification blocked: ${failures.join(", ")}.`);
  }

  await clearOldKnowledgeArtifacts(dataRoot);
  for (const shard of compiled.shards) {
    const jsonPath = path.join(dataRoot, shard.entry.path.replace(/^data\//, ""));
    const jsPath = path.join(dataRoot, shard.entry.javascriptPath.replace(/^data\//, ""));
    await mkdir(path.dirname(jsonPath), { recursive: true });
    await writeFile(jsonPath, shard.jsonText);
    await writeFile(jsPath, shard.jsText);
  }
  const searchJsonPath = path.join(dataRoot, `search.${compiled.index.search.token}.json`);
  const searchJsPath = path.join(dataRoot, `search.${compiled.index.search.token}.js`);
  await writeFile(searchJsonPath, compiled.search.jsonText);
  await writeFile(searchJsPath, compiled.search.jsText);
  const knowledgeText = `${JSON.stringify(compiled.index)}\n`;
  await writeFile(path.join(dataRoot, "knowledge.json"), knowledgeText);

  return {
    profile,
    graphProjectionDigest: graph.manifest.projectionDigest,
    graphNodeCount: graph.manifest.nodeCount,
    graphEdgeCount: graph.manifest.edgeCount,
    knowledgeSha256: sha256(knowledgeText),
    knowledgeManifest: compiled.index.manifest,
    releaseEligible: compiled.index.releaseEligible,
    shardBytes: compiled.shards.map((item) => ({
      nodeId: item.value.nodeId,
      bytes: Buffer.byteLength(item.jsonText),
      sha256: item.jsonSha256,
    })),
    search: {
      entries: compiled.search.value.manifest.entryCount,
      bytes: Buffer.byteLength(compiled.search.jsonText),
      sha256: compiled.search.jsonSha256,
    },
    privateOccurrenceLedger: compiled.privateOccurrenceLedger,
    privateSectionLedger: compiled.privateSectionLedger,
  };
}

const profiles = [];
for (const profile of ["public", "owner"]) {
  profiles.push(await materializeProfile(profile));
}

await mkdir(evidenceRoot, { recursive: true });
const receipt = {
  schema: "atlas.knowledge_projection_receipt.v1",
  activityId,
  generatedAt: capture.capturedAt,
  gate: gateLabel,
  releaseEligible,
  inputs: {
    captureManifestSha256: sha256(captureBody),
    vaultTreeDigest: capture.vault.treeDigest,
    publicationPolicySha256: sha256(policyBody),
    reviewedDossiersSha256: sha256(reviewsBody),
  },
  profiles: Object.fromEntries(profiles.map((profile) => [profile.profile, {
    graphProjectionDigest: profile.graphProjectionDigest,
    graphNodeCount: profile.graphNodeCount,
    graphEdgeCount: profile.graphEdgeCount,
    knowledgeSha256: profile.knowledgeSha256,
    knowledgeManifest: profile.knowledgeManifest,
    releaseEligible: profile.releaseEligible,
    shardBytes: profile.shardBytes,
    search: profile.search,
  }])),
  invariants: {
    reviewedDossiers: reviewedDossiers.dossiers.length,
    publicOwnerDossierParity: profiles[0].knowledgeManifest.dossierCount
      === profiles[1].knowledgeManifest.dossierCount,
    claimEvidenceCoverage: "100%",
    unclassifiedSections: 0,
    sourceDrift: 0,
    vaultWrites: 0,
    githubWrites: 0,
  },
  residualRisks: [
    ...(releaseEligible
      ? []
      : ["The current projection is a non-release review candidate."]),
    "Graph v2 edge counts still use the whole-file compatibility compiler; relation evidence is occurrence-bound in the knowledge layer.",
  ],
  verdict: releaseEligible ? "pass_release_candidate" : "pass_review_candidate",
};
await writeFile(
  path.join(evidenceRoot, "knowledge-projection-receipt.json"),
  `${JSON.stringify(receipt, null, 2)}\n`,
);
for (const profile of profiles) {
  await writeFile(
    path.join(evidenceRoot, `private-${profile.profile}-occurrence-ledger.json`),
    `${JSON.stringify(profile.privateOccurrenceLedger, null, 2)}\n`,
  );
  await writeFile(
    path.join(evidenceRoot, `private-${profile.profile}-section-ledger.json`),
    `${JSON.stringify(profile.privateSectionLedger, null, 2)}\n`,
  );
}
console.log(JSON.stringify(receipt, null, 2));
