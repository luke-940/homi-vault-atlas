import { createHash } from "node:crypto";
import { stableJson } from "./data-model.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const compareText = (left, right) => String(left) < String(right) ? -1 : String(left) > String(right) ? 1 : 0;

const publicJudgments = Object.freeze({
  "AI 신뢰성": {
    role: "gravity_anchor",
    thesis: "AI 산출물이 회사 안에서 검증·승인·인계·복구될 수 있는가에 가장 강한 지식 중력이 모입니다.",
    caveat: "연결 밀도는 중요도를 지지하지만 개별 신뢰 주장 자체를 증명하지는 않습니다.",
  },
  "에이전트": {
    role: "gravity_anchor",
    thesis: "에이전트는 답변 기능이 아니라 도구·권한·메모리·실행·검증을 가진 작업 표면으로 다뤄집니다.",
    caveat: "연결 수는 운영 성숙도나 자율성 점수가 아닙니다.",
  },
  OpenAI: {
    role: "frontier_signal",
    thesis: "OpenAI는 범용 작업·코딩·연결·기업 실행 가설을 먼저 비교하게 만드는 강한 전방 압력입니다.",
    caveat: "제품 방향과 계정별 권한·요금·지역 가용성은 서로 다른 검증 대상입니다.",
  },
  Google: {
    role: "cross_domain_bridge",
    thesis: "Google은 모델·검색·생산성·인프라를 가로지르며 여러 지식 구역을 이어 주는 외부 축입니다.",
    caveat: "여러 제품군의 연결은 단일 전략이나 성과를 뜻하지 않습니다.",
  },
  Anthropic: {
    role: "frontier_signal",
    thesis: "Anthropic은 안전성·모델·도구 실행의 경계를 함께 비교하게 하는 전방 신호입니다.",
    caveat: "공개 연결은 공급자 우열이나 실제 도입 결정을 의미하지 않습니다.",
  },
  "Agent Papers": {
    role: "cross_domain_bridge",
    thesis: "Agent Papers는 에이전트 운영 주장을 재사용 가능한 연구 근거와 연결하는 논거 관문입니다.",
    caveat: "논문 연결은 현장 효과나 제품 적합성을 자동으로 보증하지 않습니다.",
  },
});

const fallbackJudgment = Object.freeze({
  role: "cross_domain_bridge",
  thesis: "여러 지식 구역을 실제 참조 관계로 이어 주는 핵심 지식입니다.",
  caveat: "연결 밀도는 탐색 우선순위이며 진실성이나 성과의 단일 점수가 아닙니다.",
});

function rankedEdges(edges) {
  return [...edges].sort((left, right) =>
    right.occurrenceCount - left.occurrenceCount || compareText(left.id, right.id));
}

function cleanDossier(dossier, graphNode) {
  const judgment = dossier ?? publicJudgments[graphNode.label] ?? fallbackJudgment;
  return {
    role: judgment.role ?? fallbackJudgment.role,
    thesis: judgment.thesisKo ?? judgment.thesis ?? fallbackJudgment.thesis,
    caveat: judgment.caveatKo ?? judgment.caveat ?? fallbackJudgment.caveat,
    crossDomainReach: Number(judgment.metrics?.crossDomainReach ?? 0),
    bridgeCentrality: Number(judgment.metrics?.directedBridgeCentralityRaw ?? 0),
  };
}

function defaultProtagonistNodes(graph, profile) {
  const preferredLabels = profile === "atlas-public"
    ? ["AI 신뢰성", "에이전트", "OpenAI", "Google", "Anthropic", "Agent Papers"]
    : [];
  const preferred = preferredLabels
    .map((label) => graph.nodes.find((node) => node.label === label))
    .filter(Boolean);
  const fallback = [...graph.nodes]
    .filter((node) => !["district", "aggregate_boundary", "source_document"].includes(node.kind))
    .sort((left, right) =>
      right.gravity - left.gravity
      || right.occurrences - left.occurrences
      || compareText(left.id, right.id));
  return [...new Map([...preferred, ...fallback].map((node) => [node.id, node])).values()].slice(0, 7);
}

