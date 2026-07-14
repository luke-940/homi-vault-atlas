import { CornerDownLeft, FileText, Folder, Search, X } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { atlasData, entityById } from "../data";
import { useAtlasState } from "../state";
import type { Workspace } from "../types";

type SearchResult = {
  id: string;
  label: string;
  meta: string;
  kind: "document" | "folder" | "district";
};

type SearchDestination = {
  workspace: Workspace;
  label: string;
  reason: string;
  routeId?: string;
  eraId?: number;
  relationPairId?: string;
};

function strongestPairForDistrict(district: string, layer: "wikilink" | "typed" | "route") {
  return atlasData.relation.matrix
    .filter((pair) => pair.source === district || pair.target === district)
    .filter((pair) => pair[layer] > 0)
    .sort((a, b) => b[layer] - a[layer] || a.id.localeCompare(b.id))[0];
}

function destinationFor(result: SearchResult, workspace: Workspace, layer: "wikilink" | "typed" | "route"): SearchDestination {
  if (result.kind !== "document") {
    return { workspace: "explore", label: "계보에서 위치 보기", reason: "폴더와 구역은 계보에서 정확한 상하 관계를 확인합니다." };
  }
  const entity = entityById.get(result.id);
  if (!entity || workspace === "explore") {
    return { workspace: "explore", label: "탐색에서 위치 보기", reason: "문서의 구역과 계보 경로를 함께 엽니다." };
  }
  if (workspace === "observe") {
    const pair = strongestPairForDistrict(entity.district, layer);
    if (pair) return { workspace, relationPairId: pair.id, label: "관측에서 관계 보기", reason: `${entity.district}이 포함된 가장 강한 현재 관계쌍으로 이동합니다.` };
  }
  if (workspace === "flow") {
    const route = atlasData.flow.routes.find((candidate) => candidate.members.includes(entity.id));
    if (route) return { workspace, routeId: route.id, label: "흐름에서 경로 보기", reason: `${route.label}에 포함된 문서로 현재 focus를 유지합니다.` };
  }
  if (workspace === "time") {
    const era = atlasData.temporal.eras.find((candidate) => (
      candidate.evidenceRefs.includes(entity.id)
      || candidate.deltas.some((delta) => delta.evidenceRef === entity.id)
    ));
    if (era) return { workspace, eraId: era.id, label: "시간에서 근거 보기", reason: `시대 ${era.id}의 근거 문서로 연결됩니다.` };
  }
  return { workspace: "explore", label: "탐색에서 위치 보기", reason: "현재 화면에 직접 대응하는 표식이 없어 정본 위치를 우선 엽니다." };
}

