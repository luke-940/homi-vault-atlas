import { ArrowRight, Compass, FastForward, Pause, Play, Sparkles } from "lucide-react";
import homiLockup from "../assets/brand/homi-ai-lockup-light-amber.svg";
import { atlasData, entityById } from "../data";
import { useAtlasState } from "../state";
import type { AtlasInsight, InsightTargetScene } from "../types";

const guideSteps = [
  {
    title: "Pulse를 먼저 읽기",
    body: "왼쪽 경로는 최신 신호가 중심 지식과 판단 표면으로 이동한 검증 기록을 보여줍니다.",
  },
  {
    title: "네 가지 인사이트 고르기",
    body: "오른쪽 네 줄은 수량과 관계 근거가 있는 현재 답입니다. 누르면 해당 지도의 정확한 장면으로 이동합니다.",
  },
  {
    title: "한 객체를 끝까지 따라가기",
    body: "탐색, 관측, 흐름, 시간에서도 같은 선택을 유지합니다. 검색은 어디서든 Cmd+K로 열 수 있습니다.",
  },
] as const;

const publicProfile = atlasData.publication.profile === "public";
const homeDocumentCount = publicProfile
  ? atlasData.publication.redactionCounts.aggregatedSourceDocuments
    ?? atlasData.bootstrap.snapshot.activeMarkdownCount
  : atlasData.bootstrap.snapshot.activeMarkdownCount;
const homeDocumentLabel = publicProfile ? "집계 문서" : "활성 문서";
const homeRelationCount = publicProfile
  ? atlasData.relation.matrix.length
  : atlasData.relation.coverage.typedRelations;
const homeRelationLabel = publicProfile ? "연결군" : "명시 관계";

function targetToJourney(target: InsightTargetScene) {
  return {
    workspace: target.workspace,
    sceneId: target.scene,
    focusId: target.focusId,
    lens: target.lens,
    relationPairId: target.relationPairId,
    relationLayer: target.relationLayer,
    routeId: target.routeId,
    eraId: target.eraId,
  };
}

function insightLabel(insight: AtlasInsight) {
  return ({
    latest_pulse: "최신 Pulse",
    strongest_relation: "가장 강한 연결",
    knowledge_concentration: "지식 집중 구역",
    attention: "주의 신호",
  } as const)[insight.kind];
}

function shortPulseLabel(value: string) {
  return value.length > 26 ? `${value.slice(0, 24).trimEnd()}…` : value;
}

