import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicPackArtifacts,
  serializePublicBrowserPackFromJson,
} from "./lib/public-data-wire.mjs";
import { agencyProjectionDigest } from "./lib/agency-contract.mjs";
import { stableJson } from "./lib/data-model.mjs";
import { scanOperatingExposure, scanPrivacyText } from "./lib/privacy-scanner.mjs";
import {
  auditKnowledgeArtifacts,
  validateKnowledgeIndex,
  validatePublicationV3,
} from "./lib/knowledge-pack-contract.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.resolve(
  process.env.ATLAS_GENERATED_ROOT ?? path.join(projectDir, ".generated", "profiles"),
);
const outputRoot = path.resolve(
  process.env.ATLAS_PROFILE_ROOT ?? path.join(projectDir, ".generated", "profiles"),
);
const promotePublicSafe = process.argv.includes("--promote-public-safe");
const gate1Slice = process.env.ATLAS_GATE1_SLICE === "true";
const reviewCandidate = process.env.ATLAS_REVIEW_CANDIDATE === "true";
if (gate1Slice && reviewCandidate) {
  throw new Error("Profile build cannot be both Gate 1 and Gate 2 review candidate.");
}
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function decodeGraph(graph) {
  const domains = graph.domains.map((domain, index) => ({
    index,
    id: graph.strings[domain[0]],
    label: graph.strings[domain[1]],
    nodeIndexes: domain[4],
  }));
  const nodes = graph.nodes.map((node, index) => ({
    index,
    id: graph.strings[node[0]],
    label: graph.strings[node[1]],
    kind: graph.kinds[node[2]],
    domain: domains[node[3]].label,
    gravity: node[4],
    occurrences: node[5],
  }));
  const edges = graph.edges.map((edge) => ({
    id: graph.strings[edge[0]],
    source: edge[1],
    target: edge[2],
    occurrences: edge[3],
  }));
  return { domains, nodes, edges };
}

