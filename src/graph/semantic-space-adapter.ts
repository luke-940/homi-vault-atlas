import type {
  AtlasGraphNodeV1,
  AtlasGraphV1,
  MatrixCell,
} from "../types";
import { graphNodeLabel, type FreshnessBucket, visibleGraphSelection } from "./model";
import {
  defaultWorkspaceReferenceCommands,
  semanticEdgeCommands,
  type RenderEdgeCommand,
} from "./semantic-edge-model";
import type {
  AuthoredCamera,
  SemanticSpaceNode,
  SemanticSpacePresentation,
  SemanticSpaceScene,
  SemanticSpaceSceneKind,
} from "./semantic-space-contract";

const fieldColors: Record<string, string> = {
  MOC: "#d3ad75",
  Strategy: "#d79273",
  Research: "#83a8cc",
  Papers: "#bda0d2",
  Signals: "#ce829d",
  Console: "#aeb981",
  "중심 지식": "#d3ad75",
  "연구 논거": "#83a8cc",
  전략: "#d79273",
  신호: "#ce829d",
  "운영 기반": "#aeb981",
  Rocket: "#ae82e3",
  Groot: "#70ba91",
  "Intelligence Layer": "#759dde",
  "Independent Projects": "#9d83dc",
  "연구 기록": "#57b9cf",
};

function colorForNode(node: AtlasGraphNodeV1, graph: AtlasGraphV1) {
  const cluster = graph.clusters.find((candidate) => candidate.id === node.clusterId);
  return fieldColors[cluster?.label ?? ""] ?? "#9aa4a0";
}

function labelPriority(node: AtlasGraphNodeV1, persistent: ReadonlySet<string>) {
  if (persistent.has(node.id)) return 1_000_000 + node.gravity;
  if (node.kind === "district") return 900_000 + node.gravity;
  if (node.kind === "moc_hub" || node.kind === "paper_gateway" || node.kind === "signal_domain") {
    return 600_000 + node.gravity * 100 + node.occurrences;
  }
  return node.gravity * 100 + node.occurrences;
}

function semanticLabel(node: AtlasGraphNodeV1) {
  if (node.kind !== "district") return graphNodeLabel(node);
  return ({
    "중심 지식": "MOC · 중심 지식",
    "연구 논거": "Papers · 연구 논거",
    신호: "Signals · 신호",
  } as Record<string, string>)[node.label] ?? graphNodeLabel(node);
}

function semanticNode(
  node: AtlasGraphNodeV1,
  graph: AtlasGraphV1,
  incomingCount: number,
  outgoingCount: number,
  persistent: ReadonlySet<string>,
): SemanticSpaceNode | null {
  const coordinate = graph.layout.coordinates.find((candidate) => candidate.id === node.id);
  if (!coordinate) return null;
  const { bounds } = graph.layout;
  const x = coordinate.x - (bounds.x + bounds.width / 2);
  const y = bounds.y + bounds.height / 2 - coordinate.y;
  const z = coordinate.z - (bounds.z + bounds.depth / 2);
  const gravityRoot = Math.sqrt(Math.max(0, node.gravity));
  const authoredRadius = node.kind === "aggregate_boundary"
    ? Math.max(2.6, Math.min(7.6, 2.6 + gravityRoot * 0.24))
    : node.kind === "district"
      ? Math.max(18, Math.min(28, 17 + gravityRoot * 0.48))
      : node.kind === "paper_gateway"
        ? Math.max(6, Math.min(24, 5.5 + gravityRoot * 1.12))
        : Math.max(6.5, Math.min(28, 6 + gravityRoot * 1.2));
  return {
    id: node.id,
    label: semanticLabel(node),
    kind: node.kind,
    clusterId: node.clusterId,
    position: [x, y, z],
    radius: authoredRadius,
    color: colorForNode(node, graph),
    halo: node.kind === "aggregate_boundary"
      ? Math.max(8, authoredRadius * 1.7)
      : Math.max(22, authoredRadius * (node.kind === "district" ? 2.8 : 4.15)),
    gravity: node.gravity,
    occurrences: node.occurrences,
    incomingCount,
    outgoingCount,
    labelPriority: labelPriority(node, persistent),
  };
}

function authoredCamera(graph: AtlasGraphV1, presentation: SemanticSpacePresentation): AuthoredCamera {
  const { bounds } = graph.layout;
  const extent = Math.max(bounds.width, bounds.height, bounds.depth);
  return {
    yaw: presentation === "home" ? -0.42 : -0.3,
    pitch: presentation === "home" ? 0.23 : 0.18,
    distance: extent * (presentation === "home" ? 1.025 : 0.8),
    target: [
      presentation === "home" ? -bounds.width * 0.18 : -bounds.width * 0.025,
      presentation === "home" ? -bounds.height * 0.025 : 0,
      presentation === "home" ? -bounds.depth * 0.03 : 0,
    ],
    minDistance: extent * 0.54,
    maxDistance: extent * 1.9,
  };
}

