import { ArrowRight, BookOpenText, Network } from "lucide-react";
import { useEffect } from "react";
import { DossierDock, EvidenceCard } from "../../knowledge/DossierDock";
import { useKnowledge } from "../../knowledge/KnowledgeProvider";
import { directedShortestPath } from "../data";
import type {
  AtlasKnowledgeShardV1,
  GraphEdge,
  GraphNode,
  KnowledgeEvidence,
  RelationExplanation,
} from "../contracts";
import { useAtlas } from "../state";
import { edgeEndpoints, exactEdge, strongestReviewedRelation } from "./observe-model";

export function RelationWorkbench() {
  const atlas = useAtlas();
  const knowledge = useKnowledge();
  const fallback = strongestReviewedRelation(atlas.runtime);
  const fallbackNodes = fallback ? edgeEndpoints(atlas.runtime.graph, fallback) : null;
  const source = atlas.runtime.graph.nodeById.get(atlas.route.fromId ?? "") ?? fallbackNodes?.source ?? null;
  const target = atlas.runtime.graph.nodeById.get(atlas.route.toId ?? "") ?? fallbackNodes?.target ?? null;
  const entry = knowledge.entry(source?.id ?? null);
  const shard = knowledge.shard(source?.id ?? null);
  const status = knowledge.shardState(source?.id ?? null);

  useEffect(() => {
    if (source && entry && status === "idle") {
      knowledge.loadDossier(source.id).catch(() => undefined);
    }
  }, [entry, knowledge, source, status]);

  if (!source || !target) return <RelationEmpty />;
  return <RelationReady source={source} target={target} shard={shard} status={status} />;
}

function RelationEmpty() {
  return (
    <section className="observe-empty-state">
      <span>RELATION WORKBENCH</span>
      <h2>검증할 실제 관계가 없습니다.</h2>
      <p>검수된 두 지식 노드 사이의 directed edge가 생기면 여기에서 관계 문맥을 읽습니다.</p>
    </section>
  );
}

function RelationReady({
  source,
  target,
  shard,
  status,
}: {
  source: GraphNode;
  target: GraphNode;
  shard: AtlasKnowledgeShardV1 | null;
  status: "idle" | "loading" | "ready" | "error";
}) {
  const atlas = useAtlas();
  const direct = exactEdge(atlas.runtime.graph, source, target);
  const reverse = exactEdge(atlas.runtime.graph, target, source);
  const relation = shard?.dossier.relationExplanations.find(
    (item) => item.sourceNodeId === source.id && item.targetNodeId === target.id,
  ) ?? null;
  const path = direct ? [] : directedShortestPath(atlas.runtime.graph, source.id, target.id);
  const evidence = relation
    ? shard?.dossier.evidence.filter((item) => relation.evidenceIds.includes(item.id)) ?? []
    : [];
  return (
    <section className="relation-workbench">
      <RelationRoute source={source} target={target} direct={direct} />
      <div className="relation-proof-grid">
        <RelationProof
          source={source}
          target={target}
          direct={direct}
          reverse={reverse}
          relation={relation}
          status={status}
          path={path}
        />
        <RelationEvidence source={source} evidence={evidence} />
      </div>
      <div className="relation-source-dossier">
        <DossierDock nodeId={source.id} surface="observe" />
      </div>
    </section>
  );
}

function RelationRoute({
  source,
  target,
  direct,
}: {
  source: GraphNode;
  target: GraphNode;
  direct: GraphEdge | null;
}) {
  return (
    <div className="relation-route" aria-label={`${source.label}에서 ${target.label}로 향하는 관계`}>
      <RelationEndpoint overline="SOURCE" node={source} />
      <div className="relation-route__direction">
        <span>{direct ? `${direct.occurrences} occurrences` : "bridge path"}</span>
        <ArrowRight size={26} aria-hidden="true" />
        <small>actual directed reference</small>
      </div>
      <RelationEndpoint overline="TARGET" node={target} />
    </div>
  );
}

