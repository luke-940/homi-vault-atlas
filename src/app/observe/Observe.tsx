import {
  BetweenHorizontalStart,
  BookOpenText,
  Grid3X3,
  Orbit,
} from "lucide-react";
import type { ObserveMode } from "../contracts";
import { useAtlas } from "../state";
import { WorkspaceTitle } from "../WorkspaceTitle";
import { EvidenceWorkbench } from "./ObserveEvidence";
import { GlobalRelations } from "./ObserveGlobal";
import { NodeWorkbench } from "./ObserveNode";
import { RelationWorkbench } from "./ObserveRelation";

const modeCopy: Record<ObserveMode, {
  label: string;
  question: string;
  icon: typeof Grid3X3;
}> = {
  global: {
    label: "Global Relations",
    question: "어느 영역이 어디로 향하는가",
    icon: Grid3X3,
  },
  node: {
    label: "Node Workbench",
    question: "이 지식은 무엇을 말하는가",
    icon: Orbit,
  },
  relation: {
    label: "Relation Workbench",
    question: "왜 이 방향 관계가 존재하는가",
    icon: BetweenHorizontalStart,
  },
  evidence: {
    label: "Evidence Reader",
    question: "이 해석은 무엇에 근거하는가",
    icon: BookOpenText,
  },
};

const modes = Object.keys(modeCopy) as ObserveMode[];

export function Observe() {
  const atlas = useAtlas();
  const mode = atlas.route.observeMode;
  return (
    <main className="workspace-layout analysis-layout observe-workbench">
      <WorkspaceTitle workspace="Observe" context={modeCopy[mode].label} />
      <nav className="observe-mode-deck" aria-label="Observe workbench modes">
        {modes.map((item) => {
          const Icon = modeCopy[item].icon;
          return (
            <button
              type="button"
              key={item}
              aria-current={mode === item ? "page" : undefined}
              onClick={() => atlas.setObserveMode(item)}
            >
              <Icon size={16} aria-hidden="true" />
              <span>
                <strong>{modeCopy[item].label}</strong>
                <small>{modeCopy[item].question}</small>
              </span>
            </button>
          );
        })}
      </nav>
      {mode === "global" ? <GlobalRelations /> : null}
      {mode === "node" ? <NodeWorkbench /> : null}
      {mode === "relation" ? <RelationWorkbench /> : null}
      {mode === "evidence" ? <EvidenceWorkbench /> : null}
    </main>
  );
}
