import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AtlasRuntime, CosmosLens, ExploreMode, GraphNode, Workspace } from "./contracts";
import { DEFAULT_ROUTE, readRoute, writeRoute, type AtlasRoute } from "./url";

interface AtlasState {
  runtime: AtlasRuntime;
  route: AtlasRoute;
  previewId: string | null;
  searchOpen: boolean;
  setPreview(id: string | null): void;
  setSearchOpen(open: boolean): void;
  goWorkspace(workspace: Workspace): void;
  openNode(id: string, workspace?: Workspace): void;
  openPath(fromId: string, toId: string): void;
  setLens(lens: CosmosLens): void;
  commitFocus(id: string | null): void;
  setExploreMode(mode: ExploreMode): void;
  setPath(fromId: string | null, toId: string | null): void;
  escape(): void;
}

const AtlasContext = createContext<AtlasState | null>(null);

function sanitizeRoute(route: AtlasRoute, runtime: AtlasRuntime): AtlasRoute {
  return {
    ...route,
    focusId: route.focusId && runtime.graph.nodeById.has(route.focusId) ? route.focusId : null,
    fromId: route.fromId && runtime.graph.nodeById.has(route.fromId) ? route.fromId : null,
    toId: route.toId && runtime.graph.nodeById.has(route.toId) ? route.toId : null,
  };
}

export function AtlasProvider({ runtime, children }: { runtime: AtlasRuntime; children: ReactNode }) {
  const [route, setRoute] = useState(() => sanitizeRoute(readRoute(), runtime));
  const [previewId, setPreviewState] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const historyRef = useRef<AtlasRoute[]>([DEFAULT_ROUTE]);

  useEffect(() => {
    const sync = () => {
      setRoute(sanitizeRoute(readRoute(), runtime));
      setPreviewState(null);
    };
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    window.addEventListener("atlasroute", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("atlasroute", sync);
    };
  }, [runtime]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape") {
        if (searchOpen) setSearchOpen(false);
        else {
          const previous = historyRef.current.at(-2);
          if (previous) {
            historyRef.current.pop();
            writeRoute(previous, "replace");
          } else if (route.focusId) {
            writeRoute({ ...route, focusId: null }, "replace");
          }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [route, searchOpen]);

  const navigate = useCallback((next: AtlasRoute, mode: "push" | "replace" = "push") => {
    const safe = sanitizeRoute(next, runtime);
    if (mode === "push") historyRef.current.push(safe);
    writeRoute(safe, mode);
  }, [runtime]);

  const value = useMemo<AtlasState>(() => ({
    runtime,
    route,
    previewId,
    searchOpen,
    setPreview(id) {
      setPreviewState(id && runtime.graph.nodeById.has(id) ? id : null);
    },
    setSearchOpen,
    goWorkspace(workspace) {
      navigate({ ...route, workspace, focusId: workspace === "agency" ? null : route.focusId });
    },
    openNode(id, workspace = "explore") {
      navigate({
        ...route,
        workspace,
        exploreMode: workspace === "explore" ? "graph" : route.exploreMode,
        focusId: id,
        fromId: null,
        toId: null,
      });
    },
    openPath(fromId, toId) {
      navigate({
        ...route,
        workspace: "explore",
        exploreMode: "graph",
        focusId: fromId,
        fromId,
        toId,
      });
    },
    setLens(lens) {
      navigate({ ...route, lens }, "push");
    },
    commitFocus(id) {
      navigate({ ...route, focusId: id }, "push");
    },
    setExploreMode(exploreMode) {
      navigate({ ...route, workspace: "explore", exploreMode }, "push");
    },
    setPath(fromId, toId) {
      navigate({ ...route, workspace: "explore", fromId, toId }, "push");
    },
    escape() {
      if (searchOpen) setSearchOpen(false);
      else if (route.focusId) navigate({ ...route, focusId: null }, "replace");
    },
  }), [navigate, previewId, route, runtime, searchOpen]);

  return <AtlasContext.Provider value={value}>{children}</AtlasContext.Provider>;
}

export function useAtlas() {
  const context = useContext(AtlasContext);
  if (!context) throw new Error("useAtlas must be used inside AtlasProvider.");
  return context;
}

export function activeNode(state: Pick<AtlasState, "runtime" | "route" | "previewId">): GraphNode | null {
  return state.runtime.graph.nodeById.get(state.previewId ?? state.route.focusId ?? "") ?? null;
}
