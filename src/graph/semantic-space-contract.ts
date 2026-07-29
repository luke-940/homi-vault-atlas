import type { CosmosLens, GraphNodeKind } from "../app/contracts";

export interface SemanticSpaceNode {
  id: string;
  label: string;
  kind: GraphNodeKind;
  domain: string;
  position: [number, number, number];
  radius: number;
  color: string;
  gravity: number;
  occurrences: number;
  incomingCount: number;
  outgoingCount: number;
  labelPriority: number;
}

export interface SemanticSpaceEdge {
  id: string;
  sourceId: string;
  targetId: string;
  weight: number;
  crossDomain: boolean;
  constituentEdgeIds: string[];
  provenance: "atlas.graph.v2";
}

export interface AuthoredCamera {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  minDistance: number;
  maxDistance: number;
}

export interface SemanticSpaceScene {
  graphVersion: string;
  lens: CosmosLens;
  nodes: SemanticSpaceNode[];
  edges: SemanticSpaceEdge[];
  camera: AuthoredCamera;
  labelIds: string[];
  focusId: string | null;
  previewId: string | null;
  activeDomains: string[];
  activeKinds: GraphNodeKind[];
  reducedMotion: boolean;
}

export interface SemanticSpaceLabelAnchor {
  id: string;
  x: number;
  y: number;
  depth: number;
  visible: boolean;
}

export interface SemanticSpaceDebugCounters {
  frames: number;
  sceneBuilds: number;
  materialUpdates: number;
  raycasts: number;
  previewCommits: number;
  cameraMoves: number;
  drawCalls: number;
  visibleNodes: number;
  visibleEdges: number;
  idle: boolean;
  previewId: string | null;
  focusId: string | null;
}

export interface SemanticSpaceCallbacks {
  onReady(): void;
  onPreview(id: string | null): void;
  onCommit(id: string): void;
  onLabelFrame(anchors: SemanticSpaceLabelAnchor[]): void;
  onContextLost(): void;
  onDebug?(debug: SemanticSpaceDebugCounters): void;
}

export interface SemanticSpaceController {
  setScene(scene: SemanticSpaceScene): void;
  setLabelIds(ids: string[]): void;
  setPreview(id: string | null): void;
  setFocus(id: string | null): void;
  resize(width: number, height: number, dpr: number): void;
  resetCamera(): void;
  setVisible(visible: boolean): void;
  debug(): SemanticSpaceDebugCounters;
  dispose(): void;
}

export interface SemanticSpaceModule {
  version: "atlas.semantic_space_renderer.v2";
  mount(
    container: HTMLElement,
    scene: SemanticSpaceScene,
    callbacks: SemanticSpaceCallbacks,
  ): SemanticSpaceController;
}

declare global {
  const __ATLAS_SEMANTIC_SPACE_ASSET__: string;

  interface Window {
    HomiAtlasSemanticSpace?: SemanticSpaceModule;
  }
}
