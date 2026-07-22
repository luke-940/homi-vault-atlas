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
import { atlasData, DEFAULT_DAILY_ROUTE_ID } from "./data-runtime";
import type { AgencyScene, ExploreLens, GraphFreshness, MatrixCell, RelationLayer, Workspace } from "./types";
import {
  resolveWorkspaceScene,
  workspaceDocumentTitle,
  workspaceSceneRegistry,
} from "./components/workspaceSceneRegistry";

export type PanelState = "none" | "navigator" | "inspector" | "data";
export type InspectorTab = "summary" | "relations" | "proof" | "history";
export type RelationDirection = "forward" | "reverse";

export interface SceneSnapshot {
  workspace: Workspace;
  sceneId: string;
  focusId: string | null;
  lens: ExploreLens;
  relationPairId: string | null;
  relationDirection: RelationDirection | null;
  relationLayer: RelationLayer;
  routeId: string;
  eraId: number;
  actorId: string | null;
  compareIds: string[];
  filters: string[];
  districtId: string | null;
  freshness: GraphFreshness;
  pathFrom: string | null;
  pathTo: string | null;
}

export interface AtlasState {
  workspace: Workspace;
  sceneId: string;
  lens: ExploreLens;
  focusId: string | null;
  previewId: string | null;
  compareIds: string[];
  relationPairId: string | null;
  relationDirection: RelationDirection | null;
  relationLayer: RelationLayer;
  routeId: string;
  eraId: number;
  actorId: string | null;
  guideStep: number | null;
  filters: string[];
  districtId: string | null;
  freshness: GraphFreshness;
  pathFrom: string | null;
  pathTo: string | null;
  camera: string | null;
  fallbackReason: string | null;
  previousScene: SceneSnapshot | null;
  navigationHistory: SceneSnapshot[];
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
  | { type: "actor"; actorId: string | null }
  | { type: "guide"; step: number | null }
  | { type: "filters"; filters: string[] }
  | { type: "graphDistrict"; districtId: string | null }
  | { type: "graphFreshness"; freshness: GraphFreshness }
  | { type: "graphPath"; from: string | null; to: string | null }
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
  sceneId: workspaceSceneRegistry.home.defaultScene,
  lens: "city",
  focusId: atlasData.bootstrap.defaultFocus,
  previewId: null,
  compareIds: [],
  relationPairId: null,
  relationDirection: null,
  relationLayer: "wikilink",
  routeId: atlasData.flow.routes[0]?.id ?? DEFAULT_DAILY_ROUTE_ID,
  eraId: atlasData.temporal.eras[0]?.id ?? atlasData.temporal.currentEra ?? 0,
  actorId: null,
  guideStep: null,
  filters: [],
  districtId: null,
  freshness: "all",
  pathFrom: null,
  pathTo: null,
  camera: null,
  fallbackReason: null,
  previousScene: null,
  navigationHistory: [],
  panel: "none",
  inspectorTab: "summary",
  searchOpen: false,
  theatre: false,
  reducedMotion: environment.reducedMotion,
  mobileSibling: environment.mobileSibling,
});

const workspaces = new Set<Workspace>(["home", "explore", "observe", "flow", "time", "agency"]);
const integratedInspectorWorkspaces = new Set<Workspace>(["home", "explore", "observe", "flow", "agency"]);
const lenses = new Set<ExploreLens>(["city"]);
const layers = new Set<RelationLayer>(["wikilink", "typed", "route"]);
const availableLayers = new Set<RelationLayer>(atlasData.relation.availableLayers);
const directions = new Set<RelationDirection>(["forward", "reverse"]);
const freshnessBuckets = new Set<GraphFreshness>(["all", "30d", "90d", "1y", "undated"]);
const districtIds = new Set(atlasData.graph.clusters.map((cluster) => cluster.id));
const focusIds = new Set([
  ...atlasData.entity.entities.map((entity) => entity.id),
  ...atlasData.graph.nodes.map((node) => node.id),
]);
const comparableIds = new Set(atlasData.entity.entities.map((entity) => entity.id));
const relationPairIds = new Set(atlasData.relation.matrix.map((pair) => pair.id));
const routeIds = new Set(atlasData.flow.routes.map((route) => route.id));
const eraIds = new Set(atlasData.temporal.eras.map((era) => era.id));
const actorIds = new Set(atlasData.agency.actors.map((actor) => actor.id));
const defaultSceneByWorkspace = Object.fromEntries(
  Object.entries(workspaceSceneRegistry).map(([workspace, definition]) => [workspace, definition.defaultScene]),
) as Record<Workspace, string>;
export const mobileSiblingQuery = "(max-width: 820px), (max-width: 900px) and (max-height: 520px)";