function dossierProtagonistNodes(graph, dossiers) {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const nodeByLabel = new Map(graph.nodes.map((node) => [node.label, node]));
  return dossiers
    .map((dossier) => nodeById.get(dossier.nodeId) ?? nodeById.get(dossier.publicNodeId) ?? nodeByLabel.get(dossier.label))
    .filter(Boolean)
    .filter((node, index, rows) => rows.findIndex((candidate) => candidate.id === node.id) === index)
    .slice(0, 10);
}

function buildConstellation(graph, node) {
  const nodeById = new Map(graph.nodes.map((candidate) => [candidate.id, candidate]));
  const incoming = rankedEdges(graph.edges.filter((edge) => edge.target === node.id)).slice(0, 6);
  const outgoing = rankedEdges(graph.edges.filter((edge) => edge.source === node.id)).slice(0, 6);
  const boundedPath = [
    ...(incoming[0] ? [incoming[0].id] : []),
    ...(outgoing[0] ? [outgoing[0].id] : []),
  ];
  const explanations = [...incoming.map((edge) => ({
    edgeId: edge.id,
    direction: "incoming",
    statement: `${nodeById.get(edge.source)?.label ?? "지식"}에서 ${node.label}로 실제 참조가 들어옵니다.`,
  })), ...outgoing.map((edge) => ({
    edgeId: edge.id,
    direction: "outgoing",
    statement: `${node.label}에서 ${nodeById.get(edge.target)?.label ?? "지식"}로 실제 참조가 나갑니다.`,
  }))];
  return {
    id: `meaning:constellation:${node.id}`,
    focalNodeId: node.id,
    incomingEdgeIds: incoming.map((edge) => edge.id),
    outgoingEdgeIds: outgoing.map((edge) => edge.id),
    boundedPathEdgeIds: boundedPath,
    explanations,
  };
}

function publicMovements({ baseline, current }) {
  const baselineNodeCount = Number(baseline?.manifest?.nodeCount ?? current.manifest.nodeCount);
  const baselineEdgeCount = Number(baseline?.manifest?.edgeCount ?? current.manifest.edgeCount);
  const nodeDelta = current.manifest.nodeCount - baselineNodeCount;
  const edgeDelta = current.manifest.edgeCount - baselineEdgeCount;
  if (nodeDelta === 0 && edgeDelta === 0) return [];
  return [{
    id: "meaning:movement:public-projection-delta",
    kind: nodeDelta > 0 ? "node_added" : edgeDelta > 0 ? "edge_added" : "meaningfully_updated",
    label: "검증된 공개 지식 투영 변화",
    nodeIds: [],
    edgeIds: [],
    previousValue: { nodes: baselineNodeCount, edges: baselineEdgeCount },
    currentValue: { nodes: current.manifest.nodeCount, edges: current.manifest.edgeCount },
    evidenceRefs: [
      `graph:semantic:${baseline?.manifest?.semanticDigest ?? current.manifest.semanticDigest}`,
      `graph:semantic:${current.manifest.semanticDigest}`,
    ],
    caveat: "공개 이름 정책 변화와 비공개 원문 변화는 공개 화면에서 개별 문서 활동으로 추정하지 않습니다.",
  }];
}

