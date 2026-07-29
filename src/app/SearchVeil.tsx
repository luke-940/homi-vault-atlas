import { ArrowRight, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useKnowledge } from "../knowledge/KnowledgeProvider";
import { queryKnowledgeSearch } from "../knowledge/knowledge-loader";
import type {
  GraphNode,
  KnowledgeSearchEntry,
  KnowledgeSearchResultKind,
} from "./contracts";
import { useAtlas } from "./state";

const groupOrder: KnowledgeSearchResultKind[] = [
  "knowledge",
  "insight",
  "source_section",
  "relationship",
  "operating_role",
];

const groupLabels: Record<KnowledgeSearchResultKind, string> = {
  knowledge: "Knowledge",
  insight: "Insights",
  source_section: "Source Sections",
  relationship: "Relationships",
  operating_role: "Operating Roles",
};

export function SearchVeil() {
  const atlas = useAtlas();
  const knowledge = useKnowledge();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (atlas.searchOpen && knowledge.searchState === "idle") {
      knowledge.loadSearch().catch(() => undefined);
    }
  }, [atlas.searchOpen, knowledge]);

  const results = useSearchResults(query);
  if (!atlas.searchOpen) return null;
  return (
    <div className="search-veil" role="dialog" aria-modal="true" aria-label="Search Atlas">
      <button
        type="button"
        className="search-veil__backdrop"
        aria-label="Close search"
        onClick={() => atlas.setSearchOpen(false)}
      />
      <section>
        <SearchHeader
          query={query}
          setQuery={setQuery}
          firstContent={results.content[0] ?? null}
          firstGraph={results.graph[0] ?? null}
        />
        <SearchResults {...results} />
      </section>
    </div>
  );
}

function useSearchResults(query: string) {
  const atlas = useAtlas();
  const knowledge = useKnowledge();
  const normalized = query.trim().toLocaleLowerCase("ko");
  const graph = useMemo(
    () => graphMatches(atlas.runtime.graph.nodes, normalized),
    [atlas.runtime.graph.nodes, normalized],
  );
  const content = useMemo(() => {
    if (!normalized || !knowledge.search) return [];
    return queryKnowledgeSearch(knowledge.search, normalized, 30);
  }, [knowledge.search, normalized]);
  const grouped = useMemo(() => new Map(groupOrder.map((kind) => [
    kind,
    content.filter((entry) => entry.kind === kind),
  ])), [content]);
  return { normalized, graph, content, grouped };
}

function graphMatches(nodes: GraphNode[], query: string) {
  if (!query) return nodes.slice().sort(byGravity).slice(0, 10);
  return nodes
    .filter((node) => node.label.toLocaleLowerCase("ko").includes(query)
      || node.domain.toLocaleLowerCase("en").includes(query))
    .sort(byGravity)
    .slice(0, 12);
}

function byGravity(left: GraphNode, right: GraphNode) {
  return right.gravity - left.gravity;
}

function SearchHeader({
  query,
  setQuery,
  firstContent,
  firstGraph,
}: {
  query: string;
  setQuery(value: string): void;
  firstContent: KnowledgeSearchEntry | null;
  firstGraph: GraphNode | null;
}) {
  const atlas = useAtlas();
  const openFirst = () => {
    if (firstContent) openContentResult(firstContent, atlas);
    else if (firstGraph) {
      atlas.openDossier(firstGraph.id, "overview", "home");
      atlas.setSearchOpen(false);
    }
  };
  return (
    <header>
      <label>
        <Search size={18} aria-hidden="true" />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") openFirst();
          }}
          placeholder="Search titles, insights, source sections and relationships"
        />
      </label>
      <button type="button" onClick={() => atlas.setSearchOpen(false)} aria-label="Close search">
        <X size={18} />
      </button>
    </header>
  );
}

function SearchResults({
  normalized,
  graph,
  content,
  grouped,
}: ReturnType<typeof useSearchResults>) {
  const atlas = useAtlas();
  const knowledge = useKnowledge();
  const open = (result: KnowledgeSearchEntry) => openContentResult(result, atlas);
  const graphEntries = graph.map(graphSearchEntry);
  const groups = normalized && content.length
    ? groupOrder.map((kind) => ({ kind, results: grouped.get(kind) ?? [] }))
      .filter((group) => group.results.length)
    : [];
  return (
    <div className="search-results">
      <SearchIndexStatus
        state={knowledge.searchState}
        error={knowledge.searchError}
        releaseEligible={knowledge.index.releaseEligible}
      />
      {groups.length ? groups.map((group) => (
        <SearchGroup
          key={group.kind}
          label={groupLabels[group.kind]}
          results={group.results}
          onOpen={open}
        />
      )) : (
        <SearchGroup
          label={normalized ? "Title matches" : "High-gravity knowledge"}
          results={graphEntries}
          onOpen={open}
        />
      )}
      {normalized && !content.length && !graph.length ? (
        <div className="empty-note">검색 가능한 공개 안전 지식이 없습니다.</div>
      ) : null}
    </div>
  );
}

function SearchIndexStatus({
  state,
  error,
  releaseEligible,
}: {
  state: "idle" | "loading" | "ready" | "error";
  error: string | null;
  releaseEligible: boolean;
}) {
  let message = "";
  if (state === "loading") message = "안전 원문 검색 index를 여는 중";
  else if (state === "error") message = error ?? "검색 index를 열지 못했습니다.";
  else if (!releaseEligible) message = "Local review candidate · production 미반영";
  return <div className="search-index-status" aria-live="polite">{message}</div>;
}

function graphSearchEntry(node: GraphNode): KnowledgeSearchEntry {
  return {
    id: `graph:${node.id}`,
    kind: "knowledge",
    label: node.label,
    detail: `${node.domain} · inbound ${node.gravity} · outgoing ${node.outgoing.length}`,
    nodeId: node.id,
    searchText: `${node.label} ${node.domain}`,
  };
}

function openContentResult(result: KnowledgeSearchEntry, atlas: ReturnType<typeof useAtlas>) {
  if (result.kind === "source_section" && result.nodeId) {
    atlas.openReader(result.nodeId, result.sectionId ?? null);
  } else if (result.kind === "relationship" && result.fromNodeId && result.toNodeId) {
    atlas.openObserveRelation(result.fromNodeId, result.toNodeId);
  } else if (result.kind === "operating_role") {
    atlas.goWorkspace("agency");
  } else if (result.nodeId) {
    atlas.openDossier(result.nodeId, "overview", "home");
  }
  atlas.setSearchOpen(false);
}

function SearchGroup({
  label,
  results,
  onOpen,
}: {
  label: string;
  results: KnowledgeSearchEntry[];
  onOpen(result: KnowledgeSearchEntry): void;
}) {
  const atlas = useAtlas();
  return (
    <section className="search-group" aria-label={label}>
      <h2>{label}</h2>
      {results.map((result) => (
        <button
          type="button"
          key={result.id}
          onPointerEnter={() => atlas.setPreview(result.nodeId ?? null)}
          onPointerLeave={() => atlas.setPreview(null)}
          onFocus={() => atlas.setPreview(result.nodeId ?? null)}
          onBlur={() => atlas.setPreview(null)}
          onClick={() => onOpen(result)}
        >
          <span>{groupLabels[result.kind]}</span>
          <strong>{result.label}</strong>
          <small>{result.detail}</small>
          <ArrowRight size={15} aria-hidden="true" />
        </button>
      ))}
    </section>
  );
}
