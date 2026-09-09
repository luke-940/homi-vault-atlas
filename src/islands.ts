import rawIslands from '../public/data/islands.json' with { type: 'json' };
import rawMap from '../public/data/map.json' with { type: 'json' };
import type { ProjectId } from './content';

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export interface Bounds3 { min: Vec3; max: Vec3 }
export interface CameraPose { position: Vec3; target: Vec3; fovDegrees: number }
export type MapView = 'islands' | 'vault';
export type GuideAction =
  | { action: 'open-reader'; nodeId: string; label: string; section?: { id: string; field: 'paragraphs'; index: number } }
  | { action: 'open-map'; view: MapView; label: string; projectId?: ProjectId; relationMode?: 'containment' | 'relationships' }
  | { action: 'open-camera-help' | 'open-reading-help'; label: string };
export type SelectionProxy =
  | { kind: 'component'; partId: string; localPoint: Vec3; worldPoint: Vec3 }
  | { kind: 'disc'; partId: string; center: Vec3; radius: number; normal: Vec3 }
  | { kind: 'box'; partId: string; center: Vec3; size: Vec3 };
export interface KnowledgeObject {
  id: string; islandId: ProjectId; label: string; kind: 'derived' | 'guide';
  question: string; contentIds: string[]; parentId: string | null;
  assetId: string; interactionAssetId: string; physicalPartIds: string[];
  assetOrigin: Vec3; foundationTopY: number; interactionAnchor: Vec3;
  cameraLookAt: Vec3; viewingPosition: Vec3; arrivalPose: CameraPose;
  actions: GuideAction[]; selectionProxy: SelectionProxy;
}
export interface IslandAsset {
  id: string; kitId: string; variantId: string | null; origin: Vec3;
  rotationYDegrees: number; geometrySize: Vec3; foundationTopY: number;
  worldAssemblyBounds: Bounds3; reservedFootprint: Vec2[];
}
export interface IslandPath { id: string; width: number; requiredObstacleClearance: number; points: Vec3[] }
export interface ShorelineSpec {
  waterY: number; crestY: number; closed: boolean;
  defaultProfile: 'rock-cliff' | 'quay';
  segmentOverrides: { index: number; profile: string; foamWidth: number; foamOpacity: number }[];
  dock: { segmentIndex: number; waterlineAnchor: Vec3; yawRadians: number; pierExclusionXZ: Vec2[] };
  foam: { widthByProfile: Record<string, number>; opacityByProfile: Record<string, number>; distanceNoiseAmplitude: number; noiseWavelengthMetres: number; offsetY: number; noInlandOutline: boolean };
}
export interface IslandSpec {
  id: ProjectId; label: string; coast: Vec2[]; groundY: number; entry: Vec3;
  entryCamera: CameraPose; extent: number; modelUrl: string; collisionUrl: string;
  mapImage: string; mapBounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  limits: { polarAngleRadians: Vec2; distanceRangeMetres: Vec2; minEyeY: number; panInset: number; groundClearance: number };
  assets: IslandAsset[]; places: KnowledgeObject[]; subInteractions: KnowledgeObject[];
  paths: IslandPath[]; reservedFootprints: { assetId: string; points: Vec2[] }[];
  shoreline: ShorelineSpec;
}
/** A selected, real folder/document location. Island places are deliberately a separate model. */
export interface AtlasMapEntry {
  id: string; kind: 'folder' | 'document'; label: string; labelEdited: boolean;
  contentNodeIds: string[]; evidenceIds: string[]; islandIds: ProjectId[];
}
export interface ContainmentEdge { sourceId: string; targetId: string; relation: 'contains' }
export interface EditorialConnection {
  sourceId: string; targetId: string; relation: string; label: string;
  kind: 'derived'; sourceContentId: string; targetContentId: string;
}
// JSON imports infer number[] rather than fixed coordinate tuples. The build
// validates the complete schema; this guard also fails closed on malformed
// geometry when the module is loaded independently of the build.
function readIslands(value: unknown): IslandSpec[] {
  if (!Array.isArray(value) || value.length !== 4) throw new Error('Invalid island dataset.');
  const vector = (v: unknown, n: number) => Array.isArray(v) && v.length === n && v.every(x => typeof x === 'number' && Number.isFinite(x));
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') throw new Error('Invalid island record.');
    const i = candidate as Record<string, unknown>;
    if (!['rocket','groot','common','atlas'].includes(String(i.id)) || !Array.isArray(i.coast) || !i.coast.every(p => vector(p, 2)) || !vector(i.entry, 3) || !Array.isArray(i.places) || !Array.isArray(i.subInteractions)) throw new Error('Invalid island geometry.');
    for (const item of [...i.places, ...i.subInteractions]) {
      if (!item || typeof item !== 'object' || !vector(item.interactionAnchor, 3) || !vector(item.viewingPosition, 3) || !vector(item.arrivalPose?.position, 3) || !vector(item.arrivalPose?.target, 3)) throw new Error('Invalid object geometry.');
    }
  }
  return value as IslandSpec[];
}
export const islands = readIslands(rawIslands.islands);
export const islandById = new Map<ProjectId, IslandSpec>(islands.map(i => [i.id, i]));
export const knowledgeObjects = islands.flatMap(i => [...i.places, ...i.subInteractions]);
export const placeById = new Map(knowledgeObjects.map(p => [p.id, p]));
export const mapEntries = rawMap.entries as AtlasMapEntry[];
export const mapEntryById = new Map(mapEntries.map(e => [e.id, e]));
export const containmentEdges = rawMap.containmentEdges as ContainmentEdge[];
export const editorialConnections = rawMap.editorialConnections as EditorialConnection[];
export const mapReadingNote = rawMap.readingNote;
export function placesForNode(nodeId: string): KnowledgeObject[] {
  return knowledgeObjects.filter(p => p.contentIds.includes(nodeId));
}
export function mapEntriesForNode(nodeId: string): AtlasMapEntry[] {
  return mapEntries.filter(e => e.contentNodeIds.includes(nodeId));
}
/** Unknown or cross-island selections never silently move to a different project. */
export function resolveIslandPlace(islandId: string, placeId?: string): { island: IslandSpec; place?: KnowledgeObject } | undefined {
  const island = islandById.get(islandId as ProjectId);
  if (!island) return undefined;
  const place = placeId ? placeById.get(placeId) : undefined;
  return { island, place: place?.islandId === island.id ? place : undefined };
}
