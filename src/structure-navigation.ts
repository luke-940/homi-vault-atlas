import type { AtlasStructureNodeV2 } from "./types";

const STRUCTURAL_HUB_KINDS = new Set<AtlasStructureNodeV2["kind"]>([
  "moc_hub",
  "paper_gateway",
  "project",
  "signal_domain",
  "strategy_insight",
  "strategy_request",
]);

const SOURCE_LEVEL_KINDS = new Set<AtlasStructureNodeV2["kind"]>([
  "source_document",
  "project_stage",
  "signal_storyline",
  "aggregate_boundary",
]);

export function isSafeAggregateHub(node: AtlasStructureNodeV2 | undefined) {
  return node?.kind === "aggregate_boundary"
    && node.documentCount === 0
    && (node.nameMode === "aggregate" || node.nameMode === "public_alias");
}

export function isStructuralHub(node: AtlasStructureNodeV2 | undefined) {
  return Boolean(node && (STRUCTURAL_HUB_KINDS.has(node.kind) || isSafeAggregateHub(node)));
}

export function isStructureSourceLevel(node: AtlasStructureNodeV2 | undefined) {
  return Boolean(node && SOURCE_LEVEL_KINDS.has(node.kind) && !isSafeAggregateHub(node));
}

export function resolveStructureNodeContext(
  nodes: readonly AtlasStructureNodeV2[],
  focusId: string,
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const focusNode = nodeById.get(focusId);
  const district = focusNode?.kind === "district"
    ? focusNode
    : nodeById.get(focusNode?.districtId ?? "");
  let hub = isStructuralHub(focusNode) ? focusNode : undefined;
  const source = isStructureSourceLevel(focusNode) ? focusNode : undefined;

  if (source) {
    let cursor: AtlasStructureNodeV2 | undefined = source;
    const visited = new Set<string>();
    while (cursor?.parentId && !visited.has(cursor.id)) {
      visited.add(cursor.id);
      const parent = nodeById.get(cursor.parentId);
      if (!parent || parent.kind === "district") break;
      if (isStructuralHub(parent)) {
        hub = parent;
        break;
      }
      cursor = parent;
    }
  }

  return {
    districtId: district?.id ?? null,
    hubId: hub?.id ?? null,
    sourceId: source?.id ?? null,
  };
}
