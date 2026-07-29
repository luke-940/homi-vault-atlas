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
import type {
  AtlasRuntime,
  CosmosLens,
  DossierTab,
  ExploreMode,
  GraphNode,
  ObserveMode,
  Workspace,
} from "./contracts";
import { strongestReviewedRelation } from "./observe/observe-model";
import { readRoute, writeRoute, type AtlasRoute } from "./url";

interface AtlasState {
  runtime: AtlasRuntime;
  route: AtlasRoute;
  readerOriginWorkspace: "home" | "explore" | null;
  previewId: string | null;
  searchOpen: boolean;
  setPreview(id: string | null): void;
  setSearchOpen(open: boolean): void;
  goWorkspace(workspace: Workspace): void;
  openNode(id: string, workspace?: Workspace): void;
  openPath(fromId: string, toId: string): void;
  openDossier(id: string, tab?: DossierTab, workspace?: "home" | "explore"): void;
  setDossierTab(tab: DossierTab): void;
  openReader(id: string, sectionId?: string | null): void;
  closeReader(): void;
  openObserveNode(id: string): void;
  openObserveRelation(fromId: string, toId: string): void;
  openEvidence(id: string, claimId: string): void;
  setObserveMode(mode: ObserveMode): void;
  setLens(lens: CosmosLens): void;
  commitFocus(id: string | null): void;
  setExploreMode(mode: ExploreMode): void;
  setPath(fromId: string | null, toId: string | null): void;
  escape(): void;
}

const AtlasContext = createContext<AtlasState | null>(null);

function sanitizeRoute(route: AtlasRoute, runtime: AtlasRuntime): AtlasRoute {
  const focusId = route.focusId && runtime.graph.nodeById.has(route.focusId) ? route.focusId : null;
  const readerNodeId = route.readerNodeId && runtime.graph.nodeById.has(route.readerNodeId)
    ? route.readerNodeId
    : null;
  const safe = {
    ...route,
    focusId,
    fromId: route.fromId && runtime.graph.nodeById.has(route.fromId) ? route.fromId : null,
    toId: route.toId && runtime.graph.nodeById.has(route.toId) ? route.toId : null,
    panel: focusId ? route.panel : "none" as const,
    readerNodeId,
  };
  if (safe.workspace === "read" && !readerNodeId) {
    return {
      ...safe,
      workspace: "home",
      readerSectionId: null,
    };
  }
  return safe;
}

