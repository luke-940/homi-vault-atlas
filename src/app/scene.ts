import type {
  AtlasGraphModel,
  CosmosLens,
  GraphNode,
} from "./contracts";
import { relationSummary } from "./data";
import type {
  AuthoredCamera,
  SemanticSpaceEdge,
  SemanticSpaceNode,
  SemanticSpaceScene,
} from "../graph/semantic-space-contract";

const LENS_DOMAINS: Record<CosmosLens, string[]> = {
  "whole-vault": [],
  "knowledge-core": ["MOC", "Papers", "Signals"],
  "project-frontiers": ["Rocket", "Groot", "Intelligence Layer"],
  "agent-stewardship": [],
};

const CAMERA_KEY: Record<CosmosLens, keyof AtlasGraphModel["cameras"]> = {
  "whole-vault": "wholeVault",
  "knowledge-core": "knowledgeCore",
  "project-frontiers": "projectFrontiers",
  "agent-stewardship": "agentStewardship",
};

function nodeRadius(node: GraphNode, maxGravity: number) {
  const normalized = Math.sqrt(node.gravity / Math.max(1, maxGravity));
  const kindBoost = node.kind === "moc_hub" || node.kind === "paper_gateway" || node.kind === "signal_domain"
    ? 1.18
    : node.kind === "project" || node.kind === "project_stage"
      ? 1.14
      : 1;
  return Math.max(3.6, Math.min(22, (4 + normalized * 16) * kindBoost));
}

function authoredCamera(graph: AtlasGraphModel, lens: CosmosLens): AuthoredCamera {
  const raw = graph.cameras[CAMERA_KEY[lens]];
  const target: [number, number, number] = [
    raw.target[0],
    raw.target[1] - (lens === "whole-vault" ? 92 : 58),
    raw.target[2],
  ];
  const offsetByLens: Record<CosmosLens, [number, number, number]> = {
    "whole-vault": [110, 1_010, 1_020],
    "knowledge-core": [90, 840, 760],
    "project-frontiers": [105, 900, 860],
    "agent-stewardship": [110, 980, 940],
  };
  const offset = offsetByLens[lens];
  const position: [number, number, number] = [
    target[0] + offset[0],
    target[1] + offset[1],
    target[2] + offset[2],
  ];
  const distance = Math.hypot(
    position[0] - target[0],
    position[1] - target[1],
    position[2] - target[2],
  );
  return {
    position,
    target,
    fov: raw.fov,
    minDistance: distance * 0.56,
    maxDistance: distance * 1.8,
  };
}

export function pickDomainAnchor(graph: AtlasGraphModel, domain: string) {
  const members = graph.nodes.filter((node) => node.domain === domain);
  if (!members.length) return null;
  const center = members.reduce(
    (sum, node) => [
      sum[0] + node.position[0],
      sum[1] + node.position[1],
      sum[2] + node.position[2],
    ] as [number, number, number],
    [0, 0, 0] as [number, number, number],
  ).map((value) => value / members.length) as [number, number, number];
  const candidates = [...members]
    .sort((left, right) => right.labelPriority - left.labelPriority
      || right.gravity - left.gravity
      || left.label.localeCompare(right.label, "ko"))
    .slice(0, Math.min(12, members.length));
  return candidates.sort((left, right) => {
    const leftDistance = Math.hypot(
      left.position[0] - center[0],
      left.position[1] - center[1],
      left.position[2] - center[2],
    );
    const rightDistance = Math.hypot(
      right.position[0] - center[0],
      right.position[1] - center[1],
      right.position[2] - center[2],
    );
    return leftDistance - rightDistance || right.labelPriority - left.labelPriority;
  })[0] ?? null;
}

function labelIds(
  graph: AtlasGraphModel,
  lens: CosmosLens,
  focusId: string | null,
  budget: number,
  mode: "home" | "explore",
) {
  const requiredDomains = lens === "whole-vault"
    ? ["MOC", "Papers", "Signals", "Rocket", "Groot", "Intelligence Layer", "Strategy"]
    : LENS_DOMAINS[lens];
  const chosen = new Set<string>();
  if (focusId && graph.nodeById.has(focusId)) chosen.add(focusId);
  const focus = focusId ? graph.nodeById.get(focusId) : null;
  if (focus) {
    const relations = relationSummary(graph, focus);
    for (const relation of [...relations.incoming, ...relations.outgoing]) {
      if (chosen.size >= budget) break;
      chosen.add(relation.node.id);
    }
  }
  for (const domain of requiredDomains) {
    if (chosen.size >= budget) break;
    const anchor = pickDomainAnchor(graph, domain);
    if (anchor) chosen.add(anchor.id);
  }
  if (mode === "home") return [...chosen];
  const candidates = [...graph.nodes]
    .sort((left, right) => {
      const leftActive = LENS_DOMAINS[lens].includes(left.domain) ? 1 : 0;
      const rightActive = LENS_DOMAINS[lens].includes(right.domain) ? 1 : 0;
      return rightActive - leftActive
        || right.labelPriority - left.labelPriority
        || left.label.localeCompare(right.label, "ko");
    });
  for (const node of candidates) {
    if (chosen.size >= budget) break;
    chosen.add(node.id);
  }
  return [...chosen];
}

