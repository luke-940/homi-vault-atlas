import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicPackArtifacts,
  serializePublicBrowserPackFromJson,
} from "./lib/public-data-wire.mjs";
import { agencyProjectionDigest } from "./lib/agency-contract.mjs";
import { stableJson } from "./lib/data-model.mjs";
import { scanOperatingExposure, scanPrivacyText } from "./lib/privacy-scanner.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.resolve(
  process.env.ATLAS_GENERATED_ROOT ?? path.join(projectDir, ".generated", "profiles"),
);
const outputRoot = path.resolve(
  process.env.ATLAS_PROFILE_ROOT ?? path.join(projectDir, ".generated", "profiles"),
);
const promotePublicSafe = process.argv.includes("--promote-public-safe");
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

function buildPublication({ profile, graph, inventory, agency, meaning }) {
  const semantic = { agency, graph, inventory, meaning };
  return {
    schema: "atlas.publication.v2",
    profile: profile === "atlas-public" ? "public" : "owner",
    generatedAt: graph.generatedAt,
    publicSnapshotDigest: sha256(stableJson(semantic)),
    graphSchema: graph.schema,
    publicationPolicy: "atlas.publication_policy.v2",
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
    blockers: [],
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

const agencySource = JSON.parse(await readFile(path.join(projectDir, "public-safe", "data", "agency.json"), "utf8"));
const receipt = {
  schema: "atlas.dual_profile_projection.v2",
  activityId: "REL-ATLAS-V7-8-20260728-01",
  profiles: {},
  pass: true,
};
for (const profile of ["public", "owner"]) {
  const atlasProfile = profile === "public" ? "atlas-public" : "atlas-owner";
  const graphPath = path.join(sourceRoot, profile, "data", "graph.json");
  const graphText = await readFile(graphPath, "utf8");
  const graph = JSON.parse(graphText);
  const inventory = JSON.parse(await readFile(path.join(sourceRoot, profile, "data", "inventory.json"), "utf8"));
  const agency = structuredClone(agencySource);
  agency.generatedAt = graph.generatedAt;
  agency.snapshot.asOfDate = graph.generatedAt.slice(0, 10);
  agency.projectionDigest = agencyProjectionDigest(agency);
  const meaning = buildMeaning(graph);
  const publication = buildPublication({ profile: atlasProfile, graph, inventory, agency, meaning });
  const root = path.join(outputRoot, profile, "data");
  const bindings = {};
  bindings.graph = await writePack(root, "graph", graph, graphText);
  bindings.inventory = await writePack(root, "inventory", inventory);
  bindings.agency = await writePack(root, "agency", agency);
  bindings.meaning = await writePack(root, "meaning", meaning);
  bindings.publication = await writePack(root, "publication", publication);
  const dataText = await Promise.all(["graph", "inventory", "agency", "meaning", "publication"]
    .map((name) => readFile(path.join(root, `${name}.json`), "utf8")));
  const findings = profile === "public"
    ? dataText.flatMap((text, index) => [
        ...scanPrivacyText(text, { path: `${["graph", "inventory", "agency", "meaning", "publication"][index]}.json` }),
        ...scanOperatingExposure(text, { path: `${["graph", "inventory", "agency", "meaning", "publication"][index]}.json` }),
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
    publicationDigest: publication.publicSnapshotDigest,
    bindings,
    privacyFindings: findings.length,
  };
}
if (promotePublicSafe) {
  const source = path.join(outputRoot, "public", "data");
  const target = path.join(projectDir, "public-safe", "data");
  await mkdir(target, { recursive: true });
  for (const name of ["graph", "inventory", "agency", "meaning", "publication"]) {
    await writeFile(path.join(target, `${name}.json`), await readFile(path.join(source, `${name}.json`)));
    await writeFile(path.join(target, `${name}.js`), await readFile(path.join(source, `${name}.js`)));
  }
}
await writeFile(
  path.join(outputRoot, "dual-profile-projection-receipt.json"),
  `${JSON.stringify(receipt, null, 2)}\n`,
);
console.log(JSON.stringify(receipt, null, 2));
