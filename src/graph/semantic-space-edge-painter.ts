import {
  Color,
  Matrix4,
  Object3D,
  Quaternion,
  Vector3,
} from "three";
import type {
  SemanticSpaceNode,
  SemanticSpaceScene,
} from "./semantic-space-contract";
import type { EdgeField } from "./semantic-space-resources";

export type ActiveEdgeIndexes = { incoming: number[]; outgoing: number[] };

const amber = new Color("#f2b35f");
const incomingLight = new Color("#8fc9e8");
const hidden = new Color("#050507");
const up = new Vector3(0, 1, 0);
const tempObject = new Object3D();
const tempQuaternion = new Quaternion();
const tempMatrix = new Matrix4();

function updateArrows(
  field: EdgeField,
  scene: SemanticSpaceScene,
  active: ActiveEdgeIndexes,
  traceProgress: number,
) {
  const outgoing = new Set(active.outgoing);
  const selected = [...active.incoming, ...active.outgoing];
  for (let slot = 0; slot < 12; slot += 1) {
    const edgeIndex = selected[slot];
    if (edgeIndex === undefined || traceProgress < 0.94) {
      field.arrows.setColorAt(slot, hidden);
      tempObject.position.set(0, -10_000, 0);
      tempObject.scale.setScalar(0.001);
      tempObject.updateMatrix();
      field.arrows.setMatrixAt(slot, tempObject.matrix);
      continue;
    }
    const points = field.edgePoints[edgeIndex];
    const end = points.at(-1)!;
    const before = points.at(-2)!;
    tempQuaternion.setFromUnitVectors(up, end.clone().sub(before).normalize());
    const scale = Math.min(3.8, 1.25 + Math.sqrt(scene.edges[edgeIndex].weight) * 0.34);
    tempMatrix.compose(end, tempQuaternion, new Vector3(scale, scale, scale));
    field.arrows.setMatrixAt(slot, tempMatrix);
    field.arrows.setColorAt(slot, outgoing.has(edgeIndex) ? amber : incomingLight);
  }
  field.arrows.instanceMatrix.needsUpdate = true;
  if (field.arrows.instanceColor) field.arrows.instanceColor.needsUpdate = true;
}

export function paintEdges({
  field,
  scene,
  nodeById,
  active,
  activeId,
  activeDomain,
  traceProgress,
}: {
  field: EdgeField;
  scene: SemanticSpaceScene;
  nodeById: Map<string, SemanticSpaceNode>;
  active: ActiveEdgeIndexes;
  activeId: string | null;
  activeDomain: string | null;
  traceProgress: number;
}) {
  const incoming = new Set(active.incoming);
  const outgoing = new Set(active.outgoing);
  const selected = new Set([...incoming, ...outgoing]);
  const colors = field.lineColors.array as Float32Array;
  scene.edges.forEach((edge, edgeIndex) => {
    const source = nodeById.get(edge.sourceId)!;
    const target = nodeById.get(edge.targetId)!;
    const isSelected = selected.has(edgeIndex);
    const directionColor = outgoing.has(edgeIndex) ? amber : incomingLight;
    const sourceActive = (!scene.activeDomains.length || scene.activeDomains.includes(source.domain))
      && (!scene.activeKinds.length || scene.activeKinds.includes(source.kind));
    const targetActive = (!scene.activeDomains.length || scene.activeDomains.includes(target.domain))
      && (!scene.activeKinds.length || scene.activeKinds.includes(target.kind));
    const filterActive = sourceActive || targetActive;
    const sharesFocusDomain = activeDomain === source.domain || activeDomain === target.domain;
    const intensity = activeId
      ? isSelected ? 1.05 : sharesFocusDomain ? 0.075 : 0.042
      : filterActive
        ? Math.min(
          scene.activeDomains.length || scene.activeKinds.length ? 0.24 : 0.16,
          (scene.activeDomains.length || scene.activeKinds.length ? 0.055 : 0.035)
            + Math.log1p(edge.weight) * 0.024,
        )
        : 0.012;
    for (let segment = 0; segment < field.segments; segment += 1) {
      const offset = (edgeIndex * field.segments + segment) * 6;
      const reveal = isSelected
        ? Math.max(0, Math.min(1, traceProgress * field.segments - segment))
        : 1;
      for (let component = 0; component < 6; component += 1) {
        const selectedComponent = component % 3 === 0
          ? directionColor.r
          : component % 3 === 1 ? directionColor.g : directionColor.b;
        colors[offset + component] = isSelected
          ? selectedComponent * intensity * reveal
          : field.baseColors[offset + component] * intensity;
      }
    }
  });
  field.lineColors.needsUpdate = true;
  updateArrows(field, scene, active, traceProgress);
}

export function paintTrace(
  field: EdgeField,
  scene: SemanticSpaceScene,
  active: ActiveEdgeIndexes,
  progress: number,
) {
  const incoming = new Set(active.incoming);
  const selected = [...active.incoming, ...active.outgoing];
  const colors = field.lineColors.array as Float32Array;
  for (const edgeIndex of selected) {
    const directionColor = incoming.has(edgeIndex) ? incomingLight : amber;
    for (let segment = 0; segment < field.segments; segment += 1) {
      const offset = (edgeIndex * field.segments + segment) * 6;
      const reveal = Math.max(0, Math.min(1, progress * field.segments - segment));
      for (let component = 0; component < 6; component += 1) {
        const selectedComponent = component % 3 === 0
          ? directionColor.r
          : component % 3 === 1 ? directionColor.g : directionColor.b;
        colors[offset + component] = selectedComponent * 1.05 * reveal;
      }
    }
  }
  field.lineColors.needsUpdate = true;
  updateArrows(field, scene, active, progress);
}