function validScene(workspace: Workspace, sceneId: string | null | undefined) {
  return Boolean(resolveWorkspaceScene(workspace, sceneId));
}

export function isDirectedRelationLayer(layer: RelationLayer) {
  return layer === "typed" || layer === "wikilink";
}

export function relationDirectionCounts(
  pair: Pick<MatrixCell, "typedForward" | "typedReverse" | "wikilinkForward" | "wikilinkReverse"> | undefined,
  layer: RelationLayer,
) {
  if (!pair || !isDirectedRelationLayer(layer)) return { forward: 0, reverse: 0 };
  return layer === "typed"
    ? { forward: pair.typedForward, reverse: pair.typedReverse }
    : { forward: pair.wikilinkForward, reverse: pair.wikilinkReverse };
}

export function dominantRelationDirection(
  pair: Pick<MatrixCell, "typedForward" | "typedReverse" | "wikilinkForward" | "wikilinkReverse"> | undefined,
  layer: RelationLayer,
): RelationDirection | null {
  const counts = relationDirectionCounts(pair, layer);
  if (counts.forward <= 0 && counts.reverse <= 0) return null;
  return counts.reverse > counts.forward ? "reverse" : "forward";
}

export function dominantTypedDirection(
  pair: Pick<MatrixCell, "typedForward" | "typedReverse"> | undefined,
): RelationDirection | null {
  if (!pair) return null;
  return dominantRelationDirection({ ...pair, wikilinkForward: 0, wikilinkReverse: 0 }, "typed");
}

function normalizedRelationDirection(
  pair: MatrixCell | undefined,
  layer: RelationLayer,
  requested: RelationDirection | null | undefined,
): RelationDirection | null {
  if (!pair || !isDirectedRelationLayer(layer)) return null;
  const counts = relationDirectionCounts(pair, layer);
  if (requested === "forward" && counts.forward > 0) return requested;
  if (requested === "reverse" && counts.reverse > 0) return requested;
  return dominantRelationDirection(pair, layer);
}

