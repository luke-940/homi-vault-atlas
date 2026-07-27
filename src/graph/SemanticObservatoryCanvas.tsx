import { Focus, Minus, Plus, RotateCcw } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from "react";
import { useElementSize } from "../hooks/useElementSize";
import type {
  AtlasGraphEdgeV1,
  AtlasGraphNodeV1,
  AtlasGraphV1,
  AtlasMeaningV2,
  GraphFreshness,
} from "../types";
import {
  freshnessMatches,
  graphNodeKindLabel,
  graphNodeLabel,
  pathEdgeIds,
  selectedNeighborhood,
  shortestDirectedPath,
} from "./model";

type ObservatoryMode = "home" | "explore" | "flow";

type CameraState = {
  yaw: number;
  pitch: number;
  zoom: number;
  panX: number;
  panY: number;
};

type ProjectedNode = {
  node: AtlasGraphNodeV1;
  x: number;
  y: number;
  depth: number;
  scale: number;
  radius: number;
};

type LabelPlacement = ProjectedNode & {
  labelX: number;
  labelY: number;
  align: "left" | "right";
};

const coreSlots: Record<string, {
  x: number;
  y: number;
  depth: number;
  spreadX: number;
  spreadY: number;
}> = {
  MOC: { x: 0.7, y: 0.25, depth: 0.54, spreadX: 0.25, spreadY: 0.2 },
  "중심 지식": { x: 0.7, y: 0.25, depth: 0.54, spreadX: 0.25, spreadY: 0.2 },
  Papers: { x: 0.43, y: 0.35, depth: 0.42, spreadX: 0.27, spreadY: 0.22 },
  "연구 논거": { x: 0.43, y: 0.35, depth: 0.42, spreadX: 0.27, spreadY: 0.22 },
  Signals: { x: 0.74, y: 0.63, depth: 0.84, spreadX: 0.24, spreadY: 0.22 },
  신호: { x: 0.74, y: 0.63, depth: 0.84, spreadX: 0.24, spreadY: 0.22 },
};

const clusterColors: Record<string, string> = {
  MOC: "#e5aa51",
  "중심 지식": "#e5aa51",
  Papers: "#a98ae5",
  "연구 논거": "#a98ae5",
  Signals: "#54d4c3",
  신호: "#54d4c3",
  전략: "#df8b6b",
  "운영 기반": "#b8cb7d",
  "연구 기록": "#6faacb",
  "Independent Projects": "#c27fd7",
};

const defaultCamera: CameraState = {
  yaw: -0.1,
  pitch: 0.04,
  zoom: 1,
  panX: 0,
  panY: 0,
};

function clampCamera(camera: CameraState): CameraState {
  return {
    yaw: Math.max(-0.42, Math.min(0.42, camera.yaw)),
    pitch: Math.max(-0.16, Math.min(0.24, camera.pitch)),
    zoom: Math.max(0.72, Math.min(1.52, camera.zoom)),
    panX: Math.max(-240, Math.min(240, camera.panX)),
    panY: Math.max(-180, Math.min(180, camera.panY)),
  };
}

function stableUnit(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function rgba(hex: string, alpha: number) {
  const normalized = /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#d6a15e";
  const value = Number.parseInt(normalized.slice(1), 16);
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
}

function nodeColor(node: AtlasGraphNodeV1, clusterLabelById: Map<string, string>) {
  return clusterColors[clusterLabelById.get(node.clusterId) ?? ""] ?? "#d49269";
}

function rankNodes(nodes: readonly AtlasGraphNodeV1[]) {
  return [...nodes].sort((left, right) =>
    right.gravity - left.gravity
    || right.occurrences - left.occurrences
    || left.id.localeCompare(right.id, "en"));
}

function rankEdges(edges: readonly AtlasGraphEdgeV1[]) {
  return [...edges].sort((left, right) =>
    right.occurrenceCount - left.occurrenceCount
    || left.id.localeCompare(right.id, "en"));
}

function selectExploreEdges(
  graph: AtlasGraphV1,
  seedEdgeIds: readonly string[],
  visibleNodeIds: ReadonlySet<string>,
  limit: number,
) {
  const edgeById = new Map(graph.edges.map((edge) => [edge.id, edge]));
  const selected: AtlasGraphEdgeV1[] = [];
  const selectedIds = new Set<string>();
  const degree = new Map<string, number>();
  const add = (edge: AtlasGraphEdgeV1 | undefined, force = false) => {
    if (!edge || selectedIds.has(edge.id)) return;
    if (!visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target)) return;
    if (!force && ((degree.get(edge.source) ?? 0) >= 4 || (degree.get(edge.target) ?? 0) >= 4)) return;
    selected.push(edge);
    selectedIds.add(edge.id);
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  };
  seedEdgeIds.forEach((edgeId) => add(edgeById.get(edgeId), true));
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const candidates = [...graph.edges].sort((left, right) => {
    const leftCross = nodeById.get(left.source)?.clusterId !== nodeById.get(left.target)?.clusterId ? 1 : 0;
    const rightCross = nodeById.get(right.source)?.clusterId !== nodeById.get(right.target)?.clusterId ? 1 : 0;
    return rightCross - leftCross
      || right.occurrenceCount - left.occurrenceCount
      || left.id.localeCompare(right.id, "en");
  });
  for (const edge of candidates) {
    if (selected.length >= limit) break;
    add(edge);
  }
  return selected.slice(0, limit);
}