function defaultOwnerMovements(graph, graphDelta) {
  if (!graphDelta || typeof graphDelta !== "object") return [];
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const output = [];
  for (const item of graphDelta.sourceFiles?.added ?? []) {
    if (!item.currentNodeId || !nodeIds.has(item.currentNodeId)) continue;
    output.push({
      id: `meaning:movement:node-added:${item.currentNodeId}`,
      kind: "node_added",
      label: item.graphMetrics?.label ?? "새 지식 노드",
      nodeIds: [item.currentNodeId],
      edgeIds: [],
      previousValue: null,
      currentValue: {
        gravity: Number(item.graphMetrics?.gravity ?? 0),
        occurrences: Number(item.graphMetrics?.occurrenceCount ?? 0),
        meaningfulDate: item.graphMetrics?.meaningfulDate ?? null,
      },
      evidenceRefs: [item.currentNodeId],
      caveat: "실제 캡처에 새로 존재하며 mtime만으로 생성하지 않았습니다.",
    });
  }
  for (const item of graphDelta.sourceFiles?.changed ?? []) {
    if (!item.currentNodeId || !nodeIds.has(item.currentNodeId)) continue;
    const delta = item.graphMetrics?.delta ?? {};
    const metricChanged = Number(delta.gravity ?? 0) !== 0 || Number(delta.occurrenceCount ?? 0) !== 0;
    if (!metricChanged && !item.graphMetrics?.sourceHashChanged) continue;
    output.push({
      id: `meaning:movement:${metricChanged ? "gravity" : "meaning"}:${item.currentNodeId}`,
      kind: metricChanged ? "gravity_shift" : "meaningfully_updated",
      label: item.graphMetrics?.label ?? "의미 있게 갱신된 지식",
      nodeIds: [item.currentNodeId],
      edgeIds: [],
      previousValue: item.graphMetrics?.baseline ?? null,
      currentValue: {
        gravity: Number(item.graphMetrics?.gravity ?? 0),
        occurrences: Number(item.graphMetrics?.occurrenceCount ?? 0),
        meaningfulDate: item.graphMetrics?.meaningfulDate ?? null,
      },
      evidenceRefs: [item.currentNodeId],
      caveat: metricChanged
        ? "동일 노드의 실제 방향 참조 지표 변화입니다."
        : "본문 bytes가 달라졌지만 연결 수 변화와 동일시하지 않습니다.",
    });
  }
  return output
    .sort((left, right) => compareText(left.id, right.id))
    .slice(0, 12);
}

const movementKinds = new Set([
  "node_added",
  "edge_added",
  "edge_removed",
  "gravity_shift",
  "meaningfully_updated",
  "verified_handoff",
]);

function movementJudgmentRows(movementJudgments) {
  if (movementJudgments?.schema !== "atlas.v7_6.movement_judgment.v1"
    || !Array.isArray(movementJudgments.rows)) {
    throw new Error("Owner movement judgment blocked: invalid atlas.v7_6.movement_judgment.v1 pack.");
  }
  const sourcePaths = new Set();
  const orders = new Set();
  for (const [index, row] of movementJudgments.rows.entries()) {
    if (!row || typeof row !== "object"
      || typeof row.sourcePath !== "string" || !row.sourcePath
      || typeof row.label !== "string" || !row.label.trim()
      || typeof row.caveat !== "string" || !row.caveat.trim()
      || !movementKinds.has(row.kind)
      || !Number.isSafeInteger(row.order) || row.order < 0) {
      throw new Error(`Owner movement judgment blocked: invalid row at index ${index}.`);
    }
    if (sourcePaths.has(row.sourcePath)) {
      throw new Error(`Owner movement judgment blocked: duplicate source path ${row.sourcePath}.`);
    }
    if (orders.has(row.order)) {
      throw new Error(`Owner movement judgment blocked: duplicate order ${row.order}.`);
    }
    sourcePaths.add(row.sourcePath);
    orders.add(row.order);
  }
  return [...movementJudgments.rows].sort((left, right) =>
    left.order - right.order || compareText(left.sourcePath, right.sourcePath));
}

function exactDeltaSourceByPath(graphDelta) {
  if (!graphDelta || typeof graphDelta !== "object"
    || !graphDelta.sourceFiles || typeof graphDelta.sourceFiles !== "object") {
    throw new Error("Owner movement judgment blocked: graph delta is missing.");
  }
  const sourceByPath = new Map();
  for (const bucket of ["added", "changed", "removed"]) {
    const rows = graphDelta.sourceFiles[bucket];
    if (!Array.isArray(rows)) {
      throw new Error(`Owner movement judgment blocked: graph delta ${bucket} sources are missing.`);
    }
    for (const item of rows) {
      if (!item || typeof item.path !== "string") {
        throw new Error(`Owner movement judgment blocked: graph delta ${bucket} source is invalid.`);
      }
      if (sourceByPath.has(item.path)) {
        throw new Error(`Owner movement judgment blocked: duplicate graph delta source ${item.path}.`);
      }
      sourceByPath.set(item.path, item);
    }
  }
  return sourceByPath;
}

