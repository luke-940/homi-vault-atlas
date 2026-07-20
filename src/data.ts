import type { AtlasData } from "./types";
import { agencyTruthFailures } from "./agency/presentation";
import { resolveWorkspaceScene } from "./components/workspaceSceneRegistry";
import { isStructuralHub, isStructureSourceLevel } from "./structure-navigation";

export const DEFAULT_DAILY_ROUTE_ID = "daily";
const RELATION_LAYERS = ["wikilink", "typed", "route"] as const;
const REQUIRED_RUNTIME_PACKS = [
  "agency",
  "bootstrap",
  "inventory",
  "structure",
  "relation",
  "flow",
  "temporal",
  "entity",
  "health",
  "insight",
  "publication",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  return Object.getPrototypeOf(value) === Object.prototype;
}

function ownEnumerableDataDescriptor(record: Record<string, unknown>, key: string) {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor?.enumerable && "value" in descriptor ? descriptor : null;
}

const WIKILINK_WIRE_NEIGHBOR_KEYS = new Set(["id", "direction", "weight", "evidence", "w"]);

function isExactWikilinkWireNeighbor(value: unknown): value is Record<string, unknown> {
  if (!isJsonObject(value)) return false;
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== WIKILINK_WIRE_NEIGHBOR_KEYS.size
    || ownKeys.some((key) => typeof key !== "string" || !WIKILINK_WIRE_NEIGHBOR_KEYS.has(key))
  ) {
    return false;
  }
  for (const key of WIKILINK_WIRE_NEIGHBOR_KEYS) {
    if (!ownEnumerableDataDescriptor(value, key)) return false;
  }
  return ownEnumerableDataDescriptor(value, "w")?.value === 1;
}

function jsonObjectOwnFieldFailure(record: Record<string, unknown>, location: string): string | null {
  for (const key of Reflect.ownKeys(record)) {
    if (typeof key !== "string") return `${location}.symbol`;
    if (!ownEnumerableDataDescriptor(record, key)) return `${location}.${key}`;
  }
  return null;
}

function relationBrowserContainerFailure(candidate: unknown): string | null {
  if (!isJsonObject(candidate)) return "candidate";
  const candidateFieldFailure = jsonObjectOwnFieldFailure(candidate, "candidate");
  if (candidateFieldFailure) return candidateFieldFailure;
  const relation = ownEnumerableDataDescriptor(candidate, "relation")?.value;
  if (!isJsonObject(relation)) return "candidate.relation";
  const relationFieldFailure = jsonObjectOwnFieldFailure(relation, "candidate.relation");
  if (relationFieldFailure) return relationFieldFailure;
  const neighborhoods = ownEnumerableDataDescriptor(relation, "neighborhoods")?.value;
  if (!isJsonObject(neighborhoods)) return "candidate.relation.neighborhoods";
  const neighborhoodFieldFailure = jsonObjectOwnFieldFailure(
    neighborhoods,
    "candidate.relation.neighborhoods",
  );
  if (neighborhoodFieldFailure) return neighborhoodFieldFailure;
  return null;
}

function relationBrowserJsonShapeFailure(candidate: unknown): string | null {
  const containerFailure = relationBrowserContainerFailure(candidate);
  if (containerFailure) return containerFailure;
  const typedCandidate = candidate as Record<string, unknown>;
  const relation = ownEnumerableDataDescriptor(typedCandidate, "relation")?.value as Record<string, unknown>;
  const neighborhoods = ownEnumerableDataDescriptor(relation, "neighborhoods")?.value as Record<string, unknown>;
  for (const [sourceId, neighbors] of Object.entries(neighborhoods)) {
    if (!Array.isArray(neighbors)) return `candidate.relation.neighborhoods.${sourceId}`;
    for (const [index, neighbor] of neighbors.entries()) {
      const location = `candidate.relation.neighborhoods.${sourceId}.${index}`;
      if (!isJsonObject(neighbor)) return location;
      for (const key of Reflect.ownKeys(neighbor)) {
        if (typeof key !== "string") return `${location}.symbol`;
        if (!ownEnumerableDataDescriptor(neighbor, key)) return `${location}.${key}`;
      }
    }
  }
  return null;
}

