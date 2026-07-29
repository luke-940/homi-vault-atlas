import { ArrowRight, ShieldCheck } from "lucide-react";
import { useMemo } from "react";
import { useAtlas } from "./state";
import { WorkspaceTitle } from "./WorkspaceTitle";

export function Flow() {
  const atlas = useAtlas();
  const routes = useMemo(() => atlas.runtime.graph.edges
    .filter((edge) => {
      const source = atlas.runtime.graph.nodes[edge.source];
      const target = atlas.runtime.graph.nodes[edge.target];
      return source.domain !== target.domain;
    })
    .sort((left, right) => right.occurrences - left.occurrences
      || left.id.localeCompare(right.id, "en"))
    .slice(0, 12), [atlas.runtime.graph]);
  return (
    <main className="workspace-layout analysis-layout">
      <WorkspaceTitle workspace="Flow" context="Verified Trails" />
      <section className="trail-list">
        {routes.map((edge, index) => {
          const source = atlas.runtime.graph.nodes[edge.source];
          const target = atlas.runtime.graph.nodes[edge.target];
          return (
            <button
              type="button"
              key={edge.id}
              onClick={() => atlas.openPath(source.id, target.id)}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div><small>{source.domain}</small><strong>{source.label}</strong></div>
              <ArrowRight aria-hidden="true" size={18} />
              <div><small>{target.domain}</small><strong>{target.label}</strong></div>
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
      <WorkspaceTitle workspace="Time" context="Version Evolution" />
      <section className="version-evolution">
        <div>
          <span>v7.8</span>
          <h2>Open Knowledge Cosmos</h2>
          <p>공개 안전한 전체 지형과 실제 이름의 기준선</p>
        </div>
        <ArrowRight size={24} aria-hidden="true" />
        <div className="version-evolution__current">
          <span>CURRENT SNAPSHOT</span>
          <h2>Knowledge Workbench</h2>
          <p>{captured.toLocaleDateString("ko-KR")}에 안정적으로 캡처한 지식 읽기 기준선</p>
          <dl>
            <div><dt>Named nodes</dt><dd>{atlas.runtime.graph.manifest.nodeCount}</dd></div>
            <div><dt>Directed edges</dt><dd>{atlas.runtime.graph.manifest.edgeCount}</dd></div>
            <div><dt>Reviewed dossiers</dt><dd>{atlas.runtime.knowledge.manifest.dossierCount}</dd></div>
          </dl>
        </div>
      </section>
      <p className="time-caveat">
        파일 mtime과 부재를 활동·소멸로 추정하지 않습니다. 검증된 snapshot 차이만 시간으로 승격합니다.
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
      <WorkspaceTitle workspace="Agency" context="Responsibility Boundary" />
      <section className="agency-map">
        <div className="agency-principal">
          <img src="./assets/brand/homi-mark-amber.svg" alt="" />
          <span>Human Owner</span>
          <strong>{agency.principal.label}</strong>
          <p>방향을 정한다. 지식 노드나 실시간 운영 상태는 아니다.</p>
        </div>
        {agency.groups.map((group) => (
          <div className="agency-group" key={group.id}>
            <header><span>{group.kind}</span><h2>{group.label}</h2></header>
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
