import type { AtlasGraphEdgeV1, AtlasGraphV1, MatrixCell } from "../types";
import { pathEdgeIds, selectedNeighborhood, shortestDirectedPath } from "./model";

export interface RenderEdgeCommand {
  semanticKind: "district_corridor" | "exact_reference" | "directed_path";
  sourceId: string;
  targetId: string;
  weight: number;
  provenance: "atlas.graph.v1";
}

export interface InteractionContext {
  previewId: string | null;
  focusId: string | null;
  neighborhood: {
    incoming: string[];
    outgoing: string[];
  };
  hiddenIncoming: number;
  hiddenOutgoing: number;
}

interface DirectionalLane {
  sourceId: string;
  targetId: string;
  weight: number;
}

interface CorridorPair {
  key: string;
  totalWeight: number;
  lanes: DirectionalLane[];
}

function rankEdges(edges: readonly AtlasGraphEdgeV1[]) {
  return [...edges].sort((left, right) =>
    right.occurrenceCount - left.occurrenceCount || left.id.localeCompare(right.id, "en"));
}

function corridorPairs(graph: AtlasGraphV1) {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const districtByCluster = new Map(graph.nodes
    .filter((node) => node.kind === "district")
    .map((node) => [node.clusterId, node.id]));
  const laneByDirection = new Map<string, DirectionalLane>();
  for (const edge of graph.edges) {
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    if (!sourceNode || !targetNode || sourceNode.clusterId === targetNode.clusterId) continue;
    const sourceId = districtByCluster.get(sourceNode.clusterId);
    const targetId = districtByCluster.get(targetNode.clusterId);
    if (!sourceId || !targetId || sourceId === targetId) continue;
    const key = `${sourceId}\0${targetId}`;
    const prior = laneByDirection.get(key);
    laneByDirection.set(key, {
      sourceId,
      targetId,
      weight: (prior?.weight ?? 0) + edge.occurrenceCount,
    });
  }

  const pairs = new Map<string, CorridorPair>();
  for (const lane of laneByDirection.values()) {
    const key = [lane.sourceId, lane.targetId].sort((left, right) => left.localeCompare(right, "en")).join("\0");
    const pair = pairs.get(key) ?? { key, totalWeight: 0, lanes: [] };
    pair.lanes.push(lane);
    pair.totalWeight += lane.weight;
    pairs.set(key, pair);
  }
  return [...pairs.values()]
    .map((pair) => ({
      ...pair,
      lanes: pair.lanes.sort((left, right) =>
        right.weight - left.weight
        || left.sourceId.localeCompare(right.sourceId, "en")
        || left.targetId.localeCompare(right.targetId, "en")),
    }))
    .sort((left, right) => right.totalWeight - left.totalWeight || left.key.localeCompare(right.key, "en"));
}

function corridorCommands(pairs: readonly CorridorPair[]) {
  return pairs.flatMap((pair) => pair.lanes.slice(0, 2).map((lane): RenderEdgeCommand => ({
    semanticKind: "district_corridor",
    sourceId: lane.sourceId,
    targetId: lane.targetId,
    weight: lane.weight,
    provenance: "atlas.graph.v1",
  })));
}

export function defaultDistrictCorridorCommands(
  graph: AtlasGraphV1,
  _matrix: readonly MatrixCell[],
  pairLimit = 4,
) {
  return corridorCommands(corridorPairs(graph).slice(0, Math.max(0, pairLimit)));
}

export function focusedDistrictCorridorCommands(
  graph: AtlasGraphV1,
  _matrix: readonly MatrixCell[],
  districtId: string,
) {
  return corridorCommands(corridorPairs(graph).filter((pair) =>
    pair.lanes.some((lane) => lane.sourceId === districtId || lane.targetId === districtId)));
}

export function focusedReferenceCommands(graph: AtlasGraphV1, focusId: string, limit = 6) {
  const incoming = rankEdges(graph.edges.filter((edge) => edge.target === focusId));
  const outgoing = rankEdges(graph.edges.filter((edge) => edge.source === focusId));
  const commands = [...incoming.slice(0, limit), ...outgoing.slice(0, limit)]
    .filter((edge, index, list) => list.findIndex((candidate) => candidate.id === edge.id) === index)
    .map((edge): RenderEdgeCommand => ({
      semanticKind: "exact_reference",
      sourceId: edge.source,
      targetId: edge.target,
      weight: edge.occurrenceCount,
      provenance: "atlas.graph.v1",
    }));
  return {
    commands,
    hiddenIncoming: Math.max(0, incoming.length - limit),
    hiddenOutgoing: Math.max(0, outgoing.length - limit),
  };
}

export function directedPathCommands(graph: AtlasGraphV1, from: string | null, to: string | null) {
  const path = shortestDirectedPath(graph, from, to);
  const ids = pathEdgeIds(graph, path);
  return {
    path,
    commands: rankEdges(graph.edges.filter((edge) => ids.has(edge.id)))
      .sort((left, right) => path.indexOf(left.source) - path.indexOf(right.source))
      .map((edge): RenderEdgeCommand => ({
        semanticKind: "directed_path",
        sourceId: edge.source,
        targetId: edge.target,
        weight: edge.occurrenceCount,
        provenance: "atlas.graph.v1",
      })),
  };
}

export function interactionContext(graph: AtlasGraphV1, previewId: string | null, focusId: string | null, limit = 6): InteractionContext {
  const activeId = previewId ?? focusId;
  if (!activeId) {
    return {
      previewId,
      focusId,
      neighborhood: { incoming: [], outgoing: [] },
      hiddenIncoming: 0,
      hiddenOutgoing: 0,
    };
  }
  const all = selectedNeighborhood(graph, activeId);
  const incoming = all.incoming.slice(0, limit);
  const outgoing = all.outgoing.slice(0, limit);
  const fullIncomingCount = graph.edges.filter((edge) => edge.target === activeId).length;
  const fullOutgoingCount = graph.edges.filter((edge) => edge.source === activeId).length;
  return {
    previewId,
    focusId,
    neighborhood: {
      incoming: incoming.map((edge) => edge.source),
      outgoing: outgoing.map((edge) => edge.target),
    },
    hiddenIncoming: Math.max(0, fullIncomingCount - incoming.length),
    hiddenOutgoing: Math.max(0, fullOutgoingCount - outgoing.length),
  };
}

export function semanticEdgeCommands(options: {
  graph: AtlasGraphV1;
  matrix: readonly MatrixCell[];
  scene: "field" | "gravity" | "freshness" | "trace";
  focusId: string | null;
  previewId: string | null;
  from: string | null;
  to: string | null;
  presentation: "home" | "workspace";
}) {
  const activeId = options.previewId ?? options.focusId;
  const activeNode = activeId ? options.graph.nodes.find((node) => node.id === activeId) ?? null : null;
  if (options.scene === "trace") return directedPathCommands(options.graph, options.from, options.to).commands;
  if (options.scene === "freshness") return [];
  if (activeNode?.kind === "district") {
    return focusedDistrictCorridorCommands(options.graph, options.matrix, activeNode.id);
  }
  if (activeNode) return focusedReferenceCommands(options.graph, activeNode.id).commands;
  if (options.presentation === "home") return defaultDistrictCorridorCommands(options.graph, options.matrix, 4);
  return [];
}