export function restoreRelationBrowserWireDefaults(candidate: unknown): unknown {
  if (relationBrowserJsonShapeFailure(candidate)) return candidate;
  const typedCandidate = candidate as Record<string, unknown>;
  const relation = ownEnumerableDataDescriptor(typedCandidate, "relation")?.value as Record<string, unknown>;
  const neighborhoods = ownEnumerableDataDescriptor(relation, "neighborhoods")?.value as Record<string, unknown>;

  let changed = false;
  const restoredNeighborhoods = Object.fromEntries(
    Object.entries(neighborhoods).map(([sourceId, neighbors]) => {
      if (!Array.isArray(neighbors)) return [sourceId, neighbors];
      const restoredNeighbors = neighbors.map((neighbor) => {
        if (isExactWikilinkWireNeighbor(neighbor)) {
          changed = true;
          const restored = { ...neighbor };
          delete restored.w;
          return { ...restored, layer: "wikilink", relation: "wikilink" };
        }
        return neighbor;
      });
      return [sourceId, restoredNeighbors];
    }),
  );

  if (!changed) return candidate;
  return {
    ...typedCandidate,
    relation: {
      ...relation,
      neighborhoods: restoredNeighborhoods,
    },
  };
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
  const entityIdList = candidate.entity.entities.map((entity) => entity.id);
  const hierarchyIdList = candidate.structure.hierarchyNodes.map((node) => node.id);
  const entityIds = new Set(entityIdList);
  const hierarchyIds = new Set(hierarchyIdList);
  const hierarchyCandidateById = new Map(
    candidate.structure.hierarchyNodes.map((node) => [node.id, node]),
  );
  const eraIds = new Set(candidate.temporal.eras.map((era) => era.id));
  const routeIds = new Set(candidate.flow.routes.map((route) => route.id));
  const districtNames = candidate.structure.districts.map((district) => district.name);
  const districtNameSet = new Set(districtNames);
  const districtOrderSet = new Set(candidate.relation.districtOrder);
  const hierarchyDocumentCount = candidate.structure.hierarchyNodes.filter((node) => node.kind === "document").length;
  const districtDocumentCount = candidate.structure.districts.reduce(
    (total, district) => total + district.documentCount,
    0,
  );
  const activeEntityCount = candidate.entity.entities.length;
  const districtDocumentExpected = candidate.publication.profile === "public"
    ? candidate.publication.redactionCounts.aggregatedSourceDocuments ?? activeEntityCount
    : candidate.publication.profile === "owner"
      ? districtDocumentCount
      : activeEntityCount;
  const memoryEngineFiles = candidate.health.memoryEngine.files;
  const structureNodeIds = new Set(candidate.structure.nodes.map((node) => node.id));
  const inventoryClassifiedTotal = candidate.inventory.namedCount
    + candidate.inventory.aggregateCount
    + candidate.inventory.excludedCount;
  const failures = [
    ...agencyTruthFailures(candidate.agency).map((failure) => `agency:${failure}`),
    ...entityIdList
      .filter((id, index) => entityIdList.indexOf(id) !== index)
      .map((id) => `entity-duplicate:${id}`),
    ...hierarchyIdList
      .filter((id, index) => hierarchyIdList.indexOf(id) !== index)
      .map((id) => `hierarchy-duplicate:${id}`),
    ...candidate.structure.hierarchyNodes
      .filter((node) => node.parentId !== null && !hierarchyIds.has(node.parentId))
      .map((node) => `hierarchy-parent:${node.id}:${node.parentId}`),
    ...candidate.relation.typedRelations
      .flatMap((relation) => [relation.source, relation.target])
      .filter((id) => !entityIds.has(id))
      .map((id) => `relation:${id}`),
    ...candidate.flow.routes
      .flatMap((route) => [
        ...route.members,
        ...route.sourceRefs,
        ...route.stations.map((station) => station.entityId).filter(Boolean) as string[],
      ])
      .filter((id) => !entityIds.has(id) && !structureNodeIds.has(id))
      .map((id) => `flow:${id}`),
    ...Object.entries(candidate.relation.neighborhoods)
      .filter(([sourceId]) => !entityIds.has(sourceId))
      .map(([sourceId]) => `neighborhood-source:${sourceId}`),
    ...Object.entries(candidate.relation.neighborhoods)
      .flatMap(([sourceId, neighbors]) => neighbors
        .filter((neighbor) => !entityIds.has(neighbor.id))
        .map((neighbor) => `neighborhood-target:${sourceId}:${neighbor.id}`)),
    ...candidate.relation.districtOrder
      .filter((name, index, order) => order.indexOf(name) !== index)
      .map((name) => `district-order-duplicate:${name}`),
    ...candidate.relation.districtOrder
      .filter((name) => !districtNameSet.has(name))
      .map((name) => `district-order-unknown:${name}`),
    ...districtNames
      .filter((name) => !districtOrderSet.has(name))
      .map((name) => `district-order-missing:${name}`),
    ...candidate.relation.matrix.flatMap((cell) => [
      ...(!districtNameSet.has(cell.source) || !districtOrderSet.has(cell.source)
        ? [`matrix-source:${cell.id}:${cell.source}`]
        : []),
      ...(!districtNameSet.has(cell.target) || !districtOrderSet.has(cell.target)
        ? [`matrix-target:${cell.id}:${cell.target}`]
        : []),
    ]),
    ...candidate.temporal.eras.flatMap((era) => [
      ...era.evidenceRefs
        .filter((reference) => !entityIds.has(reference))
        .map((reference) => `era-evidence:${era.id}:${reference}`),
      ...era.deltas
        .filter((delta) => !entityIds.has(delta.evidenceRef))
        .map((delta) => `era-delta-evidence:${era.id}:${delta.evidenceRef}`),
    ]),
    ...candidate.insight.items.flatMap((insight) => [
      ...(!resolveWorkspaceScene(insight.targetScene.workspace, insight.targetScene.scene)
        ? [`insight-scene:${insight.id}:${insight.targetScene.workspace}:${insight.targetScene.scene}`]
        : []),
      ...insight.evidenceRefs
        .filter((reference) => !entityIds.has(reference))
        .map((reference) => `insight-evidence:${insight.id}:${reference}`),
      ...(insight.targetScene.focusId
        && !entityIds.has(insight.targetScene.focusId)
        && !hierarchyIds.has(insight.targetScene.focusId)
        && !structureNodeIds.has(insight.targetScene.focusId)
        ? [`insight-focus:${insight.id}:${insight.targetScene.focusId}`]
        : []),
      ...(insight.targetScene.relationPairId && !candidate.relation.matrix.some((pair) => pair.id === insight.targetScene.relationPairId)
        ? [`insight-relation:${insight.id}:${insight.targetScene.relationPairId}`]
        : []),
      ...(insight.targetScene.routeId && !routeIds.has(insight.targetScene.routeId)
        ? [`insight-route:${insight.id}:${insight.targetScene.routeId}`]
        : []),
      ...(insight.targetScene.eraId && !eraIds.has(insight.targetScene.eraId)
        ? [`insight-era:${insight.id}:${insight.targetScene.eraId}`]
        : []),
    ]),
    ...candidate.structure.nodes
      .filter((node, index, nodes) => nodes.findIndex((item) => item.id === node.id) !== index)
      .map((node) => `structure-v2-duplicate:${node.id}`),
    ...candidate.structure.nodes
      .filter((node) => node.parentId !== null && !structureNodeIds.has(node.parentId))
      .map((node) => `structure-v2-parent:${node.id}:${node.parentId}`),
    ...candidate.structure.associations
      .filter((association) => !structureNodeIds.has(association.source) || !structureNodeIds.has(association.target))
      .map((association) => `structure-v2-association:${association.id}`),
  ];
  if (candidate.inventory.profile !== candidate.structure.profile) {
    failures.push(`profile-mismatch:${candidate.inventory.profile}:${candidate.structure.profile}`);
  }
  if (candidate.inventory.unclassifiedCount !== 0) failures.push("inventory-unclassified");
  if (inventoryClassifiedTotal !== candidate.inventory.physicalMarkdownCount) {
    failures.push(`inventory-reconciliation:${inventoryClassifiedTotal}:${candidate.inventory.physicalMarkdownCount}`);
  }
  if (candidate.inventory.reconciliation.classifiedTotal !== inventoryClassifiedTotal
    || candidate.inventory.reconciliation.pass !== true) {
    failures.push("inventory-reconciliation-evidence");
  }
  const coveragePhysical = candidate.inventory.coverage.reduce((total, row) => total + row.physical, 0);
  const coverageNamed = candidate.inventory.coverage.reduce((total, row) => total + row.named, 0);
  const coverageAggregate = candidate.inventory.coverage.reduce((total, row) => total + row.aggregate, 0);
  const coverageExcluded = candidate.inventory.coverage.reduce((total, row) => total + row.excluded, 0);
  if (coveragePhysical !== candidate.inventory.physicalMarkdownCount
    || coverageNamed !== candidate.inventory.namedCount
    || coverageAggregate !== candidate.inventory.aggregateCount
    || coverageExcluded !== candidate.inventory.excludedCount) {
    failures.push("inventory-coverage-reconciliation");
  }
  if (candidate.structure.nodes.some((node) => node.id.startsWith("actor:"))) {
    failures.push("structure-v2-actor-contamination");
  }
  const structureNodeById = new Map(candidate.structure.nodes.map((node) => [node.id, node]));
  const primaryMembershipCounts = new Map<string, number>();
  for (const association of candidate.structure.associations.filter((edge) => edge.kind === "member_of")) {
    primaryMembershipCounts.set(association.source, (primaryMembershipCounts.get(association.source) ?? 0) + 1);
  }
  if (candidate.inventory.profile === "atlas-owner") {
    const ownerDocumentNodes = candidate.structure.nodes.filter((node) =>
      node.kind !== "district" && node.nameMode === "owner_name");
    const ownerNonDistrictNodes = candidate.structure.nodes.filter((node) => node.kind !== "district");
    const represented = ownerDocumentNodes.reduce((total, node) => total + node.documentCount, 0);
    if (ownerDocumentNodes.length !== candidate.inventory.namedCount || represented !== candidate.inventory.namedCount) {
      failures.push(`owner-primary-count:${ownerDocumentNodes.length}:${represented}:${candidate.inventory.namedCount}`);
    }
    if (ownerNonDistrictNodes.some((node) => node.parentId === null || primaryMembershipCounts.get(node.id) !== 1)) {
      failures.push("owner-primary-parent-not-exactly-one");
    }
  }
  if (candidate.inventory.profile === "atlas-public") {
    const publicRepresented = candidate.structure.nodes
      .filter((node) => node.kind !== "district" && node.nameMode !== "public_alias")
      .reduce((total, node) => total + node.documentCount, 0);
    const expectedRepresented = candidate.inventory.namedCount + candidate.inventory.aggregateCount;
    if (publicRepresented !== expectedRepresented) {
      failures.push(`public-primary-count:${publicRepresented}:${expectedRepresented}`);
    }
    if (candidate.structure.nodes.some((node) => node.nameMode === "aggregate"
      && (node.parentId === null || structureNodeById.get(node.parentId)?.kind === "district" || node.documentCount <= 0))) {
      failures.push("public-aggregate-child-invalid");
    }
  }
  for (const node of candidate.structure.nodes) {
    if (!isStructureSourceLevel(node)) continue;
    const visited = new Set([node.id]);
    let parent = node.parentId === null ? undefined : structureNodeById.get(node.parentId);
    let hasHubAncestor = false;
    while (parent && !visited.has(parent.id)) {
      if (isStructuralHub(parent)) {
        hasHubAncestor = true;
        break;
      }
      visited.add(parent.id);
      parent = parent.parentId === null ? undefined : structureNodeById.get(parent.parentId);
    }
    if (!hasHubAncestor) failures.push(`structure-v2-source-without-hub:${node.id}`);
  }
  for (const node of candidate.structure.nodes) {
    const visited = new Set<string>();
    let cursor: string | null = node.id;
    while (cursor !== null) {
      if (visited.has(cursor)) {
        failures.push(`structure-v2-cycle:${node.id}:${cursor}`);
        break;
      }
      visited.add(cursor);
      cursor = structureNodeById.get(cursor)?.parentId ?? null;
    }
  }
  for (const node of candidate.structure.hierarchyNodes) {
    const visited = new Set<string>();
    let cursor: string | null = node.id;
    while (cursor !== null) {
      if (visited.has(cursor)) {
        failures.push(`hierarchy-cycle:${node.id}:${cursor}`);
        break;
      }
      visited.add(cursor);
      cursor = hierarchyCandidateById.get(cursor)?.parentId ?? null;
    }
  }
  const matrixLayerTotals = candidate.relation.matrix.reduce(
    (totals, cell) => ({
      wikilink: totals.wikilink + cell.wikilink,
      typed: totals.typed + cell.typed,
      route: totals.route + cell.route,
    }),
    { wikilink: 0, typed: 0, route: 0 },
  );
  for (const cell of candidate.relation.matrix) {
    if (cell.total !== cell.wikilink + cell.typed + cell.route) {
      failures.push(`matrix-total:${cell.id}`);
    }
    if (cell.typed !== cell.typedForward + cell.typedReverse) {
      failures.push(`matrix-typed-direction:${cell.id}`);
    }
    if (cell.wikilink !== cell.wikilinkForward + cell.wikilinkReverse) {
      failures.push(`matrix-wikilink-direction:${cell.id}`);
    }
  }
  for (const layer of RELATION_LAYERS) {
    const coverage = candidate.relation.coverage.layers[layer];
    if (coverage.total !== coverage.interDistrict + coverage.intraDistrict) {
      failures.push(`coverage-total:${layer}`);
    }
    if (coverage.displayed !== coverage.interDistrict || matrixLayerTotals[layer] !== coverage.displayed) {
      failures.push(`coverage-displayed:${layer}`);
    }
    if (!coverage.reconciled) failures.push(`coverage-flag:${layer}`);
  }
  const unresolvedLinkCount = Object.values(candidate.relation.coverage.unresolvedLinks)
    .reduce((total, count) => total + count, 0);
  if (candidate.relation.coverage.unresolvedLinkTotal !== unresolvedLinkCount) {
    failures.push("coverage-unresolved-total");
  }
  if (candidate.relation.coverage.ambiguousLinks !== (candidate.relation.coverage.unresolvedLinks.ambiguous ?? 0)) {
    failures.push("coverage-ambiguous-total");
  }
  if (candidate.relation.coverage.resolvedLinkWeight !== candidate.relation.coverage.layers.wikilink.total) {
    failures.push("coverage-wikilink-weight");
  }
  if (
    candidate.relation.coverage.typedRelations !== candidate.relation.typedRelations.length
    || candidate.relation.coverage.layers.typed.total !== candidate.relation.typedRelations.length
  ) {
    failures.push("coverage-typed-count");
  }
  if (candidate.relation.coverage.layers.route.total !== candidate.relation.routeCoMembership.length) {
    failures.push("coverage-route-count");
  }
  const availableLayerSet = new Set(candidate.relation.availableLayers);
  const redactedLayerSet = new Set(candidate.relation.redactedLayers);
  if (availableLayerSet.size !== candidate.relation.availableLayers.length) failures.push("available-layer-duplicate");
  if (redactedLayerSet.size !== candidate.relation.redactedLayers.length) failures.push("redacted-layer-duplicate");
  for (const layer of RELATION_LAYERS) {
    if (availableLayerSet.has(layer) === redactedLayerSet.has(layer)) failures.push(`relation-layer-boundary:${layer}`);
  }

  const reconciledCounts: Array<[string, number]> = [
    ["snapshot-active", candidate.bootstrap.snapshot.activeMarkdownCount],
    ["snapshot-memory", candidate.bootstrap.snapshot.memoryFiles],
    ["archive-active", candidate.structure.archiveScope.active],
    ["hierarchy-documents", hierarchyDocumentCount],
  ];
  const healthReconciliationCounts: Array<[string, number | boolean]> = [
    ["health-entities", candidate.health.countReconciliation.entities],
    ["health-memory", candidate.health.countReconciliation.memoryFiles],
    ["health-hierarchy", candidate.health.countReconciliation.hierarchyDocuments],
  ];
  for (const [label, count] of healthReconciliationCounts) {
    if (typeof count === "number") reconciledCounts.push([label, count]);
    else failures.push(`count-${label}:not-numeric`);
  }
  if (typeof memoryEngineFiles === "number") {
    reconciledCounts.push(["memory-engine-files", memoryEngineFiles]);
  } else {
    failures.push("count-memory-engine-files:not-numeric");
  }
  for (const [label, count] of reconciledCounts) {
    if (count !== activeEntityCount) failures.push(`count-${label}:${count}:${activeEntityCount}`);
  }
  if (districtDocumentCount !== districtDocumentExpected) {
    failures.push(`count-district-documents:${districtDocumentCount}:${districtDocumentExpected}`);
  }
  if (candidate.bootstrap.snapshot.archiveMarkdownCount !== candidate.structure.archiveScope.archive) {
    failures.push(
      `count-archive:${candidate.bootstrap.snapshot.archiveMarkdownCount}:${candidate.structure.archiveScope.archive}`,
    );
  }
  if (candidate.publication.profile === "public" && candidate.activity) {
    failures.push("owner-activity:public-profile");
  }
  if (candidate.publication.profile === "owner" && !candidate.activity) {
    failures.push("owner-activity:missing");
  }
  if (candidate.health.ambiguousAutoSelections !== 0) {
    failures.push(`ambiguous-auto-selection:${candidate.health.ambiguousAutoSelections}`);
  }
  if (candidate.health.unresolvedTypedRelations !== 0) {
    failures.push(`unresolved-typed-relation:${candidate.health.unresolvedTypedRelations}`);
  }
  if (candidate.health.countReconciliation.pass !== true) failures.push("count-reconciliation-flag:false");
  const currentnessCount = Object.values(candidate.health.currentnessCounts)
    .reduce((total, count) => total + count, 0);
  const authorityCount = Object.values(candidate.health.authorityCounts)
    .reduce((total, count) => total + count, 0);
  if (currentnessCount !== activeEntityCount) failures.push(`count-currentness:${currentnessCount}:${activeEntityCount}`);
  if (authorityCount !== activeEntityCount) failures.push(`count-authority:${authorityCount}:${activeEntityCount}`);
  if (!hierarchyIds.has(candidate.structure.rootId)) failures.push(`root:${candidate.structure.rootId}`);
  if (hierarchyCandidateById.get(candidate.structure.rootId)?.parentId !== null) {
    failures.push(`root-parent:${candidate.structure.rootId}`);
  }
  if (!entityIds.has(candidate.bootstrap.defaultFocus)) failures.push(`default-focus:${candidate.bootstrap.defaultFocus}`);
  if (candidate.temporal.currentEra === null) {
    if (candidate.temporal.eras.length > 0) failures.push("current-era:null-with-recorded-eras");
  } else if (!eraIds.has(candidate.temporal.currentEra)) {
    failures.push(`current-era:${candidate.temporal.currentEra}`);
  }
  return [...new Set(failures)];
}