function KnowledgePulseMap() {
  const { state, dispatch } = useAtlasState();
  const pulse = atlasData.flow.pulse;
  const chains = pulse.chains.slice(0, 4);
  const rows = [154, 254, 354, 454];

  return (
    <div className="home-pulse-map" aria-label="최신 Daily에서 중심 지식과 판단으로 이동한 지식 Pulse">
      <svg viewBox="0 0 1120 610" role="group" aria-labelledby="pulse-map-title pulse-map-desc">
        <title id="pulse-map-title">{pulse.latestDailyDate ?? "최근 Daily"} 지식 Pulse</title>
        <desc id="pulse-map-desc">소스 창에서 Daily, 중심 지식과 판단까지 확인된 전파 경로. 읽기용 표면은 별도 검증이 필요한 경계로 표시한다.</desc>
        <defs>
          <pattern id="pulse-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0H0V40" fill="none" stroke="rgba(44,77,66,.075)" strokeWidth="1" />
          </pattern>
          <linearGradient id="pulse-trunk" x1="0" x2="1">
            <stop offset="0" stopColor="#63a7a0" />
            <stop offset=".55" stopColor="#6f8fd8" />
            <stop offset="1" stopColor="#ed9840" />
          </linearGradient>
          <filter id="pulse-soft-shadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#294c41" floodOpacity=".16" />
          </filter>
        </defs>
        <rect width="1120" height="610" fill="url(#pulse-grid)" />
        <path className="pulse-backbone" d="M92 304 C165 304 198 304 260 304 C330 304 350 304 414 304" />
        {chains.map((chain, index) => {
          const stages = chain.stages as Array<{ role: string; label: string; entityId: string | null }>;
          const knowledge = stages.find((stage) => stage.role === "knowledge");
          const decision = stages.find((stage) => stage.role === "decision");
          const entity = knowledge?.entityId ? entityById.get(knowledge.entityId) : undefined;
          const fullLabel = entity?.displayLabel ?? knowledge?.label ?? "중심 지식";
          const y = rows[index];
          const path = `M414 304 C470 304 472 ${y} 534 ${y} L716 ${y} C788 ${y} 780 304 842 304`;
          const selected = state.focusId === knowledge?.entityId;
          const previewed = state.previewId === knowledge?.entityId;
          const interactive = Boolean(knowledge?.entityId);
          return (
            <g key={String(chain.id)} className={`pulse-chain${selected ? " is-selected" : ""}${previewed ? " is-preview" : ""}`}>
              <path id={`pulse-path-${index}`} className="pulse-branch" d={path} />
              <g
                className="pulse-knowledge-node"
                transform={`translate(620 ${y})`}
                role={interactive ? "button" : undefined}
                tabIndex={interactive ? 0 : undefined}
                aria-label={`${fullLabel}, ${decision?.label ?? "판단 상태"}`}
                onPointerEnter={() => knowledge?.entityId && dispatch({ type: "preview", focusId: knowledge.entityId })}
                onPointerLeave={() => dispatch({ type: "preview", focusId: null })}
                onFocus={() => knowledge?.entityId && dispatch({ type: "preview", focusId: knowledge.entityId })}
                onBlur={() => dispatch({ type: "preview", focusId: null })}
                onClick={() => knowledge?.entityId && dispatch({ type: "focus", focusId: knowledge.entityId })}
                onKeyDown={(event) => {
                  if ((event.key === "Enter" || event.key === " ") && knowledge?.entityId) {
                    event.preventDefault();
                    dispatch({ type: "focus", focusId: knowledge.entityId });
                  }
                }}
              >
                <title>{`${fullLabel} · ${decision?.label ?? "판단 상태"}`}</title>
                <circle r="44" fill="#f8fbf9" stroke={selected ? "#ed9840" : "#79aaa0"} strokeWidth={selected ? 4 : 2} filter="url(#pulse-soft-shadow)" />
                <circle r="30" fill={index % 2 ? "#e7ecfb" : "#e4f1ed"} stroke="rgba(35,77,65,.2)" />
                <circle r="5" fill={selected ? "#ed9840" : "#376e63"} />
                <text y="62" textAnchor="middle" className="pulse-node-label">
                  <tspan x="0">{shortPulseLabel(fullLabel)}</tspan>
                  <tspan x="0" dy="15" className="pulse-node-state">{decision?.label ?? "판단 상태"}</tspan>
                </text>
              </g>
              {!state.reducedMotion && !document.hidden && knowledge?.entityId && (
                <circle className="home-pulse-packet" r="5" fill="#ed9840">
                  <animateMotion dur={`${1.55 + index * 0.12}s`} begin={`${0.3 + index * 0.14}s`} repeatCount="1" path={path} />
                </circle>
              )}
            </g>
          );
        })}
        <g className="pulse-origin" transform="translate(92 304)">
          <circle r="47" fill="#e5f2ee" stroke="#5b9d93" strokeWidth="2" />
          <circle r="10" fill="#5b9d93" />
          <text y="73" textAnchor="middle"><tspan x="0">소스 창</tspan><tspan x="0" dy="15" className="pulse-node-state">{pulse.sourceItemCount ?? "확인"}건 검토</tspan></text>
        </g>
        <g className="pulse-daily" transform="translate(288 304)">
          <path d="M0-54 46-27 46 27 0 54-46 27-46-27Z" fill="#e8edfb" stroke="#6d86c8" strokeWidth="2.5" />
          <circle r="9" fill="#6d86c8" />
          <text y="78" textAnchor="middle"><tspan x="0">Daily</tspan><tspan x="0" dy="15" className="pulse-node-state">{pulse.latestDailyDate ?? "최근"}</tspan></text>
        </g>
        <path className="pulse-outbound is-boundary" d="M842 304 C910 304 954 304 1020 304" />
        <g className="pulse-readable" transform="translate(1020 304)">
          <rect x="-54" y="-42" width="108" height="84" rx="8" fill="#fff2e4" stroke="#d98a3f" strokeWidth="2" />
          <path d="M-29-14H29M-29 0H18M-29 14H8" stroke="#bd7130" strokeWidth="3" strokeLinecap="round" />
          <text y="70" textAnchor="middle"><tspan x="0">팀 읽기 경계</tspan><tspan x="0" dy="15" className="pulse-node-state">별도 검증</tspan></text>
        </g>
        <text x="52" y="58" className="pulse-map-kicker">LIVE KNOWLEDGE PULSE · {pulse.latestDailyDate ?? "LATEST"}</text>
        <text x="52" y="88" className="pulse-map-headline">{publicProfile ? `${chains.length}개의 공개 역할 경로를 요약합니다` : `${chains.length}개의 확인된 경로가 중심 지식으로 이어졌습니다`}</text>
      </svg>
    </div>
  );
}

