export type AtlasProfile = "atlas-public" | "atlas-owner";
export type Workspace = "home" | "explore" | "observe" | "flow" | "time" | "agency";
export type CosmosLens =
  | "whole-vault"
  | "knowledge-core"
  | "project-frontiers"
  | "agent-stewardship";
export type ExploreMode = "graph" | "structure" | "list";

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
}

declare global {
  interface Window {
    __HOMI_ATLAS_V7_PACKS__?: Record<string, unknown>;
  }
}
