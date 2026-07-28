import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  DodecahedronGeometry,
  DynamicDrawUsage,
  IcosahedronGeometry,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  Points,
  ShaderMaterial,
  TetrahedronGeometry,
  Vector3,
} from "three";
import type { SemanticSpaceEdge, SemanticSpaceNode } from "./semantic-space-contract";

const SEGMENTS = 5;
const hidden = new Color(0x050507);

export function geometryFamily(kind: SemanticSpaceNode["kind"]) {
  if (kind === "moc_hub") return "moc";
  if (kind === "paper_gateway") return "paper";
  if (kind === "signal_domain" || kind === "signal_storyline") return "signal";
  if (kind === "project" || kind === "project_stage") return "project";
  if (kind === "strategy_insight") return "strategy";
  return "source";
}

export function nodeGeometry(family: string) {
  if (family === "paper") return new OctahedronGeometry(1, 0);
  if (family === "signal") return new TetrahedronGeometry(1, 0);
  if (family === "project") return new DodecahedronGeometry(1, 0);
  if (family === "strategy") return new ConeGeometry(0.9, 1.7, 6, 1);
  return new IcosahedronGeometry(1, family === "moc" ? 1 : 0);
}

export function nodeMaterial(family: string) {
  if (family === "source" || family === "project") {
    return new MeshBasicMaterial({
      transparent: true,
      opacity: family === "project" ? 0.96 : 0.86,
      vertexColors: true,
    });
  }
  return new MeshStandardMaterial({
    roughness: family === "paper" ? 0.72 : 0.9,
    metalness: family === "paper" ? 0.08 : 0.015,
    transparent: false,
    opacity: 1,
    vertexColors: true,
  });
}

function routeBias(id: string) {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) / 0xffffffff) * 2 - 1;
}

function curvedPoints(source: Vector3, target: Vector3, edge: SemanticSpaceEdge) {
  const bias = routeBias(edge.id);
  const delta = target.clone().sub(source);
  const length = Math.max(1, delta.length());
  const sideways = new Vector3(-delta.z, 0, delta.x).normalize();
  const midpoint = source.clone().lerp(target, 0.5);
  midpoint.addScaledVector(sideways, bias * Math.min(edge.crossDomain ? 55 : 22, length * 0.09));
  midpoint.y += Math.min(edge.crossDomain ? 92 : 34, length * (edge.crossDomain ? 0.12 : 0.045));
  const points: Vector3[] = [];
  for (let index = 0; index <= SEGMENTS; index += 1) {
    const t = index / SEGMENTS;
    const inverse = 1 - t;
    points.push(
      source.clone().multiplyScalar(inverse * inverse)
        .add(midpoint.clone().multiplyScalar(2 * inverse * t))
        .add(target.clone().multiplyScalar(t * t)),
    );
  }
  return points;
}

export interface EdgeField {
  lines: LineSegments;
  lineColors: BufferAttribute;
  baseColors: Float32Array;
  arrows: InstancedMesh;
  edgePoints: Vector3[][];
  segments: number;
}

export function buildEdgeField(
  edges: SemanticSpaceEdge[],
  positionById: Map<string, Vector3>,
  nodeById: Map<string, SemanticSpaceNode>,
): EdgeField {
  const positions = new Float32Array(edges.length * SEGMENTS * 2 * 3);
  const colors = new Float32Array(positions.length);
  const baseColors = new Float32Array(positions.length);
  const edgePoints: Vector3[][] = [];
  edges.forEach((edge, edgeIndex) => {
    const source = positionById.get(edge.sourceId)!;
    const target = positionById.get(edge.targetId)!;
    const points = curvedPoints(source, target, edge);
    edgePoints.push(points);
    const sourceColor = new Color(nodeById.get(edge.sourceId)?.color ?? "#78828a");
    const targetColor = new Color(nodeById.get(edge.targetId)?.color ?? "#78828a");
    const intensity = Math.min(0.16, 0.035 + Math.log1p(edge.weight) * 0.02);
    for (let segment = 0; segment < SEGMENTS; segment += 1) {
      const offset = (edgeIndex * SEGMENTS + segment) * 6;
      positions.set(points[segment].toArray(), offset);
      positions.set(points[segment + 1].toArray(), offset + 3);
      const start = sourceColor.clone().lerp(targetColor, segment / SEGMENTS);
      const end = sourceColor.clone().lerp(targetColor, (segment + 1) / SEGMENTS);
      baseColors.set([start.r, start.g, start.b, end.r, end.g, end.b], offset);
      colors.set([
        start.r * intensity,
        start.g * intensity,
        start.b * intensity,
        end.r * intensity,
        end.g * intensity,
        end.b * intensity,
      ], offset);
    }
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  const lineColors = new BufferAttribute(colors, 3);
  lineColors.setUsage(DynamicDrawUsage);
  geometry.setAttribute("color", lineColors);
  const lines = new LineSegments(geometry, new LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    blending: AdditiveBlending,
  }));
  lines.frustumCulled = false;
  const arrows = new InstancedMesh(
    new ConeGeometry(1, 3.6, 6),
    new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.92 }),
    12,
  );
  arrows.instanceMatrix.setUsage(DynamicDrawUsage);
  for (let index = 0; index < 12; index += 1) arrows.setColorAt(index, hidden);
  arrows.frustumCulled = false;
  return { lines, lineColors, baseColors, arrows, edgePoints, segments: SEGMENTS };
}

export function buildHaloField(nodes: SemanticSpaceNode[]) {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(nodes.length * 3);
  const colors = new Float32Array(nodes.length * 3);
  const sizes = new Float32Array(nodes.length);
  const alpha = new Float32Array(nodes.length);
  nodes.forEach((node, index) => {
    positions.set(node.position, index * 3);
    const color = new Color(node.color);
    const projectFrontier = node.domain === "Rocket"
      || node.domain === "Groot"
      || node.domain === "Intelligence Layer";
    colors.set([color.r, color.g, color.b], index * 3);
    sizes[index] = Math.min(projectFrontier ? 210 : 190, (projectFrontier ? 34 : 22) + node.radius * 5.8);
    alpha[index] = 0.58;
  });
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  const colorAttribute = new BufferAttribute(colors, 3);
  const alphaAttribute = new BufferAttribute(alpha, 1);
  colorAttribute.setUsage(DynamicDrawUsage);
  alphaAttribute.setUsage(DynamicDrawUsage);
  geometry.setAttribute("color", colorAttribute);
  geometry.setAttribute("aSize", new BufferAttribute(sizes, 1));
  geometry.setAttribute("aAlpha", alphaAttribute);
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexColors: true,
    blending: AdditiveBlending,
    vertexShader: `
      attribute float aSize;
      attribute float aAlpha;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vColor = color;
        vAlpha = aAlpha;
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(aSize * (560.0 / max(260.0, -view.z)), 10.0, 180.0);
        gl_Position = projectionMatrix * view;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float r = length(gl_PointCoord - vec2(0.5)) * 2.0;
        float aura = smoothstep(1.0, 0.0, r) * 0.22;
        float ring = 1.0 - smoothstep(0.025, 0.07, abs(r - 0.38));
        gl_FragColor = vec4(vColor, (aura + ring * 0.18) * vAlpha);
      }
    `,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  return { points, alpha: alphaAttribute, colors: colorAttribute };
}
