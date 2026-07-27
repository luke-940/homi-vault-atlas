import { createHash } from "node:crypto";
import { stableJson } from "./data-model.mjs";
import { buildAtlasMeaningV1 } from "./atlas-meaning-v1.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const compareText = (left, right) => String(left) < String(right) ? -1 : String(left) > String(right) ? 1 : 0;

const DOMAIN_DEFINITIONS = Object.freeze([
  {
    id: "meaning:domain:moc",
    domain: "MOC",
    districtLabels: ["MOC", "중심 지식"],
    preferredAnchorLabels: ["AI 신뢰성"],
    statement: "MOC는 판단과 운영 원칙을 재사용 가능한 중심 지식으로 묶습니다.",
  },
  {
    id: "meaning:domain:papers",
    domain: "Papers",
    districtLabels: ["Papers", "연구 논거"],
    preferredAnchorLabels: ["Agent Papers", "AI and Society Papers"],
    statement: "Papers는 주장과 의사결정에 재검토 가능한 연구 근거를 공급합니다.",
  },
  {
    id: "meaning:domain:signals",
    domain: "Signals",
    districtLabels: ["Signals", "신호"],
    preferredAnchorLabels: ["노동·조직"],
    statement: "Signals는 기술·산업·조직 변화가 지식 지형에 들어오는 전방 감지면입니다.",
  },
]);

function rankedEdges(edges) {
  return [...edges].sort((left, right) =>
    right.occurrenceCount - left.occurrenceCount || compareText(left.id, right.id));
}

function strongestNode(nodes) {
  return [...nodes].sort((left, right) =>
    right.gravity - left.gravity
    || right.occurrences - left.occurrences
    || compareText(left.id, right.id))[0] ?? null;
}

function domainRows(graph) {
  return DOMAIN_DEFINITIONS.map((definition) => {
    const district = graph.nodes.find((node) =>
      node.kind === "district" && definition.districtLabels.includes(node.label)) ?? null;
    const candidates = graph.nodes.filter((node) =>
      district
      && node.clusterId === district.clusterId
      && !["district", "aggregate_boundary", "source_document"].includes(node.kind));
    const anchor = definition.preferredAnchorLabels
      .map((label) => candidates.find((node) => node.label === label))
      .find(Boolean)
      ?? strongestNode(candidates);
    return { ...definition, district, anchor };
  });
}

function addEdgeWithDegreeCap({
  edge,
  selected,
  selectedIds,
  degreeByNode,
  degreeCap,
  force = false,
}) {
  if (!edge || selectedIds.has(edge.id)) return false;
  const sourceDegree = degreeByNode.get(edge.source) ?? 0;
  const targetDegree = degreeByNode.get(edge.target) ?? 0;
  if (!force && (sourceDegree >= degreeCap || targetDegree >= degreeCap)) return false;
  selected.push(edge);
  selectedIds.add(edge.id);
  degreeByNode.set(edge.source, sourceDegree + 1);
  degreeByNode.set(edge.target, targetDegree + 1);
  return true;
}

export function selectDomainBackboneEdges(graph, {
  anchorNodeIds,
  protagonistNodeIds,
  limit = 16,
  degreeCap = 4,
} = {
  anchorNodeIds: [],
  protagonistNodeIds: [],
  limit: 16,
  degreeCap: 4,
}) {
  const anchors = new Set(anchorNodeIds ?? []);
  const protagonists = new Set(protagonistNodeIds ?? []);
  const selected = [];
  const selectedIds = new Set();
  const degreeByNode = new Map();
  const add = (edge, force = false) => addEdgeWithDegreeCap({
    edge,
    selected,
    selectedIds,
    degreeByNode,
    degreeCap,
    force,
  });

  for (const anchorId of [...anchors].sort(compareText)) {
    add(rankedEdges(graph.edges.filter((edge) => edge.target === anchorId))[0], true);
    if (selected.length >= limit) break;
    add(rankedEdges(graph.edges.filter((edge) => edge.source === anchorId))[0], true);
    if (selected.length >= limit) break;
  }

  for (const protagonistId of [...protagonists].sort(compareText)) {
    if (selected.some((edge) => edge.source === protagonistId || edge.target === protagonistId)) continue;
    add(rankedEdges(graph.edges.filter((edge) =>
      edge.source === protagonistId || edge.target === protagonistId))[0], true);
    if (selected.length >= limit) break;
  }

  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const remaining = [...graph.edges].sort((left, right) => {
    const leftCrossDomain = nodeById.get(left.source)?.clusterId !== nodeById.get(left.target)?.clusterId ? 1 : 0;
    const rightCrossDomain = nodeById.get(right.source)?.clusterId !== nodeById.get(right.target)?.clusterId ? 1 : 0;
    return rightCrossDomain - leftCrossDomain
      || right.occurrenceCount - left.occurrenceCount
      || compareText(left.id, right.id);
  });
  for (const edge of remaining) {
    if (selected.length >= limit) break;
    add(edge);
  }
  return selected;
}

