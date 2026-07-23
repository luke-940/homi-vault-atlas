import { ArrowRight, CircleCheck, Route as RouteIcon, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { SpatialWorkspaceFrame } from "../components/SpatialWorkspaceFrame";
import { WorkspaceHeader } from "../components/WorkspaceHeader";
import { atlasData, graphNodeById } from "../data-runtime";
import { LivingGraphCanvas } from "../graph/LivingGraphCanvas";
import { graphNodeLabel, humanReadableKnowledgeLabel, shortestDirectedPath } from "../graph/model";
import { useAtlasState } from "../state";
import type { Route } from "../types";

const publicProfile = atlasData.publication.profile === "public";
const routeColors = ["#4fd5b9", "#6f91f4", "#ae82e3", "#a8d05f", "#f0a04b", "#f36f87"];

function verifiedRoutes() {
  return atlasData.flow.routes.filter((route) => (
    route.members.length > 1
    && route.stations.filter((station) => Boolean(station.entityId && graphNodeById.has(station.entityId))).length > 1
  ));
}

function routeColor(routeId: string) {
  const index = atlasData.flow.routes.findIndex((route) => route.id === routeId);
  return routeColors[Math.max(0, index) % routeColors.length];
}

function routeNodeIds(route: Route) {
  return route.stations
    .map((station) => station.entityId)
    .filter((id): id is string => Boolean(id && graphNodeById.has(id)));
}

function routeDisplayLabel(route: Route) {
  const nodeIds = routeNodeIds(route);
  const source = nodeIds[0] ? graphNodeById.get(nodeIds[0]) : null;
  const target = nodeIds.at(-1) ? graphNodeById.get(nodeIds.at(-1)!) : null;
  if (source && target) return `${graphNodeLabel(source)} → ${graphNodeLabel(target)}`;
  return humanReadableKnowledgeLabel(route.label) || "검증된 지식 경로";
}

function routeProvenanceLabel(provenance: string) {
  if (provenance === "atlas.graph.v1") return "Atlas 방향 지식 그래프";
  if (provenance === "resolved_wikilink_path") return "실제 문서 참조 경로";
  return humanReadableKnowledgeLabel(provenance.replaceAll("_", " "));
}

function routeQuestionLabel(question: string) {
  return question.replaceAll("위키링크", "문서 참조");
}

export function revealSelectedRoute(target: Pick<HTMLElement, "scrollIntoView"> | null) {
  if (!target) return false;
  target.scrollIntoView({ inline: "center", block: "nearest" });
  return true;
}

export function FlowView() {
  const { state, dispatch } = useAtlasState();
  const routes = verifiedRoutes();
  const route = routes.find((item) => item.id === state.routeId) ?? routes[0];
  const activeRouteRef = useRef<HTMLButtonElement>(null);
  const routeIds = useMemo(() => route ? routeNodeIds(route) : [], [route]);
  const from = routeIds[0] ?? null;
  const to = routeIds.at(-1) ?? null;
  const path = useMemo(() => shortestDirectedPath(atlasData.graph, from, to), [from, to]);
  const selectedNode = state.previewId
    ? graphNodeById.get(state.previewId) ?? null
    : graphNodeById.get(state.focusId ?? "") ?? (from ? graphNodeById.get(from) ?? null : null);

  useEffect(() => {
    revealSelectedRoute(activeRouteRef.current);
  }, [state.routeId]);

  return (
    <SpatialWorkspaceFrame className="workspace-view flow-view flow-v75-spatial" aria-labelledby="flow-title">
      <WorkspaceHeader
        titleId="flow-title"
        eyebrow="FLOW · VERIFIED ROUTES"
        title="검증된 경로를 실제 지식 좌표 위에서 추적한다"
        question="선택한 경로의 실제 지점, 참조 방향, 전체 참조 횟수만 남기고 다른 경로는 숨깁니다."
        answer={!route
          ? "현재 프로필에서 실제 구성원이 확인된 경로가 없습니다. 빈 상태는 활동 부재를 뜻하지 않습니다."
          : `${routeDisplayLabel(route)}은 ${routeIds.length}개 확인된 지점과 전체 참조 ${route.weight}건을 연결합니다.`}
        keyItems={[
          { label: "실제 경로 지점", className: "key-focus" },
          { label: "참조 방향 추적", className: "key-proof" },
          { label: "비선택 경로 숨김", className: "key-readable" },
        ]}
      />

      {!route ? (
        <div className="workspace-honest-empty flow-honest-empty" role="note">
          <ShieldCheck size={24} aria-hidden="true" />
          <h2>표시할 검증 경로가 없습니다.</h2>
          <p>구성원이 없는 자리표시자나 빈 경로는 시각화하지 않습니다.</p>
        </div>
      ) : (
        <>
          <nav className="scrollbar-clean spatial-editorial-index flow-route-index route-rail" aria-label="검증된 지식 경로 선택">
            {routes.map((item) => (
              <button
                key={item.id}
                ref={item.id === route.id ? activeRouteRef : undefined}
                type="button"
                className={`spatial-editorial-index__item${item.id === route.id ? " is-active" : ""}`}
                aria-pressed={item.id === route.id}
                onClick={() => dispatch({ type: "route", routeId: item.id })}
              >
                <i style={{ background: routeColor(item.id) }} aria-hidden="true" />
                <span><strong>{routeDisplayLabel(item)}</strong><small>경로 지점 {routeNodeIds(item).length}개 · 전체 참조 {item.weight}회</small></span>
              </button>
            ))}
          </nav>

          {!state.mobileSibling && <div className="desktop-visual-surface spatial-stage-layout flow-spatial-layout">
            <main className="spatial-stage spatial-stage--full-bleed flow-spatial-stage">
              <LivingGraphCanvas
                graph={atlasData.graph}
                scene="trace"
                focusId={state.focusId || from}
                previewId={state.previewId}
                from={from}
                to={to}
                mobile={state.mobileSibling}
                reducedMotion={state.reducedMotion}
                presentation="workspace"
                onSelect={(focusId) => dispatch({ type: "focus", focusId })}
                onHover={(focusId) => dispatch({ type: "preview", focusId })}
              />
            </main>
            <aside className="spatial-evidence-rail spatial-evidence-rail--typographic flow-evidence-rail flow-spatial-evidence" aria-live="polite">
              <header className="spatial-evidence-rail__header">
                <span className="eyebrow">SELECTED VERIFIED ROUTE</span>
                <h2>{routeDisplayLabel(route)}</h2>
                <p>{routeQuestionLabel(route.question)}</p>
              </header>
              <dl className="spatial-evidence-rail__metrics">
                <div><dt>참조 방향</dt><dd>{from && to ? `${graphNodeLabel(graphNodeById.get(from)!)} → ${graphNodeLabel(graphNodeById.get(to)!)}` : "미확인"}</dd></div>
                <div><dt>전체 참조 횟수</dt><dd>{route.weight.toLocaleString("ko-KR")}</dd></div>
                <div><dt>관계 단계</dt><dd>{Math.max(0, path.length - 1)}</dd></div>
                <div><dt>근거 유형</dt><dd>{routeProvenanceLabel(route.provenance)}</dd></div>
              </dl>
              {selectedNode && (
                <button className="spatial-evidence-rail__action" type="button" onClick={() => dispatch({ type: "journey", target: { workspace: "explore", sceneId: "graph", focusId: selectedNode.id } })}>
                  {graphNodeLabel(selectedNode)} · Explore에서 보기 <ArrowRight size={14} aria-hidden="true" />
                </button>
              )}
              {!publicProfile && atlasData.flow.pulse.chains.length > 0 && (
                <p className="spatial-evidence-rail__proof flow-version-proof"><CircleCheck size={15} aria-hidden="true" /> 검증된 활동 관계 {atlasData.flow.pulse.chains.length}개 · 실시간 상태 아님</p>
              )}
            </aside>
          </div>}

          <MobileFlow route={route} />
          <div className="sr-only" aria-live="polite">선택 경로 {routeDisplayLabel(route)}: {routeQuestionLabel(route.question)}</div>
        </>
      )}
    </SpatialWorkspaceFrame>
  );
}

function MobileFlow({ route }: { route: Route }) {
  const { state, dispatch } = useAtlasState();
  return (
    <div className="mobile-sibling mobile-flow">
      <section className="mobile-selection">
        <span className="eyebrow">선택 경로</span>
        <h2>{routeDisplayLabel(route)}</h2>
        <p>{routeQuestionLabel(route.question)}</p>
      </section>
      <ol className="mobile-stepper">
        {route.stations.map((station, index) => (
          <li key={station.id}>
            <span style={{ borderColor: routeColor(route.id) }}><RouteIcon size={15} aria-hidden="true" /></span>
            <button
              type="button"
              disabled={!station.entityId}
              onFocus={() => station.entityId && dispatch({ type: "preview", focusId: station.entityId })}
              onBlur={() => dispatch({ type: "preview", focusId: null })}
              onClick={() => station.entityId && dispatch({ type: "focus", focusId: station.entityId })}
            >
              <strong>{station.entityId && graphNodeById.has(station.entityId) ? graphNodeLabel(graphNodeById.get(station.entityId)!) : humanReadableKnowledgeLabel(station.label)}</strong>
              <small>{String(index + 1).padStart(2, "0")} · {station.entityId ? "실제 경로 지점" : "외부 경계"}</small>
            </button>
          </li>
        ))}
      </ol>
      <div className="mobile-flow-proof"><CircleCheck size={18} /><span>전체 참조 {route.weight}건 · 실행 상태가 아닌 검증된 지식 경로</span></div>
      <button className="mobile-theatre-action" type="button" onClick={() => dispatch({ type: "theatre", open: true })}>경로 읽기 집중 보기</button>
    </div>
  );
}
