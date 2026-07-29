import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Copy,
  Network,
  RotateCcw,
} from "lucide-react";
import { useEffect, useId, useMemo, type ReactNode } from "react";
import type {
  DossierTab,
  EvidenceBoundClaim,
  KnowledgeDossier,
  KnowledgeEvidence,
  RelationExplanation,
} from "../app/contracts";
import { useAtlas } from "../app/state";
import { useKnowledge } from "./KnowledgeProvider";

const tabLabels: Record<DossierTab, string> = {
  overview: "Overview",
  relations: "Relations",
  evidence: "Evidence",
};

export function DossierDock({
  nodeId,
  compact = false,
  surface = "home",
}: {
  nodeId?: string | null;
  compact?: boolean;
  surface?: "home" | "explore" | "observe";
}) {
  const atlas = useAtlas();
  const knowledge = useKnowledge();
  const committedId = nodeId ?? atlas.route.focusId;
  const node = atlas.runtime.graph.nodeById.get(committedId ?? "") ?? null;
  const entry = knowledge.entry(committedId);
  const shard = knowledge.shard(committedId);
  const status = knowledge.shardState(committedId);
  const error = knowledge.shardError(committedId);
  const tabsetId = useId();

  useEffect(() => {
    if (committedId && entry && status === "idle") {
      knowledge.loadDossier(committedId).catch(() => undefined);
    }
  }, [committedId, entry, knowledge, status]);

  if (!node) {
    return (
      <section className={`dossier-dock dossier-dock--empty dossier-dock--${surface}`}>
        <span>KNOWLEDGE DOSSIER</span>
        <p>노드를 선택하면 Atlas Builder가 원문과 실제 관계를 대조한 해설을 읽을 수 있습니다.</p>
      </section>
    );
  }

  if (!entry) {
    return (
      <section className={`dossier-dock dossier-dock--pending dossier-dock--${surface}`}>
        <header className="dossier-dock__header">
          <div>
            <span>{node.domain} · {node.kind.replaceAll("_", " ")}</span>
            <h2>{node.label}</h2>
          </div>
          <ClearSelectionButton />
        </header>
        <div className="knowledge-status knowledge-status--pending">검수 대기</div>
        <p>
          이 노드는 Atlas Builder 전수 정독 범위에 아직 포함되지 않았습니다.
          dossier와 안전 원문이 완성되기 전에는 production 공개 후보가 될 수 없습니다.
        </p>
        <small>releaseEligible = false</small>
      </section>
    );
  }

  return (
    <section className={`dossier-dock dossier-dock--${surface}${compact ? " dossier-dock--compact" : ""}`}>
      <header className="dossier-dock__header">
        <div>
          <span>{entry.domain} · {entry.kind.replaceAll("_", " ")}</span>
          <h2>{entry.title}</h2>
        </div>
        <ClearSelectionButton />
      </header>
      {!knowledge.index.releaseEligible ? (
        <small className="knowledge-status knowledge-status--pending">
          Local review candidate · releaseEligible=false
        </small>
      ) : null}
      <dl className="relation-metrics" aria-label="Actual directed relation counts">
        <div data-direction="incoming">
          <dt><ArrowDownLeft size={12} aria-hidden="true" /> Incoming</dt>
          <dd>{node.incoming.length}</dd>
        </div>
        <div data-direction="outgoing">
          <dt><ArrowUpRight size={12} aria-hidden="true" /> Outgoing</dt>
          <dd>{node.outgoing.length}</dd>
        </div>
      </dl>
      {status === "loading" ? (
        <div className="dossier-loading" role="status">
          <strong>검수된 지식 해설을 여는 중</strong>
          <p>{entry.readerSummary}</p>
        </div>
      ) : status === "error" ? (
        <div className="dossier-error" role="alert">
          <strong>지식 shard 무결성을 확인하지 못했습니다.</strong>
          <p>{error}</p>
          <button type="button" onClick={() => knowledge.loadDossier(entry.nodeId).catch(() => undefined)}>
            다시 확인
          </button>
        </div>
      ) : shard ? (
        <>
          <DossierTabs tabsetId={tabsetId} />
          <div className="dossier-dock__body">
            {atlas.route.dossierTab === "overview"
              ? <DossierOverview dossier={shard.dossier} tabsetId={tabsetId} />
              : null}
            {atlas.route.dossierTab === "relations"
              ? <DossierRelations dossier={shard.dossier} tabsetId={tabsetId} />
              : null}
            {atlas.route.dossierTab === "evidence"
              ? <DossierEvidence dossier={shard.dossier} tabsetId={tabsetId} />
              : null}
          </div>
          <footer className="dossier-actions">
            <button type="button" onClick={() => atlas.openObserveNode(entry.nodeId)}>
              <Network size={14} aria-hidden="true" /> Observe에서 분석
            </button>
            <button
              type="button"
              onClick={() => atlas.openReader(entry.nodeId, shard.dossier.sourceReader.publishedSectionIds[0] ?? null)}
            >
              <BookOpen size={14} aria-hidden="true" /> 안전 원문 읽기
            </button>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(window.location.href).catch(() => undefined)}
            >
              <Copy size={14} aria-hidden="true" /> 링크 복사
            </button>
          </footer>
        </>
      ) : null}
    </section>
  );
}

