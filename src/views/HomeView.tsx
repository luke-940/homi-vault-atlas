import {
  ArrowRight,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import * as m from "motion/react-m";
import { atlasData, graphNodeById } from "../data-runtime";
import { LivingGraphCanvas } from "../graph/LivingGraphCanvas";
import {
  connectedGraphNodeIds,
  districtRelationRoutes,
  graphNodeLabel,
  strongestConnectedNode,
  strongestIncidentEdge,
} from "../graph/model";
import { useAtlasState } from "../state";

type HomeSceneId = "knowledge-field" | "knowledge-gravity" | "freshness-field" | "link-trace";

const HOME_SCENES: Array<{
  id: HomeSceneId;
  index: string;
  label: string;
  title: string;
  body: string;
}> = [
  {
    id: "knowledge-field",
    index: "01",
    label: "Knowledge Field",
    title: "구역과 허브가 실제 위치를 갖습니다.",
    body: "가로축은 지식 구역, 세로축은 의미 있는 최신성입니다. 구역은 위치·색·라벨로 묶이고, 허브의 주변광은 실제 중력에서만 나옵니다.",
  },
  {
    id: "knowledge-gravity",
    index: "02",
    label: "Knowledge Gravity",
    title: "많이 참조되는 허브가 더 강한 중력을 만듭니다.",
    body: "크기는 고유 inbound 문서 수입니다. 링크 출현 횟수는 별도 수치로 남겨 서로 다른 단위를 섞지 않습니다.",
  },
  {
    id: "freshness-field",
    index: "03",
    label: "Freshness Field",
    title: "최근의 지식은 위로, 날짜가 없으면 별도 rail로 갑니다.",
    body: "frontmatter의 의미 날짜와 날짜형 기록만 사용합니다. mtime이나 부재를 활동으로 추정하지 않습니다.",
  },
  {
    id: "link-trace",
    index: "04",
    label: "Link Trace",
    title: "실제 wikilink 방향을 따라 지식의 이동을 읽습니다.",
    body: "화살표는 출발 문서에서 도착 문서로 향합니다. 선택한 허브의 incoming·outgoing 관계만 선명하게 추적합니다.",
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

export function HomeView() {
  const { state, dispatch } = useAtlasState();
  const sceneId = normalizedScene(state.sceneId);
  const scene = HOME_SCENES.find((item) => item.id === sceneId)!;
  const districtRoutes = useMemo(() => districtRelationRoutes(atlasData.graph, atlasData.relation.matrix), []);
  const connectedIds = useMemo(() => new Set([
    ...connectedGraphNodeIds(atlasData.graph),
    ...districtRoutes.flatMap((route) => [route.sourceId, route.targetId]),
  ]), [districtRoutes]);
  const strongestNode = useMemo(() => strongestConnectedNode(atlasData.graph), []);
  const graphFocus = graphNodeById.has(state.focusId) && connectedIds.has(state.focusId)
    ? state.focusId
    : strongestNode?.id ?? null;
  const traceEdge = useMemo(() => strongestIncidentEdge(atlasData.graph, graphFocus), [graphFocus]);
  const focusedNode = graphFocus ? graphNodeById.get(graphFocus) ?? null : null;
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

  return (
    <div className="home-v75" lang="ko">
      <section className="home-v75-hero" aria-labelledby="home-v75-title">
        <m.div
          className="home-v75-copy"
          initial={intro && !state.reducedMotion ? { opacity: 0, y: 18 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.56 }}
        >
          <span className="eyebrow" lang="en">MEANINGFUL SPACE · LIVING GRAPH</span>
          <h1 id="home-v75-title">지식이 어디에 있고,<br /><span>어디로 움직이는지 본다.</span></h1>
          <p>
            {atlasData.inventory.physicalMarkdownCount.toLocaleString("ko-KR")}개의 기록을 구역·중력·최신성·실제 방향 관계로 읽는
            3차원 지식 지형입니다. 드래그해 구조 깊이를 보고, 선택해 참조 경로를 추적합니다.
          </p>
          <div className="home-v75-actions">
            <button type="button" className="is-primary" onClick={() => dispatch({ type: "journey", target: { workspace: "explore", sceneId: "graph", focusId: graphFocus ?? undefined } })}>
              그래프 탐색 <ArrowRight size={16} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => dispatch({ type: "search", open: true })}>
              <Search size={16} aria-hidden="true" /> 지식 검색
            </button>
          </div>
          <div className="home-v75-axis-key" aria-label="그래프 의미 범례">
            <span><i className="is-x" />X · 지식 구역</span>
            <span><i className="is-y" />Y · 위쪽일수록 최근</span>
            <span><i className="is-z" />Z · 구조 깊이</span>
            <span><i className="is-size" />크기·주변광 · 고유 inbound</span>
            <span><i className="is-edge" />굵은 항로 · 구역 집계 방향</span>
            <span><i className="is-edge" style={{ opacity: 0.56, scale: "0.72" }} />가는 선 · 허브 실제 참조</span>
          </div>
          <dl className="home-v75-ledger" aria-label="Atlas evidence ledger">
            <div><dt>표현 기록</dt><dd>{atlasData.inventory.namedCount.toLocaleString("ko-KR")}</dd><small>public-safe names</small></div>
            <div><dt>안전 집계</dt><dd>{atlasData.inventory.aggregateCount.toLocaleString("ko-KR")}</dd><small>aggregate boundary</small></div>
            <div><dt>정책 제외</dt><dd>{atlasData.inventory.excludedCount.toLocaleString("ko-KR")}</dd><small>not interpreted as zero</small></div>
          </dl>
          <p className="home-v75-provenance-line">Luke + six specialist roles · 검증된 버전 스냅샷 · 실시간 작업 상태 아님 · 기준일 {atlasData.inventory.asOfDate}</p>
        </m.div>

        <m.div
          className="home-v75-graph-shell"
          initial={intro && !state.reducedMotion ? { opacity: 0, scale: 0.982 } : false}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
        >
          <nav className="home-v75-scenes" aria-label="Home graph scenes" lang="en">
            {HOME_SCENES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.id === sceneId ? "is-active" : ""}
                aria-current={item.id === sceneId ? "true" : undefined}
                onClick={() => dispatch({ type: "journey", target: { workspace: "home", sceneId: item.id } })}
              >
                <span>{item.index}</span><strong>{item.label}</strong>
              </button>
            ))}
          </nav>
          <article className="home-v75-graph-card" data-scene={sceneId}>
            <header>
              <div><span>{scene.index} · {scene.label}</span><h2>{scene.title}</h2></div>
              <p>{scene.body}</p>
            </header>
            <LivingGraphCanvas
              graph={atlasData.graph}
              scene={graphScene(sceneId)}
              focusId={graphFocus}
              from={sceneId === "link-trace" ? traceEdge?.source ?? null : null}
              to={sceneId === "link-trace" ? traceEdge?.target ?? null : null}
              districtRelationMatrix={atlasData.relation.matrix}
              presentation="home"
              mobile={state.mobileSibling}
              reducedMotion={state.reducedMotion}
              onSelect={(focusId) => dispatch({ type: "focus", focusId, openInspector: false })}
            />
            {focusedNode && (
              <p className="sr-only" aria-live="polite">
                현재 선택 {graphNodeLabel(focusedNode)}. 고유 inbound {focusedNode.gravity}.
                {sceneId === "link-trace" && traceEdge
                  ? ` 실제 참조 ${traceEdge.occurrenceCount}회. 화살표는 출발에서 도착으로 향합니다.`
                  : " 자세한 관계는 Explore 또는 Observe에서 확인할 수 있습니다."}
              </p>
            )}
          </article>
        </m.div>
      </section>

    </div>
  );
}