export function createAtlasState(hash: string, environment: ResponsiveEnvironment): AtlasState {
  const defaultState = createDefaultState(environment);
  const raw = hash.replace(/^#/, "");
  const [workspacePart, query = ""] = raw.split("?");
  const params = new URLSearchParams(query);
  const requestedWorkspace = workspaces.has(workspacePart as Workspace)
    ? (workspacePart as Workspace)
    : defaultState.workspace;
  const timeFallback = requestedWorkspace === "time" && atlasData.temporal.eras.length === 0;
  const workspace = timeFallback ? "explore" : requestedWorkspace;
  const lensParam = params.get("lens") as ExploreLens | null;
  const layerParam = params.get("layer") as RelationLayer | null;
  const directionParam = params.get("dir") as RelationDirection | null;
  const panelParam = params.get("panel") as PanelState | null;
  const requestedFocus = params.get("focus");
  const requestedPair = params.get("pair");
  const requestedRoute = params.get("route");
  const requestedEra = Number(params.get("era"));
  const requestedScene = params.get("scene");
  const normalizedRequestedScene = resolveWorkspaceScene(workspace, requestedScene);
  const requestedActor = params.get("actor");
  const guideParam = params.get("guide");
  const requestedGuide = guideParam === null ? Number.NaN : Number(guideParam);
  const rawCompare = (params.get("compare") ?? "").split(",").filter(Boolean);
  const requestedDistrict = params.get("district");
  const requestedFreshness = params.get("freshness") as GraphFreshness | null;
  const requestedFrom = params.get("from");
  const requestedTo = params.get("to");
  const requestedCompare = [...new Set(rawCompare.filter((id) => comparableIds.has(id)))].slice(0, 2);
  const relationLayer = layerParam && layers.has(layerParam) && availableLayers.has(layerParam)
    ? layerParam
    : defaultState.relationLayer;
  const relationPair = requestedPair && relationPairIds.has(requestedPair)
    ? atlasData.relation.matrix.find((pair) => pair.id === requestedPair)
    : undefined;
  const fallbackReasons = [
    workspacePart && !workspaces.has(workspacePart as Workspace)
      ? "요청한 화면을 찾지 못해 대문을 열었습니다."
      : null,
    timeFallback
      ? "기록된 chronology가 없어 Explore의 최신성 지형으로 안전하게 이동했습니다."
      : null,
    lensParam && !lenses.has(lensParam)
      ? "요청한 이전 Explore 공개 화면은 v7.3에서 City로 통합되어 안전하게 이동했습니다."
      : null,
    layerParam && (!layers.has(layerParam) || !availableLayers.has(layerParam))
      ? "요청한 관계층은 이 공개 범위에서 제공되지 않아 링크 출현 층을 열었습니다."
      : null,
    directionParam && !directions.has(directionParam)
      ? "요청한 관계 방향을 해석하지 못했습니다."
      : null,
    panelParam && !["none", "navigator", "inspector", "data"].includes(panelParam)
      ? "요청한 패널을 찾지 못해 기본 패널 상태를 사용했습니다."
      : null,
    guideParam !== null && !(Number.isInteger(requestedGuide) && requestedGuide >= 0 && requestedGuide <= 2)
      ? "요청한 가이드 단계를 찾지 못해 가이드를 닫았습니다."
      : null,
    ...rawCompare
      .filter((id) => !comparableIds.has(id))
      .map(() => "비교는 공개 지식 엔터티에만 제공됩니다."),
    requestedFocus && !focusIds.has(requestedFocus)
      ? "요청한 객체를 현재 스냅샷에서 찾지 못해 기본 선택을 열었습니다."
      : null,
    requestedDistrict && !districtIds.has(requestedDistrict)
      ? "요청한 지식 구역을 찾지 못해 전체 그래프를 열었습니다."
      : null,
    requestedFreshness && !freshnessBuckets.has(requestedFreshness)
      ? "요청한 최신성 범위를 해석하지 못해 전체 기간을 사용했습니다."
      : null,
    requestedFrom && !focusIds.has(requestedFrom)
      ? "경로의 출발 노드를 찾지 못해 경로 선택을 해제했습니다."
      : null,
    requestedTo && !focusIds.has(requestedTo)
      ? "경로의 도착 노드를 찾지 못해 경로 선택을 해제했습니다."
      : null,
    requestedPair && !relationPairIds.has(requestedPair)
      ? "요청한 관계를 현재 스냅샷에서 찾지 못했습니다."
      : null,
    requestedRoute && !routeIds.has(requestedRoute)
      ? "요청한 흐름을 현재 스냅샷에서 찾지 못했습니다."
      : null,
    params.has("era") && !eraIds.has(requestedEra)
      ? "요청한 시대를 현재 스냅샷에서 찾지 못했습니다."
      : null,
    requestedScene && normalizedRequestedScene === null
      ? "요청한 장면을 현재 화면에서 찾지 못해 기본 장면을 열었습니다."
      : null,
    workspace === "agency" && requestedActor && !actorIds.has(requestedActor)
      ? "요청한 역할을 찾지 못해 Agency System을 열었습니다."
      : null,
    workspace === "agency" && requestedScene === "roles" && !requestedActor
      ? "역할 선택이 없어 Agency System을 열었습니다."
      : null,
  ].filter(Boolean);
  const requestedAgencyScene = normalizedRequestedScene as AgencyScene | null;
  const validRequestedActor = requestedActor && actorIds.has(requestedActor) ? requestedActor : null;
  const agencyLocationValid = workspace !== "agency"
    || (requestedActor ? Boolean(validRequestedActor) : requestedAgencyScene !== "roles");
  const resolvedScene = timeFallback
    ? "graph"
    : normalizedRequestedScene && agencyLocationValid
    ? normalizedRequestedScene
    : defaultSceneByWorkspace[workspace];
  return {
    ...defaultState,
    workspace,
    sceneId: resolvedScene,
    lens: lensParam && lenses.has(lensParam) ? lensParam : defaultState.lens,
    focusId: requestedFocus && focusIds.has(requestedFocus)
      ? requestedFocus
      : workspace === "home"
        ? null
        : defaultState.focusId,
    compareIds: requestedCompare,
    relationPairId: relationPair?.id ?? null,
    relationDirection: normalizedRelationDirection(
      relationPair,
      relationLayer,
      directionParam && directions.has(directionParam) ? directionParam : null,
    ),
    relationLayer,
    routeId: requestedRoute && routeIds.has(requestedRoute) ? requestedRoute : defaultState.routeId,
    eraId: eraIds.has(requestedEra) ? requestedEra : defaultState.eraId,
    actorId: workspace === "agency" && resolvedScene === "roles" ? validRequestedActor : null,
    guideStep: Number.isInteger(requestedGuide) && requestedGuide >= 0 && requestedGuide <= 2 ? requestedGuide : null,
    filters: [...new Set((params.get("filters") ?? "").split(",").map((value) => value.trim()).filter(Boolean))].slice(0, 12),
    districtId: requestedDistrict && districtIds.has(requestedDistrict) ? requestedDistrict : null,
    freshness: requestedFreshness && freshnessBuckets.has(requestedFreshness) ? requestedFreshness : "all",
    pathFrom: requestedFrom && requestedTo && focusIds.has(requestedFrom) && focusIds.has(requestedTo) ? requestedFrom : null,
    pathTo: requestedFrom && requestedTo && focusIds.has(requestedFrom) && focusIds.has(requestedTo) ? requestedTo : null,
    camera: params.get("cam") || null,
    panel:
      panelParam && ["none", "navigator", "inspector", "data"].includes(panelParam)
        ? panelParam
        : integratedInspectorWorkspaces.has(workspace) || environment.mobileSibling
          ? "none"
          : "inspector",
    theatre: params.get("theatre") === "1",
    searchOpen: false,
    fallbackReason: fallbackReasons.join(" ") || null,
    reducedMotion: environment.reducedMotion,
    mobileSibling: environment.mobileSibling,
    navigationHistory: [],
  };
}

export function stateToHash(state: AtlasState) {
  const params = new URLSearchParams();
  if (state.workspace === "agency") {
    const scene = validScene("agency", state.sceneId) ? state.sceneId : "system";
    params.set("scene", scene);
    if (scene === "roles" && state.actorId && actorIds.has(state.actorId)) params.set("actor", state.actorId);
    return `#agency?${params.toString()}`;
  }
  if (state.focusId) params.set("focus", state.focusId);
  if (state.sceneId) params.set("scene", state.sceneId);
  if (state.workspace === "explore") {
    if (state.districtId) params.set("district", state.districtId);
    if (state.freshness !== "all") params.set("freshness", state.freshness);
    if (state.pathFrom && state.pathTo) {
      params.set("from", state.pathFrom);
      params.set("to", state.pathTo);
    }
  }
  if (state.workspace === "observe") {
    params.set("layer", state.relationLayer);
    if (state.relationPairId) params.set("pair", state.relationPairId);
    if (isDirectedRelationLayer(state.relationLayer) && state.relationDirection) params.set("dir", state.relationDirection);
  }
  if (state.workspace === "flow" && routeIds.has(state.routeId)) params.set("route", state.routeId);
  if (state.workspace === "time" && eraIds.has(state.eraId)) params.set("era", String(state.eraId));
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
    actorId: state.actorId,
    compareIds: state.compareIds,
    filters: state.filters,
    districtId: state.districtId,
    freshness: state.freshness,
    pathFrom: state.pathFrom,
    pathTo: state.pathTo,
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
    actorId: state.actorId,
    compareIds: state.compareIds,
    filters: state.filters,
    districtId: state.districtId,
    freshness: state.freshness,
    pathFrom: state.pathFrom,
    pathTo: state.pathTo,
  };
}

