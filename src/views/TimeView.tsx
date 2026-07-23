import { ArrowRight, ShieldCheck } from "lucide-react";
import { useEffect } from "react";
import { SpatialWorkspaceFrame } from "../components/SpatialWorkspaceFrame";
import { WorkspaceHeader } from "../components/WorkspaceHeader";
import { atlasData, graphNodeById } from "../data-runtime";
import {
  graphNodeKindLabel,
  graphNodeLabel,
  humanReadableKnowledgeLabel,
  movementKindLabel,
} from "../graph/model";
import { useAtlasState } from "../state";
import type { MeaningMovement } from "../types";

type MovementMetric = {
  id: string;
  label: string;
  previous: unknown;
  current: unknown;
};

const movementMetricDefinitions = Object.freeze([
  { id: "nodes", label: "지식 항목", aliases: ["nodes", "nodeCount"] },
  { id: "edges", label: "참조 관계", aliases: ["edges", "edgeCount"] },
  { id: "gravity", label: "참조한 고유 문서", aliases: ["gravity"] },
  { id: "occurrences", label: "전체 참조 횟수", aliases: ["occurrences", "occurrenceCount"] },
  { id: "meaningfulDate", label: "의미 날짜", aliases: ["meaningfulDate"] },
] as const);

function metricValue(
  values: Record<string, unknown> | null,
  aliases: readonly string[],
) {
  if (!values) return undefined;
  const key = aliases.find((alias) => values[alias] !== undefined);
  return key ? values[key] : undefined;
}

function movementMetrics(movement: MeaningMovement): MovementMetric[] {
  return movementMetricDefinitions
    .map((definition) => ({
      id: definition.id,
      label: definition.label,
      previous: metricValue(movement.previousValue, definition.aliases),
      current: metricValue(movement.currentValue, definition.aliases),
    }))
    .filter((metric) => metric.previous !== undefined || metric.current !== undefined);
}

function formatMetricValue(value: unknown) {
  if (value === undefined || value === null || value === "") return "기록 없음";
  if (typeof value === "number") return value.toLocaleString("ko-KR");
  return String(value);
}

function formatSnapshotDate(value: string) {
  return value.replaceAll("-", ".");
}

function snapshotMetrics(nodeCount: number, edgeCount: number) {
  return `${nodeCount.toLocaleString("ko-KR")}개 지식 항목 · ${edgeCount.toLocaleString("ko-KR")}개 방향 참조`;
}

function movementElementId(index: number) {
  return `version-seam-change-${index}`;
}

