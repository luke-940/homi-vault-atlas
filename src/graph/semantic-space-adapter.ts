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
  SemanticSpaceEvidenceMark,
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
  // v7.7 public clusters use Korean labels, but their materials inherit the
  // same semantic colors as v7.5's MOC / Papers / Signals stage.
  "중심 지식": "#d3ad75",
  "연구 논거": "#bda0d2",
  전략: "#d79273",
  신호: "#ce829d",
  "운영 기반": "#91977f",
  Rocket: "#91877f",
  Groot: "#8d977f",
  "Intelligence Layer": "#8d908a",
  "Independent Projects": "#998f84",
  "연구 기록": "#8c9288",
};

interface AuthoredClusterSlot {
  anchor: [number, number, number];
  spread: [number, number, number];
  roll: number;
  yaw: number;
}

const authoredClusterSlots: Record<string, AuthoredClusterSlot> = {
  "연구 논거": {
    anchor: [-292, -92, 82],
    spread: [146, 124, 132],
    roll: -0.24,
    yaw: 0.2,
  },
  "중심 지식": {
    anchor: [112, -72, -12],
    spread: [156, 152, 148],
    roll: 0.13,
    yaw: -0.18,
  },
  신호: {
    anchor: [270, 168, 104],
    spread: [122, 116, 138],
    roll: -0.18,
    yaw: 0.28,
  },
  전략: {
    anchor: [-138, -154, 174],
    spread: [92, 78, 96],
    roll: 0.28,
    yaw: -0.22,
  },
  "운영 기반": {
    anchor: [10, 112, 228],
    spread: [78, 68, 82],
    roll: -0.16,
    yaw: 0.18,
  },
  "Independent Projects": {
    anchor: [348, 118, 230],
    spread: [86, 72, 92],
    roll: 0.2,
    yaw: -0.26,
  },
  "연구 기록": {
    anchor: [-86, 236, 218],
    spread: [76, 66, 82],
    roll: -0.3,
    yaw: 0.16,
  },
};

// Owner and Public use the same authored semantic stage even though their
// district labels differ. Keeping aliases here prevents the richer Owner graph
// from falling into index-based fallback slots and losing the MOC/Papers/Signals
// composition that defines the public Embassy view.
authoredClusterSlots.Papers = authoredClusterSlots["연구 논거"];
authoredClusterSlots.MOC = authoredClusterSlots["중심 지식"];
authoredClusterSlots.Signals = authoredClusterSlots.신호;

const fallbackClusterSlots: AuthoredClusterSlot[] = [
  { anchor: [-340, -12, 190], spread: [82, 72, 84], roll: -0.2, yaw: 0.18 },
  { anchor: [370, -18, 182], spread: [82, 72, 84], roll: 0.2, yaw: -0.18 },
  { anchor: [-30, 270, 242], spread: [78, 66, 82], roll: 0.1, yaw: 0.2 },
];

