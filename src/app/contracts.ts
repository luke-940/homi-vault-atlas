export type AtlasProfile = "atlas-public" | "atlas-owner";
export type Workspace = "home" | "explore" | "observe" | "flow" | "time" | "agency" | "read";
export type CosmosLens =
  | "whole-vault"
  | "knowledge-core"
  | "project-frontiers"
  | "agent-stewardship";
export type ExploreMode = "graph" | "structure" | "list";
export type DossierTab = "overview" | "relations" | "evidence";
export type ObserveMode = "global" | "node" | "relation" | "evidence";

export type GraphNodeKind =
  | "moc_hub"
  | "paper_gateway"
  | "signal_domain"
  | "signal_storyline"
  | "project"
  | "project_stage"
  | "source_document"
  | "strategy_insight"
  | "aggregate_boundary";

export interface RawAtlasGraphV2 {
  schema: "atlas.graph.v2";
  profile: AtlasProfile;
  generatedAt: string;
  strings: string[];
  kinds: GraphNodeKind[];
  domains: Array<[number, number, number, number, number[]]>;
  nodes: Array<[
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ]>;
  edges: Array<[number, number, number, number]>;
  structure: {
    schema: "atlas.directory.v1";
    rootLabel: number;
    folders: Array<[number, number, number, number, number, number[]]>;
    omitted: Array<[number, number]>;
    manifest: {
      folderCount: number;
      representedNodeCount: number;
      omittedNodeCount: number;
      maxDepth: number;
      structureDigest: string;
    };
  };
  layout: {
    algorithm: string;
    seed: string;
    axes: {
      position: string;
      yRelief: string;
      dateAxis: false;
    };
    bounds: { width: number; height: number; depth: number };
    cameras: Record<"wholeVault" | "knowledgeCore" | "projectFrontiers" | "agentStewardship", {
      target: [number, number, number];
      position: [number, number, number];
      fov: number;
    }>;
    labelBudget: { desktop: number; compact: number; mobile: number };
  };
  manifest: {
    nodeCount: number;
    edgeCount: number;
    domainCount: number;
    namedCount: number;
    semanticDigest: string;
    layoutDigest: string;
    projectionDigest: string;
  };
}

export interface AtlasInventoryV1 {
  schema: "atlas.inventory.v1";
  profile: AtlasProfile;
  generatedAt: string;
  physicalMarkdownCount: number;
  namedCount: number;
  aggregateCount: number;
  excludedCount: number;
  unclassifiedCount: number;
  reconciliation: { classifiedTotal: number; pass: boolean };
  coverage: Array<{
    domain: string;
    physical: number;
    named: number;
    aggregate: number;
    excluded: number;
  }>;
}

export interface AtlasAgencyV1 {
  schema: "atlas.agency.v1";
  generatedAt: string;
  principal: { id: string; label: string; kind: string };
  actors: Array<{
    id: string;
    label: string;
    groupId: string;
    purpose?: string;
    publicOutput?: string;
    proof?: string;
    stopBoundary?: string;
  }>;
  groups: Array<{ id: string; label: string; kind: string; actorIds?: string[] }>;
  links: Array<{ id: string; source: string; target: string; kind: string }>;
  snapshot?: { asOfDate?: string; caveat?: string; live?: boolean };
}

export interface EvidenceBoundClaim {
  id: string;
  text: string;
  evidenceIds: string[];
  interpretation: "source_explicit" | "atlas_builder_bounded";
}

export interface KnowledgeEvidence {
  id: string;
  nodeId: string;
  sectionId: string;
  blockId: string;
  excerpt: string;
  sourceTitle?: string;
}

export interface RelationExplanation {
  id: string;
  direction: "incoming" | "outgoing";
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  kind: "direct_context" | "bounded_synthesis" | "evidence_gap";
  explanation: string;
  evidenceIds: string[];
  occurrences: number;
}

export interface KnowledgeDossier {
  nodeId: string;
  title: string;
  domain: string;
  kind: GraphNodeKind;
  readerSummary: EvidenceBoundClaim;
  keyInsights: EvidenceBoundClaim[];
  whyItMatters: EvidenceBoundClaim;
  relationExplanations: RelationExplanation[];
  caveats: EvidenceBoundClaim[];
  openQuestions: EvidenceBoundClaim[];
  evidence: KnowledgeEvidence[];
  sourceReader: {
    documentId: string;
    publishedSectionIds: string[];
    omittedSectionCount: number;
  };
}

export interface SafeTextInline {
  type: "text";
  text: string;
}

export interface SafeAtlasLinkInline {
  type: "atlas_link";
  nodeId: string;
  sectionId: string | null;
  label: string;
}

export interface SafeSectionLinkInline {
  type: "section_link";
  sectionId: string;
  label: string;
}

export interface SafePrivateTargetInline {
  type: "private_target";
  label: "비공개 대상";
}

export type SafeInline =
  | SafeTextInline
  | SafeAtlasLinkInline
  | SafeSectionLinkInline
  | SafePrivateTargetInline;

export type SafeDocumentBlock =
  | { id: string; type: "paragraph"; inlines: SafeInline[] }
  | { id: string; type: "list"; ordered: boolean; items: SafeInline[][] }
  | { id: string; type: "table"; rows: SafeInline[][][] }
  | { id: string; type: "blockquote"; inlines: SafeInline[] }
  | { id: string; type: "callout"; calloutType: string | null; inlines: SafeInline[] }
  | { id: string; type: "code"; language: string | null; text: string };

export interface SafeDocumentSection {
  id: string;
  heading: string;
  depth: number;
  blocks: SafeDocumentBlock[];
}

