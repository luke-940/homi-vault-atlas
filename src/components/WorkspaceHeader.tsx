import type { ReactNode } from "react";
import { ChevronRight, Database, Maximize2, Minimize2 } from "lucide-react";
import { useAtlasState } from "../state";
import { atlasData, entityById, graphNodeById } from "../data-runtime";
import { workspaceScene, workspaceSceneRegistry } from "./workspaceSceneRegistry";

export function WorkspaceHeader({
  titleId,
  eyebrow,
  title,
  question,
  answer,
  controls,
  keyItems,
}: {
  titleId: string;
  eyebrow: string;
  title: string;
  question: string;
  answer: string;
  controls?: ReactNode;
  keyItems?: Array<{ label: string; className: string }>;
}) {
  const { state, dispatch } = useAtlasState();
  const definition = workspaceSceneRegistry[state.workspace];
  const currentScene = workspaceScene(state.workspace, state.sceneId);
  const selection = state.workspace === "agency"
    ? atlasData.agency.actors.find((actor) => actor.id === state.actorId)?.label
    : entityById.get(state.focusId ?? "")?.displayLabel ?? graphNodeById.get(state.focusId ?? "")?.label;
  return (
    <header className="workspace-header">
      <div className="workspace-title">
        <nav className="workspace-breadcrumb" aria-label="Atlas location" lang="en">
          <button type="button" onClick={() => dispatch({ type: "workspace", workspace: "home" })}>Home</button>
          {state.workspace !== "home" && <><ChevronRight size={12} aria-hidden="true" /><span>{definition.label}</span></>}
          <ChevronRight size={12} aria-hidden="true" />
          <span>{currentScene.label}</span>
          {selection && <><ChevronRight size={12} aria-hidden="true" /><span lang="ko">{selection}</span></>}
        </nav>
        <span className="eyebrow" lang={/[가-힣]/.test(eyebrow) ? "ko" : "en"}>{eyebrow}</span>
        <h1 id={titleId} tabIndex={-1} lang="ko">{title}</h1>
        <p className="workspace-answer" lang="ko"><span className="sr-only">{question} 현재 데이터의 답: </span>{answer}</p>
      </div>
      <div className="workspace-header-tools">
        {definition.scenes.length > 1 && (
          <div className="workspace-scene-switch" role="tablist" aria-label={`${definition.label} scenes`} lang="en">
            {definition.scenes.map((scene) => (
              <button
                key={scene.id}
                type="button"
                role="tab"
                aria-selected={scene.id === currentScene.id}
                className={scene.id === currentScene.id ? "is-active" : ""}
                onClick={() => dispatch({ type: "journey", target: { workspace: state.workspace, sceneId: scene.id } })}
              >
                {scene.label}
              </button>
            ))}
          </div>
        )}
        {keyItems && (
          <div className="inline-map-key" role="group" aria-label="지도 표식">
            {keyItems.map((item) => (
              <span key={item.label}><i className={item.className} aria-hidden="true" />{item.label}</span>
            ))}
          </div>
        )}
        {controls}
        <button
          type="button"
          className="icon-button mobile-data-trigger"
          onClick={() => dispatch({ type: "panel", panel: "data" })}
          aria-label="데이터 기준 열기"
          aria-expanded={state.panel === "data"}
          aria-controls="atlas-inspector-tray"
          title="데이터 기준"
        >
          <Database size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="icon-button theatre-button"
          onClick={() => dispatch({ type: "theatre", open: !state.theatre })}
          aria-label={state.theatre ? "전체 화면형 보기 닫기" : "전체 화면형 보기"}
          title={state.theatre ? "작업 화면으로 돌아가기 (F)" : "지도 크게 보기 (F)"}
        >
          {state.theatre ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
      </div>
    </header>
  );
}
