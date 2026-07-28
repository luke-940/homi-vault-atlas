import { ArrowRight, Search, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useAtlas } from "./state";

export function SearchVeil() {
  const atlas = useAtlas();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko");
    if (!normalized) return atlas.runtime.graph.nodes
      .slice()
      .sort((left, right) => right.gravity - left.gravity)
      .slice(0, 12);
    return atlas.runtime.graph.nodes
      .filter((node) => node.label.toLocaleLowerCase("ko").includes(normalized)
        || node.domain.toLocaleLowerCase("en").includes(normalized))
      .sort((left, right) => right.gravity - left.gravity)
      .slice(0, 24);
  }, [atlas.runtime.graph.nodes, query]);
  const actorResults = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko");
    const actors = atlas.runtime.agency?.actors ?? [];
    return actors
      .filter((actor) => !normalized
        || actor.label.toLocaleLowerCase("en").includes(normalized)
        || actor.purpose?.toLocaleLowerCase("ko").includes(normalized))
      .slice(0, 6);
  }, [atlas.runtime.agency, query]);
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
        <header>
          <label>
            <Search size={18} aria-hidden="true" />
            <input
              ref={inputRef}
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                if (results[0]) atlas.openNode(results[0].id, "explore");
                else if (actorResults[0]) atlas.goWorkspace("agency");
                atlas.setSearchOpen(false);
              }}
              placeholder={`Search ${atlas.runtime.graph.nodes.length.toLocaleString("ko-KR")} safe knowledge nodes`}
            />
          </label>
          <button type="button" onClick={() => atlas.setSearchOpen(false)} aria-label="Close search">
            <X size={18} />
          </button>
        </header>
        <div className="search-results">
          <p>{query ? `${results.length + actorResults.length} matching results` : "High-gravity knowledge"}</p>
          {results.map((node) => (
            <button
              type="button"
              key={node.id}
              onPointerEnter={() => atlas.setPreview(node.id)}
              onPointerLeave={() => atlas.setPreview(null)}
              onFocus={() => atlas.setPreview(node.id)}
              onBlur={() => atlas.setPreview(null)}
              onClick={() => {
                atlas.openNode(node.id, "explore");
                atlas.setSearchOpen(false);
              }}
            >
              <span>{node.domain}</span>
              <strong>{node.label}</strong>
              <small>inbound {node.gravity} · outgoing {node.outgoing.length}</small>
              <ArrowRight size={15} aria-hidden="true" />
            </button>
          ))}
          {actorResults.length ? <p className="search-results__section">Operating roles</p> : null}
          {actorResults.map((actor) => (
            <button
              type="button"
              key={actor.id}
              onClick={() => {
                atlas.goWorkspace("agency");
                atlas.setSearchOpen(false);
              }}
            >
              <span>Agency</span>
              <strong>{actor.label}</strong>
              <small>{actor.purpose}</small>
              <ArrowRight size={15} aria-hidden="true" />
            </button>
          ))}
          {!results.length ? <div className="empty-note">검색 가능한 공개 안전 제목이 없습니다.</div> : null}
        </div>
      </section>
    </div>
  );
}