function historyFor(state: AtlasState) {
  return [...state.navigationHistory, captureScene(state)].slice(-20);
}

function previousFrom(history: SceneSnapshot[]) {
  return history.at(-1) ?? null;
}

export function reduceAtlasState(state: AtlasState, action: Action): AtlasState {
  switch (action.type) {
    case "workspace":
      return (() => {
        const navigationHistory = historyFor(state);
        return {
        ...state,
        previousScene: previousFrom(navigationHistory),
        navigationHistory,
        workspace: action.workspace,
        sceneId: defaultSceneByWorkspace[action.workspace],
        actorId: null,
        districtId: action.workspace === "explore" ? state.districtId : null,
        pathFrom: action.workspace === "explore" ? state.pathFrom : null,
        pathTo: action.workspace === "explore" ? state.pathTo : null,
        panel: integratedInspectorWorkspaces.has(action.workspace) || state.mobileSibling ? "none" : "inspector",
        guideStep: action.workspace === "home" ? state.guideStep : null,
        fallbackReason: null,
        };
      })();
    case "journey": {
      const requestedFocus = action.target.focusId;
      const validFocus = requestedFocus ? focusIds.has(requestedFocus) : true;
      const requestedPair = action.target.relationPairId;
      const validPair = requestedPair ? relationPairIds.has(requestedPair) : true;
      const targetWorkspace = action.target.workspace ?? state.workspace;
      const requestedScene = action.target.sceneId;
      const resolvedRequestedScene = requestedScene
        ? resolveWorkspaceScene(targetWorkspace, requestedScene)
        : null;
      const validRequestedScene = requestedScene ? resolvedRequestedScene !== null : true;
      const resolvedCurrentScene = resolveWorkspaceScene(targetWorkspace, state.sceneId);
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
      const navigationHistory = historyFor(state);
      return {
        ...state,
        previousScene: previousFrom(navigationHistory),
        navigationHistory,
        workspace: targetWorkspace,
        sceneId: validRequestedScene && resolvedRequestedScene
          ? resolvedRequestedScene
          : action.target.workspace
            ? defaultSceneByWorkspace[targetWorkspace]
            : resolvedCurrentScene
              ? resolvedCurrentScene
              : defaultSceneByWorkspace[targetWorkspace],
        focusId: validFocus && requestedFocus ? requestedFocus : state.focusId,
        lens: action.target.lens && lenses.has(action.target.lens) ? action.target.lens : "city",
        districtId: action.target.districtId !== undefined
          ? action.target.districtId && districtIds.has(action.target.districtId) ? action.target.districtId : null
          : targetWorkspace === "explore" ? state.districtId : null,
        freshness: action.target.freshness && freshnessBuckets.has(action.target.freshness)
          ? action.target.freshness
          : state.freshness,
        pathFrom: action.target.pathFrom && focusIds.has(action.target.pathFrom) ? action.target.pathFrom : state.pathFrom,
        pathTo: action.target.pathTo && focusIds.has(action.target.pathTo) ? action.target.pathTo : state.pathTo,
        relationPairId: targetPair ?? null,
        relationLayer: targetLayer,
        relationDirection: normalizedRelationDirection(pair, targetLayer, action.target.relationDirection),
        routeId: action.target.routeId && routeIds.has(action.target.routeId) ? action.target.routeId : state.routeId,
        eraId: action.target.eraId && eraIds.has(action.target.eraId) ? action.target.eraId : state.eraId,
        actorId: targetWorkspace === "agency"
          && (resolvedRequestedScene ?? resolvedCurrentScene) === "roles"
          && action.target.actorId
          && actorIds.has(action.target.actorId)
          ? action.target.actorId
          : null,
        panel: integratedInspectorWorkspaces.has(targetWorkspace) || state.mobileSibling ? "none" : "inspector",
        inspectorTab: "summary",
        guideStep: targetWorkspace === "home" ? state.guideStep : null,
        fallbackReason: !validFocus
          ? `요청한 객체 ${requestedFocus}를 현재 스냅샷에서 찾지 못해 이전 선택을 유지했습니다.`
          : !validPair
            ? `요청한 관계 ${requestedPair}를 현재 스냅샷에서 찾지 못해 이전 관계를 유지했습니다.`
            : !validLayer
              ? `요청한 관계층 ${requestedLayer}은 이 범위에서 제공되지 않아 현재 관계층을 유지했습니다.`
              : !validRequestedScene
                ? `요청한 장면 ${requestedScene}을 ${targetWorkspace} 화면에서 찾지 못해 기본 장면을 열었습니다.`
              : action.fallbackReason ?? null,
      };
    }
    case "back":
      if (!state.navigationHistory.length) return state;
      {
        const navigationHistory = state.navigationHistory.slice(0, -1);
        const destination = state.navigationHistory.at(-1)!;
        return {
            ...state,
            ...destination,
            previousScene: previousFrom(navigationHistory),
            navigationHistory,
            panel: integratedInspectorWorkspaces.has(destination.workspace) || state.mobileSibling ? "none" : "inspector",
            fallbackReason: null,
          };
      }
    case "lens":
      return lenses.has(action.lens)
        ? { ...state, lens: action.lens, navigationHistory: historyFor(state), fallbackReason: null }
        : {
            ...state,
            lens: "city",
            fallbackReason: `요청한 ${action.lens} 공개 화면은 v7.3에서 City로 통합되어 안전하게 이동했습니다.`,
          };
    case "focus":
      if (!focusIds.has(action.focusId)) {
        return { ...state, fallbackReason: `요청한 객체 ${action.focusId}를 현재 스냅샷에서 찾지 못했습니다.` };
      }
      return {
        ...state,
        navigationHistory: historyFor(state),
        focusId: action.focusId,
        panel: integratedInspectorWorkspaces.has(state.workspace) || action.openInspector === false || state.mobileSibling ? state.panel : "inspector",
        inspectorTab: "summary",
      };
    case "preview":
      return { ...state, previewId: action.focusId };
    case "compare": {
      if (!comparableIds.has(action.focusId)) {
        return { ...state, fallbackReason: "비교는 공개 지식 엔터티에만 제공됩니다." };
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
        navigationHistory: historyFor(state),
        relationPairId: pair?.id ?? null,
        relationDirection: normalizedRelationDirection(pair, state.relationLayer, action.direction),
        panel: state.mobileSibling ? "none" : state.panel,
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
        navigationHistory: historyFor(state),
        relationLayer: action.relationLayer,
        relationDirection: normalizedRelationDirection(selectedPair, action.relationLayer, state.relationDirection),
      };
    }
    case "route":
      return { ...state, navigationHistory: historyFor(state), routeId: action.routeId, panel: state.mobileSibling ? "none" : state.panel };
    case "era":
      return { ...state, navigationHistory: historyFor(state), eraId: action.eraId, panel: state.mobileSibling ? "none" : "inspector" };
    case "actor":
      return action.actorId && actorIds.has(action.actorId)
        ? {
            ...state,
            navigationHistory: historyFor(state),
            workspace: "agency",
            sceneId: "roles",
            actorId: action.actorId,
            panel: "none",
            fallbackReason: null,
          }
        : {
            ...state,
            navigationHistory: historyFor(state),
            workspace: "agency",
            sceneId: "system",
            actorId: null,
            panel: "none",
            fallbackReason: action.actorId
              ? `요청한 역할 ${action.actorId}을 찾지 못해 Agency System을 열었습니다.`
              : null,
          };
    case "guide":
      return { ...state, guideStep: action.step };
    case "filters":
      return { ...state, filters: [...new Set(action.filters)].slice(0, 12) };
    case "graphDistrict":
      return action.districtId === null || districtIds.has(action.districtId)
        ? { ...state, navigationHistory: historyFor(state), districtId: action.districtId, fallbackReason: null }
        : { ...state, fallbackReason: "요청한 지식 구역을 찾지 못했습니다." };
    case "graphFreshness":
      return freshnessBuckets.has(action.freshness)
        ? { ...state, navigationHistory: historyFor(state), freshness: action.freshness, fallbackReason: null }
        : state;
    case "graphPath":
      return (action.from === null || focusIds.has(action.from)) && (action.to === null || focusIds.has(action.to))
        ? { ...state, navigationHistory: historyFor(state), pathFrom: action.from, pathTo: action.to, fallbackReason: null }
        : { ...state, fallbackReason: "경로 노드를 찾지 못했습니다." };
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
      return { ...state, theatre: action.open, panel: action.open || state.mobileSibling || integratedInspectorWorkspaces.has(state.workspace) ? "none" : "inspector" };
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
    document.title = workspaceDocumentTitle(state.workspace, state.sceneId);
  }, [state.sceneId, state.workspace]);

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