function visibleNodesForMode({
  graph,
  meaning,
  mode,
  mobile,
  districtId,
  freshness,
  focusId,
  from,
  to,
}: {
  graph: AtlasGraphV1;
  meaning: AtlasMeaningV2;
  mode: ObservatoryMode;
  mobile: boolean;
  districtId: string | null;
  freshness: GraphFreshness;
  focusId: string | null;
  from: string | null;
  to: string | null;
}) {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const coreClusterIds = new Set(meaning.domainBackbone.flatMap((domain) =>
    domain.districtId ? [domain.districtId] : []));
  const backboneEdgeIds = new Set(meaning.domainBackbone.flatMap((domain) => domain.edgeIds));
  const backboneEndpointIds = new Set(graph.edges
    .filter((edge) => backboneEdgeIds.has(edge.id))
    .flatMap((edge) => [edge.source, edge.target]));
  const priorityIds = new Set([
    ...meaning.domainBackbone.flatMap((domain) => domain.anchorNodeId ? [domain.anchorNodeId] : []),
    ...meaning.protagonists.map((protagonist) => protagonist.nodeId),
    ...backboneEndpointIds,
    ...(focusId ? [focusId] : []),
    ...(from ? [from] : []),
    ...(to ? [to] : []),
  ]);

  if (mode === "home") {
    const limit = mobile ? 24 : 60;
    const coreIds = [...coreClusterIds];
    const priority = [...priorityIds].flatMap((id) => {
      const node = nodesById.get(id);
      return node ? [node] : [];
    });
    const externalPriority = priority.filter((node) => !coreClusterIds.has(node.clusterId));
    const perCluster = Math.max(1, Math.floor((limit - externalPriority.length) / Math.max(1, coreIds.length)));
    const core = coreIds.flatMap((clusterId) => {
      const clusterNodes = graph.nodes.filter((node) =>
        node.clusterId === clusterId && node.kind !== "district");
      const clusterPriority = priority.filter((node) => node.clusterId === clusterId);
      const ranked = mobile
        ? [
            ...rankNodes(clusterNodes.filter((node) => node.kind !== "source_document")),
            ...rankNodes(clusterNodes.filter((node) => node.kind === "source_document")),
          ]
        : rankNodes(clusterNodes);
      return [...new Map([...clusterPriority, ...ranked].map((node) => [node.id, node])).values()]
        .slice(0, perCluster);
    });
    const selected = [...new Map([...externalPriority, ...core].map((node) => [node.id, node])).values()];
    if (selected.length < limit) {
      const selectedIds = new Set(selected.map((node) => node.id));
      selected.push(...rankNodes(graph.nodes.filter((node) =>
        coreClusterIds.has(node.clusterId)
        && node.kind !== "district"
        && !selectedIds.has(node.id))).slice(0, limit - selected.length));
    }
    return selected.slice(0, limit);
  }

  const defaultIds = new Set(graph.layout.defaultNodeIds);
  let candidates = graph.nodes.filter((node) =>
    !["district", "source_document"].includes(node.kind)
    && (defaultIds.has(node.id) || priorityIds.has(node.id)));
  if (districtId) candidates = candidates.filter((node) => node.clusterId === districtId || priorityIds.has(node.id));
  candidates = candidates.filter((node) => freshnessMatches(node, freshness, graph.generatedAt));
  const selected = [
    ...[...priorityIds].flatMap((id) => {
      const node = nodesById.get(id);
      return node ? [node] : [];
    }),
    ...rankNodes(candidates),
  ];
  return [...new Map(selected.map((node) => [node.id, node])).values()]
    .slice(0, mobile ? 20 : mode === "flow" ? 42 : 60);
}

function clusterSlot(
  clusterId: string,
  clusterLabel: string,
  clusterIndex: number,
  mode: ObservatoryMode,
) {
  if (clusterLabel in coreSlots) return coreSlots[clusterLabel];
  const phase = stableUnit(`${clusterId}:${mode}`) * Math.PI * 2;
  return {
    x: 0.62 + Math.cos(phase) * 0.22,
    y: 0.49 + Math.sin(phase) * 0.25,
    depth: 0.34 + stableUnit(`${clusterId}:depth`) * 0.42,
    spreadX: 0.13 + (clusterIndex % 2) * 0.025,
    spreadY: 0.12 + (clusterIndex % 3) * 0.018,
  };
}

function observatoryStage(width: number, height: number, mobile: boolean) {
  const stageWidth = mobile ? width * 0.96 : width;
  const stageHeight = mobile ? height * 0.76 : Math.min(height, width * 0.82);
  const stageTop = mobile ? height * 0.08 : Math.max(0, (height - stageHeight) * 0.24);
  return { stageWidth, stageHeight, stageTop };
}

function responsiveSlotX({
  x,
  clusterLabel,
  width,
  mobile,
  featured,
}: {
  x: number;
  clusterLabel: string;
  width: number;
  mobile: boolean;
  featured: boolean;
}) {
  if (mobile && x > 0.6) return x - (featured ? 0.145 : 0.085);
  if (!mobile && width < 1180) {
    return Math.min(0.92, x + (clusterLabel === "Papers" ? 0.1 : 0.035));
  }
  return x;
}