function buildMeaning(graph) {
  const decoded = decodeGraph(graph);
  const incoming = new Map(decoded.nodes.map((node) => [node.index, []]));
  const outgoing = new Map(decoded.nodes.map((node) => [node.index, []]));
  for (const edge of decoded.edges) {
    incoming.get(edge.target).push(edge);
    outgoing.get(edge.source).push(edge);
  }
  const rankEdges = (edges) => [...edges]
    .sort((left, right) => right.occurrences - left.occurrences || left.id.localeCompare(right.id, "en"));
  const protagonists = decoded.domains
    .filter((domain) => ["MOC", "Papers", "Signals", "Rocket", "Groot", "Intelligence Layer"].includes(domain.label))
    .map((domain) => domain.nodeIndexes
      .map((index) => decoded.nodes[index])
      .sort((left, right) => right.gravity - left.gravity
        || right.occurrences - left.occurrences
        || left.label.localeCompare(right.label, "ko"))[0])
    .filter(Boolean)
    .map((node) => ({
      id: `meaning:protagonist:${node.id}`,
      nodeId: node.id,
      role: node.domain === "Signals" ? "frontier_signal" : "gravity_anchor",
      thesis: `${node.label}은 ${node.domain} 영역에서 실제 참조가 집중되는 공개 지식 주인공입니다.`,
      caveat: "중력은 품질 점수가 아니라 고유 inbound 문서 수를 뜻합니다.",
      metrics: {
        gravity: node.gravity,
        occurrences: node.occurrences,
        incomingCount: incoming.get(node.index).length,
        outgoingCount: outgoing.get(node.index).length,
      },
      selectionMode: "atlas_builder_judgment",
      storyIds: [`meaning:story:${node.id}`],
    }));
  const connectionStories = protagonists.map((protagonist) => {
    const node = decoded.nodes.find((candidate) => candidate.id === protagonist.nodeId);
    const incomingEdges = rankEdges(incoming.get(node.index)).slice(0, 6);
    const outgoingEdges = rankEdges(outgoing.get(node.index)).slice(0, 6);
    return {
      id: `meaning:story:${node.id}`,
      focalNodeId: node.id,
      thesis: protagonist.thesis,
      edgeIds: [...incomingEdges, ...outgoingEdges].map((edge) => edge.id),
      incomingEdgeIds: incomingEdges.map((edge) => edge.id),
      outgoingEdgeIds: outgoingEdges.map((edge) => edge.id),
      domains: [...new Set([...incomingEdges, ...outgoingEdges].flatMap((edge) => [
        decoded.nodes[edge.source].domain,
        decoded.nodes[edge.target].domain,
      ]))].sort(),
      caveat: protagonist.caveat,
    };
  });
  const domainBackbone = decoded.domains.map((domain) => {
    const anchor = decoded.nodes.find((node) => protagonists.some((item) => item.nodeId === node.id)
      && node.domain === domain.label)
      ?? domain.nodeIndexes.map((index) => decoded.nodes[index])
        .sort((left, right) => right.gravity - left.gravity)[0];
    const incident = anchor
      ? rankEdges([...incoming.get(anchor.index), ...outgoing.get(anchor.index)])
        .filter((edge) => decoded.nodes[edge.source].domain !== decoded.nodes[edge.target].domain)
        .slice(0, 3)
      : [];
    return {
      id: `meaning:domain:${domain.id}`,
      domain: domain.label,
      anchorNodeId: anchor?.id ?? null,
      edgeIds: incident.map((edge) => edge.id),
      evidenceGap: anchor && incident.length ? null : "공개 범위에서 직접 cross-domain edge를 확인하지 못했습니다.",
    };
  });
  const base = {
    schema: "atlas.meaning.v2",
    profile: graph.profile,
    generatedAt: graph.generatedAt,
    domainBackbone,
    connectionStories,
    protagonists,
    movements: [],
    operationalCompass: [
      { actorId: "actor:daily-runner", kind: "circulation", domains: ["MOC", "Papers", "Signals"] },
      { actorId: "actor:atlas-builder", kind: "translation", domains: decoded.domains.map((domain) => domain.label) },
      { actorId: "actor:rocket-manager", kind: "stewardship", domains: ["Rocket"] },
      { actorId: "actor:groot-manager", kind: "stewardship", domains: ["Groot"] },
      { actorId: "actor:intelligence-layer-manager", kind: "stewardship", domains: ["Intelligence Layer"] },
    ],
    manifest: {
      protagonistCount: protagonists.length,
      storyCount: connectionStories.length,
      movementCount: 0,
      domainCoverage: domainBackbone.map((item) => item.domain),
      graphProjectionDigest: graph.manifest.projectionDigest,
      projectionDigest: null,
    },
  };
  base.manifest.projectionDigest = sha256(stableJson({
    ...base,
    manifest: { ...base.manifest, projectionDigest: undefined },
  }));
  return base;
}

function shardDigestsFromKnowledge(knowledge) {
  if (knowledge?.encoding === "string_table_v1") {
    return knowledge.dossiers.map((row) => ({
      nodeId: knowledge.strings[row[0]],
      jsonSha256: knowledge.strings[row[5]],
      javascriptSha256: knowledge.strings[row[6]],
    }));
  }
  const rows = knowledge.knowledgeShardDigests
    ?? knowledge.shards
    ?? knowledge.manifest?.shards
    ?? [];
  return rows.map((row) => ({
    nodeId: row.nodeId,
    jsonSha256: row.jsonSha256 ?? row.digests?.json ?? row.json?.sha256,
    javascriptSha256: row.javascriptSha256
      ?? row.digests?.javascript
      ?? row.javascript?.sha256,
  }));
}

function searchDigestFromKnowledge(knowledge) {
  if (knowledge?.encoding === "string_table_v1") {
    return knowledge.search
      ? {
          jsonSha256: knowledge.search.jsonSha256,
          javascriptSha256: knowledge.search.javascriptSha256,
        }
      : null;
  }
  const row = knowledge.search
    ?? knowledge.searchDigest
    ?? knowledge.searchIndex
    ?? knowledge.manifest?.searchIndex;
  if (!row) return null;
  return {
    jsonSha256: row.jsonSha256 ?? row.digests?.json ?? row.json?.sha256,
    javascriptSha256: row.javascriptSha256
      ?? row.digests?.javascript
      ?? row.javascript?.sha256,
  };
}

