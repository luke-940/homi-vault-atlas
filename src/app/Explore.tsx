import { ArrowDownLeft, ArrowUpRight, List, Orbit, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { CosmosStage } from "./CosmosStage";
import { EvidenceRail } from "./EvidenceRail";
import { relationSummary } from "./data";
import { useAtlas } from "./state";

export function Explore() {
  const atlas = useAtlas();
  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState<string | null>(null);
  const nodes = useMemo(() => atlas.runtime.graph.nodes
    .filter((node) => !domain || node.domain === domain)
    .filter((node) => !query || node.label.toLocaleLowerCase("ko").includes(query.toLocaleLowerCase("ko")))
    .sort((left, right) => right.gravity - left.gravity || left.label.localeCompare(right.label, "ko")), [
    atlas.runtime.graph.nodes,
    domain,
    query,
  ]);
  return (
    <main className="workspace-layout explore-layout">
      <header className="workspace-heading">
        <div>
          <p className="eyebrow">EXPLORE · OPEN KNOWLEDGE COSMOS</p>
          <h1>실제 이름과 방향 관계를 탐색한다.</h1>
        </div>
        <div className="view-switch" aria-label="Explore view">
          <button
            type="button"
            aria-current={atlas.route.exploreMode === "graph" ? "page" : undefined}
            onClick={() => atlas.setExploreMode("graph")}
          >
            <Orbit size={14} /> Graph
          </button>
          <button
            type="button"
            aria-current={atlas.route.exploreMode === "list" ? "page" : undefined}
            onClick={() => atlas.setExploreMode("list")}
          >
            <List size={14} /> List
          </button>
        </div>
      </header>
      <div className="command-rail">
        <label>
          <Search size={15} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => {
              const nextQuery = event.target.value;
              setQuery(nextQuery);
              const normalized = nextQuery.trim().toLocaleLowerCase("ko");
              const match = normalized
                ? atlas.runtime.graph.nodes
                  .filter((node) => !domain || node.domain === domain)
                  .find((node) => node.label.toLocaleLowerCase("ko").includes(normalized))
                : null;
              atlas.setPreview(match?.id ?? null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && nodes[0]) atlas.openNode(nodes[0].id, "explore");
              if (event.key === "Escape") {
                setQuery("");
                atlas.setPreview(null);
              }
            }}
            onBlur={() => atlas.setPreview(null)}
            placeholder="Search actual safe titles"
          />
        </label>
        <div className="domain-filters">
          <button type="button" aria-pressed={!domain} onClick={() => setDomain(null)}>All</button>
          {atlas.runtime.graph.domains.map((item) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={domain === item.label}
              onClick={() => {
                setDomain(item.label);
                if (["MOC", "Papers", "Signals"].includes(item.label)) atlas.setLens("knowledge-core");
                if (["Rocket", "Groot", "Intelligence Layer"].includes(item.label)) atlas.setLens("project-frontiers");
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {atlas.route.exploreMode === "graph" ? (
        <div className="explore-stage-grid">
          <section className="explore-stage" aria-label="Interactive spatial knowledge graph">
            <CosmosStage mode="explore" activeDomains={domain ? [domain] : undefined} />
          </section>
          <aside className="explore-inspector">
            <EvidenceRail compact />
            <RelationList />
          </aside>
        </div>
      ) : (
        <NodeList nodes={nodes} />
      )}
    </main>
  );
}

function RelationList() {
  const atlas = useAtlas();
  const node = atlas.runtime.graph.nodeById.get(atlas.route.focusId ?? "");
  if (!node) {
    return (
      <div className="inspector-overview">
        <p>노드를 선택하면 정확한 incoming/outgoing 관계를 표시합니다.</p>
        <dl>
          {atlas.runtime.graph.domains.map((domain) => (
            <div key={domain.id}>
              <dt>{domain.label}</dt>
              <dd>{domain.nodeCount}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }
  const summary = relationSummary(atlas.runtime.graph, node);
  return (
    <div className="relation-list">
      <h2>Directed relations</h2>
      {[...summary.incoming, ...summary.outgoing].map((item) => (
        <button type="button" key={item.edge.id} onClick={() => atlas.commitFocus(item.node.id)}>
          {item.direction === "incoming"
            ? <ArrowDownLeft aria-label="incoming" size={14} />
            : <ArrowUpRight aria-label="outgoing" size={14} />}
          <span>{item.node.label}</span>
          <small>{item.edge.occurrences}</small>
        </button>
      ))}
      {summary.hiddenIncoming + summary.hiddenOutgoing > 0 ? (
        <p>추가 관계 {summary.hiddenIncoming + summary.hiddenOutgoing}개는 List/Search에서 접근할 수 있습니다.</p>
      ) : null}
    </div>
  );
}

function NodeList({ nodes }: { nodes: ReturnType<typeof useAtlas>["runtime"]["graph"]["nodes"] }) {
  const atlas = useAtlas();
  return (
    <section className="node-index" aria-label="Keyboard-operable knowledge node index">
      <p>{nodes.length.toLocaleString("ko-KR")} safe knowledge nodes</p>
      <ul>
        {nodes.map((node) => (
          <li key={node.id}>
            <button
              type="button"
              onFocus={() => atlas.setPreview(node.id)}
              onBlur={() => atlas.setPreview(null)}
              onPointerEnter={() => atlas.setPreview(node.id)}
              onPointerLeave={() => atlas.setPreview(null)}
              onClick={() => {
                atlas.openNode(node.id, "explore");
              }}
            >
              <span className="node-index__domain">{node.domain}</span>
              <strong>{node.label}</strong>
              <span>{node.kind.replaceAll("_", " ")} · inbound {node.gravity}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