function exactIncidentDeltaEdges(graph, graphDelta, nodeId) {
  const edgeById = new Map(graph.edges.map((edge) => [edge.id, edge]));
  const addedEdgeIds = new Set(graphDelta.graph?.addedEdgeIds ?? []);
  const removedEdgeIds = new Set(graphDelta.graph?.removedEdgeIds ?? []);
  const added = [...addedEdgeIds]
    .map((edgeId) => edgeById.get(edgeId))
    .filter((edge) => edge && (edge.source === nodeId || edge.target === nodeId))
    .map((edge) => edge.id)
    .sort(compareText);
  const removed = (graphDelta.graph?.removedEdges ?? [])
    .filter((edge) => edge
      && removedEdgeIds.has(edge.id)
      && typeof edge.source === "string"
      && typeof edge.target === "string"
      && (edge.source === nodeId || edge.target === nodeId))
    .map((edge) => edge.id)
    .sort(compareText);
  return { added, removed, all: [...added, ...removed].sort(compareText) };
}

function permittedJudgmentKinds(item, graphDelta, incidentEdges) {
  const permitted = new Set();
  const delta = item.graphMetrics?.delta ?? {};
  const metricChanged = Number(delta.gravity ?? 0) !== 0
    || Number(delta.occurrenceCount ?? 0) !== 0;
  const nodeAdded = item.kind === "added"
    && (graphDelta.graph?.addedNodeIds ?? []).includes(item.currentNodeId);
  if (nodeAdded) permitted.add("node_added");
  if (item.kind === "changed" && item.graphMetrics?.sourceHashChanged) {
    permitted.add("meaningfully_updated");
  }
  if (item.kind === "changed" && metricChanged) permitted.add("gravity_shift");
  if (incidentEdges.added.length) permitted.add("edge_added");
  if (incidentEdges.removed.length) permitted.add("edge_removed");
  if (item.kind === "changed"
    && item.graphMetrics?.sourceHashChanged
    && incidentEdges.all.length) {
    permitted.add("verified_handoff");
  }
  return permitted;
}

function judgedOwnerMovements(graph, graphDelta, movementJudgments) {
  const rows = movementJudgmentRows(movementJudgments);
  const sourceByPath = exactDeltaSourceByPath(graphDelta);
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const seenNodeIds = new Set();
  return rows.map((row) => {
    const item = sourceByPath.get(row.sourcePath);
    if (!item) {
      throw new Error(`Owner movement judgment blocked: source is absent from graph delta: ${row.sourcePath}.`);
    }
    if (!item.currentNodeId || !nodeById.has(item.currentNodeId)) {
      throw new Error(`Owner movement judgment blocked: current graph node is absent for ${row.sourcePath}.`);
    }
    if (seenNodeIds.has(item.currentNodeId)) {
      throw new Error(`Owner movement judgment blocked: duplicate current node ${item.currentNodeId}.`);
    }
    seenNodeIds.add(item.currentNodeId);
    const node = nodeById.get(item.currentNodeId);
    const metrics = item.graphMetrics;
    if (!metrics
      || metrics.nodeId !== item.currentNodeId
      || metrics.path !== row.sourcePath
      || Number(metrics.gravity) !== Number(node.gravity)
      || Number(metrics.occurrenceCount) !== Number(node.occurrences)
      || (metrics.meaningfulDate ?? null) !== (node.freshness ?? null)) {
      throw new Error(`Owner movement judgment blocked: graph metrics do not match current node for ${row.sourcePath}.`);
    }
    const incidentEdges = exactIncidentDeltaEdges(graph, graphDelta, item.currentNodeId);
    const permitted = permittedJudgmentKinds(item, graphDelta, incidentEdges);
    if (!permitted.has(row.kind)) {
      throw new Error(`Owner movement judgment blocked: ${row.kind} is not supported by ${row.sourcePath}.`);
    }
    return {
      id: `meaning:movement:${row.kind.replaceAll("_", "-")}:${item.currentNodeId}`,
      kind: row.kind,
      label: row.label.trim(),
      nodeIds: [item.currentNodeId],
      edgeIds: incidentEdges.all,
      previousValue: item.kind === "added" ? null : metrics.baseline ?? null,
      currentValue: {
        gravity: Number(metrics.gravity),
        occurrences: Number(metrics.occurrenceCount),
        meaningfulDate: metrics.meaningfulDate ?? null,
      },
      evidenceRefs: [item.currentNodeId, ...incidentEdges.all],
      caveat: row.caveat.trim(),
    };
  });
}

