import { BookOpenText, CheckCircle2 } from "lucide-react";
import { useEffect } from "react";
import { EvidenceCard } from "../../knowledge/DossierDock";
import { useKnowledge } from "../../knowledge/KnowledgeProvider";
import type { AtlasKnowledgeShardV1, GraphNode } from "../contracts";
import { useAtlas } from "../state";
import { claimsForDossier, reviewedNodes, type ObserveClaim } from "./observe-model";

export function EvidenceWorkbench() {
  const atlas = useAtlas();
  const knowledge = useKnowledge();
  const nodes = reviewedNodes(atlas.runtime, knowledge.index);
  const node = atlas.runtime.graph.nodeById.get(atlas.route.focusId ?? "") ?? nodes[0] ?? null;
  const entry = knowledge.entry(node?.id ?? null);
  const shard = knowledge.shard(node?.id ?? null);
  const status = knowledge.shardState(node?.id ?? null);

  useEffect(() => {
    if (node && entry && status === "idle") {
      knowledge.loadDossier(node.id).catch(() => undefined);
    }
  }, [entry, knowledge, node, status]);

  if (!node || !entry) return <EvidenceEmpty />;
  if (status === "loading" || !shard) return <EvidenceLoading node={node} />;
  return <EvidenceReady node={node} shard={shard} />;
}

function EvidenceEmpty() {
  return (
    <section className="observe-empty-state">
      <span>EVIDENCE READER</span>
      <h2>검수된 지식 근거가 없습니다.</h2>
      <p>Atlas Builder가 공개 안전성을 확인한 claim만 이 화면에 들어옵니다.</p>
    </section>
  );
}

function EvidenceLoading({ node }: { node: GraphNode }) {
  return (
    <section className="observe-empty-state">
      <span>EVIDENCE READER</span>
      <h2>{node.label}</h2>
      <p>content-hashed evidence shard를 검증해 여는 중입니다.</p>
    </section>
  );
}

function EvidenceReady({
  node,
  shard,
}: {
  node: GraphNode;
  shard: AtlasKnowledgeShardV1;
}) {
  const atlas = useAtlas();
  const claims = claimsForDossier(shard.dossier);
  const selected = claims.find((claim) => claim.id === atlas.route.claimId) ?? claims[0] ?? null;
  const evidence = selected
    ? shard.dossier.evidence.filter((item) => selected.evidenceIds.includes(item.id))
    : [];
  return (
    <section className="evidence-workbench">
      <EvidenceClaimIndex node={node} claims={claims} selected={selected} />
      <EvidenceProof node={node} claim={selected} evidence={evidence} />
    </section>
  );
}

function EvidenceClaimIndex({
  node,
  claims,
  selected,
}: {
  node: GraphNode;
  claims: ObserveClaim[];
  selected: ObserveClaim | null;
}) {
  const atlas = useAtlas();
  return (
    <nav className="evidence-claim-index" aria-label="Evidence-bound claims">
      <header><span>CLAIMS</span><strong>{node.label}</strong></header>
      {claims.map((claim) => (
        <button
          type="button"
          key={claim.id}
          aria-current={selected?.id === claim.id ? "true" : undefined}
          onClick={() => atlas.openEvidence(node.id, claim.id)}
        >
          <CheckCircle2 size={14} aria-hidden="true" />
          <span><small>{claim.label}</small><strong>{claim.text}</strong></span>
          <b>{claim.evidenceIds.length}</b>
        </button>
      ))}
    </nav>
  );
}

function EvidenceProof({
  node,
  claim,
  evidence,
}: {
  node: GraphNode;
  claim: ObserveClaim | null;
  evidence: AtlasKnowledgeShardV1["dossier"]["evidence"];
}) {
  const atlas = useAtlas();
  if (!claim) return <article className="evidence-proof"><p>검토할 claim을 선택해 주세요.</p></article>;
  return (
    <article className="evidence-proof">
      <header>
        <span>EVIDENCE-BOUND CLAIM</span>
        <h2>{claim.text}</h2>
        <p>{interpretationLabel(claim)}</p>
      </header>
      <div className="evidence-proof__cards">
        {evidence.map((item) => (
          <EvidenceCard
            key={item.id}
            evidence={item}
            onOpen={() => atlas.openReader(node.id, item.sectionId)}
          />
        ))}
      </div>
      {evidence.length ? null : (
        <p className="evidence-gap">이 claim을 뒷받침하는 공개 가능한 evidence가 없습니다.</p>
      )}
      <button
        type="button"
        className="evidence-proof__reader"
        onClick={() => atlas.openReader(node.id, evidence[0]?.sectionId ?? null)}
      >
        <BookOpenText size={15} aria-hidden="true" /> 안전 원문에서 읽기
      </button>
    </article>
  );
}

function interpretationLabel(claim: ObserveClaim) {
  return claim.interpretation === "source_explicit"
    ? "원문이 직접 명시한 주장"
    : "실제 근거에 경계를 둔 Atlas Builder 해석";
}