function ClearSelectionButton() {
  const atlas = useAtlas();
  return (
    <button
      type="button"
      className="dossier-inline-action knowledge-status knowledge-status--pending"
      onClick={() => atlas.commitFocus(null)}
      aria-label="선택 해제"
      title="선택 해제 (Esc)"
    >
      <RotateCcw size={14} aria-hidden="true" /> 선택 해제
    </button>
  );
}

function DossierTabs({ tabsetId }: { tabsetId: string }) {
  const atlas = useAtlas();
  const tabs = Object.keys(tabLabels) as DossierTab[];
  return (
    <div className="dossier-tabs" role="tablist" aria-label="Dossier sections">
      {tabs.map((tab) => (
        <button
          type="button"
          role="tab"
          id={`${tabsetId}-tab-${tab}`}
          aria-selected={atlas.route.dossierTab === tab}
          aria-controls={`${tabsetId}-panel-${tab}`}
          key={tab}
          onClick={() => atlas.setDossierTab(tab)}
        >
          {tabLabels[tab]}
        </button>
      ))}
    </div>
  );
}

function DossierOverview({
  dossier,
  tabsetId,
}: {
  dossier: KnowledgeDossier;
  tabsetId: string;
}) {
  return (
    <div
      className="dossier-panel"
      role="tabpanel"
      id={`${tabsetId}-panel-overview`}
      aria-labelledby={`${tabsetId}-tab-overview`}
    >
      <ClaimBlock label="한눈에 읽기" claim={dossier.readerSummary} />
      <ClaimBlock label="Homi와 팀에 중요한 이유" claim={dossier.whyItMatters} />
      {dossier.keyInsights.length ? (
        <DossierList label="핵심 인사이트">
          {dossier.keyInsights.map((claim) => <ClaimItem key={claim.id} claim={claim} />)}
        </DossierList>
      ) : null}
      {dossier.caveats.length ? (
        <DossierList label="Caveat">
          {dossier.caveats.map((claim) => <ClaimItem key={claim.id} claim={claim} />)}
        </DossierList>
      ) : null}
      {dossier.openQuestions.length ? (
        <DossierList label="Open questions">
          {dossier.openQuestions.map((claim) => <ClaimItem key={claim.id} claim={claim} />)}
        </DossierList>
      ) : null}
    </div>
  );
}

export function DossierRelations({
  dossier,
  tabsetId = "observe-dossier",
}: {
  dossier: KnowledgeDossier;
  tabsetId?: string;
}) {
  const atlas = useAtlas();
  const incoming = dossier.relationExplanations.filter((relation) => relation.targetNodeId === dossier.nodeId);
  const outgoing = dossier.relationExplanations.filter((relation) => relation.sourceNodeId === dossier.nodeId);
  return (
    <div
      className="dossier-panel"
      role="tabpanel"
      id={`${tabsetId}-panel-relations`}
      aria-labelledby={`${tabsetId}-tab-relations`}
    >
      <RelationGroup
        label="들어오는 관계"
        icon={<ArrowDownLeft size={14} aria-hidden="true" />}
        relations={incoming}
        focalId={dossier.nodeId}
      />
      <RelationGroup
        label="나가는 관계"
        icon={<ArrowUpRight size={14} aria-hidden="true" />}
        relations={outgoing}
        focalId={dossier.nodeId}
      />
      {!incoming.length && !outgoing.length ? (
        <p className="evidence-gap">공개 가능한 관계 설명 문맥이 아직 없습니다. 가짜 설명은 생성하지 않습니다.</p>
      ) : null}
      <button type="button" className="dossier-inline-action" onClick={() => atlas.setExploreMode("graph")}>
        관계 그래프에서 보기 <ArrowRight size={13} aria-hidden="true" />
      </button>
    </div>
  );
}

