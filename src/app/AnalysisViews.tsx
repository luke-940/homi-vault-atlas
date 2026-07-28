import { ArrowRight, ExternalLink, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { useAtlas } from "./state";

export function Observe() {
  const atlas = useAtlas();
  const domains = atlas.runtime.graph.domains;
  const [pair, setPair] = useState<[number, number] | null>(null);
  const matrix = useMemo(() => {
    const rows = Array.from({ length: domains.length }, () => Array(domains.length).fill(0) as number[]);
    for (const edge of atlas.runtime.graph.edges) {
      const source = atlas.runtime.graph.nodes[edge.source];
      const target = atlas.runtime.graph.nodes[edge.target];
      rows[source.domainIndex][target.domainIndex] += edge.occurrences;
    }
    return rows;
  }, [atlas.runtime.graph, domains.length]);
  const max = Math.max(1, ...matrix.flat());
  const selectedEdges = pair ? atlas.runtime.graph.edges
    .filter((edge) => {
      const source = atlas.runtime.graph.nodes[edge.source];
      const target = atlas.runtime.graph.nodes[edge.target];
      return source.domainIndex === pair[0] && target.domainIndex === pair[1];
    })
    .sort((left, right) => right.occurrences - left.occurrences)
    .slice(0, 8) : [];
  return (
    <main className="workspace-layout analysis-layout">
      <WorkspaceTitle eyebrow="OBSERVE · GLOBAL RELATIONS" title="구역 사이의 방향 관계를 비교한다." />
      <div className="analysis-grid">
        <section className="matrix-panel" aria-label="Directed domain relation matrix">
          <div className="matrix-axis-note">행 = 출발 영역 · 열 = 도착 영역</div>
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
                    style={{ "--cell-strength": Math.sqrt(value / max) } as React.CSSProperties}
                  >
                    {value || "–"}
                  </button>
                );
              }),
            ])}
          </div>
        </section>
        <aside className="pair-lens">
          <p className="eyebrow">DIRECTIONAL PAIR LENS</p>
          {pair ? (
            <>
              <h2>{domains[pair[0]].label} <ArrowRight size={18} /> {domains[pair[1]].label}</h2>
              <strong>{matrix[pair[0]][pair[1]].toLocaleString("ko-KR")} occurrences</strong>
              <ul>
                {selectedEdges.map((edge) => {
                  const source = atlas.runtime.graph.nodes[edge.source];
                  const target = atlas.runtime.graph.nodes[edge.target];
                  return (
                    <li key={edge.id}>
                      <button type="button" onClick={() => {
                        atlas.openPath(source.id, target.id);
                      }}>
                        <span>{source.label}</span>
                        <ArrowRight size={12} />
                        <span>{target.label}</span>
                        <small>{edge.occurrences}</small>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : <p>matrix cell을 선택하면 실제 구성 edge를 확인할 수 있습니다.</p>}
        </aside>
      </div>
    </main>
  );
}

export function Flow() {
  const atlas = useAtlas();
  const routes = useMemo(() => atlas.runtime.graph.edges
    .filter((edge) => {
      const source = atlas.runtime.graph.nodes[edge.source];
      const target = atlas.runtime.graph.nodes[edge.target];
      return source.domain !== target.domain;
    })
    .sort((left, right) => right.occurrences - left.occurrences || left.id.localeCompare(right.id, "en"))
    .slice(0, 12), [atlas.runtime.graph]);
  return (
    <main className="workspace-layout analysis-layout">
      <WorkspaceTitle eyebrow="FLOW · VERIFIED TRAILS" title="실제 영역 경계를 건너는 경로를 읽는다." />
      <section className="trail-list">
        {routes.map((edge, index) => {
          const source = atlas.runtime.graph.nodes[edge.source];
          const target = atlas.runtime.graph.nodes[edge.target];
          return (
            <button
              type="button"
              key={edge.id}
              onClick={() => {
                atlas.openPath(source.id, target.id);
              }}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <small>{source.domain}</small>
                <strong>{source.label}</strong>
              </div>
              <ArrowRight aria-hidden="true" size={18} />
              <div>
                <small>{target.domain}</small>
                <strong>{target.label}</strong>
              </div>
              <b>{edge.occurrences}</b>
            </button>
          );
        })}
      </section>
    </main>
  );
}

export function Time() {
  const atlas = useAtlas();
  const captured = new Date(atlas.runtime.graph.generatedAt);
  return (
    <main className="workspace-layout analysis-layout">
      <WorkspaceTitle eyebrow="TIME · VERSION EVOLUTION" title="검증된 버전 변화만 시간으로 읽는다." />
      <section className="version-evolution">
        <div>
          <span>v7.7</span>
          <h2>Semantic Space</h2>
          <p>실제 3D 공간과 의미 연결 계약의 기준선</p>
        </div>
        <ArrowRight size={24} aria-hidden="true" />
        <div className="version-evolution__current">
          <span>CURRENT SNAPSHOT</span>
          <h2>Open Knowledge Cosmos</h2>
          <p>{captured.toLocaleDateString("ko-KR")}에 안정적으로 캡처한 전체 공개 안전 지형</p>
          <dl>
            <div><dt>Named nodes</dt><dd>{atlas.runtime.graph.manifest.nodeCount}</dd></div>
            <div><dt>Directed edges</dt><dd>{atlas.runtime.graph.manifest.edgeCount}</dd></div>
            <div><dt>Domains</dt><dd>{atlas.runtime.graph.manifest.domainCount}</dd></div>
          </dl>
        </div>
      </section>
      <p className="time-caveat">
        파일 mtime과 부재를 활동·소멸로 추정하지 않습니다. 현재 장면은 릴리스 캡처의 구조 변화만 설명합니다.
      </p>
    </main>
  );
}

export function Agency() {
  const atlas = useAtlas();
  const agency = atlas.runtime.agency;
  if (!agency) {
    return <main className="workspace-layout"><p>Agency snapshot is unavailable.</p></main>;
  }
  return (
    <main className="workspace-layout analysis-layout">
      <WorkspaceTitle eyebrow="AGENCY · RESPONSIBILITY BOUNDARY" title="방향, 소유, 순환과 번역의 책임을 읽는다." />
      <section className="agency-map">
        <div className="agency-principal">
          <img src="./assets/brand/homi-mark-amber.svg" alt="" />
          <span>Human Owner</span>
          <strong>{agency.principal.label}</strong>
          <p>방향을 정한다. 지식 노드나 실시간 운영 상태는 아니다.</p>
        </div>
        {agency.groups.map((group) => (
          <div className="agency-group" key={group.id}>
            <header>
              <span>{group.kind}</span>
              <h2>{group.label}</h2>
            </header>
            <div>
              {agency.actors.filter((actor) => actor.groupId === group.id).map((actor) => (
                <article key={actor.id}>
                  <ShieldCheck size={16} aria-hidden="true" />
                  <h3>{actor.label}</h3>
                  <p>{actor.purpose}</p>
                  <dl>
                    <div><dt>Public output</dt><dd>{actor.publicOutput}</dd></div>
                    <div><dt>Proof</dt><dd>{actor.proof}</dd></div>
                    <div><dt>Boundary</dt><dd>{actor.stopBoundary}</dd></div>
                  </dl>
                </article>
              ))}
            </div>
          </div>
        ))}
      </section>
      <p className="agency-caveat">{agency.snapshot?.caveat ?? "검증된 버전 역할 스냅샷"}</p>
    </main>
  );
}

function WorkspaceTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <header className="workspace-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      <span className="snapshot-chip"><ExternalLink size={12} /> Release snapshot</span>
    </header>
  );
}
