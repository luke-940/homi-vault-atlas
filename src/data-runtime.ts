import type { Entity } from "./types";
import { DEFAULT_DAILY_ROUTE_ID, validateAtlasPacks } from "./data";

const atlas = validateAtlasPacks(window.__HOMI_ATLAS_V7_PACKS__);

export { DEFAULT_DAILY_ROUTE_ID };
export const atlasData = atlas;
export const entityById = new Map<string, Entity>(
  atlasData.entity.entities.map((entity) => [entity.id, entity]),
);
export const graphNodeById = new Map(
  atlasData.graph.nodes.map((node) => [node.id, node]),
);
export const graphCoordinateById = new Map(
  atlasData.graph.layout.coordinates.map((coordinate) => [coordinate.id, coordinate]),
);
export const inventoryData = atlasData.inventory;

export function hierarchyFocusForDistrict(name: string) {
  return atlasData.graph.nodes.find(
    (node) => node.kind === "district" && node.label === name,
  )?.id ?? null;
}
