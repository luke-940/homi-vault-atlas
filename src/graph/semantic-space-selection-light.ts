import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  Points,
  ShaderMaterial,
} from "three";
import type {
  SemanticSpaceNode,
  SemanticSpaceScene,
} from "./semantic-space-contract";
import type { ActiveEdgeIndexes } from "./semantic-space-edge-painter";
import {
  applyNodeTransform,
  geometryFamily,
  nodeGeometry,
} from "./semantic-space-resources";

export interface SelectionLightField {
  points: Points<BufferGeometry, ShaderMaterial>;
  alpha: BufferAttribute;
  colors: BufferAttribute;
  buckets: EmissionBucket[];
  focusId: string | null;
}

interface EmissionBucket {
  family: string;
  mesh: InstancedMesh;
  nodes: SemanticSpaceNode[];
  indexById: Map<string, number>;
}

const stellarTones = {
  focus: "#fff4d2",
  incoming: "#bfe8ff",
  outgoing: "#ffd18a",
  bidirectional: "#eadcff",
} as const;
const transform = new Object3D();

export function selectionLightTone(weight: number) {
  if (weight >= 0.99) return stellarTones.focus;
  if (weight >= 0.9) return stellarTones.bidirectional;
  if (weight >= 0.82) return stellarTones.outgoing;
  return stellarTones.incoming;
}

export function selectionLightWeights(
  scene: SemanticSpaceScene,
  focusId: string | null,
  active: ActiveEdgeIndexes,
) {
  const weights = new Float32Array(scene.nodes.length);
  if (!focusId) return weights;
  const nodeIndex = new Map(scene.nodes.map((node, index) => [node.id, index]));
  const focusIndex = nodeIndex.get(focusId);
  if (focusIndex === undefined) return weights;
  weights[focusIndex] = 1;
  for (const edgeIndex of active.incoming) {
    const index = nodeIndex.get(scene.edges[edgeIndex]?.sourceId);
    if (index !== undefined) weights[index] = Math.max(weights[index], 0.78);
  }
  for (const edgeIndex of active.outgoing) {
    const index = nodeIndex.get(scene.edges[edgeIndex]?.targetId);
    if (index !== undefined) weights[index] = Math.max(weights[index] > 0 ? 0.94 : 0.84, weights[index]);
  }
  return weights;
}

export function buildSelectionLight(nodes: SemanticSpaceNode[]): SelectionLightField {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(nodes.length * 3);
  const colors = new Float32Array(nodes.length * 3);
  const sizes = new Float32Array(nodes.length);
  const alpha = new Float32Array(nodes.length);
  nodes.forEach((node, index) => {
    positions.set(node.position, index * 3);
    const color = new Color(node.color);
    colors.set([color.r, color.g, color.b], index * 3);
    sizes[index] = Math.min(176, 24 + node.radius * 5.8);
  });
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("aSize", new BufferAttribute(sizes, 1));
  const colorAttribute = new BufferAttribute(colors, 3);
  const alphaAttribute = new BufferAttribute(alpha, 1);
  colorAttribute.setUsage(DynamicDrawUsage);
  alphaAttribute.setUsage(DynamicDrawUsage);
  geometry.setAttribute("color", colorAttribute);
  geometry.setAttribute("aAlpha", alphaAttribute);
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    vertexColors: true,
    blending: AdditiveBlending,
    toneMapped: false,
    vertexShader: `
      attribute float aSize;
      attribute float aAlpha;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vColor = color;
        vAlpha = aAlpha;
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(aSize * (620.0 / max(260.0, -view.z)), 12.0, 150.0);
        gl_Position = projectionMatrix * view;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float radius = length(gl_PointCoord - vec2(0.5)) * 2.0;
        if (radius > 1.0) discard;
        float core = 1.0 - smoothstep(0.16, 0.31, radius);
        float photosphere = 1.0 - smoothstep(0.31, 0.57, radius);
        float corona = pow(max(0.0, 1.0 - radius), 2.6);
        float shell = 1.0 - smoothstep(0.035, 0.12, abs(radius - 0.52));
        float opacity = (core * 0.72 + photosphere * 0.22 + corona * 0.08 + shell * 0.035) * vAlpha;
        gl_FragColor = vec4(vColor, opacity);
      }
    `,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 3;
  const groups = new Map<string, SemanticSpaceNode[]>();
  for (const node of nodes) {
    const family = geometryFamily(node.kind);
    groups.set(family, [...(groups.get(family) ?? []), node]);
  }
  const buckets = [...groups].map(([family, familyNodes]) => {
    const mesh = new InstancedMesh(
      nodeGeometry(family),
      new MeshBasicMaterial({
        vertexColors: true,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
      }),
      Math.min(13, familyNodes.length),
    );
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    return {
      family,
      mesh,
      nodes: familyNodes,
      indexById: new Map(familyNodes.map((node, index) => [node.id, index])),
    };
  });
  return { points, alpha: alphaAttribute, colors: colorAttribute, buckets, focusId: null };
}

export function updateSelectionLight(
  field: SelectionLightField,
  scene: SemanticSpaceScene,
  focusId: string | null,
  active: ActiveEdgeIndexes,
) {
  if (field.focusId === focusId) return;
  field.focusId = focusId;
  const weights = selectionLightWeights(scene, focusId, active);
  const weightById = new Map(scene.nodes.map((node, index) => [node.id, weights[index]]));
  const alpha = field.alpha.array as Float32Array;
  const colors = field.colors.array as Float32Array;
  scene.nodes.forEach((node, index) => {
    const weight = weights[index];
    const color = new Color(selectionLightTone(weight));
    alpha[index] = weight;
    colors.set([color.r, color.g, color.b], index * 3);
  });
  field.alpha.needsUpdate = true;
  field.colors.needsUpdate = true;
  for (const bucket of field.buckets) {
    const activeNodes = bucket.nodes
      .filter((node) => (weightById.get(node.id) ?? 0) > 0)
      .sort((left, right) => (
        (weightById.get(right.id) ?? 0) - (weightById.get(left.id) ?? 0)
        || left.id.localeCompare(right.id, "en")
      ))
      .slice(0, 13);
    activeNodes.forEach((node, slot) => {
      const weight = weightById.get(node.id) ?? 0;
      applyNodeTransform(
        transform,
        node,
        bucket.family,
        bucket.indexById.get(node.id) ?? 0,
        weight === 1 ? 1.12 : 1.08,
      );
      bucket.mesh.setMatrixAt(slot, transform.matrix);
      bucket.mesh.setColorAt(slot, new Color(selectionLightTone(weight)));
    });
    bucket.mesh.count = activeNodes.length;
    bucket.mesh.instanceMatrix.needsUpdate = true;
    if (bucket.mesh.instanceColor) bucket.mesh.instanceColor.needsUpdate = true;
  }
}

export function disposeSelectionLight(field: SelectionLightField) {
  field.points.geometry.dispose();
  field.points.material.dispose();
  for (const bucket of field.buckets) {
    bucket.mesh.geometry.dispose();
    const materials = Array.isArray(bucket.mesh.material) ? bucket.mesh.material : [bucket.mesh.material];
    materials.forEach((material) => material.dispose());
  }
}
