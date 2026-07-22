import {
  ArrowRight,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import * as m from "motion/react-m";
import { atlasData, graphNodeById } from "../data-runtime";
import { LivingGraphCanvas } from "../graph/LivingGraphCanvas";
import {
  graphNodeLabel,
  strongestConnectedNode,
  strongestIncidentEdge,
} from "../graph/model";
import { interactionContext } from "../graph/semantic-edge-model";
import { useAtlasState } from "../state";
import type { AtlasGraphNodeV1 } from "../types";

type HomeSceneId = "knowledge-field" | "knowledge-gravity" | "freshness-field" | "link-trace";

const HOME_SCENES: Array<{
  id: HomeSceneId;
  index: string;
  label: string;
  eyebrow: string;
  title: string;
  body: string;
}> = [
  {
    id: "knowledge-field",
    index: "01",
    label: "Knowledge Field",
    eyebrow: "HOMI VAULT ATLAS",
    title: "지식이 어디에 있고,\n어디로 움직이는지 본다.",
    body: "기록을 연결하고, 관계의 흐름을 따라 새로운 통찰을 발견합니다.",
  },
  {
    id: "knowledge-gravity",
    index: "02",
    label: "Knowledge Gravity",
    eyebrow: "KNOWLEDGE GRAVITY",
    title: "많이 참조되는 지식이\n더 강한 중력을 만든다.",
    body: "크기와 빛은 고유 inbound 문서 수에서만 나옵니다. 링크 출현 횟수는 다른 단위로 분리해 읽습니다.",
  },
  {
    id: "freshness-field",
    index: "03",
    label: "Freshness Field",
    eyebrow: "MEANINGFUL FRESHNESS",
    title: "최근의 지식은 위로,\n기록되지 않은 시간은 감추지 않는다.",
    body: "의미 있는 날짜가 있는 기록만 시간축에 놓습니다. 날짜가 없으면 별도 rail에 남기며 활동으로 추정하지 않습니다.",
  },
  {
    id: "link-trace",
    index: "04",
    label: "Link Trace",
    eyebrow: "DIRECTED KNOWLEDGE FLOW",
    title: "하나의 참조가\n지식의 흐름을 만든다.",
    body: "선은 실제 wikilink 방향을 따릅니다. 선택한 지식에서 들어오고 나가는 경로만 선명하게 이어집니다.",
  },
];

function normalizedScene(sceneId: string): HomeSceneId {
  return HOME_SCENES.some((scene) => scene.id === sceneId) ? sceneId as HomeSceneId : "knowledge-field";
}

function graphScene(scene: HomeSceneId) {
  return ({
    "knowledge-field": "field",
    "knowledge-gravity": "gravity",
    "freshness-field": "freshness",
    "link-trace": "trace",
  } as const)[scene];
}

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
    source_document: "Source Document",
    aggregate_boundary: "Aggregate Boundary",
  } as const)[node.kind];
}