export function TimeView() {
  const { state, dispatch } = useAtlasState();
  const { baseline, current, movements } = atlasData.meaning;
  const activeChangeId = state.previewChangeId ?? state.changeId;

  useEffect(() => {
    if (!state.changeId) return;
    const index = movements.findIndex((movement) => movement.id === state.changeId);
    if (index < 0) return;
    requestAnimationFrame(() => {
      document.getElementById(movementElementId(index))?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
      });
    });
  }, [movements, state.changeId]);

  return (
    <SpatialWorkspaceFrame className="workspace-view time-v76" aria-labelledby="time-title">
      <WorkspaceHeader
        titleId="time-title"
        eyebrow="TIME · VERSION EVOLUTION"
        title="이전 릴리스 이후 검증된 지식 변화만 읽습니다"
        question="Vault는 실제로 무엇이 달라졌고, 어떤 변화는 추정하지 않아야 하는가?"
        answer={`${baseline.release}에서 ${current.release} 사이에 ${movements.length}개의 검증된 변화를 분리했습니다. 파일 mtime과 실행 건수는 지식 변화로 세지 않습니다.`}
        keyItems={[
          { label: "이전 기준선", className: "key-era-persisted" },
          { label: "검증된 변화", className: "key-era-weakened" },
          { label: "현재 스냅샷", className: "key-era-born" },
        ]}
      />

      <div className="time-v76-layout version-seam">
        <aside className="version-seam__brief">
          <span className="eyebrow">VERIFIED VERSION SEAM</span>
          <h2>{baseline.release} → {current.release}</h2>
          <p>하나의 기준선과 하나의 현재 스냅샷 사이에서, 실제 지식 항목과 방향 관계로 증명된 차이만 연결합니다.</p>
          <div className="version-seam__truth-note" role="note">
            <ShieldCheck size={18} aria-hidden="true" />
            <p>기록이 없다는 사실은 변화 0이나 활동 부재를 뜻하지 않습니다. 수정 시각만 바뀐 항목도 변화로 만들지 않습니다.</p>
          </div>
        </aside>

        <section className="version-seam__stage" aria-label={`${baseline.release}에서 ${current.release}까지의 검증된 변화`}>
          <article className="version-seam__anchor version-seam__anchor--baseline">
            <span>BASELINE</span>
            <strong>{baseline.release}</strong>
            <time dateTime={baseline.asOfDate}>{formatSnapshotDate(baseline.asOfDate)}</time>
            <small>{snapshotMetrics(baseline.graphNodeCount, baseline.graphEdgeCount)}</small>
          </article>

          <div className="version-seam__track">
            {movements.length ? (
              <ol className="version-seam__movements">
                {movements.map((movement, index) => {
                  const node = movement.nodeIds
                    .map((id) => graphNodeById.get(id))
                    .find((candidate) => candidate !== undefined);
                  const district = node ? graphNodeById.get(node.districtId) : undefined;
                  const metrics = movementMetrics(movement);
                  const title = node
                    ? graphNodeLabel(node)
                    : humanReadableKnowledgeLabel(movement.label);

                  return (
                    <li
                      id={movementElementId(index)}
                      key={movement.id}
                      className={[
                        "version-seam__movement",
                        `version-seam__movement--${movement.kind}`,
                        movement.id === state.changeId ? "is-selected" : "",
                        movement.id === state.previewChangeId ? "is-previewed" : "",
                      ].filter(Boolean).join(" ")}
                      aria-current={movement.id === state.changeId ? "true" : undefined}
                      data-change-id={movement.id}
                      data-change-active={movement.id === activeChangeId ? "true" : "false"}
                      onPointerEnter={() => dispatch({ type: "previewChange", changeId: movement.id })}
                      onPointerLeave={() => dispatch({ type: "previewChange", changeId: null })}
                      onFocus={() => dispatch({ type: "previewChange", changeId: movement.id })}
                      onBlur={() => dispatch({ type: "previewChange", changeId: null })}
                    >
                      <span className="version-seam__marker" aria-hidden="true" />
                      <article className="version-seam__movement-card">
                        <header className="version-seam__movement-heading">
                          <div>
                            <span className="version-seam__movement-kind">{movementKindLabel(movement.kind)}</span>
                            <h3>{title}</h3>
                          </div>
                          <p className="version-seam__movement-context">
                            {node
                              ? `${graphNodeKindLabel(node.kind)} · ${district ? graphNodeLabel(district) : "지식 구역 미기록"}`
                              : `${atlasData.graph.profile === "atlas-owner" ? "Owner" : "Public"} 지식 지형 · 전체 투영`}
                          </p>
                        </header>

                        <div className="version-seam__metrics" aria-label={`${title}의 이전 값과 현재 값`}>
                          {metrics.map((metric) => (
                            <div className="version-seam__metric" key={metric.id}>
                              <span>{metric.label}</span>
                              <p>
                                <del>{formatMetricValue(metric.previous)}</del>
                                <ArrowRight size={14} aria-hidden="true" />
                                <strong>{formatMetricValue(metric.current)}</strong>
                              </p>
                            </div>
                          ))}
                        </div>

                        <p className="version-seam__caveat">{movement.caveat}</p>
                        {node && (
                          <button
                            className="version-seam__journey"
                            type="button"
                            onClick={() => dispatch({
                              type: "journey",
                              target: { workspace: "explore", sceneId: "graph", focusId: node.id },
                            })}
                          >
                            Explore에서 실제 관계 보기
                            <ArrowRight size={15} aria-hidden="true" />
                          </button>
                        )}
                      </article>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <div className="workspace-honest-empty version-seam__empty" role="note">
                <ShieldCheck size={24} aria-hidden="true" />
                <h2>검증된 버전 변화가 없습니다.</h2>
                <p>기록이 없다는 사실을 변화 0이나 활동 부재로 해석하지 않습니다.</p>
              </div>
            )}
          </div>

          <article className="version-seam__anchor version-seam__anchor--current">
            <span>CURRENT SNAPSHOT</span>
            <strong>{current.release}</strong>
            <time dateTime={current.asOfDate}>{formatSnapshotDate(current.asOfDate)}</time>
            <small>{snapshotMetrics(current.graphNodeCount, current.graphEdgeCount)}</small>
          </article>
        </section>
      </div>
    </SpatialWorkspaceFrame>
  );
}