function stableUnit(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

function colorForNode(node: AtlasGraphNodeV1, graph: AtlasGraphV1) {
  const cluster = graph.clusters.find((candidate) => candidate.id === node.clusterId);
  return fieldColors[cluster?.label ?? ""] ?? "#9aa4a0";
}

const homeSemanticLabelPriority = new Map<string, number>([
  ["이미지생성", 890_000],
  ["에이전트", 889_000],
  ["AI 신뢰성", 888_000],
  ["노동·조직", 887_000],
  ["Agent Papers", 886_000],
  ["AI and Society Papers", 885_000],
]);

const homeSupportingOrganizationLabels = new Set([
  "OpenAI",
  "Google",
  "Anthropic",
  "Claude",
  "MCP",
]);

function labelPriority(
  node: AtlasGraphNodeV1,
  persistent: ReadonlySet<string>,
  presentation: SemanticSpacePresentation,
) {
  if (persistent.has(node.id)) return 1_000_000 + node.gravity;
  if (presentation === "home") {
    const semanticPriority = homeSemanticLabelPriority.get(node.label);
    if (semanticPriority) return semanticPriority + node.gravity;
    if (homeSupportingOrganizationLabels.has(node.label)) return node.gravity * 10;
  }
  if (node.kind === "district") {
    return ["중심 지식", "연구 논거", "신호", "MOC", "Papers", "Signals"].includes(node.label)
      ? 900_000 + node.gravity
      : 170_000 + node.gravity;
  }
  if (node.kind === "moc_hub" || node.kind === "paper_gateway" || node.kind === "signal_domain") {
    return 600_000 + node.gravity * 100 + node.occurrences;
  }
  return node.gravity * 100 + node.occurrences;
}

function semanticLabel(node: AtlasGraphNodeV1) {
  if (node.label === "Agent Papers") return "AI 에이전트 연구";
  if (node.label === "AI and Society Papers") return "AI·사회 연구";
  if (node.kind !== "district") return graphNodeLabel(node);
  return ({
    "중심 지식": "MOC · 중심 지식",
    "연구 논거": "Papers · 연구 논거",
    신호: "Signals · 신호",
    MOC: "MOC · 중심 지식",
    Papers: "Papers · 연구 논거",
    Signals: "Signals · 신호",
  } as Record<string, string>)[node.label] ?? graphNodeLabel(node);
}

function semanticNode(
  node: AtlasGraphNodeV1,
  graph: AtlasGraphV1,
  position: [number, number, number],
  incomingCount: number,
  outgoingCount: number,
  persistent: ReadonlySet<string>,
  presentation: SemanticSpacePresentation,
): SemanticSpaceNode | null {
  const gravityRoot = Math.sqrt(Math.max(0, node.gravity));
  const authoredRadius = node.kind === "aggregate_boundary"
    ? Math.max(1.6, Math.min(3.6, 1.5 + gravityRoot * 0.12))
    : node.kind === "district"
      ? Math.max(6.8, Math.min(11.8, 6.5 + gravityRoot * 0.17))
      : node.kind === "paper_gateway"
        ? Math.max(3.5, Math.min(10.5, 3.3 + gravityRoot * 0.45))
        : node.kind === "signal_domain" || node.kind === "signal_storyline"
          ? Math.max(3.6, Math.min(10.5, 3.4 + gravityRoot * 0.46))
          : Math.max(3.4, Math.min(11.2, 3.2 + gravityRoot * 0.48));
  return {
    id: node.id,
    label: semanticLabel(node),
    kind: node.kind,
    clusterId: node.clusterId,
    position,
    radius: authoredRadius,
    color: colorForNode(node, graph),
    halo: node.kind === "aggregate_boundary"
      ? Math.max(7, authoredRadius * 1.65)
      : Math.max(20, authoredRadius * (node.kind === "district" ? 4 : 4.8)),
    gravity: node.gravity,
    occurrences: node.occurrences,
    incomingCount,
    outgoingCount,
    labelPriority: labelPriority(node, persistent, presentation),
  };
}

function clusterSlot(label: string, index: number) {
  return authoredClusterSlots[label] ?? fallbackClusterSlots[index % fallbackClusterSlots.length];
}

function rotateAuthoredOffset(
  offset: [number, number, number],
  roll: number,
  yaw: number,
): [number, number, number] {
  const [x, y, z] = offset;
  const cosRoll = Math.cos(roll);
  const sinRoll = Math.sin(roll);
  const rolledX = x * cosRoll - y * sinRoll;
  const rolledY = x * sinRoll + y * cosRoll;
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  return [
    rolledX * cosYaw + z * sinYaw,
    rolledY,
    -rolledX * sinYaw + z * cosYaw,
  ];
}

function authoredPositions(
  graph: AtlasGraphV1,
  nodes: readonly AtlasGraphNodeV1[],
  presentation: SemanticSpacePresentation,
) {
  const coordinateById = new Map(graph.layout.coordinates.map((coordinate) => [coordinate.id, coordinate]));
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const clusterById = new Map(graph.clusters.map((cluster, index) => [
    cluster.id,
    { ...cluster, index },
  ]));
  const membersByCluster = new Map<string, AtlasGraphNodeV1[]>();
  for (const node of graph.nodes) {
    const members = membersByCluster.get(node.clusterId) ?? [];
    members.push(node);
    membersByCluster.set(node.clusterId, members);
  }
  const positionById = new Map<string, [number, number, number]>();
  for (const node of nodes) {
    const coordinate = coordinateById.get(node.id);
    const cluster = clusterById.get(node.clusterId);
    if (!coordinate || !cluster) continue;
    const members = membersByCluster.get(node.clusterId) ?? [];
    const district = members.find((candidate) => candidate.kind === "district")
      ?? nodeById.get(cluster.districtId)
      ?? members[0];
    const anchorCoordinate = district ? coordinateById.get(district.id) : coordinate;
    if (!anchorCoordinate) continue;
    const offsets = members.flatMap((member) => {
      const memberCoordinate = coordinateById.get(member.id);
      if (!memberCoordinate) return [];
      return [[
        memberCoordinate.x - anchorCoordinate.x,
        anchorCoordinate.y - memberCoordinate.y,
        memberCoordinate.z - anchorCoordinate.z,
      ] as const];
    });
    const maxX = Math.max(1, ...offsets.map((offset) => Math.abs(offset[0])));
    const maxY = Math.max(1, ...offsets.map((offset) => Math.abs(offset[1])));
    const maxZ = Math.max(1, ...offsets.map((offset) => Math.abs(offset[2])));
    const slot = clusterSlot(cluster.label, cluster.index);
    const presentationScale = presentation === "home" ? 1 : 1.12;
    const normalized: [number, number, number] = [
      ((coordinate.x - anchorCoordinate.x) / maxX) * slot.spread[0] * presentationScale,
      ((anchorCoordinate.y - coordinate.y) / maxY) * slot.spread[1] * presentationScale,
      ((coordinate.z - anchorCoordinate.z) / maxZ) * slot.spread[2] * presentationScale,
    ];
    const rotated = rotateAuthoredOffset(normalized, slot.roll, slot.yaw);
    const workspaceOffset = presentation === "home" ? 0 : 26;
    positionById.set(node.id, [
      slot.anchor[0] * presentationScale + rotated[0],
      slot.anchor[1] * presentationScale + rotated[1],
      slot.anchor[2] + rotated[2] + workspaceOffset,
    ]);
  }
  return positionById;
}

function evidenceMarks(
  graph: AtlasGraphV1,
  nodes: readonly AtlasGraphNodeV1[],
  positionById: ReadonlyMap<string, [number, number, number]>,
) {
  const marks: SemanticSpaceEvidenceMark[] = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const clustersWithAggregateEvidence = new Set(nodes
    .filter((node) => node.kind === "aggregate_boundary" && node.representedDocuments > 0)
    .map((node) => node.clusterId));
  const evidenceSources = nodes.filter((node) =>
    node.representedDocuments > 0
    && (
      node.kind === "aggregate_boundary"
      || (node.kind === "district" && !clustersWithAggregateEvidence.has(node.clusterId))
    ));
  for (const node of evidenceSources) {
    const parentPosition = positionById.get(node.id);
    if (!parentPosition) continue;
    const markCount = node.representedDocuments;
    const spread = Math.min(160, 48 + Math.sqrt(node.representedDocuments) * 7.4);
    const phase = stableUnit(`${node.id}:evidence-phase`) * Math.PI * 2;
    const color = colorForNode(node, graph);
    const baseColor = Number.parseInt(color.slice(1), 16);
    const neutralColor = 0xd8cdbb;
    const mixedColor = `#${[16, 8, 0]
      .map((shift) => {
        const channel = Math.round(
          ((baseColor >> shift) & 255) * 0.58 + ((neutralColor >> shift) & 255) * 0.42,
        );
        return channel.toString(16).padStart(2, "0");
      })
      .join("")}`;
    for (let index = 0; index < markCount; index += 1) {
      const normalized = (index + 0.5) / markCount;
      const radial = Math.sqrt(normalized);
      const angle = phase + index * goldenAngle;
      const depth = stableUnit(`${node.id}:${index}:depth`) - 0.5;
      const lift = stableUnit(`${node.id}:${index}:lift`) - 0.5;
      marks.push({
        id: `evidence:${node.id}:${index}`,
        parentId: node.id,
        clusterId: node.clusterId,
        position: [
          parentPosition[0] + Math.cos(angle) * spread * radial,
          parentPosition[1] + Math.sin(angle) * spread * radial * 0.58 + lift * spread * 0.24,
          parentPosition[2] + depth * spread * 0.9 + Math.sin(angle * 0.7) * spread * 0.18,
        ],
        color: mixedColor,
        size: 1.85 + stableUnit(`${node.id}:${index}:size`) * 2.05,
        opacity: 0.5 + stableUnit(`${node.id}:${index}:opacity`) * 0.28,
        representedDocuments: 1,
      });
    }
  }
  return marks;
}

function authoredCamera(presentation: SemanticSpacePresentation): AuthoredCamera {
  return {
    yaw: presentation === "home" ? -0.1 : -0.14,
    pitch: presentation === "home" ? 0.19 : 0.17,
    distance: presentation === "home" ? 1_030 : 1_080,
    target: presentation === "home" ? [-148, 18, 92] : [10, 18, 108],
    minDistance: presentation === "home" ? 620 : 650,
    maxDistance: 1_820,
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
    if ((degree.get(edge.source) ?? 0) >= 3 || (degree.get(edge.target) ?? 0) >= 3) return false;
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
  const positionById = authoredPositions(options.graph, selection.nodes, options.presentation);
  const nodes = selection.nodes
    .map((node) => semanticNode(
      node,
      options.graph,
      positionById.get(node.id) ?? [0, 0, 0],
      incomingCounts.get(node.id) ?? 0,
      outgoingCounts.get(node.id) ?? 0,
      persistent,
      options.presentation,
    ))
    .filter((node): node is SemanticSpaceNode => Boolean(node));
  const marks = evidenceMarks(options.graph, selection.nodes, positionById);
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
    ? homeBackboneCommands(options.graph, visibleNodeIds, 14)
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
      nodes.map((node) => node.position.join(",")).join(";"),
      edges.map((edge) => edge.id).join(","),
      marks.map((mark) => `${mark.id}:${mark.position.join(",")}`).join(";"),
    ].join("|"),
    kind: options.kind,
    presentation: options.presentation,
    nodes,
    edges,
    evidenceMarks: marks,
    camera: authoredCamera(options.presentation),
    labelIds,
    focusId: options.focusId,
    previewId: options.previewId,
    reducedMotion: options.reducedMotion,
  } satisfies SemanticSpaceScene;
}
