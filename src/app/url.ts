import type { CosmosLens, Workspace } from "./contracts";

export interface AtlasRoute {
  workspace: Workspace;
  lens: CosmosLens;
  focusId: string | null;
  fromId: string | null;
  toId: string | null;
  exploreMode: "graph" | "list";
}

const workspaces = new Set<Workspace>(["home", "explore", "observe", "flow", "time", "agency"]);
const lenses = new Set<CosmosLens>([
  "whole-vault",
  "knowledge-core",
  "project-frontiers",
  "agent-stewardship",
]);
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
  return {
    workspace,
    lens,
    focusId: params.get("focus"),
    fromId: params.get("from"),
    toId: params.get("to"),
    exploreMode: params.get("view") === "list" || params.get("scene") === "list" ? "list" : "graph",
  };
}

export function routeHash(route: AtlasRoute) {
  const params = new URLSearchParams();
  if (route.lens !== "whole-vault") params.set("lens", route.lens);
  if (route.focusId) params.set("focus", route.focusId);
  if (route.fromId) params.set("from", route.fromId);
  if (route.toId) params.set("to", route.toId);
  if (route.workspace === "explore" && route.exploreMode !== "graph") {
    params.set("view", route.exploreMode);
  }
  const query = params.toString();
  return `#${route.workspace}${query ? `?${query}` : ""}`;
}

export function writeRoute(route: AtlasRoute, mode: "push" | "replace" = "push") {
  const next = routeHash(route);
  if (mode === "replace") history.replaceState(null, "", next);
  else history.pushState(null, "", next);
  window.dispatchEvent(new Event("atlasroute"));
}

