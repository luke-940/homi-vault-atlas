import { ArrowRight, Clock3, GitBranch, Sparkles } from "lucide-react";
import { area, curveCatmullRom } from "d3";
import { useEffect, useMemo, useRef } from "react";
import { WorkspaceHeader } from "../components/WorkspaceHeader";
import { atlasData, entityById } from "../data";
import { useElementSize } from "../hooks/useElementSize";
import { useAtlasState } from "../state";

const eraStateColors: Record<string, string> = {
  born: "#4c9d8e",
  persisted: "#6c8db4",
  weakened: "#d19a59",
  retired: "#bc6f73",
  unknown: "#aab5b0",
};

const eraStateOrder = ["born", "persisted", "weakened", "retired"] as const;
const eraStateLabels: Record<string, string> = {
  born: "새로 생김",
  persisted: "지속",
  weakened: "약화",
  retired: "종료",
  unknown: "미확정",
};
const confidenceLabels = { high: "높음", medium: "중간", low: "낮음" } as const;
const currentnessLabels: Record<string, string> = {
  live: "현재 사용",
  durable: "지속 기준",
  candidate: "검토 중",
  reference: "참고",
  historical: "역사 기록",
  archive: "보관",
  projection: "현재 상태 반영본",
  public_snapshot: "공개 스냅샷",
};

