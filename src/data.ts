import { z } from "zod";
import type { AtlasData, Entity } from "./types";

const workspaceSchema = z.enum(["home", "explore", "observe", "flow", "time"]);
const relationLayerSchema = z.enum(["wikilink", "typed", "route"]);
export const DEFAULT_DAILY_ROUTE_ID = "daily";

const entitySchema = z.object({
  id: z.string().startsWith("doc:"),
  fileId: z.number().int().positive().optional(),
  path: z.string().min(1),
  title: z.string().min(1),
  displayLabel: z.string().min(1),
  aliases: z.array(z.string()),
  tags: z.array(z.string()),
  parentId: z.string(),
  district: z.string().min(1),
  topLevel: z.string().min(1),
  depth: z.number().int().nonnegative(),
  authority: z.string().min(1),
  currentness: z.string().min(1),
  currentnessRaw: z.string(),
  surfaceRole: z.string().min(1),
  sourceRole: z.string(),
  defaultPreload: z.boolean(),
  wordCount: z.number().nonnegative(),
  documentCount: z.number().int().nonnegative().optional(),
  mtimeNs: z.string().optional(),
  ageDays: z.number().nonnegative().nullable(),
  sha256: z.string().length(64),
  frontmatter: z.record(z.string(), z.unknown()),
}).strict();

const hierarchySchema = z.object({
  id: z.string().min(1),
  path: z.string(),
  label: z.string().min(1),
  parentId: z.string().nullable(),
  depth: z.number().int().nonnegative(),
  kind: z.enum(["vault", "district", "folder", "document"]),
  authority: z.string().min(1).optional(),
  currentness: z.string().min(1).optional(),
  surfaceRole: z.string().min(1).optional(),
  value: z.number().nonnegative().optional(),
  childrenCount: z.number().int().nonnegative(),
  documentCount: z.number().int().nonnegative(),
  authorityL1L2: z.number().int().nonnegative(),
}).strict();

const constellationCompositionSchema = z.object({
  unit: z.literal("documents"),
  folderGroupCount: z.number().int().nonnegative(),
  directDocumentCount: z.number().int().nonnegative(),
  directDocumentShare: z.number().min(0).max(1),
  categoryCount: z.number().int().nonnegative(),
  largestCategoryId: z.string().nullable(),
  largestCategoryShare: z.number().min(0).max(1),
  categories: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    kind: z.enum(["folder_group", "direct_documents"]),
    documentCount: z.number().int().positive(),
    share: z.number().positive().max(1),
  }).strict()),
  reconciled: z.literal(true),
}).strict();

const matrixSchema = z.object({
  id: z.string().startsWith("pair:"),
  source: z.string().min(1),
  target: z.string().min(1),
  wikilink: z.number().nonnegative(),
  wikilinkForward: z.number().nonnegative(),
  wikilinkReverse: z.number().nonnegative(),
  typed: z.number().nonnegative(),
  typedForward: z.number().nonnegative(),
  typedReverse: z.number().nonnegative(),
  route: z.number().nonnegative(),
  total: z.number().nonnegative(),
});

const relationCoverageLayerSchema = z.object({
  unit: z.enum(["resolved_link_occurrence", "typed_relation", "curated_cross_district_route_pair"]),
  total: z.number().int().nonnegative(),
  interDistrict: z.number().int().nonnegative(),
  intraDistrict: z.number().int().nonnegative(),
  displayed: z.number().int().nonnegative(),
  reconciled: z.boolean(),
  boundary: z.string().min(1),
});

const insightSchema = z.object({
  schema: z.literal("atlas.insight.v1"),
  generatedAt: z.string(),
  evidenceBoundary: z.string().min(1),
  items: z.array(z.object({
    id: z.string().min(1),
    kind: z.enum(["latest_pulse", "strongest_relation", "knowledge_concentration", "attention"]),
    question: z.string().min(1),
    headline: z.string().min(1),
    metric: z.object({ value: z.union([z.number(), z.string()]), label: z.string(), unit: z.string().optional() }),
    evidenceRefs: z.array(z.string()).min(1),
    targetScene: z.object({
      workspace: workspaceSchema,
      scene: z.string().min(1),
      focusId: z.string().optional(),
      lens: z.enum(["city", "lineage", "constellation"]).optional(),
      relationPairId: z.string().optional(),
      relationLayer: relationLayerSchema.optional(),
      routeId: z.string().optional(),
      eraId: z.number().int().positive().optional(),
    }),
    confidence: z.enum(["high", "medium", "low"]),
    caveat: z.string(),
    publicSafe: z.boolean(),
  })).length(4),
});

