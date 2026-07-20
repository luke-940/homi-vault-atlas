import { ArrowRight, CheckCircle2, Clock3, GitBranch, ShieldCheck } from "lucide-react";
import { area, curveCatmullRom } from "d3-shape";
import { useEffect, useMemo, useRef } from "react";
import { WorkspaceHeader } from "../components/WorkspaceHeader";
import { atlasData, entityById } from "../data-runtime";
import { useElementSize } from "../hooks/useElementSize";
import { useAtlasState } from "../state";
import type { AtlasActivityV1 } from "../types";
import {
  formatEraRange,
  lifecycleEvidenceSummary,
  lifecycleStateLabel,
  recordedLifecycleDeltas,
  recordedLifecycleStates,
} from "./time-model";

const eraStateColors: Record<string, string> = {
  born: "#4c9d8e",
  persisted: "#6c8db4",
  weakened: "#d19a59",
  retired: "#bc6f73",
  unknown: "#aab5b0",
};

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
    l4_same_era_event_record: "같은 시대 사건 기록",
    l2_canonical_current_state: "현재 상태 정본",
    "canonical current plus same era history": "현재 정본과 같은 시대 기록",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

const atlasEvidenceIds = new Set(atlasData.entity.entities.map((entity) => entity.id));
const plottedLifecycleStates = recordedLifecycleStates(atlasData.temporal.eras, atlasEvidenceIds);

function OwnerActivityTimeline({ activity }: { activity: AtlasActivityV1 }) {
  const rows = activity.lifecycle.filter((row) => row.created + row.completed + row.stopped > 0);
  const activityRows = (className: string) => (
    <div className={className}>
      {rows.map((row) => (
        <div className={className === "mobile-ranked-list" ? "mobile-era-row" : undefined} key={row.date}>
          <i style={{ background: eraStateColors.persisted }} aria-hidden="true" />
          <span><strong>{row.date}</strong><small>생성 {row.created} · 완료 {row.completed} · 안전 중지 {row.stopped}</small></span>
          {className === "mobile-ranked-list" && <CheckCircle2 size={16} aria-hidden="true" />}
        </div>
      ))}
    </div>
  );
  return (
    <section className="workspace-view time-view" aria-labelledby="time-title">
      <WorkspaceHeader
        titleId="time-title"
        eyebrow="OWNER ACTIVITY LEDGER"
        title="검증된 운영 원장 집계를 날짜별로 읽습니다"
        question="Owner Atlas의 운영 활동과 문서 생애주기를 분리해 보여준다."
        answer={`${rows.length}개 날짜에 기록된 생성·완료·안전 중지 집계다. 실시간 상태나 현재 작업으로 해석하지 않는다.`}
      />
      <div className="desktop-visual-surface temporal-surface">
        <section className="era-focus-panel" style={{ gridColumn: "1 / -1" }}>
          <span className="eyebrow" lang="en">Versioned owner evidence</span>
          <h2>운영 활동 원장</h2>
          <p className="era-thesis">문서 lifecycle과 분리된 Owner 전용 검증 집계입니다. 원문 운영 식별자는 포함하지 않습니다.</p>
          {rows.length ? activityRows("era-delta-ledger") : <p>날짜가 확인된 활동 집계가 없습니다.</p>}
        </section>
      </div>
      <div className="mobile-sibling mobile-time">
        <section className="mobile-selection"><span className="eyebrow">Owner activity</span><h2>운영 활동 원장</h2><p>실시간 작업 상태가 아닌 버전 스냅샷입니다.</p></section>
        {rows.length ? activityRows("mobile-ranked-list") : <p className="empty-state">날짜가 확인된 활동 집계가 없습니다.</p>}
      </div>
    </section>
  );
}