export function SearchPalette() {
  const { state, dispatch } = useAtlasState();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const selectionCommittedRef = useRef(false);
  const destinationTitleRef = useRef("explore-title");

  useLayoutEffect(() => {
    const previousOverflow = document.body.style.overflow;
    if (state.searchOpen) {
      returnFocusRef.current = document.activeElement as HTMLElement | null;
      setQuery("");
      setActiveIndex(0);
      document.querySelector<HTMLElement>(".command-bar")?.setAttribute("inert", "");
      document.querySelector<HTMLElement>(".workspace-shell")?.setAttribute("inert", "");
      document.body.style.overflow = "hidden";
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      document.querySelector<HTMLElement>(".command-bar")?.removeAttribute("inert");
      document.querySelector<HTMLElement>(".workspace-shell")?.removeAttribute("inert");
      const target = returnFocusRef.current;
      returnFocusRef.current = null;
      if (selectionCommittedRef.current) {
        selectionCommittedRef.current = false;
        requestAnimationFrame(() => {
          const destination = document.getElementById(destinationTitleRef.current);
          if (!destination) return;
          destination.setAttribute("tabindex", "-1");
          destination.focus({ preventScroll: true });
          destination.scrollIntoView({ block: "nearest" });
        });
      } else {
        target?.focus();
      }
    }
    return () => {
      document.querySelector<HTMLElement>(".command-bar")?.removeAttribute("inert");
      document.querySelector<HTMLElement>(".workspace-shell")?.removeAttribute("inert");
      document.body.style.overflow = previousOverflow;
    };
  }, [state.searchOpen]);

  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko-KR");
    if (!normalized) {
      return atlasData.entity.entities
        .filter((entity) => entity.defaultPreload || entity.authority === "L1" || entity.authority === "L2")
        .slice(0, 10)
        .map<SearchResult>((entity) => ({
          id: entity.id,
          label: entity.title,
          meta: `${entity.path} · ${entity.authority}`,
          kind: "document",
        }));
    }
    const tokens = normalized.split(/\s+/).filter(Boolean);
    const documents = atlasData.entity.entities
      .map((entity) => {
        const haystack = [entity.title, entity.path, ...entity.aliases, ...entity.tags]
          .join(" ")
          .toLocaleLowerCase("ko-KR");
        const score = tokens.reduce((total, token) => {
          if (entity.title.toLocaleLowerCase("ko-KR").startsWith(token)) return total + 8;
          if (entity.title.toLocaleLowerCase("ko-KR").includes(token)) return total + 5;
          if (entity.path.toLocaleLowerCase("ko-KR").includes(token)) return total + 3;
          return total + Number(haystack.includes(token));
        }, 0);
        return { entity, score };
      })
      .filter((item) => item.score >= tokens.length)
      .sort((a, b) => b.score - a.score || a.entity.title.localeCompare(b.entity.title))
      .slice(0, 12)
      .map<SearchResult>(({ entity }) => ({
        id: entity.id,
        label: entity.title,
        meta: `${entity.path} · ${entity.authority}`,
        kind: "document",
      }));
    const folders = atlasData.structure.hierarchyNodes
      .filter(
        (node) =>
          node.kind !== "document" &&
          node.label.toLocaleLowerCase("ko-KR").includes(normalized),
      )
      .slice(0, 4)
      .map<SearchResult>((node) => ({
        id: node.id,
        label: node.label,
        meta: `${node.documentCount}개 문서 · ${node.path || "Homi Vault"}`,
        kind: node.kind === "district" ? "district" : "folder",
      }));
    return [...documents, ...folders].slice(0, 15);
  }, [query]);

  useLayoutEffect(() => {
    if (!state.searchOpen || !results.length) return;
    document
      .getElementById(`atlas-search-option-${activeIndex}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, results, state.searchOpen]);

  if (!state.searchOpen) return null;

  const choose = (result: SearchResult) => {
    const destination = destinationFor(result, state.workspace, state.relationLayer);
    selectionCommittedRef.current = true;
    destinationTitleRef.current = `${destination.workspace}-title`;
    dispatch({ type: "workspace", workspace: destination.workspace });
    if (destination.workspace === "explore") dispatch({ type: "lens", lens: "lineage" });
    if (destination.relationPairId) dispatch({ type: "relationPair", relationPairId: destination.relationPairId });
    if (destination.routeId) dispatch({ type: "route", routeId: destination.routeId });
    if (destination.eraId) dispatch({ type: "era", eraId: destination.eraId });
    dispatch({ type: "focus", focusId: result.id });
    dispatch({ type: "search", open: false });
  };

  const activeOptionId = results[activeIndex]
    ? `atlas-search-option-${activeIndex}`
    : undefined;

  return (
    <div className="search-backdrop" role="presentation" onMouseDown={() => dispatch({ type: "search", open: false })}>
      <div
        ref={dialogRef}
        className="search-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="문서와 구역 찾기"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const focusables = [...(dialogRef.current?.querySelectorAll<HTMLElement>(
            "button:not([disabled]):not([tabindex='-1']), input:not([disabled]), [tabindex]:not([tabindex='-1'])",
          ) ?? [])].filter((item) => item.offsetParent !== null);
          if (!focusables.length) return;
          const first = focusables[0];
          const last = focusables[focusables.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        <div className="search-input-row">
          <Search size={19} aria-hidden="true" />
          <input
            ref={inputRef}
            id="atlas-search-input"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                if (results.length) setActiveIndex((index) => Math.min(results.length - 1, index + 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                if (results.length) setActiveIndex((index) => Math.max(0, index - 1));
              } else if (event.key === "Enter" && results[activeIndex]) {
                event.preventDefault();
                choose(results[activeIndex]);
              } else if (event.key === "Escape") {
                dispatch({ type: "search", open: false });
              }
            }}
            placeholder="제목, 경로, 별칭, 태그로 찾기"
            aria-label="검색어"
            role="combobox"
            aria-autocomplete="list"
            aria-haspopup="listbox"
            aria-expanded="true"
            aria-controls="atlas-search-results"
            aria-activedescendant={activeOptionId}
          />
          <button className="icon-button" type="button" onClick={() => dispatch({ type: "search", open: false })} aria-label="검색 닫기">
            <X size={18} />
          </button>
        </div>
        <div className="search-context">제목·경로·별칭·태그로 찾습니다. 현재 작업 공간에 직접 대응하면 그 맥락을 유지하고, 없으면 계보의 정본 위치로 이동합니다.</div>
        <div className="search-results" id="atlas-search-results" role="listbox" aria-label="검색 결과">
          {results.map((result, index) => {
            const Icon = result.kind === "document" ? FileText : Folder;
            const destination = destinationFor(result, state.workspace, state.relationLayer);
            return (
              <button
                key={result.id}
                id={`atlas-search-option-${index}`}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={index === activeIndex}
                className={index === activeIndex ? "search-result is-active" : "search-result"}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(result)}
              >
                <Icon size={17} aria-hidden="true" />
                <span><strong>{result.label}</strong><small>{result.meta}</small></span>
                <span className="search-result-action" title={destination.reason}>
                  <span>{destination.label}</span>
                  {index === activeIndex && <CornerDownLeft size={15} aria-hidden="true" />}
                </span>
              </button>
            );
          })}
          {!results.length && <p className="empty-state">일치하는 문서나 구역이 없습니다.</p>}
        </div>
      </div>
    </div>
  );
}
