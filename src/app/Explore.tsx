import { FolderTree, List, Orbit, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { CosmosStage } from "./CosmosStage";
import { EvidenceRail } from "./EvidenceRail";
import { NodeList, VaultStructure } from "./ExploreIndexes";
import { useAtlas } from "./state";
import { WorkspaceTitle } from "./WorkspaceTitle";

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
      <WorkspaceTitle
        workspace="Explore"
        context="Knowledge Map"
        actions={(
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
              aria-current={atlas.route.exploreMode === "structure" ? "page" : undefined}
              onClick={() => atlas.setExploreMode("structure")}
            >
              <FolderTree size={14} /> Structure
            </button>
            <button
              type="button"
              aria-current={atlas.route.exploreMode === "list" ? "page" : undefined}
              onClick={() => atlas.setExploreMode("list")}
            >
              <List size={14} /> List
            </button>
          </div>
        )}
      />
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
            <EvidenceRail compact surface="explore" />
          </aside>
        </div>
      ) : atlas.route.exploreMode === "structure" ? (
        <VaultStructure query={query} domain={domain} />
      ) : (
        <NodeList nodes={nodes} />
      )}
    </main>
  );
}
