import type {
  AtlasGraphModel,
  AtlasKnowledgeV1,
  AtlasRuntime,
  EvidenceBoundClaim,
  GraphEdge,
  GraphNode,
  KnowledgeDossier,
} from "../contracts";

export interface ObserveClaim extends EvidenceBoundClaim {
  label: string;
  category: "summary" | "insight" | "relevance" | "caveat" | "question" | "relation";
}

export function buildDomainMatrix(graph: AtlasGraphModel) {
  const matrix = Array.from(
    { length: graph.domains.length },
    () => Array(graph.domains.length).fill(0) as number[],
  );
  for (const edge of graph.edges) {
    const source = graph.nodes[edge.source];
    const target = graph.nodes[edge.target];
    matrix[source.domainIndex][target.domainIndex] += edge.occurrences;
  }
  return matrix;
}

export function strongestDomainPair(matrix: number[][]) {
  let winner: [number, number] | null = null;
  let value = -1;
  for (let source = 0; source < matrix.length; source += 1) {
    for (let target = 0; target < matrix[source].length; target += 1) {
      if (source !== target && matrix[source][target] > value) {
        winner = [source, target];
        value = matrix[source][target];
      }
    }
  }
  return winner;
}

export function domainPairEdges(
  graph: AtlasGraphModel,
  pair: [number, number] | null,
  limit = 8,
) {
  if (!pair) return [];
  return graph.edges
    .filter((edge) => graph.nodes[edge.source].domainIndex === pair[0]
      && graph.nodes[edge.target].domainIndex === pair[1])
    .sort((left, right) => right.occurrences - left.occurrences
      || left.id.localeCompare(right.id, "en"))
    .slice(0, limit);
}

export function reviewedNodes(runtime: AtlasRuntime, knowledge: AtlasKnowledgeV1) {
  return knowledge.dossiers
    .map((entry) => runtime.graph.nodeById.get(entry.nodeId))
    .filter((node): node is GraphNode => Boolean(node))
    .sort((left, right) => right.gravity - left.gravity
      || left.label.localeCompare(right.label, "ko"));
}

export function strongestReviewedRelation(runtime: AtlasRuntime) {
  const reviewed = new Set(runtime.knowledge.dossiers.map((entry) => entry.nodeId));
  return runtime.graph.edges
    .filter((edge) => {
      const source = runtime.graph.nodes[edge.source];
      const target = runtime.graph.nodes[edge.target];
      return source.id !== target.id && reviewed.has(source.id) && reviewed.has(target.id);
    })
    .sort((left, right) => right.occurrences - left.occurrences
      || left.id.localeCompare(right.id, "en"))[0] ?? null;
}

export function exactEdge(
  graph: AtlasGraphModel,
  source: GraphNode | null,
  target: GraphNode | null,
) {
  if (!source || !target) return null;
  return source.outgoing
    .map((edgeIndex) => graph.edges[edgeIndex])
    .find((edge) => edge.target === target.index) ?? null;
}

export function visibleNeighbors(graph: AtlasGraphModel, node: GraphNode, limit = 6) {
  const incoming = node.incoming.slice(0, limit).map((edgeIndex) => {
    const edge = graph.edges[edgeIndex];
    return { edge, node: graph.nodes[edge.source] };
  });
  const outgoing = node.outgoing.slice(0, limit).map((edgeIndex) => {
    const edge = graph.edges[edgeIndex];
    return { edge, node: graph.nodes[edge.target] };
  });
  return {
    incoming,
    outgoing,
    hiddenIncoming: Math.max(0, node.incoming.length - incoming.length),
    hiddenOutgoing: Math.max(0, node.outgoing.length - outgoing.length),
  };
}

export function claimsForDossier(dossier: KnowledgeDossier): ObserveClaim[] {
  const relationClaims: ObserveClaim[] = dossier.relationExplanations.map((relation) => ({
    id: relation.id,
    label: relation.direction === "incoming" ? "들어오는 관계" : "나가는 관계",
    category: "relation",
    text: relation.explanation,
    evidenceIds: relation.evidenceIds,
    interpretation: relation.kind === "direct_context"
      ? "source_explicit"
      : "atlas_builder_bounded",
  }));
  return [
    { ...dossier.readerSummary, label: "한눈에 읽기", category: "summary" },
    { ...dossier.whyItMatters, label: "팀에 중요한 이유", category: "relevance" },
    ...dossier.keyInsights.map((claim, index) => ({
      ...claim,
      label: `핵심 인사이트 ${index + 1}`,
      category: "insight" as const,
    })),
    ...dossier.caveats.map((claim, index) => ({
      ...claim,
      label: `Caveat ${index + 1}`,
      category: "caveat" as const,
    })),
    ...dossier.openQuestions.map((claim, index) => ({
      ...claim,
      label: `Open question ${index + 1}`,
      category: "question" as const,
    })),
    ...relationClaims,
  ];
}

export function edgeEndpoints(graph: AtlasGraphModel, edge: GraphEdge) {
  return {
    source: graph.nodes[edge.source],
    target: graph.nodes[edge.target],
  };
}