function ownerMovements(graph, graphDelta, movementJudgments) {
  return movementJudgments == null
    ? defaultOwnerMovements(graph, graphDelta)
    : judgedOwnerMovements(graph, graphDelta, movementJudgments);
}

function districtId(graph, labels) {
  return graph.nodes.find((node) =>
    node.kind === "district" && labels.includes(node.label))?.id ?? null;
}

function actorId(agency, label) {
  return agency.actors.find((actor) => actor.label === label)?.id ?? null;
}

function buildOperationalCompass(graph, agency) {
  const moc = districtId(graph, ["MOC", "중심 지식"]);
  const papers = districtId(graph, ["Papers", "연구 논거"]);
  const signals = districtId(graph, ["Signals", "신호"]);
  const consoleDistrict = districtId(graph, ["Console", "운영 기반"]);
  const rows = [
    {
      id: "meaning:alignment:direction",
      kind: "direction",
      actorId: agency.principal.id,
      domainIds: [moc, papers, signals].filter(Boolean),
      label: "Direction",
      statement: "Luke가 지식 시스템이 풀어야 할 방향을 정합니다.",
    },
    {
      id: "meaning:alignment:stewardship",
      kind: "stewardship",
      actorId: actorId(agency, "Control Plane"),
      domainIds: [consoleDistrict].filter(Boolean),
      label: "Stewardship",
      statement: "Control Plane은 소유 경계와 검증 일관성을 관찰합니다.",
    },
    {
      id: "meaning:alignment:circulation",
      kind: "circulation",
      actorId: actorId(agency, "Daily Runner"),
      domainIds: [moc, papers, signals].filter(Boolean),
      label: "Circulation",
      statement: "Daily Runner는 신호와 근거가 중심 지식으로 순환하도록 돕습니다.",
    },
    {
      id: "meaning:alignment:translation",
      kind: "translation",
      actorId: actorId(agency, "Atlas Builder"),
      domainIds: [moc, papers, signals].filter(Boolean),
      label: "Translation",
      statement: "Atlas Builder는 Vault의 의미를 사람이 이해할 수 있는 제품으로 번역합니다.",
    },
    {
      id: "meaning:alignment:observation",
      kind: "observation",
      actorId: actorId(agency, "Intelligence Layer Manager"),
      domainIds: [signals].filter(Boolean),
      label: "Observation",
      statement: "Intelligence Layer는 검증된 외부 신호가 commons에 기여할 수 있는 경계를 소유합니다.",
    },
  ];
  return rows.filter((row) => row.actorId && row.domainIds.length > 0);
}