function RelationProof({
  source,
  target,
  direct,
  reverse,
  relation,
  status,
  path,
}: {
  source: GraphNode;
  target: GraphNode;
  direct: GraphEdge | null;
  reverse: GraphEdge | null;
  relation: RelationExplanation | null;
  status: "idle" | "loading" | "ready" | "error";
  path: GraphEdge[];
}) {
  const atlas = useAtlas();
  return (
    <article className="relation-proof">
      <header><span>RELATION PROOF</span><strong>{direct ? "직접 관계" : "직접 연결 없음"}</strong></header>
      <RelationExplanationBody relation={relation} reverse={reverse} status={status} />
      {!direct && path.length ? <BridgePath path={path} /> : null}
      <footer>
        <button type="button" onClick={() => atlas.openPath(source.id, target.id)}>
          <Network size={14} aria-hidden="true" /> Explore exact path
        </button>
        {relation ? (
          <button type="button" onClick={() => atlas.openEvidence(source.id, relation.id)}>
            <BookOpenText size={14} aria-hidden="true" /> Evidence Reader
          </button>
        ) : null}
      </footer>
    </article>
  );
}

function RelationExplanationBody({
  relation,
  reverse,
  status,
}: {
  relation: RelationExplanation | null;
  reverse: GraphEdge | null;
  status: "idle" | "loading" | "ready" | "error";
}) {
  if (relation) {
    return (
      <>
        <p>{relation.explanation}</p>
        <dl>
          <div><dt>Interpretation</dt><dd>{relationKindLabel(relation)}</dd></div>
          <div><dt>Evidence</dt><dd>{relation.evidenceIds.length}</dd></div>
          <div><dt>Reverse</dt><dd>{reverse ? `${reverse.occurrences} occurrences` : "없음"}</dd></div>
        </dl>
      </>
    );
  }
  if (status === "loading") return <p className="empty-note">관계 문맥을 여는 중입니다.</p>;
  return (
    <p className="evidence-gap">
      실제 edge는 존재하지만 공개 가능한 설명 문맥이 없거나 아직 Atlas Builder 검수를 기다립니다.
    </p>
  );
}

function BridgePath({ path }: { path: GraphEdge[] }) {
  const atlas = useAtlas();
  return (
    <ol className="bridge-path">
      {path.map((edge) => {
        const endpoints = edgeEndpoints(atlas.runtime.graph, edge);
        return (
          <li key={edge.id}>
            <span>{endpoints.source.label}</span>
            <ArrowRight size={12} aria-hidden="true" />
            <span>{endpoints.target.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function RelationEvidence({
  source,
  evidence,
}: {
  source: GraphNode;
  evidence: KnowledgeEvidence[];
}) {
  const atlas = useAtlas();
  return (
    <aside className="relation-evidence">
      <span>SUPPORTING EVIDENCE</span>
      {evidence.map((item) => (
        <EvidenceCard
          key={item.id}
          evidence={item}
          onOpen={() => atlas.openReader(source.id, item.sectionId)}
        />
      ))}
      {evidence.length ? null : <p>공개 가능한 excerpt가 없으면 관계를 추측해 채우지 않습니다.</p>}
    </aside>
  );
}

function RelationEndpoint({
  overline,
  node,
}: {
  overline: string;
  node: GraphNode;
}) {
  return (
    <div className="relation-endpoint">
      <span>{overline}</span>
      <strong>{node.label}</strong>
      <small>{node.domain} · {node.kind.replaceAll("_", " ")}</small>
    </div>
  );
}

function relationKindLabel(relation: RelationExplanation) {
  if (relation.kind === "direct_context") return "원문 직접 명시";
  if (relation.kind === "bounded_synthesis") return "Atlas Builder 제한적 종합";
  return "공개 가능한 문맥 없음";
}
