import {
  ArrowRight,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import * as m from "motion/react-m";
import homiMark from "../assets/brand/homi-mark-amber.svg";
import { atlasData, graphNodeById } from "../data-runtime";
import { LivingGraphCanvas } from "../graph/LivingGraphCanvas";
import {
  graphNodeLabel,
} from "../graph/model";
import { useAtlasState } from "../state";
import type {
  AtlasGraphNodeV1,
  MeaningMovement,
  MeaningProtagonist,
  OperationalAlignment,
} from "../types";

type HomeSceneId = "core-gravity" | "protagonists" | "vault-in-motion" | "operational-compass";

const HOME_SCENES: Array<{
  id: HomeSceneId;
  index: string;
  shortLabel: string;
  label: string;
  eyebrow: string;
  title: string;
  body: string;
  legacyVisual: string;
}> = [
  {
    id: "core-gravity",
    index: "01",
    shortLabel: "Core",
    label: "Core Domain Gravity",
    eyebrow: "HOMI KNOWLEDGE SYSTEM",
    title: "지식의 주인공과,\n그들이 움직이는 방향을 본다.",
    body: "Homi를 중심으로 MOC는 지식을 구조화하고, Papers는 근거를 공급하며, Signals는 변화를 감지합니다.",
    legacyVisual: "knowledge-field",
  },
  {
    id: "protagonists",
    index: "02",
    shortLabel: "Nodes",
    label: "Protagonist Constellations",
    eyebrow: "PROTAGONIST CONSTELLATIONS",
    title: "중요한 지식은\n실제 관계로 빛난다.",
    body: "Atlas Builder가 원문과 방향 관계를 함께 읽어 선정한 주인공입니다. 가리키면 실제 incoming·outgoing 이웃만 밝아집니다.",
    legacyVisual: "knowledge-gravity",
  },
  {
    id: "vault-in-motion",
    index: "03",
    shortLabel: "Changes",
    label: "Vault in Motion",
    eyebrow: "VERIFIED VERSION EVOLUTION",
    title: "Vault의 변화는\n증거가 있을 때만 움직인다.",
    body: "이전 릴리스와 현재 캡처 사이의 새 노드·실제 연결·중력 변화·의미 있는 갱신만 분리해 보여줍니다.",
    legacyVisual: "freshness-field",
  },
  {
    id: "operational-compass",
    index: "04",
    shortLabel: "Compass",
    label: "Operational Compass",
    eyebrow: "HUMAN × AGENT COMPASS",
    title: "사람과 Agent가\n지식을 움직이는 방식을 읽는다.",
    body: "방향·순환·번역·관찰 책임을 지식 관계와 다른 문법으로 보여줍니다. 지휘나 실시간 상태를 암시하지 않습니다.",
    legacyVisual: "link-trace",
  },
];

const sceneAliases = new Map<string, HomeSceneId>([
  ["knowledge-field", "core-gravity"],
  ["knowledge-gravity", "protagonists"],
  ["freshness-field", "vault-in-motion"],
  ["link-trace", "operational-compass"],
]);

function normalizedScene(sceneId: string): HomeSceneId {
  if (HOME_SCENES.some((scene) => scene.id === sceneId)) return sceneId as HomeSceneId;
  return sceneAliases.get(sceneId) ?? "core-gravity";
}

function graphScene(scene: HomeSceneId) {
  return ({
    "core-gravity": "field",
    protagonists: "gravity",
    "vault-in-motion": "freshness",
    "operational-compass": "trace",
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

function protagonistRoleLabel(role: MeaningProtagonist["role"]) {
  return ({
    gravity_anchor: "지식 중심",
    cross_domain_bridge: "영역 연결",
    frontier_signal: "프론티어 신호",
  } as const)[role];
}

function movementKindLabel(kind: MeaningMovement["kind"]) {
  return ({
    node_added: "새 지식",
    edge_added: "새 연결",
    edge_removed: "사라진 연결",
    gravity_shift: "중력 변화",
    meaningfully_updated: "의미 갱신",
    verified_handoff: "검증된 인계",
  } as const)[kind];
}

function movementMetric(value: Record<string, unknown> | null, ...keys: string[]) {
  for (const key of keys) {
    const candidate = Number(value?.[key]);
    if (Number.isFinite(candidate)) return candidate;
  }
  return null;
}

function movementDeltaLabel(movement: MeaningMovement, compact = false) {
  const previousGravity = movementMetric(movement.previousValue, "gravity");
  const currentGravity = movementMetric(movement.currentValue, "gravity");
  const previousOccurrences = movementMetric(movement.previousValue, "occurrences", "occurrenceCount");
  const currentOccurrences = movementMetric(movement.currentValue, "occurrences", "occurrenceCount");
  const parts: string[] = [];

  if (previousGravity !== null && currentGravity !== null && previousGravity !== currentGravity) {
    parts.push(`${compact ? "참조 문서" : "이 항목을 참조한 고유 문서"} ${previousGravity.toLocaleString("ko-KR")}→${currentGravity.toLocaleString("ko-KR")}`);
  }
  if (previousOccurrences !== null && currentOccurrences !== null && previousOccurrences !== currentOccurrences) {
    parts.push(`${compact ? "전체 참조" : "전체 참조 횟수"} ${previousOccurrences.toLocaleString("ko-KR")}→${currentOccurrences.toLocaleString("ko-KR")}`);
  }
  if (!parts.length && movement.kind === "node_added") return compact ? "새 노드" : "이전 스냅샷 없음 → 새 지식 노드";
  if (!parts.length && movement.kind === "meaningfully_updated") return compact ? "본문 갱신" : "관계 수와 분리된 본문 갱신";
  return parts.join(" · ");
}

function graphNodeForLabels(labels: readonly string[]) {
  return atlasData.graph.nodes.find((node) => labels.includes(node.label)) ?? null;
}

type RelationSummary = {
  incoming: Array<{ id: string; label: string; weight: number }>;
  outgoing: Array<{ id: string; label: string; weight: number }>;
  incomingCount: number;
  outgoingCount: number;
  hiddenIncoming: number;
  hiddenOutgoing: number;
};

function relationSummary(node: AtlasGraphNodeV1, limit = 3): RelationSummary {
  const incoming = new Map<string, { id: string; label: string; weight: number }>();
  const outgoing = new Map<string, { id: string; label: string; weight: number }>();

  const add = (
    target: Map<string, { id: string; label: string; weight: number }>,
    id: string,
    label: string,
    weight: number,
  ) => {
    const current = target.get(id);
    target.set(id, { id, label, weight: (current?.weight ?? 0) + weight });
  };

  for (const edge of atlasData.graph.edges) {
    const source = graphNodeById.get(edge.source);
    const target = graphNodeById.get(edge.target);
    if (!source || !target) continue;

    if (node.kind === "district") {
      if (target.clusterId === node.clusterId && source.clusterId !== node.clusterId) {
        const cluster = atlasData.graph.clusters.find((item) => item.id === source.clusterId);
        add(incoming, source.clusterId, cluster?.label ?? graphNodeLabel(source), edge.occurrenceCount);
      }
      if (source.clusterId === node.clusterId && target.clusterId !== node.clusterId) {
        const cluster = atlasData.graph.clusters.find((item) => item.id === target.clusterId);
        add(outgoing, target.clusterId, cluster?.label ?? graphNodeLabel(target), edge.occurrenceCount);
      }
      continue;
    }

    if (edge.target === node.id) add(incoming, source.id, graphNodeLabel(source), edge.occurrenceCount);
    if (edge.source === node.id) add(outgoing, target.id, graphNodeLabel(target), edge.occurrenceCount);
  }

  const ranked = (items: Map<string, { id: string; label: string; weight: number }>) => (
    [...items.values()].sort((left, right) => right.weight - left.weight || left.label.localeCompare(right.label, "ko"))
  );
  const rankedIncoming = ranked(incoming);
  const rankedOutgoing = ranked(outgoing);

  return {
    incoming: rankedIncoming.slice(0, limit),
    outgoing: rankedOutgoing.slice(0, limit),
    incomingCount: rankedIncoming.length,
    outgoingCount: rankedOutgoing.length,
    hiddenIncoming: Math.max(0, rankedIncoming.length - limit),
    hiddenOutgoing: Math.max(0, rankedOutgoing.length - limit),
  };
}

const CORE_DOMAINS = [
  {
    key: "moc",
    label: "MOC",
    role: "지식 구조화",
    node: graphNodeForLabels(["MOC", "중심 지식"]),
  },
  {
    key: "papers",
    label: "PAPERS",
    role: "근거 공급",
    node: graphNodeForLabels(["Papers", "연구 논거"]),
  },
  {
    key: "signals",
    label: "SIGNALS",
    role: "변화 감지",
    node: graphNodeForLabels(["Signals", "신호"]),
  },
] as const;

function defaultProtagonist() {
  const openAiNode = atlasData.graph.nodes.find((node) => node.label === "OpenAI");
  const openAiMeaning = openAiNode
    ? atlasData.meaning.protagonists.find((item) => item.nodeId === openAiNode.id)
    : null;
  return openAiMeaning ?? atlasData.meaning.protagonists[0] ?? null;
}

function ProtagonistRail({
  protagonists,
  activeId,
  committedId,
  onPreview,
  onSelect,
}: {
  protagonists: MeaningProtagonist[];
  activeId: string | null;
  committedId: string | null;
  onPreview: (id: string | null, storyId: string | null) => void;
  onSelect: (id: string, storyId: string) => void;
}) {
  return (
    <div className="home-v76-rail home-v76-protagonist-rail" aria-label="선정된 지식 주인공">
      {protagonists.map((item) => {
        const node = graphNodeById.get(item.nodeId);
        if (!node) return null;
        return (
          <button
            key={item.id}
            type="button"
            className={`${item.nodeId === activeId ? "is-active" : ""}${item.nodeId === committedId ? " is-locked" : ""}`.trim()}
            aria-pressed={item.nodeId === committedId}
            onPointerEnter={() => onPreview(item.nodeId, item.id)}
            onPointerLeave={() => onPreview(null, null)}
            onFocus={() => onPreview(item.nodeId, item.id)}
            onBlur={() => onPreview(null, null)}
            onClick={() => onSelect(item.nodeId, item.id)}
          >
            <span>{graphNodeLabel(node)}</span>
            <small>{protagonistRoleLabel(item.role)}</small>
          </button>
        );
      })}
    </div>
  );
}

function MovementRail({
  movements,
  activeStoryId,
  committedStoryId,
  onPreview,
  onSelect,
}: {
  movements: MeaningMovement[];
  activeStoryId: string | null;
  committedStoryId: string | null;
  onPreview: (id: string | null, storyId: string | null) => void;
  onSelect: (id: string, storyId: string) => void;
}) {
  if (!movements.length) {
    return <p className="home-v76-honest-empty">현재 공개할 수 있는 검증된 버전 변화가 없습니다.</p>;
  }
  return (
    <div className="home-v76-rail home-v76-movement-rail" aria-label="검증된 Vault 변화">
      {movements.slice(0, 4).map((movement) => {
        const nodeId = movement.nodeIds.find((id) => graphNodeById.has(id)) ?? null;
        const delta = movementDeltaLabel(movement, true);
        return (
          <button
            key={movement.id}
            type="button"
            className={`${movement.id === activeStoryId ? "is-active" : ""}${movement.id === committedStoryId ? " is-locked" : ""}`.trim()}
            aria-pressed={movement.id === committedStoryId}
            disabled={!nodeId}
            onPointerEnter={() => onPreview(nodeId, movement.id)}
            onPointerLeave={() => onPreview(null, null)}
            onFocus={() => onPreview(nodeId, movement.id)}
            onBlur={() => onPreview(null, null)}
            onClick={() => nodeId && onSelect(nodeId, movement.id)}
          >
            <span>{movement.label}</span>
            <small>
              {movementKindLabel(movement.kind)}
              {delta ? ` · ${delta}` : ""}
            </small>
          </button>
        );
      })}
    </div>
  );
}

function CompassRail({
  alignments,
  activeId,
  committedStoryId,
  onPreview,
  onSelect,
}: {
  alignments: OperationalAlignment[];
  activeId: string | null;
  committedStoryId: string | null;
  onPreview: (id: string | null, storyId: string | null) => void;
  onSelect: (id: string, storyId: string) => void;
}) {
  return (
    <div className="home-v76-rail home-v76-compass-rail" aria-label="운영 나침반">
      {alignments.map((item, index) => {
        const nodeId = item.domainIds.find((id) => graphNodeById.has(id)) ?? null;
        const actor = atlasData.agency.actors.find((candidate) => candidate.id === item.actorId);
        const actorLabel = item.actorId === atlasData.agency.principal.id
          ? atlasData.agency.principal.label
          : actor?.label ?? "Owner";
        return (
          <button
            key={item.id}
            type="button"
            className={`${nodeId === activeId ? "is-active" : ""}${item.id === committedStoryId ? " is-locked" : ""}`.trim()}
            aria-pressed={item.id === committedStoryId}
            onPointerEnter={() => onPreview(nodeId, item.id)}
            onPointerLeave={() => onPreview(null, null)}
            onFocus={() => onPreview(nodeId, item.id)}
            onBlur={() => onPreview(null, null)}
            onClick={() => nodeId && onSelect(nodeId, item.id)}
          >
            <strong>{item.label}</strong>
            <span>{actorLabel}{index === 0 && alignments.length > 1 ? ` · 옆으로 ${alignments.length - 1}개 더` : ""}</span>
          </button>
        );
      })}
    </div>
  );
}

export function HomeView() {
  const { state, dispatch } = useAtlasState();
  const sceneId = normalizedScene(state.sceneId);
  const scene = HOME_SCENES.find((item) => item.id === sceneId)!;
  const defaultMeaningProtagonist = useMemo(defaultProtagonist, []);
  const committedGraphFocus = state.focusId && graphNodeById.has(state.focusId) ? state.focusId : null;
  const sceneFallbackFocus = sceneId === "protagonists" ? defaultMeaningProtagonist?.nodeId ?? null : null;
  const graphFocus = committedGraphFocus ?? sceneFallbackFocus;
  const previewId = state.previewId && graphNodeById.has(state.previewId) ? state.previewId : null;
  const activeId = previewId ?? graphFocus;
  const focusedNode = activeId ? graphNodeById.get(activeId) ?? null : null;
  const selectedProtagonist = activeId
    ? atlasData.meaning.protagonists.find((item) => item.nodeId === activeId) ?? null
    : null;
  const focusedDistrict = focusedNode
    ? atlasData.graph.clusters.find((cluster) => cluster.id === focusedNode.clusterId)?.label ?? "구역 미확인"
    : null;
  const relations = useMemo(() => focusedNode ? relationSummary(focusedNode) : null, [focusedNode]);
  const incomingCount = relations?.incomingCount ?? 0;
  const outgoingCount = relations?.outgoingCount ?? 0;
  const persistentLabelIds = useMemo(
    () => CORE_DOMAINS.flatMap((item) => item.node ? [item.node.id] : []),
    [],
  );
  const [intro, setIntro] = useState(false);
  const [previewStoryId, setPreviewStoryId] = useState<string | null>(null);
  const [committedStoryId, setCommittedStoryId] = useState<string | null>(null);
  const activeStoryId = previewStoryId ?? committedStoryId;
  const activeProtagonist = activeStoryId
    ? atlasData.meaning.protagonists.find((item) => item.id === activeStoryId) ?? null
    : null;
  const activeMovement = activeStoryId
    ? atlasData.meaning.movements.find((item) => item.id === activeStoryId) ?? null
    : null;
  const activeAlignment = activeStoryId
    ? atlasData.meaning.operationalCompass.find((item) => item.id === activeStoryId) ?? null
    : null;
  const displayedAlignment = sceneId === "operational-compass"
    ? activeAlignment ?? atlasData.meaning.operationalCompass[0] ?? null
    : null;
  const displayedAlignmentActor = displayedAlignment
    ? displayedAlignment.actorId === atlasData.agency.principal.id
      ? atlasData.agency.principal.label
      : atlasData.agency.actors.find((actor) => actor.id === displayedAlignment.actorId)?.label ?? "Owner"
    : null;
  const activeStatement = activeProtagonist?.thesis
    ?? activeMovement?.caveat
    ?? activeAlignment?.statement
    ?? selectedProtagonist?.thesis
    ?? null;
  const activeMovementDelta = activeMovement ? movementDeltaLabel(activeMovement) : null;
  const hasExplicitFocus = Boolean(focusedNode && (previewId || committedGraphFocus));
  const hasCommittedFocus = Boolean(committedGraphFocus && !previewId);

  useEffect(() => {
    try {
      const key = "homi-atlas-v7-6-entry-seen";
      if (sessionStorage.getItem(key) !== "1") {
        setIntro(true);
        sessionStorage.setItem(key, "1");
      }
    } catch {
      setIntro(false);
    }
  }, []);

  useEffect(() => {
    setPreviewStoryId(null);
    setCommittedStoryId(null);
  }, [sceneId]);

  const openScene = (nextScene: HomeSceneId) => {
    dispatch({ type: "journey", target: { workspace: "home", sceneId: nextScene } });
  };
  const preview = (focusId: string | null) => {
    setPreviewStoryId(null);
    dispatch({ type: "preview", focusId });
  };
  const previewStory = (focusId: string | null, storyId: string | null) => {
    setPreviewStoryId(storyId);
    dispatch({ type: "preview", focusId });
  };
  const select = (focusId: string) => {
    setCommittedStoryId(null);
    dispatch({ type: "focus", focusId, openInspector: false });
  };
  const selectStory = (focusId: string, storyId: string) => {
    setCommittedStoryId(storyId);
    dispatch({ type: "focus", focusId, openInspector: false });
  };
  const openEvidence = () => {
    if (sceneId === "vault-in-motion") {
      dispatch({ type: "journey", target: { workspace: "time", sceneId: "version-evolution", focusId: focusedNode?.id ?? null } });
      return;
    }
    if (sceneId === "operational-compass") {
      dispatch({ type: "journey", target: { workspace: "agency", sceneId: "compass" } });
      return;
    }
    dispatch({
      type: "journey",
      target: {
        workspace: "explore",
        sceneId: sceneId === "protagonists" ? "constellations" : "graph",
        focusId: focusedNode?.id ?? null,
        districtId: focusedNode?.clusterId ?? null,
      },
    });
  };

  return (
    <div
      className={`home-v75 home-v76 is-${scene.legacyVisual} is-v76-${sceneId}`}
      lang="ko"
      data-home-page={sceneId}
    >
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
            committedSelectionId={committedGraphFocus}
            previewId={previewId}
            from={null}
            to={null}
            persistentLabelIds={persistentLabelIds}
            districtRelationMatrix={atlasData.relation.matrix}
            operationalAlignment={displayedAlignment}
            operationalActorLabel={displayedAlignmentActor}
            presentation="home"
            mobile={state.mobileSibling}
            reducedMotion={state.reducedMotion}
            onSelect={select}
            onHover={preview}
          />
        </m.div>

        {sceneId === "core-gravity" && (
          <button
            type="button"
            className="home-v76-system-anchor"
            aria-label="Homi 협업 구조 자세히 보기"
            onClick={() => dispatch({ type: "journey", target: { workspace: "agency", sceneId: "system" } })}
          >
            <img src={homiMark} alt="" aria-hidden="true" />
            <strong>HOMI</strong>
          </button>
        )}

        {sceneId === "core-gravity" && (
          <div className="home-v76-domain-legend" aria-label="핵심 지식 영역">
            {CORE_DOMAINS.map((domain) => (
              <button
                key={domain.key}
                type="button"
                disabled={!domain.node}
                onPointerEnter={() => preview(domain.node?.id ?? null)}
                onPointerLeave={() => preview(null)}
                onFocus={() => preview(domain.node?.id ?? null)}
                onBlur={() => preview(null)}
                onClick={() => domain.node && select(domain.node.id)}
              >
                <strong>{domain.label}</strong>
                <span>{domain.role}</span>
              </button>
            ))}
          </div>
        )}

        <m.article
          key={scene.id}
          className="home-v75-editorial"
          initial={state.reducedMotion ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="home-v75-copy-block">
            <span className="home-v75-eyebrow" lang="en">{scene.eyebrow}</span>
            <h1 id="home-v75-title">
              {scene.title.split("\n").map((line) => <span key={line}>{line}</span>)}
            </h1>
            <p>{scene.body}</p>
            {sceneId === "protagonists" && (
              <ProtagonistRail
                protagonists={atlasData.meaning.protagonists}
                activeId={activeId}
                committedId={committedGraphFocus}
                onPreview={previewStory}
                onSelect={selectStory}
              />
            )}
            {sceneId === "vault-in-motion" && (
              <>
                <MovementRail
                  movements={atlasData.meaning.movements}
                  activeStoryId={activeStoryId}
                  committedStoryId={committedStoryId}
                  onPreview={previewStory}
                  onSelect={selectStory}
                />
                <div className="home-v75-actions">
                  <button type="button" className="is-primary" onClick={() => dispatch({ type: "journey", target: { workspace: "time", sceneId: "version-evolution" } })}>
                    전체 변화 {atlasData.meaning.movements.length}개 보기 <ArrowRight size={16} aria-hidden="true" />
                  </button>
                </div>
              </>
            )}
            {sceneId === "operational-compass" && (
              <>
                <CompassRail
                  alignments={atlasData.meaning.operationalCompass}
                  activeId={activeId}
                  committedStoryId={committedStoryId}
                  onPreview={previewStory}
                  onSelect={selectStory}
                />
                <div className="home-v75-actions">
                  <button type="button" className="is-primary" onClick={() => dispatch({ type: "journey", target: { workspace: "agency", sceneId: "compass" } })}>
                    Agency Compass <ArrowRight size={16} aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => dispatch({ type: "search", open: true })}>
                    <Search size={16} aria-hidden="true" /> 지식 검색
                  </button>
                </div>
              </>
            )}
          </div>
        </m.article>

        <div className={`home-v75-evidence${hasExplicitFocus ? " has-focus" : ""}${hasCommittedFocus ? " is-committed" : ""}`} aria-live="polite">
          <span className="home-v75-evidence-profile" lang="en">
            {atlasData.graph.profile === "atlas-owner" ? "OWNER · LOCAL ONLY" : "PUBLIC SNAPSHOT"}
          </span>
          {focusedNode ? (
            <>
              <div className="home-v75-evidence-primary">
                {hasCommittedFocus && <span className="home-v75-lock-state">선택 고정</span>}
                <strong>{graphNodeLabel(focusedNode)}</strong>
                <span className="home-v75-evidence-context">{nodeKindLabel(focusedNode)} · {focusedDistrict}</span>
                <span className="home-v75-evidence-metric">참조 문서 {focusedNode.gravity.toLocaleString("ko-KR")}</span>
                <span className="home-v75-evidence-metric">전체 참조 {focusedNode.occurrences.toLocaleString("ko-KR")}</span>
                <span className="home-v75-evidence-metric">{focusedNode.freshness ?? "날짜 미기록"}</span>
                <span className="home-v75-evidence-direction-count">들어오는 {incomingCount} · 나가는 {outgoingCount}</span>
              </div>
              <div className="home-v75-evidence-secondary">
                {relations?.incoming.length
                  ? <span className="home-v75-relation-names"><b>들어옴</b> {relations.incoming.map((item) => item.label).join(" · ")} → {graphNodeLabel(focusedNode)}</span>
                  : null}
                {relations?.outgoing.length
                  ? <span className="home-v75-relation-names"><b>나감</b> {graphNodeLabel(focusedNode)} → {relations.outgoing.map((item) => item.label).join(" · ")}</span>
                  : null}
                {activeMovementDelta && <span className="home-v75-movement-delta">{activeMovementDelta}</span>}
                {activeStatement && <em>{activeStatement}</em>}
                {incomingCount + outgoingCount === 0
                  ? <em>확인된 직접 연결 없음</em>
                  : ((relations?.hiddenIncoming ?? 0) + (relations?.hiddenOutgoing ?? 0) > 0)
                    ? <span>숨긴 관계 {(relations?.hiddenIncoming ?? 0) + (relations?.hiddenOutgoing ?? 0)}개</span>
                    : null}
                <button type="button" className="home-v75-evidence-action" onClick={openEvidence}>
                  {sceneId === "vault-in-motion"
                    ? "변화 증거 보기"
                    : sceneId === "operational-compass"
                      ? "운영 나침반 보기"
                      : "관계 자세히 보기"}
                  <ArrowRight size={13} aria-hidden="true" />
                </button>
              </div>
            </>
          ) : (
            <>
              <strong>Homi knowledge system</strong>
              <span>MOC · 구조화</span>
              <span>Papers · 근거</span>
              <span>Signals · 변화</span>
              <span>노드에 닿으면 실제 이름과 연결 방향</span>
            </>
          )}
        </div>

        <nav className="home-v75-scenes" aria-label="Home visual chapters" lang="en">
          <span className="home-v75-scenes-title" aria-hidden="true">MEANING</span>
          {HOME_SCENES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === sceneId ? "is-active" : ""}
              aria-current={item.id === sceneId ? "page" : undefined}
              aria-label={`${item.index}. ${item.label}`}
              title={item.label}
              onClick={() => openScene(item.id)}
            >
              <i aria-hidden="true" />
              <span>{item.shortLabel}</span>
            </button>
          ))}
        </nav>

        <footer className="home-v75-boundary" aria-label={`${atlasData.graph.profile === "atlas-owner" ? "Owner local" : "Public"} snapshot boundary`}>
          <span>이름으로 표현 {atlasData.inventory.namedCount.toLocaleString("ko-KR")}</span>
          <span>지식 주인공 {atlasData.meaning.manifest.protagonistCount.toLocaleString("ko-KR")}</span>
          <span>검증된 변화 {atlasData.meaning.manifest.movementCount.toLocaleString("ko-KR")}</span>
          <small>{atlasData.graph.profile === "atlas-owner" ? "Luke Mac 전용 · noindex · 외부 telemetry 0" : "검증된 버전 스냅샷 · 실시간 상태 아님"} · {atlasData.inventory.asOfDate}</small>
        </footer>

        {focusedNode && (
          <p className="sr-only" aria-live="polite">
            현재 선택 {graphNodeLabel(focusedNode)}. 이 항목을 참조한 고유 문서 {focusedNode.gravity}개.
            실제 들어오는 참조 {incomingCount}개, 나가는 참조 {outgoingCount}개.
          </p>
        )}
      </section>
    </div>
  );
}
