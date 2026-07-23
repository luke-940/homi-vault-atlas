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
    district: "지식 구역",
    moc_hub: "핵심 지식 지도(MOC)",
    paper_gateway: "연구 근거 관문(Papers)",
    strategy_insight: "전략 인사이트",
    strategy_request: "전략 요청",
    project: "프로젝트",
    project_stage: "프로젝트 단계",
    signal_domain: "변화 신호 영역(Signals)",
    signal_storyline: "변화 신호 흐름",
    source_document: "원천 기록",
    aggregate_boundary: "집계 경계",
  } as const)[node.kind];
}

function protagonistRoleLabel(role: string) {
  return ({
    gravity_anchor: "지식 중력의 중심",
    cross_domain_bridge: "지식 영역을 잇는 다리",
    frontier_signal: "변화를 먼저 포착한 신호",
  } as const)[role as "gravity_anchor" | "cross_domain_bridge" | "frontier_signal"]
    ?? role.replaceAll("_", " ");
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
      aria-label={`지식 항목 순위 ${nodes.length}개`}
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
              <strong>{graphNodeLabel(node)}</strong>
              <small>{nodeKindLabel(node)} · 참조한 고유 문서 {node.gravity}개 · 전체 참조 {node.occurrences}회</small>
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
  const scene = ["graph", "constellations", "list"].includes(state.sceneId) ? state.sceneId : "graph";
  const [pathDisclosureOpen, setPathDisclosureOpen] = useState(Boolean(state.pathFrom || state.pathTo));
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
  useEffect(() => {
    if (state.pathFrom || state.pathTo) setPathDisclosureOpen(true);
  }, [state.pathFrom, state.pathTo]);
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
  const title = scene === "constellations" ? "지식의 주인공과 실제 이웃을 읽는다" : scene === "list" ? "중력 순위로 지식을 훑는다" : "실제 방향 관계를 따라 지식을 탐색한다";
  const answer = scene === "graph"
    ? `${atlasData.graph.layout.defaultNodeIds.length}개 대표 지식 항목과 ${atlasData.graph.layout.defaultEdgeIds.length}개 기본 방향 관계를 복잡한 선 얽힘 없이 보여줍니다.`
    : scene === "constellations"
      ? `${atlasData.meaning.protagonists.length}개 주인공의 실제 들어오는·나가는 참조 관계를 탐색합니다.`
      : `이 항목을 참조한 고유 문서 수를 기준으로 ${rankedNodes.length}개 지식 항목을 탐색합니다.`;

  return (
    <SpatialWorkspaceFrame className="workspace-view explore-v75" aria-labelledby="explore-title" lang="ko">
      <WorkspaceHeader
        titleId="explore-title"
        eyebrow="EXPLORE · LIVING GRAPH"
        title={title}
        question="Atlas의 지식 구조는 어디에 있고 어디로 연결되는가?"
        answer={answer}
        keyItems={[
          { label: "지식 구역별 색", className: "key-color" },
          { label: "참조 중력을 나타내는 크기", className: "key-size" },
          { label: "실제 참조 방향", className: "key-direction" },
        ]}
      />

      <div className="spatial-command-rail explore-command-rail explore-v75-controls" aria-label="지식 그래프 필터">
        <label><span>지식 구역</span>
          <select value={state.districtId ?? ""} onChange={(event) => dispatch({ type: "graphDistrict", districtId: event.target.value || null })}>
            <option value="">전체 구역</option>
            {atlasData.graph.clusters.map((cluster) => <option key={cluster.id} value={cluster.id}>{cluster.label} · {cluster.nodeCount}</option>)}
          </select>
        </label>
        <label><span>최신성</span>
          <select value={state.freshness} onChange={(event) => dispatch({ type: "graphFreshness", freshness: event.target.value as FreshnessBucket })}>
            {freshnessOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => dispatch({ type: "search", open: true })}><Search size={15} aria-hidden="true" /> 지식 검색</button>
        {(state.districtId || state.freshness !== "all") && (
          <button type="button" className="is-clear" onClick={() => {
            dispatch({ type: "graphDistrict", districtId: null });
            dispatch({ type: "graphFreshness", freshness: "all" });
          }}><X size={15} aria-hidden="true" /> 필터 해제</button>
        )}
      </div>

      {scene === "graph" && (
        <div className="spatial-stage-layout explore-v75-layout">
          <main className="spatial-stage spatial-stage--full-bleed explore-v75-graph-panel">
            <div className="scrollbar-clean explore-v75-mobile-clusters" aria-label="지식 구역 미니맵">
              {atlasData.graph.clusters.map((cluster) => (
                <button key={cluster.id} type="button" aria-pressed={state.districtId === cluster.id} onClick={() => dispatch({ type: "graphDistrict", districtId: state.districtId === cluster.id ? null : cluster.id })}>
                  <i /><strong>{cluster.label}</strong><small>{cluster.representativeNodeCount}/{cluster.nodeCount}</small>
                </button>
              ))}
            </div>
            <div className="spatial-stage-axes spatial-stage-axes--subdued explore-v75-axes"><span><CalendarRange size={14} />Y · 위쪽일수록 최근</span><span><Box size={14} />Z · 구역에서 원천 기록으로 이어지는 깊이</span><span><CircleDot size={14} />크기는 참조한 고유 문서 수</span><span><Route size={14} />화살표는 참조 방향</span></div>
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
          {state.panel !== "inspector" && <aside className="spatial-evidence-rail explore-evidence-rail explore-v75-insight" aria-live="polite">
            {activeNode ? (
              <>
                <span className="eyebrow">{previewed ? "미리 보는 지식" : "선택한 지식"}</span>
                <h2>{graphNodeLabel(activeNode)}</h2>
                <p>
                  {nodeKindLabel(activeNode)} · {atlasData.graph.clusters.find((cluster) => cluster.id === activeNode.clusterId)?.label}
                  {activeNode.kind === "district" ? " · 참조 문서·횟수는 이 구역이 대표하는 내부 기록 전체의 관계 집계입니다." : ""}
                </p>
                <dl>
                  <div><dt>참조한 고유 문서</dt><dd>{activeNode.gravity}</dd></div>
                  <div><dt>전체 참조 횟수</dt><dd>{activeNode.occurrences}</dd></div>
                  <div><dt>대표하는 기록</dt><dd>{activeNode.representedDocuments}</dd></div>
                  <div><dt>의미 날짜</dt><dd>{activeNode.freshness ?? "미기록"}</dd></div>
                </dl>
                {activeNode.kind !== "district" && (
                  <div className="explore-v75-directions">
                    <section><h3>들어오는 참조 <span>{incoming.length}</span></h3>{incoming.slice(0, 5).map((edge) => <button type="button" key={edge.id} onClick={() => selectNode(edge.source)}>{graphNodeLabel(graphNodeById.get(edge.source)!)} <small>{edge.occurrenceCount}</small></button>)}</section>
                    <section><h3>나가는 참조 <span>{outgoing.length}</span></h3>{outgoing.slice(0, 5).map((edge) => <button type="button" key={edge.id} onClick={() => selectNode(edge.target)}>{graphNodeLabel(graphNodeById.get(edge.target)!)} <small>{edge.occurrenceCount}</small></button>)}</section>
                  </div>
                )}
                <nav className="view-switch" aria-label="선택 지식의 연결 화면">
                  <button type="button" onClick={() => dispatch({ type: "journey", target: activeNode.kind === "district"
                    ? { workspace: "observe", sceneId: "global-relations", focusId: activeNode.id, relationPairId: districtPair?.id ?? null, relationLayer: "wikilink" }
                    : { workspace: "observe", sceneId: "protagonist-lens", focusId: activeNode.id } })}>Observe 관계 <ArrowRight size={14} aria-hidden="true" /></button>
                  {matchingRoute && <button type="button" onClick={() => dispatch({ type: "journey", target: { workspace: "flow", sceneId: "verified-trails", focusId: activeNode.id, routeId: matchingRoute.id } })}>Flow 경로 <ArrowRight size={14} aria-hidden="true" /></button>}
                </nav>
              </>
            ) : <div className="explore-v75-empty"><LocateFixed size={24} /><h2>지식 항목을 선택하세요</h2><p>지식 중력, 의미 날짜, 들어오는·나가는 참조 방향을 여기에서 읽을 수 있습니다.</p></div>}
          </aside>}
        </div>
      )}

      {scene === "constellations" && (
        <div className="explore-v75-clusters">
          {atlasData.meaning.protagonists.map((protagonist) => {
            const node = graphNodeById.get(protagonist.nodeId);
            const constellation = atlasData.meaning.constellations.find((item) => item.focalNodeId === protagonist.nodeId);
            if (!node) return null;
            return (
              <button key={protagonist.id} type="button" onClick={() => dispatch({ type: "journey", target: { workspace: "explore", sceneId: "graph", districtId: node.clusterId, focusId: node.id } })}>
                <i />
                <h2>{graphNodeLabel(node)}</h2>
                <p>{protagonist.thesis}</p>
                <strong>{protagonistRoleLabel(protagonist.role)}</strong>
                <small>들어오는 실제 참조 {constellation?.incomingEdgeIds.length ?? 0}개 · 나가는 실제 참조 {constellation?.outgoingEdgeIds.length ?? 0}개</small>
                <ArrowRight size={17} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      )}

      {scene === "list" && (
        <div className="explore-v75-list-layout">
          <header><div><span className="eyebrow">접근 가능한 지식 순위</span><h2>지식 중력 순위</h2></div><p>그래프 화면과 동일한 지식 항목·수치·선택 상태를 키보드로 탐색합니다.</p></header>
          <VirtualRankedList nodes={rankedNodes} selectedId={selected?.id ?? null} onSelect={selectNode} onPreview={(focusId) => dispatch({ type: "preview", focusId })} />
        </div>
      )}

      <details
        className="spatial-disclosure explore-path-disclosure explore-v75-path"
        open={pathDisclosureOpen}
        onToggle={(event) => setPathDisclosureOpen(event.currentTarget.open)}
      >
        <summary className="spatial-disclosure-trigger" aria-controls="explore-path-controls">
          <span><Route size={16} aria-hidden="true" /><strong id="path-title">두 지점 사이의 실제 참조 경로</strong></span>
          <small>{state.pathFrom && state.pathTo ? "선택한 방향 경로 보기" : "필요할 때 경로 찾기"}</small>
        </summary>
        <div id="explore-path-controls" className="spatial-disclosure-body explore-path-controls" aria-labelledby="path-title">
          <div className="explore-path-intro"><span className="eyebrow">방향 최단 경로</span><p>가장 적은 관계 단계를 우선하고, 동률이면 전체 참조 횟수 합계와 안정된 항목 순서로 결정합니다.</p></div>
          <label>출발<select value={state.pathFrom ?? ""} onChange={(event) => dispatch({ type: "graphPath", from: event.target.value || null, to: state.pathTo })}><option value="">출발 선택</option>{pathChoices.map((node) => <option key={node.id} value={node.id}>{graphNodeLabel(node)}</option>)}</select></label>
          <label>도착<select value={state.pathTo ?? ""} onChange={(event) => dispatch({ type: "graphPath", from: state.pathFrom, to: event.target.value || null })}><option value="">도착 선택</option>{pathChoices.map((node) => <option key={node.id} value={node.id}>{graphNodeLabel(node)}</option>)}</select></label>
          <div className="explore-v75-path-result">
            {state.pathFrom && state.pathTo
              ? path.length > 1
                ? path.map((id, index) => <span key={id}>{index > 0 && <ArrowRight size={13} aria-hidden="true" />}{graphNodeLabel(graphNodeById.get(id)!)}</span>)
                : <strong>실제 방향 경로가 없습니다.</strong>
              : <span>출발과 도착을 선택하면 전체 지식 그래프에서 경로를 계산합니다.</span>}
          </div>
        </div>
      </details>
      <p className="explore-v75-boundary">{atlasData.graph.profile === "atlas-public" ? "공개 안전 스냅샷" : "Owner · Luke Mac 전용 · 실제 허용 제목"} · 지식 항목 {atlasData.graph.manifest.nodeCount}개 · 방향 참조 관계 {atlasData.graph.manifest.edgeCount}개 · 화면에서 위치 자동 계산 없음</p>
    </SpatialWorkspaceFrame>
  );
}