function homeBackboneCommands(graph: AtlasGraphV1, visibleNodeIds: ReadonlySet<string>, limit = 16) {
  const ranked = graph.edges
    .filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target))
    .sort((left, right) =>
      right.occurrenceCount - left.occurrenceCount || left.id.localeCompare(right.id, "en"));
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const degree = new Map<string, number>();
  const selected: typeof ranked = [];
  const selectedIds = new Set<string>();
  const push = (edge: (typeof ranked)[number] | undefined) => {
    if (!edge || selectedIds.has(edge.id) || selected.length >= limit) return false;
    if ((degree.get(edge.source) ?? 0) >= 4 || (degree.get(edge.target) ?? 0) >= 4) return false;
    selected.push(edge);
    selectedIds.add(edge.id);
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
    return true;
  };
  const clusters = [...new Set(graph.nodes
    .filter((node) => visibleNodeIds.has(node.id))
    .map((node) => node.clusterId))]
    .sort((left, right) => left.localeCompare(right, "en"));
  for (const clusterId of clusters) {
    push(ranked.find((edge) => {
      const sourceCluster = nodeById.get(edge.source)?.clusterId;
      const targetCluster = nodeById.get(edge.target)?.clusterId;
      return sourceCluster !== targetCluster
        && (sourceCluster === clusterId || targetCluster === clusterId);
    }));
  }
  for (const edge of ranked) push(edge);
  return selected.map((edge): RenderEdgeCommand => ({
    id: edge.id,
    semanticKind: "exact_reference",
    sourceId: edge.source,
    targetId: edge.target,
    weight: edge.occurrenceCount,
    constituentEdgeIds: [edge.id],
    provenance: "atlas.graph.v1",
  }));
}

export function buildSemanticSpaceScene(options: {
  graph: AtlasGraphV1;
  matrix?: readonly MatrixCell[];
  kind: SemanticSpaceSceneKind;
  presentation: SemanticSpacePresentation;
  focusId: string | null;
  previewId: string | null;
  districtId?: string | null;
  freshness?: FreshnessBucket;
  from?: string | null;
  to?: string | null;
  persistentLabelIds?: readonly string[];
  reducedMotion: boolean;
  labelBudget?: number;
}) {
  const selection = visibleGraphSelection(options.graph, {
    districtId: options.districtId ?? null,
    freshness: options.freshness ?? "all",
    focusId: options.focusId,
    mobile: false,
    from: options.from ?? null,
    to: options.to ?? null,
  });
  const persistent = new Set(options.persistentLabelIds ?? []);
  const incomingCounts = new Map<string, number>();
  const outgoingCounts = new Map<string, number>();
  for (const edge of options.graph.edges) {
    incomingCounts.set(edge.target, (incomingCounts.get(edge.target) ?? 0) + 1);
    outgoingCounts.set(edge.source, (outgoingCounts.get(edge.source) ?? 0) + 1);
  }
  const nodes = selection.nodes
    .map((node) => semanticNode(
      node,
      options.graph,
      incomingCounts.get(node.id) ?? 0,
      outgoingCounts.get(node.id) ?? 0,
      persistent,
    ))
    .filter((node): node is SemanticSpaceNode => Boolean(node));
  const visibleNodeIds = new Set(nodes.map((node) => node.id));
  const semanticCommands = semanticEdgeCommands({
    graph: options.graph,
    matrix: options.matrix ?? [],
    scene: options.kind,
    focusId: options.focusId,
    previewId: null,
    from: options.from ?? null,
    to: options.to ?? null,
    presentation: options.presentation,
  }).filter((edge) => visibleNodeIds.has(edge.sourceId) && visibleNodeIds.has(edge.targetId));
  const baseCommands = options.presentation === "home"
    && options.kind === "field"
    && !options.focusId
    ? homeBackboneCommands(options.graph, visibleNodeIds, 12)
    : semanticCommands;
  const baseById = new Map(baseCommands.map((edge) => [edge.id, edge]));
  const graphEdges = options.graph.edges
    .filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target))
    .map((edge) => ({
      id: edge.id,
      semanticKind: "exact_reference" as const,
      sourceId: edge.source,
      targetId: edge.target,
      weight: edge.occurrenceCount,
      constituentEdgeIds: [edge.id],
      provenance: "atlas.graph.v1" as const,
      defaultVisible: baseById.has(edge.id),
    }));
  const graphEdgeIds = new Set(graphEdges.map((edge) => edge.id));
  const edges = [
    ...baseCommands
      .filter((edge) => !graphEdgeIds.has(edge.id))
      .map((edge) => ({ ...edge, defaultVisible: true })),
    ...graphEdges,
  ];
  const labelBudget = options.labelBudget
    ?? (options.presentation === "home" ? 18 : 18);
  const labelIds = [...nodes]
    .sort((left, right) => right.labelPriority - left.labelPriority || left.id.localeCompare(right.id, "en"))
    .slice(0, labelBudget)
    .map((node) => node.id);
  if (options.focusId && visibleNodeIds.has(options.focusId) && !labelIds.includes(options.focusId)) {
    labelIds[labelIds.length - 1] = options.focusId;
  }

  return {
    id: [
      options.presentation,
      options.kind,
      options.districtId ?? "all",
      options.freshness ?? "all",
      options.from ?? "",
      options.to ?? "",
      nodes.map((node) => node.id).join(","),
      edges.map((edge) => edge.id).join(","),
    ].join("|"),
    kind: options.kind,
    presentation: options.presentation,
    nodes,
    edges,
    camera: authoredCamera(options.graph, options.presentation),
    labelIds,
    focusId: options.focusId,
    previewId: options.previewId,
    reducedMotion: options.reducedMotion,
  } satisfies SemanticSpaceScene;
}
