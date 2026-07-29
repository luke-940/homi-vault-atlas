import { ArrowDownLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import { DossierDock } from "../../knowledge/DossierDock";
import { useKnowledge } from "../../knowledge/KnowledgeProvider";
import { useAtlas } from "../state";
import { reviewedNodes, visibleNeighbors } from "./observe-model";

export function NodeWorkbench() {
  const atlas = useAtlas();
  const knowledge = useKnowledge();
  const nodes = reviewedNodes(atlas.runtime, knowledge.index);
  const selected = atlas.runtime.graph.nodeById.get(atlas.route.focusId ?? "") ?? nodes[0] ?? null;

  return (
    <section className="node-workbench">
      <nav className="reviewed-node-strip" aria-label="Reviewed knowledge nodes">
        <span>REVIEWED SLICE</span>
        <div>
          {nodes.map((node) => (
            <button
              type="button"
              key={node.id}
              aria-current={selected?.id === node.id ? "true" : undefined}
              onClick={() => atlas.openObserveNode(node.id)}
            >
              <small>{node.domain}</small>
              <strong>{node.label}</strong>
            </button>
          ))}
        </div>
      </nav>
      {selected ? <NodeRelationMap nodeId={selected.id} /> : null}
      <div className="node-workbench__dossier">
        <DossierDock nodeId={selected?.id ?? null} surface="observe" />
      </div>
    </section>
  );
}

function NodeRelationMap({ nodeId }: { nodeId: string }) {
  const atlas = useAtlas();
  const node = atlas.runtime.graph.nodeById.get(nodeId);
  if (!node) return null;
  const neighborhood = visibleNeighbors(atlas.runtime.graph, node);
  return (
    <section className="node-relation-map" aria-label={`${node.label} actual relation neighborhood`}>
      <header>
        <span>ACTUAL ONE-HOP RELATIONS</span>
        <p>실제 reference만 표시합니다. 선택하면 방향 관계 검증으로 이동합니다.</p>
      </header>
      <div className="node-relation-map__field">
        <RelationColumn
          label="INCOMING"
          icon={<ArrowDownLeft size={14} aria-hidden="true" />}
          rows={neighborhood.incoming}
          onSelect={(relatedId) => atlas.openObserveRelation(relatedId, node.id)}
        />
        <div className="node-relation-map__focus" style={{ "--domain-color": node.domain } as React.CSSProperties}>
          <small>{node.domain}</small>
          <strong>{node.label}</strong>
          <dl>
            <div><dt>Gravity</dt><dd>{node.gravity}</dd></div>
            <div><dt>In</dt><dd>{node.incoming.length}</dd></div>
            <div><dt>Out</dt><dd>{node.outgoing.length}</dd></div>
          </dl>
        </div>
        <RelationColumn
          label="OUTGOING"
          icon={<ArrowUpRight size={14} aria-hidden="true" />}
          rows={neighborhood.outgoing}
          onSelect={(relatedId) => atlas.openObserveRelation(node.id, relatedId)}
        />
      </div>
      <footer>
        <span>숨김 incoming {neighborhood.hiddenIncoming}</span>
        <ArrowRight size={13} aria-hidden="true" />
        <span>숨김 outgoing {neighborhood.hiddenOutgoing}</span>
      </footer>
    </section>
  );
}

function RelationColumn({
  label,
  icon,
  rows,
  onSelect,
}: {
  label: string;
  icon: React.ReactNode;
  rows: ReturnType<typeof visibleNeighbors>["incoming"];
  onSelect(id: string): void;
}) {
  return (
    <div className="node-relation-map__column">
      <h3>{icon}{label}</h3>
      {rows.map(({ edge, node }) => (
        <button type="button" key={edge.id} onClick={() => onSelect(node.id)}>
          <span>{node.label}</span>
          <small>{edge.occurrences}</small>
        </button>
      ))}
      {!rows.length ? <p>확인된 직접 연결 없음</p> : null}
    </div>
  );
}
