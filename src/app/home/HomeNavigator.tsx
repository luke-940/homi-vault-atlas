import { useMemo } from "react";
import type { GraphNodeKind } from "../contracts";
import { kindLabels } from "../ExploreIndexes";
import { useAtlas } from "../state";

export interface HomeHighlight {
  domain: string | null;
  kind: GraphNodeKind | null;
  query: string;
}

export function HomeNavigator({
  highlight,
  onChange,
}: {
  highlight: HomeHighlight;
  onChange(next: HomeHighlight): void;
}) {
  const atlas = useAtlas();
  const kinds = useMemo(() => [...new Set(atlas.runtime.graph.nodes.map((node) => node.kind))]
    .sort((left, right) => kindLabels[left].localeCompare(kindLabels[right], "ko")), [
    atlas.runtime.graph.nodes,
  ]);
  const nodes = useMemo(() => {
    const query = highlight.query.trim().toLocaleLowerCase("ko");
    return atlas.runtime.graph.nodes
      .filter((node) => !highlight.domain || node.domain === highlight.domain)
      .filter((node) => !highlight.kind || node.kind === highlight.kind)
      .filter((node) => !query || node.label.toLocaleLowerCase("ko").includes(query))
      .sort((left, right) => right.gravity - left.gravity
        || left.label.localeCompare(right.label, "ko"));
  }, [atlas.runtime.graph.nodes, highlight]);
  const filtered = Boolean(highlight.domain || highlight.kind || highlight.query);
  const update = (patch: Partial<HomeHighlight>) => onChange({ ...highlight, ...patch });

  return (
    <section className="home-navigator" aria-label="지식 노드 탐색">
      <header>
        <span>MAP INDEX</span>
        <b>{nodes.length.toLocaleString("ko-KR")}</b>
        {filtered ? (
          <button
            type="button"
            onClick={() => onChange({ domain: null, kind: null, query: "" })}
          >
            초기화
          </button>
        ) : null}
      </header>
      <div className="home-navigator__facets">
        <label>
          <span>주제</span>
          <select
            value={highlight.domain ?? ""}
            onChange={(event) => update({ domain: event.target.value || null })}
          >
            <option value="">모든 영역</option>
            {atlas.runtime.graph.domains.map((domain) => (
              <option key={domain.id} value={domain.label}>
                {domain.label} · {domain.nodeIndexes.length}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>유형</span>
          <select
            value={highlight.kind ?? ""}
            onChange={(event) => update({ kind: (event.target.value || null) as GraphNodeKind | null })}
          >
            <option value="">모든 유형</option>
            {kinds.map((kind) => (
              <option key={kind} value={kind}>{kindLabels[kind]}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="home-navigator__search">
        <span className="visually-hidden">노드 제목 검색</span>
        <input
          type="search"
          value={highlight.query}
          placeholder="노드 제목 검색"
          onChange={(event) => update({ query: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Enter" && nodes[0]) atlas.commitFocus(nodes[0].id);
            if (event.key === "Escape") update({ query: "" });
          }}
        />
      </label>
      <ul className="home-navigator__list">
        {nodes.map((node) => (
          <li key={node.id} style={{ "--domain-color": atlas.runtime.graph.domains[node.domainIndex]?.color } as React.CSSProperties}>
            <button
              type="button"
              aria-current={atlas.route.focusId === node.id ? "true" : undefined}
              onPointerEnter={() => atlas.setPreview(node.id)}
              onPointerLeave={() => atlas.setPreview(null)}
              onFocus={() => atlas.setPreview(node.id)}
              onBlur={() => atlas.setPreview(null)}
              onClick={() => {
                atlas.setPreview(null);
                atlas.commitFocus(node.id);
              }}
            >
              <span aria-hidden="true" />
              <strong>{node.label}</strong>
              <small>{node.domain} · {kindLabels[node.kind]}</small>
            </button>
          </li>
        ))}
      </ul>
      {!nodes.length ? <p className="empty-note">조건에 맞는 공개 노드가 없습니다.</p> : null}
    </section>
  );
}
