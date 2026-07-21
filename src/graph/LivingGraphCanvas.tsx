import { Focus, Minus, Plus, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import type { AtlasGraphCoordinateV1, AtlasGraphNodeV1, AtlasGraphV1, MatrixCell } from "../types";
import { districtRelationRoutes, graphNodeLabel, type FreshnessBucket, visibleGraphSelection } from "./model";
import {
  cameraForSelection,
  clampCamera,
  defaultCamera,
  interpolateCamera,
  projectCoordinate,
  type Camera3D,
  type ProjectedPoint,
} from "./projection3d";

type GraphScene = "field" | "gravity" | "freshness" | "trace";
type Presentation = "home" | "workspace";

const colorVariables: Record<string, string> = {
  "중심 지식": "--district-knowledge",
  "연구 논거": "--district-research",
  전략: "--district-strategy",
  신호: "--district-signal",
  "운영 기반": "--district-operations",
  Rocket: "--district-rocket",
  Groot: "--district-groot",
  "Intelligence Layer": "--district-intelligence",
  "Independent Projects": "--district-independent",
  "연구 기록": "--district-research-records",
};

// The light product surfaces need comparatively dark district strokes, while
// the spatial field needs luminous-but-flat marks.  Keep that translation
// explicit so the Canvas never falls back to generic neon or glossy material.
const fieldColors: Record<string, string> = {
  "중심 지식": "#4fd5b9",
  "연구 논거": "#6f91f4",
  전략: "#f0a04b",
  신호: "#f36f87",
  "운영 기반": "#a8d05f",
  Rocket: "#ae82e3",
  Groot: "#55c994",
  "Intelligence Layer": "#759dde",
  "Independent Projects": "#9d83dc",
  "연구 기록": "#57b9cf",
};

function colorFor(label: string, style: CSSStyleDeclaration) {
  return fieldColors[label]
    ?? (style.getPropertyValue(colorVariables[label] ?? "--district-neutral").trim() || "#71837c");
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function drawNodePath(context: CanvasRenderingContext2D, node: AtlasGraphNodeV1, x: number, y: number, radius: number) {
  if (node.kind === "paper_gateway") {
    context.beginPath();
    context.moveTo(x, y - radius);
    context.lineTo(x + radius, y);
    context.lineTo(x, y + radius);
    context.lineTo(x - radius, y);
    context.closePath();
    return;
  }
  if (node.kind === "project" || node.kind === "project_stage") {
    roundedRect(context, x - radius * 1.15, y - radius * 0.72, radius * 2.3, radius * 1.44, Math.max(4, radius * 0.38));
    return;
  }
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
}

function drawArrow(context: CanvasRenderingContext2D, source: ProjectedPoint, target: ProjectedPoint, radius: number) {
  const angle = Math.atan2(target.y - source.y, target.x - source.x);
  const endX = target.x - Math.cos(angle) * (radius + 3);
  const endY = target.y - Math.sin(angle) * (radius + 3);
  const arrow = Math.max(5, Math.min(9, 6 * target.scale));
  context.beginPath();
  context.moveTo(endX, endY);
  context.lineTo(endX - Math.cos(angle - Math.PI / 6) * arrow, endY - Math.sin(angle - Math.PI / 6) * arrow);
  context.lineTo(endX - Math.cos(angle + Math.PI / 6) * arrow, endY - Math.sin(angle + Math.PI / 6) * arrow);
  context.closePath();
  context.fill();
}

function rgba(color: string, alpha: number) {
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    const value = Number.parseInt(color.slice(1), 16);
    return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
  }
  return color;
}

function mixHex(left: string, right: string, amount: number) {
  const parse = (value: string) => /^#[0-9a-f]{6}$/i.test(value)
    ? Number.parseInt(value.slice(1), 16)
    : Number.parseInt("71837c", 16);
  const leftValue = parse(left);
  const rightValue = parse(right);
  const ratio = Math.max(0, Math.min(1, amount));
  const channel = (shift: number) => Math.round(
    ((leftValue >> shift) & 255) * (1 - ratio) + ((rightValue >> shift) & 255) * ratio,
  );
  return `#${[channel(16), channel(8), channel(0)].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function depthForCluster(coordinates: AtlasGraphCoordinateV1[]) {
  if (!coordinates.length) return { near: 120, far: 360 };
  const values = coordinates.map((coordinate) => coordinate.z);
  return {
    near: Math.max(0, Math.min(...values) - 48),
    far: Math.min(640, Math.max(...values) + 36),
  };
}

function drawProjectedRing(
  context: CanvasRenderingContext2D,
  ring: number[][],
  z: number,
  project: (coordinate: Pick<AtlasGraphCoordinateV1, "x" | "y" | "z">) => ProjectedPoint,
) {
  const points = ring.map(([x, y]) => project({ x, y, z })).filter((point) => point.visible);
  if (points.length < 3) return [];
  context.beginPath();
  points.forEach((point, index) => index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y));
  context.closePath();
  return points;
}

interface LabelPlacement {
  node: AtlasGraphNodeV1;
  x: number;
  y: number;
  depth: number;
}

interface AggregateDocumentMark {
  parentId: string;
  clusterId: string;
  coordinate: Pick<AtlasGraphCoordinateV1, "x" | "y" | "z">;
}

function stableUnit(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function aggregateDocumentMarks(
  nodes: AtlasGraphNodeV1[],
  coordinateById: Map<string, AtlasGraphCoordinateV1>,
): AggregateDocumentMark[] {
  const marks: AggregateDocumentMark[] = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (const node of nodes) {
    if (node.kind !== "aggregate_boundary" || node.representedDocuments < 1) continue;
    const anchor = coordinateById.get(node.id);
    if (!anchor) continue;
    const count = node.representedDocuments;
    const spread = Math.min(156, 24 + Math.sqrt(count) * 5.8);
    const phase = stableUnit(node.id) * Math.PI * 2;
    for (let index = 0; index < count; index += 1) {
      const radial = Math.sqrt((index + 0.5) / count);
      const angle = phase + index * goldenAngle;
      const ripple = 0.72 + stableUnit(`${node.id}:${index}:r`) * 0.28;
      const lift = stableUnit(`${node.id}:${index}:y`) - 0.5;
      const depth = stableUnit(`${node.id}:${index}:z`) - 0.5;
      marks.push({
        parentId: node.id,
        clusterId: node.clusterId,
        coordinate: {
          x: anchor.x + Math.cos(angle) * spread * radial * ripple,
          y: anchor.y + lift * spread * 0.66,
          z: anchor.z + Math.sin(angle) * spread * radial * 0.74 + depth * spread * 0.38,
        },
      });
    }
  }
  return marks;
}

function placeLabels(
  nodes: AtlasGraphNodeV1[],
  projectedById: Map<string, ProjectedPoint>,
  coordinateById: Map<string, AtlasGraphCoordinateV1>,
  focusId: string | null,
  budget: number,
  viewport: { width: number; height: number },
  presentation: Presentation,
  touchTarget: boolean,
) {
  const safeLeft = presentation === "home" && viewport.width >= 900 ? viewport.width * 0.31 : 18;
  const safeRight = viewport.width - (presentation === "home" ? 82 : 18);
  const safeTop = 28;
  const safeBottom = viewport.height - 32;
  const occupied: Array<{ left: number; top: number; right: number; bottom: number }> = [];
  const output: LabelPlacement[] = [];
  const kindRank = (node: AtlasGraphNodeV1) => node.kind === "district" ? 0 : node.kind === "aggregate_boundary" ? 2 : 1;
  const ranked = [...nodes].sort((left, right) =>
    (left.id === focusId ? -1 : right.id === focusId ? 1 : 0)
    || kindRank(left) - kindRank(right)
    || right.gravity - left.gravity
    || left.id.localeCompare(right.id, "en"));

  for (const node of ranked) {
    if (output.length >= budget && node.id !== focusId) continue;
    const point = projectedById.get(node.id);
    const coordinate = coordinateById.get(node.id);
    if (!point?.visible || !coordinate) continue;
    const label = graphNodeLabel(node);
    const width = Math.min(node.kind === "district" ? 184 : 148, Math.max(52, 16 + [...label].length * 7.2));
    const height = touchTarget ? 44 : node.id === focusId ? 31 : 25;
    const radius = Math.max(5, coordinate.radius * point.scale * 1.18);
    const offsets = [
      [0, -radius - 17],
      [radius + width / 2 + 8, 0],
      [-radius - width / 2 - 8, 0],
      [0, radius + 17],
    ];
    for (const [offsetX, offsetY] of offsets) {
      const x = point.x + offsetX;
      const y = point.y + offsetY;
      const box = { left: x - width / 2, right: x + width / 2, top: y - height / 2, bottom: y + height / 2 };
      if (box.left < safeLeft || box.right > safeRight || box.top < safeTop || box.bottom > safeBottom) continue;
      if (occupied.some((prior) => !(box.right + 5 < prior.left || box.left - 5 > prior.right || box.bottom + 4 < prior.top || box.top - 4 > prior.bottom))) continue;
      occupied.push(box);
      output.push({ node, x, y, depth: point.depth });
      break;
    }
  }
  return output.sort((left, right) => left.depth - right.depth);
}

export function LivingGraphCanvas({
  graph,
  scene = "field",
  focusId,
  districtId = null,
  freshness = "all",
  from = null,
  to = null,
  mobile = false,
  reducedMotion = false,
  presentation = "workspace",
  districtRelationMatrix = [],
  onSelect,
  className = "",
}: {
  graph: AtlasGraphV1;
  scene?: GraphScene;
  focusId: string | null;
  districtId?: string | null;
  freshness?: FreshnessBucket;
  from?: string | null;
  to?: string | null;
  mobile?: boolean;
  reducedMotion?: boolean;
  presentation?: Presentation;
  districtRelationMatrix?: readonly MatrixCell[];
  onSelect: (id: string) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef(0);
  const previousFocusRef = useRef(focusId);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    camera: Camera3D;
    pan: boolean;
    moved: boolean;
    lastX: number;
    lastY: number;
    lastTime: number;
    velocityX: number;
    velocityY: number;
  } | null>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [hidden, setHidden] = useState(document.hidden);
  const [camera, setCamera] = useState(() => {
    const target = defaultCamera(graph, presentation, mobile);
    return reducedMotion ? target : { ...target, yaw: target.yaw - 0.12, pitch: target.pitch + 0.05, zoom: target.zoom * 0.92 };
  });
  const [traceProgress, setTraceProgress] = useState(1);
  const selection = useMemo(() => visibleGraphSelection(graph, {
    districtId, freshness, focusId, mobile, from, to,
  }), [districtId, focusId, freshness, from, graph, mobile, to]);
  const coordinateById = useMemo(() => new Map(graph.layout.coordinates.map((item) => [item.id, item])), [graph.layout.coordinates]);
  const nodeById = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);
  const clusterById = useMemo(() => new Map(graph.clusters.map((cluster) => [cluster.id, cluster])), [graph.clusters]);
  const clusterCoordinates = useMemo(() => new Map(graph.clusters.map((cluster) => [
    cluster.id,
    graph.layout.coordinates.filter((coordinate) => graph.nodes.find((node) => node.id === coordinate.id)?.clusterId === cluster.id),
  ])), [graph.clusters, graph.layout.coordinates, graph.nodes]);
  const documentMarks = useMemo(
    () => aggregateDocumentMarks(selection.nodes, coordinateById),
    [coordinateById, selection.nodes],
  );
  const districtRoutes = useMemo(
    () => districtRelationRoutes(graph, districtRelationMatrix),
    [districtRelationMatrix, graph],
  );

  const animateCamera = useCallback((target: Camera3D, duration = 520) => {
    cancelAnimationFrame(animationRef.current);
    if (reducedMotion || hidden) {
      setCamera(target);
      return;
    }
    const started = performance.now();
    let source: Camera3D | null = null;
    const frame = (now: number) => {
      setCamera((current) => {
        if (!source) source = current;
        return interpolateCamera(source, target, (now - started) / duration);
      });
      if (now - started < duration) animationRef.current = requestAnimationFrame(frame);
    };
    animationRef.current = requestAnimationFrame(frame);
  }, [hidden, reducedMotion]);

  const resetCamera = useCallback(() => animateCamera(defaultCamera(graph, presentation, mobile), 480), [animateCamera, graph, mobile, presentation]);

  useEffect(() => {
    const target = defaultCamera(graph, presentation, mobile);
    if (reducedMotion) {
      setCamera(target);
      return;
    }
    const timer = requestAnimationFrame(() => animateCamera(target, 760));
    return () => cancelAnimationFrame(timer);
  }, [animateCamera, graph, mobile, presentation, reducedMotion]);

  useEffect(() => {
    if (previousFocusRef.current === focusId) return;
    previousFocusRef.current = focusId;
    if (!focusId) return;
    const coordinate = coordinateById.get(focusId);
    if (coordinate) animateCamera(mobile
      ? clampCamera({
        ...camera,
        focusX: camera.focusX + (coordinate.x - camera.focusX) * 0.24,
        focusY: camera.focusY + (coordinate.y - camera.focusY) * 0.24,
        focusZ: camera.focusZ + (coordinate.z - camera.focusZ) * 0.24,
        zoom: Math.min(0.96, camera.zoom * 1.04),
        panX: 0,
        panY: -8,
      })
      : cameraForSelection(camera, coordinate), 520);
    if (reducedMotion) {
      setTraceProgress(1);
      return;
    }
    let frame = 0;
    const started = performance.now();
    setTraceProgress(0);
    const update = (now: number) => {
      const progress = Math.min(1, (now - started) / 520);
      setTraceProgress(1 - Math.pow(1 - progress, 3));
      if (progress < 1) frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
    // Selection is the event boundary. Camera is intentionally read at that moment only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  useEffect(() => () => cancelAnimationFrame(animationRef.current), []);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    let frame = 0;
    let previous = { width: 0, height: 0 };
    const observer = new ResizeObserver(([entry]) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const width = Math.max(1, Math.round(entry.contentRect.width));
        const height = Math.max(1, Math.round(entry.contentRect.height));
        if (width === previous.width && height === previous.height) return;
        previous = { width, height };
        setSize(previous);
      });
    });
    observer.observe(node);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const sync = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  const projectedById = useMemo(() => new Map(selection.nodes.map((node) => {
    const coordinate = coordinateById.get(node.id)!;
    return [node.id, projectCoordinate(coordinate, camera, size, presentation)] as const;
  })), [camera, coordinateById, presentation, selection.nodes, size]);

  const compactLandscape = size.width <= 900 && window.innerHeight <= 520;
  const labels = useMemo(() => placeLabels(
    selection.nodes,
    projectedById,
    coordinateById,
    focusId,
    compactLandscape ? Math.min(5, graph.layout.labelBudget) : mobile ? Math.min(9, graph.layout.labelBudget) : presentation === "home" ? Math.min(9, graph.layout.labelBudget) : graph.layout.labelBudget,
    size,
    presentation,
    mobile || compactLandscape,
  ), [compactLandscape, coordinateById, focusId, graph.layout.labelBudget, mobile, presentation, projectedById, selection.nodes, size]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || hidden) return;
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    canvas.width = Math.max(1, Math.round(size.width * dpr));
    canvas.height = Math.max(1, Math.round(size.height * dpr));
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, size.width, size.height);
    const style = getComputedStyle(document.documentElement);
    const project = (coordinate: Pick<AtlasGraphCoordinateV1, "x" | "y" | "z">) =>
      projectCoordinate(coordinate, camera, size, presentation);
    const focusedClusterId = focusId ? nodeById.get(focusId)?.clusterId ?? null : null;
    const focusContext = scene === "gravity" || scene === "trace";
    const pathClusterPairs = new Set(selection.path.slice(0, -1).map((id, index) => {
      const sourceCluster = nodeById.get(id)?.clusterId;
      const targetCluster = nodeById.get(selection.path[index + 1])?.clusterId;
      return sourceCluster && targetCluster && sourceCluster !== targetCluster
        ? `${sourceCluster}\0${targetCluster}`
        : "";
    }).filter(Boolean));

    // The field is not wallpaper. A graphite-aubergine base avoids the blue
    // "deep sea" cast, while the vertical wash still reinforces freshness.
    const backdrop = context.createLinearGradient(0, 0, size.width, size.height);
    backdrop.addColorStop(0, "#100d14");
    backdrop.addColorStop(0.34, "#0b0911");
    backdrop.addColorStop(0.72, "#080912");
    backdrop.addColorStop(1, "#04050a");
    context.fillStyle = backdrop;
    context.fillRect(0, 0, size.width, size.height);

    const freshnessWash = context.createLinearGradient(0, 0, 0, size.height);
    freshnessWash.addColorStop(0, "rgba(181,188,244,.055)");
    freshnessWash.addColorStop(0.42, "rgba(112,92,158,.018)");
    freshnessWash.addColorStop(0.76, "rgba(58,39,75,.012)");
    freshnessWash.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = freshnessWash;
    context.fillRect(0, 0, size.width, size.height);

    const gravityPoints = selection.nodes
      .filter((node) => node.kind !== "district")
      .map((node) => ({ node, point: projectedById.get(node.id) }))
      .filter((item): item is { node: AtlasGraphNodeV1; point: ProjectedPoint } => Boolean(item.point?.visible));
    const gravityWeight = gravityPoints.reduce((sum, item) => sum + Math.max(1, item.node.gravity), 0);
    const gravityCenter = gravityWeight > 0 ? {
      x: gravityPoints.reduce((sum, item) => sum + item.point.x * Math.max(1, item.node.gravity), 0) / gravityWeight,
      y: gravityPoints.reduce((sum, item) => sum + item.point.y * Math.max(1, item.node.gravity), 0) / gravityWeight,
    } : { x: size.width * 0.62, y: size.height * 0.5 };
    const gravityColor = focusContext && focusedClusterId
      ? mixHex(colorFor(clusterById.get(focusedClusterId)?.label ?? "", style), "#947cae", 0.76)
      : "#947cae";

    // Unite the whole graph with one subdued, data-derived atmospheric body.
    // Its center, angle and extent come from the visible district anchors, so
    // this reads as a spatial substrate rather than decorative space art.
    const districtFieldPoints = selection.nodes
      .filter((node) => node.kind === "district")
      .map((node) => projectedById.get(node.id))
      .filter((point): point is ProjectedPoint => Boolean(point?.visible));
    if (districtFieldPoints.length > 1) {
      const centerX = districtFieldPoints.reduce((sum, point) => sum + point.x, 0) / districtFieldPoints.length;
      const centerY = districtFieldPoints.reduce((sum, point) => sum + point.y, 0) / districtFieldPoints.length;
      const covariance = districtFieldPoints.reduce((result, point) => {
        const dx = point.x - centerX;
        const dy = point.y - centerY;
        return { xx: result.xx + dx * dx, xy: result.xy + dx * dy, yy: result.yy + dy * dy };
      }, { xx: 0, xy: 0, yy: 0 });
      const angle = 0.5 * Math.atan2(2 * covariance.xy, covariance.xx - covariance.yy);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const extents = districtFieldPoints.map((point) => ({
        along: Math.abs((point.x - centerX) * cos + (point.y - centerY) * sin),
        across: Math.abs(-(point.x - centerX) * sin + (point.y - centerY) * cos),
      }));
      const radiusX = Math.max(300, ...extents.map((item) => item.along + 185));
      const radiusY = Math.max(180, ...extents.map((item) => item.across + 150));
      context.save();
      context.translate(centerX, centerY);
      context.rotate(angle);
      context.scale(radiusX, radiusY);
      context.globalCompositeOperation = "screen";
      const substrate = context.createRadialGradient(-0.08, -0.04, 0.04, 0, 0, 1);
      substrate.addColorStop(0, "rgba(112,88,145,.12)");
      substrate.addColorStop(0.38, "rgba(73,61,108,.065)");
      substrate.addColorStop(0.7, "rgba(46,39,72,.028)");
      substrate.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = substrate;
      context.beginPath();
      context.arc(0, 0, 1, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
    const knowledgeBloom = context.createRadialGradient(
      gravityCenter.x,
      gravityCenter.y,
      0,
      gravityCenter.x,
      gravityCenter.y,
      Math.max(size.width, size.height) * 0.58,
    );
    knowledgeBloom.addColorStop(0, rgba(gravityColor, focusContext && focusedClusterId ? 0.13 : 0.095));
    knowledgeBloom.addColorStop(0.46, rgba(mixHex(gravityColor, "#6d5d91", 0.62), 0.052));
    knowledgeBloom.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = knowledgeBloom;
    context.fillRect(0, 0, size.width, size.height);

    // The strongest visible hub in each district softly illuminates its own
    // neighborhood. These are data-bound gravity fields, not decorative stars.
    const gravityMaximum = Math.max(1, ...gravityPoints.map((item) => item.node.gravity));
    const strongestByCluster = new Map<string, { node: AtlasGraphNodeV1; point: ProjectedPoint }>();
    for (const item of gravityPoints) {
      const prior = strongestByCluster.get(item.node.clusterId);
      if (!prior || item.node.gravity > prior.node.gravity) strongestByCluster.set(item.node.clusterId, item);
    }
    context.save();
    context.globalCompositeOperation = "screen";
    for (const item of strongestByCluster.values()) {
      const cluster = clusterById.get(item.node.clusterId);
      const color = colorFor(cluster?.label ?? "", style);
      const radius = 74 + 102 * Math.sqrt(Math.max(1, item.node.gravity) / gravityMaximum);
      const wash = context.createRadialGradient(item.point.x, item.point.y, 0, item.point.x, item.point.y, radius);
      wash.addColorStop(0, rgba(color, 0.07));
      wash.addColorStop(0.38, rgba(color, 0.026));
      wash.addColorStop(1, rgba(color, 0));
      context.fillStyle = wash;
      context.beginPath();
      context.arc(item.point.x, item.point.y, radius, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();

    const fieldVignette = context.createRadialGradient(
      gravityCenter.x,
      gravityCenter.y,
      Math.min(size.width, size.height) * 0.2,
      gravityCenter.x,
      gravityCenter.y,
      Math.max(size.width, size.height) * 0.82,
    );
    fieldVignette.addColorStop(0, "rgba(0,0,0,0)");
    fieldVignette.addColorStop(0.66, "rgba(0,0,0,.04)");
    fieldVignette.addColorStop(1, "rgba(0,0,0,.33)");
    context.fillStyle = fieldVignette;
    context.fillRect(0, 0, size.width, size.height);

    // The analytical workspace keeps a finite X/Z floor. Home stays atmospheric:
    // a Cartesian cage made the opening read like legacy scientific software.
    if (presentation !== "home") {
      context.save();
      context.lineWidth = 0.55;
      context.strokeStyle = "rgba(126,173,188,.04)";
      const floorY = graph.layout.undatedRail.y;
      for (let x = 0; x <= graph.layout.bounds.width; x += 120) {
        const near = project({ x, y: floorY, z: 0 });
        const far = project({ x, y: floorY, z: graph.layout.bounds.depth });
        context.beginPath(); context.moveTo(near.x, near.y); context.lineTo(far.x, far.y); context.stroke();
      }
      for (let z = 0; z <= graph.layout.bounds.depth; z += 80) {
        const left = project({ x: 0, y: floorY, z });
        const right = project({ x: graph.layout.bounds.width, y: floorY, z });
        context.beginPath(); context.moveTo(left.x, left.y); context.lineTo(right.x, right.y); context.stroke();
      }
      context.restore();
    }

    // Home uses data-bound district fields instead of a wireframe cage or
    // ornamental planetary rings. Extent and tint come only from reconciled
    // cluster members; exact contour geometry is drawn separately below.
    if (presentation === "home") {
      for (const cluster of graph.clusters) {
        const points = (clusterCoordinates.get(cluster.id) ?? [])
          .map((coordinate) => project(coordinate))
          .filter((point) => point.visible);
        if (points.length < 1) continue;
        const minX = Math.min(...points.map((point) => point.x));
        const maxX = Math.max(...points.map((point) => point.x));
        const minY = Math.min(...points.map((point) => point.y));
        const maxY = Math.max(...points.map((point) => point.y));
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const radiusX = Math.max(76, (maxX - minX) / 2 + 58);
        const radiusY = Math.max(64, (maxY - minY) / 2 + 48);
        const color = colorFor(cluster.label, style);
        const selected = cluster.id === focusedClusterId;
        const contextualAlpha = focusContext && focusedClusterId && !selected ? 0.62 : 1;
        context.save();
        context.translate(centerX, centerY);
        context.scale(radiusX, radiusY);
        context.globalCompositeOperation = "screen";
        const atmosphere = context.createRadialGradient(0, 0, 0.04, 0, 0, 1);
        atmosphere.addColorStop(0, rgba(color, (selected ? 0.18 : 0.095) * contextualAlpha));
        atmosphere.addColorStop(0.42, rgba(color, (selected ? 0.09 : 0.048) * contextualAlpha));
        atmosphere.addColorStop(0.72, rgba(color, 0.018 * contextualAlpha));
        atmosphere.addColorStop(1, rgba(color, 0));
        context.fillStyle = atmosphere;
        context.beginPath();
        context.arc(0, 0, 1, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }
    }

    // District contours become translucent volumes by projecting the same evidenced X/Y contour at a bounded Z span.
    for (const cluster of graph.clusters) {
      if (districtId && cluster.id !== districtId) continue;
      const color = colorFor(cluster.label, style);
      const depth = depthForCluster(clusterCoordinates.get(cluster.id) ?? []);
      context.save();
      context.lineJoin = "round";
      for (const polygon of cluster.contour.coordinates) {
        for (const ring of polygon) {
          const homeAlpha = presentation === "home" ? (cluster.id === focusedClusterId ? 1 : focusContext && focusedClusterId ? 0.5 : 0.78) : 1;
          const selectedCluster = cluster.id === focusedClusterId;
          context.shadowColor = rgba(color, presentation === "home" ? 0.07 : 0.18);
          context.shadowBlur = presentation === "home" ? 5 : 16;
          context.fillStyle = rgba(color, (presentation === "home" ? selectedCluster ? 0.042 : 0.027 : scene === "trace" ? 0.008 : 0.015) * homeAlpha);
          context.strokeStyle = rgba(color, (presentation === "home" ? selectedCluster ? 0.16 : 0.105 : scene === "trace" ? 0.025 : 0.055) * homeAlpha);
          context.lineWidth = presentation === "home" ? selectedCluster ? 0.9 : 0.68 : 0.65;
          const farPoints = drawProjectedRing(context, ring, depth.far, project);
          if (farPoints.length) { context.fill(); context.stroke(); }
          context.shadowBlur = 0;
          context.fillStyle = rgba(color, (presentation === "home" ? selectedCluster ? 0.03 : 0.018 : scene === "trace" ? 0.006 : 0.011) * homeAlpha);
          context.strokeStyle = rgba(color, (presentation === "home" ? selectedCluster ? 0.12 : 0.074 : scene === "trace" ? 0.018 : 0.038) * homeAlpha);
          const nearPoints = drawProjectedRing(context, ring, depth.near, project);
          if (nearPoints.length) { context.fill(); context.stroke(); }
          if (presentation === "home" && farPoints.length === nearPoints.length && farPoints.length > 2) {
            context.strokeStyle = rgba(color, (selectedCluster ? 0.095 : 0.046) * homeAlpha);
            context.lineWidth = 0.55;
            const stride = Math.max(1, Math.floor(farPoints.length / 10));
            for (let index = 0; index < farPoints.length; index += stride) {
              context.beginPath();
              context.moveTo(nearPoints[index].x, nearPoints[index].y);
              context.lineTo(farPoints[index].x, farPoints[index].y);
              context.stroke();
            }
          }
        }
      }
      context.restore();
    }

    // Meaning axis: freshness is always visible, even with camera rotation.
    const axisX = size.width - 44;
    const axisTop = 72;
    const axisBottom = size.height - 92;
    context.save();
    context.strokeStyle = presentation === "home" ? "rgba(222,229,224,.25)" : "rgba(222,229,224,.62)";
    context.fillStyle = presentation === "home" ? "rgba(238,236,224,.48)" : "rgba(238,236,224,.78)";
    context.lineWidth = presentation === "home" ? 0.7 : 1;
    context.beginPath(); context.moveTo(axisX, axisBottom); context.lineTo(axisX, axisTop); context.stroke();
    context.beginPath(); context.moveTo(axisX, axisTop); context.lineTo(axisX - 4, axisTop + 8); context.moveTo(axisX, axisTop); context.lineTo(axisX + 4, axisTop + 8); context.stroke();
    context.font = "700 12px Pretendard Variable, sans-serif";
    context.textAlign = "center";
    context.fillText(presentation === "home" ? "RECENT" : "NEWER", axisX, axisTop - 14);
    context.fillStyle = "rgba(238,236,224,.5)";
    context.fillText("날짜 미기록", axisX - 5, axisBottom + 18);
    context.restore();

    // Thick orbital routes summarize real district-to-district wikilink
    // direction. Fine lines below remain exact hub-to-hub references.
    if (districtRoutes.length && !districtId && scene !== "freshness") {
      const maximumDistrictRoute = Math.max(1, ...districtRoutes.map((route) => route.occurrenceCount));
      for (const route of [...districtRoutes].reverse()) {
        const sourceCoordinate = coordinateById.get(route.sourceId);
        const targetCoordinate = coordinateById.get(route.targetId);
        if (!sourceCoordinate || !targetCoordinate) continue;
        const source = project(sourceCoordinate);
        const target = project(targetCoordinate);
        if (!source.visible || !target.visible) continue;
        const active = route.sourceId === focusedClusterId || route.targetId === focusedClusterId;
        const distance = Math.hypot(target.x - source.x, target.y - source.y);
        const bendDirection = stableUnit(route.id) > 0.5 ? 1 : -1;
        const bend = Math.min(84, Math.max(22, distance * 0.14)) * bendDirection;
        const control = {
          x: (source.x + target.x) / 2 - (target.y - source.y) / Math.max(1, distance) * bend,
          y: (source.y + target.y) / 2 + (target.x - source.x) / Math.max(1, distance) * bend,
        };
        const pointAt = (t: number) => ({
          x: (1 - t) ** 2 * source.x + 2 * (1 - t) * t * control.x + t ** 2 * target.x,
          y: (1 - t) ** 2 * source.y + 2 * (1 - t) * t * control.y + t ** 2 * target.y,
          depth: source.depth + (target.depth - source.depth) * t,
          scale: source.scale + (target.scale - source.scale) * t,
          visible: true,
        });
        const routeWidth = 0.7 + 1.9 * Math.sqrt(route.occurrenceCount / maximumDistrictRoute);
        const sourceColor = colorFor(nodeById.get(route.sourceId)?.label ?? "", style);
        const targetColor = colorFor(nodeById.get(route.targetId)?.label ?? "", style);
        const exactTrace = scene === "trace" && pathClusterPairs.has(`${route.sourceId}\0${route.targetId}`);
        const routeGradient = context.createLinearGradient(source.x, source.y, target.x, target.y);
        routeGradient.addColorStop(0, exactTrace ? "#f6a23a" : mixHex(sourceColor, "#f4efe3", active ? 0.24 : 0.08));
        routeGradient.addColorStop(0.5, exactTrace ? "#ffc46f" : mixHex(sourceColor, targetColor, 0.5));
        routeGradient.addColorStop(1, exactTrace ? "#f6a23a" : mixHex(targetColor, "#f4efe3", active ? 0.24 : 0.08));
        context.save();
        context.globalAlpha = scene === "trace" && !active ? 0.045 : exactTrace ? 0.72 : active ? 0.44 : 0.19;
        context.strokeStyle = exactTrace
          ? "rgba(246,162,58,.22)"
          : rgba(mixHex(sourceColor, targetColor, 0.5), active ? 0.24 : 0.12);
        context.lineWidth = routeWidth + (active ? 3 : 2.05);
        context.shadowColor = exactTrace
          ? "rgba(246,162,58,.34)"
          : rgba(mixHex(sourceColor, targetColor, 0.5), active ? 0.28 : 0.12);
        context.shadowBlur = exactTrace ? 13 : active ? 8 : 3;
        context.beginPath();
        context.moveTo(source.x, source.y);
        context.quadraticCurveTo(control.x, control.y, target.x, target.y);
        context.stroke();
        context.shadowBlur = 0;
        context.globalAlpha = scene === "trace" && !active ? 0.08 : exactTrace ? 0.94 : active ? 0.72 : 0.43;
        context.strokeStyle = routeGradient;
        context.lineWidth = Math.max(0.95, routeWidth * 0.76);
        context.beginPath();
        context.moveTo(source.x, source.y);
        context.quadraticCurveTo(control.x, control.y, target.x, target.y);
        context.stroke();
        context.fillStyle = exactTrace ? "#ffc46f" : mixHex(targetColor, "#f4efe3", active ? 0.34 : 0.14);
        if (route.occurrenceCount >= maximumDistrictRoute * 0.12) {
          drawArrow(context, pointAt(0.53), pointAt(0.59), 1);
        }
        drawArrow(context, pointAt(0.79), pointAt(0.85), 1);
        context.restore();
      }
    }

    const maximumEdge = Math.max(1, ...selection.edges.map((edge) => edge.occurrenceCount));
    const sortedEdges = [...selection.edges].sort((left, right) => {
      const leftDepth = ((projectedById.get(left.source)?.depth ?? 0) + (projectedById.get(left.target)?.depth ?? 0)) / 2;
      const rightDepth = ((projectedById.get(right.source)?.depth ?? 0) + (projectedById.get(right.target)?.depth ?? 0)) / 2;
      return leftDepth - rightDepth;
    });
    for (const edge of sortedEdges) {
      const source = projectedById.get(edge.source);
      const targetFull = projectedById.get(edge.target);
      if (!source?.visible || !targetFull?.visible) continue;
      const exactPath = selection.pathIds.has(edge.id);
      const incident = focusId !== null && (edge.source === focusId || edge.target === focusId);
      const active = exactPath || incident;
      const emphasized = exactPath || (scene === "trace" && incident);
      const edgeProgress = emphasized ? traceProgress : 1;
      const target = {
        ...targetFull,
        x: source.x + (targetFull.x - source.x) * edgeProgress,
        y: source.y + (targetFull.y - source.y) * edgeProgress,
      };
      context.save();
      const homeContextAlpha = presentation === "home" && scene !== "trace"
        ? incident ? 0.24 : 0.14
        : incident ? 0.26 : 0.15;
      context.globalAlpha = scene === "trace" && !active ? 0.045 : exactPath ? 1 : emphasized ? 0.48 : homeContextAlpha;
      const width = (emphasized ? 1.1 : incident ? 0.62 : 0.3) + 1.55 * Math.sqrt(edge.occurrenceCount / maximumEdge);
      const sourceNode = nodeById.get(edge.source);
      const targetNode = nodeById.get(edge.target);
      const sourceColor = colorFor(clusterById.get(sourceNode?.clusterId ?? "")?.label ?? "", style);
      const targetColor = colorFor(clusterById.get(targetNode?.clusterId ?? "")?.label ?? "", style);
      const edgeGradient = context.createLinearGradient(source.x, source.y, target.x, target.y);
      edgeGradient.addColorStop(0, exactPath ? "#f6a23a" : mixHex(sourceColor, "#ecf1ed", emphasized ? 0.28 : active ? 0.18 : 0.08));
      edgeGradient.addColorStop(1, exactPath ? "#ffc46f" : mixHex(targetColor, "#ecf1ed", emphasized ? 0.28 : active ? 0.18 : 0.08));
      if (emphasized) {
        context.shadowColor = exactPath ? "rgba(246,162,58,.72)" : rgba(mixHex(sourceColor, targetColor, 0.5), 0.42);
        context.shadowBlur = exactPath ? 12 : 7;
      }
      context.strokeStyle = edgeGradient;
      context.fillStyle = exactPath
        ? "#ffc46f"
        : mixHex(targetColor, "#f1f3ec", emphasized ? 0.3 : active ? 0.2 : 0.12);
      context.lineWidth = width;
      context.beginPath();
      context.moveTo(source.x, source.y);
      context.lineTo(target.x, target.y);
      context.stroke();
      const targetCoordinate = coordinateById.get(edge.target)!;
      drawArrow(context, source, target, Math.max(4, targetCoordinate.radius * targetFull.scale));
      context.restore();
    }

    // One anonymous micro-mark per represented document. This restores truthful
    // density without turning private documents into public graph nodes.
    for (const mark of documentMarks) {
      const point = project(mark.coordinate);
      if (!point.visible) continue;
      const cluster = clusterById.get(mark.clusterId);
      const color = colorFor(cluster?.label ?? "", style);
      const active = mark.parentId === focusId;
      const radius = Math.max(1.8, Math.min(3.65, point.scale * (active ? 3.7 : 3.05)));
      const inFocusedCluster = !focusContext || !focusedClusterId || mark.clusterId === focusedClusterId;
      context.save();
      const depthAlpha = Math.max(0.58, Math.min(1, point.scale * 1.18));
      context.globalAlpha = (scene === "trace" && !active ? 0.1 : active ? 0.98 : inFocusedCluster ? 0.9 : 0.64) * depthAlpha;
      context.fillStyle = active
        ? "#ffc46f"
        : mixHex(color, "#f5f1e8", Math.max(0.035, Math.min(0.18, (point.scale - 0.58) * 0.18)));
      if (active) { context.shadowColor = "rgba(255,174,71,.58)"; context.shadowBlur = 6; }
      context.beginPath();
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      context.fill();
      context.shadowBlur = 0;
      context.strokeStyle = "rgba(2,4,10,.72)";
      context.lineWidth = 0.55;
      context.stroke();
      context.restore();
    }

    const maximumGravity = Math.max(1, ...selection.nodes.map((node) => node.gravity));
    const nodesByDepth = [...selection.nodes].sort((left, right) =>
      (projectedById.get(left.id)?.depth ?? 0) - (projectedById.get(right.id)?.depth ?? 0));
    for (const node of nodesByDepth) {
      const point = projectedById.get(node.id);
      const coordinate = coordinateById.get(node.id);
      if (!point?.visible || !coordinate) continue;
      const cluster = clusterById.get(node.clusterId);
      const color = colorFor(cluster?.label ?? "", style);
      const selected = node.id === focusId;
      const inFocusedCluster = !focusContext || !focusedClusterId || node.clusterId === focusedClusterId;
      const isAggregate = node.kind === "aggregate_boundary";
      const isDistrict = node.kind === "district";
      const baseRadius = scene === "gravity"
        ? Math.max(6, 7 + 34 * Math.sqrt(node.gravity / maximumGravity))
        : coordinate.radius;
      const metricRadius = Math.max(3.2, Math.min(38, baseRadius * point.scale * 1.22)) * (selected ? 1.22 : 1);
      const radius = isAggregate
        ? selected ? Math.max(7.5, Math.min(12, metricRadius * 0.32)) : 3.2
        : isDistrict ? presentation === "home" ? Math.max(8, Math.min(17, metricRadius * 0.5)) : Math.max(8, Math.min(14, metricRadius * 0.58))
          : node.kind === "moc_hub"
            ? selected ? Math.min(presentation === "home" ? 19 : 17, metricRadius * 1.4) : Math.min(presentation === "home" ? 17 : 14, metricRadius * 1.3)
            : selected ? Math.min(presentation === "home" ? 13 : 14, metricRadius) : Math.min(10, metricRadius);
      context.save();
      context.globalAlpha = scene === "freshness" && !node.freshness
        ? 0.24
        : Math.max(0.36, Math.min(1, (inFocusedCluster ? 0.68 : 0.52) + point.scale * 0.2));
      if (selected) {
        const glowReach = 2.05;
        context.globalCompositeOperation = "screen";
        const glow = context.createRadialGradient(point.x, point.y, radius * 0.25, point.x, point.y, radius * glowReach);
        glow.addColorStop(0, "rgba(255,167,53,.12)");
        glow.addColorStop(0.42, "rgba(255,167,53,.035)");
        glow.addColorStop(1, "rgba(0,0,0,0)");
        context.fillStyle = glow;
        context.beginPath(); context.arc(point.x, point.y, radius * glowReach, 0, Math.PI * 2); context.fill();
        context.globalCompositeOperation = "source-over";
      }
      if (isAggregate || isDistrict) {
        context.fillStyle = rgba(color, isDistrict ? selected ? 0.22 : 0.1 : selected ? 0.18 : 0.055);
      } else if (node.kind === "moc_hub") {
        context.fillStyle = selected ? "rgba(233,162,61,.2)" : rgba(color, 0.12);
      } else if (selected) {
        context.fillStyle = "#f5a642";
      } else {
        const depthLight = Math.max(0.025, Math.min(0.16, (point.scale - 0.58) * 0.18));
        context.fillStyle = mixHex(color, "#f7f3e8", depthLight);
      }
      context.strokeStyle = selected ? "#ffc069" : node.kind === "moc_hub" ? color : mixHex(color, "#02040b", isDistrict ? 0.26 : 0.38);
      context.lineWidth = selected ? 1.8 : node.kind === "moc_hub" ? 1.35 : isDistrict ? 1.15 : 0.8;
      drawNodePath(context, node, point.x, point.y, radius);
      context.fill(); context.stroke();
      if (isDistrict) {
        context.globalAlpha *= selected ? 1 : 0.78;
        context.fillStyle = selected ? "#ffe2ae" : mixHex(color, "#f8f2e4", 0.16);
        context.beginPath();
        context.arc(point.x, point.y, Math.max(1.8, radius * 0.22), 0, Math.PI * 2);
        context.fill();
      } else if (node.kind === "moc_hub") {
        context.globalAlpha *= selected ? 0.96 : 0.84;
        context.fillStyle = selected ? "#ffc069" : color;
        context.beginPath();
        context.arc(point.x, point.y, Math.max(1.5, radius * 0.19), 0, Math.PI * 2);
        context.fill();
      }
      if (selected || isDistrict || (node.kind === "aggregate_boundary" && presentation !== "home")) {
        context.setLineDash(node.kind === "aggregate_boundary" ? [3, 4] : []);
        context.globalAlpha *= selected ? 0.92 : isDistrict ? 0.42 : 0.28;
        context.strokeStyle = selected ? "#ffb34b" : rgba(color, 0.72);
        context.lineWidth = selected ? 1.4 : 0.7;
        context.beginPath(); context.arc(point.x, point.y, radius + (selected ? 5 : 4), 0, Math.PI * 2); context.stroke();
      }
      context.restore();
    }

    // Keep the engineering triad in Explore, where camera orientation is an
    // explicit tool. The editorial Home communicates the same axes in prose.
    if (presentation !== "home") {
      const origin = { x: size.width - 88, y: size.height - 54 };
      const axisLength = 30;
      const projectedAxis = (x: number, y: number, z: number) => {
        const cosYaw = Math.cos(camera.yaw); const sinYaw = Math.sin(camera.yaw);
        const yawX = x * cosYaw - z * sinYaw; const yawZ = x * sinYaw + z * cosYaw;
        const cosPitch = Math.cos(camera.pitch); const sinPitch = Math.sin(camera.pitch);
        return { x: origin.x + yawX, y: origin.y - (y * cosPitch - yawZ * sinPitch) };
      };
      context.save(); context.font = "700 12px Pretendard Variable, sans-serif";
      for (const axis of [
        { label: "X", color: "#c88be8", point: projectedAxis(axisLength, 0, 0) },
        { label: "Y", color: "#a8d866", point: projectedAxis(0, axisLength, 0) },
        { label: "Z", color: "#70a9ff", point: projectedAxis(0, 0, axisLength) },
      ]) {
        context.strokeStyle = axis.color; context.fillStyle = axis.color; context.lineWidth = 1.5;
        context.beginPath(); context.moveTo(origin.x, origin.y); context.lineTo(axis.point.x, axis.point.y); context.stroke();
        context.fillText(axis.label, axis.point.x + 4, axis.point.y + 3);
      }
      context.restore();
    }
  }, [camera, clusterById, clusterCoordinates, coordinateById, districtId, districtRoutes, documentMarks, focusId, graph, hidden, nodeById, presentation, projectedById, scene, selection, size, traceProgress]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (mobile) return;
    cancelAnimationFrame(animationRef.current);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      camera,
      pan: event.shiftKey || event.button === 1,
      moved: false,
      lastX: event.clientX,
      lastY: event.clientY,
      lastTime: event.timeStamp,
      velocityX: 0,
      velocityY: 0,
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const elapsed = Math.max(8, event.timeStamp - drag.lastTime);
    const instantaneousX = (event.clientX - drag.lastX) / elapsed;
    const instantaneousY = (event.clientY - drag.lastY) / elapsed;
    drag.velocityX = drag.velocityX * 0.58 + instantaneousX * 0.42;
    drag.velocityY = drag.velocityY * 0.58 + instantaneousY * 0.42;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    drag.lastTime = event.timeStamp;
    drag.moved = drag.moved || Math.hypot(dx, dy) > 4;
    if (drag.pan) {
      setCamera(clampCamera({ ...drag.camera, panX: drag.camera.panX + dx, panY: drag.camera.panY + dy }));
    } else {
      setCamera(clampCamera({ ...drag.camera, yaw: drag.camera.yaw + dx * 0.0042, pitch: drag.camera.pitch + dy * 0.0035 }));
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.moved) {
      const bounds = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      const hit = [...selection.nodes]
        .map((node) => ({ node, point: projectedById.get(node.id), coordinate: coordinateById.get(node.id) }))
        .filter((item) => item.point?.visible && item.coordinate)
        .sort((left, right) => (right.point?.depth ?? 0) - (left.point?.depth ?? 0))
        .find((item) => {
          const radius = Math.max(10, (item.coordinate?.radius ?? 6) * (item.point?.scale ?? 1) * 1.5);
          return Math.hypot((item.point?.x ?? 0) - x, (item.point?.y ?? 0) - y) <= radius;
      });
      if (hit) onSelect(hit.node.id);
    } else if (!reducedMotion) {
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      const velocityX = Math.max(-1.8, Math.min(1.8, drag.velocityX));
      const velocityY = Math.max(-1.8, Math.min(1.8, drag.velocityY));
      const currentDragCamera = drag.pan
        ? clampCamera({ ...drag.camera, panX: drag.camera.panX + dx, panY: drag.camera.panY + dy })
        : clampCamera({ ...drag.camera, yaw: drag.camera.yaw + dx * 0.0042, pitch: drag.camera.pitch + dy * 0.0035 });
      const settledCamera = drag.pan
        ? clampCamera({
          ...currentDragCamera,
          panX: currentDragCamera.panX + velocityX * 34,
          panY: currentDragCamera.panY + velocityY * 34,
        })
        : clampCamera({
          ...currentDragCamera,
          yaw: currentDragCamera.yaw + velocityX * 0.13,
          pitch: currentDragCamera.pitch + velocityY * 0.1,
        });
      animateCamera(settledCamera, 360);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
  };

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (mobile) return;
    event.preventDefault();
    setCamera((current) => clampCamera({ ...current, zoom: current.zoom * Math.exp(-event.deltaY * 0.0011) }));
  };

  return (
    <div
      ref={containerRef}
      className={`living-graph-canvas is-${presentation} ${className}`.trim()}
      data-scene={scene}
      data-node-count={selection.nodes.length}
      data-edge-count={selection.edges.length}
      data-district-route-count={districtRoutes.length}
      data-path-length={selection.path.length}
      data-renderer="canvas2d-projected-3d"
      data-camera-yaw={camera.yaw.toFixed(4)}
      data-camera-pitch={camera.pitch.toFixed(4)}
      data-camera-zoom={camera.zoom.toFixed(4)}
      aria-label={`3차원 방향 지식 그래프. 노드 ${selection.nodes.length}개, 허브 관계 ${selection.edges.length}개, 구역 방향 항로 ${districtRoutes.length}개. X는 구역, Y는 최신성, Z는 구조 깊이입니다.`}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        dragRef.current = null;
      }}
      onLostPointerCapture={() => { dragRef.current = null; }}
      onWheel={handleWheel}
      onKeyDown={(event) => {
        if (mobile) return;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          setCamera((current) => clampCamera({ ...current, yaw: current.yaw + (event.key === "ArrowLeft" ? -0.08 : 0.08) }));
        } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          setCamera((current) => clampCamera({ ...current, pitch: current.pitch + (event.key === "ArrowUp" ? -0.06 : 0.06) }));
        } else if (event.key === "+" || event.key === "=") {
          setCamera((current) => clampCamera({ ...current, zoom: current.zoom * 1.1 }));
        } else if (event.key === "-" || event.key === "_") {
          setCamera((current) => clampCamera({ ...current, zoom: current.zoom / 1.1 }));
        } else if (event.key.toLowerCase() === "r") resetCamera();
      }}
    >
      <canvas ref={canvasRef} aria-hidden="true" />
      <div className="graph-label-layer">
        {labels.map(({ node, x, y }) => (
          <button
            key={node.id}
            type="button"
            className={`kind-${node.kind}${node.id === focusId ? " is-selected" : ""}`}
            style={{ left: x, top: y }}
            aria-pressed={node.id === focusId}
            aria-label={`${graphNodeLabel(node)}. 고유 inbound 문서 ${node.gravity}, 링크 출현 ${node.occurrences}, ${node.freshness ?? "날짜 미기록"}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onSelect(node.id)}
          >
            {graphNodeLabel(node)}
          </button>
        ))}
      </div>
      {!mobile && (
        <div className="graph-camera-controls" role="group" aria-label="3D 카메라 제어" onPointerDown={(event) => event.stopPropagation()}>
          <button type="button" aria-label="선택 지점에 맞추기" onClick={() => {
            const coordinate = focusId ? coordinateById.get(focusId) : null;
            if (coordinate) animateCamera(cameraForSelection(camera, coordinate));
            else resetCamera();
          }}><Focus size={15} /></button>
          <button type="button" aria-label="확대" onClick={() => setCamera((current) => clampCamera({ ...current, zoom: current.zoom * 1.12 }))}><Plus size={15} /></button>
          <button type="button" aria-label="축소" onClick={() => setCamera((current) => clampCamera({ ...current, zoom: current.zoom / 1.12 }))}><Minus size={15} /></button>
          <button type="button" aria-label="카메라 초기화" onClick={resetCamera}><RotateCcw size={15} /></button>
        </div>
      )}
      <div className="graph-3d-badge" aria-hidden="true"><span />SPATIAL KNOWLEDGE FIELD</div>
      <ol className="graph-accessible-list" aria-label="현재 그래프 노드 목록">
        {selection.nodes.map((node) => (
          <li key={node.id}>
            <button type="button" onClick={() => onSelect(node.id)} aria-current={node.id === focusId ? "true" : undefined}>
              <strong>{graphNodeLabel(node)}</strong>
              <span>고유 inbound {node.gravity} · 링크 출현 {node.occurrences} · {node.freshness ?? "날짜 미기록"}</span>
            </button>
          </li>
        ))}
      </ol>
      <ol className="graph-accessible-list" aria-label="구역 간 실제 방향 링크 목록">
        {districtRoutes.map((route) => (
          <li key={route.id}>
            {graphNodeLabel(nodeById.get(route.sourceId)!)} → {graphNodeLabel(nodeById.get(route.targetId)!)} · 링크 출현 {route.occurrenceCount}
          </li>
        ))}
      </ol>
    </div>
  );
}
