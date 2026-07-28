import { createHash } from "node:crypto";
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
} from "d3-force";
import { privacySafeDigestToken, stableJson } from "./profile-contract.mjs";

const compareText = (left, right) => String(left).localeCompare(String(right), "en");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const round = (value, digits = 2) => Number(value.toFixed(digits));
const NODE_FLAGS = Object.freeze({
  crossDomain: 1,
  domainAnchor: 2,
  protagonistCandidate: 4,
});

export const GRAPH_V2_LAYOUT = Object.freeze({
  algorithm: "seeded-topology-domain-force-3d-v2",
  seed: "homi-vault-atlas-open-knowledge-cosmos-01",
  ticks: 360,
  bounds: { width: 1600, height: 720, depth: 1120 },
});

function seededRandom(seedText) {
  let state = Number.parseInt(sha256(seedText).slice(0, 8), 16) >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function stableId(prefix, source, length = 16) {
  return `${prefix}:${privacySafeDigestToken(source, length)}`;
}

function fitCoordinates(nodes, width, depth, padding = 110) {
  const minX = Math.min(...nodes.map((node) => node.x));
  const maxX = Math.max(...nodes.map((node) => node.x));
  const minZ = Math.min(...nodes.map((node) => node.y));
  const maxZ = Math.max(...nodes.map((node) => node.y));
  const spanX = Math.max(1, maxX - minX);
  const spanZ = Math.max(1, maxZ - minZ);
  for (const node of nodes) {
    node.x = padding + ((node.x - minX) / spanX) * (width - padding * 2);
    node.z = padding + ((node.y - minZ) / spanZ) * (depth - padding * 2);
  }
}

function domainAnchors(domains, edges, recordByPath, random) {
  const authoredSlots = new Map(Object.entries({
    MOC: [-250, -170],
    Papers: [-330, 165],
    Signals: [0, -5],
    Rocket: [245, -180],
    Groot: [345, 12],
    "Intelligence Layer": [250, 190],
    Strategy: [-20, 255],
    Research: [-345, -10],
  }));
  const domainNodes = domains.map((domain, index) => {
    const angle = (index / Math.max(1, domains.length)) * Math.PI * 2 - Math.PI / 2;
    const slot = authoredSlots.get(domain) ?? [Math.cos(angle) * 330, Math.sin(angle) * 230];
    return {
      id: domain,
      x: slot[0] + (random() - 0.5) * 14,
      y: slot[1] + (random() - 0.5) * 14,
      slotX: slot[0],
      slotY: slot[1],
    };
  });
  const weights = new Map();
  for (const edge of edges) {
    const sourceDomain = recordByPath.get(edge.sourcePath)?.domain;
    const targetDomain = recordByPath.get(edge.targetPath)?.domain;
    if (!sourceDomain || !targetDomain || sourceDomain === targetDomain) continue;
    const pair = [sourceDomain, targetDomain].sort(compareText);
    const key = `${pair[0]}\0${pair[1]}`;
    weights.set(key, (weights.get(key) ?? 0) + edge.occurrences);
  }
  const links = [...weights].map(([key, weight]) => {
    const [source, target] = key.split("\0");
    return { source, target, weight };
  });
  const simulation = forceSimulation(domainNodes)
    .randomSource(random)
    .alpha(1)
    .alphaDecay(1 - Math.pow(0.001, 1 / 280))
    .velocityDecay(0.32)
    .force("charge", forceManyBody().strength(-590))
    .force("collision", forceCollide(92).iterations(4))
    .force("link", forceLink(links)
      .id((/** @type {any} */ node) => node.id)
      .distance((/** @type {any} */ link) => Math.max(150, 320 - Math.log1p(link.weight) * 24))
      .strength((/** @type {any} */ link) => Math.min(0.075, 0.012 + Math.log1p(link.weight) * 0.008)))
    .force("x", forceX((/** @type {any} */ node) => node.slotX).strength(0.1))
    .force("y", forceY((/** @type {any} */ node) => node.slotY).strength(0.1))
    .stop();
  for (let tick = 0; tick < 280; tick += 1) simulation.tick();
  fitCoordinates(domainNodes, GRAPH_V2_LAYOUT.bounds.width, GRAPH_V2_LAYOUT.bounds.depth, 190);
  return new Map(domainNodes.map((node) => [node.id, { x: node.x, z: node.z }]));
}

function cameraBookmark(coordinates, nodeIndexes, kind) {
  const selected = nodeIndexes.map((index) => coordinates[index]).filter(Boolean);
  const source = selected.length ? selected : coordinates;
  const minX = Math.min(...source.map((coordinate) => coordinate[0]));
  const maxX = Math.max(...source.map((coordinate) => coordinate[0]));
  const minY = Math.min(...source.map((coordinate) => coordinate[1]));
  const maxY = Math.max(...source.map((coordinate) => coordinate[1]));
  const minZ = Math.min(...source.map((coordinate) => coordinate[2]));
  const maxZ = Math.max(...source.map((coordinate) => coordinate[2]));
  const center = [
    round((minX + maxX) / 2),
    round((minY + maxY) / 2),
    round((minZ + maxZ) / 2),
  ];
  const span = Math.max(maxX - minX, maxZ - minZ, 420);
  const elevation = kind === "agentStewardship" ? 0.76 : kind === "projectFrontiers" ? 0.58 : 0.64;
  return {
    target: center,
    position: [
      round(center[0] + span * 0.2),
      round(center[1] + span * elevation),
      round(center[2] + span * 1.18),
    ],
    fov: 46,
  };
}

function graphDigest(value) {
  return sha256(stableJson(value));
}

export function buildAtlasGraphV2({ records, resolvedEdges, profile, generatedAt }) {
  const named = records
    .filter((record) => record.classification.disposition === "named")
    .sort((left, right) => compareText(left.relativePath, right.relativePath));
  const recordByPath = new Map(named.map((record) => [record.relativePath, record]));
  const admittedEdges = resolvedEdges
    .filter((edge) => recordByPath.has(edge.sourcePath) && recordByPath.has(edge.targetPath))
    .sort((left, right) => compareText(left.sourcePath, right.sourcePath)
      || compareText(left.targetPath, right.targetPath));
  const incomingSources = new Map(named.map((record) => [record.relativePath, new Set()]));
  const incomingOccurrences = new Map(named.map((record) => [record.relativePath, 0]));
  const outgoingCount = new Map(named.map((record) => [record.relativePath, 0]));
  const neighborDomains = new Map(named.map((record) => [record.relativePath, new Set()]));
  for (const edge of admittedEdges) {
    incomingSources.get(edge.targetPath)?.add(edge.sourcePath);
    incomingOccurrences.set(edge.targetPath, (incomingOccurrences.get(edge.targetPath) ?? 0) + edge.occurrences);
    outgoingCount.set(edge.sourcePath, (outgoingCount.get(edge.sourcePath) ?? 0) + edge.occurrences);
    const sourceDomain = recordByPath.get(edge.sourcePath).domain;
    const targetDomain = recordByPath.get(edge.targetPath).domain;
    if (sourceDomain !== targetDomain) {
      neighborDomains.get(edge.sourcePath)?.add(targetDomain);
      neighborDomains.get(edge.targetPath)?.add(sourceDomain);
    }
  }
  const domains = [...new Set(named.map((record) => record.domain))].sort(compareText);
  const kinds = [...new Set(named.map((record) => record.kind))].sort(compareText);
  const random = seededRandom(`${GRAPH_V2_LAYOUT.seed}:${profile}:${graphDigest(
    named.map((record) => [record.relativePath, record.displayTitle, record.domain, record.kind]),
  )}`);
  const anchors = domainAnchors(domains, admittedEdges, recordByPath, random);
  const maxGravity = Math.max(1, ...named.map((record) => incomingSources.get(record.relativePath)?.size ?? 0));
  const simulationNodes = named.map((record) => {
    const anchor = anchors.get(record.domain);
    const angle = random() * Math.PI * 2;
    const radius = 34 + random() * 92;
    const gravity = incomingSources.get(record.relativePath)?.size ?? 0;
    return {
      id: record.relativePath,
      x: anchor.x + Math.cos(angle) * radius,
      y: anchor.z + Math.sin(angle) * radius,
      anchorX: anchor.x,
      anchorZ: anchor.z,
      radius: 5.5 + 9 * Math.sqrt(gravity / maxGravity),
    };
  });
  // Inter-domain topology already shapes the domain anchors above. Reapplying
  // thousands of cross-domain links at node level collapses the authored
  // semantic space into a single hairball, so this pass only resolves the
  // topology inside each domain.
  const simulationLinks = admittedEdges
    .filter((edge) => recordByPath.get(edge.sourcePath).domain === recordByPath.get(edge.targetPath).domain)
    .map((edge) => ({
      source: edge.sourcePath,
      target: edge.targetPath,
      occurrences: edge.occurrences,
    }));
  const simulation = forceSimulation(simulationNodes)
    .randomSource(random)
    .alpha(1)
    .alphaDecay(1 - Math.pow(0.001, 1 / GRAPH_V2_LAYOUT.ticks))
    .velocityDecay(0.34)
    .force("x", forceX((/** @type {any} */ node) => node.anchorX).strength(0.22))
    .force("y", forceY((/** @type {any} */ node) => node.anchorZ).strength(0.22))
    .force("charge", forceManyBody().strength((/** @type {any} */ node) => -18 - node.radius * 1.6))
    .force("collision", forceCollide((/** @type {any} */ node) => node.radius + 3.5).iterations(4))
    .force("link", forceLink(simulationLinks)
      .id((/** @type {any} */ node) => node.id)
      .distance(56)
      .strength((/** @type {any} */ link) => Math.min(0.095, 0.01 + Math.log1p(link.occurrences) * 0.012)))
    .stop();
  for (let tick = 0; tick < GRAPH_V2_LAYOUT.ticks; tick += 1) simulation.tick();
  // Large domains naturally push farther apart under collision, while small but
  // strategically important domains can collapse into unreadable specks. Keep
  // each topology-derived cluster intact, then normalize its authored visual
  // envelope so all approved domains remain discoverable in the whole-vault
  // camera without falsifying any edge.
  for (const domain of domains) {
    const members = simulationNodes.filter((node) => recordByPath.get(node.id)?.domain === domain);
    if (!members.length) continue;
    const anchor = anchors.get(domain);
    const centerX = members.reduce((sum, node) => sum + node.x, 0) / members.length;
    const centerZ = members.reduce((sum, node) => sum + node.y, 0) / members.length;
    const distances = members
      .map((node) => Math.hypot(node.x - centerX, node.y - centerZ))
      .sort((left, right) => left - right);
    const envelope = Math.max(1, distances[Math.floor((distances.length - 1) * 0.9)] ?? 1);
    const targetRadius = Math.min(186, 72 + Math.sqrt(members.length) * 8.4);
    const scale = targetRadius / envelope;
    for (const node of members) {
      let dx = (node.x - centerX) * scale;
      let dz = (node.y - centerZ) * scale;
      const distance = Math.hypot(dx, dz);
      const limit = targetRadius * 1.16;
      if (distance > limit) {
        dx *= limit / distance;
        dz *= limit / distance;
      }
      node.x = anchor.x + dx;
      node.y = anchor.z + dz;
    }
  }
  fitCoordinates(simulationNodes, GRAPH_V2_LAYOUT.bounds.width, GRAPH_V2_LAYOUT.bounds.depth);

  const nodeIndexByPath = new Map(named.map((record, index) => [record.relativePath, index]));
  const nodeIds = named.map((record) => stableId("n", record.relativePath));
  const edgeModels = admittedEdges.map((edge) => ({
    id: stableId(
      "e",
      `${nodeIds[nodeIndexByPath.get(edge.sourcePath)]}>${nodeIds[nodeIndexByPath.get(edge.targetPath)]}`,
      12,
    ),
    source: nodeIndexByPath.get(edge.sourcePath),
    target: nodeIndexByPath.get(edge.targetPath),
    occurrences: edge.occurrences,
  }));
  const coordinates = simulationNodes.map((node, index) => {
    const record = named[index];
    const crossDomainReach = neighborDomains.get(record.relativePath)?.size ?? 0;
    const degree = (incomingSources.get(record.relativePath)?.size ?? 0) + (outgoingCount.get(record.relativePath) ?? 0);
    const relief = Math.min(170, crossDomainReach * 34 + Math.log1p(degree) * 14);
    const signed = Number.parseInt(sha256(node.id).slice(0, 2), 16) % 2 ? 1 : -1;
    return [round(node.x), round(relief * signed * 0.55), round(node.z)];
  });
  const strings = [];
  const stringIndex = new Map();
  const stringId = (value) => {
    if (!stringIndex.has(value)) {
      stringIndex.set(value, strings.length);
      strings.push(value);
    }
    return stringIndex.get(value);
  };
  const domainModels = domains.map((domain) => {
    const indexes = named.map((record, index) => record.domain === domain ? index : -1).filter((index) => index >= 0);
    const domainEdges = edgeModels.filter((edge) => indexes.includes(edge.source) || indexes.includes(edge.target));
    return [
      stringId(stableId("d", domain, 12)),
      stringId(domain),
      indexes.length,
      domainEdges.length,
      indexes,
    ];
  });
  const domainIndex = new Map(domains.map((domain, index) => [domain, index]));
  const kindIndex = new Map(kinds.map((kind, index) => [kind, index]));
  const ranked = named.map((record, index) => {
    const gravity = incomingSources.get(record.relativePath)?.size ?? 0;
    const occurrences = incomingOccurrences.get(record.relativePath) ?? 0;
    const reach = neighborDomains.get(record.relativePath)?.size ?? 0;
    return {
      index,
      score: reach * 10000 + gravity * 100 + occurrences,
      id: nodeIds[index],
    };
  }).sort((left, right) => right.score - left.score || compareText(left.id, right.id));
  const priorityRank = new Map(ranked.map((item, index) => [item.index, index]));
  const nodes = named.map((record, index) => {
    const gravity = incomingSources.get(record.relativePath)?.size ?? 0;
    const occurrences = incomingOccurrences.get(record.relativePath) ?? 0;
    const reach = neighborDomains.get(record.relativePath)?.size ?? 0;
    let flags = 0;
    if (reach > 0) flags |= NODE_FLAGS.crossDomain;
    if ((priorityRank.get(index) ?? Number.MAX_SAFE_INTEGER) < domains.length) flags |= NODE_FLAGS.domainAnchor;
    if ((priorityRank.get(index) ?? Number.MAX_SAFE_INTEGER) < 24) flags |= NODE_FLAGS.protagonistCandidate;
    const labelPriority = Math.max(0, 1000 - (priorityRank.get(index) ?? 1000));
    const zoomRank = labelPriority >= 980 ? 0 : labelPriority >= 900 ? 1 : labelPriority >= 700 ? 2 : 3;
    return [
      stringId(nodeIds[index]),
      stringId(record.displayTitle),
      kindIndex.get(record.kind),
      domainIndex.get(record.domain),
      gravity,
      occurrences,
      coordinates[index][0],
      coordinates[index][1],
      coordinates[index][2],
      zoomRank,
      labelPriority,
      flags,
    ];
  });
  const edges = edgeModels.map((edge) => [
    stringId(edge.id),
    edge.source,
    edge.target,
    edge.occurrences,
  ]);
  const indexesForDomains = (selected) => named
    .map((record, index) => selected.includes(record.domain) ? index : -1)
    .filter((index) => index >= 0);
  const cameras = {
    wholeVault: cameraBookmark(coordinates, named.map((_, index) => index), "wholeVault"),
    knowledgeCore: cameraBookmark(coordinates, indexesForDomains(["MOC", "Papers", "Signals"]), "knowledgeCore"),
    projectFrontiers: cameraBookmark(
      coordinates,
      indexesForDomains(["Rocket", "Groot", "Intelligence Layer"]),
      "projectFrontiers",
    ),
    agentStewardship: cameraBookmark(coordinates, named.map((_, index) => index), "agentStewardship"),
  };
  const semanticProjection = {
    profile,
    domains: domainModels.map((domain) => domain.slice(0, 4)),
    kinds,
    nodes: nodes.map((node) => node.slice(0, 6)),
    edges: edges.map((edge) => edge.slice(1)),
  };
  const layoutProjection = { coordinates, cameras, algorithm: GRAPH_V2_LAYOUT.algorithm, seed: GRAPH_V2_LAYOUT.seed };
  const base = {
    schema: "atlas.graph.v2",
    profile,
    generatedAt,
    strings,
    kinds,
    domains: domainModels,
    nodes,
    edges,
    layout: {
      algorithm: GRAPH_V2_LAYOUT.algorithm,
      seed: GRAPH_V2_LAYOUT.seed,
      axes: {
        position: "resolved_reference_topology_and_domain_structure",
        yRelief: "cross_domain_topology",
        dateAxis: false,
      },
      bounds: GRAPH_V2_LAYOUT.bounds,
      cameras,
      labelBudget: { desktop: 20, compact: 14, mobile: 8 },
    },
    manifest: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      domainCount: domainModels.length,
      namedCount: nodes.length,
      semanticDigest: graphDigest(semanticProjection),
      layoutDigest: graphDigest(layoutProjection),
      projectionDigest: null,
    },
  };
  base.manifest.projectionDigest = graphDigest({
    ...base,
    manifest: { ...base.manifest, projectionDigest: undefined },
  });
  return base;
}