function projectNodes({
  graph,
  nodes,
  width,
  height,
  camera,
  mode,
  mobile,
  featuredSlots,
}: {
  graph: AtlasGraphV1;
  nodes: readonly AtlasGraphNodeV1[];
  width: number;
  height: number;
  camera: CameraState;
  mode: ObservatoryMode;
  mobile: boolean;
  featuredSlots: ReadonlyMap<string, {
    x: number;
    y: number;
    depth: number;
    spreadX: number;
    spreadY: number;
  }>;
}) {
  const coordinateById = new Map(graph.layout.coordinates.map((coordinate) => [coordinate.id, coordinate]));
  const clusterById = new Map(graph.clusters.map((cluster, index) => [cluster.id, { ...cluster, index }]));
  const localBoundsByCluster = new Map<string, {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  }>();
  for (const node of nodes) {
    const coordinate = coordinateById.get(node.id);
    if (!coordinate) continue;
    const prior = localBoundsByCluster.get(node.clusterId);
    localBoundsByCluster.set(node.clusterId, prior
      ? {
          minX: Math.min(prior.minX, coordinate.x),
          maxX: Math.max(prior.maxX, coordinate.x),
          minY: Math.min(prior.minY, coordinate.y),
          maxY: Math.max(prior.maxY, coordinate.y),
          minZ: Math.min(prior.minZ, coordinate.z),
          maxZ: Math.max(prior.maxZ, coordinate.z),
        }
      : {
          minX: coordinate.x,
          maxX: coordinate.x,
          minY: coordinate.y,
          maxY: coordinate.y,
          minZ: coordinate.z,
          maxZ: coordinate.z,
        });
  }
  const { stageWidth, stageHeight, stageTop } = observatoryStage(width, height, mobile);
  const projected = nodes.flatMap((node): ProjectedNode[] => {
    const coordinate = coordinateById.get(node.id);
    const cluster = clusterById.get(node.clusterId);
    const localBounds = localBoundsByCluster.get(node.clusterId);
    if (!coordinate || !cluster || !localBounds) return [];
    const slot = featuredSlots.get(node.id) ?? clusterSlot(cluster.id, cluster.label, cluster.index, mode);
    const normalize = (value: number, min: number, max: number, salt: string) => (
      Math.abs(max - min) < 0.001
        ? stableUnit(`${node.id}:${salt}`) - 0.5
        : (value - min) / (max - min) - 0.5
    );
    const normalizedX = normalize(coordinate.x, localBounds.minX, localBounds.maxX, "x");
    const normalizedY = normalize(coordinate.y, localBounds.minY, localBounds.maxY, "y");
    const normalizedZ = normalize(coordinate.z, localBounds.minZ, localBounds.maxZ, "z");
    const spatialX = normalizedX * 0.64 + (stableUnit(`${node.id}:constellation:x`) - 0.5) * 0.36;
    const spatialY = normalizedY * 0.86 + (stableUnit(`${node.id}:constellation:y`) - 0.5) * 0.14;
    const yawShift = Math.sin(camera.yaw) * (slot.depth - 0.5) * width * 0.18;
    const pitchShift = Math.sin(camera.pitch) * (slot.depth - 0.5) * stageHeight * 0.16;
    const depth = Math.max(0.06, Math.min(0.96, slot.depth + normalizedZ * 0.18));
    const perspective = (0.64 + depth * 0.52) * camera.zoom;
    const slotX = responsiveSlotX({
      x: slot.x,
      clusterLabel: cluster.label,
      width,
      mobile,
      featured: featuredSlots.has(node.id),
    });
    const x = slotX * stageWidth
      + spatialX * slot.spreadX * stageWidth
      + yawShift
      + camera.panX;
    const y = stageTop
      + slot.y * stageHeight
      + spatialY * slot.spreadY * stageHeight
      - (depth - 0.5) * stageHeight * 0.08
      + pitchShift
      + camera.panY;
    const baseRadius = Math.max(3.2, Math.min(24, 3.6 + Math.sqrt(Math.max(0, node.gravity)) * 0.78));
    return [{
      node,
      x,
      y,
      depth,
      scale: perspective,
      radius: Math.max(3, baseRadius * perspective),
    }];
  });
  return projected.sort((left, right) => left.depth - right.depth || left.node.id.localeCompare(right.node.id, "en"));
}

function edgeControls(source: ProjectedNode, target: ProjectedNode, edge: AtlasGraphEdgeV1) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / length;
  const ny = dx / length;
  const crossCluster = source.node.clusterId !== target.node.clusterId;
  const bend = crossCluster
    ? Math.min(96, Math.max(22, length * 0.16))
    : Math.min(58, Math.max(10, length * 0.1));
  const lane = (stableUnit(`${edge.id}:lane`) < 0.5 ? -1 : 1)
    * bend
    * (0.54 + stableUnit(`${edge.id}:bend`) * 0.46);
  const depthLift = (target.depth - source.depth) * 38;
  return {
    a: {
      x: source.x + dx * 0.34 + nx * lane,
      y: source.y + dy * 0.2 + ny * lane - depthLift,
    },
    b: {
      x: source.x + dx * 0.72 + nx * lane,
      y: source.y + dy * 0.82 + ny * lane - depthLift * 0.45,
    },
  };
}

function cubicPoint(source: ProjectedNode, a: { x: number; y: number }, b: { x: number; y: number }, target: ProjectedNode, t: number) {
  const inverse = 1 - t;
  return {
    x: inverse ** 3 * source.x + 3 * inverse * inverse * t * a.x + 3 * inverse * t * t * b.x + t ** 3 * target.x,
    y: inverse ** 3 * source.y + 3 * inverse * inverse * t * a.y + 3 * inverse * t * t * b.y + t ** 3 * target.y,
  };
}

function drawArrow(context: CanvasRenderingContext2D, source: ProjectedNode, target: ProjectedNode, controls: ReturnType<typeof edgeControls>, color: string, alpha: number) {
  const point = cubicPoint(source, controls.a, controls.b, target, 0.84);
  const previous = cubicPoint(source, controls.a, controls.b, target, 0.8);
  const angle = Math.atan2(point.y - previous.y, point.x - previous.x);
  const size = Math.max(4.5, Math.min(9, 4.8 + target.depth * 3.2));
  context.save();
  context.translate(point.x, point.y);
  context.rotate(angle);
  context.fillStyle = rgba(color, alpha);
  context.beginPath();
  context.moveTo(size, 0);
  context.lineTo(-size * 0.72, -size * 0.62);
  context.lineTo(-size * 0.42, 0);
  context.lineTo(-size * 0.72, size * 0.62);
  context.closePath();
  context.fill();
  context.restore();
}