function buildPublication({
  profile,
  graph,
  inventory,
  agency,
  meaning,
  knowledge,
  packDigests,
  projectionReviewCandidate,
}) {
  const semantic = { agency, graph, inventory, meaning, knowledge };
  const releaseEligible = knowledge.releaseEligible === true;
  const blockers = releaseEligible
    ? []
    : [projectionReviewCandidate
      ? "gate2_review_candidate_not_release_eligible"
      : "gate1_vertical_slice_not_full_coverage"];
  return {
    schema: "atlas.publication.v3",
    profile: profile === "atlas-public" ? "public" : "owner",
    generatedAt: graph.generatedAt,
    publicSnapshotDigest: sha256(stableJson(semantic)),
    graphSchema: graph.schema,
    publicationPolicy: "atlas.publication_policy.v3",
    packDigests,
    knowledgeShardDigests: shardDigestsFromKnowledge(knowledge),
    searchDigest: searchDigestFromKnowledge(knowledge),
    releaseEligible,
    redactionCounts: {
      physical: inventory.physicalMarkdownCount,
      named: inventory.namedCount,
      aggregate: inventory.aggregateCount,
      excluded: inventory.excludedCount,
      unclassified: inventory.unclassifiedCount,
    },
    allowedSurfaces: [
      "actual_safe_knowledge_names",
      "directed_reference_edges",
      "inventory_coverage",
      "agency_role_projection",
      "semantic_connection_stories",
    ],
    blockers,
  };
}

async function writePack(root, name, value, exactJsonText = null) {
  await mkdir(root, { recursive: true });
  const artifact = exactJsonText
    ? {
        jsonText: exactJsonText,
        jsText: serializePublicBrowserPackFromJson(name, exactJsonText),
      }
    : createPublicPackArtifacts(name, value);
  await writeFile(path.join(root, `${name}.json`), artifact.jsonText);
  await writeFile(path.join(root, `${name}.js`), artifact.jsText);
  return {
    jsonSha256: sha256(artifact.jsonText),
    javascriptSha256: sha256(artifact.jsText),
  };
}

