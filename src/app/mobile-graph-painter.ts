import type {
  AtlasGraphModel,
  GraphNode,
  GraphNodeKind,
} from "./contracts";

export interface ProjectedMobileNode {
  id: string;
  x: number;
  y: number;
  radius: number;
  color: string;
}

interface MobileProjection {
  width: number;
  height: number;
  horizontalScale: number;
  verticalScale: number;
  offsetX: number;
  offsetY: number;
}

interface MobileGraphPaintOptions {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  graph: AtlasGraphModel;
  activeDomains: ReadonlySet<string>;
  activeKinds: ReadonlySet<GraphNodeKind>;
  focusId: string | null;
  previewId: string | null;
}

interface ActiveRelation {
  id: string | null;
  domain: string | null;
  edgeIndexes: ReadonlySet<number>;
  neighborIndexes: ReadonlySet<number>;
}

function projectCanvas(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  graph: AtlasGraphModel,
): MobileProjection {
  const bounds = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(bounds.width));
  const height = Math.max(1, Math.round(bounds.height));
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);
  const pad = 12;
  const scaleX = (width - pad * 2) / Math.max(1, graph.bounds.width);
  const scaleY = (height - pad * 2) / Math.max(1, graph.bounds.depth);
  const horizontalScale = Math.min(scaleX, scaleY);
  return {
    width,
    height,
    horizontalScale,
    verticalScale: horizontalScale,
    offsetX: (width - graph.bounds.width * horizontalScale) / 2,
    offsetY: (height - graph.bounds.depth * horizontalScale) / 2 - height * 0.17,
  };
}

function activeRelation(
  graph: AtlasGraphModel,
  focusId: string | null,
  previewId: string | null,
): ActiveRelation {
  const id = previewId ?? focusId;
  const node = id ? graph.nodeById.get(id) : null;
  const edgeIndexes = new Set([
    ...(node?.incoming.slice(0, 6) ?? []),
    ...(node?.outgoing.slice(0, 6) ?? []),
  ]);
  const neighborIndexes = new Set<number>();
  edgeIndexes.forEach((index) => {
    neighborIndexes.add(graph.edges[index].source);
    neighborIndexes.add(graph.edges[index].target);
  });
  return {
    id,
    domain: node?.domain ?? null,
    edgeIndexes,
    neighborIndexes,
  };
}

function filterAllows(
  node: GraphNode,
  activeDomains: ReadonlySet<string>,
  activeKinds: ReadonlySet<GraphNodeKind>,
) {
  return (!activeDomains.size || activeDomains.has(node.domain))
    && (!activeKinds.size || activeKinds.has(node.kind));
}

function projectNode(node: GraphNode, projection: MobileProjection) {
  return {
    x: projection.offsetX + node.position[0] * projection.horizontalScale,
    y: projection.offsetY + node.position[2] * projection.verticalScale,
  };
}

function paintEdges(
  context: CanvasRenderingContext2D,
  graph: AtlasGraphModel,
  projection: MobileProjection,
  relation: ActiveRelation,
  activeDomains: ReadonlySet<string>,
  activeKinds: ReadonlySet<GraphNodeKind>,
) {
  context.lineWidth = 0.55;
  graph.edges.forEach((edge) => {
    const source = graph.nodes[edge.source];
    const target = graph.nodes[edge.target];
    const selected = relation.edgeIndexes.has(edge.index);
    const filterVisible = filterAllows(source, activeDomains, activeKinds)
      || filterAllows(target, activeDomains, activeKinds);
    const sharesFocusDomain = relation.domain === source.domain || relation.domain === target.domain;
    context.globalAlpha = relation.id
      ? selected ? 0.82 : sharesFocusDomain ? 0.11 : 0.06
      : filterVisible ? 0.11 : 0.018;
    context.strokeStyle = selected ? "#f2b35f" : "#79838b";
    const from = projectNode(source, projection);
    const to = projectNode(target, projection);
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  });
}

function paintNodes(
  context: CanvasRenderingContext2D,
  graph: AtlasGraphModel,
  projection: MobileProjection,
  relation: ActiveRelation,
  activeDomains: ReadonlySet<string>,
  activeKinds: ReadonlySet<GraphNodeKind>,
) {
  const maxGravity = Math.max(...graph.nodes.map((node) => node.gravity), 1);
  return graph.nodes.map((node): ProjectedMobileNode => {
    const selected = node.id === relation.id;
    const neighbor = relation.neighborIndexes.has(node.index);
    const filterDimmed = !filterAllows(node, activeDomains, activeKinds);
    const sameDomain = relation.domain === node.domain;
    const radius = Math.max(1.35, 1.55 + Math.sqrt(node.gravity / maxGravity) * 5.4);
    const color = graph.domains[node.domainIndex]?.color ?? "#8c959a";
    const point = projectNode(node, projection);
    context.globalAlpha = relation.id
      ? selected ? 1 : neighbor ? 0.94 : sameDomain ? 0.72 : 0.44
      : filterDimmed ? 0.2 : 0.82;
    context.fillStyle = selected ? "#f2b35f" : color;
    context.shadowColor = selected ? "#f2b35f" : color;
    context.shadowBlur = selected ? radius * 2.6 : radius * 0.4;
    context.beginPath();
    context.arc(point.x, point.y, selected ? radius * 1.24 : radius, 0, Math.PI * 2);
    context.fill();
    context.shadowBlur = 0;
    return {
      id: node.id,
      ...point,
      radius: Math.max(12, radius * 1.8),
      color,
    };
  });
}

function paintDomainLabels(
  context: CanvasRenderingContext2D,
  graph: AtlasGraphModel,
  projection: MobileProjection,
  activeDomains: ReadonlySet<string>,
) {
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = '600 12px "Pretendard Variable", sans-serif';
  graph.domains.forEach((domain) => {
    if (!domain.nodeIndexes.length) return;
    const center = domain.nodeIndexes.reduce(
      (sum, index) => {
        const point = projectNode(graph.nodes[index], projection);
        sum[0] += point.x;
        sum[1] += point.y;
        return sum;
      },
      [0, 0],
    ).map((value) => value / domain.nodeIndexes.length);
    const textWidth = context.measureText(domain.label).width;
    context.globalAlpha = activeDomains.size > 0 && !activeDomains.has(domain.label) ? 0.42 : 0.94;
    context.fillStyle = "rgba(9, 8, 11, 0.78)";
    context.fillRect(center[0] - textWidth / 2 - 6, center[1] - 10, textWidth + 12, 20);
    context.fillStyle = "#f2ece4";
    context.fillText(domain.label, center[0], center[1] + 0.5);
  });
}

export function paintMobileGraph({
  canvas,
  context,
  graph,
  activeDomains,
  activeKinds,
  focusId,
  previewId,
}: MobileGraphPaintOptions) {
  const projection = projectCanvas(canvas, context, graph);
  const relation = activeRelation(graph, focusId, previewId);
  paintEdges(context, graph, projection, relation, activeDomains, activeKinds);
  const projected = paintNodes(context, graph, projection, relation, activeDomains, activeKinds);
  paintDomainLabels(context, graph, projection, activeDomains);
  context.globalAlpha = 1;
  return projected;
}
