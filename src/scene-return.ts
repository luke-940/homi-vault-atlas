import type { CameraSnapshot, SceneState } from "./world";

type SceneId = SceneState["sceneId"];
export interface SceneHistory {
  sceneState?: SceneState;
  camera?: CameraSnapshot;
}
export type SceneReturn =
  | { kind: "none" | "retain" }
  | { kind: "navigate"; sceneId: SceneId }
  | { kind: "camera"; sceneId: SceneId; camera: CameraSnapshot };

/** The requested scene and the last successfully rendered camera can differ. */
export function captureSceneHistory(state: SceneState, camera: CameraSnapshot): SceneHistory {
  return {
    sceneState: { ...state },
    camera: state.stage === "ready" && state.sceneId === camera.sceneId ? camera : undefined,
  };
}

export function resolveSceneReturn(
  routeScene: SceneId | undefined,
  restoring: boolean,
  saved: SceneHistory | undefined,
  current: SceneState,
): SceneReturn {
  const sceneId = routeScene ?? (restoring ? saved?.sceneState?.sceneId ?? saved?.camera?.sceneId : undefined);
  if (!sceneId) return { kind: "none" };
  const camera = restoring && saved?.camera?.sceneId === sceneId ? saved.camera : undefined;
  if (restoring && current.sceneId === sceneId && current.stage !== "ready") {
    // A matching camera may be queued until this existing load completes.
    // An error remains an error until an explicit retry or a different route.
    return camera && current.stage === "loading"
      ? { kind: "camera", sceneId, camera }
      : { kind: "retain" };
  }
  return camera ? { kind: "camera", sceneId, camera } : { kind: "navigate", sceneId };
}