async function syncKnowledgeArtifacts(source, target, artifactAudit) {
  if (source === target) return;
  await rm(path.join(target, "knowledge-shards"), { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  let targetEntries = [];
  try {
    targetEntries = await readdir(target);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await Promise.all(targetEntries
    .filter((name) => /^search\.[a-f0-9]{16,64}\.(?:json|js)$/.test(name))
    .map((name) => rm(path.join(target, name), { force: true })));
  for (const pair of [...artifactAudit.shardPairs, ...artifactAudit.searchPairs]) {
    for (const relative of [pair.jsonPath, pair.javascriptPath]) {
      const destination = path.join(target, relative);
      await mkdir(path.dirname(destination), { recursive: true });
      await cp(path.join(source, relative), destination);
    }
  }
}

const agencySource = JSON.parse(await readFile(path.join(projectDir, "public-safe", "data", "agency.json"), "utf8"));
const receipt = {
  schema: "atlas.dual_profile_projection.v3",
  activityId: "REL-ATLAS-V7-9-20260729-01",
  gate1Slice,
  reviewCandidate,
  profiles: {},
  pass: true,
};
for (const profile of ["public", "owner"]) {
  const atlasProfile = profile === "public" ? "atlas-public" : "atlas-owner";
  // Public is the only release target. The local Owner companion deliberately
  // remains non-release-eligible when its superset contains nodes outside the
  // reviewed public corpus.
  const projectionReviewCandidate = reviewCandidate || (!gate1Slice && profile === "owner");
  const graphPath = path.join(sourceRoot, profile, "data", "graph.json");
  const graphText = await readFile(graphPath, "utf8");
  const graph = JSON.parse(graphText);
  const inventoryText = await readFile(path.join(sourceRoot, profile, "data", "inventory.json"), "utf8");
  const inventory = JSON.parse(inventoryText);
  const knowledgePath = path.join(sourceRoot, profile, "data", "knowledge.json");
  const knowledgeText = await readFile(knowledgePath, "utf8");
  const knowledge = JSON.parse(knowledgeText);
  const agency = structuredClone(agencySource);
  agency.generatedAt = graph.generatedAt;
  agency.snapshot.asOfDate = graph.generatedAt.slice(0, 10);
  agency.projectionDigest = agencyProjectionDigest(agency);
  const meaning = buildMeaning(graph);
  const knowledgeFailures = validateKnowledgeIndex(knowledge, graph, {
    gate1: gate1Slice,
    reviewCandidate: projectionReviewCandidate,
    requireCompleteGraphCoverage: profile === "public",
  });
  if (knowledgeFailures.length) {
    throw new Error(`${profile} knowledge projection blocked: ${knowledgeFailures.join(", ")}.`);
  }
  const sourceDataRoot = path.dirname(knowledgePath);
  const knowledgeArtifactAudit = await auditKnowledgeArtifacts(sourceDataRoot, knowledge, {
    graph,
    scanPublic: profile === "public",
  });
  if (!knowledgeArtifactAudit.pass) {
    throw new Error(`${profile} knowledge artifacts blocked: ${
      knowledgeArtifactAudit.findings.map((item) => `${item.id}:${item.path}`).join(", ")
    }.`);
  }
  const agencyText = `${JSON.stringify(agency, null, 2)}\n`;
  const meaningText = `${JSON.stringify(meaning, null, 2)}\n`;
  const packDigests = {
    agency: sha256(agencyText),
    graph: sha256(graphText),
    inventory: sha256(inventoryText),
    meaning: sha256(meaningText),
    knowledge: sha256(knowledgeText),
  };
  const publication = buildPublication({
    profile: atlasProfile,
    graph,
    inventory,
    agency,
    meaning,
    knowledge,
    packDigests,
    projectionReviewCandidate,
  });
  const publicationFailures = validatePublicationV3(publication, {
    agency,
    graph,
    inventory,
    meaning,
    knowledge,
  }, {
    gate1: gate1Slice,
    reviewCandidate: projectionReviewCandidate,
  });
  if (publicationFailures.length) {
    throw new Error(`${profile} publication projection blocked: ${publicationFailures.join(", ")}.`);
  }
  const root = path.join(outputRoot, profile, "data");
  await syncKnowledgeArtifacts(sourceDataRoot, root, knowledgeArtifactAudit);
  const bindings = {};
  bindings.graph = await writePack(root, "graph", graph, graphText);
  bindings.inventory = await writePack(root, "inventory", inventory, inventoryText);
  bindings.agency = await writePack(root, "agency", agency);
  bindings.meaning = await writePack(root, "meaning", meaning);
  bindings.knowledge = await writePack(root, "knowledge", knowledge, knowledgeText);
  bindings.publication = await writePack(root, "publication", publication);
  const dataText = await Promise.all(["graph", "inventory", "agency", "meaning", "knowledge", "publication"]
    .map((name) => readFile(path.join(root, `${name}.json`), "utf8")));
  const findings = profile === "public"
    ? dataText.flatMap((text, index) => [
        ...scanPrivacyText(text, {
          path: `${["graph", "inventory", "agency", "meaning", "knowledge", "publication"][index]}.json`,
        }),
        ...scanOperatingExposure(text, {
          path: `${["graph", "inventory", "agency", "meaning", "knowledge", "publication"][index]}.json`,
        }),
      ])
    : [];
  if (findings.length) throw new Error(`Public projection blocked: ${JSON.stringify(findings)}.`);
  receipt.profiles[profile] = {
    graphManifest: graph.manifest,
    inventory: {
      physical: inventory.physicalMarkdownCount,
      named: inventory.namedCount,
      excluded: inventory.excludedCount,
      unclassified: inventory.unclassifiedCount,
    },
    meaningManifest: meaning.manifest,
    knowledgeManifest: knowledge.manifest,
    knowledgeArtifacts: {
      shards: knowledgeArtifactAudit.shardPairs.length,
      searchIndexes: knowledgeArtifactAudit.searchPairs.length,
    },
    publicationDigest: publication.publicSnapshotDigest,
    releaseEligible: publication.releaseEligible,
    bindings,
    privacyFindings: findings.length,
  };
}
if (promotePublicSafe) {
  if (gate1Slice || reviewCandidate) {
    throw new Error("Non-release profile bytes must never be promoted to public-safe.");
  }
  const source = path.join(outputRoot, "public", "data");
  const target = path.join(projectDir, "public-safe", "data");
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  await cp(source, target, { recursive: true });
}
await writeFile(
  path.join(outputRoot, "dual-profile-projection-receipt.json"),
  `${JSON.stringify(receipt, null, 2)}\n`,
);
console.log(JSON.stringify(receipt, null, 2));
