import type {
  CosmosLens,
  DossierTab,
  ExploreMode,
  ObserveMode,
  Workspace,
} from "./contracts";

export interface AtlasRoute {
  workspace: Workspace;
  lens: CosmosLens;
  focusId: string | null;
  fromId: string | null;
  toId: string | null;
  exploreMode: ExploreMode;
  panel: "none" | "dossier";
  dossierTab: DossierTab;
  observeMode: ObserveMode;
  claimId: string | null;
  readerNodeId: string | null;
  readerSectionId: string | null;
}

const workspaces = new Set<Workspace>([
  "home",
  "explore",
  "observe",
  "flow",
  "time",
  "agency",
  "read",
]);
const lenses = new Set<CosmosLens>([
  "whole-vault",
  "knowledge-core",
  "project-frontiers",
  "agent-stewardship",
]);
const dossierTabs = new Set<DossierTab>(["overview", "relations", "evidence"]);
const observeModes = new Set<ObserveMode>(["global", "node", "relation", "evidence"]);
const lensAliases: Record<string, CosmosLens> = {
  "domain-backbone": "whole-vault",
  "core-gravity": "knowledge-core",
  protagonists: "whole-vault",
  "vault-in-motion": "knowledge-core",
  "operational-compass": "agent-stewardship",
  graph: "whole-vault",
};

export const DEFAULT_ROUTE: AtlasRoute = {
  workspace: "home",
  lens: "whole-vault",
  focusId: null,
  fromId: null,
  toId: null,
  exploreMode: "graph",
  panel: "none",
  dossierTab: "overview",
  observeMode: "global",
  claimId: null,
  readerNodeId: null,
  readerSectionId: null,
};

export function readRoute(hash = window.location.hash): AtlasRoute {
  const [pathPart, queryPart = ""] = hash.replace(/^#/, "").split("?");
  const requestedWorkspace = pathPart as Workspace;
  const workspace = workspaces.has(requestedWorkspace) ? requestedWorkspace : "home";
  const params = new URLSearchParams(queryPart);
  const rawLens = params.get("lens") ?? params.get("scene") ?? "whole-vault";
  const lens = lenses.has(rawLens as CosmosLens)
    ? rawLens as CosmosLens
    : lensAliases[rawLens] ?? "whole-vault";
  const focusId = params.get("focus");
  const rawDossierTab = params.get("tab") as DossierTab | null;
  const rawObserveMode = params.get("mode") as ObserveMode | null;
  return {
    workspace,
    lens,
    focusId,
    fromId: params.get("from"),
    toId: params.get("to"),
    exploreMode: params.get("view") === "structure" || params.get("scene") === "structure"
      ? "structure"
      : params.get("view") === "list" || params.get("scene") === "list"
        ? "list"
        : "graph",
    panel: params.get("panel") === "dossier" && focusId ? "dossier" : "none",
    dossierTab: rawDossierTab && dossierTabs.has(rawDossierTab) ? rawDossierTab : "overview",
    observeMode: rawObserveMode && observeModes.has(rawObserveMode) ? rawObserveMode : "global",
    claimId: params.get("claim"),
    readerNodeId: workspace === "read" ? params.get("node") : null,
    readerSectionId: workspace === "read" ? params.get("section") : null,
  };
}

export function routeHash(route: AtlasRoute) {
  if (route.workspace === "read") return readerHash(route);
  const params = new URLSearchParams();
  appendGraphState(params, route);
  appendDossierState(params, route);
  appendWorkspaceState(params, route);
  const query = params.toString();
  return `#${route.workspace}${query ? `?${query}` : ""}`;
}

function readerHash(route: AtlasRoute) {
  const params = new URLSearchParams();
  if (route.readerNodeId) params.set("node", route.readerNodeId);
  if (route.readerSectionId) params.set("section", route.readerSectionId);
  const query = params.toString();
  return `#read${query ? `?${query}` : ""}`;
}

function appendGraphState(params: URLSearchParams, route: AtlasRoute) {
  if (route.lens !== "whole-vault") params.set("lens", route.lens);
  if (route.focusId) params.set("focus", route.focusId);
  if (route.fromId) params.set("from", route.fromId);
  if (route.toId) params.set("to", route.toId);
}

function appendDossierState(params: URLSearchParams, route: AtlasRoute) {
  const dossierWorkspace = route.workspace === "home" || route.workspace === "explore";
  if (!dossierWorkspace || route.panel !== "dossier") return;
  params.set("panel", "dossier");
  if (route.dossierTab !== "overview") params.set("tab", route.dossierTab);
}

function appendWorkspaceState(params: URLSearchParams, route: AtlasRoute) {
  if (route.workspace === "explore" && route.exploreMode !== "graph") {
    params.set("view", route.exploreMode);
  }
  if (route.workspace !== "observe") return;
  if (route.observeMode !== "global") params.set("mode", route.observeMode);
  if (route.observeMode === "node" && route.dossierTab !== "overview") {
    params.set("tab", route.dossierTab);
  }
  if (route.claimId) params.set("claim", route.claimId);
}

export function writeRoute(route: AtlasRoute, mode: "push" | "replace" = "push") {
  const next = routeHash(route);
  if (mode === "replace") history.replaceState(null, "", next);
  else history.pushState(null, "", next);
  window.dispatchEvent(new Event("atlasroute"));
}
