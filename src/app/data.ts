import type {
  AtlasAgencyV1,
  AtlasGraphModel,
  AtlasInventoryV1,
  AtlasRuntime,
  GraphDomain,
  GraphEdge,
  GraphNode,
  RawAtlasGraphV2,
} from "./contracts";

export const DOMAIN_COLORS: Record<string, string> = {
  MOC: "#e59a70",
  Papers: "#91bdd9",
  Signals: "#e3be73",
  Rocket: "#cf8580",
  Groot: "#92bea0",
  "Intelligence Layer": "#b29acc",
  Strategy: "#c1aa7d",
  Research: "#9ba9af",
};

function assertGraph(value: unknown): asserts value is RawAtlasGraphV2 {
  const graph = value as Partial<RawAtlasGraphV2> | null;
  if (!graph || graph.schema !== "atlas.graph.v2") {
    throw new Error("Atlas graph v2 is missing.");
  }
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges) || !Array.isArray(graph.strings)) {
    throw new Error("Atlas graph v2 arrays are malformed.");
  }
  if (graph.manifest?.nodeCount !== graph.nodes.length || graph.manifest?.edgeCount !== graph.edges.length) {
    throw new Error("Atlas graph v2 manifest does not match its arrays.");
  }
}

function assertInventory(value: unknown): asserts value is AtlasInventoryV1 {
  const inventory = value as Partial<AtlasInventoryV1> | null;
  if (!inventory || inventory.schema !== "atlas.inventory.v1") {
    throw new Error("Atlas inventory v1 is missing.");
  }
  if (!inventory.reconciliation?.pass || inventory.unclassifiedCount !== 0) {
    throw new Error("Atlas inventory is not reconciled.");
  }
}

export function decodeGraph(rawValue: unknown): AtlasGraphModel {
  assertGraph(rawValue);
  const raw = rawValue;
  const domains: GraphDomain[] = raw.domains.map((domain) => ({
    id: raw.strings[domain[0]],
    label: raw.strings[domain[1]],
    nodeCount: domain[2],
    edgeCount: domain[3],
    nodeIndexes: domain[4],
    color: DOMAIN_COLORS[raw.strings[domain[1]]] ?? "#90989b",
  }));
  const nodes: GraphNode[] = raw.nodes.map((node, index) => ({
    index,
    id: raw.strings[node[0]],
    label: raw.strings[node[1]],
    kind: raw.kinds[node[2]],
    domainIndex: node[3],
    domain: domains[node[3]]?.label ?? "Unknown",
    gravity: node[4],
    occurrences: node[5],
    position: [node[6], node[7], node[8]],
    zoomRank: node[9],
    labelPriority: node[10],
    flags: node[11],
    incoming: [],
    outgoing: [],
  }));
  const edges: GraphEdge[] = raw.edges.map((edge, index) => ({
    index,
    id: raw.strings[edge[0]],
    source: edge[1],
    target: edge[2],
    occurrences: edge[3],
  }));
  for (const edge of edges) {
    nodes[edge.source]?.outgoing.push(edge.index);
    nodes[edge.target]?.incoming.push(edge.index);
  }
  for (const node of nodes) {
    node.incoming.sort((left, right) => edges[right].occurrences - edges[left].occurrences);
    node.outgoing.sort((left, right) => edges[right].occurrences - edges[left].occurrences);
  }
  return {
    profile: raw.profile,
    generatedAt: raw.generatedAt,
    nodes,
    edges,
    domains,
    nodeById: new Map(nodes.map((node) => [node.id, node])),
    edgeById: new Map(edges.map((edge) => [edge.id, edge])),
    cameras: raw.layout.cameras,
    bounds: raw.layout.bounds,
    manifest: raw.manifest,
  };
}

export function loadAtlasRuntime(): AtlasRuntime {
  const packs = window.__HOMI_ATLAS_V7_PACKS__;
  if (!packs) throw new Error("Atlas data packs are missing.");
  assertInventory(packs.inventory);
  const agency = (packs.agency as AtlasAgencyV1 | undefined) ?? null;
  if (agency && agency.schema !== "atlas.agency.v1") {
    throw new Error("Atlas agency pack is malformed.");
  }
  return {
    graph: decodeGraph(packs.graph),
    inventory: packs.inventory,
    agency,
  };
}

export function strongestNodeByDomain(graph: AtlasGraphModel) {
  return new Map(graph.domains.map((domain) => {
    const candidates = domain.nodeIndexes
      .map((index) => graph.nodes[index])
      .sort((left, right) => right.gravity - left.gravity
        || right.occurrences - left.occurrences
        || left.label.localeCompare(right.label, "ko"));
    return [domain.label, candidates[0] ?? null] as const;
  }));
}

export function relationSummary(graph: AtlasGraphModel, node: GraphNode) {
  const incoming = node.incoming.slice(0, 6).map((index) => {
    const edge = graph.edges[index];
    return { edge, node: graph.nodes[edge.source], direction: "incoming" as const };
  });
  const outgoing = node.outgoing.slice(0, 6).map((index) => {
    const edge = graph.edges[index];
    return { edge, node: graph.nodes[edge.target], direction: "outgoing" as const };
  });
  return {
    incoming,
    outgoing,
    hiddenIncoming: Math.max(0, node.incoming.length - incoming.length),
    hiddenOutgoing: Math.max(0, node.outgoing.length - outgoing.length),
  };
}

export function directedShortestPath(graph: AtlasGraphModel, sourceId: string, targetId: string) {
  const source = graph.nodeById.get(sourceId);
  const target = graph.nodeById.get(targetId);
  if (!source || !target) return [];
  const queue = [source.index];
  const visited = new Set([source.index]);
  const previous = new Map<number, { node: number; edge: number }>();
  while (queue.length) {
    const current = queue.shift()!;
    if (current === target.index) break;
    const outgoing = graph.nodes[current].outgoing
      .map((edgeIndex) => graph.edges[edgeIndex])
      .sort((left, right) => right.occurrences - left.occurrences || left.id.localeCompare(right.id, "en"));
    for (const edge of outgoing) {
      if (visited.has(edge.target)) continue;
      visited.add(edge.target);
      previous.set(edge.target, { node: current, edge: edge.index });
      queue.push(edge.target);
    }
  }
  if (!visited.has(target.index)) return [];
  const path: GraphEdge[] = [];
  let cursor = target.index;
  while (cursor !== source.index) {
    const step = previous.get(cursor);
    if (!step) return [];
    path.push(graph.edges[step.edge]);
    cursor = step.node;
  }
  return path.reverse();
}