function evidenceLabel(value: string) {
  const labels: Record<string, string> = {
    canonical: "정본 근거",
    canonical_and_history: "정본·역사 근거",
    "canonical_or_same-era_history": "정본 또는 같은 시대 기록",
    history: "역사 기록",
    curated_synthesis: "선별 해석",
    curated_l4_historical_synthesis: "선별한 역사 기록 해석",
    l4_historical_synthesis: "역사 기록 기반 해석",
    l4_event_record: "사건 기록",
    l4_event_record_interpretive: "사건 기록 기반 해석",
    l4_batch_retrospective: "배치 회고",
    l4_batch_retrospective_interpretive: "배치 회고 기반 해석",
    l4_same_era_event_record: "같은 시대 사건 기록",
    l2_canonical_current_state: "현재 상태 정본",
    "canonical current plus same era history": "현재 정본과 같은 시대 기록",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

const recordedLifecycleStates = eraStateOrder.filter((stateName) =>
  atlasData.temporal.eras.some((era) => era.deltas.some((delta) => delta.state === stateName)),
);
const plottedLifecycleStates = recordedLifecycleStates.length ? recordedLifecycleStates : (["born"] as const);

export function TimeView() {
  const { state, dispatch } = useAtlasState();
  const era = atlasData.temporal.eras.find((item) => item.id === state.eraId)!;
  const activeEraRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeEraRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [state.eraId]);
  const previous = atlasData.temporal.eras.find((item) => item.id === era.id - 1);
  const next = atlasData.temporal.eras.find((item) => item.id === era.id + 1);
  const recordedStates = new Set(era.deltas.map((delta) => delta.state));
  const missingStates = eraStateOrder.filter((stateName) => !recordedStates.has(stateName));
  return (
    <section className="workspace-view time-view" aria-labelledby="time-title">
      <WorkspaceHeader
        titleId="time-title"
        eyebrow="시간 지식 지도"
        title="남아 있는 기록은 Vault의 어떤 전환을 증명하는가"
        question="각 변화에 직접 연결된 기록만 보여준다. 근거가 부족한 상태와 생애주기는 미확정으로 남긴다."
        answer={`시대 ${era.id}에는 근거가 남은 변화 ${era.deltas.length}개와 미확정 항목 ${era.unknown.length}개가 있다.`}
        keyItems={[
          ...[...plottedLifecycleStates, "unknown"].map((stateName) => ({ label: eraStateLabels[stateName], className: `key-era-${stateName}` })),
          { label: "층 = 기록 유무 · 숫자 = 수 · 투명도 = 신뢰", className: "key-era-evidence" },
        ]}
      />
      <nav className="era-rail" aria-label="Era 선택">
        {atlasData.temporal.eras.map((item) => (
          <button
            key={item.id}
            ref={item.id === state.eraId ? activeEraRef : undefined}
            type="button"
            title={item.title}
            className={item.id === state.eraId ? "is-active" : ""}
            aria-pressed={item.id === state.eraId}
            onClick={() => dispatch({ type: "era", eraId: item.id })}
          >
            <span>{String(item.id).padStart(2, "0")}</span><strong>{item.title}</strong>
          </button>
        ))}
      </nav>
      <div className="desktop-visual-surface temporal-surface">
        <section className="era-overview-panel">
          <div className="panel-title-row"><div><span className="eyebrow">시대별 변화 비교</span><h2>시대 1 → 11</h2></div><span className="panel-readout">근거가 남은 변화만 집계</span></div>
          <EraPlot />
        </section>
        <section className="era-focus-panel">
          <div className="era-focus-index">시대 {String(era.id).padStart(2, "0")}</div>
          <h2>{era.title}</h2>
          <p className="era-range">{era.range}</p>
          <p className="era-thesis">{era.thesis}</p>
          <div className="era-delta-ledger">
            {era.deltas.map((delta) => (
              <div key={delta.label} title={`${delta.evidenceRef}#${delta.evidenceAnchor}`}><i style={{ background: eraStateColors[delta.state] }} /><span><strong>{delta.label}</strong><small>{eraStateLabels[delta.state]} · 근거 신뢰 {confidenceLabels[delta.confidence]} · {evidenceLabel(delta.evidenceClass)}</small></span></div>
            ))}
            {missingStates.map((stateName) => (
              <div key={`missing-${stateName}`}><i style={{ background: "transparent", border: `1px dashed ${eraStateColors[stateName]}` }} /><span><strong>{eraStateLabels[stateName]} 기록 없음</strong><small>변화가 0이라는 뜻이 아니라, 판정할 근거가 남아 있지 않음</small></span></div>
            ))}
            {era.unknown.map((label) => (
              <div key={label}><i style={{ background: eraStateColors.unknown }} /><span><strong>{label}</strong><small>미확정 · 부재로 단정하지 않음</small></span></div>
            ))}
          </div>
          <div className="era-transition-strip">
            <span>{previous ? `이전 · ${previous.title}` : "시작"}</span>
            <ArrowRight size={16} />
            <strong>{era.title}</strong>
            <ArrowRight size={16} />
            <span>{next ? `다음 · ${next.title}` : "현재"}</span>
          </div>
        </section>
        <EntityTimeReadout />
      </div>
      <MobileTime />
    </section>
  );
}

function EraPlot() {
  const { state, dispatch } = useAtlasState();
  const { ref: containerRef, width, height } = useElementSize<HTMLDivElement>();
  const plotWidth = Math.max(720, width || 720);
  const plotHeight = Math.max(300, height || 300);
  const margin = { left: 88, right: 24, top: 24, bottom: 48 };
  const laneGap = (plotHeight - margin.top - margin.bottom) / (eraStateOrder.length + 0.45);
  const xForEra = (eraId: number) => margin.left + ((plotWidth - margin.left - margin.right) * (eraId - 1)) / Math.max(1, atlasData.temporal.eras.length - 1);
  const strata = useMemo(() => eraStateOrder.map((stateName, laneIndex) => {
    const center = margin.top + laneGap * (laneIndex + 0.65);
    const samples = atlasData.temporal.eras.map((era) => {
      const deltas = era.deltas.filter((delta) => delta.state === stateName);
      const confidenceFloor = deltas.some((delta) => delta.confidence === "low") ? "low" : deltas.some((delta) => delta.confidence === "medium") ? "medium" : "high";
      const confidenceOpacity = confidenceFloor === "high" ? 1 : confidenceFloor === "medium" ? 0.72 : 0.5;
      const amplitude = deltas.length ? Math.min(laneGap * 0.18, 8) : 1.4;
      return { era, deltas, x: xForEra(era.id), center, amplitude, confidenceOpacity };
    });
    const path = area<(typeof samples)[number]>()
      .x((sample) => sample.x)
      .y0((sample) => sample.center - sample.amplitude)
      .y1((sample) => sample.center + sample.amplitude)
      .curve(curveCatmullRom.alpha(0.55))(samples) ?? "";
    return { stateName, center, samples, path };
  }), [laneGap, plotWidth]);
  const unknownY = plotHeight - 24;
  return (
    <div className="era-plot-shell">
      <div className="era-plot era-strata" ref={containerRef} data-testid="era-small-multiples">
        <svg viewBox={`0 0 ${plotWidth} ${plotHeight}`} role="group" data-selected-era={state.eraId} aria-label="시대 1부터 11까지 탄생, 지속, 약화, 종료의 증거 흐름을 층으로 보여준다. 층은 변화 기록 유무, 숫자는 기록 수, 표식 투명도는 근거 신뢰를 뜻한다.">
          <defs>
            <filter id="era-strata-glow" x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation="4" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          </defs>
          <rect className="era-current-column" x={xForEra(state.eraId) - 22} y="8" width="44" height={plotHeight - 38} rx="10" />
          {strata.map((stratum) => (
            <g key={stratum.stateName} className={`era-stratum era-stratum-${stratum.stateName}`}>
              <line x1={margin.left} x2={plotWidth - margin.right} y1={stratum.center} y2={stratum.center} className="era-strata-baseline" />
              <path d={stratum.path} fill={eraStateColors[stratum.stateName]} stroke={eraStateColors[stratum.stateName]} />
              <text x="10" y={stratum.center + 4} className="era-strata-label">{eraStateLabels[stratum.stateName]}</text>
              {stratum.samples.map((sample) => {
                const selected = sample.era.id === state.eraId;
                return sample.deltas.length ? (
                  <g key={sample.era.id} transform={`translate(${sample.x},${sample.center})`}>
                    <circle r={selected ? 10 : 7} opacity={sample.confidenceOpacity} className={selected ? "era-strata-mark is-selected" : "era-strata-mark"} fill={eraStateColors[stratum.stateName]} filter={selected ? "url(#era-strata-glow)" : undefined} />
                    <text y="3" textAnchor="middle" className="era-strata-count">{sample.deltas.length}</text>
                    <title>{`시대 ${sample.era.id} · ${eraStateLabels[stratum.stateName]} ${sample.deltas.length}개`}</title>
                  </g>
                ) : null;
              })}
            </g>
          ))}
          <g className="era-unknown-rail">
            <line x1={margin.left} x2={plotWidth - margin.right} y1={unknownY} y2={unknownY} />
            <text x="10" y={unknownY + 4} className="era-strata-label">미확정</text>
            {atlasData.temporal.eras.map((era) => era.unknown.length ? (
              <circle key={era.id} cx={xForEra(era.id)} cy={unknownY} r={Math.min(8, 3 + era.unknown.length)} />
            ) : null)}
          </g>
          {atlasData.temporal.eras.map((era) => (
            <g key={era.id} className="era-axis-stop">
              <text x={xForEra(era.id)} y={plotHeight - 3} textAnchor="middle">E{era.id}</text>
              <rect x={xForEra(era.id) - 20} y="0" width="40" height={plotHeight} fill="transparent" role="button" tabIndex={0} aria-label={`시대 ${era.id} ${era.title} 열기`} onClick={() => dispatch({ type: "era", eraId: era.id })} onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") dispatch({ type: "era", eraId: era.id });
              }} />
            </g>
          ))}
        </svg>
      </div>
      <div className="era-unknown-boundary">층 = 변화 기록 유무 · 숫자 = 기록 수 · 표식 투명도 = 근거 신뢰 · 얇은 선 = 기록 없음(0 변화 아님) · 현재 Era 미확정 {atlasData.temporal.eras.find((item) => item.id === state.eraId)?.unknown.length ?? 0}개</div>
    </div>
  );
}

