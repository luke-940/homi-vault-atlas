import { createHash } from "node:crypto";
import { contours } from "d3-contour";
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
} from "d3-force";
import { stableJson } from "./data-model.mjs";

/**
 * @typedef {import("d3-force").SimulationNodeDatum & {
 *   id: string,
 *   kind: string,
 *   label: string,
 *   parentId: string | null,
 *   districtId: string,
 *   clusterId: string,
 *   nameMode: string,
 *   representedDocuments: number,
 *   gravity: number,
 *   occurrences: number,
 *   freshness: string | null,
 *   targetX: number,
 *   targetY: number,
 *   radius: number,
 * }} GraphSimulationNode
 */

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const compareText = (left, right) => String(left).localeCompare(String(right), "en");
const round = (value, digits = 2) => Number(value.toFixed(digits));

export const GRAPH_LAYOUT = Object.freeze({
  width: 1200,
  height: 720,
  paddingX: 72,
  paddingTop: 72,
  paddingBottom: 108,
  undatedRailY: 664,
  depth: 640,
  seed: "homi-vault-atlas-v7.5-layout-01",
  ticks: 420,
});

const DEPTH_BY_KIND = Object.freeze({
  district: { level: 0, z: 64 },
  moc_hub: { level: 1, z: 176 },
  paper_gateway: { level: 2, z: 288 },
  strategy_insight: { level: 2, z: 300 },
  strategy_request: { level: 2, z: 312 },
  project: { level: 2, z: 284 },
  project_stage: { level: 3, z: 400 },
  signal_domain: { level: 2, z: 296 },
  signal_storyline: { level: 3, z: 408 },
  aggregate_boundary: { level: 3, z: 424 },
  source_document: { level: 4, z: 548 },
});

const DEPTH_BANDS = Object.freeze({
  0: { min: 64, max: 64 },
  1: { min: 128, max: 224 },
  2: { min: 242, max: 344 },
  3: { min: 362, max: 466 },
  4: { min: 492, max: 604 },
});

function structuralDepth(kind, random) {
  const base = DEPTH_BY_KIND[kind] ?? DEPTH_BY_KIND.source_document;
  const jitter = base.level === 0 ? 0 : (random() - 0.5) * 54;
  return {
    depthLevel: base.level,
    z: round(Math.max(0, Math.min(GRAPH_LAYOUT.depth, base.z + jitter))),
  };
}

function spatialClearance(left, right) {
  return Math.min(74, left.radius + right.radius + 10);
}

