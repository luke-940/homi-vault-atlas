import type { ReactNode } from "react";
import { Database, Maximize2, Minimize2 } from "lucide-react";
import { useAtlasState } from "../state";

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
  return (
    <header className="workspace-header">
      <div className="workspace-title">
        <span className="eyebrow">{eyebrow}</span>
        <h1 id={titleId} tabIndex={-1}>{title}</h1>
        <p className="workspace-answer"><span className="sr-only">{question} 현재 데이터의 답: </span>{answer}</p>
      </div>
      <div className="workspace-header-tools">
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
