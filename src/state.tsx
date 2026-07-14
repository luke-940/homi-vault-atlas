import {
  createContext,
  type Dispatch,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import { atlasData, DEFAULT_DAILY_ROUTE_ID } from "./data";
import type { ExploreLens, MatrixCell, RelationLayer, Workspace } from "./types";

export type PanelState = "none" | "navigator" | "inspector" | "data";
export type InspectorTab = "summary" | "relations" | "proof" | "history";
export type RelationDirection = "forward" | "reverse";

export interface SceneSnapshot {
  workspace: Workspace;
  sceneId: string;
  focusId: string;
  lens: ExploreLens;
  relationPairId: string | null;
  relationDirection: RelationDirection | null;
  relationLayer: RelationLayer;
  routeId: string;
  eraId: number;
}

export interface AtlasState {
  workspace: Workspace;
  sceneId: string;
  lens: ExploreLens;
  focusId: string;
  previewId: string | null;
  compareIds: string[];
  relationPairId: string | null;
  relationDirection: RelationDirection | null;
  relationLayer: RelationLayer;
  routeId: string;
  eraId: number;
  guideStep: number | null;
  filters: string[];
  camera: string | null;
  fallbackReason: string | null;
  previousScene: SceneSnapshot | null;
  panel: PanelState;
  inspectorTab: InspectorTab;
  searchOpen: boolean;
  theatre: boolean;
  reducedMotion: boolean;
  mobileSibling: boolean;
}

export type Action =
  | { type: "workspace"; workspace: Workspace }
  | { type: "journey"; target: Partial<SceneSnapshot>; fallbackReason?: string | null }
  | { type: "back" }
  | { type: "lens"; lens: ExploreLens }
  | { type: "focus"; focusId: string; openInspector?: boolean }
  | { type: "preview"; focusId: string | null }
  | { type: "compare"; focusId: string }
  | { type: "clearCompare" }
  | { type: "relationPair"; relationPairId: string | null; direction?: RelationDirection | null }
  | { type: "relationLayer"; relationLayer: RelationLayer }
  | { type: "route"; routeId: string }
  | { type: "era"; eraId: number }
  | { type: "guide"; step: number | null }
  | { type: "filters"; filters: string[] }
  | { type: "camera"; camera: string | null }
  | { type: "panel"; panel: PanelState }
  | { type: "panelSet"; panel: PanelState }
  | { type: "inspectorTab"; inspectorTab: InspectorTab }
  | { type: "search"; open: boolean }
  | { type: "theatre"; open: boolean }
  | { type: "reducedMotion"; reducedMotion: boolean }
  | { type: "responsive"; mobileSibling: boolean }
  | { type: "hydrate"; state: AtlasState };

export interface ResponsiveEnvironment {
  mobileSibling: boolean;
  reducedMotion: boolean;
}

const createDefaultState = (environment: ResponsiveEnvironment): AtlasState => ({
  workspace: "home",
  sceneId: "pulse-gateway",
  lens: "city",
  focusId: atlasData.bootstrap.defaultFocus,
  previewId: null,
  compareIds: [],
  relationPairId: null,
  relationDirection: null,
  relationLayer: "wikilink",
  routeId: DEFAULT_DAILY_ROUTE_ID,
  eraId: atlasData.temporal.currentEra,
  guideStep: null,
  filters: [],
  camera: null,
  fallbackReason: null,
  previousScene: null,
  panel: "none",
  inspectorTab: "summary",
  searchOpen: false,
  theatre: false,
  reducedMotion: environment.reducedMotion,
  mobileSibling: environment.mobileSibling,
});

const workspaces = new Set<Workspace>(["home", "explore", "observe", "flow", "time"]);
const lenses = new Set<ExploreLens>(["city", "lineage", "constellation"]);
const layers = new Set<RelationLayer>(["wikilink", "typed", "route"]);
const availableLayers = new Set<RelationLayer>(atlasData.relation.availableLayers);
const directions = new Set<RelationDirection>(["forward", "reverse"]);
const focusIds = new Set([
  ...atlasData.entity.entities.map((entity) => entity.id),
  ...atlasData.structure.hierarchyNodes.map((node) => node.id),
]);
const relationPairIds = new Set(atlasData.relation.matrix.map((pair) => pair.id));
const routeIds = new Set(atlasData.flow.routes.map((route) => route.id));
const eraIds = new Set(atlasData.temporal.eras.map((era) => era.id));
export const mobileSiblingQuery = "(max-width: 820px), (max-height: 520px) and (pointer: coarse)";

export function dominantTypedDirection(
  pair: Pick<MatrixCell, "typedForward" | "typedReverse"> | undefined,
): RelationDirection | null {
  if (!pair || (pair.typedForward <= 0 && pair.typedReverse <= 0)) return null;
  return pair.typedReverse > pair.typedForward ? "reverse" : "forward";
}

function normalizedTypedDirection(
  pair: MatrixCell | undefined,
  requested: RelationDirection | null | undefined,
): RelationDirection | null {
  if (!pair) return null;
  if (requested === "forward" && pair.typedForward > 0) return requested;
  if (requested === "reverse" && pair.typedReverse > 0) return requested;
  return dominantTypedDirection(pair);
}

export function createAtlasState(hash: string, environment: ResponsiveEnvironment): AtlasState {
  const defaultState = createDefaultState(environment);
  const raw = hash.replace(/^#/, "");
  const [workspacePart, query = ""] = raw.split("?");
  const params = new URLSearchParams(query);
  const workspace = workspaces.has(workspacePart as Workspace)
    ? (workspacePart as Workspace)
    : defaultState.workspace;
  const lensParam = params.get("lens") as ExploreLens | null;
  const layerParam = params.get("layer") as RelationLayer | null;
  const directionParam = params.get("dir") as RelationDirection | null;
  const panelParam = params.get("panel") as PanelState | null;
  const requestedFocus = params.get("focus");
  const requestedPair = params.get("pair");
  const requestedRoute = params.get("route");
  const requestedEra = Number(params.get("era"));
  const guideParam = params.get("guide");
  const requestedGuide = guideParam === null ? Number.NaN : Number(guideParam);
  const rawCompare = (params.get("compare") ?? "").split(",").filter(Boolean);
  const requestedCompare = rawCompare.filter((id) => focusIds.has(id)).slice(0, 2);
  const relationLayer = layerParam && layers.has(layerParam) && availableLayers.has(layerParam)
    ? layerParam
    : defaultState.relationLayer;
  const relationPair = requestedPair && relationPairIds.has(requestedPair)
    ? atlasData.relation.matrix.find((pair) => pair.id === requestedPair)
    : undefined;
  const fallbackReasons = [
    workspacePart && !workspaces.has(workspacePart as Workspace)
      ? `요청한 화면 ${workspacePart}를 찾지 못해 대문을 열었습니다.`
      : null,
    lensParam && !lenses.has(lensParam)
      ? `요청한 지도 표현 ${lensParam}을 찾지 못해 기본 지도를 열었습니다.`
      : null,
    layerParam && (!layers.has(layerParam) || !availableLayers.has(layerParam))
      ? `요청한 관계층 ${layerParam}은 이 공개 범위에서 제공되지 않아 링크 출현 층을 열었습니다.`
      : null,
    directionParam && !directions.has(directionParam)
      ? `요청한 관계 방향 ${directionParam}을 해석하지 못했습니다.`
      : null,
    panelParam && !["none", "navigator", "inspector", "data"].includes(panelParam)
      ? `요청한 패널 ${panelParam}을 찾지 못해 기본 패널 상태를 사용했습니다.`
      : null,
    guideParam !== null && !(Number.isInteger(requestedGuide) && requestedGuide >= 0 && requestedGuide <= 2)
      ? `요청한 가이드 단계 ${guideParam}을 찾지 못해 가이드를 닫았습니다.`
      : null,
    ...rawCompare
      .filter((id) => !focusIds.has(id))
      .map((id) => `비교할 객체 ${id}를 현재 스냅샷에서 찾지 못했습니다.`),
    requestedFocus && !focusIds.has(requestedFocus)
      ? `요청한 객체 ${requestedFocus}를 현재 스냅샷에서 찾지 못해 기본 선택을 열었습니다.`
      : null,
    requestedPair && !relationPairIds.has(requestedPair)
      ? `요청한 관계 ${requestedPair}를 현재 스냅샷에서 찾지 못했습니다.`
      : null,
    requestedRoute && !routeIds.has(requestedRoute)
      ? `요청한 흐름 ${requestedRoute}를 현재 스냅샷에서 찾지 못했습니다.`
      : null,
    params.has("era") && !eraIds.has(requestedEra)
      ? `요청한 시대 ${params.get("era")}를 현재 스냅샷에서 찾지 못했습니다.`
      : null,
  ].filter(Boolean);
  return {
    ...defaultState,
    workspace,
    sceneId: params.get("scene") || (workspace === "home" ? "pulse-gateway" : workspace),
    lens: lensParam && lenses.has(lensParam) ? lensParam : defaultState.lens,
    focusId: requestedFocus && focusIds.has(requestedFocus) ? requestedFocus : defaultState.focusId,
    compareIds: requestedCompare,
    relationPairId: relationPair?.id ?? null,
    relationDirection:
      relationLayer === "typed"
        ? normalizedTypedDirection(
            relationPair,
            directionParam && directions.has(directionParam) ? directionParam : null,
          )
        : null,
    relationLayer,
    routeId: requestedRoute && routeIds.has(requestedRoute) ? requestedRoute : defaultState.routeId,
    eraId: eraIds.has(requestedEra) ? requestedEra : defaultState.eraId,
    guideStep: Number.isInteger(requestedGuide) && requestedGuide >= 0 && requestedGuide <= 2 ? requestedGuide : null,
    filters: (params.get("filters") ?? "").split(",").map((value) => value.trim()).filter(Boolean).slice(0, 12),
    camera: params.get("cam") || null,
    panel:
      panelParam && ["none", "navigator", "inspector", "data"].includes(panelParam)
        ? panelParam
        : workspace === "home" || environment.mobileSibling
          ? "none"
          : "inspector",
    theatre: params.get("theatre") === "1",
    searchOpen: false,
    fallbackReason: fallbackReasons.join(" ") || null,
    reducedMotion: environment.reducedMotion,
    mobileSibling: environment.mobileSibling,
  };
}

export function stateToHash(state: AtlasState) {
  const params = new URLSearchParams();
  params.set("focus", state.focusId);
  if (state.sceneId) params.set("scene", state.sceneId);
  if (state.workspace === "explore") params.set("lens", state.lens);
  if (state.workspace === "observe") {
    params.set("layer", state.relationLayer);
    if (state.relationPairId) params.set("pair", state.relationPairId);
    if (state.relationLayer === "typed" && state.relationDirection) params.set("dir", state.relationDirection);
  }
  if (state.workspace === "flow") params.set("route", state.routeId);
  if (state.workspace === "time") params.set("era", String(state.eraId));
  if (state.compareIds.length) params.set("compare", state.compareIds.join(","));
  if (state.guideStep !== null) params.set("guide", String(state.guideStep));
  if (state.filters.length) params.set("filters", state.filters.join(","));
  if (state.camera) params.set("cam", state.camera);
  const expectedPanel = state.workspace === "home" ? "none" : "inspector";
  if (state.panel !== expectedPanel) params.set("panel", state.panel);
  if (state.theatre) params.set("theatre", "1");
  return `#${state.workspace}?${params.toString()}`;
}

function semanticNavigationKey(state: AtlasState) {
  return JSON.stringify({
    workspace: state.workspace,
    sceneId: state.sceneId,
    lens: state.lens,
    focusId: state.focusId,
    relationPairId: state.relationPairId,
    relationDirection: state.relationDirection,
    relationLayer: state.relationLayer,
    routeId: state.routeId,
    eraId: state.eraId,
    compareIds: state.compareIds,
    filters: state.filters,
  });
}

function captureScene(state: AtlasState): SceneSnapshot {
  return {
    workspace: state.workspace,
    sceneId: state.sceneId,
    focusId: state.focusId,
    lens: state.lens,
    relationPairId: state.relationPairId,
    relationDirection: state.relationDirection,
    relationLayer: state.relationLayer,
    routeId: state.routeId,
    eraId: state.eraId,
  };
}

export function reduceAtlasState(state: AtlasState, action: Action): AtlasState {
  switch (action.type) {
    case "workspace":
      return {
        ...state,
        previousScene: captureScene(state),
        workspace: action.workspace,
        sceneId: action.workspace === "home" ? "pulse-gateway" : action.workspace,
        panel: action.workspace === "home" || state.mobileSibling ? "none" : "inspector",
        guideStep: action.workspace === "home" ? state.guideStep : null,
        fallbackReason: null,
      };
    case "journey": {
      const requestedFocus = action.target.focusId;
      const validFocus = requestedFocus ? focusIds.has(requestedFocus) : true;
      const requestedPair = action.target.relationPairId;
      const validPair = requestedPair ? relationPairIds.has(requestedPair) : true;
      const targetWorkspace = action.target.workspace ?? state.workspace;
      const pairWasRequested = Object.prototype.hasOwnProperty.call(action.target, "relationPairId");
      const targetPair = validPair
        ? pairWasRequested
          ? requestedPair ?? null
          : targetWorkspace === "observe" && requestedFocus
            ? null
            : state.relationPairId
        : state.relationPairId;
      const pair = targetPair ? atlasData.relation.matrix.find((candidate) => candidate.id === targetPair) : undefined;
      const requestedLayer = action.target.relationLayer;
      const validLayer = requestedLayer ? availableLayers.has(requestedLayer) : true;
      const targetLayer = validLayer && requestedLayer ? requestedLayer : state.relationLayer;
      return {
        ...state,
        previousScene: captureScene(state),
        workspace: targetWorkspace,
        sceneId: action.target.sceneId ?? action.target.workspace ?? state.sceneId,
        focusId: validFocus && requestedFocus ? requestedFocus : state.focusId,
        lens: action.target.lens ?? state.lens,
        relationPairId: targetPair ?? null,
        relationLayer: targetLayer,
        relationDirection: targetLayer === "typed" ? normalizedTypedDirection(pair, action.target.relationDirection) : null,
        routeId: action.target.routeId && routeIds.has(action.target.routeId) ? action.target.routeId : state.routeId,
        eraId: action.target.eraId && eraIds.has(action.target.eraId) ? action.target.eraId : state.eraId,
        panel: targetWorkspace === "home" || state.mobileSibling ? "none" : "inspector",
        inspectorTab: "summary",
        guideStep: targetWorkspace === "home" ? state.guideStep : null,
        fallbackReason: !validFocus
          ? `요청한 객체 ${requestedFocus}를 현재 스냅샷에서 찾지 못해 이전 선택을 유지했습니다.`
          : !validPair
            ? `요청한 관계 ${requestedPair}를 현재 스냅샷에서 찾지 못해 이전 관계를 유지했습니다.`
            : !validLayer
              ? `요청한 관계층 ${requestedLayer}은 이 범위에서 제공되지 않아 현재 관계층을 유지했습니다.`
              : action.fallbackReason ?? null,
      };
    }
    case "back":
      return state.previousScene
        ? {
            ...state,
            ...state.previousScene,
            previousScene: null,
            panel: state.previousScene.workspace === "home" || state.mobileSibling ? "none" : "inspector",
            fallbackReason: null,
          }
        : state;
    case "lens":
      return { ...state, lens: action.lens };
    case "focus":
      return {
        ...state,
        focusId: action.focusId,
        panel: action.openInspector === false || state.mobileSibling ? state.panel : "inspector",
        inspectorTab: "summary",
      };
    case "preview":
      return { ...state, previewId: action.focusId };
    case "compare": {
      if (!focusIds.has(action.focusId)) {
        return { ...state, fallbackReason: `비교할 객체 ${action.focusId}를 현재 스냅샷에서 찾지 못했습니다.` };
      }
      const compareIds = state.compareIds.includes(action.focusId)
        ? state.compareIds.filter((id) => id !== action.focusId)
        : [...state.compareIds, action.focusId].slice(-2);
      return { ...state, compareIds, fallbackReason: null };
    }
    case "clearCompare":
      return { ...state, compareIds: [] };
    case "relationPair": {
      const pair = action.relationPairId
        ? atlasData.relation.matrix.find((candidate) => candidate.id === action.relationPairId)
        : undefined;
      return {
        ...state,
        relationPairId: pair?.id ?? null,
        relationDirection: state.relationLayer === "typed"
          ? normalizedTypedDirection(pair, action.direction)
          : null,
        panel: state.mobileSibling ? "none" : "inspector",
      };
    }
    case "relationLayer": {
      if (!availableLayers.has(action.relationLayer)) {
        return {
          ...state,
          fallbackReason: `요청한 관계층 ${action.relationLayer}은 이 범위에서 제공되지 않습니다.`,
        };
      }
      const selectedPair = state.relationPairId
        ? atlasData.relation.matrix.find((pair) => pair.id === state.relationPairId)
        : undefined;
      return {
        ...state,
        relationLayer: action.relationLayer,
        relationDirection: action.relationLayer === "typed"
          ? normalizedTypedDirection(selectedPair, state.relationDirection)
          : null,
      };
    }
    case "route":
      return { ...state, routeId: action.routeId, panel: state.mobileSibling ? "none" : "inspector" };
    case "era":
      return { ...state, eraId: action.eraId, panel: state.mobileSibling ? "none" : "inspector" };
    case "guide":
      return { ...state, guideStep: action.step };
    case "filters":
      return { ...state, filters: [...new Set(action.filters)].slice(0, 12) };
    case "camera":
      return { ...state, camera: action.camera };
    case "panel":
      return { ...state, panel: state.panel === action.panel ? "none" : action.panel };
    case "panelSet":
      return { ...state, panel: action.panel };
    case "inspectorTab":
      return { ...state, inspectorTab: action.inspectorTab, panel: "inspector" };
    case "search":
      return { ...state, searchOpen: action.open };
    case "theatre":
      return { ...state, theatre: action.open, panel: action.open || state.mobileSibling ? "none" : "inspector" };
    case "reducedMotion":
      return { ...state, reducedMotion: action.reducedMotion };
    case "responsive":
      return {
        ...state,
        mobileSibling: action.mobileSibling,
        panel: action.mobileSibling && state.panel === "inspector" ? "none" : state.panel,
      };
    case "hydrate":
      return action.state;
    default:
      return state;
  }
}

const AtlasStateContext = createContext<
  { state: AtlasState; dispatch: Dispatch<Action> } | undefined
>(undefined);

export function AtlasStateProvider({ children }: PropsWithChildren) {
  const readEnvironment = (): ResponsiveEnvironment => ({
    mobileSibling: window.matchMedia(mobileSiblingQuery).matches,
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  });
  const [state, dispatch] = useReducer(
    reduceAtlasState,
    undefined,
    () => createAtlasState(window.location.hash, readEnvironment()),
  );
  const restoringHistoryRef = useRef(false);
  const previousNavigationKeyRef = useRef<string | null>(null);
  const observedLocationRef = useRef(window.location.href);

  useEffect(() => {
    if (state.workspace !== "home" || state.guideStep !== null) return;
    try {
      if (window.localStorage.getItem("homi-atlas-v7-1-guide-seen") !== "1") {
        dispatch({ type: "guide", step: 0 });
      }
    } catch {
      // The guide remains manually available when storage is unavailable.
    }
  }, []);

  useEffect(() => {
    const nextHash = stateToHash(state);
    const nextNavigationKey = semanticNavigationKey(state);
    if (window.location.hash !== nextHash) {
      if (!restoringHistoryRef.current
        && previousNavigationKeyRef.current !== null
        && previousNavigationKeyRef.current !== nextNavigationKey) {
        history.pushState(null, "", nextHash);
      } else {
        history.replaceState(null, "", nextHash);
      }
    }
    restoringHistoryRef.current = false;
    previousNavigationKeyRef.current = nextNavigationKey;
    observedLocationRef.current = window.location.href;
  }, [state]);

  useEffect(() => {
    const onHistoryNavigation = () => {
      if (observedLocationRef.current === window.location.href) return;
      const restored = createAtlasState(window.location.hash, readEnvironment());
      restoringHistoryRef.current = true;
      previousNavigationKeyRef.current = semanticNavigationKey(restored);
      observedLocationRef.current = window.location.href;
      dispatch({ type: "hydrate", state: restored });
    };
    window.addEventListener("popstate", onHistoryNavigation);
    window.addEventListener("hashchange", onHistoryNavigation);
    return () => {
      window.removeEventListener("popstate", onHistoryNavigation);
      window.removeEventListener("hashchange", onHistoryNavigation);
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => dispatch({ type: "reducedMotion", reducedMotion: media.matches });
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const media = window.matchMedia(mobileSiblingQuery);
    const onChange = () => dispatch({ type: "responsive", mobileSibling: media.matches });
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <AtlasStateContext.Provider value={value}>{children}</AtlasStateContext.Provider>;
}

export function useAtlasState() {
  const value = useContext(AtlasStateContext);
  if (!value) throw new Error("useAtlasState must be inside AtlasStateProvider");
  return value;
}
