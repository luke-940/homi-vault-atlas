import type { AtlasGraphNodeKind } from "../types";

export type SemanticSpaceSceneKind = "field" | "gravity" | "freshness" | "trace";
export type SemanticSpacePresentation = "home" | "workspace";

export interface SemanticSpaceNode {
  id: string;
  label: string;
  kind: AtlasGraphNodeKind;
  clusterId: string;
  position: [number, number, number];
  radius: number;
  color: string;
  halo: number;
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
  semanticKind: "district_corridor" | "exact_reference" | "directed_path";
  constituentEdgeIds: string[];
  provenance: "atlas.graph.v1";
  defaultVisible: boolean;
}

export interface SemanticSpaceEvidenceMark {
  id: string;
  parentId: string;
  clusterId: string;
  position: [number, number, number];
  color: string;
  size: number;
  opacity: number;
  representedDocuments: number;
}

export interface AuthoredCamera {
  yaw: number;
  pitch: number;
  distance: number;
  target: [number, number, number];
  minDistance: number;
  maxDistance: number;
}

export interface SemanticSpaceScene {
  id: string;
  kind: SemanticSpaceSceneKind;
  presentation: SemanticSpacePresentation;
  nodes: SemanticSpaceNode[];
  edges: SemanticSpaceEdge[];
  evidenceMarks: SemanticSpaceEvidenceMark[];
  camera: AuthoredCamera;
  labelIds: string[];
  focusId: string | null;
  previewId: string | null;
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
  cameraPosition: [number, number, number];
  cameraTarget: [number, number, number];
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
  setPreview(id: string | null): void;
  setFocus(id: string | null): void;
  resize(width: number, height: number, dpr: number): void;
  resetCamera(): void;
  setVisible(visible: boolean): void;
  debug(): SemanticSpaceDebugCounters;
  dispose(): void;
}

export interface SemanticSpaceModule {
  version: "atlas.semantic_space_renderer.v1";
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
