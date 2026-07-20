export type Workspace = "home" | "explore" | "observe" | "flow" | "time" | "agency";
export type ExploreLens = "city";
export type RelationLayer = "wikilink" | "typed" | "route";
export type AgencyScene = "system" | "roles" | "evolution";
export type AgencyGroupKind = "core" | "independent";
export type AgencyLinkKind =
  | "sets_direction"
  | "coordinates_boundary"
  | "owns_surface"
  | "returns_result"
  | "returns_evidence";
export type InsightKind = "latest_pulse" | "strongest_relation" | "knowledge_concentration" | "attention";
export type InsightConfidence = "high" | "medium" | "low";
export type AtlasProfile = "atlas-owner" | "atlas-public";
export type InventoryDisposition = "named" | "aggregate" | "excluded";
export type InventoryExclusionReason =
  | "archive"
  | "scaffolding"
  | "control_internal"
  | "raw_daily"
  | "explicit_policy"
  | "public_name_not_approved";
export type AtlasStructureNodeKind =
  | "district"
  | "moc_hub"
  | "paper_gateway"
  | "strategy_insight"
  | "strategy_request"
  | "project"
  | "project_stage"
  | "signal_domain"
  | "signal_storyline"
  | "source_document"
  | "aggregate_boundary";

export interface InventoryCoverage {
  id: string;
  label: string;
  physical: number;
  named: number;
  aggregate: number;
  excluded: number;
}

export interface AtlasInventoryV1 {
  schema: "atlas.inventory.v1";
  profile: AtlasProfile;
  generatedAt: string;
  asOfDate: string;
  physicalMarkdownCount: number;
  namedCount: number;
  aggregateCount: number;
  excludedCount: number;
  unclassifiedCount: 0;
  reconciliation: {
    classifiedTotal: number;
    pass: true;
  };
  coverage: InventoryCoverage[];
  exclusions: {
    priority: [
      "archive",
      "scaffolding",
      "control_internal",
      "raw_daily",
      "explicit_policy",
      "public_name_not_approved",
    ];
    byReason: Record<InventoryExclusionReason, number>;
  };
  publicTitlePolicy: {
    schema: "public-title-allowlist.v1";
    mode: "safe_hybrid";
    fallback: "alias_or_aggregate";
    projectCountDisclosure: "combined_non_attributable" | "owner_exact";
  };
}

export interface AtlasStructureNodeV2 {
  id: string;
  kind: AtlasStructureNodeKind;
  label: string;
  parentId: string | null;
  districtId: string;
  documentCount: number;
  uniqueInboundDocuments: number;
  inboundLinkOccurrences: number;
  lastMeaningfulDate: string | null;
  nameMode: "approved_name" | "public_alias" | "aggregate" | "owner_name";
}

export interface AtlasStructureAssociationV2 {
  id: string;
  source: string;
  target: string;
  kind: "member_of" | "associated_with" | "project_stage_of" | "evidence_for" | "references";
  weight: number;
}

export interface AtlasActivityV1 {
  schema: "atlas.activity.v1";
  profile: "atlas-owner";
  generatedAt: string;
  asOfDate: string;
  live: false;
  boundary: string;
  aggregates: Array<{
    role: string;
    unitType: string;
    status: string;
    date: string | null;
    count: number;
  }>;
  lifecycle: Array<{
    date: string;
    created: number;
    completed: number;
    stopped: number;
  }>;
}

export interface InsightTargetScene {
  workspace: Workspace;
  scene: string;
  focusId?: string;
  lens?: ExploreLens;
  relationPairId?: string;
  relationLayer?: RelationLayer;
  routeId?: string;
  eraId?: number;
}

export interface AtlasInsight {
  id: string;
  kind: InsightKind;
  question: string;
  headline: string;
  metric: {
    value: number | string;
    label: string;
    unit?: string;
  };
  evidenceRefs: string[];
  targetScene: InsightTargetScene;
  confidence: InsightConfidence;
  caveat: string;
  publicSafe: boolean;
}