export interface SafeDocument {
  id: string;
  nodeId: string;
  title: string;
  metadata: Record<string, string>;
  sections: SafeDocumentSection[];
  omittedSectionCount: number;
  omittedBlockCount: number;
  notice: string;
}

export interface KnowledgeDossierIndexEntry {
  nodeId: string;
  title: string;
  domain: string;
  kind: GraphNodeKind;
  readerSummary: string;
  shardPath: string;
  shardJsonSha256: string;
  shardJavascriptSha256: string;
  shardBytes: number;
  publishedSectionCount: number;
  omittedSectionCount: number;
}

export type RawKnowledgeDossierRow = [
  nodeId: number,
  title: number,
  domain: number,
  kind: number,
  readerSummary: number,
  shardJsonSha256: number,
  shardJavascriptSha256: number,
  shardBytes: number,
  publishedSectionCount: number,
  omittedSectionCount: number,
];

export interface RawAtlasKnowledgeV1 {
  schema: "atlas.knowledge.v1";
  encoding: "string_table_v1";
  generatedAt: string;
  graphProjectionDigest: string;
  releaseEligible: boolean;
  strings: string[];
  dossiers: RawKnowledgeDossierRow[];
  search: {
    token: string;
    jsonSha256: string;
    javascriptSha256: string;
    bytes: number;
  };
  manifest: AtlasKnowledgeV1["manifest"];
}

export interface AtlasKnowledgeV1 {
  schema: "atlas.knowledge.v1";
  generatedAt: string;
  graphProjectionDigest: string;
  releaseEligible: boolean;
  dossiers: KnowledgeDossierIndexEntry[];
  search: {
    path: string;
    javascriptPath: string;
    jsonSha256: string;
    javascriptSha256: string;
    bytes: number;
  };
  manifest: {
    dossierCount: number;
    documentCount: number;
    claimCount: number;
    evidenceCount: number;
    relationExplanationCount: number;
    publishedSectionCount: number;
    omittedSectionCount: number;
    unclassifiedSectionCount: number;
    projectionDigest: string;
  };
}

export interface AtlasKnowledgeShardV1 {
  schema: "atlas.knowledge_shard.v1";
  nodeId: string;
  dossier: KnowledgeDossier;
  document: SafeDocument;
  manifest: {
    claimCount: number;
    evidenceCount: number;
    relationExplanationCount: number;
    publishedSectionCount: number;
    omittedSectionCount: number;
  };
}

export type KnowledgeSearchResultKind =
  | "knowledge"
  | "insight"
  | "source_section"
  | "relationship"
  | "operating_role";

export interface KnowledgeSearchEntry {
  id: string;
  kind: KnowledgeSearchResultKind;
  label: string;
  detail: string;
  nodeId?: string;
  sectionId?: string;
  fromNodeId?: string;
  toNodeId?: string;
  actorId?: string;
  searchText?: string;
}

export type RawKnowledgeSearchRow = [
  kind: number,
  nodeId: number,
  sectionId: number,
  label: number,
  detail: number,
  fromNodeId: number,
  toNodeId: number,
];

export interface AtlasKnowledgeSearchV2 {
  schema: "atlas.knowledge_search.v2";
  encoding: "string_table_delta_postings_v1";
  generatedAt: string;
  strings: string[];
  entries: RawKnowledgeSearchRow[];
  terms: Array<[term: number, entryIndexes: number[]]>;
  manifest: {
    entryCount: number;
    termCount: number;
    projectionDigest: string;
  };
}

export interface GraphDomain {
  id: string;
  label: string;
  nodeCount: number;
  edgeCount: number;
  nodeIndexes: number[];
  color: string;
}

export interface GraphNode {
  index: number;
  id: string;
  label: string;
  kind: GraphNodeKind;
  domainIndex: number;
  domain: string;
  gravity: number;
  occurrences: number;
  position: [number, number, number];
  zoomRank: number;
  labelPriority: number;
  flags: number;
  incoming: number[];
  outgoing: number[];
}

export interface GraphEdge {
  index: number;
  id: string;
  source: number;
  target: number;
  occurrences: number;
}

export interface GraphDirectoryFolder {
  index: number;
  id: string;
  label: string;
  parentIndex: number;
  domainIndex: number;
  depth: number;
  nodeIndexes: number[];
  childIndexes: number[];
  subtreeNodeCount: number;
}

export interface AtlasDirectoryModel {
  rootLabel: string;
  folders: GraphDirectoryFolder[];
  rootIndexes: number[];
  omitted: Array<{ reason: string; count: number }>;
  manifest: RawAtlasGraphV2["structure"]["manifest"];
}

export interface AtlasGraphModel {
  profile: AtlasProfile;
  generatedAt: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  domains: GraphDomain[];
  nodeById: Map<string, GraphNode>;
  edgeById: Map<string, GraphEdge>;
  directory: AtlasDirectoryModel;
  cameras: RawAtlasGraphV2["layout"]["cameras"];
  bounds: RawAtlasGraphV2["layout"]["bounds"];
  manifest: RawAtlasGraphV2["manifest"];
}

export interface AtlasRuntime {
  graph: AtlasGraphModel;
  inventory: AtlasInventoryV1;
  agency: AtlasAgencyV1 | null;
  knowledge: AtlasKnowledgeV1;
}

declare global {
  interface Window {
    __HOMI_ATLAS_V7_PACKS__?: Record<string, unknown>;
    __HOMI_ATLAS_KNOWLEDGE_SHARDS__?: Record<string, {
      jsonText: string;
      jsonSha256: string;
    }>;
    __HOMI_ATLAS_KNOWLEDGE_SEARCH__?: {
      jsonText: string;
      jsonSha256: string;
    };
  }
}
