import type { AtlasGraphEdgeV1, AtlasGraphNodeV1, AtlasGraphV1, GraphFreshness, MatrixCell } from "../types";

export type FreshnessBucket = GraphFreshness;

export function graphNodeLabel(node: AtlasGraphNodeV1) {
  const label = node.label.replace(/\s*·\s*공개 안전 원천 집계$/, "");
  if (node.kind === "district") return `${label} 구역`;
  if (node.kind === "aggregate_boundary") return `${label} 집계`;
  return label;
}

export function freshnessMatches(node: AtlasGraphNodeV1, bucket: FreshnessBucket, asOf: string) {
  if (bucket === "all") return true;
  if (bucket === "undated") return node.freshness === null;
  if (!node.freshness) return false;
  const days = bucket === "30d" ? 30 : bucket === "90d" ? 90 : 365;
  const ceiling = Date.parse(`${asOf.slice(0, 10)}T23:59:59Z`);
  const value = Date.parse(`${node.freshness}T00:00:00Z`);
  return Number.isFinite(value) && value >= ceiling - days * 86_400_000 && value <= ceiling;
}

function rankedEdges(edges: readonly AtlasGraphEdgeV1[]) {
  return [...edges].sort((left, right) =>
    right.occurrenceCount - left.occurrenceCount || left.id.localeCompare(right.id, "en"));
}

export function connectedGraphNodeIds(graph: AtlasGraphV1) {
  return new Set(graph.edges.flatMap((edge) => [edge.source, edge.target]));
}

export function strongestConnectedNode(graph: AtlasGraphV1) {
  const connectedIds = connectedGraphNodeIds(graph);
  return [...graph.nodes]
    .filter((node) => connectedIds.has(node.id) && node.kind !== "district" && node.kind !== "aggregate_boundary")
    .sort((left, right) => right.gravity - left.gravity || right.occurrences - left.occurrences || left.id.localeCompare(right.id, "en"))[0]
    ?? graph.nodes.find((node) => connectedIds.has(node.id))
    ?? graph.nodes[0]
    ?? null;
}

export function strongestIncidentEdge(graph: AtlasGraphV1, focusId: string | null) {
  const incident = focusId
    ? graph.edges.filter((edge) => edge.source === focusId || edge.target === focusId)
    : graph.edges;
  return rankedEdges(incident)[0] ?? null;
}

export interface DistrictRelationRoute {
  id: string;
  sourceId: string;
  targetId: string;
  occurrenceCount: number;
}

export function districtRelationRoutes(graph: AtlasGraphV1, matrix: readonly MatrixCell[]) {
  const districtByLabel = new Map(graph.nodes
    .filter((node) => node.kind === "district")
    .map((node) => [node.label, node]));
  const routes: DistrictRelationRoute[] = [];
  for (const pair of matrix) {
    const source = districtByLabel.get(pair.source);
    const target = districtByLabel.get(pair.target);
    if (!source || !target) continue;
    if (pair.wikilinkForward > 0) routes.push({
      id: `${pair.id}:forward`,
      sourceId: source.id,
      targetId: target.id,
      occurrenceCount: pair.wikilinkForward,
    });
    if (pair.wikilinkReverse > 0) routes.push({
      id: `${pair.id}:reverse`,
      sourceId: target.id,
      targetId: source.id,
      occurrenceCount: pair.wikilinkReverse,
    });
  }
  return routes.sort((left, right) =>
    right.occurrenceCount - left.occurrenceCount || left.id.localeCompare(right.id, "en"));
}

export function selectedNeighborhood(graph: AtlasGraphV1, focusId: string | null) {
  if (!focusId) return { incoming: [] as AtlasGraphEdgeV1[], outgoing: [] as AtlasGraphEdgeV1[] };
  return {
    incoming: rankedEdges(graph.edges.filter((edge) => edge.target === focusId)).slice(0, 12),
    outgoing: rankedEdges(graph.edges.filter((edge) => edge.source === focusId)).slice(0, 12),
  };
}

