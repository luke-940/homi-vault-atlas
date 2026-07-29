import { ArrowRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useAtlas } from "../state";
import {
  buildDomainMatrix,
  domainPairEdges,
  edgeEndpoints,
  strongestDomainPair,
} from "./observe-model";

export function GlobalRelations() {
  const atlas = useAtlas();
  const domains = atlas.runtime.graph.domains;
  const matrix = useMemo(() => buildDomainMatrix(atlas.runtime.graph), [atlas.runtime.graph]);
  const [pair, setPair] = useState<[number, number] | null>(() => strongestDomainPair(matrix));
  const max = Math.max(1, ...matrix.flat());
  const selectedEdges = domainPairEdges(atlas.runtime.graph, pair);

  return (
    <div className="observe-global">
      <section className="matrix-panel" aria-label="Directed domain relation matrix">
        <header>
          <div>
            <span>DOMAIN FIELD</span>
            <strong>행 = 출발 영역 · 열 = 도착 영역</strong>
          </div>
          <p>셀을 선택하면 실제 edge 구성과 방향이 오른쪽에서 바뀝니다.</p>
        </header>
        <div className="matrix" style={{ "--matrix-count": domains.length } as React.CSSProperties}>
          <span />
          {domains.map((domain) => <strong key={`h-${domain.id}`}>{domain.label}</strong>)}
          {domains.flatMap((source, row) => [
            <strong key={`r-${source.id}`}>{source.label}</strong>,
            ...domains.map((target, column) => {
              const value = matrix[row][column];
              return (
                <button
                  type="button"
                  key={`${source.id}-${target.id}`}
                  aria-label={`${source.label}에서 ${target.label}로 ${value}회`}
                  aria-pressed={pair?.[0] === row && pair?.[1] === column}
                  onClick={() => setPair([row, column])}
                  style={{
                    "--cell-strength": Math.sqrt(value / max),
                    "--source-color": source.color,
                    "--target-color": target.color,
                  } as React.CSSProperties}
                >
                  {value || "–"}
                </button>
              );
            }),
          ])}
        </div>
      </section>
      <aside className="pair-lens" aria-live="polite">
        <span className="pair-lens__eyebrow">DIRECTIONAL PAIR LENS</span>
        {pair ? (
          <>
            <div className="pair-lens__route">
              <div style={{ "--domain-color": domains[pair[0]].color } as React.CSSProperties}>
                <small>FROM</small>
                <strong>{domains[pair[0]].label}</strong>
              </div>
              <span>
                <b>{matrix[pair[0]][pair[1]].toLocaleString("ko-KR")}</b>
                <ArrowRight size={20} aria-hidden="true" />
                <small>occurrences</small>
              </span>
              <div style={{ "--domain-color": domains[pair[1]].color } as React.CSSProperties}>
                <small>TO</small>
                <strong>{domains[pair[1]].label}</strong>
              </div>
            </div>
            <p>아래 항목은 이 corridor를 이루는 실제 directed edge입니다.</p>
            <ol className="pair-lens__edges">
              {selectedEdges.map((edge) => {
                const { source, target } = edgeEndpoints(atlas.runtime.graph, edge);
                return (
                  <li key={edge.id}>
                    <button type="button" onClick={() => atlas.openObserveRelation(source.id, target.id)}>
                      <span>{source.label}</span>
                      <ArrowRight size={12} aria-hidden="true" />
                      <span>{target.label}</span>
                      <b>{edge.occurrences}</b>
                    </button>
                  </li>
                );
              })}
            </ol>
            {!selectedEdges.length ? (
              <p className="evidence-gap">이 방향의 직접 연결은 없습니다.</p>
            ) : null}
          </>
        ) : (
          <p className="empty-note">관계 방향을 선택해 주세요.</p>
        )}
      </aside>
    </div>
  );
}
