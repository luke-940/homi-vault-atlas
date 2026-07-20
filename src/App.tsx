import { useEffect, useRef, useState } from "react";
import { CommandBar, MobileNavigation } from "./components/CommandBar";
import { InspectorTray } from "./components/InspectorTray";
import { NavigatorTray } from "./components/NavigatorTray";
import { SearchPalette } from "./components/SearchPalette";
import { ExploreView } from "./views/ExploreView";
import { ObserveView } from "./views/ObserveView";
import { FlowView } from "./views/FlowView";
import { TimeView } from "./views/TimeView";
import { HomeView } from "./views/HomeView";
import { AgencyView } from "./views/AgencyView";
import { useAtlasState } from "./state";
import { atlasData, entityById, hierarchyById, structureNodeById } from "./data-runtime";

const workspaceIds = ["home", "explore", "observe", "flow", "time", "agency"] as const;

export function App() {
  const { state, dispatch } = useAtlasState();
  const [documentHidden, setDocumentHidden] = useState(document.hidden);
  const theatreReturnFocusRef = useRef<HTMLElement | null>(null);
  const theatreReturnScrollRef = useRef({ windowY: 0, mainY: 0 });
  const previousTheatreRef = useRef(state.theatre);
  const previousWorkspaceRef = useRef(state.workspace);

  useEffect(() => {
    const syncVisibility = () => setDocumentHidden(document.hidden);
    document.addEventListener("visibilitychange", syncVisibility);
    return () => document.removeEventListener("visibilitychange", syncVisibility);
  }, []);

  useEffect(() => {
    const captureTheatreReturn = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (state.theatre || !target?.closest(".mobile-theatre-action, .theatre-button")) return;
      theatreReturnFocusRef.current = document.activeElement as HTMLElement | null;
      theatreReturnScrollRef.current = {
        windowY: window.scrollY,
        mainY: document.querySelector<HTMLElement>(".workspace-main")?.scrollTop ?? 0,
      };
    };
    document.addEventListener("click", captureTheatreReturn, true);
    return () => document.removeEventListener("click", captureTheatreReturn, true);
  }, [state.theatre]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.matches("input, textarea, [contenteditable='true']");
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        dispatch({ type: "search", open: true });
      } else if (!typing && event.key === "/") {
        event.preventDefault();
        dispatch({ type: "search", open: true });
      } else if (event.key === "Escape") {
        if (state.searchOpen) dispatch({ type: "search", open: false });
        else if (state.theatre) dispatch({ type: "theatre", open: false });
        else if (state.workspace === "home" && state.guideStep !== null) dispatch({ type: "guide", step: null });
        else if (state.panel !== "none") dispatch({ type: "panel", panel: state.panel });
        else if (state.navigationHistory.length) dispatch({ type: "back" });
      } else if (!typing && event.key.toLowerCase() === "f") {
        if (!state.theatre) {
          theatreReturnFocusRef.current = document.activeElement as HTMLElement | null;
          theatreReturnScrollRef.current = {
            windowY: window.scrollY,
            mainY: document.querySelector<HTMLElement>(".workspace-main")?.scrollTop ?? 0,
          };
        }
        dispatch({ type: "theatre", open: !state.theatre });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dispatch, state.guideStep, state.navigationHistory.length, state.panel, state.searchOpen, state.theatre, state.workspace]);

  useEffect(() => {
    const wasOpen = previousTheatreRef.current;
    if (state.theatre && !wasOpen) {
      if (!theatreReturnFocusRef.current) {
        theatreReturnFocusRef.current = document.activeElement as HTMLElement | null;
        theatreReturnScrollRef.current = {
          windowY: window.scrollY,
          mainY: document.querySelector<HTMLElement>(".workspace-main")?.scrollTop ?? 0,
        };
      }
      requestAnimationFrame(() => document.querySelector<HTMLElement>(".theatre-exit")?.focus());
    } else if (!state.theatre && wasOpen) {
      const target = theatreReturnFocusRef.current;
      const scroll = theatreReturnScrollRef.current;
      theatreReturnFocusRef.current = null;
      requestAnimationFrame(() => {
        target?.focus({ preventScroll: true });
        window.scrollTo({ top: scroll.windowY, left: 0, behavior: "auto" });
        document.querySelector<HTMLElement>(".workspace-main")?.scrollTo({ top: scroll.mainY, left: 0, behavior: "auto" });
      });
    }
    previousTheatreRef.current = state.theatre;
  }, [state.theatre]);

  useEffect(() => {
    if (previousWorkspaceRef.current === state.workspace) return;
    previousWorkspaceRef.current = state.workspace;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.querySelector<HTMLElement>(".workspace-main")?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [state.workspace]);

  const workspace = {
    home: <HomeView />,
    explore: <ExploreView />,
    observe: <ObserveView />,
    flow: <FlowView />,
    time: <TimeView />,
    agency: <AgencyView />,
  }[state.workspace];
  const accessibleSelectionLabel = state.workspace === "agency"
    ? atlasData.agency.actors.find((actor) => actor.id === state.actorId)?.label ?? "전체 역할"
    : entityById.get(state.focusId)?.displayLabel
      ?? hierarchyById.get(state.focusId)?.label
      ?? structureNodeById.get(state.focusId)?.label
      ?? "공개 지식";

  return (
    <div
      className={state.theatre ? "atlas-app is-theatre" : "atlas-app"}
      data-panel={state.panel}
      data-document-hidden={documentHidden ? "true" : "false"}
      data-workspace={state.workspace}
      data-scene={state.sceneId}
    >
      <CommandBar />
      <div className="workspace-shell" id="atlas-workspace-shell">
        {state.panel === "navigator" && <NavigatorTray />}
        <main className="workspace-main" id="workspace-main" tabIndex={-1} lang="ko">
          {state.fallbackReason && (
            <p className="journey-fallback global-journey-fallback" role="status">
              {state.fallbackReason}
            </p>
          )}
          <div
            className="workspace-panel"
            id={`workspace-panel-${state.workspace}`}
            role="tabpanel"
            aria-labelledby={`workspace-tab-${state.workspace}`}
          >
            {workspace}
          </div>
          {workspaceIds
            .filter((workspaceId) => workspaceId !== state.workspace)
            .map((workspaceId) => (
              <div
                key={workspaceId}
                id={`workspace-panel-${workspaceId}`}
                role="tabpanel"
                aria-labelledby={`workspace-tab-${workspaceId}`}
                hidden
              />
            ))}
        </main>
        {(state.panel === "inspector" || state.panel === "data") && <InspectorTray />}
      </div>
      <MobileNavigation />
      <div className="sr-only" aria-live="polite" aria-atomic="true" lang="ko">
        {({ home: "대문", explore: "탐색", observe: "관측", flow: "흐름", time: "시간", agency: "협업 구조" } as const)[state.workspace]} 화면, 현재 선택 {accessibleSelectionLabel}
        {state.fallbackReason ? `, 이동 안내 ${state.fallbackReason}` : ""}
      </div>
      <SearchPalette />
    </div>
  );
}