export function AtlasProvider({ runtime, children }: { runtime: AtlasRuntime; children: ReactNode }) {
  const [route, setRoute] = useState(() => sanitizeRoute(readRoute(), runtime));
  const [previewId, setPreviewState] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [readerOriginWorkspace, setReaderOriginWorkspace] = useState<"home" | "explore" | null>(null);
  const historyRef = useRef<AtlasRoute[]>([route]);
  const readerOriginRef = useRef<AtlasRoute | null>(null);

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
        else if (route.workspace === "read") {
          const origin = readerOriginRef.current;
          readerOriginRef.current = null;
          setReaderOriginWorkspace(null);
          writeRoute(origin ?? {
            ...route,
            workspace: "home",
            focusId: route.readerNodeId,
            panel: route.readerNodeId ? "dossier" : "none",
            readerNodeId: null,
            readerSectionId: null,
          }, "replace");
        }
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
    readerOriginWorkspace,
    previewId,
    searchOpen,
    setPreview(id) {
      setPreviewState(id && runtime.graph.nodeById.has(id) ? id : null);
    },
    setSearchOpen,
    goWorkspace(workspace) {
      navigate({
        ...route,
        workspace,
        focusId: workspace === "agency" ? null : route.focusId,
        panel: workspace === "home" || workspace === "explore" ? route.panel : "none",
        observeMode: workspace === "observe" ? route.observeMode : "global",
        readerNodeId: null,
        readerSectionId: null,
      });
    },
    openNode(id, workspace = "explore") {
      navigate({
        ...route,
        workspace,
        exploreMode: workspace === "explore" ? "graph" : route.exploreMode,
        focusId: id,
        fromId: null,
        toId: null,
        panel: workspace === "home" || workspace === "explore" ? "dossier" : "none",
        dossierTab: "overview",
        observeMode: workspace === "observe" ? "node" : route.observeMode,
        readerNodeId: null,
        readerSectionId: null,
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
        panel: "none",
      });
    },
    openDossier(id, tab = "overview", workspace = route.workspace === "home" ? "home" : "explore") {
      navigate({
        ...route,
        workspace,
        focusId: id,
        fromId: null,
        toId: null,
        panel: "dossier",
        dossierTab: tab,
        readerNodeId: null,
        readerSectionId: null,
      });
    },
    setDossierTab(dossierTab) {
      navigate({ ...route, panel: route.focusId ? "dossier" : "none", dossierTab }, "replace");
    },
    openReader(id, sectionId = null) {
      if (route.workspace !== "read") {
        readerOriginRef.current = route;
        setReaderOriginWorkspace(route.workspace === "home" || route.workspace === "explore"
          ? route.workspace
          : null);
      }
      navigate({
        ...route,
        workspace: "read",
        focusId: null,
        fromId: null,
        toId: null,
        panel: "none",
        claimId: null,
        readerNodeId: id,
        readerSectionId: sectionId,
      });
    },
    closeReader() {
      const origin = readerOriginRef.current;
      readerOriginRef.current = null;
      setReaderOriginWorkspace(null);
      navigate(origin ?? {
        ...route,
        workspace: "home",
        focusId: route.readerNodeId,
        panel: route.readerNodeId ? "dossier" : "none",
        dossierTab: "overview",
        readerNodeId: null,
        readerSectionId: null,
      }, "replace");
    },
    openObserveNode(id) {
      navigate({
        ...route,
        workspace: "observe",
        focusId: id,
        fromId: null,
        toId: null,
        panel: "none",
        observeMode: "node",
        claimId: null,
      });
    },
    openObserveRelation(fromId, toId) {
      navigate({
        ...route,
        workspace: "observe",
        focusId: fromId,
        fromId,
        toId,
        panel: "none",
        observeMode: "relation",
        claimId: null,
      });
    },
    openEvidence(id, claimId) {
      navigate({
        ...route,
        workspace: "observe",
        focusId: id,
        fromId: null,
        toId: null,
        panel: "none",
        observeMode: "evidence",
        claimId,
      });
    },
    setObserveMode(observeMode) {
      const firstReviewedId = runtime.knowledge.dossiers[0]?.nodeId ?? null;
      if (observeMode === "relation") {
        const fallback = strongestReviewedRelation(runtime);
        const source = fallback ? runtime.graph.nodes[fallback.source] : null;
        const target = fallback ? runtime.graph.nodes[fallback.target] : null;
        navigate({
          ...route,
          workspace: "observe",
          observeMode,
          focusId: route.fromId ?? source?.id ?? route.focusId ?? firstReviewedId,
          fromId: route.fromId ?? source?.id ?? null,
          toId: route.toId ?? target?.id ?? null,
          claimId: null,
        }, "replace");
        return;
      }
      navigate({
        ...route,
        workspace: "observe",
        observeMode,
        focusId: observeMode === "global" ? route.focusId : route.focusId ?? firstReviewedId,
        fromId: observeMode === "global" ? route.fromId : null,
        toId: observeMode === "global" ? route.toId : null,
        claimId: observeMode === "evidence" ? route.claimId : null,
      }, "replace");
    },
    setLens(lens) {
      navigate({ ...route, lens }, "push");
    },
    commitFocus(id) {
      navigate({
        ...route,
        focusId: id,
        panel: id && (route.workspace === "home" || route.workspace === "explore")
          ? "dossier"
          : "none",
        dossierTab: id ? "overview" : route.dossierTab,
      }, "push");
    },
    setExploreMode(exploreMode) {
      navigate({ ...route, workspace: "explore", exploreMode }, "push");
    },
    setPath(fromId, toId) {
      navigate({ ...route, workspace: "explore", fromId, toId }, "push");
    },
    escape() {
      if (searchOpen) setSearchOpen(false);
      else if (route.workspace === "read") {
        const origin = readerOriginRef.current;
        readerOriginRef.current = null;
        setReaderOriginWorkspace(null);
        navigate(origin ?? {
          ...route,
          workspace: "home",
          focusId: route.readerNodeId,
          panel: route.readerNodeId ? "dossier" : "none",
          readerNodeId: null,
          readerSectionId: null,
        }, "replace");
      }
      else if (route.focusId) navigate({ ...route, focusId: null }, "replace");
    },
  }), [navigate, previewId, readerOriginWorkspace, route, runtime, searchOpen]);

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