export interface InsightPack {
  schema: "atlas.insight.v1";
  generatedAt: string;
  evidenceBoundary: string;
  items: AtlasInsight[];
}

export interface PublicationPack {
  schema: "atlas.publication.v1";
  profile: "internal" | "owner" | "public";
  generatedAt: string;
  publicSnapshotDigest: string | null;
  allowedSurfaces: string[];
  excludedFields: string[];
  redactionCounts: Record<string, number>;
  blockers: string[];
}

export interface AgencyGroup {
  id: string;
  label: string;
  kind: AgencyGroupKind;
  actorIds: string[];
}

export interface AgencyActor {
  id: string;
  label: string;
  groupId: string;
  purpose: string;
  ownedSurfaceId: string;
  publicOutput: string;
  proof: string;
  stopBoundary: string;
}

export interface AgencySurface {
  id: string;
  label: string;
  actorId: string;
}

export interface AgencyLink {
  id: string;
  source: string;
  target: string;
  kind: AgencyLinkKind;
}

export interface AtlasAgencyV1 {
  schema: "atlas.agency.v1";
  generatedAt: string;
  snapshot: {
    asOfDate: string;
    status: "current_at_release_capture";
    live: false;
    caveat: string;
  };
  principal: {
    id: "agency:principal:luke";
    label: "Luke";
    kind: "human_principal";
  };
  groups: AgencyGroup[];
  actors: AgencyActor[];
  surfaces: AgencySurface[];
  links: AgencyLink[];
  transition: {
    id: "agency:transition:role-specialization";
    label: string;
    kind: "responsibility_specialization";
    fromModel: "single_coordination";
    toActorIds: ["actor:control-plane", "actor:daily-runner", "actor:atlas-builder"];
    evidenceStatus: "verified_operating_model";
  };
  evidenceBoundary: string;
  projectionDigest: string;
}

export interface SnapshotPack {
  schema: "atlas.snapshot.v7";
  version: string;
  generatedAt: string;
  snapshot: {
    officialCursor?: number;
    stateSnapshot?: string;
    currentStateHash?: string;
    candidateInputHash?: string;
    activeManifestHash?: string;
    memoryEngineCodeHash?: string;
    memoryIndexHash?: string;
    memoryEngineSchema: string;
    memoryCorpusDigest?: string;
    memoryFiles: number;
    graphConfigHash?: string;
    graphJsonUsedAsNodeEdgeSource: false;
    activeMarkdownCount: number;
    archiveMarkdownCount: number;
    buildState: string;
  };
  proofBoundary: Record<string, string>;
  workspaces: Workspace[];
  defaultFocus: string;
}

export interface Entity {
  id: string;
  fileId?: number;
  path: string;
  title: string;
  displayLabel: string;
  aliases: string[];
  tags: string[];
  parentId: string;
  district: string;
  topLevel: string;
  depth: number;
  authority: string;
  currentness: string;
  currentnessRaw: string;
  surfaceRole: string;
  sourceRole: string;
  defaultPreload: boolean;
  wordCount: number;
  documentCount?: number;
  mtimeNs?: string;
  ageDays: number | null;
  sha256?: string;
  frontmatter: Record<string, unknown>;
}

export interface HierarchyNode {
  id: string;
  path: string;
  label: string;
  parentId: string | null;
  depth: number;
  kind: "vault" | "district" | "folder" | "document";
  authority?: string;
  currentness?: string;
  surfaceRole?: string;
  value?: number;
  childrenCount: number;
  documentCount: number;
  authorityL1L2: number;
}

export interface District {
  id: string;
  name: string;
  documentCount: number;
  wordCount: number;
  typedRelations: number;
  currentDocuments: number;
  authorityL1L2: number;
  topEntities: string[];
}

export interface MatrixCell {
  id: string;
  source: string;
  target: string;
  wikilink: number;
  wikilinkForward: number;
  wikilinkReverse: number;
  typed: number;
  typedForward: number;
  typedReverse: number;
  route: number;
  total: number;
}

export interface TypedRelation {
  id: string;
  source: string;
  target: string;
  relation: string;
  evidence: string;
  state: string;
  layer: "typed";
  proofState: string;
}

