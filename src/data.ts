import { agencyTruthFailures } from "./agency/presentation";
import { collectAtlasShapeFailures } from "./data-contract";
import { resolveWorkspaceScene } from "./components/workspaceSceneRegistry";
import type { AtlasData } from "./types";

export const DEFAULT_DAILY_ROUTE_ID = "daily";
const REQUIRED_RUNTIME_PACKS = [
  "agency",
  "bootstrap",
  "inventory",
  "graph",
  "meaning",
  "relation",
  "flow",
  "temporal",
  "entity",
  "health",
  "insight",
  "publication",
] as const;

function isJsonObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  if (Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Reflect.ownKeys(value).every((key) => {
    if (typeof key !== "string") return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor?.enumerable === true && "value" in descriptor;
  });
}

const WIKILINK_WIRE_NEIGHBOR_KEYS = new Set(["id", "direction", "weight", "evidence", "w"]);

function isExactWikilinkWireNeighbor(value: unknown): value is Record<string, unknown> {
  if (!isJsonObject(value)) return false;
  const keys = Object.keys(value);
  return keys.length === WIKILINK_WIRE_NEIGHBOR_KEYS.size
    && keys.every((key) => WIKILINK_WIRE_NEIGHBOR_KEYS.has(key))
    && value.w === 1;
}

export function restoreRelationBrowserWireDefaults(candidate: unknown): unknown {
  if (!isJsonObject(candidate) || !isJsonObject(candidate.relation)
    || !isJsonObject(candidate.relation.neighborhoods)) return candidate;
  let changed = false;
  const neighborhoods = Object.fromEntries(Object.entries(candidate.relation.neighborhoods).map(([id, rows]) => {
    if (!Array.isArray(rows)) return [id, rows];
    return [id, rows.map((row) => {
      if (!isExactWikilinkWireNeighbor(row)) return row;
      changed = true;
      const { w: _wire, ...neighbor } = row;
      return { ...neighbor, layer: "wikilink", relation: "wikilink" };
    })];
  }));
  return changed ? { ...candidate, relation: { ...candidate.relation, neighborhoods } } : candidate;
}

export function showFatalDataError(message: string) {
  const root = document.getElementById("root");
  if (!root) return;
  root.replaceChildren();
  const section = document.createElement("section");
  section.className = "fatal-boundary";
  section.setAttribute("role", "alert");
  const eyebrow = document.createElement("span");
  eyebrow.textContent = "데이터 준비 확인";
  const title = document.createElement("h1");
  title.textContent = "지도를 안전하게 열지 못했습니다";
  const detail = document.createElement("p");
  detail.textContent = "데이터 연결 상태가 완전하지 않습니다. 최신 데이터가 준비된 뒤 다시 시도해 주세요.";
  detail.title = message;
  const retry = document.createElement("button");
  retry.type = "button";
  retry.textContent = "다시 불러오기";
  retry.addEventListener("click", () => window.location.reload());
  section.append(eyebrow, title, detail, retry);
  root.append(section);
}