function drawEdge(
  context: CanvasRenderingContext2D,
  edge: AtlasGraphEdgeV1,
  projectedById: Map<string, ProjectedNode>,
  clusterLabelById: Map<string, string>,
  alpha: number,
  emphasis = 1,
) {
  const source = projectedById.get(edge.source);
  const target = projectedById.get(edge.target);
  if (!source || !target) return;
  const sourceColor = nodeColor(source.node, clusterLabelById);
  const targetColor = nodeColor(target.node, clusterLabelById);
  const gradient = context.createLinearGradient(source.x, source.y, target.x, target.y);
  gradient.addColorStop(0, rgba(sourceColor, alpha));
  gradient.addColorStop(1, rgba(targetColor, alpha * 1.12));
  const controls = edgeControls(source, target, edge);
  context.save();
  context.strokeStyle = rgba(targetColor, alpha * 0.12);
  context.lineWidth = Math.max(2.2, Math.min(5.8, (2.2 + Math.log2(edge.occurrenceCount + 1) * 0.38) * emphasis));
  context.shadowColor = rgba(targetColor, alpha * 0.38);
  context.shadowBlur = 13 * emphasis;
  context.beginPath();
  context.moveTo(source.x, source.y);
  context.bezierCurveTo(controls.a.x, controls.a.y, controls.b.x, controls.b.y, target.x, target.y);
  context.stroke();
  context.strokeStyle = gradient;
  context.lineWidth = Math.max(0.72, Math.min(2.4, (0.64 + Math.log2(edge.occurrenceCount + 1) * 0.24) * emphasis));
  context.shadowColor = rgba(targetColor, alpha * 0.85);
  context.shadowBlur = 8 * emphasis;
  context.beginPath();
  context.moveTo(source.x, source.y);
  context.bezierCurveTo(controls.a.x, controls.a.y, controls.b.x, controls.b.y, target.x, target.y);
  context.stroke();
  context.shadowBlur = 0;
  drawArrow(context, source, target, controls, targetColor, Math.min(1, alpha * 1.5));
  context.restore();
}

