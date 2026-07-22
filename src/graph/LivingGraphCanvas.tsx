import { Focus, Minus, Plus, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import type { AtlasGraphCoordinateV1, AtlasGraphNodeV1, AtlasGraphV1, MatrixCell } from "../types";
import { graphNodeLabel, type FreshnessBucket, visibleGraphSelection } from "./model";
import { semanticEdgeCommands } from "./semantic-edge-model";
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

// Home uses a deliberately narrow, warm material range so the graph reads as
// one authored knowledge sculpture. District identity remains data-bound, but
// it is carried by subtle temperature changes rather than a rainbow palette.
const homeFieldColors: Record<string, string> = {
  MOC: "#d3ad75",
  Strategy: "#d79273",
  Research: "#83a8cc",
  Papers: "#bda0d2",
  Signals: "#ce829d",
  Console: "#aeb981",
  "중심 지식": "#ad9b84",
  "연구 논거": "#918b82",
  전략: "#c9a56e",
  신호: "#a38470",
  "운영 기반": "#91977f",
  Rocket: "#91877f",
  Groot: "#8d977f",
  "Intelligence Layer": "#8d908a",
  "Independent Projects": "#998f84",
  "연구 기록": "#8c9288",
};

// Home is an authored categorical 3D stage, not an analytical scatterplot.
// The seven slots follow the stable district order on the graph X axis. Their
// screen position, roll and depth deliberately break the old diagonal ribbon:
// each district occupies a different plane around the knowledge fulcrum while
// the source graph still owns every node, weight and relation.
const homeClusterSlots = [
  { x: 0.56, y: 0.38, depth: 0.24, roll: -0.52, spreadX: 1.18, spreadY: 1.08 },
  { x: 0.77, y: 0.65, depth: 0.62, roll: -0.18, spreadX: 1.5, spreadY: 1.3 },
  { x: 0.37, y: 0.66, depth: 0.44, roll: 0.36, spreadX: 1.46, spreadY: 1.28 },
  { x: 0.5, y: 0.39, depth: 0.7, roll: 0.14, spreadX: 1.34, spreadY: 1.22 },
  { x: 0.68, y: 0.56, depth: 0.5, roll: -0.28, spreadX: 1.38, spreadY: 1.22 },
  { x: 0.57, y: 0.46, depth: 0.32, roll: 0.52, spreadX: 1.2, spreadY: 1.1 },
  { x: 0.84, y: 0.38, depth: 0.18, roll: -0.38, spreadX: 1.36, spreadY: 1.2 },
  { x: 0.75, y: 0.3, depth: 0.28, roll: 0.3, spreadX: 1.28, spreadY: 1.12 },
  { x: 0.6, y: 0.18, depth: 0.82, roll: -0.08, spreadX: 1.22, spreadY: 1.14 },
] as const;

let homeGrainCanvas: HTMLCanvasElement | null = null;

function homeGrainTexture() {
  if (homeGrainCanvas || typeof document === "undefined") return homeGrainCanvas;
  const texture = document.createElement("canvas");
  texture.width = 192;
  texture.height = 192;
  const context = texture.getContext("2d");
  if (!context) return null;
  const pixels = context.createImageData(texture.width, texture.height);
  for (let index = 0; index < texture.width * texture.height; index += 1) {
    const noise = stableUnit(`home-grain:${index}`);
    const warm = 196 + Math.round(noise * 48);
    const offset = index * 4;
    pixels.data[offset] = warm;
    pixels.data[offset + 1] = warm - 12;
    pixels.data[offset + 2] = warm - 27;
    pixels.data[offset + 3] = Math.round(8 + Math.abs(noise - 0.5) * 24);
  }
  context.putImageData(pixels, 0, 0);
  homeGrainCanvas = texture;
  return texture;
}

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

function cubicPoint(
  source: ProjectedPoint,
  controlA: { x: number; y: number },
  controlB: { x: number; y: number },
  target: ProjectedPoint,
  progress: number,
): ProjectedPoint {
  const t = Math.max(0, Math.min(1, progress));
  const inverse = 1 - t;
  return {
    x: inverse ** 3 * source.x
      + 3 * inverse * inverse * t * controlA.x
      + 3 * inverse * t * t * controlB.x
      + t ** 3 * target.x,
    y: inverse ** 3 * source.y
      + 3 * inverse * inverse * t * controlA.y
      + 3 * inverse * t * t * controlB.y
      + t ** 3 * target.y,
    depth: source.depth + (target.depth - source.depth) * t,
    scale: source.scale + (target.scale - source.scale) * t,
    visible: source.visible && target.visible,
  };
}

function cubicSegment(
  source: ProjectedPoint,
  controlA: { x: number; y: number },
  controlB: { x: number; y: number },
  target: ProjectedPoint,
  progress: number,
) {
  const t = Math.max(0, Math.min(1, progress));
  const mix = (left: { x: number; y: number }, right: { x: number; y: number }) => ({
    x: left.x + (right.x - left.x) * t,
    y: left.y + (right.y - left.y) * t,
  });
  const a = mix(source, controlA);
  const b = mix(controlA, controlB);
  const c = mix(controlB, target);
  const d = mix(a, b);
  const e = mix(b, c);
  return {
    controlA: a,
    controlB: d,
    target: {
      ...cubicPoint(source, controlA, controlB, target, t),
      x: mix(d, e).x,
      y: mix(d, e).y,
    },
  };
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

function cameraForGraphScene(
  graph: AtlasGraphV1,
  presentation: Presentation,
  mobile: boolean,
  scene: GraphScene,
) {
  const base = defaultCamera(graph, presentation, mobile);
  if (presentation !== "home" || mobile) return base;
  if (scene === "gravity") return clampCamera({ ...base, yaw: -0.28, pitch: 0.18, zoom: 1.16, panX: -30, panY: 0 });
  if (scene === "freshness") return clampCamera({ ...base, yaw: -0.16, pitch: 0.1, zoom: 1.16, panX: 100, panY: 10 });
  if (scene === "trace") return clampCamera({ ...base, yaw: -0.34, pitch: 0.18, zoom: 1.18, panX: 100, panY: 0 });
  return clampCamera({ ...base, yaw: -0.38, pitch: 0.18, zoom: 1.22, panX: 140, panY: -34 });
}

function projectGraphStage(
  coordinate: Pick<AtlasGraphCoordinateV1, "x" | "y" | "z">,
  anchorCoordinate: Pick<AtlasGraphCoordinateV1, "x" | "y" | "z"> | null,
  clusterAnchorCoordinate: Pick<AtlasGraphCoordinateV1, "x" | "y" | "z"> | null,
  clusterDepth: number | null,
  bounds: AtlasGraphV1["layout"]["bounds"],
  camera: Camera3D,
  viewport: { width: number; height: number },
  presentation: Presentation,
  scene: GraphScene,
  mobile: boolean,
): ProjectedPoint {
  const point = projectCoordinate(coordinate, camera, viewport, presentation);
  if (presentation !== "home" || mobile || viewport.width < 900) return point;

  if (scene === "field" && clusterAnchorCoordinate) {
    const clusterAnchor = projectCoordinate(clusterAnchorCoordinate, camera, viewport, presentation);
    const normalizedX = Math.max(0, Math.min(1, (clusterAnchorCoordinate.x - bounds.x) / Math.max(1, bounds.width)));
    const normalizedY = Math.max(0, Math.min(1, (clusterAnchorCoordinate.y - bounds.y) / Math.max(1, bounds.height)));
    const dataDepth = clusterDepth ?? Math.max(0, Math.min(1, (clusterAnchorCoordinate.z - bounds.z) / Math.max(1, bounds.depth)));
    const slotIndex = Math.max(0, Math.min(homeClusterSlots.length - 1, Math.round(normalizedX * (homeClusterSlots.length - 1))));
    const slot = homeClusterSlots[slotIndex];
    const authoredDepth = slot.depth * 0.8 + dataDepth * 0.2;
    const depthOffset = authoredDepth - 0.5;
    const yawResponse = Math.sin(camera.yaw + 0.38) * depthOffset * viewport.width * 0.18;
    const pitchResponse = Math.sin(camera.pitch - 0.18) * depthOffset * viewport.height * 0.14;
    const desiredX = viewport.width * (slot.x + depthOffset * 0.045) + yawResponse;
    const desiredY = viewport.height * (slot.y - depthOffset * 0.035) + pitchResponse;
    const perspective = 0.79 + authoredDepth * 0.34;
    const localX = (0.74 - normalizedY * 0.07) * slot.spreadX * perspective;
    const localY = (0.62 + Math.abs(normalizedX - 0.5) * 0.22) * slot.spreadY * perspective;
    const localOffsetX = (point.x - clusterAnchor.x) * localX;
    const localOffsetY = (point.y - clusterAnchor.y) * localY;
    const cosRoll = Math.cos(slot.roll);
    const sinRoll = Math.sin(slot.roll);
    const rotatedX = localOffsetX * cosRoll - localOffsetY * sinRoll;
    const rotatedY = localOffsetX * sinRoll + localOffsetY * cosRoll;
    const x = desiredX + rotatedX;
    const y = desiredY + rotatedY;
    return {
      ...point,
      x,
      y,
      depth: point.depth + depthOffset * 260,
      scale: point.scale * Math.sqrt(localX * localY),
      visible: point.visible && x > -180 && x < viewport.width + 180 && y > -180 && y < viewport.height + 180,
    };
  }

  if (!anchorCoordinate) return point;

  // The opening composition is deliberately asymmetric: the selected gravity
  // anchor sits at the visual fulcrum while the left field can breathe and the
  // right field is compressed before the chapter rail. This is a screen-space
  // camera treatment only; the graph coordinates and all relation semantics
  // remain unchanged.
  const anchor = projectCoordinate(anchorCoordinate, camera, viewport, presentation);
  const treatment = scene === "gravity"
    ? { offsetX: -0.02, offsetY: -0.03, leftScale: 0.88, rightScale: 0.78, verticalScale: 1.08 }
    : scene === "freshness"
      ? { offsetX: 0.08, offsetY: -0.04, leftScale: 1.02, rightScale: 0.74, verticalScale: 1.18 }
      : scene === "trace"
        ? { offsetX: 0.1, offsetY: -0.045, leftScale: 1.08, rightScale: 0.67, verticalScale: 1.2 }
        : { offsetX: 0.125, offsetY: -0.015, leftScale: 1.13, rightScale: 0.62, verticalScale: 1.08 };
  const horizontalScale = point.x < anchor.x ? treatment.leftScale : treatment.rightScale;
  const recentSweep = scene === "field" ? Math.max(0, anchor.y - point.y) * 0.42 : 0;
  const x = anchor.x + viewport.width * treatment.offsetX + (point.x - anchor.x) * horizontalScale - recentSweep;
  const y = anchor.y + viewport.height * treatment.offsetY + (point.y - anchor.y) * treatment.verticalScale;
  return {
    ...point,
    x,
    y,
    scale: point.scale * Math.sqrt(horizontalScale * treatment.verticalScale),
    visible: point.visible && x > -180 && x < viewport.width + 180 && y > -180 && y < viewport.height + 180,
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
  index: number;
  count: number;
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
  organic = false,
): AggregateDocumentMark[] {
  const marks: AggregateDocumentMark[] = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const densitySourcesByCluster = new Map<string, AtlasGraphNodeV1[]>();
  const districtAnchorByCluster = new Map<string, AtlasGraphCoordinateV1>();
  for (const node of nodes) {
    if (node.kind === "aggregate_boundary" && node.representedDocuments > 0) {
      const group = densitySourcesByCluster.get(node.clusterId) ?? [];
      group.push(node);
      densitySourcesByCluster.set(node.clusterId, group);
    } else if (node.kind === "district") {
      const coordinate = coordinateById.get(node.id);
      if (coordinate) districtAnchorByCluster.set(node.clusterId, coordinate);
    }
  }
  for (const node of nodes) {
    if (node.kind === "district" && node.representedDocuments > 0 && !densitySourcesByCluster.has(node.clusterId)) {
      densitySourcesByCluster.set(node.clusterId, [node]);
    }
  }
  for (const node of [...densitySourcesByCluster.values()].flat()) {
    const anchor = coordinateById.get(node.id);
    if (!anchor) continue;
    const count = node.representedDocuments;
    const clusterSources = densitySourcesByCluster.get(node.clusterId) ?? [node];
    const clusterTotal = clusterSources.reduce((sum, source) => sum + source.representedDocuments, 0);
    const districtAnchor = districtAnchorByCluster.get(node.clusterId) ?? anchor;
    const share = Math.sqrt(count / Math.max(1, clusterTotal));
    const spread = Math.min(188, (44 + Math.sqrt(clusterTotal) * 7.25) * (0.38 + share * 0.62));
    const groupCenter = {
      x: districtAnchor.x + (anchor.x - districtAnchor.x) * 0.48,
      y: anchor.y,
      z: districtAnchor.z + (anchor.z - districtAnchor.z) * 0.48,
    };
    const phase = stableUnit(node.id) * Math.PI * 2;
    const cosPhase = Math.cos(phase * 0.36);
    const sinPhase = Math.sin(phase * 0.36);
    const depthBias = 0.72 + stableUnit(`${node.id}:depth-profile`) * 0.34;
    for (let index = 0; index < count; index += 1) {
      const radial = Math.sqrt((index + 0.5) / count);
      const angle = phase + index * goldenAngle;
      const ripple = 0.72 + stableUnit(`${node.id}:${index}:r`) * 0.28;
      const lift = stableUnit(`${node.id}:${index}:y`) - 0.5;
      const depth = stableUnit(`${node.id}:${index}:z`) - 0.5;
      const along = Math.cos(angle) * spread * radial * ripple;
      const across = Math.sin(angle) * spread * radial * depthBias;
      const ribbon = ((index + 0.5) / count - 0.5) * spread * 0.28;
      marks.push({
        parentId: node.id,
        clusterId: node.clusterId,
        index,
        count,
        coordinate: {
          x: groupCenter.x + along * cosPhase - across * sinPhase + ribbon * sinPhase,
          y: groupCenter.y + lift * spread * (organic ? 0.82 : 0.48) + Math.sin(angle * 2) * spread * (organic ? 0.13 : 0.075),
          z: groupCenter.z + along * sinPhase + across * cosPhase + depth * spread * (organic ? 0.34 : 0.24) - ribbon * cosPhase,
        },
      });
    }
  }
  return marks;
}

function homeAggregateSpread(count: number) {
  return Math.min(222, 62 + Math.sqrt(count) * 10.6);
}

function homeAggregateDocumentPoint(
  mark: AggregateDocumentMark,
  parent: ProjectedPoint,
  viewport: { width: number; height: number },
  focusedClusterId: string | null,
): ProjectedPoint {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const lobeCount = mark.count >= 180 ? 4 : mark.count >= 80 ? 3 : mark.count >= 36 ? 2 : 1;
  const lobeIndex = Math.min(lobeCount - 1, Math.floor(mark.index * lobeCount / mark.count));
  const lobeStart = Math.floor(lobeIndex * mark.count / lobeCount);
  const lobeEnd = Math.floor((lobeIndex + 1) * mark.count / lobeCount);
  const lobeSize = Math.max(1, lobeEnd - lobeStart);
  const localIndex = mark.index - lobeStart;
  const normalizedIndex = (localIndex + 0.5) / lobeSize;
  const radial = Math.sqrt(normalizedIndex);
  const phase = stableUnit(`${mark.parentId}:home-phase`) * Math.PI * 2;
  const angle = phase + localIndex * goldenAngle;
  const clusterSpread = mark.clusterId === focusedClusterId ? 1.28 : 1;
  // Keep the complete represented-record field legible as a set of authored
  // knowledge constellations. The prior radius scattered truthful density so
  // widely that the clusters read as decorative dust instead of one system.
  const spread = Math.min(158, (34 + Math.sqrt(lobeSize) * 8.15) * clusterSpread);
  const xJitter = 0.84 + stableUnit(`${mark.parentId}:${mark.index}:home-x`) * 0.28;
  const yJitter = 0.84 + stableUnit(`${mark.parentId}:${mark.index}:home-y`) * 0.28;
  const localX = Math.cos(angle) * spread * radial * xJitter;
  const localY = Math.sin(angle) * spread * radial * 0.78 * yJitter;
  const rotation = (stableUnit(`${mark.parentId}:home-rotation`) - 0.5) * 1.04;
  const chainAngle = rotation + (stableUnit(`${mark.parentId}:home-chain`) - 0.5) * 1.2;
  const chainStep = (mark.count >= 180 ? 146 : Math.min(118, 54 + Math.sqrt(mark.count) * 3.7)) * clusterSpread;
  const chainOffset = (lobeIndex - (lobeCount - 1) / 2) * chainStep;
  const lobeDepth = (stableUnit(`${mark.parentId}:home-lobe-depth:${lobeIndex}`) - 0.5) * 0.82;
  const lobeCenterX = Math.cos(chainAngle) * chainOffset + lobeDepth * 26;
  const lobeCenterY = Math.sin(chainAngle) * chainOffset - lobeDepth * 18;
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  const x = parent.x + lobeCenterX + localX * cosine - localY * sine;
  const y = parent.y + lobeCenterY + localX * sine + localY * cosine;
  const depthVariance = (stableUnit(`${mark.parentId}:${mark.index}:home-depth`) - 0.5) * 0.34;
  return {
    x,
    y,
    depth: parent.depth + lobeDepth * 116 + depthVariance * 48,
    scale: Math.max(0.54, parent.scale * (0.82 + lobeDepth * 0.18 + depthVariance * 0.72)),
    visible: parent.visible && x > -16 && x < viewport.width + 16 && y > -16 && y < viewport.height + 16,
  };
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
  // The selected cinematic target contains no persistent labels inside the
  // sculpture. Home remains fully named through the accessible DOM list and
  // selection announcements; analytical labels stay in Explore.
  if (presentation === "home") return [];
  const safeLeft = 18;
  const safeRight = viewport.width - 18;
  const safeTop = 28;
  const safeBottom = viewport.height - 32;
  const occupied: Array<{ left: number; top: number; right: number; bottom: number }> = [];
  const nodeBounds = nodes.flatMap((node) => {
    const point = projectedById.get(node.id);
    const coordinate = coordinateById.get(node.id);
    if (!point?.visible || !coordinate) return [];
    const radius = Math.max(6, coordinate.radius * point.scale * (node.id === focusId ? 1.9 : 1.35));
    return [{ id: node.id, left: point.x - radius, right: point.x + radius, top: point.y - radius, bottom: point.y + radius }];
  });
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
      if (nodeBounds.some((nodeBox) => nodeBox.id !== node.id && !(
        box.right + 4 < nodeBox.left || box.left - 4 > nodeBox.right || box.bottom + 3 < nodeBox.top || box.top - 3 > nodeBox.bottom
      ))) continue;
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
  previewId = null,
  districtId = null,
  freshness = "all",
  from = null,
  to = null,
  mobile = false,
  reducedMotion = false,
  presentation = "workspace",
  districtRelationMatrix = [],
  onSelect,
  onHover,
  className = "",
}: {
  graph: AtlasGraphV1;
  scene?: GraphScene;
  focusId: string | null;
  previewId?: string | null;
  districtId?: string | null;
  freshness?: FreshnessBucket;
  from?: string | null;
  to?: string | null;
  mobile?: boolean;
  reducedMotion?: boolean;
  presentation?: Presentation;
  districtRelationMatrix?: readonly MatrixCell[];
  onSelect: (id: string) => void;
  onHover?: (id: string | null) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef(0);
  const inputFrameRef = useRef(0);
  const pendingCameraRef = useRef<Camera3D | null>(null);
  const parallaxFrameRef = useRef(0);
  const parallaxTargetRef = useRef({ x: 0, y: 0 });
  const parallaxCurrentRef = useRef({ x: 0, y: 0 });
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
  const [hoverId, setHoverId] = useState<string | null>(null);
  const interactionId = hoverId ?? previewId ?? focusId;
  const [camera, setCamera] = useState(() => {
    const target = cameraForGraphScene(graph, presentation, mobile, scene);
    return reducedMotion ? target : { ...target, yaw: target.yaw - 0.12, pitch: target.pitch + 0.05, zoom: target.zoom * 0.92 };
  });
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const [traceProgress, setTraceProgress] = useState(1);
  const selection = useMemo(() => visibleGraphSelection(graph, {
    districtId, freshness, focusId: interactionId, mobile, from, to,
  }), [districtId, interactionId, freshness, from, graph, mobile, to]);
  const coordinateById = useMemo(() => new Map(graph.layout.coordinates.map((item) => [item.id, item])), [graph.layout.coordinates]);
  const projectionAnchor = focusId ? coordinateById.get(focusId) ?? null : null;
  const districtCoordinateByCluster = useMemo(() => new Map(graph.nodes.flatMap((node) => {
    if (node.kind !== "district") return [];
    const coordinate = coordinateById.get(node.id);
    return coordinate ? [[node.clusterId, coordinate] as const] : [];
  })), [coordinateById, graph.nodes]);
  const focusedStageClusterId = graph.nodes.find((node) => node.id === interactionId)?.clusterId ?? null;
  const stageCoordinateByCluster = useMemo(() => {
    const output = new Map(districtCoordinateByCluster);
    if (focusedStageClusterId && projectionAnchor) output.set(focusedStageClusterId, projectionAnchor as AtlasGraphCoordinateV1);
    return output;
  }, [districtCoordinateByCluster, focusedStageClusterId, projectionAnchor]);
  const clusterDepthByCluster = useMemo(() => {
    const districtEntries = graph.nodes.flatMap((node) => {
      if (node.kind !== "district") return [];
      const members = graph.nodes
        .filter((candidate) => candidate.clusterId === node.clusterId)
        .map((candidate) => coordinateById.get(candidate.id))
        .filter((candidate): candidate is AtlasGraphCoordinateV1 => Boolean(candidate));
      const meanDepth = members.reduce((sum, candidate) => sum + candidate.z, 0) / Math.max(1, members.length);
      return [{ clusterId: node.clusterId, meanDepth }];
    });
    const minimumDepth = Math.min(...districtEntries.map((entry) => entry.meanDepth));
    const maximumDepth = Math.max(...districtEntries.map((entry) => entry.meanDepth));
    const depthRange = Math.max(1, maximumDepth - minimumDepth);
    const focusDepth = districtEntries.find((entry) => entry.clusterId === focusedStageClusterId)?.meanDepth;
    const focusNormalizedDepth = typeof focusDepth === "number"
      ? (focusDepth - minimumDepth) / depthRange
      : 0.5;
    return new Map(districtEntries.map(({ clusterId, meanDepth }) => {
      const normalizedDepth = (meanDepth - minimumDepth) / depthRange;
      const relativeDepth = Math.max(0.08, Math.min(0.92, 0.5 + (normalizedDepth - focusNormalizedDepth) * 0.72));
      return [clusterId, relativeDepth] as const;
    }));
  }, [coordinateById, focusedStageClusterId, graph.nodes]);
  const aggregateStageById = useMemo(() => {
    const output = new Map<string, { angle: number; radius: number; depth: number }>();
    for (const cluster of graph.clusters) {
      const boundaries = graph.nodes
        .filter((node) => node.clusterId === cluster.id && node.kind === "aggregate_boundary" && node.representedDocuments > 0)
        .sort((left, right) => right.representedDocuments - left.representedDocuments || left.id.localeCompare(right.id, "en"));
      const stablePhase = stableUnit(`${cluster.id}:aggregate-stage`) * Math.PI * 2;
      const phase = cluster.label === "중심 지식" ? 1.55 : cluster.label === "연구 논거" ? -0.75 : stablePhase;
      boundaries.forEach((node, index) => {
        const centerFan = cluster.label === "중심 지식";
        const splitLobes = boundaries.length >= 6 && !centerFan;
        const lobeIndex = splitLobes ? index % 2 : 0;
        const localIndex = splitLobes ? Math.floor(index / 2) : index;
        const localCount = splitLobes ? Math.ceil((boundaries.length - lobeIndex) / 2) : boundaries.length;
        const localOffset = localIndex - (localCount - 1) / 2;
        const centerOffset = index - (boundaries.length - 1) / 2;
        const radial = boundaries.length === 1 ? 0 : Math.sqrt((index + 0.55) / boundaries.length);
        output.set(node.id, {
          angle: centerFan
            ? phase + centerOffset * 0.255
            : splitLobes
              ? phase + lobeIndex * Math.PI + localOffset * 0.16
              : phase + index * Math.PI * (3 - Math.sqrt(5)),
          radius: boundaries.length === 1
            ? 0
            : centerFan
              ? 80 + Math.abs(centerOffset) * 36 + stableUnit(`${node.id}:center-fan-radius`) * 36
              : splitLobes
              ? (cluster.label === "연구 논거" ? 168 : cluster.label === "중심 지식" ? 152 : 126) + Math.abs(localOffset) * 11
              : 28 + radial * 88,
          depth: stableUnit(`${node.id}:aggregate-stage-depth`) - 0.5,
        });
      });
    }
    return output;
  }, [graph.clusters, graph.nodes]);
  const nodeById = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);
  const clusterById = useMemo(() => new Map(graph.clusters.map((cluster) => [cluster.id, cluster])), [graph.clusters]);
  const clusterCoordinates = useMemo(() => new Map(graph.clusters.map((cluster) => [
    cluster.id,
    graph.layout.coordinates.filter((coordinate) => nodeById.get(coordinate.id)?.clusterId === cluster.id),
  ])), [graph.clusters, graph.layout.coordinates, nodeById]);
  const documentMarks = useMemo(
    () => aggregateDocumentMarks(selection.nodes, coordinateById, presentation === "home"),
    [coordinateById, presentation, selection.nodes],
  );
  const edgeCommands = useMemo(() => semanticEdgeCommands({
    graph,
    matrix: districtRelationMatrix,
    scene,
    focusId,
    previewId: hoverId ?? previewId,
    from,
    to,
    presentation,
  }), [districtRelationMatrix, focusId, from, graph, hoverId, presentation, previewId, scene, to]);
  const activeNeighborhoodIds = useMemo(() => {
    const active = new Set([
      ...(interactionId ? [interactionId] : []),
      ...edgeCommands.flatMap((command) => [command.sourceId, command.targetId]),
    ]);
    const interactionNode = interactionId ? graph.nodes.find((node) => node.id === interactionId) : null;
    if (interactionNode?.kind === "district") {
      graph.nodes.forEach((node) => {
        if (node.clusterId === interactionNode.clusterId) active.add(node.id);
      });
    }
    return active;
  }, [edgeCommands, graph.nodes, interactionId]);

  const commitCameraInput = useCallback((target: Camera3D) => {
    pendingCameraRef.current = target;
    if (inputFrameRef.current) return;
    inputFrameRef.current = requestAnimationFrame(() => {
      inputFrameRef.current = 0;
      const next = pendingCameraRef.current;
      pendingCameraRef.current = null;
      if (!next) return;
      cameraRef.current = next;
      setCamera(next);
    });
  }, []);

  const settleParallax = useCallback((x: number, y: number) => {
    parallaxTargetRef.current = reducedMotion || hidden || presentation !== "home" ? { x: 0, y: 0 } : { x, y };
    if (parallaxFrameRef.current) return;
    const frame = () => {
      const target = parallaxTargetRef.current;
      const current = parallaxCurrentRef.current;
      const next = {
        x: current.x + (target.x - current.x) * 0.08,
        y: current.y + (target.y - current.y) * 0.08,
      };
      parallaxCurrentRef.current = next;
      if (canvasRef.current) canvasRef.current.style.transform = `translate3d(${next.x.toFixed(2)}px,${next.y.toFixed(2)}px,0)`;
      if (Math.abs(target.x - next.x) + Math.abs(target.y - next.y) > 0.08) {
        parallaxFrameRef.current = requestAnimationFrame(frame);
      } else {
        parallaxCurrentRef.current = target;
        if (canvasRef.current) canvasRef.current.style.transform = `translate3d(${target.x.toFixed(2)}px,${target.y.toFixed(2)}px,0)`;
        parallaxFrameRef.current = 0;
      }
    };
    parallaxFrameRef.current = requestAnimationFrame(frame);
  }, [hidden, presentation, reducedMotion]);

  const animateCamera = useCallback((target: Camera3D, duration = 520) => {
    cancelAnimationFrame(animationRef.current);
    if (reducedMotion || hidden) {
      cameraRef.current = target;
      setCamera(target);
      return;
    }
    const started = performance.now();
    let source: Camera3D | null = null;
    const frame = (now: number) => {
      setCamera((current) => {
        if (!source) source = current;
        const next = interpolateCamera(source, target, (now - started) / duration);
        cameraRef.current = next;
        return next;
      });
      if (now - started < duration) animationRef.current = requestAnimationFrame(frame);
    };
    animationRef.current = requestAnimationFrame(frame);
  }, [hidden, reducedMotion]);

  const resetCamera = useCallback(
    () => animateCamera(cameraForGraphScene(graph, presentation, mobile, scene), 480),
    [animateCamera, graph, mobile, presentation, scene],
  );

  useEffect(() => {
    const target = cameraForGraphScene(graph, presentation, mobile, scene);
    if (reducedMotion) {
      setCamera(target);
      return;
    }
    const timer = requestAnimationFrame(() => animateCamera(target, 760));
    return () => cancelAnimationFrame(timer);
  }, [animateCamera, graph, mobile, presentation, reducedMotion, scene]);

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

  useEffect(() => () => {
    cancelAnimationFrame(animationRef.current);
    cancelAnimationFrame(inputFrameRef.current);
    cancelAnimationFrame(parallaxFrameRef.current);
  }, []);

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
    const clusterCoordinate = stageCoordinateByCluster.get(node.clusterId) ?? null;
    let point = projectGraphStage(
      coordinate,
      projectionAnchor,
      clusterCoordinate,
      clusterDepthByCluster.get(node.clusterId) ?? null,
      graph.layout.bounds,
      camera,
      size,
      presentation,
      scene,
      mobile,
    );
    if (presentation === "home" && scene === "field" && !mobile
      && node.kind === "aggregate_boundary" && node.representedDocuments > 0 && clusterCoordinate) {
      const clusterPoint = projectGraphStage(
        clusterCoordinate,
        projectionAnchor,
        clusterCoordinate,
        clusterDepthByCluster.get(node.clusterId) ?? null,
        graph.layout.bounds,
        camera,
        size,
        presentation,
        scene,
        mobile,
      );
      const pull = node.clusterId === focusedStageClusterId
        ? 0.62
        : 0.18 + Math.min(0.26, node.representedDocuments / 460);
      const stage = aggregateStageById.get(node.id) ?? { angle: 0, radius: 0, depth: 0 };
      point = {
        ...point,
        x: point.x + (clusterPoint.x - point.x) * pull + Math.cos(stage.angle) * stage.radius,
        y: point.y + (clusterPoint.y - point.y) * pull * 0.78 + Math.sin(stage.angle) * stage.radius * 0.82 - stage.depth * 22,
        depth: point.depth + stage.depth * 164,
        scale: point.scale * (0.9 + (stage.depth + 0.5) * 0.2),
      };
    }
    return [node.id, point] as const;
  })), [aggregateStageById, camera, clusterDepthByCluster, coordinateById, graph.layout.bounds, mobile, presentation, projectionAnchor, scene, selection.nodes, size, stageCoordinateByCluster]);

  const compactLandscape = size.width <= 900 && window.innerHeight <= 520;
  const labels = useMemo(() => placeLabels(
    selection.nodes,
    projectedById,
    coordinateById,
    interactionId,
    compactLandscape
      ? Math.min(4, graph.layout.labelBudget)
      : mobile
        ? Math.min(presentation === "home" ? 4 : 9, graph.layout.labelBudget)
        : presentation === "home"
          ? Math.min(scene === "gravity" ? 6 : 5, graph.layout.labelBudget)
          : graph.layout.labelBudget,
    size,
    presentation,
    mobile || compactLandscape,
  ), [compactLandscape, coordinateById, graph.layout.labelBudget, interactionId, mobile, presentation, projectedById, scene, selection.nodes, size]);

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
    const renderColor = (label: string) => presentation === "home"
      ? homeFieldColors[label] ?? "#a9a096"
      : colorFor(label, style);
    const project = (coordinate: Pick<AtlasGraphCoordinateV1, "x" | "y" | "z">, clusterId?: string) =>
      projectGraphStage(
        coordinate,
        projectionAnchor,
        clusterId ? stageCoordinateByCluster.get(clusterId) ?? null : null,
        clusterId ? clusterDepthByCluster.get(clusterId) ?? null : null,
        graph.layout.bounds,
        camera,
        size,
        presentation,
        scene,
        mobile,
      );
    const focusedClusterId = interactionId ? nodeById.get(interactionId)?.clusterId ?? null : null;
    const projectedDocumentMarks = documentMarks
      .map((mark) => {
        const parent = projectedById.get(mark.parentId);
        const point = presentation === "home" && !mobile && parent
          ? homeAggregateDocumentPoint(mark, parent, size, focusedClusterId)
          : project(mark.coordinate, mark.clusterId);
        return { mark, point };
      })
      .sort((left, right) => left.point.depth - right.point.depth);
    const emphasisId = interactionId;
    const focusContext = Boolean(interactionId) || scene === "gravity" || scene === "trace";

    // Home is a warm near-black editorial stage. Analytical workspaces retain
    // the cooler graphite field so their tools stay legible.
    const backdrop = context.createLinearGradient(0, 0, size.width, size.height);
    if (presentation === "home") {
      backdrop.addColorStop(0, "#080704");
      backdrop.addColorStop(0.42, "#0b0906");
      backdrop.addColorStop(0.76, "#080706");
      backdrop.addColorStop(1, "#050504");
    } else {
      backdrop.addColorStop(0, "#100d14");
      backdrop.addColorStop(0.34, "#0b0911");
      backdrop.addColorStop(0.72, "#080912");
      backdrop.addColorStop(1, "#04050a");
    }
    context.fillStyle = backdrop;
    context.fillRect(0, 0, size.width, size.height);

    const freshnessWash = context.createLinearGradient(0, 0, 0, size.height);
    freshnessWash.addColorStop(0, presentation === "home" ? "rgba(235,213,176,.04)" : "rgba(181,188,244,.078)");
    freshnessWash.addColorStop(0.42, presentation === "home" ? "rgba(176,136,81,.012)" : "rgba(112,92,158,.03)");
    freshnessWash.addColorStop(0.76, presentation === "home" ? "rgba(84,63,36,.006)" : "rgba(58,39,75,.012)");
    freshnessWash.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = freshnessWash;
    context.fillRect(0, 0, size.width, size.height);

    if (presentation === "home") {
      const texture = homeGrainTexture();
      const pattern = texture ? context.createPattern(texture, "repeat") : null;
      if (pattern) {
        context.save();
        context.globalCompositeOperation = "soft-light";
        context.globalAlpha = 0.18;
        context.fillStyle = pattern;
        context.fillRect(0, 0, size.width, size.height);
        context.restore();
      }
    }

    const gravityPoints = selection.nodes
      .filter((node) => node.kind !== "district")
      .map((node) => ({ node, point: projectedById.get(node.id) }))
      .filter((item): item is { node: AtlasGraphNodeV1; point: ProjectedPoint } => Boolean(item.point?.visible));
    const gravityWeight = gravityPoints.reduce((sum, item) => sum + Math.max(1, item.node.gravity), 0);
    const gravityCenter = gravityWeight > 0 ? {
      x: gravityPoints.reduce((sum, item) => sum + item.point.x * Math.max(1, item.node.gravity), 0) / gravityWeight,
      y: gravityPoints.reduce((sum, item) => sum + item.point.y * Math.max(1, item.node.gravity), 0) / gravityWeight,
    } : { x: size.width * 0.62, y: size.height * 0.5 };
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
      substrate.addColorStop(0, presentation === "home" ? "rgba(182,143,88,.19)" : "rgba(112,88,145,.2)");
      substrate.addColorStop(0.38, presentation === "home" ? "rgba(102,83,58,.092)" : "rgba(73,61,108,.115)");
      substrate.addColorStop(0.7, presentation === "home" ? "rgba(55,48,39,.038)" : "rgba(46,39,72,.052)");
      substrate.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = substrate;
      context.beginPath();
      context.arc(0, 0, 1, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
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

    const clusterRenderOrder = [...graph.clusters].sort((left, right) => {
      const averageDepth = (clusterId: string) => {
        const points = (clusterCoordinates.get(clusterId) ?? [])
          .map((coordinate) => projectedById.get(coordinate.id))
          .filter((point): point is ProjectedPoint => Boolean(point));
        return points.length ? points.reduce((sum, point) => sum + point.depth, 0) / points.length : 0;
      };
      return averageDepth(left.id) - averageDepth(right.id) || left.id.localeCompare(right.id, "en");
    });

    if (presentation !== "home") {
      // The analytical workspace retains the persisted X/Y contour as a map
      // boundary. It is deliberately flat and is never presented as volume.
      for (const cluster of clusterRenderOrder) {
        if (districtId && cluster.id !== districtId) continue;
        const color = renderColor(cluster.label);
        const depth = depthForCluster(clusterCoordinates.get(cluster.id) ?? []);
        context.save();
        context.lineJoin = "round";
        for (const polygon of cluster.contour.coordinates) {
          for (const ring of polygon) {
            context.fillStyle = rgba(color, scene === "trace" ? 0.006 : 0.011);
            context.strokeStyle = rgba(color, scene === "trace" ? 0.018 : 0.038);
            context.lineWidth = 0.65;
            const points = drawProjectedRing(context, ring, depth.near, project);
            if (points.length) { context.fill(); context.stroke(); }
          }
        }
        context.restore();
      }
    }

    // Home carries district identity through position, hue and direct labels.
    // Luminance belongs to individual knowledge nodes: a larger verified
    // `uniqueInboundDocuments` value creates a larger, brighter local field.
    // The gradients are rendered behind all routes so light never hides edge
    // direction, and no filled district panel can turn into a camera-facing card.
    const maximumGravity = Math.max(
      1,
      ...selection.nodes
        .filter((node) => node.kind !== "aggregate_boundary")
        .map((node) => node.gravity),
    );
    if (presentation === "home") {
      // The aggregate record density belongs to its node, so each high-volume
      // boundary softly illuminates its own local field instead of painting a
      // detached district panel behind the graph.
      context.save();
      context.globalCompositeOperation = "screen";
      for (const node of selection.nodes) {
        // Owner graph density is usually carried by the district anchor. Some
        // profiles may instead expose an aggregate boundary. Both are factual
        // graph nodes, and both deserve a node-local field when they represent
        // records. Never synthesize a detached district backdrop.
        if ((node.kind !== "district" && node.kind !== "aggregate_boundary") || node.representedDocuments < 1) continue;
        const point = projectedById.get(node.id);
        if (!point?.visible) continue;
        const cluster = clusterById.get(node.clusterId);
        const color = renderColor(cluster?.label ?? "");
        const spread = homeAggregateSpread(node.representedDocuments);
        const rotation = (stableUnit(`${node.id}:home-rotation`) - 0.5) * 1.04;
        const focused = node.clusterId === focusedClusterId;
        const fieldColor = focused ? mixHex(color, "#f1a13b", 0.62) : color;
        const density = Math.min(1, Math.sqrt(node.representedDocuments) / 15);
        context.save();
        context.translate(point.x, point.y);
        context.rotate(rotation);
        context.scale(1, 0.78);
        const field = context.createRadialGradient(0, 0, 0, 0, 0, spread * 1.12);
        const coreAlpha = (focused ? 0.088 : 0.048) + density * (focused ? 0.058 : 0.034);
        field.addColorStop(0, rgba(fieldColor, coreAlpha));
        field.addColorStop(0.38, rgba(fieldColor, coreAlpha * 0.48));
        field.addColorStop(0.74, rgba(fieldColor, coreAlpha * 0.1));
        field.addColorStop(1, rgba(fieldColor, 0));
        context.fillStyle = field;
        context.beginPath();
        context.arc(0, 0, spread * 1.12, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }
      context.restore();

      const haloNodes = [...selection.nodes].sort((left, right) => left.gravity - right.gravity || left.id.localeCompare(right.id, "en"));
      context.save();
      context.globalCompositeOperation = "screen";
      for (const node of haloNodes) {
        if (node.kind === "aggregate_boundary" || node.gravity <= 0) continue;
        const point = projectedById.get(node.id);
        if (!point?.visible) continue;
        const cluster = clusterById.get(node.clusterId);
        const districtColor = renderColor(cluster?.label ?? "");
        const selected = node.id === focusId;
        const hovered = node.id === emphasisId && node.id !== focusId;
        const gravityLight = Math.pow(node.gravity / maximumGravity, 0.44);
        const contextAlpha = interactionId && !activeNeighborhoodIds.has(node.id) ? 0.2 : 1;
        const freshnessAlpha = scene === "freshness" && !node.freshness ? 0.38 : 1;
        const haloColor = selected ? "#f5a642" : mixHex(districtColor, "#f4eadc", 0.08 + gravityLight * 0.14);
        const haloRadius = Math.min(
          mobile ? 64 : node.kind === "district" ? 112 : 98,
          (18 + gravityLight * (mobile ? 48 : node.kind === "district" ? 90 : 78)) * Math.max(0.78, Math.min(1.1, point.scale)),
        );
        const coreAlpha = (0.055 + gravityLight * 0.19 + (selected || hovered ? 0.055 : 0)) * contextAlpha * freshnessAlpha;
        const halo = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, haloRadius);
        halo.addColorStop(0, rgba(haloColor, coreAlpha));
        halo.addColorStop(0.18, rgba(haloColor, coreAlpha * 0.68));
        halo.addColorStop(0.48, rgba(haloColor, coreAlpha * 0.28));
        halo.addColorStop(0.76, rgba(haloColor, coreAlpha * 0.06));
        halo.addColorStop(1, rgba(haloColor, 0));
        context.fillStyle = halo;
        context.beginPath();
        context.arc(point.x, point.y, haloRadius, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();
    }

    // Membership and aggregate density are encoded through placement, halo and
    // local micro-marks only. They are intentionally never rendered as lines.

    // The analytical workspace keeps an explicit engineering axis. Home uses
    // the editorial chapter rail so the visual field stays unobstructed.
    if (presentation !== "home") {
      const axisX = size.width - 44;
      const axisTop = 72;
      const axisBottom = size.height - 92;
      context.save();
      context.strokeStyle = "rgba(222,229,224,.62)";
      context.fillStyle = "rgba(238,236,224,.78)";
      context.lineWidth = 1;
      context.beginPath(); context.moveTo(axisX, axisBottom); context.lineTo(axisX, axisTop); context.stroke();
      context.beginPath(); context.moveTo(axisX, axisTop); context.lineTo(axisX - 4, axisTop + 8); context.moveTo(axisX, axisTop); context.lineTo(axisX + 4, axisTop + 8); context.stroke();
      context.font = "700 12px Pretendard Variable, sans-serif";
      context.textAlign = "center";
      context.fillText("NEWER", axisX, axisTop - 14);
      context.fillStyle = "rgba(238,236,224,.5)";
      context.fillText("날짜 미기록", axisX - 5, axisBottom + 18);
      context.restore();
    }

    // A district pair owns one corridor, split into at most two factual
    // direction lanes. The command model has already removed every decorative
    // or membership line before drawing reaches Canvas.
    const corridorCommands = edgeCommands.filter((command) => command.semanticKind === "district_corridor");
    if (corridorCommands.length && !districtId) {
      const maximumDistrictRoute = Math.max(1, ...corridorCommands.map((command) => command.weight));
      for (const route of [...corridorCommands].reverse()) {
        const sourceCoordinate = coordinateById.get(route.sourceId);
        const targetCoordinate = coordinateById.get(route.targetId);
        if (!sourceCoordinate || !targetCoordinate) continue;
        const source = projectedById.get(route.sourceId) ?? project(sourceCoordinate);
        const target = projectedById.get(route.targetId) ?? project(targetCoordinate);
        if (!source.visible || !target.visible) continue;
        const active = Boolean(interactionId) && (route.sourceId === focusedClusterId || route.targetId === focusedClusterId);
        const routeStrength = Math.sqrt(route.weight / maximumDistrictRoute);
        const routeWidth = 0.8 + 1.6 * routeStrength;
        const sourceColor = renderColor(nodeById.get(route.sourceId)?.label ?? "");
        const targetColor = renderColor(nodeById.get(route.targetId)?.label ?? "");
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const normalX = -dy / distance;
        const normalY = dx / distance;
        const laneKey = `${route.sourceId}:${route.targetId}`;
        const bendSign = route.sourceId.localeCompare(route.targetId, "en") <= 0 ? 1 : -1;
        const bend = Math.min(150, Math.max(34, distance * 0.19)) * bendSign;
        const shape = stableUnit(`${laneKey}:corridor-shape`);
        const controlA = {
          x: source.x + dx * (0.27 + shape * 0.06) + normalX * bend,
          y: source.y + dy * (0.27 + shape * 0.06) + normalY * bend,
        };
        const controlB = {
          x: source.x + dx * (0.7 + shape * 0.05) - normalX * bend * 0.56,
          y: source.y + dy * (0.7 + shape * 0.05) - normalY * bend * 0.56,
        };
        const pointAt = (progress: number) => cubicPoint(source, controlA, controlB, target, progress);
        const routeGradient = context.createLinearGradient(source.x, source.y, target.x, target.y);
        routeGradient.addColorStop(0, mixHex(sourceColor, "#f4efe3", active ? 0.3 : 0.1));
        routeGradient.addColorStop(0.5, mixHex(sourceColor, targetColor, 0.5));
        routeGradient.addColorStop(1, mixHex(targetColor, "#f4efe3", active ? 0.3 : 0.1));
        context.save();
        context.globalAlpha = interactionId ? active ? 0.78 : 0.07 : 0.36;
        context.strokeStyle = routeGradient;
        context.fillStyle = mixHex(targetColor, "#f4efe3", active ? 0.32 : 0.14);
        context.lineWidth = routeWidth;
        if (active) {
          context.shadowColor = rgba(mixHex(sourceColor, targetColor, 0.5), 0.38);
          context.shadowBlur = 7;
        }
        context.beginPath();
        context.moveTo(source.x, source.y);
        context.bezierCurveTo(controlA.x, controlA.y, controlB.x, controlB.y, target.x, target.y);
        context.stroke();
        context.shadowBlur = 0;
        drawArrow(context, pointAt(0.72), pointAt(0.79), 1);
        context.restore();
      }
    }

    const exactCommands = edgeCommands.filter((command) => command.semanticKind !== "district_corridor");
    const maximumEdge = Math.max(1, ...exactCommands.map((command) => command.weight));
    const sortedEdges = exactCommands.map((command) => ({
      id: `${command.semanticKind}:${command.sourceId}:${command.targetId}`,
      source: command.sourceId,
      target: command.targetId,
      occurrenceCount: command.weight,
      semanticKind: command.semanticKind,
    })).sort((left, right) => {
      const leftDepth = ((projectedById.get(left.source)?.depth ?? 0) + (projectedById.get(left.target)?.depth ?? 0)) / 2;
      const rightDepth = ((projectedById.get(right.source)?.depth ?? 0) + (projectedById.get(right.target)?.depth ?? 0)) / 2;
      return leftDepth - rightDepth;
    });
    for (const edge of sortedEdges) {
      const source = projectedById.get(edge.source);
      const targetFull = projectedById.get(edge.target);
      if (!source?.visible || !targetFull?.visible) continue;
      const exactPath = edge.semanticKind === "directed_path";
      const incident = emphasisId !== null && (edge.source === emphasisId || edge.target === emphasisId);
      const active = exactPath || incident || edge.semanticKind === "exact_reference";
      const emphasized = active;
      const edgeProgress = emphasized ? traceProgress : 1;
      const dx = targetFull.x - source.x;
      const dy = targetFull.y - source.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const normalX = -dy / distance;
      const normalY = dx / distance;
      const bendDirection = stableUnit(`${edge.id}:curve`) > 0.5 ? 1 : -1;
      const bend = presentation === "home" ? Math.min(164, Math.max(24, distance * 0.3)) * bendDirection : 0;
      const shapeSeed = stableUnit(`${edge.id}:shape`);
      const secondBend = bend * (shapeSeed < 0.44 ? -0.58 : 0.72);
      const controlA = {
        x: source.x + dx * (0.25 + shapeSeed * 0.08) + normalX * bend,
        y: source.y + dy * (0.25 + shapeSeed * 0.08) + normalY * bend,
      };
      const controlB = {
        x: source.x + dx * (0.68 + shapeSeed * 0.07) + normalX * secondBend,
        y: source.y + dy * (0.68 + shapeSeed * 0.07) + normalY * secondBend,
      };
      const segment = cubicSegment(source, controlA, controlB, targetFull, edgeProgress);
      const target = segment.target;
      const sourceNode = nodeById.get(edge.source);
      const targetNode = nodeById.get(edge.target);
      const withinFocusedCluster = presentation === "home"
        && Boolean(focusedClusterId)
        && sourceNode?.clusterId === focusedClusterId
        && targetNode?.clusterId === focusedClusterId;
      context.save();
      const homeContextAlpha = presentation === "home" && scene !== "trace"
        ? incident ? 0.36 : withinFocusedCluster ? 0.28 : 0.16
        : incident ? 0.26 : 0.15;
      context.globalAlpha = exactPath ? 1 : emphasized ? 0.62 : homeContextAlpha;
      const width = (emphasized ? 0.78 : incident ? 0.42 : withinFocusedCluster ? 0.24 : 0.12) + 0.82 * Math.sqrt(edge.occurrenceCount / maximumEdge);
      const sourceColor = renderColor(clusterById.get(sourceNode?.clusterId ?? "")?.label ?? "");
      const targetColor = renderColor(clusterById.get(targetNode?.clusterId ?? "")?.label ?? "");
      const edgeGradient = context.createLinearGradient(source.x, source.y, target.x, target.y);
      edgeGradient.addColorStop(0, exactPath ? "#f6a23a" : withinFocusedCluster ? mixHex(sourceColor, "#f2a13b", 0.66) : mixHex(sourceColor, "#ecf1ed", emphasized ? 0.28 : active ? 0.18 : 0.08));
      edgeGradient.addColorStop(1, exactPath ? "#ffc46f" : withinFocusedCluster ? mixHex(targetColor, "#ffc268", 0.66) : mixHex(targetColor, "#ecf1ed", emphasized ? 0.28 : active ? 0.18 : 0.08));
      if (emphasized) {
        context.shadowColor = exactPath ? "rgba(246,162,58,.72)" : rgba(mixHex(sourceColor, targetColor, 0.5), 0.42);
        context.shadowBlur = exactPath ? 12 : 7;
      }
      context.strokeStyle = edgeGradient;
      context.fillStyle = exactPath
        ? "#ffc46f"
        : withinFocusedCluster
          ? mixHex(targetColor, "#ffc268", 0.7)
          : mixHex(targetColor, "#f1f3ec", emphasized ? 0.3 : active ? 0.2 : 0.12);
      context.lineWidth = width;
      context.beginPath();
      context.moveTo(source.x, source.y);
      context.bezierCurveTo(
        segment.controlA.x,
        segment.controlA.y,
        segment.controlB.x,
        segment.controlB.y,
        target.x,
        target.y,
      );
      context.stroke();
      if (presentation === "home" && edgeProgress > 0.5 && edge.occurrenceCount > 1) {
        const markerCount = edge.occurrenceCount;
        context.save();
        context.globalAlpha *= exactPath ? 0.84 : withinFocusedCluster ? 0.68 : 0.46;
        for (let markerIndex = 0; markerIndex < markerCount; markerIndex += 1) {
          const markerProgress = Math.min(edgeProgress, 0.12 + 0.76 * ((markerIndex + 0.5) / markerCount));
          const before = cubicPoint(source, controlA, controlB, targetFull, Math.max(0, markerProgress - 0.012));
          const marker = cubicPoint(source, controlA, controlB, targetFull, markerProgress);
          const after = cubicPoint(source, controlA, controlB, targetFull, Math.min(1, markerProgress + 0.012));
          const angle = Math.atan2(after.y - before.y, after.x - before.x);
          const markerSize = 1.1 + stableUnit(`${edge.id}:occurrence:${markerIndex}`) * 1.35;
          context.save();
          context.translate(marker.x, marker.y);
          context.rotate(angle);
          context.fillStyle = exactPath
            ? "#ffc46f"
            : withinFocusedCluster
              ? mixHex(mixHex(sourceColor, targetColor, markerProgress), "#f3a33f", 0.62)
              : mixHex(sourceColor, targetColor, markerProgress);
          context.beginPath();
          context.moveTo(markerSize * 1.5, 0);
          context.lineTo(-markerSize, markerSize * 0.7);
          context.lineTo(-markerSize * 0.42, 0);
          context.lineTo(-markerSize, -markerSize * 0.7);
          context.closePath();
          context.fill();
          context.restore();
        }
        context.restore();
      }
      const targetCoordinate = coordinateById.get(edge.target)!;
      if (edgeProgress > 0.44) {
        const arrowEnd = Math.min(edgeProgress, 0.84);
        const arrowStart = Math.max(0, arrowEnd - 0.055);
        drawArrow(
          context,
          cubicPoint(source, controlA, controlB, targetFull, arrowStart),
          cubicPoint(source, controlA, controlB, targetFull, arrowEnd),
          Math.max(4, targetCoordinate.radius * targetFull.scale),
        );
      }
      context.restore();
    }

    // One anonymous micro-mark per represented document. This restores truthful
    // density without turning private documents into public graph nodes.
    for (const { mark, point } of projectedDocumentMarks) {
      if (!point.visible) continue;
      const cluster = clusterById.get(mark.clusterId);
      const color = renderColor(cluster?.label ?? "");
      const active = mark.parentId === emphasisId;
      const inSelectedCluster = presentation === "home" && Boolean(focusedClusterId) && mark.clusterId === focusedClusterId;
      const markIdentity = `${mark.parentId}:${mark.index}`;
      const radiusSeed = stableUnit(`${markIdentity}:radius`);
      const radiusVariance = 0.62 + radiusSeed * 0.62 + (radiusSeed > 0.95 ? 0.86 : 0);
      const radius = presentation === "home"
        ? Math.max(0.9, Math.min(3.1, point.scale * (active ? 2.55 : 1.78) * radiusVariance * (inSelectedCluster ? 1.12 : 1)))
        : Math.max(2.05, Math.min(4.25, point.scale * (active ? 4.25 : 3.55)));
      const inFocusedCluster = !focusContext || activeNeighborhoodIds.has(mark.parentId) || mark.clusterId === focusedClusterId;
      context.save();
      const depthAlpha = Math.max(0.72, Math.min(1, point.scale * 1.22));
      const authoredAlpha = 0.88 + stableUnit(`${markIdentity}:alpha`) * 0.12;
      context.globalAlpha = (scene === "trace" && !active
        ? 0.075
        : active
          ? 0.98
          : presentation === "home"
            ? inFocusedCluster ? inSelectedCluster ? 0.94 : 0.68 + radiusSeed * 0.22 : 0.18
            : inFocusedCluster ? 0.9 : 0.64) * depthAlpha * authoredAlpha;
      context.fillStyle = active
        ? "#ffc46f"
        : presentation === "home" && inSelectedCluster
          ? mixHex("#e58d29", "#ffd18a", Math.max(0.06, Math.min(0.3, 0.1 + (point.scale - 0.68) * 0.16)))
          : mixHex(color, "#cbbba2", presentation === "home"
            ? Math.max(0.1, Math.min(0.3, 0.16 + (point.scale - 0.58) * 0.14))
            : Math.max(0.035, Math.min(0.18, (point.scale - 0.58) * 0.18)));
      const depthBeacon = presentation === "home" && radiusSeed > 0.965;
      if (active || depthBeacon || (inSelectedCluster && radiusSeed > 0.92)) {
        context.shadowColor = active
          ? "rgba(255,174,71,.58)"
          : rgba(mixHex(color, "#f3c37a", 0.36), depthBeacon ? 0.32 : 0.28);
        context.shadowBlur = active ? 6 : depthBeacon ? 4.5 : 3.5;
      }
      context.beginPath();
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      context.fill();
      context.shadowBlur = 0;
      if (presentation !== "home") {
        context.strokeStyle = "rgba(2,4,10,.72)";
        context.lineWidth = 0.55;
        context.stroke();
      }
      context.restore();
    }

    const nodesByDepth = [...selection.nodes].sort((left, right) =>
      (projectedById.get(left.id)?.depth ?? 0) - (projectedById.get(right.id)?.depth ?? 0));
    for (const node of nodesByDepth) {
      const point = projectedById.get(node.id);
      const coordinate = coordinateById.get(node.id);
      if (!point?.visible || !coordinate) continue;
      const cluster = clusterById.get(node.clusterId);
      const color = renderColor(cluster?.label ?? "");
      const selected = node.id === focusId;
      const hovered = node.id === emphasisId && node.id !== focusId;
      const inFocusedCluster = !focusContext || activeNeighborhoodIds.has(node.id);
      const selectedClusterNode = presentation === "home" && Boolean(focusedClusterId) && node.clusterId === focusedClusterId;
      const isAggregate = node.kind === "aggregate_boundary";
      const isDistrict = node.kind === "district";
      const gravityScale = Math.sqrt(Math.max(0, node.gravity) / maximumGravity);
      const baseRadius = presentation === "home" && !isAggregate
        ? isDistrict ? 4.2 + 13.8 * gravityScale : 2.2 + 9.6 * gravityScale
        : scene === "gravity"
          ? Math.max(6, 7 + 34 * gravityScale)
          : coordinate.radius;
      const metricRadius = Math.max(2.2, Math.min(presentation === "home" ? 18 : 38, baseRadius * point.scale * 1.08)) * (selected ? 1.12 : 1);
      const radius = isAggregate
        ? selected ? Math.max(4.8, Math.min(7, metricRadius * 0.42)) : presentation === "home" ? 1.8 : 3.2
        : isDistrict ? presentation === "home" ? Math.max(4.2, Math.min(14, metricRadius * 0.88)) : Math.max(8, Math.min(14, metricRadius * 0.58))
          : node.kind === "moc_hub"
            ? selected ? Math.min(presentation === "home" ? (mobile ? 9.5 : 10.5) : 19, metricRadius * 1.12) : Math.min(presentation === "home" ? (mobile ? 5 : 5.4) : 12.5, metricRadius)
            : selected ? Math.min(presentation === "home" ? (mobile ? 9 : 10.5) : 14, metricRadius) : Math.min(presentation === "home" ? (mobile ? 5.2 : 6.2) : 10, metricRadius);
      context.save();
      context.globalAlpha = scene === "freshness" && !node.freshness
        ? 0.24
        : inFocusedCluster
          ? Math.max(0.52, Math.min(1, 0.68 + point.scale * 0.2))
          : 0.2;
      if (selected || hovered) {
        const glowReach = 2.05;
        context.globalCompositeOperation = "screen";
        const glow = context.createRadialGradient(point.x, point.y, radius * 0.25, point.x, point.y, radius * glowReach);
        glow.addColorStop(0, selected ? "rgba(255,167,53,.18)" : rgba(color, 0.13));
        glow.addColorStop(0.42, selected ? "rgba(255,167,53,.05)" : rgba(color, 0.035));
        glow.addColorStop(1, "rgba(0,0,0,0)");
        context.fillStyle = glow;
        context.beginPath(); context.arc(point.x, point.y, radius * glowReach, 0, Math.PI * 2); context.fill();
        context.globalCompositeOperation = "source-over";
      }
      if (isAggregate || isDistrict) {
        context.fillStyle = rgba(color, isDistrict ? selected ? 0.96 : 0.82 : selected ? 0.18 : 0.055);
      } else if (node.kind === "moc_hub" && selected) {
        context.fillStyle = "#e99a31";
      } else if (node.kind === "moc_hub") {
        context.fillStyle = selectedClusterNode
          ? mixHex(color, "#f0a13d", hovered ? 0.72 : 0.56)
          : mixHex(color, "#f7f2e7", hovered ? 0.22 : 0.08);
      } else if (selected) {
        context.fillStyle = "#f5a642";
      } else {
        const depthLight = Math.max(0.025, Math.min(0.16, (point.scale - 0.58) * 0.18));
        context.fillStyle = selectedClusterNode
          ? mixHex(color, "#ed9d38", 0.48)
          : mixHex(color, "#f7f3e8", depthLight);
      }
      context.strokeStyle = selected ? "#ffc069" : node.kind === "moc_hub" ? color : mixHex(color, "#02040b", isDistrict ? 0.26 : 0.38);
      context.lineWidth = selected ? 1.8 : node.kind === "moc_hub" ? 1.35 : isDistrict ? 1.15 : 0.8;
      if (!isAggregate && !isDistrict) {
        const relief = Math.max(1.2, Math.min(3.4, radius * 0.16));
        context.save();
        context.globalAlpha *= 0.72;
        context.fillStyle = "#03040a";
        context.strokeStyle = rgba(color, 0.16);
        context.lineWidth = 0.7;
        drawNodePath(context, node, point.x + relief, point.y + relief * 0.72, radius);
        context.fill();
        context.stroke();
        context.restore();
      }
      drawNodePath(context, node, point.x, point.y, radius);
      context.fill(); context.stroke();
      if (isDistrict && presentation === "home") {
        context.globalAlpha *= selected ? 0.96 : 0.72;
        context.strokeStyle = selected ? "#ffc069" : rgba(color, 0.72);
        context.lineWidth = selected ? 1.5 : 0.9;
        context.beginPath();
        context.arc(point.x, point.y, radius + 4.5, 0, Math.PI * 2);
        context.stroke();
        context.fillStyle = selected ? "#ffe0a8" : mixHex(color, "#fff4df", 0.34);
        context.beginPath();
        context.arc(point.x, point.y, Math.max(1.6, radius * 0.2), 0, Math.PI * 2);
        context.fill();
      }
      if (node.kind === "moc_hub" && selected) {
        context.fillStyle = "#ffe0a8";
        context.beginPath(); context.arc(point.x, point.y, Math.max(3.1, radius * 0.19), 0, Math.PI * 2); context.fill();
      }
      if (node.kind === "moc_hub" && presentation === "home") {
        const ring = radius + (selected ? 6 : 3.5);
        const arc = Math.max(0.22, Math.min(0.88, node.gravity / maximumGravity));
        context.globalAlpha *= selected ? 0.94 : 0.5;
        context.strokeStyle = selected ? "#ffc069" : rgba(color, 0.82);
        context.lineWidth = selected ? 1.35 : 0.8;
        context.beginPath();
        context.arc(point.x, point.y, ring, -Math.PI * 0.74, -Math.PI * 0.74 + Math.PI * 1.48 * arc);
        context.stroke();
        context.fillStyle = selected ? "#ffe1a9" : mixHex(color, "#fff7e9", 0.3);
        context.beginPath();
        context.arc(
          point.x + Math.cos(-Math.PI * 0.74 + Math.PI * 1.48 * arc) * ring,
          point.y + Math.sin(-Math.PI * 0.74 + Math.PI * 1.48 * arc) * ring,
          selected ? 1.8 : 1.05,
          0,
          Math.PI * 2,
        );
        context.fill();
      }
      if (isDistrict) {
        context.globalAlpha *= selected ? 1 : presentation === "home" ? 0.48 : 0.78;
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
      if (selected || (isDistrict && presentation !== "home") || (node.kind === "aggregate_boundary" && presentation !== "home")) {
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
  }, [activeNeighborhoodIds, camera, clusterById, clusterCoordinates, clusterDepthByCluster, coordinateById, districtId, documentMarks, edgeCommands, focusId, graph, hidden, interactionId, mobile, nodeById, presentation, projectedById, projectionAnchor, scene, selection, size, stageCoordinateByCluster, traceProgress]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (mobile) return;
    cancelAnimationFrame(animationRef.current);
    cancelAnimationFrame(inputFrameRef.current);
    inputFrameRef.current = 0;
    pendingCameraRef.current = null;
    settleParallax(0, 0);
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
    if (!drag || drag.pointerId !== event.pointerId) {
      if (mobile) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      settleParallax(
        Math.max(-5, Math.min(5, (x / Math.max(1, bounds.width) - 0.5) * -10)),
        Math.max(-4, Math.min(4, (y / Math.max(1, bounds.height) - 0.5) * -8)),
      );
      const hit = [...selection.nodes]
        .map((node) => ({ node, point: projectedById.get(node.id), coordinate: coordinateById.get(node.id) }))
        .filter((item) => item.point?.visible && item.coordinate)
        .sort((left, right) => (right.point?.depth ?? 0) - (left.point?.depth ?? 0))
        .find((item) => {
          const radius = Math.max(13, (item.coordinate?.radius ?? 6) * (item.point?.scale ?? 1) * 1.62);
          return Math.hypot((item.point?.x ?? 0) - x, (item.point?.y ?? 0) - y) <= radius;
        });
      const nextHoverId = hit?.node.id ?? null;
      setHoverId((current) => current === nextHoverId ? current : nextHoverId);
      onHover?.(nextHoverId);
      return;
    }
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
      commitCameraInput(clampCamera({ ...drag.camera, panX: drag.camera.panX + dx, panY: drag.camera.panY + dy }));
    } else {
      commitCameraInput(clampCamera({ ...drag.camera, yaw: drag.camera.yaw + dx * 0.0042, pitch: drag.camera.pitch + dy * 0.0035 }));
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
    const source = pendingCameraRef.current ?? cameraRef.current;
    animateCamera(clampCamera({ ...source, zoom: source.zoom * Math.exp(-event.deltaY * 0.0011) }), 180);
  };

  return (
    <div
      ref={containerRef}
      className={`living-graph-canvas is-${presentation} ${className}`.trim()}
      data-scene={scene}
      data-node-count={selection.nodes.length}
      data-edge-count={edgeCommands.length}
      data-district-route-count={edgeCommands.filter((command) => command.semanticKind === "district_corridor").length}
      data-edge-command-kinds={[...new Set(edgeCommands.map((command) => command.semanticKind))].join(",")}
      data-path-length={selection.path.length}
      data-renderer="canvas2d-projected-3d"
      data-camera-yaw={camera.yaw.toFixed(4)}
      data-camera-pitch={camera.pitch.toFixed(4)}
      data-camera-zoom={camera.zoom.toFixed(4)}
      data-hover-id={interactionId ?? ""}
      aria-label={`3차원 방향 지식 그래프. 노드 ${selection.nodes.length}개, 의미가 검증된 선 ${edgeCommands.length}개. X는 구역, Y는 최신성, Z는 구조 깊이입니다.`}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => {
        settleParallax(0, 0);
        if (!dragRef.current) {
          setHoverId(null);
          onHover?.(null);
        }
      }}
      onPointerCancel={(event) => {
        settleParallax(0, 0);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        dragRef.current = null;
      }}
      onLostPointerCapture={() => { dragRef.current = null; }}
      onWheel={handleWheel}
      onKeyDown={(event) => {
        if (mobile) return;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          animateCamera(clampCamera({ ...cameraRef.current, yaw: cameraRef.current.yaw + (event.key === "ArrowLeft" ? -0.08 : 0.08) }), 180);
        } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          animateCamera(clampCamera({ ...cameraRef.current, pitch: cameraRef.current.pitch + (event.key === "ArrowUp" ? -0.06 : 0.06) }), 180);
        } else if (event.key === "+" || event.key === "=") {
          animateCamera(clampCamera({ ...cameraRef.current, zoom: cameraRef.current.zoom * 1.1 }), 180);
        } else if (event.key === "-" || event.key === "_") {
          animateCamera(clampCamera({ ...cameraRef.current, zoom: cameraRef.current.zoom / 1.1 }), 180);
        } else if (event.key.toLowerCase() === "r") resetCamera();
      }}
    >
      <canvas ref={canvasRef} aria-hidden="true" />
      <div className="graph-label-layer">
        {labels.map(({ node, x, y }) => (
          <button
            key={node.id}
            type="button"
            className={`kind-${node.kind}${node.id === focusId ? " is-selected" : ""}${node.id === interactionId && node.id !== focusId ? " is-preview" : ""}`}
            style={{ left: x, top: y }}
            aria-pressed={node.id === focusId}
            aria-label={`${graphNodeLabel(node)}. 고유 inbound 문서 ${node.gravity}, 링크 출현 ${node.occurrences}, ${node.freshness ?? "날짜 미기록"}`}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerEnter={() => onHover?.(node.id)}
            onPointerLeave={() => onHover?.(null)}
            onFocus={() => onHover?.(node.id)}
            onBlur={() => onHover?.(null)}
            onClick={() => onSelect(node.id)}
          >
            {graphNodeLabel(node)}
          </button>
        ))}
      </div>
      {!mobile && presentation !== "home" && (
        <div className="graph-camera-controls" role="group" aria-label="3D 카메라 제어" onPointerDown={(event) => event.stopPropagation()}>
          <button type="button" aria-label="선택 지점에 맞추기" onClick={() => {
            const coordinate = focusId ? coordinateById.get(focusId) : null;
            if (coordinate) animateCamera(cameraForSelection(camera, coordinate));
            else resetCamera();
          }}><Focus size={15} /></button>
          <button type="button" aria-label="확대" onClick={() => animateCamera(clampCamera({ ...cameraRef.current, zoom: cameraRef.current.zoom * 1.12 }), 180)}><Plus size={15} /></button>
          <button type="button" aria-label="축소" onClick={() => animateCamera(clampCamera({ ...cameraRef.current, zoom: cameraRef.current.zoom / 1.12 }), 180)}><Minus size={15} /></button>
          <button type="button" aria-label="카메라 초기화" onClick={resetCamera}><RotateCcw size={15} /></button>
        </div>
      )}
      {presentation !== "home" && <div className="graph-3d-badge" aria-hidden="true"><span />SPATIAL KNOWLEDGE FIELD</div>}
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
      <ol className="graph-accessible-list" aria-label="현재 렌더링된 실제 의미 선 목록">
        {edgeCommands.map((command) => (
          <li key={`${command.semanticKind}:${command.sourceId}:${command.targetId}`}>
            {graphNodeLabel(nodeById.get(command.sourceId)!)} → {graphNodeLabel(nodeById.get(command.targetId)!)} · {command.semanticKind} · 링크 출현 {command.weight}
          </li>
        ))}
      </ol>
    </div>
  );
}
