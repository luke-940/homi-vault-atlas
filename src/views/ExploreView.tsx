import { ArrowRight, Box, CalendarRange, CircleDot, LocateFixed, Route, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { WorkspaceHeader } from "../components/WorkspaceHeader";
import { SpatialWorkspaceFrame } from "../components/SpatialWorkspaceFrame";
import { atlasData, graphNodeById } from "../data-runtime";
import { LivingGraphCanvas } from "../graph/LivingGraphCanvas";
import { graphNodeLabel, shortestDirectedPath, type FreshnessBucket } from "../graph/model";
import { useAtlasState } from "../state";
import type { AtlasGraphNodeV1 } from "../types";

const freshnessOptions: Array<{ id: FreshnessBucket; label: string }> = [
  { id: "all", label: "전체 기간" },
  { id: "30d", label: "최근 30일" },
  { id: "90d", label: "최근 90일" },
  { id: "1y", label: "최근 1년" },
  { id: "undated", label: "날짜 미기록" },
];

function nodeKindLabel(node: AtlasGraphNodeV1) {
  return ({
    district: "District",
    moc_hub: "MOC Hub",
    paper_gateway: "Paper Gateway",
    strategy_insight: "Strategy Insight",
    strategy_request: "Strategy Request",
    project: "Project",
    project_stage: "Project Stage",
    signal_domain: "Signal Domain",
    signal_storyline: "Signal Storyline",
    source_document: "Source",
    aggregate_boundary: "Aggregate",
  } as const)[node.kind];
}

function VirtualRankedList({ nodes, selectedId, onSelect, onPreview }: {
  nodes: AtlasGraphNodeV1[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onPreview: (id: string | null) => void;
}) {
  const itemHeight = 62;
  const viewportHeight = 500;
  const [scrollTop, setScrollTop] = useState(0);
  const start = Math.max(0, Math.floor(scrollTop / itemHeight) - 4);
  const end = Math.min(nodes.length, start + Math.ceil(viewportHeight / itemHeight) + 8);
  return (
    <div
      className="graph-ranked-list"
      style={{ height: viewportHeight }}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      role="listbox"
      aria-label={`지식 노드 순위 ${nodes.length}개`}
      tabIndex={0}
    >
      <div style={{ height: nodes.length * itemHeight, position: "relative" }}>
        {nodes.slice(start, end).map((node, offset) => {
          const index = start + offset;
          return (
            <button
              key={node.id}
              type="button"
              role="option"
              aria-selected={node.id === selectedId}
              className={node.id === selectedId ? "is-selected" : ""}
              style={{ position: "absolute", top: index * itemHeight, height: itemHeight }}
              onPointerEnter={() => onPreview(node.id)}
              onPointerLeave={() => onPreview(null)}
              onFocus={() => onPreview(node.id)}
              onBlur={() => onPreview(null)}
              onClick={() => onSelect(node.id)}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{graphNodeLabel(node)}</strong>
              <small>{nodeKindLabel(node)} · inbound {node.gravity} · links {node.occurrences}</small>
              <ArrowRight size={15} aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ExploreView() {
  const { state, dispatch } = useAtlasState();
  const scene = ["graph", "clusters", "list"].includes(state.sceneId) ? state.sceneId : "graph";
  const fallbackSelected = useMemo(() => [...atlasData.graph.nodes]
    .filter((node) => node.kind !== "source_document")
    .sort((left, right) => right.gravity - left.gravity || right.occurrences - left.occurrences || left.id.localeCompare(right.id, "en"))[0] ?? null, []);
  const selected = graphNodeById.get(state.focusId ?? "") ?? fallbackSelected;
  const previewed = state.previewId ? graphNodeById.get(state.previewId) ?? null : null;
  const activeNode = previewed ?? selected;
  useEffect(() => {
    if ((!state.focusId || !graphNodeById.has(state.focusId)) && fallbackSelected) {
      dispatch({ type: "focus", focusId: fallbackSelected.id });
    }
  }, [dispatch, fallbackSelected, state.focusId]);
  const rankedNodes = useMemo(() => atlasData.graph.nodes
    .filter((node) => !state.districtId || node.clusterId === state.districtId)
    .sort((left, right) => right.gravity - left.gravity || right.occurrences - left.occurrences || left.id.localeCompare(right.id, "en")), [state.districtId]);
  const path = useMemo(() => shortestDirectedPath(atlasData.graph, state.pathFrom, state.pathTo), [state.pathFrom, state.pathTo]);
  const pathChoices = useMemo(() => [...atlasData.graph.nodes]
    .filter((node) => node.kind !== "source_document")
    .sort((left, right) => right.gravity - left.gravity || left.id.localeCompare(right.id, "en"))
    .slice(0, 80), []);
  const incoming = activeNode ? atlasData.graph.edges
    .filter((edge) => edge.target === activeNode.id)
    .sort((a, b) => b.occurrenceCount - a.occurrenceCount).slice(0, 12) : [];
  const outgoing = activeNode ? atlasData.graph.edges
    .filter((edge) => edge.source === activeNode.id)
    .sort((a, b) => b.occurrenceCount - a.occurrenceCount).slice(0, 12) : [];
  const matchingRoute = activeNode ? atlasData.flow.routes.find((route) => (
    route.members.length > 0 && route.stations.some((station) => station.entityId === activeNode.id)
  )) ?? null : null;
  const districtPair = activeNode?.kind === "district"
    ? [...atlasData.relation.matrix]
      .filter((pair) => pair.source === activeNode.label || pair.target === activeNode.label)
      .sort((left, right) => right.wikilink - left.wikilink || left.id.localeCompare(right.id, "en"))[0] ?? null
    : null;

  const selectNode = (focusId: string) => dispatch({ type: "focus", focusId });
  const title = scene === "clusters" ? "구역별 밀도를 비교한다" : scene === "list" ? "중력 순위로 지식을 훑는다" : "실제 방향 관계를 따라 지식을 탐색한다";
  const answer = scene === "graph"
    ? `${atlasData.graph.layout.defaultNodeIds.length}개 대표 노드와 ${atlasData.graph.layout.defaultEdgeIds.length}개 기본 방향 관계를 헤어볼 없이 보여줍니다.`
    : scene === "clusters"
      ? `${atlasData.graph.clusters.length}개 district contour가 전체 ${atlasData.graph.nodes.length}개 노드의 밀도를 요약합니다.`
      : `고유 inbound 문서 수를 기준으로 ${rankedNodes.length}개 노드를 탐색합니다.`;

  return (
    <SpatialWorkspaceFrame className="workspace-view explore-v75" aria-labelledby="explore-title" lang="ko">
      <WorkspaceHeader
        titleId="explore-title"
        eyebrow="EXPLORE · LIVING GRAPH"
        title={title}
        question="Atlas의 지식 구조는 어디에 있고 어디로 연결되는가?"
        answer={answer}
        keyItems={[
          { label: "district color", className: "key-color" },
          { label: "gravity size", className: "key-size" },
          { label: "directed link", className: "key-direction" },
        ]}
      />

      <div className="explore-v75-controls" aria-label="Graph filters">
        <label><span>District</span>
          <select value={state.districtId ?? ""} onChange={(event) => dispatch({ type: "graphDistrict", districtId: event.target.value || null })}>
            <option value="">전체 구역</option>
            {atlasData.graph.clusters.map((cluster) => <option key={cluster.id} value={cluster.id}>{cluster.label} · {cluster.nodeCount}</option>)}
          </select>
        </label>
        <label><span>Freshness</span>
          <select value={state.freshness} onChange={(event) => dispatch({ type: "graphFreshness", freshness: event.target.value as FreshnessBucket })}>
            {freshnessOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => dispatch({ type: "search", open: true })}><Search size={15} aria-hidden="true" /> 노드 검색</button>
        {(state.districtId || state.freshness !== "all") && (
          <button type="button" className="is-clear" onClick={() => {
            dispatch({ type: "graphDistrict", districtId: null });
            dispatch({ type: "graphFreshness", freshness: "all" });
          }}><X size={15} aria-hidden="true" /> 필터 해제</button>
        )}
      </div>

      {scene === "graph" && (
        <div className="explore-v75-layout">
          <main className="explore-v75-graph-panel">
            <div className="explore-v75-mobile-clusters" aria-label="District mini map">
              {atlasData.graph.clusters.map((cluster) => (
                <button key={cluster.id} type="button" aria-pressed={state.districtId === cluster.id} onClick={() => dispatch({ type: "graphDistrict", districtId: state.districtId === cluster.id ? null : cluster.id })}>
                  <i /><strong>{cluster.label}</strong><small>{cluster.representativeNodeCount}/{cluster.nodeCount}</small>
                </button>
              ))}
            </div>
            <div className="explore-v75-axes"><span><CalendarRange size={14} />Y · 위쪽일수록 최근</span><span><Box size={14} />Z · district → source 깊이</span><span><CircleDot size={14} />크기는 unique inbound</span><span><Route size={14} />화살표는 참조 방향</span></div>
            <LivingGraphCanvas
              graph={atlasData.graph}
              scene={state.pathFrom && state.pathTo ? "trace" : state.freshness !== "all" ? "freshness" : "field"}
              focusId={selected?.id ?? null}
              previewId={state.previewId}
              districtId={state.districtId}
              freshness={state.freshness}
              from={state.pathFrom}
              to={state.pathTo}
              districtRelationMatrix={atlasData.relation.matrix}
              mobile={state.mobileSibling}
              reducedMotion={state.reducedMotion}
              presentation="workspace"
              onSelect={selectNode}
              onHover={(focusId) => dispatch({ type: "preview", focusId })}
            />
          </main>
          {state.panel !== "inspector" && <aside className="explore-v75-insight" aria-live="polite">
            {activeNode ? (
              <>
                <span className="eyebrow">{previewed ? "PREVIEW NODE" : "SELECTED NODE"}</span>
                <h2>{graphNodeLabel(activeNode)}</h2>
                <p>{nodeKindLabel(activeNode)} · {atlasData.graph.clusters.find((cluster) => cluster.id === activeNode.clusterId)?.label}</p>
                <dl>
                  <div><dt>고유 inbound</dt><dd>{activeNode.gravity}</dd></div>
                  <div><dt>링크 출현</dt><dd>{activeNode.occurrences}</dd></div>
                  <div><dt>표현 기록</dt><dd>{activeNode.representedDocuments}</dd></div>
                  <div><dt>의미 날짜</dt><dd>{activeNode.freshness ?? "미기록"}</dd></div>
                </dl>
                <div className="explore-v75-directions">
                  <section><h3>Incoming <span>{incoming.length}</span></h3>{incoming.slice(0, 5).map((edge) => <button type="button" key={edge.id} onClick={() => selectNode(edge.source)}>{graphNodeLabel(graphNodeById.get(edge.source)!)} <small>{edge.occurrenceCount}</small></button>)}</section>
                  <section><h3>Outgoing <span>{outgoing.length}</span></h3>{outgoing.slice(0, 5).map((edge) => <button type="button" key={edge.id} onClick={() => selectNode(edge.target)}>{graphNodeLabel(graphNodeById.get(edge.target)!)} <small>{edge.occurrenceCount}</small></button>)}</section>
                </div>
                <nav className="view-switch" aria-label="선택 지식의 연결 화면">
                  <button type="button" onClick={() => dispatch({ type: "journey", target: activeNode.kind === "district"
                    ? { workspace: "observe", sceneId: "global-relations", focusId: activeNode.id, relationPairId: districtPair?.id ?? null, relationLayer: "wikilink" }
                    : { workspace: "observe", sceneId: "hub-relations", focusId: activeNode.id } })}>Observe 관계 <ArrowRight size={14} aria-hidden="true" /></button>
                  {matchingRoute && <button type="button" onClick={() => dispatch({ type: "journey", target: { workspace: "flow", sceneId: "routes", focusId: activeNode.id, routeId: matchingRoute.id } })}>Flow 경로 <ArrowRight size={14} aria-hidden="true" /></button>}
                </nav>
              </>
            ) : <div className="explore-v75-empty"><LocateFixed size={24} /><h2>노드를 선택하세요</h2><p>지식 중력, 의미 날짜, incoming·outgoing 방향을 여기에서 읽을 수 있습니다.</p></div>}
          </aside>}
        </div>
      )}

      {scene === "clusters" && (
        <div className="explore-v75-clusters">
          {atlasData.graph.clusters.map((cluster, index) => {
            const strongest = atlasData.graph.nodes.filter((node) => node.clusterId === cluster.id)
              .sort((left, right) => right.gravity - left.gravity || left.id.localeCompare(right.id, "en"))[0];
            return (
              <button key={cluster.id} type="button" onClick={() => dispatch({ type: "journey", target: { workspace: "explore", sceneId: "graph", districtId: cluster.id, focusId: strongest?.id } })}>
                <span>{String(index + 1).padStart(2, "0")}</span><i />
                <h2>{cluster.label}</h2>
                <p>{cluster.nodeCount} nodes · {cluster.representedDocumentCount} represented records</p>
                <strong>{strongest ? graphNodeLabel(strongest) : "기록 없음"}</strong>
                <small>대표 중력 {strongest?.gravity ?? 0}</small>
                <ArrowRight size={17} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      )}

      {scene === "list" && (
        <div className="explore-v75-list-layout">
          <header><div><span className="eyebrow">RANKED ACCESSIBLE LIST</span><h2>지식 중력 순위</h2></div><p>Canvas와 동일한 노드·수치·선택 상태를 키보드로 탐색합니다.</p></header>
          <VirtualRankedList nodes={rankedNodes} selectedId={selected?.id ?? null} onSelect={selectNode} onPreview={(focusId) => dispatch({ type: "preview", focusId })} />
        </div>
      )}

      <section className="explore-v75-path" aria-labelledby="path-title">
        <div><span className="eyebrow">DIRECTED SHORTEST PATH</span><h2 id="path-title">두 지점 사이의 실제 참조 경로</h2><p>최단 hop을 우선하고, 동률이면 occurrence 합계와 안정 ID로 결정합니다.</p></div>
        <label>From<select value={state.pathFrom ?? ""} onChange={(event) => dispatch({ type: "graphPath", from: event.target.value || null, to: state.pathTo })}><option value="">출발 선택</option>{pathChoices.map((node) => <option key={node.id} value={node.id}>{graphNodeLabel(node)}</option>)}</select></label>
        <label>To<select value={state.pathTo ?? ""} onChange={(event) => dispatch({ type: "graphPath", from: state.pathFrom, to: event.target.value || null })}><option value="">도착 선택</option>{pathChoices.map((node) => <option key={node.id} value={node.id}>{graphNodeLabel(node)}</option>)}</select></label>
        <div className="explore-v75-path-result">
          {state.pathFrom && state.pathTo
            ? path.length > 1
              ? path.map((id, index) => <span key={id}>{index > 0 && <ArrowRight size={13} aria-hidden="true" />}{graphNodeLabel(graphNodeById.get(id)!)}</span>)
              : <strong>실제 방향 경로가 없습니다.</strong>
            : <span>출발과 도착을 선택하면 전체 graph에서 경로를 계산합니다.</span>}
        </div>
      </section>
      <p className="explore-v75-boundary">{atlasData.graph.profile === "atlas-public" ? "Public snapshot" : "Owner · Luke Mac local-only · 실제 허용 제목"} · {atlasData.graph.manifest.nodeCount} nodes · {atlasData.graph.manifest.edgeCount} directed reference edges · runtime force simulation 0</p>
    </SpatialWorkspaceFrame>
  );
}