function buildScenes(protagonists, movements, compass) {
  const coreDomainIds = [...new Set(
    compass
      .filter((item) => item.kind === "direction" || item.kind === "circulation")
      .flatMap((item) => item.domainIds),
  )];
  return [
    {
      id: "core-gravity",
      label: "Core Domain Gravity",
      thesis: "Homi를 중심으로 MOC는 구조화하고, Papers는 근거를 공급하며, Signals는 변화를 감지합니다.",
      focusIds: coreDomainIds,
    },
    {
      id: "protagonists",
      label: "Protagonist Constellations",
      thesis: "선정된 주인공의 실제 incoming·outgoing 관계만 밝힙니다.",
      focusIds: protagonists.map((item) => item.nodeId),
    },
    {
      id: "vault-in-motion",
      label: "Vault in Motion",
      thesis: "이전 릴리스와 현재 캡처 사이의 검증된 변화만 보여줍니다.",
      focusIds: movements.flatMap((item) => item.nodeIds),
    },
    {
      id: "operational-compass",
      label: "Operational Compass",
      thesis: "지식 관계와 분리된 문법으로 방향·순환·번역·관찰 책임을 설명합니다.",
      focusIds: compass.flatMap((item) => item.domainIds),
    },
  ];
}

export function buildAtlasMeaningV1({
  graph,
  agency,
  generatedAt,
  baseline,
  baselineGraph = null,
  current,
  dossiers = [],
  graphDelta = null,
  movementJudgments = null,
}) {
  const dossierByNodeId = new Map();
  for (const dossier of dossiers) {
    dossierByNodeId.set(dossier.nodeId, dossier);
    if (dossier.publicNodeId) dossierByNodeId.set(dossier.publicNodeId, dossier);
  }
  const dossierByLabel = new Map(dossiers.map((dossier) => [dossier.label, dossier]));
  const selectedNodes = dossierProtagonistNodes(graph, dossiers);
  const protagonistNodes = selectedNodes.length >= 3
    ? selectedNodes
    : defaultProtagonistNodes(graph, graph.profile);
  const protagonists = protagonistNodes.map((node) => {
    const dossier = dossierByNodeId.get(node.id) ?? dossierByLabel.get(node.label);
    const judgment = cleanDossier(dossier, node);
    const incoming = graph.edges.filter((edge) => edge.target === node.id);
    const outgoing = graph.edges.filter((edge) => edge.source === node.id);
    return {
      id: `meaning:protagonist:${node.id}`,
      nodeId: node.id,
      role: judgment.role,
      thesis: judgment.thesis,
      caveat: judgment.caveat,
      metrics: {
        gravity: node.gravity,
        occurrences: node.occurrences,
        crossDomainReach: judgment.crossDomainReach,
        bridgeCentrality: judgment.bridgeCentrality,
        meaningfulDate: node.freshness,
        incomingCount: incoming.length,
        outgoingCount: outgoing.length,
      },
      evidenceRefs: [
        node.id,
        ...rankedEdges(incoming).slice(0, 6).map((edge) => edge.id),
        ...rankedEdges(outgoing).slice(0, 6).map((edge) => edge.id),
      ],
      selectionMode: "atlas_builder_judgment",
    };
  });
  const constellations = protagonistNodes.map((node) => buildConstellation(graph, node));
  const movements = graph.profile === "atlas-owner"
    ? ownerMovements(graph, graphDelta, movementJudgments)
    : publicMovements({ baseline: baselineGraph, current: graph });
  const operationalCompass = buildOperationalCompass(graph, agency);
  const scenes = buildScenes(protagonists, movements, operationalCompass);
  const withoutDigest = {
    schema: "atlas.meaning.v1",
    profile: graph.profile,
    generatedAt,
    baseline,
    current,
    protagonists,
    constellations,
    movements,
    operationalCompass,
    scenes,
    manifest: {
      protagonistCount: protagonists.length,
      constellationCount: constellations.length,
      movementCount: movements.length,
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

export function meaningInsightAdapter(meaning, relation = null, entity = null) {
  const core = meaning.scenes.find((scene) => scene.id === "core-gravity");
  const movement = meaning.movements[0] ?? null;
  const strongestPair = [...(relation?.matrix ?? [])]
    .sort((left, right) => right.wikilink - left.wikilink || compareText(left.id, right.id))[0] ?? null;
  const compatibilityEvidence = (entity?.entities ?? []).map((item) => item.id);
  const relationEvidence = compatibilityEvidence.length
    ? compatibilityEvidence
    : core?.focusIds?.length
      ? core.focusIds
      : meaning.protagonists[0]?.evidenceRefs ?? [];
  return {
    schema: "atlas.insight.v1",
    generatedAt: meaning.generatedAt,
    evidenceBoundary: "atlas.meaning.v1의 검증된 주인공·실제 관계·버전 변화·운영 정렬에서 생성한 호환 adapter입니다.",
    items: [
      {
        id: "insight:v76:core-gravity",
        kind: "knowledge_concentration",
        question: "Vault의 중심 지식 영역은 무엇을 담당하는가",
        headline: core?.thesis ?? "MOC·Papers·Signals의 역할을 구분합니다.",
        metric: { value: 3, label: "core domains", unit: "개" },
        evidenceRefs: relationEvidence,
        targetScene: { workspace: "home", scene: "core-gravity" },
        confidence: "high",
        caveat: "세 영역은 역할 설명이며 중요도 점수가 아닙니다.",
        publicSafe: meaning.profile === "atlas-public",
      },
      {
        id: "insight:v76:strongest-relation",
        kind: "strongest_relation",
        question: "공개 구역 사이에서 가장 강한 양방향 참조 쌍은 무엇인가",
        headline: strongestPair
          ? `${strongestPair.source} ↔ ${strongestPair.target}의 양방향 해결 링크 합계가 ${strongestPair.wikilink}회로 가장 많다`
          : "검증 가능한 공개 구역 관계가 없습니다.",
        metric: {
          value: strongestPair?.wikilink ?? 0,
          label: "양방향 해결 링크 합계",
          unit: "회",
        },
        evidenceRefs: relationEvidence.length ? relationEvidence : ["meaning:relation:none"],
        targetScene: {
          workspace: "observe",
          scene: "global-relations",
          ...(strongestPair ? {
            relationPairId: strongestPair.id,
            relationLayer: "wikilink",
          } : {}),
        },
        confidence: strongestPair ? "high" : "low",
        caveat: strongestPair
          ? `합계 ${strongestPair.wikilink}회는 ${strongestPair.source} → ${strongestPair.target} ${strongestPair.wikilinkForward}회와 ${strongestPair.target} → ${strongestPair.source} ${strongestPair.wikilinkReverse}회를 더한 fresh resolved link occurrence이며 두 방향은 따로 보존합니다.`
          : "관계 부재를 연결 0이나 단절로 추정하지 않습니다.",
        publicSafe: meaning.profile === "atlas-public",
      },
      {
        id: "insight:v76:movement",
        kind: "latest_pulse",
        question: "이전 릴리스 이후 무엇이 검증 가능하게 달라졌는가",
        headline: movement?.label ?? "공개할 수 있는 검증된 변화가 없습니다.",
        metric: { value: meaning.movements.length, label: "verified movements", unit: "개" },
        evidenceRefs: relationEvidence,
        targetScene: { workspace: "time", scene: "version-evolution" },
        confidence: movement ? "high" : "low",
        caveat: movement?.caveat ?? "부재를 변화 0이나 활동 부재로 추정하지 않습니다.",
        publicSafe: meaning.profile === "atlas-public",
      },
      {
        id: "insight:v76:compass",
        kind: "attention",
        question: "어떤 역할이 지식의 방향·순환·번역·관찰을 맡는가",
        headline: "Agent 역할을 지식 노드와 섞지 않고 운영 의미를 설명합니다.",
        metric: { value: meaning.operationalCompass.length, label: "operational alignments", unit: "개" },
        evidenceRefs: relationEvidence,
        targetScene: { workspace: "home", scene: "operational-compass" },
        confidence: "high",
        caveat: "정렬선은 command·approval·실시간 상태를 뜻하지 않습니다.",
        publicSafe: meaning.profile === "atlas-public",
      },
    ],
  };
}