export function shortestDirectedPath(graph: AtlasGraphV1, from: string | null, to: string | null) {
  if (!from || !to || from === to) return from && to ? [from] : [];
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  if (!nodeIds.has(from) || !nodeIds.has(to)) return [];
  const outgoing = new Map<string, AtlasGraphEdgeV1[]>();
  for (const edge of graph.edges) {
    const list = outgoing.get(edge.source) ?? [];
    list.push(edge);
    outgoing.set(edge.source, list);
  }
  for (const list of outgoing.values()) list.sort((left, right) =>
    right.occurrenceCount - left.occurrenceCount || left.target.localeCompare(right.target, "en"));

  const best = new Map<string, { distance: number; score: number; path: string[] }>();
  best.set(from, { distance: 0, score: 0, path: [from] });
  let frontier = [from];
  while (frontier.length) {
    const next = new Set<string>();
    for (const source of frontier.sort((a, b) => a.localeCompare(b, "en"))) {
      const current = best.get(source)!;
      for (const edge of outgoing.get(source) ?? []) {
        if (current.path.includes(edge.target)) continue;
        const candidate = {
          distance: current.distance + 1,
          score: current.score + edge.occurrenceCount,
          path: [...current.path, edge.target],
        };
        const prior = best.get(edge.target);
        const candidateKey = candidate.path.join("\0");
        const priorKey = prior?.path.join("\0") ?? "";
        if (!prior || candidate.distance < prior.distance
          || (candidate.distance === prior.distance && candidate.score > prior.score)
          || (candidate.distance === prior.distance && candidate.score === prior.score && candidateKey < priorKey)) {
          best.set(edge.target, candidate);
          next.add(edge.target);
        }
      }
    }
    if (best.has(to) && [...next].every((id) => (best.get(id)?.distance ?? Infinity) >= best.get(to)!.distance)) break;
    frontier = [...next];
  }
  return best.get(to)?.path ?? [];
}

export function pathEdgeIds(graph: AtlasGraphV1, path: readonly string[]) {
  const ids = new Set<string>();
  for (let index = 0; index < path.length - 1; index += 1) {
    const edge = rankedEdges(graph.edges.filter((candidate) =>
      candidate.source === path[index] && candidate.target === path[index + 1]))[0];
    if (edge) ids.add(edge.id);
  }
  return ids;
}

export function visibleGraphSelection(graph: AtlasGraphV1, options: {
  districtId: string | null;
  freshness: FreshnessBucket;
  focusId: string | null;
  mobile: boolean;
  from: string | null;
  to: string | null;
}) {
  const asOf = graph.generatedAt;
  const baseIds = new Set(graph.layout.defaultNodeIds);
  let nodes = graph.nodes.filter((node) => baseIds.has(node.id));
  if (options.districtId) nodes = nodes.filter((node) => node.clusterId === options.districtId);
  nodes = nodes.filter((node) => freshnessMatches(node, options.freshness, asOf));
  nodes.sort((left, right) => right.gravity - left.gravity || right.occurrences - left.occurrences || left.id.localeCompare(right.id, "en"));
  if (options.mobile) nodes = nodes.slice(0, 20);

  const neighborhood = selectedNeighborhood(graph, options.focusId);
  const path = shortestDirectedPath(graph, options.from, options.to);
  const disclosedSources = options.focusId
    ? graph.nodes
        .filter((node) => node.parentId === options.focusId && node.kind === "source_document")
        .sort((left, right) => right.gravity - left.gravity || left.id.localeCompare(right.id, "en"))
        .slice(0, 24)
    : [];
  const expandedIds = new Set([
    ...nodes.map((node) => node.id),
    ...(options.focusId ? [options.focusId] : []),
    ...neighborhood.incoming.flatMap((edge) => [edge.source, edge.target]),
    ...neighborhood.outgoing.flatMap((edge) => [edge.source, edge.target]),
    ...disclosedSources.map((node) => node.id),
    ...path,
  ]);
  const visibleNodes = graph.nodes.filter((node) => expandedIds.has(node.id));
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
  const pathIds = pathEdgeIds(graph, path);
  const neighborhoodIds = new Set([...neighborhood.incoming, ...neighborhood.outgoing].map((edge) => edge.id));
  const visibleEdges = graph.edges.filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)
    && (edge.defaultVisible || neighborhoodIds.has(edge.id) || pathIds.has(edge.id)));
  return { nodes: visibleNodes, edges: visibleEdges, neighborhood, path, pathIds, disclosedSources };
}
