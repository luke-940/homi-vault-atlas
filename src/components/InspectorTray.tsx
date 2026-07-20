import {
  BookOpen,
  CheckCircle2,
  Clock3,
  Compass,
  GitBranch,
  Link2,
  Route as RouteIcon,
  Scale,
  ShieldCheck,
  X,
} from "lucide-react";
import { Fragment, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { atlasData, entityById, hierarchyById, structureNodeById } from "../data-runtime";
import { isStructuralHub, resolveStructureNodeContext } from "../structure-navigation";
import { useAtlasState, type InspectorTab } from "../state";
import type { AtlasStructureNodeV2, Entity, MatrixCell, Workspace } from "../types";
import { formatEraRange, lifecycleEvidenceSummary, lifecycleStateLabel } from "../views/time-model";
import { claimModalInert, releaseModalInert, trayDialogKeyIntent } from "./tray-accessibility";

const roleMeaning: Record<string, string> = {
  control: "현재 상태와 작업 경계를 조율하는 운영 표면",
  identity: "Homi의 전략·정체성과 읽는 방향을 설명하는 표면",
  source: "새로운 근거가 들어오는 출처와 Daily 표면",
  synthesis: "여러 신호를 한 주의 의미로 압축한 표면",
  knowledge: "반복 회수할 개념과 관계를 담는 중심 지식",
  paper: "원문 연구와 재사용 가능한 논거를 보존하는 표면",
  strategy: "판단 압력, 요청, 인사이트가 행동으로 연결되는 표면",
  signal: "아직 전략으로 굳지 않은 관측 신호",
  project: "별도 owner 경계가 있는 프로젝트 정본",
  retrieval: "검색과 문맥 회수를 돕는 표면",
  history: "현재를 바꾸지 않고 변화와 실패를 설명하는 기록",
  reference: "특정 질문에서 참고하는 durable 표면",
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

const evidenceClassLabels: Record<string, string> = {
  canonical_and_history: "현재 기준과 역사 기록을 함께 확인",
  curated_synthesis: "검증된 기록을 바탕으로 재구성",
  historical_evidence: "역사 기록을 바탕으로 재구성",
};

const atlasEvidenceIds = new Set(atlasData.entity.entities.map((entity) => entity.id));

function getFocusable(container: HTMLElement | null) {
  return [...(container?.querySelectorAll<HTMLElement>(
    "button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex='-1'])",
  ) ?? [])].filter((item) => item.offsetParent !== null);
}

function aggregateScopeLabelsFor(id: string) {
  const result: string[] = [];
  let current = hierarchyById.get(id);
  if (!current && entityById.has(id)) current = hierarchyById.get(id);
  while (current) {
    result.unshift(current.label);
    current = current.parentId ? hierarchyById.get(current.parentId) : undefined;
  }
  return result;
}

export function pairAggregateEvidenceRows(
  pair: MatrixCell | undefined,
  nodes: readonly AtlasStructureNodeV2[] = atlasData.structure.nodes,
) {
  if (!pair) return [];
  return [
    { label: pair.source, outgoing: pair.wikilinkForward, incoming: pair.wikilinkReverse },
    { label: pair.target, outgoing: pair.wikilinkReverse, incoming: pair.wikilinkForward },
  ].map((side) => {
    const district = nodes.find((node) => node.kind === "district" && node.label === side.label);
    return {
      id: district?.id ?? `district-missing:${side.label}`,
      label: side.label,
      meta: district
        ? `${district.documentCount.toLocaleString("ko-KR")}개 표현 기록 · 나감 ${side.outgoing.toLocaleString("ko-KR")}회 · 들어옴 ${side.incoming.toLocaleString("ko-KR")}회`
        : `구역 집계 누락 · 나감 ${side.outgoing.toLocaleString("ko-KR")}회 · 들어옴 ${side.incoming.toLocaleString("ko-KR")}회`,
    };
  });
}

export function InspectorTray() {
  const { state, dispatch } = useAtlasState();
  const trayRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const isMobile = state.mobileSibling;

  const close = () => dispatch({ type: "panel", panel: state.panel });

  useLayoutEffect(() => {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    return () => {
      const target = returnFocusRef.current;
      returnFocusRef.current = null;
      requestAnimationFrame(() => target?.focus());
    };
  }, []);

  useLayoutEffect(() => {
    if (!isMobile) return;
    const background = [
      document.querySelector<HTMLElement>(".command-bar"),
      document.querySelector<HTMLElement>(".workspace-main"),
      document.querySelector<HTMLElement>(".mobile-navigation"),
    ].filter(Boolean) as HTMLElement[];
    const previousOverflow = document.body.style.overflow;
    getFocusable(trayRef.current)[0]?.focus();
    background.forEach((node) => claimModalInert(node, "tray"));
    document.body.style.overflow = "hidden";
    return () => {
      background.forEach((node) => releaseModalInert(node, "tray"));
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobile]);

  const handleDialogKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const intent = trayDialogKeyIntent(event.key, isMobile, true);
    if (intent === "close") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (intent !== "trap-focus") return;
    const focusables = getFocusable(trayRef.current);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  if (state.panel === "data") {
    const snapshot = atlasData.bootstrap.snapshot;
    const isPublic = atlasData.publication.profile === "public";
    return (
      <Fragment>
        <div className="tray-backdrop inspector-backdrop" aria-hidden="true" onMouseDown={close} />
        <div
          ref={trayRef}
          id="atlas-inspector-tray"
          className="side-tray inspector-tray data-tray"
          lang="ko"
          role={isMobile ? "dialog" : "complementary"}
          aria-modal={isMobile ? "true" : undefined}
          aria-labelledby="data-tray-title"
          onKeyDown={handleDialogKey}
        >
        <div className="tray-heading">
          <span className="eyebrow">{isPublic ? "공개 데이터 범위" : "데이터 기준"}</span>
          <h2 id="data-tray-title">{isPublic ? "이 공개 지도가 보여주는 범위" : "이 지도가 믿는 범위"}</h2>
          <p>{isPublic ? "팀이 구조와 흐름을 읽을 수 있도록 정제한 공개 스냅샷이다." : "현재 구조를 사람이 읽도록 재구성한 사본이며, 정본을 대신하지 않는다."}</p>
          <button className="mobile-tray-close icon-button" type="button" onClick={close} aria-label="데이터 기준 닫기">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {isPublic ? (
          <dl className="evidence-ledger">
            <div><dt>반영 원문</dt><dd>{atlasData.publication.redactionCounts.aggregatedSourceDocuments ?? 0}</dd></div>
            <div><dt>공개 집계 객체</dt><dd>{snapshot.activeMarkdownCount}</dd></div>
            <div><dt>허용 표면</dt><dd>{atlasData.publication.allowedSurfaces.length}</dd></div>
            <div><dt>비공개 처리 문서</dt><dd>{atlasData.publication.redactionCounts.excludedEntities ?? 0}</dd></div>
            <div><dt>공개 스냅샷</dt><dd><code>{atlasData.publication.publicSnapshotDigest?.slice(0, 12)}</code></dd></div>
          </dl>
        ) : (
          <dl className="evidence-ledger">
            <div><dt>기준 버전</dt><dd>고정된 Owner 스냅샷</dd></div>
            <div><dt>현재 상태 스냅샷</dt><dd><code>{snapshot.stateSnapshot?.slice(0, 12) ?? "기록 없음"}</code></dd></div>
            <div><dt>검색 색인 계약</dt><dd>{snapshot.memoryEngineSchema}</dd></div>
            <div><dt>활성 문서</dt><dd>{snapshot.activeMarkdownCount}</dd></div>
            <div><dt>보관 문서</dt><dd>{snapshot.archiveMarkdownCount}</dd></div>
            <div><dt>원본 보기 설정</dt><dd>설정 해시만 사용</dd></div>
          </dl>
        )}
        <div className="boundary-note">
          <ShieldCheck size={18} aria-hidden="true" />
          <p>{isPublic ? "문서 본문, 로컬 경로, 원문, 소유권·검증 운영 표면은 공개 묶음에 포함되지 않는다." : "정본 근거는 원본 저장소의 상위 권위 문서와 독립 검증 기록에 있다."}</p>
        </div>
        {!isPublic && <div className="boundary-note is-warning">
          <Clock3 size={18} aria-hidden="true" />
          <p>{isPublic ? "외부 원본 앱의 화면 검증은 공개판 범위에 포함되지 않는다." : "외부 원본 앱은 이 버전의 시각 검증 범위에 포함되지 않았습니다."}</p>
        </div>}
        </div>
      </Fragment>
    );
  }

  const entity = entityById.get(state.focusId);
  const hierarchyNode = hierarchyById.get(state.focusId);
  const structureNode = structureNodeById.get(state.focusId);
  const pair = atlasData.relation.matrix.find((candidate) => candidate.id === state.relationPairId);
  const route = atlasData.flow.routes.find((candidate) => candidate.id === state.routeId);
  const era = atlasData.temporal.eras.find((candidate) => candidate.id === state.eraId);
  const activePair = state.workspace === "observe" ? pair : undefined;
  const activeRoute = state.workspace === "flow" ? route : undefined;
  const activeEra = state.workspace === "time" ? era : undefined;
  const isPublicProfile = atlasData.publication.profile === "public";
  const hasWorkspaceSelection = Boolean(activePair || activeRoute || activeEra);
  const selectionEntity = hasWorkspaceSelection ? undefined : entity;
  const selectionHierarchyNode = hasWorkspaceSelection ? undefined : hierarchyNode;
  const selectionStructureNode = hasWorkspaceSelection ? undefined : structureNode;
  const neighbors = selectionEntity ? atlasData.relation.neighborhoods[selectionEntity.id] ?? [] : [];
  const scopeLabels = hasWorkspaceSelection ? [] : aggregateScopeLabelsFor(state.focusId);
  const directionalPairTitle = pair && state.relationLayer === "typed" && state.relationDirection
    ? state.relationDirection === "forward"
      ? `${pair.source} → ${pair.target}`
      : `${pair.target} → ${pair.source}`
    : pair
      ? `${pair.source} ↔ ${pair.target}`
      : "";

  const title =
    state.workspace === "observe" && pair
      ? directionalPairTitle
      : state.workspace === "flow"
        ? route?.label ?? "작업 흐름"
        : state.workspace === "time"
          ? `시대 장면 ${era?.id}`
          : entity?.title ?? hierarchyNode?.label ?? structureNode?.label ?? "Homi Vault";
  const subtitle =
    state.workspace === "observe" && pair
      ? "선택한 구역 간 관계"
      : state.workspace === "flow"
        ? route?.question ?? ""
        : state.workspace === "time"
          ? era?.title ?? ""
          : entity
            ? roleMeaning[entity.surfaceRole] ?? "Vault 안의 현재 선택"
            : structureNode
              ? `${structureNode.documentCount}개 기록 · 고유 inbound ${structureNode.uniqueInboundDocuments} · 링크 출현 ${structureNode.inboundLinkOccurrences}`
              : `${hierarchyNode?.documentCount ?? 0}개 문서를 품은 가지`;

  const tabs: Array<{ id: InspectorTab; label: string; icon: typeof Compass }> = [
    { id: "summary", label: "요약", icon: Compass },
    { id: "relations", label: "관계", icon: Link2 },
    { id: "proof", label: "근거", icon: ShieldCheck },
    { id: "history", label: "시간", icon: Clock3 },
  ];

  const handleInspectorTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = tabs.length - 1;
    let nextIndex = index;
    if (event.key === "ArrowRight") nextIndex = index === last ? 0 : index + 1;
    else if (event.key === "ArrowLeft") nextIndex = index === 0 ? last : index - 1;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = last;
    else return;
    event.preventDefault();
    const next = tabs[nextIndex];
    dispatch({ type: "inspectorTab", inspectorTab: next.id });
    requestAnimationFrame(() => document.getElementById(`inspector-tab-${next.id}`)?.focus());
  };

  return (
    <Fragment>
      <div className="tray-backdrop inspector-backdrop" aria-hidden="true" onMouseDown={close} />
      <div
        ref={trayRef}
        id="atlas-inspector-tray"
        className="side-tray inspector-tray"
        lang="ko"
        role={isMobile ? "dialog" : "complementary"}
        aria-modal={isMobile ? "true" : undefined}
        aria-labelledby="inspector-selection-title"
        onKeyDown={handleDialogKey}
      >
      <div className="selection-hero">
        <span className="eyebrow">현재 선택</span>
        <h2 id="inspector-selection-title">{title}</h2>
        <p>{subtitle}</p>
        {selectionEntity && !isPublicProfile && <code className="selection-path">{selectionEntity.path}</code>}
        <button className="mobile-tray-close icon-button" type="button" onClick={close} aria-label="현재 선택 해석 닫기">
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      {(selectionEntity || selectionHierarchyNode || selectionStructureNode) && (
        <div className="inspector-actions">
          <button
            type="button"
            disabled={!selectionEntity}
            title={selectionEntity ? "비교에 추가" : "비교는 공개 지식 엔터티에만 제공됩니다."}
            aria-pressed={state.compareIds.includes(state.focusId)}
            onClick={() => dispatch({ type: "compare", focusId: state.focusId })}
          >
            <Scale size={16} /> {selectionEntity ? (state.compareIds.includes(state.focusId) ? "비교에서 빼기" : "비교에 추가") : "엔터티 비교 전용"}
          </button>
          {selectionEntity && (() => {
            const districtNode = atlasData.structure.nodes.find((node) =>
              node.kind === "district" && node.label === selectionEntity.district);
            const strongestPair = [...atlasData.relation.matrix]
              .filter((pair) => pair.source === selectionEntity.district || pair.target === selectionEntity.district)
              .sort((left, right) => right.total - left.total || left.id.localeCompare(right.id))[0];
            return (
            <button type="button" onClick={() => dispatch({
              type: "journey",
              target: state.workspace === "observe"
                ? { workspace: "explore", sceneId: "hubs", focusId: districtNode?.id ?? state.focusId, lens: "city" }
                : { workspace: "observe", sceneId: "global-relations", relationPairId: strongestPair?.id ?? null, focusId: selectionEntity.id },
            })}>
              {state.workspace === "observe" ? <Compass size={16} /> : <Link2 size={16} />} {state.workspace === "observe" ? "도시에서 보기" : "관계에서 보기"}
            </button>
            );
          })()}
          {selectionStructureNode && selectionStructureNode.kind !== "district" && (() => {
            const context = resolveStructureNodeContext(atlasData.structure.nodes, selectionStructureNode.id);
            const hubId = context.hubId;
            return hubId && isStructuralHub(structureNodeById.get(hubId)) ? (
            <button type="button" onClick={() => dispatch({ type: "journey", target: { workspace: "observe", sceneId: "hub-relations", focusId: hubId } })}>
              <Link2 size={16} /> 허브 관계 보기
            </button>
            ) : null;
          })()}
        </div>
      )}

      {state.compareIds.length > 0 && <ComparisonLedger />}

      <div className="inspector-tabs" role="tablist" aria-label="선택 상세">
        {tabs.map((tab, index) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              id={`inspector-tab-${tab.id}`}
              role="tab"
              type="button"
              aria-selected={state.inspectorTab === tab.id}
              aria-controls={`inspector-panel-${tab.id}`}
              tabIndex={state.inspectorTab === tab.id ? 0 : -1}
              className={state.inspectorTab === tab.id ? "is-active" : ""}
              onClick={() => dispatch({ type: "inspectorTab", inspectorTab: tab.id })}
              onKeyDown={(event) => handleInspectorTabKey(event, index)}
            >
              <Icon size={15} aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div
        className="inspector-content"
        id={`inspector-panel-${state.inspectorTab}`}
        role="tabpanel"
        aria-labelledby={`inspector-tab-${state.inspectorTab}`}
        tabIndex={0}
      >
        {state.inspectorTab === "summary" && (
          <SummaryContent entity={selectionEntity} structureNode={selectionStructureNode} pair={activePair} route={activeRoute} era={activeEra} scopeLabels={scopeLabels} />
        )}
        {state.inspectorTab === "relations" && (
          <RelationsContent workspace={state.workspace} entity={selectionEntity} pair={activePair} route={activeRoute} era={activeEra} neighbors={neighbors} />
        )}
        {state.inspectorTab === "proof" && (
          <ProofContent workspace={state.workspace} entity={selectionEntity} pair={activePair} route={activeRoute} era={activeEra} />
        )}
        {state.inspectorTab === "history" && (
          <HistoryContent entity={selectionEntity} pair={activePair} route={activeRoute} era={activeEra} />
        )}
      </div>
      {tabs
        .filter((tab) => tab.id !== state.inspectorTab)
        .map((tab) => (
          <div
            key={tab.id}
            id={`inspector-panel-${tab.id}`}
            role="tabpanel"
            aria-labelledby={`inspector-tab-${tab.id}`}
            hidden
          />
        ))}

      </div>
    </Fragment>
  );
}

function ComparisonLedger() {
  const { state, dispatch } = useAtlasState();
  const isPublicProfile = atlasData.publication.profile === "public";
  const pulseTargets = new Set(
    atlasData.flow.pulse.chains.flatMap((chain) => {
      const stages = chain.stages as Array<{ entityId?: string | null }> | undefined;
      return stages?.map((stage) => stage.entityId).filter(Boolean) as string[] ?? [];
    }),
  );
  const items = state.compareIds.map((id) => {
    const entity = entityById.get(id);
    const node = hierarchyById.get(id);
    return {
      id,
      label: entity?.displayLabel ?? node?.label ?? id,
      authority: entity?.authority ?? `${node?.authorityL1L2 ?? 0}개 L1/L2`,
      freshness: entity ? (currentnessLabels[entity.currentness] ?? entity.currentness) : "폴더 집계",
      connections: entity ? (atlasData.relation.neighborhoods[entity.id]?.length ?? 0) : node?.childrenCount ?? 0,
      size: entity
        ? comparisonEntitySize(entity, isPublicProfile)
        : `${node?.documentCount ?? 0}문서`,
      pulse: pulseTargets.has(id) ? "도달" : "미확인",
    };
  });
  return (
    <section className="compare-ledger" aria-label="선택 객체 비교">
      <header><span>비교 {items.length}/2</span><button type="button" onClick={() => dispatch({ type: "clearCompare" })}>비우기</button></header>
      <div>
        {items.map((item) => (
          <article key={item.id}>
            <strong>{item.label}</strong>
            <dl>
              <div><dt>크기</dt><dd>{item.size}</dd></div>
              <div><dt>권위</dt><dd>{item.authority}</dd></div>
              <div><dt>현재성</dt><dd>{item.freshness}</dd></div>
              <div><dt>연결</dt><dd>{item.connections}</dd></div>
              <div><dt>Pulse</dt><dd>{item.pulse}</dd></div>
            </dl>
          </article>
        ))}
        {items.length === 1 && <p>지도에서 하나를 더 선택해 비교에 추가하세요.</p>}
      </div>
    </section>
  );
}

export function comparisonEntitySize(
  entity: Pick<Entity, "documentCount" | "wordCount">,
  isPublicProfile: boolean,
) {
  return isPublicProfile
    ? `${(entity.documentCount ?? 0).toLocaleString()}개 문서`
    : `${entity.wordCount.toLocaleString()}단어`;
}

function SummaryContent({
  entity,
  structureNode,
  pair,
  route,
  era,
  scopeLabels,
}: {
  entity?: Entity;
  structureNode?: AtlasStructureNodeV2;
  pair?: MatrixCell;
  route?: (typeof atlasData.flow.routes)[number];
  era?: (typeof atlasData.temporal.eras)[number];
  scopeLabels: ReturnType<typeof aggregateScopeLabelsFor>;
}) {
  const isPublicProfile = atlasData.publication.profile === "public";
  if (pair) {
    return (
      <>
        <section className="inspector-section">
          <h3>왜 중요한가</h3>
          <p>같은 두 구역이 해결된 링크 출현, 명시 관계, 선별 작업 경로 중 어떤 방식으로 이어지는지 비교한다.</p>
        </section>
        <dl className="metric-ledger">
          <div><dt>링크 출현</dt><dd>{pair.wikilink}</dd></div>
          <div><dt>명시 관계</dt><dd>{pair.typed}</dd></div>
          <div><dt>작업 흐름</dt><dd>{pair.route}</dd></div>
        </dl>
      </>
    );
  }
  if (route) {
    return (
      <>
        <section className="inspector-section"><h3>읽는 질문</h3><p>{route.question}</p></section>
        <dl className="metric-ledger">
          <div><dt>경유점</dt><dd>{route.stations.length}</dd></div>
          <div><dt>연결 문서</dt><dd>{route.members.length}</dd></div>
        </dl>
      </>
    );
  }
  if (era) {
    const lifecycle = lifecycleEvidenceSummary(era, atlasEvidenceIds);
    return (
      <>
        <section className="inspector-section"><h3>{formatEraRange(era.range, era.id)}</h3><p>{era.thesis}</p></section>
        <dl className="metric-ledger">
          <div><dt>시대 장면</dt><dd>{era.id}/11</dd></div>
          <div><dt>기록 확인 변화</dt><dd>{lifecycle.recordedDeltas.length}</dd></div>
          <div><dt>미확정·미기록</dt><dd>{lifecycle.explicitUnknown.length + lifecycle.unrecordedDeltas.length}</dd></div>
        </dl>
      </>
    );
  }
  if (structureNode) {
    return (
      <>
        <section className="inspector-section"><h3>구조에서의 역할</h3><p>이 선택은 v7.4 구조 투영의 {structureNode.kind} 객체다. 문서 엔터티와 관계 수치에 중복 합산하지 않는다.</p></section>
        <dl className="metric-ledger">
          <div><dt>포함 기록</dt><dd>{structureNode.documentCount}</dd></div>
          <div><dt>고유 inbound 문서</dt><dd>{structureNode.uniqueInboundDocuments}</dd></div>
          <div><dt>링크 출현</dt><dd>{structureNode.inboundLinkOccurrences}</dd></div>
          <div><dt>표현 방식</dt><dd>{structureNode.nameMode === "public_alias" ? "공개 안전 별칭" : structureNode.nameMode === "aggregate" ? "집계" : "승인 이름"}</dd></div>
        </dl>
      </>
    );
  }
  if (!entity) {
    return (
      <section className="inspector-section">
        <h3>가지 범위</h3>
        <p>{scopeLabels.join(" / ")}</p>
      </section>
    );
  }
  return (
    <>
      <section className="inspector-section">
        <h3>왜 중요한가</h3>
        <p>{roleMeaning[entity.surfaceRole] ?? "Vault 안에서 현재 선택의 역할과 위치를 설명하는 문서"}</p>
      </section>
      <dl className="metric-ledger">
        <div><dt>권위</dt><dd>{entity.authority}</dd></div>
        <div><dt>현재성</dt><dd>{currentnessLabels[entity.currentness] ?? entity.currentness}</dd></div>
        <div><dt>{atlasData.publication.profile === "public" ? "반영 원문" : "문서량"}</dt><dd>{atlasData.publication.profile === "public" ? (entity.documentCount ?? 0).toLocaleString() : entity.wordCount.toLocaleString()}{atlasData.publication.profile === "public" ? "개 문서" : "단어"}</dd></div>
      </dl>
      <section className="inspector-section">
        <h3>{isPublicProfile ? "집계 구역" : "선택 경로"}</h3>
        <p>{isPublicProfile
          ? `${entity.district} · ${roleMeaning[entity.surfaceRole] ?? "공개 지식 집계"}`
          : scopeLabels.join(" / ")}</p>
      </section>
    </>
  );
}

function RelationsContent({
  workspace,
  entity,
  pair,
  route,
  era,
  neighbors,
}: {
  workspace: Workspace;
  entity?: Entity;
  pair?: MatrixCell;
  route?: (typeof atlasData.flow.routes)[number];
  era?: (typeof atlasData.temporal.eras)[number];
  neighbors: any[];
}) {
  const isPublicProfile = atlasData.publication.profile === "public";
  if (workspace === "flow" && route) {
    return (
      <section className="inspector-section">
        <h3>경로 경유점</h3>
        <div className="ledger-list">
          {route.stations.map((station) => (
            <div key={station.id}>
              <RouteIcon size={14} />
              <span><strong>{station.label}</strong><small>{station.entityId ? entityById.get(station.entityId)?.displayLabel ?? "Vault 표면" : "외부 읽기면"}</small></span>
            </div>
          ))}
        </div>
      </section>
    );
  }
  if (workspace === "time" && era) {
    return (
      <section className="inspector-section">
        <h3>시대 장면 근거 표면</h3>
        <div className="ledger-list">
          {era.evidenceRefs.map((id) => (
            <div key={id}>
              <BookOpen size={14} />
              <span><strong>{entityById.get(id)?.title ?? "공개 집계 근거"}</strong><small>{isPublicProfile
                ? `${entityById.get(id)?.district ?? "지식 구역"} · 공개 집계 근거`
                : entityById.get(id)?.path ?? "역사 근거"}</small></span>
            </div>
          ))}
        </div>
      </section>
    );
  }
  const rows = pair
    ? pairAggregateEvidenceRows(pair)
    : neighbors.slice(0, 10).map((neighbor) => ({
        id: neighbor.id,
        label: entityById.get(neighbor.id)?.title ?? neighbor.id,
        meta: `${neighbor.direction === "incoming" ? "들어옴" : "나감"} · ${neighbor.relation}`,
      }));
  return (
    <section className="inspector-section">
      <h3>{pair ? "구역 집계 근거" : (isPublicProfile ? "가까운 지식" : "가까운 문서")}</h3>
      <div className="ledger-list">
        {rows.map((row) => (
          <div key={row.id}><Link2 size={14} /><span><strong>{row.label}</strong><small>{row.meta}</small></span></div>
        ))}
        {!rows.length && <p className="empty-state">문서 원문을 추정하지 않는 집계 범위에서 표시할 관계가 없습니다.</p>}
      </div>
    </section>
  );
}

function ProofContent({
  workspace,
  entity,
  pair,
  route,
  era,
}: {
  workspace: Workspace;
  entity?: Entity;
  pair?: MatrixCell;
  route?: (typeof atlasData.flow.routes)[number];
  era?: (typeof atlasData.temporal.eras)[number];
}) {
  const { state } = useAtlasState();
  const layerCoverage = atlasData.relation.coverage.layers[state.relationLayer];
  const selectionProof = workspace === "time" && era
    ? `${evidenceClassLabels[era.evidenceClass] ?? "기록 근거를 바탕으로 재구성"}. 근거 문서와 위치가 확인된 변화만 생애주기 상태로 센다.`
    : workspace === "flow" && route
      ? `${route.stations.length}개 경유점은 작업 절차를 읽기 위한 안내 경로다. 실제 문서 연결 횟수를 뜻하지 않는다.`
      : pair
        ? `이 화면은 구역 간 ${layerCoverage.displayed.toLocaleString()}건만 비교한다. 같은 구역 안의 ${layerCoverage.intraDistrict.toLocaleString()}건은 합계에는 포함하지만 지도에서는 생략했다. 주소 미확인 ${atlasData.relation.coverage.unresolvedLinkTotal}건과 여러 후보가 있는 ${atlasData.relation.coverage.ambiguousLinks}건도 제외했다.`
        : entity
          ? `${entity.authority} 권위 · ${currentnessLabels[entity.currentness] ?? entity.currentness} · ${roleMeaning[entity.surfaceRole] ?? "Vault 문서"}`
          : "Vault의 폴더 계층에서 계산했다.";
  return (
    <>
      <section className="inspector-section">
        <h3>검증 범위</h3>
        <div className="proof-row"><CheckCircle2 size={16} /><span>현재 데이터 스냅샷과 같은 기준 시각 사용</span></div>
        <div className="proof-row"><CheckCircle2 size={16} /><span>명시된 연결 대상이 모두 확인됨</span></div>
        <div className="proof-row"><CheckCircle2 size={16} /><span>원본 보기 설정은 연결 데이터로 사용하지 않음</span></div>
      </section>
      <section className="inspector-section">
        <h3>이 선택의 근거</h3>
        <p>{selectionProof}</p>
      </section>
    </>
  );
}

function HistoryContent({
  entity,
  pair,
  route,
  era,
}: {
  entity?: Entity;
  pair?: MatrixCell;
  route?: (typeof atlasData.flow.routes)[number];
  era?: (typeof atlasData.temporal.eras)[number];
}) {
  const lifecycle = era ? lifecycleEvidenceSummary(era, atlasEvidenceIds) : null;
  return (
    <section className="inspector-section">
      <h3>{era ? "시대 장면 근거" : pair ? "관계 범위" : route ? "경로 근거" : "현재 문서 시간"}</h3>
      {era && lifecycle ? (
        <>
          <p>{evidenceClassLabels[era.evidenceClass] ?? "기록 근거를 바탕으로 재구성"}</p>
          <div className="ledger-list">
            {lifecycle.recordedDeltas.map((delta) => <div key={`${delta.state}:${delta.label}`}><GitBranch size={14} /><span><strong>{delta.label}</strong><small>{lifecycleStateLabel(delta.state)} · 기록 확인</small></span></div>)}
            {lifecycle.unrecordedDeltas.length > 0 && <div><Clock3 size={14} /><span><strong>근거 미기록 변화 {lifecycle.unrecordedDeltas.length}개</strong><small>생애주기 판정에서 제외</small></span></div>}
          </div>
        </>
      ) : pair ? (
        <dl className="evidence-ledger">
          <div><dt>확인된 연결쌍</dt><dd>{pair.source} / {pair.target}</dd></div>
          <div><dt>제외 범위</dt><dd>주소 미확인 연결</dd></div>
        </dl>
      ) : route ? (
        <>
          <p>{route.classifier}</p>
          <div className="ledger-list">
            {route.sourceRefs.map((id) => (
              <div key={id}><RouteIcon size={14} /><span><strong>{entityById.get(id)?.title ?? id}</strong><small>렌즈 근거 표면</small></span></div>
            ))}
          </div>
        </>
      ) : entity ? (
        atlasData.publication.profile === "public" ? (
          <dl className="evidence-ledger">
            <div><dt>시간 기준</dt><dd>공개 스냅샷 집계</dd></div>
            <div><dt>원문 시각</dt><dd>공개판에서 비공개</dd></div>
          </dl>
        ) : (
          <dl className="evidence-ledger">
            <div><dt>마지막 변경 거리</dt><dd>{entity.ageDays == null ? "공개 집계" : `${entity.ageDays}일`}</dd></div>
            <div><dt>문서 메타데이터 시대(Era)</dt><dd>{String(entity.frontmatter.era ?? "미지정")}</dd></div>
          </dl>
        )
      ) : null}
    </section>
  );
}
