import { useEffect, useRef, useState } from "react";
import { CommandBar } from "./components/CommandBar";
import { InspectorTray } from "./components/InspectorTray";
import { NavigatorTray } from "./components/NavigatorTray";
import { SearchPalette } from "./components/SearchPalette";
import { ExploreView } from "./views/ExploreView";
import { ObserveView } from "./views/ObserveView";
import { FlowView } from "./views/FlowView";
import { TimeView } from "./views/TimeView";
import { HomeView } from "./views/HomeView";
import { useAtlasState } from "./state";

const workspaceIds = ["home", "explore", "observe", "flow", "time"] as const;

export function App() {
  const { state, dispatch } = useAtlasState();
  const [documentHidden, setDocumentHidden] = useState(document.hidden);
  const theatreReturnFocusRef = useRef<HTMLElement | null>(null);
  const previousTheatreRef = useRef(state.theatre);
  const previousWorkspaceRef = useRef(state.workspace);

  useEffect(() => {
    const syncVisibility = () => setDocumentHidden(document.hidden);
    document.addEventListener("visibilitychange", syncVisibility);
    return () => document.removeEventListener("visibilitychange", syncVisibility);
  }, []);

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
        else if (state.previousScene) dispatch({ type: "back" });
      } else if (!typing && event.key.toLowerCase() === "f") {
        dispatch({ type: "theatre", open: !state.theatre });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dispatch, state.guideStep, state.panel, state.previousScene, state.searchOpen, state.theatre, state.workspace]);

  useEffect(() => {
    const wasOpen = previousTheatreRef.current;
    if (state.theatre && !wasOpen) {
      theatreReturnFocusRef.current = document.activeElement as HTMLElement | null;
      requestAnimationFrame(() => document.querySelector<HTMLElement>(".theatre-exit")?.focus());
    } else if (!state.theatre && wasOpen) {
      const target = theatreReturnFocusRef.current;
      theatreReturnFocusRef.current = null;
      requestAnimationFrame(() => target?.focus({ preventScroll: true }));
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
  }[state.workspace];

  return (
    <div
      className={state.theatre ? "atlas-app is-theatre" : "atlas-app"}
      data-panel={state.panel}
      data-document-hidden={documentHidden ? "true" : "false"}
      data-workspace={state.workspace}
    >
      <CommandBar />
      <div className="workspace-shell" id="atlas-workspace-shell">
        {state.panel === "navigator" && <NavigatorTray />}
        <main className="workspace-main" id="workspace-main" tabIndex={-1}>
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
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {({ home: "대문", explore: "탐색", observe: "관측", flow: "흐름", time: "시간" } as const)[state.workspace]} 화면, 현재 선택 {state.focusId}
        {state.fallbackReason ? `, 이동 안내 ${state.fallbackReason}` : ""}
      </div>
      <SearchPalette />
    </div>
  );
}