export function collectAtlasReferenceFailures(candidate: AtlasData): string[] {
  const failures: string[] = [];
  const entityIds = new Set(candidate.entity.entities.map((entity) => entity.id));
  const nodeIds = new Set(candidate.graph.nodes.map((node) => node.id));
  const clusterIds = new Set(candidate.graph.clusters.map((cluster) => cluster.id));
  const coordinateIds = new Set(candidate.graph.layout.coordinates.map((coordinate) => coordinate.id));
  const edgeIds = new Set(candidate.graph.edges.map((edge) => edge.id));
  const routeIds = new Set(candidate.flow.routes.map((route) => route.id));
  const eraIds = new Set(candidate.temporal.eras.map((era) => era.id));
  const actorIds = new Set(candidate.agency.actors.map((actor) => actor.id));
  const principalIds = new Set<string>([candidate.agency.principal.id]);

  failures.push(...agencyTruthFailures(candidate.agency).map((failure) => `agency:${failure}`));
  if (nodeIds.size !== candidate.graph.nodes.length) failures.push("graph-node-duplicate");
  if (edgeIds.size !== candidate.graph.edges.length) failures.push("graph-edge-duplicate");
  if (clusterIds.size !== candidate.graph.clusters.length) failures.push("graph-cluster-duplicate");
  if (coordinateIds.size !== nodeIds.size || [...nodeIds].some((id) => !coordinateIds.has(id))) {
    failures.push("graph-coordinate-coverage");
  }
  if (candidate.graph.nodes.some((node) => !clusterIds.has(node.clusterId)
    || node.districtId !== node.clusterId
    || (node.parentId !== null && !nodeIds.has(node.parentId)))) failures.push("graph-node-reference");
  if (candidate.graph.nodes.some((node) => node.id.startsWith("actor:"))) failures.push("graph-actor-contamination");
  if (candidate.graph.edges.some((edge) => !nodeIds.has(edge.source) || !nodeIds.has(edge.target)
    || edge.kind !== "references" || edge.direction !== "forward" || edge.occurrenceCount <= 0)) {
    failures.push("graph-edge-truth");
  }
  if (candidate.graph.layout.coordinates.some((coordinate) => coordinate.x < 0 || coordinate.y < 0 || coordinate.z < 0
    || coordinate.depthLevel < 0 || coordinate.depthLevel > 4
    || coordinate.x > candidate.graph.layout.bounds.width || coordinate.y > candidate.graph.layout.bounds.height
    || coordinate.z > candidate.graph.layout.bounds.depth)) {
    failures.push("graph-coordinate-bounds");
  }
  if (candidate.graph.layout.defaultNodeIds.length > 60
    || candidate.graph.layout.defaultEdgeIds.length > 48
    || candidate.graph.layout.defaultNodeIds.some((id) => !nodeIds.has(id))
    || candidate.graph.layout.defaultEdgeIds.some((id) => !edgeIds.has(id))) failures.push("graph-default-budget");
  if (candidate.graph.manifest.nodeCount !== candidate.graph.nodes.length
    || candidate.graph.manifest.edgeCount !== candidate.graph.edges.length
    || candidate.graph.manifest.clusterCount !== candidate.graph.clusters.length) failures.push("graph-manifest-count");
  if (candidate.inventory.profile !== candidate.graph.profile) failures.push("graph-profile-mismatch");
  if (candidate.meaning.profile !== candidate.graph.profile) failures.push("meaning-profile-mismatch");
  if (candidate.meaning.current.graphSemanticDigest !== candidate.graph.manifest.semanticDigest
    || candidate.meaning.current.graphNodeCount !== candidate.graph.nodes.length
    || candidate.meaning.current.graphEdgeCount !== candidate.graph.edges.length) {
    failures.push("meaning-current-identity");
  }
  if (candidate.meaning.manifest.protagonistCount !== candidate.meaning.protagonists.length
    || candidate.meaning.manifest.constellationCount !== candidate.meaning.constellations.length
    || candidate.meaning.manifest.movementCount !== candidate.meaning.movements.length) {
    failures.push("meaning-manifest-count");
  }
  if (candidate.meaning.protagonists.some((item) => {
    const node = candidate.graph.nodes.find((candidateNode) => candidateNode.id === item.nodeId);
    return !node
      || node.gravity !== item.metrics.gravity
      || node.occurrences !== item.metrics.occurrences
      || candidate.graph.edges.filter((edge) => edge.target === item.nodeId).length !== item.metrics.incomingCount
      || candidate.graph.edges.filter((edge) => edge.source === item.nodeId).length !== item.metrics.outgoingCount;
  })) failures.push("meaning-protagonist-truth");
  if (candidate.meaning.constellations.some((item) => {
    if (!nodeIds.has(item.focalNodeId)) return true;
    const incoming = item.incomingEdgeIds.map((id) => candidate.graph.edges.find((edge) => edge.id === id));
    const outgoing = item.outgoingEdgeIds.map((id) => candidate.graph.edges.find((edge) => edge.id === id));
    return incoming.some((edge) => !edge || edge.target !== item.focalNodeId)
      || outgoing.some((edge) => !edge || edge.source !== item.focalNodeId)
      || item.boundedPathEdgeIds.some((id) => !edgeIds.has(id))
      || item.explanations.some((entry) => !edgeIds.has(entry.edgeId));
  })) failures.push("meaning-constellation-truth");
  if (candidate.meaning.movements.some((item) =>
    item.nodeIds.some((id) => !nodeIds.has(id))
    || item.edgeIds.some((id) => !edgeIds.has(id)))) failures.push("meaning-movement-reference");
  if (candidate.meaning.operationalCompass.some((item) =>
    (!actorIds.has(item.actorId) && !principalIds.has(item.actorId))
    || item.domainIds.some((id) => !nodeIds.has(id)))) failures.push("meaning-operational-reference");
  if (candidate.meaning.scenes.some((scene) =>
    scene.focusIds.some((id) => !nodeIds.has(id)))) failures.push("meaning-scene-reference");

  const inventoryTotal = candidate.inventory.namedCount + candidate.inventory.aggregateCount + candidate.inventory.excludedCount;
  if (candidate.inventory.unclassifiedCount !== 0
    || inventoryTotal !== candidate.inventory.physicalMarkdownCount
    || candidate.inventory.reconciliation.classifiedTotal !== inventoryTotal
    || candidate.inventory.reconciliation.pass !== true) failures.push("inventory-reconciliation");
  const coverage = candidate.inventory.coverage.reduce((total, row) => ({
    physical: total.physical + row.physical,
    named: total.named + row.named,
    aggregate: total.aggregate + row.aggregate,
    excluded: total.excluded + row.excluded,
  }), { physical: 0, named: 0, aggregate: 0, excluded: 0 });
  if (coverage.physical !== candidate.inventory.physicalMarkdownCount
    || coverage.named !== candidate.inventory.namedCount
    || coverage.aggregate !== candidate.inventory.aggregateCount
    || coverage.excluded !== candidate.inventory.excludedCount) failures.push("inventory-coverage");

  for (const cell of candidate.relation.matrix) {
    if (cell.total !== cell.wikilink + cell.typed + cell.route) failures.push(`matrix-total:${cell.id}`);
    if (cell.wikilink !== cell.wikilinkForward + cell.wikilinkReverse) failures.push(`matrix-direction:${cell.id}`);
  }
  for (const route of candidate.flow.routes) {
    if (route.members.some((id) => !entityIds.has(id) && !nodeIds.has(id))) failures.push(`flow-member:${route.id}`);
  }
  for (const insight of candidate.insight.items) {
    if (!resolveWorkspaceScene(insight.targetScene.workspace, insight.targetScene.scene)) failures.push(`insight-scene:${insight.id}`);
    if (insight.targetScene.focusId && !entityIds.has(insight.targetScene.focusId) && !nodeIds.has(insight.targetScene.focusId)) {
      failures.push(`insight-focus:${insight.id}`);
    }
    if (insight.targetScene.routeId && !routeIds.has(insight.targetScene.routeId)) failures.push(`insight-route:${insight.id}`);
    if (insight.targetScene.eraId && !eraIds.has(insight.targetScene.eraId)) failures.push(`insight-era:${insight.id}`);
  }
  if (candidate.temporal.currentEra === null && candidate.temporal.eras.length > 0) failures.push("temporal-current-null");
  if (candidate.temporal.currentEra !== null && !eraIds.has(candidate.temporal.currentEra)) failures.push("temporal-current-unknown");
  if (!entityIds.has(candidate.bootstrap.defaultFocus)) failures.push("bootstrap-default-focus");
  if (candidate.publication.profile === "public" && candidate.activity) failures.push("owner-activity:public-profile");
  if (candidate.publication.profile === "owner" && !candidate.activity) failures.push("owner-activity:missing");
  if (candidate.publication.profile === "public") {
    if (candidate.graph.nodes.some((node) => node.nameMode === "owner_name" || node.kind === "project_stage")) {
      failures.push("public-owner-node");
    }
  }
  return [...new Set(failures)];
}