export function TimeView() {
  const { state, dispatch } = useAtlasState();
  const era = atlasData.temporal.eras.find((item) => item.id === state.eraId) ?? atlasData.temporal.eras[0];
  const activity = (atlasData as typeof atlasData & { activity?: AtlasActivityV1 }).activity;
  if (!era && activity) return <OwnerActivityTimeline activity={activity} />;
  if (!era) {
    return (
      <section className="workspace-view time-view" aria-labelledby="time-title">
        <WorkspaceHeader
          titleId="time-title"
          eyebrow="RECORDED CHRONOLOGY"
          title="공개할 수 있는 시간 증거가 아직 없습니다"
          question="공개판에서 날짜와 생애주기 증거가 확인된 사건만 시간 장면으로 보여준다."
          answer="현재 공개 프로필에는 검증된 chronology가 없다. 빈 상태는 변화 0이나 활동 부재를 뜻하지 않는다."
        />
        <div className="workspace-honest-empty time-honest-empty" role="note">
          <ShieldCheck size={24} aria-hidden="true" />
          <h2>검증된 공개 chronology가 없습니다.</h2>
          <p>날짜 근거가 없는 변화를 새로 생김·약화·소멸로 추정하지 않습니다. Owner Atlas의 내부 시간 증거도 공개판에 복제하지 않습니다.</p>
        </div>
      </section>
    );
  }
  const eraSummary = lifecycleEvidenceSummary(era, atlasEvidenceIds);
  const activeEraRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeEraRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [state.eraId]);
  const previous = atlasData.temporal.eras.find((item) => item.id === era.id - 1);
  const next = atlasData.temporal.eras.find((item) => item.id === era.id + 1);
  return (
    <section className="workspace-view time-view" aria-labelledby="time-title">
      <WorkspaceHeader
        titleId="time-title"
        eyebrow="시간 지식 지도"
        title="기록된 변천 장면은 Vault의 어떤 전환을 보여주는가"
        question="시대 장면(Era)은 동일 간격의 실제 시간축이 아니라 편집된 역사 장면이다. 근거 문서와 위치가 확인된 변화만 생애주기 상태로 보여주고, 근거가 없으면 미확정·미기록으로 남긴다."
        answer={`시대 장면 ${era.id}에는 기록이 확인된 변화 ${eraSummary.recordedDeltas.length}개와 미확정 항목 ${eraSummary.explicitUnknown.length}개${eraSummary.unrecordedDeltas.length ? `, 근거 미기록 변화 ${eraSummary.unrecordedDeltas.length}개` : ""}가 있다.`}
        keyItems={[
          ...plottedLifecycleStates.map((stateName) => ({ label: lifecycleStateLabel(stateName), className: `key-era-${stateName}` })),
          { label: lifecycleStateLabel("unknown"), className: "key-era-unknown" },
          { label: "층 = 기록 확인 상태 · 숫자 = 기록 수", className: "key-era-evidence" },
        ]}
      />
      <nav className="era-rail" aria-label="시대 장면 선택">
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
          <div className="panel-title-row"><div><span className="eyebrow">편집된 변천 장면 비교</span><h2>장면 1 → 11</h2></div><span className="panel-readout">균등 시간축 아님 · 근거가 확인된 변화만 집계</span></div>
          <EraPlot />
        </section>
        <section className="era-focus-panel">
          <div className="era-focus-index">시대 장면 {String(era.id).padStart(2, "0")}</div>
          <h2>{era.title}</h2>
          <p className="era-range">{formatEraRange(era.range, era.id)}</p>
          <p className="era-thesis">{era.thesis}</p>
          {era.id === 11 && (
            <aside className="agency-evolution-callout" aria-label="운영 모델 전문화 안내">
              <span className="eyebrow">AGENCY · OPERATING MODEL</span>
              <strong>단일 관리 세션 중심 → 역할별 세 지속 세션</strong>
              <p>문서 생애주기 수치와 섞지 않은 운영 구조 스냅샷입니다.</p>
              <button type="button" onClick={() => dispatch({ type: "journey", target: { workspace: "agency", sceneId: "evolution" } })}>
                Agency / Evolution 보기 <ArrowRight size="15" aria-hidden="true" />
              </button>
            </aside>
          )}
          <div className="era-delta-ledger">
            {eraSummary.recordedDeltas.map((delta) => (
              <div key={`${delta.state}:${delta.label}`} title={`${delta.evidenceRef}#${delta.evidenceAnchor}`}><i style={{ background: eraStateColors[delta.state] }} /><span><strong>{delta.label}</strong><small>{lifecycleStateLabel(delta.state)} · 기록 확인 · {evidenceLabel(delta.evidenceClass)}</small></span></div>
            ))}
            {eraSummary.unrecordedDeltas.length > 0 && (
              <div><i style={{ background: eraStateColors.unknown }} /><span><strong>근거 미기록 변화 {eraSummary.unrecordedDeltas.length}개</strong><small>근거 문서와 위치가 확인되지 않아 생애주기 판정에서 제외</small></span></div>
            )}
            {eraSummary.missingStates.map((stateName) => (
              <div key={`missing-${stateName}`}><i style={{ background: "transparent", border: `1px dashed ${eraStateColors[stateName]}` }} /><span><strong>{lifecycleStateLabel(stateName)} · 미기록</strong><small>변화가 0이라는 뜻이 아니라, 판정할 근거가 남아 있지 않음</small></span></div>
            ))}
            {eraSummary.explicitUnknown.map((label) => (
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
  const margin = { left: 112, right: 24, top: 24, bottom: 48 };
  const laneCount = Math.max(1, plottedLifecycleStates.length);
  const laneGap = (plotHeight - margin.top - margin.bottom) / (laneCount + 0.45);
  const xForEra = (eraId: number) => margin.left + ((plotWidth - margin.left - margin.right) * (eraId - 1)) / Math.max(1, atlasData.temporal.eras.length - 1);
  const strata = useMemo(() => plottedLifecycleStates.map((stateName, laneIndex) => {
    const center = margin.top + laneGap * (laneIndex + 0.65);
    const samples = atlasData.temporal.eras.map((era) => {
      const deltas = recordedLifecycleDeltas(era.deltas, atlasEvidenceIds).filter((delta) => delta.state === stateName);
      const amplitude = Math.min(laneGap * 0.18, 8);
      return { era, deltas, x: xForEra(era.id), center, amplitude };
    });
    const path = area<(typeof samples)[number]>()
      .defined((sample) => sample.deltas.length > 0)
      .x((sample) => sample.x)
      .y0((sample) => sample.center - sample.amplitude)
      .y1((sample) => sample.center + sample.amplitude)
      .curve(curveCatmullRom.alpha(0.55))(samples) ?? "";
    return { stateName, center, samples, path };
  }), [laneGap, plotWidth]);
  const unknownY = plotHeight - 24;
  const selectedEra = atlasData.temporal.eras.find((item) => item.id === state.eraId)!;
  const selectedSummary = lifecycleEvidenceSummary(selectedEra, atlasEvidenceIds);
  const plotStateDescription = plottedLifecycleStates.length
    ? plottedLifecycleStates.map(lifecycleStateLabel).join(", ")
    : "기록이 확인된 생애주기 상태 없음";
  return (
    <div className="era-plot-shell">
      <div className="era-plot era-strata" ref={containerRef} data-testid="era-small-multiples">
        <svg viewBox={`0 0 ${plotWidth} ${plotHeight}`} role="group" data-selected-era={state.eraId} aria-label={`편집된 변천 장면 1부터 11까지 ${plotStateDescription} 기록만 층으로 보여준다. 가로 간격은 실제 시간 간격을 뜻하지 않는다.`}>
          <defs>
            <filter id="era-strata-glow" x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation="4" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          </defs>
          <rect className="era-current-column" x={xForEra(state.eraId) - 22} y="8" width="44" height={plotHeight - 38} rx="10" />
          {strata.map((stratum) => (
            <g key={stratum.stateName} className={`era-stratum era-stratum-${stratum.stateName}`}>
              <line x1={margin.left} x2={plotWidth - margin.right} y1={stratum.center} y2={stratum.center} className="era-strata-baseline" />
              {stratum.path && <path d={stratum.path} fill={eraStateColors[stratum.stateName]} stroke={eraStateColors[stratum.stateName]} />}
              <text x="10" y={stratum.center + 4} className="era-strata-label">{lifecycleStateLabel(stratum.stateName)}</text>
              {stratum.samples.map((sample) => {
                const selected = sample.era.id === state.eraId;
                return sample.deltas.length ? (
                  <g key={sample.era.id} transform={`translate(${sample.x},${sample.center})`}>
                    <circle r={selected ? 10 : 7} className={selected ? "era-strata-mark is-selected" : "era-strata-mark"} fill={eraStateColors[stratum.stateName]} filter={selected ? "url(#era-strata-glow)" : undefined} />
                    <text y="3" textAnchor="middle" className="era-strata-count">{sample.deltas.length}</text>
                    <title>{`시대 장면 ${sample.era.id} · ${lifecycleStateLabel(stratum.stateName)} ${sample.deltas.length}개`}</title>
                  </g>
                ) : null;
              })}
            </g>
          ))}
          <g className="era-unknown-rail">
            <line x1={margin.left} x2={plotWidth - margin.right} y1={unknownY} y2={unknownY} />
            <text x="10" y={unknownY + 4} className="era-strata-label">{lifecycleStateLabel("unknown")}</text>
            {atlasData.temporal.eras.map((era) => {
              const summary = lifecycleEvidenceSummary(era, atlasEvidenceIds);
              const unknownCount = summary.explicitUnknown.length + summary.unrecordedDeltas.length;
              return unknownCount ? (
                <circle key={era.id} cx={xForEra(era.id)} cy={unknownY} r={Math.min(8, 3 + unknownCount)}>
                  <title>{`시대 장면 ${era.id} · 미확정·미기록 ${unknownCount}개`}</title>
                </circle>
              ) : null;
            })}
          </g>
          {atlasData.temporal.eras.map((era) => (
            <g key={era.id} className="era-axis-stop">
              <text x={xForEra(era.id)} y={plotHeight - 3} textAnchor="middle">장면 {era.id}</text>
              <rect x={xForEra(era.id) - 20} y="0" width="40" height={plotHeight} fill="transparent" role="button" tabIndex={0} aria-label={`시대 장면 ${era.id} ${era.title} 열기`} onClick={() => dispatch({ type: "era", eraId: era.id })} onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  dispatch({ type: "era", eraId: era.id });
                }
              }} />
            </g>
          ))}
        </svg>
      </div>
      <div className="era-unknown-boundary">편집된 역사 장면 · 가로 간격은 실제 시간 간격이 아님 · 층과 숫자는 근거가 확인된 상태만 표시 · 빈 위치는 근거 미기록(변화 0 아님) · 현재 장면 미확정·미기록 {selectedSummary.explicitUnknown.length + selectedSummary.unrecordedDeltas.length}개</div>
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
            <dd>{atlasData.publication.profile === "public" ? "공개 스냅샷 집계" : entity.ageDays == null ? "미제공" : `${entity.ageDays}일`}</dd>
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
  const eraSummary = lifecycleEvidenceSummary(era, atlasEvidenceIds);
  const activeEraRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeEraRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [state.eraId]);
  return (
    <div className="mobile-sibling mobile-time">
      <section className="mobile-selection">
        <span className="eyebrow">시대 장면 {String(era.id).padStart(2, "0")}</span>
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
      {era.id === 11 && (
        <aside className="agency-evolution-callout is-mobile" aria-label="운영 모델 전문화 안내">
          <span className="eyebrow">AGENCY · EVOLUTION</span>
          <strong>역할별 세 지속 세션으로 전문화</strong>
          <p>시간 변화 수치와 분리된 운영 구조 스냅샷입니다.</p>
          <button type="button" onClick={() => dispatch({ type: "journey", target: { workspace: "agency", sceneId: "evolution" } })}>
            구조 보기 <ArrowRight size="15" aria-hidden="true" />
          </button>
        </aside>
      )}
      <div className="mobile-era-scrubber" role="region" aria-label="시대 장면 선택, 가로로 스크롤 가능" tabIndex={0}>
        {atlasData.temporal.eras.map((item) => <button key={item.id} ref={item.id === state.eraId ? activeEraRef : undefined} type="button" aria-label={`시대 장면 ${item.id}: ${item.title}`} aria-pressed={item.id === state.eraId} className={item.id === state.eraId ? "is-active" : ""} onClick={() => dispatch({ type: "era", eraId: item.id })}>{item.id}</button>)}
      </div>
      <section className="mobile-ranked-list" role="region" aria-label="선택한 시대 장면의 변화 목록" tabIndex={0}>
        <h3>이 시대 장면의 변화</h3>
        {eraSummary.recordedDeltas.map((delta) => (
          <div className="mobile-era-row" key={`${delta.state}:${delta.label}`}><i style={{ background: eraStateColors[delta.state] }} /><span><strong>{delta.label}</strong><small>{lifecycleStateLabel(delta.state)} · 기록 확인</small></span><CheckCircle2 size={16} aria-hidden="true" /></div>
        ))}
        {eraSummary.unrecordedDeltas.length > 0 && (
          <div className="mobile-era-row"><i style={{ background: eraStateColors.unknown }} /><span><strong>근거 미기록 변화 {eraSummary.unrecordedDeltas.length}개</strong><small>생애주기 판정에서 제외</small></span><Clock3 size={16} /></div>
        )}
        {eraSummary.explicitUnknown.map((label) => (
          <div className="mobile-era-row" key={label}><i style={{ background: eraStateColors.unknown }} /><span><strong>{label}</strong><small>미확정 · 부재로 단정하지 않음</small></span><Clock3 size={16} /></div>
        ))}
      </section>
      <div className="mobile-time-proof"><GitBranch size={18} /><span>{evidenceLabel(era.evidenceClass)} · 근거가 없는 상태는 변화 0으로 세지 않는다.</span></div>
      <button className="mobile-theatre-action" type="button" onClick={() => dispatch({ type: "theatre", open: true })}>시간 기록 집중 보기</button>
    </div>
  );
}
