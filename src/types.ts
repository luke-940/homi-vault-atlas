export type Workspace = "home" | "explore" | "observe" | "flow" | "time";
export type ExploreLens = "city" | "lineage" | "constellation";
export type RelationLayer = "wikilink" | "typed" | "route";
export type InsightKind = "latest_pulse" | "strongest_relation" | "knowledge_concentration" | "attention";
export type InsightConfidence = "high" | "medium" | "low";

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
  profile: "internal" | "public";
  generatedAt: string;
  publicSnapshotDigest: string | null;
  allowedSurfaces: string[];
  excludedFields: string[];
  redactionCounts: Record<string, number>;
  blockers: string[];
}

export interface SnapshotPack {
  schema: "atlas.snapshot.v7";
  version: string;
  generatedAt: string;
  snapshot: {
    officialCursor: number;
    stateSnapshot: string;
    currentStateHash: string;
    candidateInputHash: string;
    activeManifestHash: string;
    memoryEngineCodeHash: string;
    memoryIndexHash: string;
    memoryEngineSchema: string;
    memoryCorpusDigest: string;
    memoryFiles: number;
    graphConfigHash: string;
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
  sha256: string;
  frontmatter: Record<string, unknown>;
}

export interface ConstellationCategory {
  id: string;
  label: string;
  kind: "folder_group" | "direct_documents";
  documentCount: number;
  share: number;
}

export interface ConstellationComposition {
  unit: "documents";
  folderGroupCount: number;
  directDocumentCount: number;
  directDocumentShare: number;
  categoryCount: number;
  largestCategoryId: string | null;
  largestCategoryShare: number;
  categories: ConstellationCategory[];
  reconciled: boolean;
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
  constellationComposition: ConstellationComposition;
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
  members: string[];
  provenance: "curated_operating_lens";
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
  structure: {
    districts: District[];
    hierarchyNodes: HierarchyNode[];
    rootId: string;
    archiveScope: { active: number; archive: number; defaultState: string };
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
  temporal: { eras: EraRecord[]; currentEra: number };
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
}

declare global {
  interface Window {
    __HOMI_ATLAS_V7_PACKS__?: Partial<AtlasData>;
  }
}