function buildConnectionStory(graph, protagonist, constellation) {
  const node = graph.nodes.find((candidate) => candidate.id === protagonist.nodeId);
  const edgeIds = [...new Set([
    ...constellation.incomingEdgeIds,
    ...constellation.outgoingEdgeIds,
  ])];
  const edgeById = new Map(graph.edges.map((edge) => [edge.id, edge]));
  const domainIds = [...new Set(edgeIds.flatMap((edgeId) => {
    const edge = edgeById.get(edgeId);
    if (!edge) return [];
    return [
      graph.nodes.find((candidate) => candidate.id === edge.source)?.clusterId,
      graph.nodes.find((candidate) => candidate.id === edge.target)?.clusterId,
    ].filter(Boolean);
  }))].sort(compareText);
  return {
    id: `meaning:story:${protagonist.nodeId}`,
    focalNodeId: protagonist.nodeId,
    thesis: protagonist.thesis,
    edgeIds,
    incomingEdgeIds: constellation.incomingEdgeIds,
    outgoingEdgeIds: constellation.outgoingEdgeIds,
    domainIds,
    caveat: protagonist.caveat,
    label: node?.label ?? "지식 주인공",
  };
}

export function meaningV1CompatibilityAdapter(meaningV2) {
  const withoutDigest = {
    schema: "atlas.meaning.v1",
    profile: meaningV2.profile,
    generatedAt: meaningV2.generatedAt,
    baseline: meaningV2.baseline,
    current: meaningV2.current,
    protagonists: meaningV2.protagonists.map(({ storyIds: _storyIds, ...protagonist }) => protagonist),
    constellations: meaningV2.constellations,
    movements: meaningV2.movements,
    operationalCompass: meaningV2.operationalCompass,
    scenes: meaningV2.scenes.map((scene) => scene.id === "domain-backbone"
      ? { ...scene, id: "core-gravity", label: "Core Domain Gravity" }
      : scene),
    manifest: {
      protagonistCount: meaningV2.protagonists.length,
      constellationCount: meaningV2.constellations.length,
      movementCount: meaningV2.movements.length,
    },
  };
  return {
    ...withoutDigest,
    manifest: {
      ...withoutDigest.manifest,
      projectionDigest: sha256(stableJson(withoutDigest)),
    },
  };
}

export function buildAtlasMeaningV2(options) {
  const base = buildAtlasMeaningV1(options);
  const domainDefinitions = domainRows(options.graph);
  const constellationsByNode = new Map(base.constellations.map((item) => [item.focalNodeId, item]));
  const connectionStories = base.protagonists.map((protagonist) =>
    buildConnectionStory(options.graph, protagonist, constellationsByNode.get(protagonist.nodeId)));
  const storiesByNode = new Map(connectionStories.map((story) => [story.focalNodeId, story]));
  const protagonists = base.protagonists.map((protagonist) => ({
    ...protagonist,
    storyIds: storiesByNode.has(protagonist.nodeId)
      ? [storiesByNode.get(protagonist.nodeId).id]
      : [],
  }));
  const selectedBackboneEdges = selectDomainBackboneEdges(options.graph, {
    anchorNodeIds: domainDefinitions.flatMap((item) => item.anchor ? [item.anchor.id] : []),
    protagonistNodeIds: protagonists.map((item) => item.nodeId),
  });
  const selectedBackboneIds = new Set(selectedBackboneEdges.map((edge) => edge.id));
  const domainBackbone = domainDefinitions.map((definition) => {
    const edgeIds = definition.anchor
      ? selectedBackboneEdges
        .filter((edge) => edge.source === definition.anchor.id || edge.target === definition.anchor.id)
        .map((edge) => edge.id)
      : [];
    return {
      id: definition.id,
      domain: definition.domain,
      districtId: definition.district?.id ?? null,
      anchorNodeId: definition.anchor?.id ?? null,
      edgeIds,
      statement: definition.statement,
      evidenceGap: definition.anchor && edgeIds.length
        ? null
        : definition.anchor
          ? "공개 범위 안에서 기본 장면에 표시할 실제 incident edge가 없습니다."
          : "공개 범위 안에서 적격 anchor를 확인하지 못했습니다.",
    };
  });
  const scenes = base.scenes.map((scene) => scene.id === "core-gravity"
    ? {
        ...scene,
        id: "domain-backbone",
        label: "Domain Backbone",
        thesis: "MOC는 판단을 묶고, Papers는 근거를 공급하며, Signals는 변화를 감지합니다. 화면의 선은 실제 방향 참조만 사용합니다.",
        focusIds: domainDefinitions.flatMap((item) => item.anchor ? [item.anchor.id] : []),
      }
    : scene);
  const actualStoryEdgeIds = new Set(connectionStories.flatMap((story) => story.edgeIds));
  for (const edgeId of selectedBackboneIds) actualStoryEdgeIds.add(edgeId);
  const withoutDigest = {
    schema: "atlas.meaning.v2",
    profile: base.profile,
    generatedAt: base.generatedAt,
    baseline: base.baseline,
    current: base.current,
    domainBackbone,
    connectionStories,
    protagonists,
    constellations: base.constellations,
    movements: base.movements,
    operationalCompass: base.operationalCompass,
    scenes,
    manifest: {
      protagonistCount: protagonists.length,
      constellationCount: base.constellations.length,
      movementCount: base.movements.length,
      storyCount: connectionStories.length,
      actualUsedEdgeCount: actualStoryEdgeIds.size,
      domainCoverage: Object.fromEntries(domainBackbone.map((item) => [
        item.domain,
        item.anchorNodeId && item.edgeIds.length ? "covered" : "evidence_gap",
      ])),
    },
  };
  return {
    ...withoutDigest,
    manifest: {
      ...withoutDigest.manifest,
      projectionDigest: sha256(stableJson(withoutDigest)),
    },
  };
}
