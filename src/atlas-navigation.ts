import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectId } from "./content";
import type { CameraSnapshot, SceneState } from "./world";

export type AuxiliaryModal = "search" | "help" | "reading-help" | "places" | null;
export interface UISnapshot {
  camera?: CameraSnapshot;
  sceneState?: SceneState;
  selectedIsland?: ProjectId;
  selectedPlaceId?: string;
  selectedContentId?: string;
  modal?: AuxiliaryModal;
  search: string;
  filter: ProjectId | "all";
  readerScroll: number;
  searchScroll: number;
  mapScroll: number;
  mapTreeScroll?: number;
  mapDetailScroll?: number;
  mapExpanded: string[];
  mapPlaceId?: string;
  focusKey?: string;
  focusHref?: string;
  focusHrefIndex?: number;
}
export interface AtlasHistoryEntry {
  atlas81: true;
  key: string;
  route: string;
  canBack: boolean;
  ui?: UISnapshot;
}
const routeNow = () => location.hash.slice(1) || "/world";
const key = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const projectIds = new Set(["world", "rocket", "groot", "common", "atlas"]);

/** History is a UI restoration aid, never a source of content or camera authority. */
function readEntry(): AtlasHistoryEntry {
  const raw = history.state as Partial<AtlasHistoryEntry> | null;
  if (raw?.atlas81 && raw.route === routeNow() && typeof raw.key === "string") {
    const ui = raw.ui;
    const camera = ui?.camera;
    if (camera && (!projectIds.has(camera.sceneId) ||
      ![camera.position, camera.target].every(v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite)) ||
      !Number.isFinite(camera.zoom))) delete ui.camera;
    if (ui?.sceneState && (!projectIds.has(ui.sceneState.sceneId) ||
      !["loading", "ready", "error"].includes(ui.sceneState.stage))) delete ui.sceneState;
    return raw as AtlasHistoryEntry;
  }
  const entry: AtlasHistoryEntry = { atlas81: true, key: key(), route: routeNow(), canBack: false };
  history.replaceState(entry, "", location.href);
  return entry;
}

export function useAtlasNavigation(capture: () => UISnapshot) {
  const captureRef = useRef(capture);
  captureRef.current = capture;
  const [navigation, setNavigation] = useState(() => { const entry = readEntry(); return { entry, restoring: Boolean(entry.ui) }; });
  useEffect(() => {
    const restore = () => {
      const entry = readEntry();
      setNavigation(old => old.entry.key === entry.key && old.entry.route === entry.route
        ? old : { entry, restoring: true });
    };
    addEventListener("popstate", restore);
    addEventListener("hashchange", restore);
    return () => {
      removeEventListener("popstate", restore);
      removeEventListener("hashchange", restore);
    };
  }, []);
  const save = useCallback(() => {
    const current = readEntry();
    const ui = captureRef.current();
    const entry = { ...current, ui };
    history.replaceState(entry, "", location.href);
    return entry;
  }, []);
  useEffect(() => {
    const persist = () => { save(); };
    addEventListener("pagehide", persist);
    addEventListener("beforeunload", persist);
    return () => { removeEventListener("pagehide", persist); removeEventListener("beforeunload", persist); };
  }, [save]);
  const go = useCallback((route: string, options: { replace?: boolean; modal?: AuxiliaryModal } = {}) => {
    const previous = save();
    const entry: AtlasHistoryEntry = {
      atlas81: true, key: key(), route, canBack: options.replace ? previous.canBack : true,
      ui: { ...previous.ui!, modal: options.modal ?? null },
    };
    history[options.replace ? "replaceState" : "pushState"](entry, "", `#${route}`);
    setNavigation({ entry, restoring: false });
  }, [save]);
  const close = useCallback((fallback = "/world") => {
    save();
    if (readEntry().canBack) history.back();
    else go(fallback, { replace: true });
  }, [go, save]);
  return { ...navigation, route: navigation.entry.route, go, close, save };
}