export function validateAtlasPacks(candidate: unknown): AtlasData {
  const jsonShapeFailure = relationBrowserJsonShapeFailure(candidate);
  if (jsonShapeFailure) {
    const message = `Atlas v7 데이터 계약 위반: ${jsonShapeFailure} must be a plain JSON object with own enumerable data fields.`;
    showFatalDataError(message);
    throw new Error(message);
  }

  const restored = restoreRelationBrowserWireDefaults(candidate);
  if (!isJsonObject(restored)) {
    const message = "Atlas v7 데이터 계약 위반: atlas must be an aggregate JSON object.";
    showFatalDataError(message);
    throw new Error(message);
  }
  const missingPack = REQUIRED_RUNTIME_PACKS.find((name) => !isJsonObject(restored[name]));
  if (missingPack) {
    const message = `Atlas v7 데이터 계약 위반: atlas.${missingPack} is missing.`;
    showFatalDataError(message);
    throw new Error(message);
  }
  const expectedPackNames = new Set<string>(REQUIRED_RUNTIME_PACKS);
  if ((restored.publication as Record<string, unknown>).profile === "owner") {
    expectedPackNames.add("activity");
  }
  const unknownPack = Object.keys(restored).find((name) => !expectedPackNames.has(name));
  if (unknownPack) {
    const message = `Atlas v7 데이터 계약 위반: atlas.${unknownPack} is not allowed.`;
    showFatalDataError(message);
    throw new Error(message);
  }
  if ((restored.agency as Record<string, unknown>).schema !== "atlas.agency.v1"
    || (restored.bootstrap as Record<string, unknown>).schema !== "atlas.snapshot.v7"
    || (restored.inventory as Record<string, unknown>).schema !== "atlas.inventory.v1"
    || (restored.structure as Record<string, unknown>).schema !== "atlas.structure.v2"
    || (restored.publication as Record<string, unknown>).schema !== "atlas.publication.v1") {
    const message = "Atlas v7 데이터 계약 위반: public pack schema envelope mismatch.";
    showFatalDataError(message);
    throw new Error(message);
  }
  return restored as unknown as AtlasData;
}