function EntityTimeReadout() {
  const { state } = useAtlasState();
  const entity = entityById.get(state.focusId);
  return (
    <section className="entity-time-readout">
      <span className="eyebrow">현재 선택</span>
      <h3>{entity?.title ?? "선택 객체"}</h3>
      {entity ? (
        <dl>
          <div><dt>현재 권위</dt><dd>{entity.authority}</dd></div>
          <div><dt>현재성</dt><dd>{currentnessLabels[entity.currentness] ?? entity.currentness}</dd></div>
          <div>
            <dt>{atlasData.publication.profile === "public" ? "시간 기준" : "마지막 변경 거리"}</dt>
            <dd>{atlasData.publication.profile === "public" ? "공개 스냅샷 집계" : `${entity.ageDays}일`}</dd>
          </div>
          <div><dt>역사 경계</dt><dd>정확한 과거 파일 모습은 판단 근거 부족</dd></div>
        </dl>
      ) : <p>문서를 선택하면 현재 시점의 권위와 시간 경계를 함께 본다.</p>}
    </section>
  );
}

function MobileTime() {
  const { state, dispatch } = useAtlasState();
  const era = atlasData.temporal.eras.find((item) => item.id === state.eraId)!;
  const activeEraRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeEraRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [state.eraId]);
  return (
    <div className="mobile-sibling mobile-time">
      <section className="mobile-selection">
        <span className="eyebrow">시대 {String(era.id).padStart(2, "0")}</span>
        <h2>{era.title}</h2>
        <p>{era.thesis}</p>
        <button
          className="mobile-inspector-cue"
          type="button"
          aria-expanded={state.panel === "inspector"}
          aria-controls="atlas-inspector-tray"
          onClick={() => dispatch({ type: "panel", panel: "inspector" })}
        >
          선택 해석 보기
        </button>
      </section>
      <div className="mobile-era-scrubber" role="navigation" aria-label="시대 선택">
        {atlasData.temporal.eras.map((item) => <button key={item.id} ref={item.id === state.eraId ? activeEraRef : undefined} type="button" aria-label={`시대 ${item.id}: ${item.title}`} aria-pressed={item.id === state.eraId} className={item.id === state.eraId ? "is-active" : ""} onClick={() => dispatch({ type: "era", eraId: item.id })}>{item.id}</button>)}
      </div>
      <section className="mobile-ranked-list">
        <h3>이 Era의 변화</h3>
        {era.deltas.map((delta) => (
          <div className="mobile-era-row" key={delta.label}><i style={{ background: eraStateColors[delta.state] }} /><span><strong>{delta.label}</strong><small>{eraStateLabels[delta.state]} · 근거 신뢰 {confidenceLabels[delta.confidence]}</small></span><Sparkles size={16} /></div>
        ))}
        {era.unknown.map((label) => (
          <div className="mobile-era-row" key={label}><i style={{ background: eraStateColors.unknown }} /><span><strong>{label}</strong><small>미확정 · 부재로 단정하지 않음</small></span><Clock3 size={16} /></div>
        ))}
      </section>
      <div className="mobile-time-proof"><GitBranch size={18} /><span>{evidenceLabel(era.evidenceClass)} · 기록이 없는 상태는 변화 0으로 세지 않는다.</span></div>
      <button className="mobile-theatre-action" type="button" onClick={() => dispatch({ type: "theatre", open: true })}>시간 기록 집중 보기</button>
    </div>
  );
}
