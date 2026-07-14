import {
  Binoculars,
  Compass,
  Database,
  Focus,
  GitBranch,
  Menu,
  Minimize2,
  Route,
  Search,
  X,
} from "lucide-react";
import type { KeyboardEvent } from "react";
import { atlasData } from "../data";
import { useAtlasState } from "../state";
import type { Workspace } from "../types";
import homiLockup from "../assets/brand/homi-ai-lockup-light-amber.svg";

const workspaceItems: Array<{
  id: Workspace;
  label: string;
  icon: typeof Compass;
}> = [
  { id: "explore", label: "탐색", icon: Compass },
  { id: "observe", label: "관측", icon: Binoculars },
  { id: "flow", label: "흐름", icon: Route },
  { id: "time", label: "시간", icon: GitBranch },
];

export function CommandBar() {
  const { state, dispatch } = useAtlasState();
  const snapshot = atlasData.bootstrap.snapshot;
  const isPublic = atlasData.publication.profile === "public";
  const publicDocumentCount = atlasData.publication.redactionCounts.aggregatedSourceDocuments
    ?? snapshot.activeMarkdownCount;

  const handleWorkspaceKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = workspaceItems.length - 1;
    let nextIndex = index;
    if (event.key === "ArrowRight") nextIndex = index === last ? 0 : index + 1;
    else if (event.key === "ArrowLeft") nextIndex = index === 0 ? last : index - 1;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = last;
    else return;
    event.preventDefault();
    const next = workspaceItems[nextIndex];
    dispatch({ type: "workspace", workspace: next.id });
    requestAnimationFrame(() => document.getElementById(`workspace-tab-${next.id}`)?.focus());
  };

  return (
    <header className="command-bar">
      <button
        className={state.workspace === "home" ? "brand-lockup is-current" : "brand-lockup"}
        id="workspace-tab-home"
        type="button"
        onClick={() => dispatch({ type: "workspace", workspace: "home" })}
        aria-label="지식 Pulse 대문으로 이동"
        aria-current={state.workspace === "home" ? "page" : undefined}
        aria-controls="workspace-panel-home"
      >
        <img className="brand-mark" src={homiLockup} alt="" aria-hidden="true" />
        <span className="brand-copy">
          <strong>호미 볼트 아틀라스</strong>
          <small>Living Insight Gateway</small>
        </span>
      </button>

      <div className="snapshot-ledger" role="group" aria-label="현재 스냅샷">
        <span>{isPublic ? `공개 집계 ${publicDocumentCount}문서` : `활성 문서 ${snapshot.activeMarkdownCount}`}</span>
        <span>기준 {new Date(atlasData.bootstrap.generatedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
      </div>

      <nav className="workspace-tabs" role="tablist" aria-label="아틀라스 작업 공간">
        {workspaceItems.map((item, index) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              id={`workspace-tab-${item.id}`}
              className={state.workspace === item.id ? "workspace-tab is-active" : "workspace-tab"}
              type="button"
              role="tab"
              onClick={() => dispatch({ type: "workspace", workspace: item.id })}
              onKeyDown={(event) => handleWorkspaceKey(event, index)}
              aria-selected={state.workspace === item.id}
              aria-controls={`workspace-panel-${item.id}`}
              tabIndex={state.workspace === item.id || (state.workspace === "home" && index === 0) ? 0 : -1}
              aria-label={`${item.label} 작업 공간`}
              title={`${item.label} 작업 공간`}
            >
              <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="command-actions">
        {state.theatre && (
          <button
            className="icon-button theatre-exit is-active"
            type="button"
            onClick={() => dispatch({ type: "theatre", open: false })}
            aria-label="큰 지도 보기 닫기"
            title="큰 지도 보기 닫기 (Esc)"
          >
            <Minimize2 size={18} aria-hidden="true" />
          </button>
        )}
        <button
          className="tool-button search-trigger"
          type="button"
          onClick={() => dispatch({ type: "search", open: true })}
          aria-label="문서와 구역 찾기"
          title="문서와 구역 찾기 (⌘K)"
        >
          <Search size={17} aria-hidden="true" />
          <span>찾기</span>
          <kbd>⌘K</kbd>
        </button>
        <button
          id="navigator-trigger"
          className={state.panel === "navigator" ? "icon-button panel-trigger is-active" : "icon-button panel-trigger"}
          type="button"
          onClick={() => dispatch({ type: "panel", panel: "navigator" })}
          aria-label={state.panel === "navigator" ? "탐색 패널 닫기" : "탐색 패널 열기"}
          aria-expanded={state.panel === "navigator"}
          aria-controls="atlas-navigator-tray"
          aria-haspopup="dialog"
          title="탐색 패널"
        >
          {state.panel === "navigator" ? <X size={18} /> : <Menu size={18} />}
        </button>
        <button
          id="inspector-trigger"
          className={state.panel === "inspector" ? "icon-button panel-trigger is-active" : "icon-button panel-trigger"}
          type="button"
          onClick={() => dispatch({ type: "panel", panel: "inspector" })}
          aria-label={state.panel === "inspector" ? "현재 선택 해석 닫기" : "현재 선택 해석 열기"}
          aria-expanded={state.panel === "inspector"}
          aria-controls="atlas-inspector-tray"
          aria-haspopup="dialog"
          title="현재 선택 해석"
        >
          <Focus size={18} />
        </button>
        <button
          id="data-trigger"
          className={state.panel === "data" ? "icon-button panel-trigger data-trigger is-active" : "icon-button panel-trigger data-trigger"}
          type="button"
          onClick={() => dispatch({ type: "panel", panel: "data" })}
          aria-label={state.panel === "data" ? "데이터 기준 닫기" : "데이터 기준 열기"}
          aria-expanded={state.panel === "data"}
          aria-controls="atlas-inspector-tray"
          aria-haspopup="dialog"
          title="데이터 기준"
        >
          <Database size={18} />
        </button>
      </div>
    </header>
  );
}
