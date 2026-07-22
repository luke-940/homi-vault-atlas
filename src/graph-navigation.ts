import type { AtlasGraphNodeV1 } from "./types";

const GRAPH_HUB_KINDS = new Set<AtlasGraphNodeV1["kind"]>([
  "moc_hub",
  "paper_gateway",
  "project",
  "signal_domain",
  "strategy_insight",
  "strategy_request",
]);

const GRAPH_SOURCE_KINDS = new Set<AtlasGraphNodeV1["kind"]>([
  "source_document",
  "project_stage",
  "signal_storyline",
  "aggregate_boundary",
]);

export function isSafeAggregateHub(node: AtlasGraphNodeV1 | undefined) {
  return node?.kind === "aggregate_boundary"
    && node.representedDocuments === 0
    && (node.nameMode === "aggregate" || node.nameMode === "public_alias");
}

export function isGraphHub(node: AtlasGraphNodeV1 | undefined) {
  return Boolean(node && (GRAPH_HUB_KINDS.has(node.kind) || isSafeAggregateHub(node)));
}

export function isGraphSource(node: AtlasGraphNodeV1 | undefined) {
  return Boolean(node && GRAPH_SOURCE_KINDS.has(node.kind) && !isSafeAggregateHub(node));
}

export function resolveGraphNodeContext(
  nodes: readonly AtlasGraphNodeV1[],
  focusId: string,
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const focusNode = nodeById.get(focusId);
  const district = focusNode?.kind === "district"
    ? focusNode
    : nodeById.get(focusNode?.districtId ?? "");
  let hub = isGraphHub(focusNode) ? focusNode : undefined;
  const source = isGraphSource(focusNode) ? focusNode : undefined;

  if (source) {
    let cursor: AtlasGraphNodeV1 | undefined = source;
    const visited = new Set<string>();
    while (cursor?.parentId && !visited.has(cursor.id)) {
      visited.add(cursor.id);
      const parent = nodeById.get(cursor.parentId);
      if (!parent || parent.kind === "district") break;
      if (isGraphHub(parent)) {
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