function RelationGroup({
  label,
  icon,
  relations,
  focalId,
}: {
  label: string;
  icon: ReactNode;
  relations: RelationExplanation[];
  focalId: string;
}) {
  const atlas = useAtlas();
  if (!relations.length) return null;
  return (
    <section className="relation-group knowledge-stack">
      <h3>{icon}{label}</h3>
      {relations.map((relation) => {
        const relatedId = relation.sourceNodeId === focalId ? relation.targetNodeId : relation.sourceNodeId;
        const related = atlas.runtime.graph.nodeById.get(relatedId);
        return (
          <button
            type="button"
            key={relation.id}
            className="relation-explanation knowledge-entry"
            onPointerEnter={() => atlas.setPreview(relatedId)}
            onPointerLeave={() => atlas.setPreview(null)}
            onFocus={() => atlas.setPreview(relatedId)}
            onBlur={() => atlas.setPreview(null)}
            onClick={() => atlas.openObserveRelation(relation.sourceNodeId, relation.targetNodeId)}
          >
            <strong>{related?.label ?? "공개 관계 node"}</strong>
            <span>{relation.explanation}</span>
            <small>
              {relation.kind === "direct_context"
                ? `원문 직접 문맥 · ${relation.occurrences} occurrence`
                : relation.kind === "bounded_synthesis"
                  ? "Builder 제한적 종합"
                  : "설명 가능한 공개 문맥 없음"}
            </small>
          </button>
        );
      })}
    </section>
  );
}

export function DossierEvidence({
  dossier,
  tabsetId = "observe-dossier",
}: {
  dossier: KnowledgeDossier;
  tabsetId?: string;
}) {
  const atlas = useAtlas();
  return (
    <div
      className="dossier-panel"
      role="tabpanel"
      id={`${tabsetId}-panel-evidence`}
      aria-labelledby={`${tabsetId}-tab-evidence`}
    >
      {dossier.evidence.map((evidence) => (
        <EvidenceCard
          key={evidence.id}
          evidence={evidence}
          onOpen={() => atlas.openReader(evidence.nodeId, evidence.sectionId)}
        />
      ))}
      {!dossier.evidence.length ? (
        <p className="evidence-gap">공개 가능한 evidence excerpt가 없습니다.</p>
      ) : null}
    </div>
  );
}

export function EvidenceCard({
  evidence,
  onOpen,
}: {
  evidence: KnowledgeEvidence;
  onOpen(): void;
}) {
  return (
    <blockquote className="evidence-card">
      <p>{evidence.excerpt}</p>
      <footer>
        <span>{evidence.sourceTitle ?? "Safe Source"}</span>
        <button type="button" onClick={onOpen}>해당 section 읽기</button>
      </footer>
    </blockquote>
  );
}

function ClaimBlock({ label, claim }: { label: string; claim: EvidenceBoundClaim }) {
  return (
    <section className="claim-block">
      <h3>{label}</h3>
      <p>{claim.text}</p>
      <small>
        {claim.interpretation === "source_explicit" ? "원문 명시" : "Atlas Builder 제한적 해석"}
        {" · "}evidence {claim.evidenceIds.length}
      </small>
    </section>
  );
}

function DossierList({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="dossier-list">
      <h3>{label}</h3>
      <ul>{children}</ul>
    </section>
  );
}

function ClaimItem({ claim }: { claim: EvidenceBoundClaim }) {
  return (
    <li>
      <span>{claim.text}</span>
      <small>{claim.interpretation === "source_explicit" ? "원문" : "Builder 해석"}</small>
    </li>
  );
}