export function verifyAtlasGraphV2(graph) {
  const failures = [];
  if (graph?.schema !== "atlas.graph.v2") failures.push("schema");
  if (!["atlas-public", "atlas-owner"].includes(graph?.profile)) failures.push("profile");
  if (!Array.isArray(graph?.strings) || new Set(graph.strings).size !== graph.strings.length) failures.push("strings");
  if (!Array.isArray(graph?.nodes) || graph.nodes.some((node) => node.length !== 12)) failures.push("nodes");
  if (!Array.isArray(graph?.edges) || graph.edges.some((edge) => edge.length !== 4)) failures.push("edges");
  const nodeCount = graph?.nodes?.length ?? 0;
  if (graph?.edges?.some((edge) => edge[1] < 0 || edge[2] < 0
    || edge[1] >= nodeCount || edge[2] >= nodeCount || edge[3] <= 0)) failures.push("edge-truth");
  if (graph?.nodes?.some((node) => ![node[6], node[7], node[8]].every(Number.isFinite))) failures.push("coordinates");
  if (graph?.layout?.axes?.dateAxis !== false) failures.push("date-axis");
  if (graph?.manifest?.nodeCount !== nodeCount || graph?.manifest?.edgeCount !== graph?.edges?.length) {
    failures.push("manifest-counts");
  }
  const projectionDigest = graphDigest({
    ...graph,
    manifest: { ...graph.manifest, projectionDigest: undefined },
  });
  if (graph?.manifest?.projectionDigest !== projectionDigest) failures.push("projection-digest");
  return [...new Set(failures)];
}