const publicationSchema = z.object({
  schema: z.literal("atlas.publication.v1"),
  profile: z.enum(["internal", "public"]),
  generatedAt: z.string(),
  publicSnapshotDigest: z.string().nullable(),
  allowedSurfaces: z.array(z.string()),
  excludedFields: z.array(z.string()),
  redactionCounts: z.record(z.string(), z.number().int().nonnegative()),
  blockers: z.array(z.string()),
});

const atlasSchema = z.object({
  bootstrap: z.object({
    schema: z.literal("atlas.snapshot.v7"),
    version: z.string(),
    generatedAt: z.string(),
    snapshot: z.object({
      officialCursor: z.number().int(),
      stateSnapshot: z.string().min(16),
      currentStateHash: z.string().length(64),
      candidateInputHash: z.string().length(64),
      activeManifestHash: z.string().length(64),
      memoryEngineCodeHash: z.string().length(64),
      memoryIndexHash: z.string().length(64),
      memoryEngineSchema: z.string(),
      memoryCorpusDigest: z.string().length(64),
      memoryFiles: z.number().int().positive(),
      graphConfigHash: z.string().length(64),
      graphJsonUsedAsNodeEdgeSource: z.literal(false),
      activeMarkdownCount: z.number().int().positive(),
      archiveMarkdownCount: z.number().int().nonnegative(),
      buildState: z.string(),
    }),
    proofBoundary: z.record(z.string(), z.string()),
    workspaces: z.array(workspaceSchema).length(5),
    defaultFocus: z.string(),
  }),
  structure: z.object({
    districts: z.array(z.object({
      id: z.string(),
      name: z.string(),
      documentCount: z.number().int().nonnegative(),
      wordCount: z.number().nonnegative(),
      typedRelations: z.number().int().nonnegative(),
      currentDocuments: z.number().int().nonnegative(),
      authorityL1L2: z.number().int().nonnegative(),
      constellationComposition: constellationCompositionSchema,
      topEntities: z.array(z.string()),
    }).strict()),
    hierarchyNodes: z.array(hierarchySchema).min(1),
    rootId: z.string(),
    archiveScope: z.object({
      active: z.number().int().positive(),
      archive: z.number().int().nonnegative(),
      defaultState: z.string(),
    }),
  }),
  relation: z.object({
    districtOrder: z.array(z.string()).min(1),
    matrix: z.array(matrixSchema),
    typedRelations: z.array(z.object({
      id: z.string(), source: z.string(), target: z.string(), relation: z.string(),
      evidence: z.string(), state: z.string(), layer: z.literal("typed"), proofState: z.string(),
    }).passthrough()),
    routeCoMembership: z.array(z.record(z.string(), z.unknown())),
    neighborhoods: z.record(z.string(), z.array(z.object({
      id: z.string(), direction: z.enum(["incoming", "outgoing"]), layer: relationLayerSchema,
      relation: z.string(), weight: z.number(), evidence: z.string().nullable(),
    }))),
    layerDefinitions: z.array(z.object({ id: relationLayerSchema, label: z.string(), meaning: z.string() })),
    availableLayers: z.array(relationLayerSchema).min(1),
    redactedLayers: z.array(relationLayerSchema),
    coverage: z.object({
      resolvedLinkPairs: z.number().int().nonnegative(),
      resolvedLinkWeight: z.number().int().nonnegative(),
      unresolvedLinks: z.record(z.string(), z.number().int().nonnegative()),
      unresolvedLinkTotal: z.number().int().nonnegative(),
      ambiguousLinks: z.number().int().nonnegative(),
      typedRelations: z.number().int().nonnegative(),
      layers: z.object({
        wikilink: relationCoverageLayerSchema,
        typed: relationCoverageLayerSchema,
        route: relationCoverageLayerSchema,
      }),
      boundary: z.string(),
    }),
  }),
  flow: z.object({
    coordinateContract: z.object({
      mode: z.literal("route_local_small_multiples"),
      sharedXAxis: z.literal(false),
      xUnit: z.literal("route-local ordered station index"),
      crossRouteAlignmentMeaning: z.literal("none"),
      readerLabel: z.string().min(1),
    }),
    routes: z.array(z.object({
      id: z.string(), label: z.string(), question: z.string(), members: z.array(z.string()),
      provenance: z.literal("curated_operating_lens"), classifier: z.string(), sourceRefs: z.array(z.string()),
      stations: z.array(z.object({
        id: z.string(),
        label: z.string(),
        order: z.number().int(),
        entityId: z.string().nullable(),
        external: z.boolean(),
        kind: z.enum(["standard", "proof_gate", "external"]).optional(),
      })),
    })).min(1),
    pulse: z.object({
      latestDailyId: z.string().nullable(), latestDailyDate: z.string().nullable(),
      sourceItemCount: z.number().nullable(), chains: z.array(z.record(z.string(), z.unknown())),
    }),
  }),
  temporal: z.object({
    eras: z.array(z.object({
      id: z.number().int().positive(), title: z.string(), range: z.string(), thesis: z.string(),
      evidenceRefs: z.array(z.string()), evidenceClass: z.string(),
      deltas: z.array(z.object({
        state: z.enum(["born", "persisted", "weakened", "retired", "unknown"]),
        label: z.string(), evidenceRef: z.string(), evidenceAnchor: z.string(), evidenceClass: z.string(),
        evidenceStatus: z.literal("recorded"),
      })),
      unknown: z.array(z.string()), proofBoundary: z.string(),
    })).min(1),
    currentEra: z.number().int().positive(),
  }),
  entity: z.object({ entities: z.array(entitySchema).min(1), searchFields: z.array(z.string()) }),
  health: z.object({
    memoryEngine: z.record(z.string(), z.unknown()),
    currentnessCounts: z.record(z.string(), z.number()),
    authorityCounts: z.record(z.string(), z.number()),
    unresolvedLinks: z.record(z.string(), z.number()),
    ambiguousAutoSelections: z.literal(0),
    unresolvedTypedRelations: z.literal(0),
    activeIsolates: z.array(z.string()),
    countReconciliation: z.object({
      entities: z.number().int().positive(),
      memoryFiles: z.number().int().positive(),
      hierarchyDocuments: z.number().int().positive(),
      pass: z.literal(true),
    }),
  }),
  insight: insightSchema,
  publication: publicationSchema,
});

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
    : activeEntityCount;
  const memoryEngineFiles = candidate.health.memoryEngine.files;
  const failures = [
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
      .filter((id) => !entityIds.has(id))
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
      ...insight.evidenceRefs
        .filter((reference) => !entityIds.has(reference))
        .map((reference) => `insight-evidence:${insight.id}:${reference}`),
      ...(insight.targetScene.focusId && !entityIds.has(insight.targetScene.focusId) && !hierarchyIds.has(insight.targetScene.focusId)
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
  ];
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
  for (const layer of relationLayerSchema.options) {
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
  for (const layer of relationLayerSchema.options) {
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
  if (!eraIds.has(candidate.temporal.currentEra)) failures.push(`current-era:${candidate.temporal.currentEra}`);
  if (!routeIds.has(DEFAULT_DAILY_ROUTE_ID)) failures.push(`default-route:${DEFAULT_DAILY_ROUTE_ID}`);
  return [...new Set(failures)];
}

export function validateAtlasPacks(candidate: unknown): AtlasData {
  const parsed = atlasSchema.safeParse(candidate);
  if (!parsed.success) {
    const details = parsed.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join(" | ");
    const message = `Atlas v7 데이터 계약 위반: ${details}`;
    showFatalDataError(message);
    throw new Error(message);
  }

  const validated = parsed.data as unknown as AtlasData;
  const referenceFailures = collectAtlasReferenceFailures(validated);
  if (referenceFailures.length) {
    const message = `Atlas v7 데이터 참조 무결성 실패: ${referenceFailures.slice(0, 8).join(", ")}`;
    showFatalDataError(message);
    throw new Error(message);
  }
  return validated;
}

const atlas = validateAtlasPacks(window.__HOMI_ATLAS_V7_PACKS__);

export const atlasData = atlas;
export const entityById = new Map<string, Entity>(
  atlasData.entity.entities.map((entity) => [entity.id, entity]),
);
export const hierarchyById = new Map(
  atlasData.structure.hierarchyNodes.map((node) => [node.id, node]),
);

export function hierarchyFocusForDistrict(name: string) {
  return atlasData.structure.hierarchyNodes.find(
    (node) => node.kind === "district" && node.label === name,
  )?.id ?? null;
}
