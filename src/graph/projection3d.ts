import type { AtlasGraphCoordinateV1, AtlasGraphV1 } from "../types";

export interface Camera3D {
  yaw: number;
  pitch: number;
  zoom: number;
  panX: number;
  panY: number;
  focusX: number;
  focusY: number;
  focusZ: number;
}

export interface ProjectedPoint {
  x: number;
  y: number;
  depth: number;
  scale: number;
  visible: boolean;
}

export function defaultCamera(
  graph: AtlasGraphV1,
  presentation: "home" | "workspace" = "workspace",
  mobile = false,
): Camera3D {
  if (mobile) {
    return {
      yaw: -0.14,
      pitch: 0.1,
      zoom: 0.82,
      panX: 0,
      panY: -8,
      focusX: graph.layout.bounds.width / 2,
      focusY: graph.layout.bounds.height / 2,
      focusZ: graph.layout.bounds.depth / 2,
    };
  }
  return {
    yaw: presentation === "home" ? -0.44 : -0.3,
    pitch: presentation === "home" ? 0.24 : 0.18,
    zoom: presentation === "home" ? 1.12 : 1.08,
    panX: presentation === "home" ? -20 : -45,
    panY: presentation === "home" ? -4 : -20,
    focusX: presentation === "home" ? graph.layout.bounds.width * 0.4375 : graph.layout.bounds.width / 2,
    focusY: presentation === "home" ? graph.layout.bounds.height * 0.486 : graph.layout.bounds.height / 2,
    focusZ: presentation === "home" ? graph.layout.bounds.depth * 0.469 : graph.layout.bounds.depth / 2,
  };
}

export function clampCamera(camera: Camera3D): Camera3D {
  return {
    ...camera,
    yaw: Math.max(-1.08, Math.min(1.08, camera.yaw)),
    pitch: Math.max(-0.18, Math.min(0.72, camera.pitch)),
    zoom: Math.max(0.62, Math.min(1.72, camera.zoom)),
    panX: Math.max(-420, Math.min(420, camera.panX)),
    panY: Math.max(-280, Math.min(280, camera.panY)),
  };
}

export function projectCoordinate(
  coordinate: Pick<AtlasGraphCoordinateV1, "x" | "y" | "z">,
  camera: Camera3D,
  viewport: { width: number; height: number },
  presentation: "home" | "workspace" = "workspace",
): ProjectedPoint {
  const wx = coordinate.x - camera.focusX;
  const wy = camera.focusY - coordinate.y;
  const wz = coordinate.z - camera.focusZ;

  const cosYaw = Math.cos(camera.yaw);
  const sinYaw = Math.sin(camera.yaw);
  const yawX = wx * cosYaw - wz * sinYaw;
  const yawZ = wx * sinYaw + wz * cosYaw;

  const cosPitch = Math.cos(camera.pitch);
  const sinPitch = Math.sin(camera.pitch);
  const pitchY = wy * cosPitch - yawZ * sinPitch;
  const depth = wy * sinPitch + yawZ * cosPitch;

  // A tall browser pane must not magnify the field just because its short edge
  // grew. Cap the lens so portrait/tablet layouts retain the whole terrain.
  // Let the authored Home field grow with a desktop canvas instead of keeping
  // the same small projection inside progressively larger empty space. Mobile
  // remains governed by the short edge, so its bounded sibling is unchanged.
  const lensCap = presentation === "home" ? 1_040 : 1_040;
  const focalLength = Math.max(420, Math.min(lensCap, Math.min(viewport.width, viewport.height) * 1.32)) * camera.zoom;
  const cameraDistance = presentation === "home" ? 1_120 : 1_420;
  const denominator = Math.max(presentation === "home" ? 280 : 320, cameraDistance - depth);
  const scale = focalLength / denominator;
  const fieldShift = 0;
  const x = viewport.width / 2 + fieldShift + camera.panX + yawX * scale;
  const y = viewport.height / 2 + camera.panY - pitchY * scale;
  return {
    x,
    y,
    depth,
    scale,
    visible: denominator > (presentation === "home" ? 280 : 320) && x > -180 && x < viewport.width + 180 && y > -180 && y < viewport.height + 180,
  };
}

export function cameraForSelection(camera: Camera3D, coordinate: AtlasGraphCoordinateV1): Camera3D {
  return clampCamera({
    ...camera,
    focusX: camera.focusX + (coordinate.x - camera.focusX) * 0.52,
    focusY: camera.focusY + (coordinate.y - camera.focusY) * 0.52,
    focusZ: camera.focusZ + (coordinate.z - camera.focusZ) * 0.52,
    zoom: Math.max(camera.zoom, 1.16),
    panX: camera.panX * 0.35,
    panY: camera.panY * 0.35,
  });
}

export function interpolateCamera(from: Camera3D, to: Camera3D, progress: number): Camera3D {
  const eased = 1 - Math.pow(1 - Math.max(0, Math.min(1, progress)), 3);
  const mix = (left: number, right: number) => left + (right - left) * eased;
  return {
    yaw: mix(from.yaw, to.yaw),
    pitch: mix(from.pitch, to.pitch),
    zoom: mix(from.zoom, to.zoom),
    panX: mix(from.panX, to.panX),
    panY: mix(from.panY, to.panY),
    focusX: mix(from.focusX, to.focusX),
    focusY: mix(from.focusY, to.focusY),
    focusZ: mix(from.focusZ, to.focusZ),
  };
}