export interface Neighbor {
  id: string;
  direction: "incoming" | "outgoing";
  layer: RelationLayer;
  relation: string;
  weight: number;
  evidence: string | null;
}

export interface RelationLayerCoverage {
  unit: "resolved_link_occurrence" | "typed_relation" | "curated_cross_district_route_pair";
  total: number;
  interDistrict: number;
  intraDistrict: number;
  displayed: number;
  reconciled: boolean;
  boundary: string;
}

export type RouteStationKind = "standard" | "proof_gate" | "external";

export interface RouteStation {
  id: string;
  label: string;
  order: number;
  entityId: string | null;
  external: boolean;
  kind?: RouteStationKind;
}

export interface Route {
  id: string;
  label: string;
  question: string;
  weight: number;
  members: string[];
  provenance: "curated_operating_lens" | "resolved_wikilink_path";
  classifier: string;
  sourceRefs: string[];
  stations: RouteStation[];
}

export interface EraRecord {
  id: number;
  title: string;
  range: string;
  thesis: string;
  evidenceRefs: string[];
  evidenceClass: string;
  deltas: Array<{
    state: "born" | "persisted" | "weakened" | "retired" | "unknown";
    label: string;
    evidenceRef: string;
    evidenceAnchor: string;
    evidenceClass: string;
    evidenceStatus: "recorded";
  }>;
  unknown: string[];
  proofBoundary: string;
}

export interface AtlasData {
  bootstrap: SnapshotPack;
  inventory: AtlasInventoryV1;
  structure: {
    schema: "atlas.structure.v2";
    profile: AtlasProfile;
    generatedAt: string;
    districts: District[];
    hierarchyNodes: HierarchyNode[];
    rootId: string;
    archiveScope: { active: number; archive: number; defaultState: string };
    nodes: AtlasStructureNodeV2[];
    associations: AtlasStructureAssociationV2[];
    measurement: {
      gravityMetric: "uniqueInboundDocuments";
      occurrenceMetric: "inboundLinkOccurrences";
      freshnessSource: "semantic_date_only";
    };
  };
  relation: {
    districtOrder: string[];
    matrix: MatrixCell[];
    typedRelations: TypedRelation[];
    routeCoMembership: Array<Record<string, unknown>>;
    neighborhoods: Record<string, Neighbor[]>;
    layerDefinitions: Array<{ id: RelationLayer; label: string; meaning: string }>;
    availableLayers: RelationLayer[];
    redactedLayers: RelationLayer[];
    coverage: {
      resolvedLinkPairs: number;
      resolvedLinkWeight: number;
      unresolvedLinks: Record<string, number>;
      unresolvedLinkTotal: number;
      ambiguousLinks: number;
      typedRelations: number;
      layers: Record<RelationLayer, RelationLayerCoverage>;
      boundary: string;
    };
  };
  flow: {
    coordinateContract: {
      mode: "route_local_small_multiples";
      sharedXAxis: false;
      xUnit: "route-local ordered station index";
      crossRouteAlignmentMeaning: "none";
      readerLabel: string;
    };
    routes: Route[];
    pulse: {
      latestDailyId: string | null;
      latestDailyDate: string | null;
      sourceItemCount: number | null;
      chains: Array<Record<string, unknown>>;
    };
  };
  temporal: { eras: EraRecord[]; currentEra: number | null };
  entity: { entities: Entity[]; searchFields: string[] };
  health: {
    memoryEngine: Record<string, unknown>;
    currentnessCounts: Record<string, number>;
    authorityCounts: Record<string, number>;
    unresolvedLinks: Record<string, number>;
    ambiguousAutoSelections: number;
    unresolvedTypedRelations: number;
    activeIsolates: string[];
    countReconciliation: Record<string, number | boolean>;
  };
  insight: InsightPack;
  publication: PublicationPack;
  agency: AtlasAgencyV1;
  activity?: AtlasActivityV1;
}

declare global {
  interface Window {
    __HOMI_ATLAS_V7_PACKS__?: Partial<AtlasData>;
  }
}