function drawNode(
  context: CanvasRenderingContext2D,
  projected: ProjectedNode,
  clusterLabelById: Map<string, string>,
  {
    emphasis = 1,
    alpha = 1,
  }: { emphasis?: number; alpha?: number } = {},
) {
  const { node, x, y, radius, depth } = projected;
  const color = nodeColor(node, clusterLabelById);
  const anchor = ["moc_hub", "paper_gateway", "signal_domain"].includes(node.kind);
  context.save();
  context.globalAlpha = alpha;
  context.globalCompositeOperation = "screen";
  const glowRadius = radius * (anchor ? 4.8 : 3.4) * emphasis;
  const glow = context.createRadialGradient(x, y, radius * 0.16, x, y, glowRadius);
  glow.addColorStop(0, rgba(color, anchor ? 0.42 : 0.24));
  glow.addColorStop(0.34, rgba(color, anchor ? 0.13 : 0.07));
  glow.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = glow;
  context.beginPath();
  context.arc(x, y, glowRadius, 0, Math.PI * 2);
  context.fill();
  context.globalCompositeOperation = "source-over";
  context.shadowColor = color;
  context.shadowBlur = anchor ? 14 * emphasis : 7 * emphasis;
  const core = context.createRadialGradient(
    x - radius * 0.24,
    y - radius * 0.3,
    Math.max(0.7, radius * 0.05),
    x,
    y,
    radius * 1.18 * emphasis,
  );
  core.addColorStop(0, rgba("#fff8e9", anchor ? 0.92 : 0.68));
  core.addColorStop(0.18, rgba(color, anchor ? 0.74 : 0.5));
  core.addColorStop(0.68, rgba(color, anchor ? 0.2 : 0.09));
  core.addColorStop(1, rgba(color, 0.015));
  context.fillStyle = core;
  context.strokeStyle = rgba(color, anchor ? 0.96 : 0.7);
  context.lineWidth = anchor ? 1.5 : 0.82;
  context.beginPath();
  context.arc(x, y, radius * emphasis, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.shadowBlur = 0;
  context.fillStyle = rgba("#fff3dd", anchor ? 0.88 : 0.54 + depth * 0.22);
  context.beginPath();
  context.arc(x, y, Math.max(1.2, radius * (anchor ? 0.22 : 0.14)) * emphasis, 0, Math.PI * 2);
  context.fill();
  if (anchor) {
    context.strokeStyle = rgba(color, 0.42);
    context.lineWidth = 0.75;
    context.beginPath();
    context.arc(x, y, radius * emphasis + 5, -Math.PI * 0.72, Math.PI * 0.68);
    context.stroke();
  }
  const grainCount = Math.min(anchor ? 14 : 6, 2 + Math.floor(Math.sqrt(Math.max(1, node.gravity)) / 2));
  context.globalCompositeOperation = "screen";
  context.shadowColor = color;
  context.shadowBlur = anchor ? 7 : 4;
  for (let index = 0; index < grainCount; index += 1) {
    const angle = stableUnit(`${node.id}:grain:${index}:angle`) * Math.PI * 2;
    const distance = radius * (1.7 + stableUnit(`${node.id}:grain:${index}:distance`) * (anchor ? 4.4 : 2.8));
    const grainX = x + Math.cos(angle) * distance;
    const grainY = y + Math.sin(angle) * distance * (0.48 + depth * 0.25);
    const grainRadius = 0.45 + stableUnit(`${node.id}:grain:${index}:radius`) * (anchor ? 1.25 : 0.7);
    context.fillStyle = rgba(color, anchor ? 0.36 : 0.2);
    context.beginPath();
    context.arc(grainX, grainY, grainRadius, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function drawBackground(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  projected: readonly ProjectedNode[],
  clusterLabelById: Map<string, string>,
) {
  const backdrop = context.createLinearGradient(0, 0, width, height);
  backdrop.addColorStop(0, "#070705");
  backdrop.addColorStop(0.44, "#0b0906");
  backdrop.addColorStop(0.78, "#080706");
  backdrop.addColorStop(1, "#040404");
  context.fillStyle = backdrop;
  context.fillRect(0, 0, width, height);

  const atmospheric = context.createRadialGradient(width * 0.66, height * 0.43, 0, width * 0.66, height * 0.43, width * 0.54);
  atmospheric.addColorStop(0, "rgba(177,119,55,.055)");
  atmospheric.addColorStop(0.54, "rgba(87,68,46,.022)");
  atmospheric.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = atmospheric;
  context.fillRect(0, 0, width, height);

  context.save();
  context.translate(width * 0.53, height * 0.82);
  context.strokeStyle = "rgba(214,159,85,.08)";
  context.lineWidth = 0.7;
  const horizon = height * 0.64;
  for (let row = 0; row < 9; row += 1) {
    const y = -row * row * 8.4;
    context.globalAlpha = Math.max(0.08, 0.5 - row * 0.045);
    context.beginPath();
    context.moveTo(-width, y);
    context.lineTo(width, y);
    context.stroke();
  }
  for (let column = -10; column <= 10; column += 1) {
    context.globalAlpha = 0.26;
    context.beginPath();
    context.moveTo(column * width * 0.05, 0);
    context.lineTo(column * width * 0.15, -horizon);
    context.stroke();
  }
  context.restore();

  const grouped = new Map<string, ProjectedNode[]>();
  for (const item of projected) {
    const rows = grouped.get(item.node.clusterId) ?? [];
    rows.push(item);
    grouped.set(item.node.clusterId, rows);
  }
  for (const [clusterId, rows] of grouped) {
    if (!rows.length) continue;
    const weight = rows.reduce((sum, item) => sum + Math.max(1, item.node.gravity), 0);
    const x = rows.reduce((sum, item) => sum + item.x * Math.max(1, item.node.gravity), 0) / weight;
    const y = rows.reduce((sum, item) => sum + item.y * Math.max(1, item.node.gravity), 0) / weight;
    const color = clusterColors[clusterLabelById.get(clusterId) ?? ""] ?? "#b69369";
    const reach = Math.max(90, Math.min(width * 0.24, 96 + Math.sqrt(weight) * 10));
    const field = context.createRadialGradient(x, y, 0, x, y, reach);
    field.addColorStop(0, rgba(color, 0.1));
    field.addColorStop(0.48, rgba(color, 0.038));
    field.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = field;
    context.fillRect(x - reach, y - reach, reach * 2, reach * 2);
  }
}

function placeLabels(
  projected: readonly ProjectedNode[],
  persistentIds: ReadonlySet<string>,
  width: number,
  height: number,
  budget: number,
  reserved: ReadonlyArray<{ left: number; right: number; top: number; bottom: number }> = [],
) {
  const candidates = [...projected]
    .filter((item) => persistentIds.has(item.node.id))
    .sort((left, right) =>
      right.node.gravity - left.node.gravity
      || right.depth - left.depth
      || left.node.id.localeCompare(right.node.id, "en"))
    .slice(0, budget);
  const occupied: Array<{ left: number; right: number; top: number; bottom: number }> = [...reserved];
  const output: LabelPlacement[] = [];
  for (const item of candidates) {
    const textWidth = Math.min(170, Math.max(72, [...graphNodeLabel(item.node)].length * 7.2 + 24));
    const align: "left" | "right" = item.x > width * 0.72 ? "right" : "left";
    const labelX = align === "left" ? item.x + item.radius + 12 : item.x - item.radius - 12;
    const labelY = item.y - item.radius - 4;
    const box = {
      left: align === "left" ? labelX : labelX - textWidth,
      right: align === "left" ? labelX + textWidth : labelX,
      top: labelY - 18,
      bottom: labelY + 12,
    };
    if (box.left < 8 || box.right > width - 8 || box.top < 8 || box.bottom > height - 8) continue;
    if (occupied.some((prior) => !(
      box.right + 6 < prior.left
      || box.left - 6 > prior.right
      || box.bottom + 5 < prior.top
      || box.top - 5 > prior.bottom
    ))) continue;
    occupied.push(box);
    output.push({ ...item, labelX, labelY, align });
  }
  return output;
}

export function SemanticObservatoryCanvas({
  graph,
  meaning,
  mode,
  focusId,
  previewId = null,
  districtId = null,
  freshness = "all",
  from = null,
  to = null,
  mobile = false,
  reducedMotion = false,
  onSelect,
  onPreview,
  className = "",
}: {
  graph: AtlasGraphV1;
  meaning: AtlasMeaningV2;
  mode: ObservatoryMode;
  focusId: string | null;
  previewId?: string | null;
  districtId?: string | null;
  freshness?: GraphFreshness;
  from?: string | null;
  to?: string | null;
  mobile?: boolean;
  reducedMotion?: boolean;
  onSelect: (id: string) => void;
  onPreview?: (id: string | null) => void;
  className?: string;
}) {
  const { ref: containerRef, width, height } = useElementSize<HTMLDivElement>();
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const interactionCanvasRef = useRef<HTMLCanvasElement>(null);
  const baseRedraws = useRef(0);
  const interactionRedraws = useRef(0);
  const hoverIdRef = useRef<string | null>(null);
  const pendingPointerRef = useRef<{ x: number; y: number } | null>(null);
  const pointerFrameRef = useRef(0);
  const dragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    camera: CameraState;
    moved: boolean;
  } | null>(null);
  const [camera, setCamera] = useState(defaultCamera);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const activeId = hoverId ?? previewId ?? focusId;
  const clusterLabelById = useMemo(
    () => new Map(graph.clusters.map((cluster) => [cluster.id, cluster.label])),
    [graph.clusters],
  );
  const visibleNodes = useMemo(() => visibleNodesForMode({
    graph,
    meaning,
    mode,
    mobile,
    districtId,
    freshness,
    focusId,
    from,
    to,
  }), [districtId, focusId, freshness, from, graph, meaning, mobile, mode, to]);
  const featuredSlots = useMemo(() => {
    if (mode !== "home") return new Map();
    const anchorIds = new Set(meaning.domainBackbone.flatMap((domain) =>
      domain.anchorNodeId ? [domain.anchorNodeId] : []));
    const roleSlots = {
      cross_domain_bridge: { x: 0.61, y: 0.47, depth: 0.66, spreadX: 0.025, spreadY: 0.025 },
      frontier_signal: { x: 0.36, y: 0.64, depth: 0.84, spreadX: 0.025, spreadY: 0.025 },
      gravity_anchor: { x: 0.5, y: 0.7, depth: 0.93, spreadX: 0.025, spreadY: 0.025 },
    } as const;
    const slots = new Map<string, {
      x: number;
      y: number;
      depth: number;
      spreadX: number;
      spreadY: number;
    }>();
    for (const protagonist of meaning.protagonists) {
      if (anchorIds.has(protagonist.nodeId)) continue;
      const slot = roleSlots[protagonist.role];
      const offset = (stableUnit(protagonist.nodeId) - 0.5) * 0.035;
      slots.set(protagonist.nodeId, { ...slot, x: slot.x + offset, y: slot.y - offset * 0.45 });
    }
    return slots;
  }, [meaning.domainBackbone, meaning.protagonists, mode]);
  const projected = useMemo(() => projectNodes({
    graph,
    nodes: visibleNodes,
    width: Math.max(1, width),
    height: Math.max(1, height),
    camera,
    mode,
    mobile,
    featuredSlots,
  }), [camera, featuredSlots, graph, height, mobile, mode, visibleNodes, width]);
  const projectedById = useMemo(
    () => new Map(projected.map((item) => [item.node.id, item])),
    [projected],
  );
  const visibleNodeIds = useMemo(() => new Set(projected.map((item) => item.node.id)), [projected]);
  const backboneEdgeIds = useMemo(
    () => meaning.domainBackbone.flatMap((domain) => domain.edgeIds),
    [meaning.domainBackbone],
  );
  const path = useMemo(() => shortestDirectedPath(graph, from, to), [from, graph, to]);
  const pathIds = useMemo(() => pathEdgeIds(graph, path), [graph, path]);
  const baseEdges = useMemo(() => {
    if (mode === "flow" && pathIds.size) {
      return rankEdges(graph.edges.filter((edge) => pathIds.has(edge.id)));
    }
    if (mode === "home") {
      return selectExploreEdges(graph, backboneEdgeIds, visibleNodeIds, mobile ? 8 : 16);
    }
    return selectExploreEdges(graph, backboneEdgeIds, visibleNodeIds, mobile ? 12 : 24);
  }, [backboneEdgeIds, graph, mobile, mode, pathIds, visibleNodeIds]);
  const nodeById = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);
  const activeNeighborhood = useMemo(() => selectedNeighborhood(graph, activeId), [activeId, graph]);
  const interactionEdges = useMemo(() => {
    if (!activeId) return [];
    if (mode === "flow") return baseEdges;
    return [...activeNeighborhood.incoming.slice(0, 6), ...activeNeighborhood.outgoing.slice(0, 6)]
      .filter((edge, index, rows) => rows.findIndex((candidate) => candidate.id === edge.id) === index)
      .filter((edge) => projectedById.has(edge.source) && projectedById.has(edge.target));
  }, [activeId, activeNeighborhood.incoming, activeNeighborhood.outgoing, baseEdges, mode, projectedById]);
  const activeNodeIds = useMemo(() => new Set([
    ...(activeId ? [activeId] : []),
    ...interactionEdges.flatMap((edge) => [edge.source, edge.target]),
  ]), [activeId, interactionEdges]);
  const persistentIds = useMemo(() => {
    const domainAnchorIds = new Set(meaning.domainBackbone.flatMap((domain) =>
      domain.anchorNodeId ? [domain.anchorNodeId] : []));
    return new Set([
      ...meaning.protagonists.flatMap((protagonist) =>
        domainAnchorIds.has(protagonist.nodeId) ? [] : [protagonist.nodeId]),
      ...(focusId ? [focusId] : []),
    ]);
  }, [focusId, meaning.domainBackbone, meaning.protagonists]);
  const domainLabels = useMemo(() => mode === "home"
    ? meaning.domainBackbone.flatMap((domain) => {
        if (!domain.anchorNodeId) return [];
        const anchor = nodeById.get(domain.anchorNodeId);
        const cluster = anchor ? graph.clusters.find((item) => item.id === anchor.clusterId) : null;
        const slot = cluster ? clusterSlot(cluster.id, cluster.label, 0, mode) : coreSlots[domain.domain];
        if (!anchor || !slot) return [];
        const { stageWidth, stageHeight, stageTop } = observatoryStage(width, height, mobile);
        const slotX = responsiveSlotX({
          x: slot.x,
          clusterLabel: cluster?.label ?? domain.domain,
          width,
          mobile,
          featured: false,
        });
        return [{
          ...domain,
          anchorLabel: graphNodeLabel(anchor),
          left: slotX * stageWidth
            + (mobile
              ? -slot.spreadX * stageWidth * (domain.domain === "Papers" ? 0.18 : 0.22)
              : domain.domain === "Papers"
                ? -slot.spreadX * stageWidth * 0.42
                : slot.spreadX * stageWidth * 0.34),
          top: stageTop
            + slot.y * stageHeight
            - slot.spreadY * stageHeight * 0.62
            - (mobile && domain.domain === "MOC" ? stageHeight * 0.07 : 0),
        }];
      })
    : [], [graph.clusters, height, meaning.domainBackbone, mobile, mode, nodeById, width]);
  const labels = useMemo(
    () => placeLabels(
      projected,
      persistentIds,
      width,
      height,
      mobile ? 6 : 18,
      domainLabels.map((domain) => ({
        left: domain.left - 6,
        right: domain.left + 142,
        top: domain.top - 5,
        bottom: domain.top + 42,
      })),
    ),
    [domainLabels, height, mobile, persistentIds, projected, width],
  );
  const spatialIndex = useMemo(() => {
    const cellSize = 72;
    const cells = new Map<string, ProjectedNode[]>();
    for (const item of projected) {
      const key = `${Math.floor(item.x / cellSize)}:${Math.floor(item.y / cellSize)}`;
      const rows = cells.get(key) ?? [];
      rows.push(item);
      cells.set(key, rows);
    }
    return { cellSize, cells };
  }, [projected]);

  const setCanvasSize = useCallback((canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) => {
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    return dpr;
  }, [height, width]);

  useEffect(() => {
    const canvas = baseCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || width < 2 || height < 2 || document.hidden) return;
    setCanvasSize(canvas, context);
    context.clearRect(0, 0, width, height);
    drawBackground(context, width, height, projected, clusterLabelById);
    for (const edge of baseEdges) {
      drawEdge(
        context,
        edge,
        projectedById,
        clusterLabelById,
        mode === "home" ? 0.42 : mode === "flow" ? 0.72 : 0.48,
        mode === "flow" ? 1.24 : 1,
      );
    }
    for (const item of projected) drawNode(context, item, clusterLabelById, { alpha: 0.34 + item.depth * 0.66 });
    baseRedraws.current += 1;
    containerRef.current?.setAttribute("data-base-redraw-count", String(baseRedraws.current));
  }, [baseEdges, clusterLabelById, height, mode, projected, projectedById, setCanvasSize, width]);

  useEffect(() => {
    const canvas = interactionCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || width < 2 || height < 2 || document.hidden) return;
    setCanvasSize(canvas, context);
    context.clearRect(0, 0, width, height);
    if (activeId) {
      context.fillStyle = "rgba(3,3,3,.54)";
      context.fillRect(0, 0, width, height);
      for (const edge of interactionEdges) {
        drawEdge(context, edge, projectedById, clusterLabelById, mode === "flow" ? 1 : 0.94, mode === "flow" ? 1.55 : 1.28);
      }
      for (const item of projected) {
        if (!activeNodeIds.has(item.node.id)) continue;
        drawNode(context, item, clusterLabelById, {
          emphasis: item.node.id === activeId ? 1.32 : 1.06,
          alpha: item.node.id === activeId ? 1 : 0.84,
        });
      }
    }
    interactionRedraws.current += 1;
    containerRef.current?.setAttribute("data-interaction-redraw-count", String(interactionRedraws.current));
  }, [activeId, activeNodeIds, clusterLabelById, height, interactionEdges, mode, projected, projectedById, setCanvasSize, width]);

  const commitHover = useCallback((nextId: string | null) => {
    if (hoverIdRef.current === nextId) return;
    hoverIdRef.current = nextId;
    setHoverId(nextId);
    onPreview?.(nextId);
  }, [onPreview]);

  const hitTest = useCallback((x: number, y: number) => {
    const { cellSize, cells } = spatialIndex;
    const cellX = Math.floor(x / cellSize);
    const cellY = Math.floor(y / cellSize);
    const candidates: ProjectedNode[] = [];
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        candidates.push(...(cells.get(`${cellX + dx}:${cellY + dy}`) ?? []));
      }
    }
    return candidates
      .sort((left, right) => right.depth - left.depth)
      .find((item) => Math.hypot(item.x - x, item.y - y) <= Math.max(13, item.radius * 1.5))
      ?? null;
  }, [spatialIndex]);

  const queueHitTest = useCallback((x: number, y: number) => {
    pendingPointerRef.current = { x, y };
    if (pointerFrameRef.current) return;
    pointerFrameRef.current = requestAnimationFrame(() => {
      pointerFrameRef.current = 0;
      const pending = pendingPointerRef.current;
      pendingPointerRef.current = null;
      if (!pending) return;
      commitHover(hitTest(pending.x, pending.y)?.node.id ?? null);
    });
  }, [commitHover, hitTest]);

  useEffect(() => () => cancelAnimationFrame(pointerFrameRef.current), []);

  const pointerPosition = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (mobile) return;
    const point = pointerPosition(event);
    dragRef.current = {
      pointerId: event.pointerId,
      x: point.x,
      y: point.y,
      camera,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = pointerPosition(event);
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      queueHitTest(point.x, point.y);
      return;
    }
    const dx = point.x - drag.x;
    const dy = point.y - drag.y;
    if (Math.hypot(dx, dy) > 4) drag.moved = true;
    if (drag.moved) {
      commitHover(null);
      setCamera(clampCamera({
        ...drag.camera,
        yaw: drag.camera.yaw + dx * 0.0015,
        pitch: drag.camera.pitch + dy * 0.0011,
      }));
    }
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = pointerPosition(event);
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.moved) {
      const hit = hitTest(point.x, point.y);
      if (hit) onSelect(hit.node.id);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
  };

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (mobile) return;
    event.preventDefault();
    setCamera((current) => clampCamera({
      ...current,
      zoom: current.zoom * Math.exp(-event.deltaY * 0.001),
    }));
  };

  const activeNode = activeId ? nodeById.get(activeId) ?? null : null;
  const activeCluster = activeNode ? clusterLabelById.get(activeNode.clusterId) ?? "구역 미확인" : null;
  const hiddenIncoming = Math.max(0, graph.edges.filter((edge) => edge.target === activeId).length - 6);
  const hiddenOutgoing = Math.max(0, graph.edges.filter((edge) => edge.source === activeId).length - 6);

  return (
    <div
      ref={containerRef}
      className={`semantic-observatory is-${mode} ${className}`.trim()}
      data-renderer="canvas2d-semantic-observatory-2_5d"
      data-base-layer="SpatialBaseLayer"
      data-interaction-layer="SpatialInteractionLayer"
      data-html-layer="SpatialHtmlLayer"
      data-node-count={projected.length}
      data-edge-count={baseEdges.length}
      data-featured-node-count={featuredSlots.size}
      data-featured-positions={JSON.stringify(projected
        .filter((item) => featuredSlots.has(item.node.id))
        .map((item) => [item.node.id, Math.round(item.x), Math.round(item.y), Number(item.depth.toFixed(2))]))}
      data-preview-id={hoverId ?? previewId ?? ""}
      data-focus-id={focusId ?? ""}
      data-homi-knowledge-edge-count="0"
      data-domain-coverage={JSON.stringify(meaning.manifest.domainCoverage)}
      tabIndex={0}
      aria-label={`2.5D 방향 지식 관측소. 노드 ${projected.length}개, 실제 방향 관계 ${baseEdges.length}개. MOC·Papers·Signals는 서로 다른 깊이 평면에 있습니다.`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => {
        if (!dragRef.current) commitHover(null);
      }}
      onPointerCancel={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        dragRef.current = null;
        commitHover(null);
      }}
      onWheel={onWheel}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          commitHover(null);
          return;
        }
        if (mobile) return;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          setCamera((current) => clampCamera({
            ...current,
            yaw: current.yaw + (event.key === "ArrowLeft" ? -0.045 : 0.045),
          }));
        } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          setCamera((current) => clampCamera({
            ...current,
            pitch: current.pitch + (event.key === "ArrowUp" ? -0.04 : 0.04),
          }));
        }
      }}
    >
      <canvas ref={baseCanvasRef} className="semantic-observatory__base" aria-hidden="true" />
      <canvas ref={interactionCanvasRef} className="semantic-observatory__interaction" aria-hidden="true" />
      <div
        className="semantic-observatory__domains"
        style={{ position: "absolute", zIndex: 3, inset: 0, pointerEvents: "none" }}
        aria-hidden="true"
      >
        {domainLabels.map((domain) => (
          <span
            key={domain.id}
            className={`semantic-observatory__domain is-${domain.domain.toLowerCase()}`}
            style={{
              position: "absolute",
              left: domain.left,
              top: domain.top,
              display: "grid",
              gap: 1,
              color: domain.domain === "Papers" ? "#bda0ee" : domain.domain === "Signals" ? "#65d9ca" : "#e5aa51",
              textShadow: "0 0 18px #070705,0 2px 5px #070705",
            }}
          >
            <strong style={{ font: "760 18px/1 var(--fm)", letterSpacing: ".02em", textTransform: "uppercase" }}>
              {domain.domain}
            </strong>
            <small style={{ color: "rgba(239,229,213,.72)", font: "620 12px var(--fm)" }}>
              {domain.anchorLabel}
            </small>
          </span>
        ))}
      </div>
      <div className="semantic-observatory__labels graph-label-layer">
        {labels.map((item) => (
          <button
            type="button"
            key={item.node.id}
            className={`semantic-observatory__label is-${(clusterLabelById.get(item.node.clusterId) ?? "other").replaceAll(" ", "-")}${item.node.id === activeId ? " is-active" : ""}`}
            style={{
              left: item.labelX,
              top: item.labelY,
              translate: item.align === "right" ? "-100% -50%" : "0 -50%",
              textAlign: item.align,
            }}
            aria-pressed={item.node.id === focusId}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerEnter={() => commitHover(item.node.id)}
            onPointerLeave={() => commitHover(null)}
            onFocus={() => commitHover(item.node.id)}
            onBlur={() => commitHover(null)}
            onClick={() => onSelect(item.node.id)}
          >
            <strong>{graphNodeLabel(item.node)}</strong>
            {meaning.domainBackbone.some((domain) => domain.anchorNodeId === item.node.id) && (
              <small>{clusterLabelById.get(item.node.clusterId)}</small>
            )}
          </button>
        ))}
      </div>
      {activeNode && (
        <div
          className="graph-hover-tooltip"
          style={{
            left: Math.max(128, Math.min(width - 128, projectedById.get(activeNode.id)?.x ?? width / 2)),
            top: Math.max(74, Math.min(height - 86, (projectedById.get(activeNode.id)?.y ?? height / 2) - 46)),
          }}
          aria-hidden="true"
        >
          <strong>{graphNodeLabel(activeNode)}</strong>
          <span>{activeCluster} · {graphNodeKindLabel(activeNode.kind)}</span>
          <span>들어옴 {activeNeighborhood.incoming.length} · 나감 {activeNeighborhood.outgoing.length}</span>
          {(hiddenIncoming + hiddenOutgoing) > 0 && <small>숨긴 관계 {hiddenIncoming + hiddenOutgoing}개</small>}
        </div>
      )}
      {!mobile && mode !== "home" && (
        <div className="graph-camera-controls" role="group" aria-label="2.5D 카메라 제어">
          <button type="button" aria-label="선택에 맞추기" onClick={() => {
            const point = focusId ? projectedById.get(focusId) : null;
            setCamera((current) => point
              ? clampCamera({
                  ...current,
                  panX: current.panX + (width * 0.56 - point.x) * 0.4,
                  panY: current.panY + (height * 0.5 - point.y) * 0.4,
                  zoom: Math.max(current.zoom, 1.08),
                })
              : defaultCamera);
          }}><Focus size={15} /></button>
          <button type="button" aria-label="확대" onClick={() => setCamera((current) => clampCamera({ ...current, zoom: current.zoom * 1.1 }))}><Plus size={15} /></button>
          <button type="button" aria-label="축소" onClick={() => setCamera((current) => clampCamera({ ...current, zoom: current.zoom / 1.1 }))}><Minus size={15} /></button>
          <button type="button" aria-label="카메라 초기화" onClick={() => setCamera(defaultCamera)}><RotateCcw size={15} /></button>
        </div>
      )}
      <ol className="graph-accessible-list" aria-label="2.5D 관측소의 현재 지식 노드">
        {projected.map((item) => (
          <li key={item.node.id}>
            <button
              type="button"
              onFocus={() => commitHover(item.node.id)}
              onBlur={() => commitHover(null)}
              onClick={() => onSelect(item.node.id)}
              aria-current={item.node.id === focusId ? "true" : undefined}
            >
              <strong>{graphNodeLabel(item.node)}</strong>
              <span>{clusterLabelById.get(item.node.clusterId)} · 참조 문서 {item.node.gravity}개 · 전체 참조 {item.node.occurrences}회</span>
            </button>
          </li>
        ))}
      </ol>
      <ol className="graph-accessible-list" aria-label="2.5D 관측소의 실제 방향 관계">
        {baseEdges.map((edge) => (
          <li key={edge.id}>
            {graphNodeLabel(nodeById.get(edge.source)!)} → {graphNodeLabel(nodeById.get(edge.target)!)} · 실제 참조 {edge.occurrenceCount}회
          </li>
        ))}
      </ol>
      <span className="sr-only" aria-live="polite">
        {activeNode
          ? `${graphNodeLabel(activeNode)}. 들어오는 참조 ${activeNeighborhood.incoming.length}개, 나가는 참조 ${activeNeighborhood.outgoing.length}개.`
          : ""}
      </span>
      {reducedMotion && <span className="sr-only">모션 축소 모드: 카메라 전환과 선 추적을 즉시 적용합니다.</span>}
    </div>
  );
}