function resolveSpatialOverlaps(coordinates, nodes, clusterCount, priorityIds) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const groups = new Map();
  for (const coordinate of coordinates) {
    const node = nodeById.get(coordinate.id);
    if (!node) continue;
    const group = groups.get(node.clusterId) ?? [];
    group.push(coordinate);
    groups.set(node.clusterId, group);
  }
  const span = GRAPH_LAYOUT.width - 2 * GRAPH_LAYOUT.paddingX;
  const cellWidth = span / Math.max(1, clusterCount - 1);
  const halfBand = clusterCount <= 1 ? span / 2 : Math.max(54, cellWidth * 0.42);
  const clampCoordinate = (coordinate) => {
    const anchorX = clusterCount <= 1
      ? GRAPH_LAYOUT.width / 2
      : GRAPH_LAYOUT.paddingX + (coordinate.clusterIndex / (clusterCount - 1)) * span;
    const depthBand = DEPTH_BANDS[coordinate.depthLevel] ?? DEPTH_BANDS[4];
    coordinate.x = Math.max(
      GRAPH_LAYOUT.paddingX,
      Math.min(
        GRAPH_LAYOUT.width - GRAPH_LAYOUT.paddingX,
        Math.max(anchorX - halfBand, Math.min(anchorX + halfBand, coordinate.x)),
      ),
    );
    coordinate.z = Math.max(depthBand.min, Math.min(depthBand.max, coordinate.z));
  };

  const relax = (groupMap, iterations) => {
    for (const members of groupMap.values()) members.sort((left, right) => compareText(left.id, right.id));
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      let adjusted = false;
      for (const members of groupMap.values()) {
        for (let leftIndex = 0; leftIndex < members.length; leftIndex += 1) {
          for (let rightIndex = leftIndex + 1; rightIndex < members.length; rightIndex += 1) {
            const left = members[leftIndex];
            const right = members[rightIndex];
            const dx = left.x - right.x;
            const dy = left.y - right.y;
            const dz = left.z - right.z;
            const distance = Math.hypot(dx, dy, dz);
            const target = spatialClearance(left, right);
            if (distance >= target - 0.05) continue;
            const leftPinned = nodeById.get(left.id)?.kind === "district";
            const rightPinned = nodeById.get(right.id)?.kind === "district";
            if (leftPinned && rightPinned) continue;
            const planarDistance = Math.hypot(dx, dz);
            const fallbackAngle = Number.parseInt(sha256(`${left.id}\0${right.id}`).slice(0, 8), 16) / 0xffffffff * Math.PI * 2;
            const unitX = planarDistance > 0.01 ? dx / planarDistance : Math.cos(fallbackAngle);
            const unitZ = planarDistance > 0.01 ? dz / planarDistance : Math.sin(fallbackAngle);
            const displacement = (target - distance) * 0.58;
            const leftShare = leftPinned ? 0 : rightPinned ? 1 : 0.5;
            const rightShare = rightPinned ? 0 : leftPinned ? 1 : 0.5;
            left.x += unitX * displacement * leftShare;
            left.z += unitZ * displacement * leftShare;
            right.x -= unitX * displacement * rightShare;
            right.z -= unitZ * displacement * rightShare;
            clampCoordinate(left);
            clampCoordinate(right);
            adjusted = true;
          }
        }
      }
      if (!adjusted) break;
    }
  };

  relax(groups, 24);
  const priorityGroups = new Map();
  for (const [id, members] of groups) {
    const priorityMembers = members.filter((coordinate) => priorityIds.has(coordinate.id));
    if (priorityMembers.length > 1) priorityGroups.set(id, priorityMembers);
  }
  relax(priorityGroups, 72);
  return coordinates.map((coordinate) => ({
    ...coordinate,
    x: round(coordinate.x),
    z: round(coordinate.z),
  }));
}

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

