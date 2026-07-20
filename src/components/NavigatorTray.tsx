import { ChevronRight, Clock3, FileText, FolderTree, Home, Route, Rows3, UsersRound, X } from "lucide-react";
import { Fragment, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { atlasData } from "../data-runtime";
import { useAtlasState } from "../state";
import { trayDialogKeyIntent } from "./tray-accessibility";
import { workspaceSceneRegistry } from "./workspaceSceneRegistry";

export function navigatorDistricts() {
  return atlasData.structure.nodes
    .filter((node) => node.kind === "district")
    .sort((left, right) => right.documentCount - left.documentCount || left.label.localeCompare(right.label, "ko"));
}

export function navigatorHomeScenes() {
  return workspaceSceneRegistry.home.scenes;
}

export function navigatorHomeTarget(sceneId: string) {
  return { workspace: "home" as const, sceneId };
}

export function navigatorDistrictTarget(districtId: string) {
  return { workspace: "explore" as const, sceneId: "hubs", focusId: districtId };
}

function getFocusable(container: HTMLElement | null) {
  return [...(container?.querySelectorAll<HTMLElement>(
    "button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex='-1'])",
  ) ?? [])].filter((item) => item.offsetParent !== null);
}

export function NavigatorTray() {
  const { state, dispatch } = useAtlasState();
  const trayRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const isMobile = state.mobileSibling;

  const close = () => dispatch({ type: "panelSet", panel: "none" });

  useLayoutEffect(() => {
    if (!isMobile) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const background = [
      document.querySelector<HTMLElement>(".command-bar"),
      document.querySelector<HTMLElement>(".workspace-main"),
    ].filter(Boolean) as HTMLElement[];
    const previousOverflow = document.body.style.overflow;
    getFocusable(trayRef.current)[0]?.focus();
    background.forEach((node) => node.setAttribute("inert", ""));
    document.body.style.overflow = "hidden";
    return () => {
      background.forEach((node) => node.removeAttribute("inert"));
      document.body.style.overflow = previousOverflow;
      const target = returnFocusRef.current;
      returnFocusRef.current = null;
      requestAnimationFrame(() => target?.focus());
    };
  }, [isMobile]);

  const handleDialogKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const intent = trayDialogKeyIntent(event.key, isMobile, false);
    if (intent === "close") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (intent !== "trap-focus") return;
    const focusables = getFocusable(trayRef.current);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const finishMobileSelection = () => {
    if (isMobile) close();
  };

  return (
    <Fragment>
      <div className="tray-backdrop navigator-backdrop" aria-hidden="true" onMouseDown={close} />
      <div
        ref={trayRef}
        id="atlas-navigator-tray"
        className="side-tray navigator-tray"
        lang="ko"
        role={isMobile ? "dialog" : "complementary"}
        aria-modal={isMobile ? "true" : undefined}
        aria-labelledby="navigator-tray-title"
        onKeyDown={handleDialogKey}
      >
        <div className="tray-heading">
          <span className="eyebrow">NAVIGATOR</span>
          <h2 id="navigator-tray-title">{({
            home: "Home insights",
            explore: "Explore City",
            observe: "Observe relations",
            flow: "Flow routes",
            time: "Time evidence",
            agency: "Agency system",
          } as const)[state.workspace]}</h2>
          <button className="mobile-tray-close icon-button" type="button" onClick={close} aria-label="탐색 패널 닫기">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <nav className="navigator-workspaces" aria-label="작업 공간 바로가기">
          {[
            { id: "home", label: "Home", icon: Home },
            { id: "explore", label: "Explore", icon: FolderTree },
            { id: "observe", label: "Observe", icon: Rows3 },
            { id: "flow", label: "Flow", icon: Route },
            { id: "time", label: "Time", icon: Clock3 },
            { id: "agency", label: "Agency", icon: UsersRound },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={state.workspace === item.id ? "is-current" : ""}
                aria-current={state.workspace === item.id ? "page" : undefined}
                onClick={() => {
                  dispatch({ type: "workspace", workspace: item.id as typeof state.workspace });
                  finishMobileSelection();
                }}
              >
                <Icon size={16} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {state.workspace === "home" && (
          <div className="navigator-list">
            {navigatorHomeScenes().map((scene) => (
              <button
                key={scene.id}
                type="button"
                className={state.sceneId === scene.id ? "is-active" : ""}
                aria-current={state.sceneId === scene.id ? "true" : undefined}
                onClick={() => {
                  dispatch({
                    type: "journey",
                    target: navigatorHomeTarget(scene.id),
                  });
                  finishMobileSelection();
                }}
              >
                <FileText size={16} aria-hidden="true" />
                <span><strong>{scene.label}</strong><small>{scene.title}</small></span>
                <ChevronRight size={15} aria-hidden="true" />
              </button>
            ))}
          </div>
        )}

        {state.workspace === "explore" && (
          <div className="navigator-list">
            {navigatorDistricts().map((district) => (
                <button
                  key={district.id}
                  type="button"
                  className={state.focusId === district.id ? "is-active" : ""}
                  aria-current={state.focusId === district.id ? "true" : undefined}
                  onClick={() => {
                    dispatch({ type: "journey", target: navigatorDistrictTarget(district.id) });
                    finishMobileSelection();
                  }}
                >
                  <FolderTree size={16} aria-hidden="true" />
                  <span><strong>{district.label}</strong><small>{district.documentCount}개 표현 기록</small></span>
                  <ChevronRight size={15} aria-hidden="true" />
                </button>
              ))}
          </div>
        )}

        {state.workspace === "observe" && (
          <div className="navigator-list">
            {[...atlasData.relation.matrix]
              .sort((a, b) => b.total - a.total)
              .slice(0, 12)
              .map((pair) => (
                <button
                  key={pair.id}
                  type="button"
                  className={pair.id === state.relationPairId ? "is-active" : ""}
                  aria-current={pair.id === state.relationPairId ? "true" : undefined}
                  onClick={() => {
                    dispatch({ type: "relationPair", relationPairId: pair.id });
                    finishMobileSelection();
                  }}
                >
                  <Rows3 size={16} aria-hidden="true" />
                  <span><strong>{pair.source} ↔ {pair.target}</strong><small>링크 출현 {pair.wikilink} · 명시 {pair.typed} · 흐름 {pair.route}</small></span>
                  <ChevronRight size={15} aria-hidden="true" />
                </button>
              ))}
          </div>
        )}

        {state.workspace === "flow" && (
          <div className="navigator-list">
            {atlasData.flow.routes.map((route) => (
              <button
                key={route.id}
                type="button"
                className={route.id === state.routeId ? "is-active" : ""}
                aria-current={route.id === state.routeId ? "true" : undefined}
                onClick={() => {
                  dispatch({ type: "route", routeId: route.id });
                  finishMobileSelection();
                }}
              >
                <Route size={16} aria-hidden="true" />
                <span><strong>{route.label}</strong><small>{route.stations.length}개 경유점</small></span>
                <ChevronRight size={15} aria-hidden="true" />
              </button>
            ))}
          </div>
        )}

        {state.workspace === "time" && (
          <div className="navigator-list">
            {atlasData.temporal.eras.map((era) => (
              <button
                key={era.id}
                type="button"
                className={era.id === state.eraId ? "is-active" : ""}
                aria-current={era.id === state.eraId ? "true" : undefined}
                onClick={() => {
                  dispatch({ type: "era", eraId: era.id });
                  finishMobileSelection();
                }}
              >
                <span className="era-number">{String(era.id).padStart(2, "0")}</span>
                <span><strong>{era.title}</strong><small>{era.range}</small></span>
                <ChevronRight size={15} aria-hidden="true" />
              </button>
            ))}
          </div>
        )}

        <div className="tray-footer-note">
          <FileText size={15} aria-hidden="true" />
          <span>보관본은 현재 Vault 구조와 분리되어 있습니다.</span>
        </div>
      </div>
    </Fragment>
  );
}