export function HomeView() {
  const { state, dispatch } = useAtlasState();
  const sceneId = normalizedScene(state.sceneId);
  const scene = HOME_SCENES.find((item) => item.id === sceneId)!;
  const strongestNode = useMemo(() => strongestConnectedNode(atlasData.graph), []);
  const graphFocus = state.focusId && graphNodeById.has(state.focusId) ? state.focusId : null;
  const previewId = state.previewId && graphNodeById.has(state.previewId) ? state.previewId : null;
  const traceFocus = graphFocus ?? strongestNode?.id ?? null;
  const traceEdge = useMemo(() => strongestIncidentEdge(atlasData.graph, traceFocus), [traceFocus]);
  const activeId = previewId ?? graphFocus;
  const focusedNode = activeId ? graphNodeById.get(activeId) ?? null : null;
  const focusedDistrict = focusedNode
    ? atlasData.graph.clusters.find((cluster) => cluster.id === focusedNode.clusterId)?.label ?? "구역 미확인"
    : null;
  const context = useMemo(
    () => interactionContext(atlasData.graph, previewId, graphFocus),
    [graphFocus, previewId],
  );
  const incomingCount = focusedNode
    ? focusedNode.kind === "district"
      ? atlasData.graph.edges.filter((edge) => graphNodeById.get(edge.target)?.clusterId === focusedNode.clusterId && graphNodeById.get(edge.source)?.clusterId !== focusedNode.clusterId).length
      : atlasData.graph.edges.filter((edge) => edge.target === focusedNode.id).length
    : 0;
  const outgoingCount = focusedNode
    ? focusedNode.kind === "district"
      ? atlasData.graph.edges.filter((edge) => graphNodeById.get(edge.source)?.clusterId === focusedNode.clusterId && graphNodeById.get(edge.target)?.clusterId !== focusedNode.clusterId).length
      : atlasData.graph.edges.filter((edge) => edge.source === focusedNode.id).length
    : 0;
  const [intro, setIntro] = useState(false);

  useEffect(() => {
    try {
      const key = "homi-atlas-v7-5-entry-seen";
      if (sessionStorage.getItem(key) !== "1") {
        setIntro(true);
        sessionStorage.setItem(key, "1");
      }
    } catch {
      setIntro(false);
    }
  }, []);

  const openScene = (nextScene: HomeSceneId) => {
    dispatch({ type: "journey", target: { workspace: "home", sceneId: nextScene } });
  };

  return (
    <div className={`home-v75 is-${sceneId}`} lang="ko" data-home-page={sceneId}>
      <section className="home-v75-page" aria-labelledby="home-v75-title">
        <m.div
          className="home-v75-graph-shell"
          initial={intro && !state.reducedMotion ? { opacity: 0, scale: 0.982 } : false}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
        >
          <LivingGraphCanvas
            graph={atlasData.graph}
            scene={graphScene(sceneId)}
            focusId={graphFocus}
            previewId={previewId}
            from={sceneId === "link-trace" ? traceEdge?.source ?? null : null}
            to={sceneId === "link-trace" ? traceEdge?.target ?? null : null}
            districtRelationMatrix={atlasData.relation.matrix}
            presentation="home"
            mobile={state.mobileSibling}
            reducedMotion={state.reducedMotion}
            onSelect={(focusId) => dispatch({ type: "focus", focusId, openInspector: false })}
            onHover={(focusId) => dispatch({ type: "preview", focusId })}
          />
        </m.div>

        <m.article
          key={scene.id}
          className="home-v75-editorial"
          initial={state.reducedMotion ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="home-v75-index-giant" aria-hidden="true">{scene.index}.</span>
          <div className="home-v75-copy-block">
            <span className="home-v75-eyebrow" lang="en">{scene.eyebrow}</span>
            <h1 id="home-v75-title">
              {scene.title.split("\n").map((line) => <span key={line}>{line}</span>)}
            </h1>
            <p>
              {sceneId === "knowledge-field"
                ? `${atlasData.inventory.physicalMarkdownCount.toLocaleString("ko-KR")}개의 ${scene.body}`
                : scene.body}
            </p>
            {sceneId === "link-trace" && (
              <div className="home-v75-actions">
                <button type="button" className="is-primary" onClick={() => dispatch({ type: "journey", target: { workspace: "explore", sceneId: "graph", focusId: graphFocus ?? undefined } })}>
                  그래프 탐색 <ArrowRight size={16} aria-hidden="true" />
                </button>
                <button type="button" onClick={() => dispatch({ type: "search", open: true })}>
                  <Search size={16} aria-hidden="true" /> 지식 검색
                </button>
              </div>
            )}
          </div>
        </m.article>

        <div className={`home-v75-evidence${focusedNode ? " has-focus" : ""}`} aria-live="polite">
          <span className="home-v75-evidence-profile" lang="en">
            {atlasData.graph.profile === "atlas-owner" ? "OWNER · LOCAL ONLY" : "PUBLIC SNAPSHOT"}
          </span>
          {focusedNode ? (
            <>
              <strong>{graphNodeLabel(focusedNode)}</strong>
              <span>{nodeKindLabel(focusedNode)} · {focusedDistrict}</span>
              <span>inbound {focusedNode.gravity.toLocaleString("ko-KR")}</span>
              <span>occurrence {focusedNode.occurrences.toLocaleString("ko-KR")}</span>
              <span>{focusedNode.freshness ?? "날짜 미기록"}</span>
              <span>{focusedNode.kind === "district" ? "district " : ""}in {incomingCount} · out {outgoingCount}</span>
              {incomingCount + outgoingCount === 0
                ? <em>확인된 직접 연결 없음</em>
                : (context.hiddenIncoming + context.hiddenOutgoing > 0)
                  ? <em>추가 관계 {context.hiddenIncoming + context.hiddenOutgoing}개</em>
                  : null}
            </>
          ) : (
            <>
              <strong>Semantic overview</strong>
              <span>검증 corridor 최대 4개</span>
              <span>실제 reference {atlasData.graph.manifest.edgeCount.toLocaleString("ko-KR")}개</span>
              <span>hover = 실제 in/out</span>
              {atlasData.graph.profile === "atlas-owner" && (
                <em>policy-excluded {atlasData.inventory.excludedCount.toLocaleString("ko-KR")} · 상세 ledger는 Explore</em>
              )}
            </>
          )}
        </div>

        <nav className="home-v75-scenes" aria-label="Home visual chapters" lang="en">
          <span className="home-v75-scenes-title" aria-hidden="true">RECENT</span>
          {HOME_SCENES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === sceneId ? "is-active" : ""}
              aria-current={item.id === sceneId ? "page" : undefined}
              aria-label={`${item.index}. ${item.label}`}
              onClick={() => openScene(item.id)}
            >
              <i aria-hidden="true" />
              <span>{item.index}</span>
              <strong>{item.label}</strong>
            </button>
          ))}
        </nav>

        <footer className="home-v75-boundary" aria-label={`${atlasData.graph.profile === "atlas-owner" ? "Owner local" : "Public"} snapshot boundary`}>
          <span>{atlasData.inventory.namedCount.toLocaleString("ko-KR")} named</span>
          <span>{atlasData.inventory.aggregateCount.toLocaleString("ko-KR")} aggregated</span>
          <span>{atlasData.inventory.excludedCount.toLocaleString("ko-KR")} policy-excluded</span>
          <small>{atlasData.graph.profile === "atlas-owner" ? "Luke Mac 전용 · noindex · 외부 telemetry 0" : "검증된 버전 스냅샷 · 실시간 상태 아님"} · {atlasData.inventory.asOfDate}</small>
        </footer>

        {focusedNode && (
          <p className="sr-only" aria-live="polite">
            현재 선택 {graphNodeLabel(focusedNode)}. 고유 inbound {focusedNode.gravity}.
            {sceneId === "link-trace" && traceEdge
              ? ` 실제 참조 ${traceEdge.occurrenceCount}회. 화살표는 출발에서 도착으로 향합니다.`
              : " 자세한 관계는 Explore 또는 Observe에서 확인할 수 있습니다."}
          </p>
        )}
      </section>
    </div>
  );
}