function isoDateValue(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function sizeForGravity(gravity, maximum) {
  if (maximum <= 0) return 5;
  return round(5 + 27 * Math.sqrt(Math.max(0, gravity) / maximum));
}

function meaningfulY(freshness, dateRank, dateCount) {
  const value = isoDateValue(freshness);
  if (value === null) return GRAPH_LAYOUT.undatedRailY;
  if (dateCount <= 1) return (GRAPH_LAYOUT.paddingTop + GRAPH_LAYOUT.height - GRAPH_LAYOUT.paddingBottom) / 2;
  const ratio = (dateRank.get(value) ?? 0) / (dateCount - 1);
  return round((GRAPH_LAYOUT.height - GRAPH_LAYOUT.paddingBottom) - ratio
    * (GRAPH_LAYOUT.height - GRAPH_LAYOUT.paddingBottom - GRAPH_LAYOUT.paddingTop));
}

function selectDefaultNodeIds(nodes, clusters, profile) {
  if (profile === "atlas-public" && nodes.length <= 60) return new Set(nodes.map((node) => node.id));
  const selected = [];
  for (const cluster of clusters) {
    const members = nodes
      .filter((node) => node.clusterId === cluster.id && node.kind !== "source_document")
      .sort((left, right) => right.gravity - left.gravity
        || right.occurrences - left.occurrences
        || compareText(left.id, right.id));
    const budget = Math.min(12, Math.max(2, Math.ceil(Math.sqrt(Math.max(1, members.length)))));
    selected.push(...members.slice(0, budget));
  }
  return new Set(selected
    .sort((left, right) => right.gravity - left.gravity || compareText(left.id, right.id))
    .slice(0, 60)
    .map((node) => node.id));
}

function markDefaultEdges(edges, nodeById, defaultNodeIds) {
  const eligible = edges.filter((edge) => defaultNodeIds.has(edge.source) && defaultNodeIds.has(edge.target));
  if (eligible.length <= 48) return new Set(eligible.map((edge) => edge.id));
  const chosen = new Map();
  const strongestBySource = new Map();
  const strongestByClusterPair = new Map();
  const edgeRank = (left, right) => right.occurrenceCount - left.occurrenceCount || compareText(left.id, right.id);
  for (const edge of eligible) {
    const sourceBest = strongestBySource.get(edge.source);
    if (!sourceBest || edgeRank(edge, sourceBest) < 0) strongestBySource.set(edge.source, edge);
    const sourceCluster = nodeById.get(edge.source)?.clusterId;
    const targetCluster = nodeById.get(edge.target)?.clusterId;
    if (sourceCluster && targetCluster && sourceCluster !== targetCluster) {
      const pair = [sourceCluster, targetCluster].sort(compareText).join("|");
      const pairBest = strongestByClusterPair.get(pair);
      if (!pairBest || edgeRank(edge, pairBest) < 0) strongestByClusterPair.set(pair, edge);
    }
  }
  for (const edge of [...strongestByClusterPair.values(), ...strongestBySource.values()].sort(edgeRank)) {
    if (chosen.size >= 48) break;
    chosen.set(edge.id, edge);
  }
  for (const edge of eligible.sort(edgeRank)) {
    if (chosen.size >= 48) break;
    chosen.set(edge.id, edge);
  }
  return new Set(chosen.keys());
}

function contourForCluster(clusterNodes) {
  const gridWidth = 48;
  const gridHeight = 30;
  const values = new Array(gridWidth * gridHeight).fill(0);
  for (let gy = 0; gy < gridHeight; gy += 1) {
    for (let gx = 0; gx < gridWidth; gx += 1) {
      const x = (gx / (gridWidth - 1)) * GRAPH_LAYOUT.width;
      const y = (gy / (gridHeight - 1)) * GRAPH_LAYOUT.height;
      values[gy * gridWidth + gx] = clusterNodes.reduce((sum, node) => {
        const dx = x - node.x;
        const dy = y - node.y;
        const spread = Math.max(44, node.radius * 3.4);
        return sum + Math.exp(-(dx * dx + dy * dy) / (2 * spread * spread));
      }, 0);
    }
  }
  const maximum = Math.max(...values);
  if (!(maximum > 0)) return { type: "MultiPolygon", coordinates: [] };
  const geometry = contours().size([gridWidth, gridHeight]).thresholds([maximum * 0.16])(values)[0];
  const coordinates = geometry?.coordinates?.map((polygon) => polygon.map((ring) => ring.map(([x, y]) => [
    round((x / (gridWidth - 1)) * GRAPH_LAYOUT.width),
    round((y / (gridHeight - 1)) * GRAPH_LAYOUT.height),
  ]))) ?? [];
  return { type: "MultiPolygon", coordinates };
}

function graphDigest(value) {
  return sha256(stableJson(value));
}

export function buildAtlasGraphV1(structure, { profile = structure.profile } = {}) {
  if (structure?.schema !== "atlas.structure.v2") {
    throw new Error("Graph projection blocked: atlas.structure.v2 source is required at the build boundary.");
  }
  const sourceNodes = [...structure.nodes].sort((left, right) => compareText(left.id, right.id));
  const districtNodes = sourceNodes.filter((node) => node.kind === "district");
  const districtById = new Map(districtNodes.map((node) => [node.id, node]));
  const rankedClusterIds = districtNodes.map((node) => node.id).sort((leftId, rightId) => {
    const strongest = (districtId) => Math.max(0, ...sourceNodes
      .filter((node) => (node.kind === "district" ? node.id : node.districtId) === districtId)
      .map((node) => node.uniqueInboundDocuments));
    return strongest(rightId) - strongest(leftId) || compareText(leftId, rightId);
  });
  const clusterIds = new Array(rankedClusterIds.length);
  const center = Math.floor((rankedClusterIds.length - 1) / 2);
  const slots = [center];
  for (let offset = 1; slots.length < rankedClusterIds.length; offset += 1) {
    if (center - offset >= 0) slots.push(center - offset);
    if (center + offset < rankedClusterIds.length) slots.push(center + offset);
  }
  rankedClusterIds.forEach((id, index) => { clusterIds[slots[index]] = id; });
  const clusterIndex = new Map(clusterIds.map((id, index) => [id, index]));
  const maximumGravity = Math.max(1, ...sourceNodes.map((node) => node.uniqueInboundDocuments));
  const dateValues = [...new Set(sourceNodes.map((node) => isoDateValue(node.lastMeaningfulDate)).filter((value) => value !== null))]
    .sort((left, right) => left - right);
  const dateRank = new Map(dateValues.map((value, index) => [value, index]));
  const random = seededRandom(`${GRAPH_LAYOUT.seed}:${profile}:${graphDigest(sourceNodes)}`);
  const span = GRAPH_LAYOUT.width - 2 * GRAPH_LAYOUT.paddingX;

  /** @type {GraphSimulationNode[]} */
  const nodes = sourceNodes.map((source) => {
    const clusterId = source.kind === "district" ? source.id : source.districtId;
    const index = clusterIndex.get(clusterId) ?? 0;
    const anchorX = clusterIds.length <= 1
      ? GRAPH_LAYOUT.width / 2
      : GRAPH_LAYOUT.paddingX + (index / (clusterIds.length - 1)) * span;
    const targetY = meaningfulY(source.lastMeaningfulDate, dateRank, dateValues.length);
    const radius = sizeForGravity(source.uniqueInboundDocuments, maximumGravity);
    return {
      id: source.id,
      kind: source.kind,
      label: source.label,
      parentId: source.parentId,
      districtId: clusterId,
      clusterId,
      nameMode: source.nameMode,
      representedDocuments: source.documentCount,
      gravity: source.uniqueInboundDocuments,
      occurrences: source.inboundLinkOccurrences,
      freshness: source.lastMeaningfulDate,
      x: anchorX + (random() - 0.5) * 42,
      y: targetY + (random() - 0.5) * 30,
      targetX: anchorX,
      targetY,
      radius,
    };
  });
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges = structure.associations
    .filter((edge) => edge.kind === "references" && edge.weight > 0
      && nodeById.has(edge.source) && nodeById.has(edge.target))
    .map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      kind: "references",
      direction: "forward",
      occurrenceCount: edge.weight,
      defaultVisible: false,
    }))
    .sort((left, right) => compareText(left.id, right.id));
  const simulationLinks = edges.map((edge) => ({ source: edge.source, target: edge.target }));
  const simulation = forceSimulation(nodes)
    .randomSource(random)
    .alpha(1)
    .alphaDecay(1 - Math.pow(0.001, 1 / GRAPH_LAYOUT.ticks))
    .velocityDecay(0.34)
    .force("x", forceX(/** @param {GraphSimulationNode} node */ (node) => node.targetX).strength(0.2))
    .force("y", forceY(/** @param {GraphSimulationNode} node */ (node) => node.targetY)
      .strength(/** @param {GraphSimulationNode} node */ (node) => node.freshness ? 0.075 : 0.11))
    .force("charge", forceManyBody().strength(/** @param {GraphSimulationNode} node */ (node) => -12 - node.radius * 0.9))
    .force("collision", forceCollide(/** @param {GraphSimulationNode} node */ (node) => node.radius + 5).iterations(7))
    .force("link", forceLink(simulationLinks).id(/** @param {GraphSimulationNode} node */ (node) => node.id).distance(82).strength(0.012))
    .stop();
  for (let tick = 0; tick < GRAPH_LAYOUT.ticks; tick += 1) simulation.tick();

  const publicNodes = nodes.map((node) => ({
    id: node.id,
    kind: node.kind,
    label: node.label,
    parentId: node.parentId,
    districtId: node.districtId,
    clusterId: node.clusterId,
    nameMode: node.nameMode,
    representedDocuments: node.representedDocuments,
    gravity: node.gravity,
    occurrences: node.occurrences,
    freshness: node.freshness,
  }));
  const preliminaryClusters = clusterIds.map((id) => {
    const district = districtById.get(id);
    const members = publicNodes.filter((node) => node.clusterId === id);
    return {
      id,
      districtId: id,
      label: district?.label ?? id,
      nodeCount: members.length,
      representedDocumentCount: members.reduce((sum, node) => sum + (node.kind === "district" ? 0 : node.representedDocuments), 0),
      representativeNodeCount: 0,
      summary: null,
      contour: { type: "MultiPolygon", coordinates: [] },
    };
  });
  const defaultNodeIds = selectDefaultNodeIds(publicNodes, preliminaryClusters, profile);

  const rawCoordinates = nodes.map((node) => {
    const index = clusterIndex.get(node.clusterId) ?? 0;
    const cellWidth = span / Math.max(1, clusterIds.length - 1);
    const halfBand = clusterIds.length <= 1 ? span / 2 : Math.max(54, cellWidth * 0.42);
    const x = node.kind === "district"
      ? node.targetX
      : Math.max(GRAPH_LAYOUT.paddingX, Math.min(GRAPH_LAYOUT.width - GRAPH_LAYOUT.paddingX,
        Math.max(node.targetX - halfBand, Math.min(node.targetX + halfBand, node.x))));
    const y = node.freshness
      ? Math.max(GRAPH_LAYOUT.paddingTop, Math.min(GRAPH_LAYOUT.height - GRAPH_LAYOUT.paddingBottom, node.y))
      : GRAPH_LAYOUT.undatedRailY;
    const depth = structuralDepth(node.kind, random);
    return {
      id: node.id,
      x: round(x),
      y: round(y),
      z: depth.z,
      depthLevel: depth.depthLevel,
      radius: node.radius,
      dated: Boolean(node.freshness),
      clusterIndex: index,
    };
  });
  const coordinates = resolveSpatialOverlaps(rawCoordinates, nodes, clusterIds.length, defaultNodeIds)
    .sort((left, right) => compareText(left.id, right.id));
  const coordinateById = new Map(coordinates.map((coordinate) => [coordinate.id, coordinate]));
  const defaultEdgeIds = markDefaultEdges(edges, nodeById, defaultNodeIds);
  for (const edge of edges) edge.defaultVisible = defaultEdgeIds.has(edge.id);
  const clusters = preliminaryClusters.map((cluster) => {
    const members = coordinates.filter((coordinate) => nodeById.get(coordinate.id)?.clusterId === cluster.id);
    return {
      ...cluster,
      representativeNodeCount: members.filter((coordinate) => defaultNodeIds.has(coordinate.id)).length,
      contour: contourForCluster(members),
    };
  });
  const sortedNodes = publicNodes.sort((left, right) => compareText(left.id, right.id));
  const semanticProjection = {
    profile,
    nodes: sortedNodes,
    edges: edges.map(({ defaultVisible, ...edge }) => edge),
    clusters: clusters.map(({ contour, ...cluster }) => cluster),
  };
  const layout = {
    algorithm: "seeded-d3-force-projected-3d-v1",
    seed: GRAPH_LAYOUT.seed,
    ticks: GRAPH_LAYOUT.ticks,
    axes: {
      x: { field: "districtId", kind: "categorical_cluster", direction: "left_to_right" },
      y: { field: "freshness", kind: "semantic_date", direction: "newer_is_higher", scale: "order_preserving_rank" },
      z: { field: "kind", kind: "structural_depth", direction: "district_to_source" },
    },
    bounds: { x: 0, y: 0, z: 0, width: GRAPH_LAYOUT.width, height: GRAPH_LAYOUT.height, depth: GRAPH_LAYOUT.depth },
    undatedRail: { y: GRAPH_LAYOUT.undatedRailY, label: "날짜 미기록" },
    coordinates,
    defaultNodeIds: [...defaultNodeIds].sort(compareText),
    defaultEdgeIds: [...defaultEdgeIds].sort(compareText),
    labelBudget: Math.min(18, 2 * clusters.length + 4),
  };
  const semanticDigest = graphDigest(semanticProjection);
  const layoutDigest = graphDigest({ layout, contours: clusters.map(({ id, contour }) => ({ id, contour })) });
  const base = {
    schema: "atlas.graph.v1",
    profile,
    generatedAt: structure.generatedAt,
    nodes: sortedNodes,
    edges,
    clusters,
    layout,
    manifest: {
      nodeCount: sortedNodes.length,
      edgeCount: edges.length,
      clusterCount: clusters.length,
      semanticDigest,
      layoutDigest,
      projectionDigest: null,
    },
  };
  base.manifest.projectionDigest = graphDigest({
    ...base,
    manifest: { ...base.manifest, projectionDigest: undefined },
  });
  return base;
}