export function interactionLabelIds(
  graph: AtlasGraphModel,
  baselineIds: string[],
  activeId: string | null,
  budget: number,
) {
  if (!activeId) return baselineIds.slice(0, budget);
  const active = graph.nodeById.get(activeId);
  if (!active) return baselineIds.slice(0, budget);
  const chosen = new Set<string>([activeId]);
  const relations = relationSummary(graph, active);
  for (const relation of [...relations.incoming, ...relations.outgoing]) {
    if (chosen.size >= budget) break;
    chosen.add(relation.node.id);
  }
  return [...chosen];
}

export function buildSemanticScene({
  graph,
  lens,
  focusId,
  previewId,
  activeDomainsOverride,
  activeKindsOverride,
  compact,
  mode,
  reducedMotion,
}: {
  graph: AtlasGraphModel;
  lens: CosmosLens;
  focusId: string | null;
  previewId: string | null;
  activeDomainsOverride?: string[];
  activeKindsOverride?: GraphNode["kind"][];
  compact: boolean;
  mode: "home" | "explore";
  reducedMotion: boolean;
}): SemanticSpaceScene {
  const maxGravity = Math.max(...graph.nodes.map((node) => node.gravity), 1);
  const nodes: SemanticSpaceNode[] = graph.nodes.map((node) => ({
    id: node.id,
    label: node.label,
    kind: node.kind,
    domain: node.domain,
    position: node.position,
    radius: nodeRadius(node, maxGravity),
    color: graph.domains[node.domainIndex]?.color ?? "#8b9498",
    gravity: node.gravity,
    occurrences: node.occurrences,
    incomingCount: node.incoming.length,
    outgoingCount: node.outgoing.length,
    labelPriority: node.labelPriority,
  }));
  const edges: SemanticSpaceEdge[] = graph.edges.map((edge) => ({
    id: edge.id,
    sourceId: graph.nodes[edge.source].id,
    targetId: graph.nodes[edge.target].id,
    weight: edge.occurrences,
    crossDomain: graph.nodes[edge.source].domain !== graph.nodes[edge.target].domain,
    constituentEdgeIds: [edge.id],
    provenance: "atlas.graph.v2",
  }));
  return {
    graphVersion: graph.manifest.projectionDigest,
    lens,
    nodes,
    edges,
    camera: authoredCamera(graph, lens),
    labelIds: labelIds(graph, lens, focusId, compact ? 14 : 20, mode),
    focusId,
    previewId,
    activeDomains: activeDomainsOverride ?? LENS_DOMAINS[lens],
    activeKinds: activeKindsOverride ?? [],
    reducedMotion,
  };
}

export const LENS_COPY: Record<CosmosLens, {
  eyebrow: string;
  title: string;
  description: string;
  evidence: string;
}> = {
  "whole-vault": {
    eyebrow: "HOMI VAULT ATLAS",
    title: "살아 있는 지식의 전체 지형을 본다.",
    description: "MOC·Papers·Signals와 세 프로젝트 영역, 연결된 전략 지식이 실제 방향 관계로 이어집니다.",
    evidence: "공개 안전한 실제 이름과 방향 관계를 모두 담은 버전 스냅샷",
  },
  "knowledge-core": {
    eyebrow: "KNOWLEDGE CORE",
    title: "논거와 신호가 중심 지식으로 모인다.",
    description: "MOC가 구조를 묶고, Papers가 근거를 공급하며, Signals가 변화를 감지하는 연결을 읽습니다.",
    evidence: "세 핵심 영역만 강조하며 좌표와 관계 원문은 바꾸지 않습니다.",
  },
  "project-frontiers": {
    eyebrow: "PROJECT FRONTIERS",
    title: "프로젝트의 지식이 공통 지형으로 돌아온다.",
    description: "Rocket·Groot·Intelligence Layer의 실제 구조와 commons 연결을 같은 공간에서 확인합니다.",
    evidence: "직접 참조가 없으면 선을 만들지 않고 증거 공백으로 남깁니다.",
  },
  "agent-stewardship": {
    eyebrow: "AGENT STEWARDSHIP",
    title: "지식과 책임의 경계를 함께 읽는다.",
    description: "Luke와 전문 역할이 방향·순환·번역·관찰을 맡는 방식을 지식 관계와 분리해 보여줍니다.",
    evidence: "책임 관계는 지식 링크 수치에 포함되지 않습니다.",
  },
};
