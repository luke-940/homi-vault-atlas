import type {
  AtlasAgencyV1,
  AtlasGraphModel,
  AtlasInventoryV1,
  AtlasKnowledgeV1,
  AtlasRuntime,
  GraphDomain,
  GraphEdge,
  GraphNode,
  RawAtlasGraphV2,
  RawAtlasKnowledgeV1,
} from "./contracts";

export const DOMAIN_COLORS: Record<string, string> = {
  MOC: "#e59a70",
  Papers: "#91bdd9",
  Signals: "#e3be73",
  Rocket: "#ee9b94",
  Groot: "#a9deb7",
  "Intelligence Layer": "#c8b0ef",
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

function assertKnowledge(
  value: unknown,
  graphProjectionDigest: string,
): asserts value is RawAtlasKnowledgeV1 {
  const knowledge = value as Partial<RawAtlasKnowledgeV1> | null;
  if (!knowledge
    || knowledge.schema !== "atlas.knowledge.v1"
    || knowledge.encoding !== "string_table_v1") {
    throw new Error("Atlas knowledge index v1 is missing.");
  }
  if (!Array.isArray(knowledge.dossiers)
    || !Array.isArray(knowledge.strings)) {
    throw new Error("Atlas knowledge index arrays are malformed.");
  }
  if (knowledge.graphProjectionDigest !== graphProjectionDigest) {
    throw new Error("Atlas knowledge index is not bound to the active graph.");
  }
  if (knowledge.manifest?.dossierCount !== knowledge.dossiers.length
    || knowledge.manifest?.documentCount !== knowledge.dossiers.length
    || knowledge.manifest?.unclassifiedSectionCount !== 0) {
    throw new Error("Atlas knowledge index manifest does not reconcile.");
  }
  const dossierIds = knowledge.dossiers.map((entry) => knowledge.strings?.[entry[0]]);
  if (dossierIds.some((nodeId) => !nodeId)
    || new Set(dossierIds).size !== dossierIds.length) {
    throw new Error("Atlas knowledge dossier index does not reconcile.");
  }
}

function decodeKnowledge(raw: RawAtlasKnowledgeV1): AtlasKnowledgeV1 {
  const dossiers = raw.dossiers.map((entry) => {
    const jsonSha256 = raw.strings[entry[5]];
    const token = jsonSha256.slice(0, 20);
    return {
      nodeId: raw.strings[entry[0]],
      title: raw.strings[entry[1]],
      domain: raw.strings[entry[2]],
      kind: raw.strings[entry[3]] as AtlasKnowledgeV1["dossiers"][number]["kind"],
      readerSummary: raw.strings[entry[4]],
      shardPath: `data/knowledge-shards/${token}.js`,
      shardJsonSha256: jsonSha256,
      shardJavascriptSha256: raw.strings[entry[6]],
      shardBytes: entry[7],
      publishedSectionCount: entry[8],
      omittedSectionCount: entry[9],
    };
  });
  return {
    schema: raw.schema,
    generatedAt: raw.generatedAt,
    graphProjectionDigest: raw.graphProjectionDigest,
    releaseEligible: raw.releaseEligible,
    dossiers,
    search: {
      path: `data/search.${raw.search.token}.json`,
      javascriptPath: `data/search.${raw.search.token}.js`,
      jsonSha256: raw.search.jsonSha256,
      javascriptSha256: raw.search.javascriptSha256,
      bytes: raw.search.bytes,
    },
    manifest: raw.manifest,
  };
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
  const folders = raw.structure.folders.map((folder, index) => ({
    index,
    id: raw.strings[folder[0]],
    label: raw.strings[folder[1]],
    parentIndex: folder[2],
    domainIndex: folder[3],
    depth: folder[4],
    nodeIndexes: folder[5],
    childIndexes: [] as number[],
    subtreeNodeCount: folder[5].length,
  }));
  for (const folder of folders) {
    if (folder.parentIndex >= 0) folders[folder.parentIndex]?.childIndexes.push(folder.index);
  }
  for (let index = folders.length - 1; index >= 0; index -= 1) {
    const folder = folders[index];
    if (folder.parentIndex >= 0) {
      folders[folder.parentIndex].subtreeNodeCount += folder.subtreeNodeCount;
    }
  }
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
    directory: {
      rootLabel: raw.strings[raw.structure.rootLabel],
      folders,
      rootIndexes: folders.filter((folder) => folder.parentIndex < 0).map((folder) => folder.index),
      omitted: raw.structure.omitted.map((item) => ({
        reason: raw.strings[item[0]],
        count: item[1],
      })),
      manifest: raw.structure.manifest,
    },
    cameras: raw.layout.cameras,
    bounds: raw.layout.bounds,
    manifest: raw.manifest,
  };
}

export function loadAtlasRuntime(): AtlasRuntime {
  const packs = window.__HOMI_ATLAS_V7_PACKS__;
  if (!packs) throw new Error("Atlas data packs are missing.");
  assertInventory(packs.inventory);
  const graph = decodeGraph(packs.graph);
  assertKnowledge(packs.knowledge, graph.manifest.projectionDigest);
  const knowledge = decodeKnowledge(packs.knowledge);
  const agency = (packs.agency as AtlasAgencyV1 | undefined) ?? null;
  if (agency && agency.schema !== "atlas.agency.v1") {
    throw new Error("Atlas agency pack is malformed.");
  }
  return {
    graph,
    inventory: packs.inventory,
    agency,
    knowledge,
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