export function verifyAtlasGraphV1(graph) {
  const failures = [];
  if (graph?.schema !== "atlas.graph.v1") failures.push("schema");
  const nodeIds = new Set(graph?.nodes?.map((node) => node.id) ?? []);
  const coordinateIds = new Set(graph?.layout?.coordinates?.map((node) => node.id) ?? []);
  if (nodeIds.size !== graph?.nodes?.length) failures.push("node-id-duplicate");
  if (nodeIds.size !== coordinateIds.size || [...nodeIds].some((id) => !coordinateIds.has(id))) failures.push("coordinate-coverage");
  if (graph?.edges?.some((edge) => !nodeIds.has(edge.source) || !nodeIds.has(edge.target)
    || edge.kind !== "references" || edge.direction !== "forward" || edge.occurrenceCount <= 0)) failures.push("edge-truth");
  if (graph?.layout?.coordinates?.some((node) => !Number.isFinite(node.x) || !Number.isFinite(node.y) || !Number.isFinite(node.z)
    || !Number.isInteger(node.depthLevel) || node.depthLevel < 0 || node.depthLevel > 4
    || node.x < 0 || node.y < 0 || node.z < 0
    || node.x > graph.layout.bounds.width || node.y > graph.layout.bounds.height || node.z > graph.layout.bounds.depth)) failures.push("coordinate-bounds");
  const coordinateById = new Map(graph?.layout?.coordinates?.map((coordinate) => [coordinate.id, coordinate]) ?? []);
  const districtCoordinates = (graph?.nodes ?? [])
    .filter((node) => node.kind === "district")
    .map((node) => coordinateById.get(node.id))
    .filter(Boolean);
  for (let leftIndex = 0; leftIndex < districtCoordinates.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < districtCoordinates.length; rightIndex += 1) {
      const left = districtCoordinates[leftIndex];
      const right = districtCoordinates[rightIndex];
      if (Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z) < 120) failures.push("district-anchor-spacing");
    }
  }
  if (graph?.layout?.defaultNodeIds?.length > 60) failures.push("default-node-budget");
  if (graph?.layout?.defaultEdgeIds?.length > 48) failures.push("default-edge-budget");
  const defaultCoordinates = (graph?.layout?.defaultNodeIds ?? []).map((id) => coordinateById.get(id)).filter(Boolean);
  for (let leftIndex = 0; leftIndex < defaultCoordinates.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < defaultCoordinates.length; rightIndex += 1) {
      const left = defaultCoordinates[leftIndex];
      const right = defaultCoordinates[rightIndex];
      const distance = Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
      if (distance < spatialClearance(left, right) - 0.75) failures.push("default-node-spacing");
    }
  }
  const semanticDigest = graphDigest({
    profile: graph.profile,
    nodes: graph.nodes,
    edges: graph.edges.map(({ defaultVisible, ...edge }) => edge),
    clusters: graph.clusters.map(({ contour, ...cluster }) => cluster),
  });
  const layoutDigest = graphDigest({
    layout: graph.layout,
    contours: graph.clusters.map(({ id, contour }) => ({ id, contour })),
  });
  if (graph?.manifest?.semanticDigest !== semanticDigest) failures.push("semantic-digest");
  if (graph?.manifest?.layoutDigest !== layoutDigest) failures.push("layout-digest");
  const projectionDigest = graphDigest({
    ...graph,
    manifest: { ...graph.manifest, projectionDigest: undefined },
  });
  if (graph?.manifest?.projectionDigest !== projectionDigest) failures.push("projection-digest");
  return [...new Set(failures)];
}