function InsightRail() {
  const { dispatch } = useAtlasState();
  return (
    <aside className="home-insight-rail" aria-label="현재 스냅샷 인사이트">
      <header>
        <span className="eyebrow">지금 이 Vault에서 읽을 것</span>
        <h2>네 가지 현재 답</h2>
        <p>모든 문장은 frozen snapshot 수량과 relation evidence에 연결됩니다.</p>
      </header>
      <div className="home-insight-list">
        {atlasData.insight.items.map((insight, index) => (
          <button
            key={insight.id}
            type="button"
            className={`home-insight-row insight-${insight.kind}`}
            onClick={() => dispatch({ type: "journey", target: targetToJourney(insight.targetScene) })}
          >
            <span className="insight-index">{String(index + 1).padStart(2, "0")}</span>
            <span className="insight-copy">
              <small>{insightLabel(insight)}</small>
              <strong>{insight.headline}</strong>
              <em>{insight.metric.value}{insight.metric.unit ?? ""} · {insight.metric.label}</em>
            </span>
            <ArrowRight size={17} aria-hidden="true" />
          </button>
        ))}
      </div>
    </aside>
  );
}

function GuideRail() {
  const { state, dispatch } = useAtlasState();
  const close = () => {
    try { window.localStorage.setItem("homi-atlas-v7-1-guide-seen", "1"); } catch { /* noop */ }
    dispatch({ type: "guide", step: null });
  };
  if (state.guideStep === null) {
    return (
      <button className="guide-replay" type="button" onClick={() => dispatch({ type: "guide", step: 0 })}>
        <Play size={15} aria-hidden="true" /> 30초 가이드
      </button>
    );
  }
  const step = guideSteps[state.guideStep];
  return (
    <section className="home-guide-rail" aria-live="polite" aria-label={`가이드 ${state.guideStep + 1}단계`}> 
      <span className="guide-progress">0{state.guideStep + 1}<i style={{ width: `${((state.guideStep + 1) / guideSteps.length) * 100}%` }} /></span>
      <div><strong>{step.title}</strong><p>{step.body}</p></div>
      <div className="guide-actions">
        <button type="button" onClick={close}><Pause size={14} /> 건너뛰기</button>
        {state.guideStep < guideSteps.length - 1 ? (
          <button type="button" className="is-primary" onClick={() => dispatch({ type: "guide", step: state.guideStep! + 1 })}>
            다음 <FastForward size={14} />
          </button>
        ) : (
          <button type="button" className="is-primary" onClick={() => { close(); dispatch({ type: "journey", target: { workspace: "explore", sceneId: "city-overview", lens: "city" } }); }}>
            자유 탐색 <Compass size={14} />
          </button>
        )}
      </div>
    </section>
  );
}

function MobileHome() {
  const { dispatch } = useAtlasState();
  return (
    <div className="mobile-home-sibling">
      <section className="mobile-home-intro">
        <img src={homiLockup} alt="Homi AI" />
        <span className="eyebrow">Living Insight Gateway</span>
        <h1>지식이 들어와 판단으로 바뀌는 순간을 봅니다</h1>
        <p>{atlasData.flow.pulse.latestDailyDate ?? "최근"} Pulse · {homeDocumentLabel} {homeDocumentCount}개</p>
      </section>
      <section className="mobile-home-insights" aria-label="현재 인사이트">
        {atlasData.insight.items.map((insight, index) => (
          <button key={insight.id} type="button" onClick={() => dispatch({ type: "journey", target: targetToJourney(insight.targetScene) })}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{insight.headline}</strong>
            <ArrowRight size={16} />
          </button>
        ))}
      </section>
      <section className="mobile-home-pulse-mini" aria-label="Pulse 미니 지도">
        <i>소스</i><b /><i>Daily</i><b /><i>중심 지식</i><b /><i>판단</i>
      </section>
      <button className="mobile-home-explore" type="button" onClick={() => dispatch({ type: "journey", target: { workspace: "explore", sceneId: "city-overview", lens: "city" } })}>
        지도를 직접 탐색하기 <ArrowRight size={17} />
      </button>
    </div>
  );
}

export function HomeView() {
  return (
    <section className="home-view" aria-labelledby="home-title">
      <header className="home-command-intro">
        <div>
          <img src={homiLockup} alt="Homi AI" />
          <span className="eyebrow">Living Insight Gateway</span>
          <h1 id="home-title">지식이 들어와 판단으로 바뀌는 순간을 봅니다</h1>
        </div>
        <div className="home-snapshot-readout">
          <span><b>{homeDocumentCount}</b> {homeDocumentLabel}</span>
          <span><b>{homeRelationCount}</b> {homeRelationLabel}</span>
          <span><b>{atlasData.temporal.eras.length}</b> Era</span>
        </div>
      </header>
      <div className="home-desktop-stage">
        <KnowledgePulseMap />
        <InsightRail />
      </div>
      <MobileHome />
      <GuideRail />
      <span className="home-evidence-boundary"><Sparkles size={13} /> {atlasData.insight.evidenceBoundary}</span>
    </section>
  );
}