export function validateAtlasPacks(candidate: unknown): AtlasData {
  const restored = restoreRelationBrowserWireDefaults(candidate);
  const shapeFailures = collectAtlasShapeFailures(restored);
  if (shapeFailures.length) {
    const message = `Atlas v7 데이터 계약 위반: ${shapeFailures.slice(0, 8).map((issue) => `${issue.path} ${issue.message}`).join(" | ")}`;
    showFatalDataError(message);
    throw new Error(message);
  }
  const validated = restored as AtlasData;
  const required = REQUIRED_RUNTIME_PACKS.find((name) => !isJsonObject((restored as Record<string, unknown>)[name]));
  if (required) throw new Error(`Atlas v7 데이터 계약 위반: atlas.${required} is missing.`);
  const expected = new Set<string>(REQUIRED_RUNTIME_PACKS);
  if (validated.publication.profile === "owner") expected.add("activity");
  const unknown = Object.keys(restored as Record<string, unknown>).find((name) => !expected.has(name));
  if (unknown) throw new Error(`Atlas v7 데이터 계약 위반: atlas.${unknown} is not allowed.`);
  const referenceFailures = collectAtlasReferenceFailures(validated);
  if (referenceFailures.length) {
    const message = `Atlas v7 데이터 참조 무결성 실패: ${referenceFailures.slice(0, 12).join(", ")}`;
    showFatalDataError(message);
    throw new Error(message);
  }
  return validated;
}
