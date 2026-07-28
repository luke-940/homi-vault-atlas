import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { relationSummary } from "./data";
import { activeNode, useAtlas } from "./state";

export function EvidenceRail({ compact = false }: { compact?: boolean }) {
  const atlas = useAtlas();
  const node = activeNode(atlas);
  if (!node) {
    return (
      <div className={`evidence-rail ${compact ? "evidence-rail--compact" : ""}`}>
        <span>NODE EVIDENCE</span>
        <p>노드에 손을 올리거나 키보드로 선택하면 실제 제목과 방향 관계가 나타납니다.</p>
      </div>
    );
  }
  const relation = relationSummary(atlas.runtime.graph, node);
  return (
    <div className={`evidence-rail ${compact ? "evidence-rail--compact" : ""}`}>
      <span>{node.domain} · {node.kind.replaceAll("_", " ")}</span>
      <strong>{node.label}</strong>
      <dl>
        <div><dt>Unique inbound</dt><dd>{node.gravity.toLocaleString("ko-KR")}</dd></div>
        <div><dt>Occurrences</dt><dd>{node.occurrences.toLocaleString("ko-KR")}</dd></div>
        <div><dt><ArrowDownLeft size={12} /> Incoming</dt><dd>{node.incoming.length}</dd></div>
        <div><dt><ArrowUpRight size={12} /> Outgoing</dt><dd>{node.outgoing.length}</dd></div>
      </dl>
      {compact ? null : (
        <div className="evidence-relations">
          {relation.incoming.slice(0, 2).map((item) => (
            <button type="button" key={`in-${item.edge.id}`} onClick={() => atlas.commitFocus(item.node.id)}>
              <ArrowDownLeft aria-hidden="true" size={12} />
              <span>{item.node.label}</span>
            </button>
          ))}
          {relation.outgoing.slice(0, 2).map((item) => (
            <button type="button" key={`out-${item.edge.id}`} onClick={() => atlas.commitFocus(item.node.id)}>
              <ArrowUpRight aria-hidden="true" size={12} />
              <span>{item.node.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

