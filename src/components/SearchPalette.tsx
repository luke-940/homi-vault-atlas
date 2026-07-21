import { CircleDot, CornerDownLeft, FileText, Folder, Network, Search, X } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { atlasData, entityById, graphNodeById } from "../data-runtime";
import { useAtlasState, type Action } from "../state";
import { isGraphHub, isGraphSource } from "../graph-navigation";
import type { AtlasGraphNodeV1, Workspace } from "../types";
import { claimModalInert, releaseModalInert } from "./tray-accessibility";

export type SearchResult = {
  id: string;
  label: string;
  meta: string;
  kind: "actor" | "document" | "folder" | "district" | "hub" | "source";
  section: "roles" | "knowledge";
};

export type SearchDestination = {
  workspace: Workspace;
  label: string;
  reason: string;
  routeId?: string;
  eraId?: number;
  relationPairId?: string;
  actorId?: string;
  sceneId?: string;
};

function strongestPairForDistrict(district: string, layer: "wikilink" | "typed" | "route") {
  return atlasData.relation.matrix
    .filter((pair) => pair.source === district || pair.target === district)
    .filter((pair) => pair[layer] > 0)
    .sort((a, b) => b[layer] - a[layer] || a.id.localeCompare(b.id))[0];
}

export function destinationFor(result: SearchResult, workspace: Workspace, layer: "wikilink" | "typed" | "route"): SearchDestination {
  if (result.kind === "actor") {
    return {
      workspace: "agency",
      actorId: result.id,
      label: "Agency에서 역할 보기",
      reason: "운영 역할은 지식 문서와 분리된 Agency 책임 지도에서 엽니다.",
    };
  }
  const graphNode = graphNodeById.get(result.id);
  if (graphNode) {
    return {
      workspace: "explore",
      sceneId: "graph",
      label: graphNode.kind === "district" ? "구역 그래프 열기" : "그래프에서 위치 보기",
      reason: "v7.5 방향 그래프에서 실제 위치와 관계를 엽니다.",
    };
  }
  if (result.kind !== "document") {
    return { workspace: "explore", label: "City에서 위치 보기", reason: "공개 구역은 City에서 집계 위치를 확인합니다." };
  }
  const entity = entityById.get(result.id);
  if (!entity || workspace === "explore") {
    return { workspace: "explore", label: "City에서 위치 보기", reason: "공개 집계가 속한 지식 구역을 City에서 엽니다." };
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

export function searchComboboxAccessibility(activeOptionId: string | undefined) {
  return {
    role: "combobox" as const,
    "aria-autocomplete": "list" as const,
    "aria-haspopup": "listbox" as const,
    "aria-expanded": true,
    "aria-controls": "atlas-search-results",
    "aria-activedescendant": activeOptionId,
  };
}

export function searchDialogAccessibility() {
  return {
    role: "dialog" as const,
    "aria-modal": true,
    "aria-label": "문서와 구역 찾기",
  };
}

export function searchOptionAccessibility(index: number, activeIndex: number) {
  return {
    role: "option" as const,
    tabIndex: -1,
    "aria-selected": index === activeIndex,
  };
}

export function createSearchSelectionPlan(
  result: SearchResult,
  workspace: Workspace,
  layer: "wikilink" | "typed" | "route",
) {
  const destination = destinationFor(result, workspace, layer);
  const actions: Action[] = [
    ...(destination.actorId
      ? [{ type: "actor", actorId: destination.actorId } as const]
      : destination.workspace === "explore"
        ? [{ type: "journey", target: { workspace: "explore", sceneId: destination.sceneId ?? "graph", focusId: result.id } } as const]
        : [{ type: "workspace", workspace: destination.workspace } as const]),
    ...(destination.workspace === "explore" ? [{ type: "lens", lens: "city" } as const] : []),
    ...(destination.relationPairId ? [{ type: "relationPair", relationPairId: destination.relationPairId } as const] : []),
    ...(destination.routeId ? [{ type: "route", routeId: destination.routeId } as const] : []),
    ...(destination.eraId ? [{ type: "era", eraId: destination.eraId } as const] : []),
    ...(result.kind === "actor" || destination.workspace === "explore" ? [] : [{ type: "focus", focusId: result.id } as const]),
    { type: "search", open: false },
  ];
  return {
    destination,
    destinationTitleId: `${destination.workspace}-title`,
    actions,
  };
}

export function lockDocumentScroll(style: Pick<CSSStyleDeclaration, "overflow">) {
  const previousOverflow = style.overflow;
  style.overflow = "hidden";
  return () => {
    style.overflow = previousOverflow;
  };
}

export function focusCommittedSearchDestination(
  destination: Pick<HTMLElement, "setAttribute" | "focus" | "scrollIntoView"> | null,
) {
  if (!destination) return false;
  destination.setAttribute("tabindex", "-1");
  destination.focus({ preventScroll: true });
  destination.scrollIntoView({ block: "nearest" });
  return true;
}

export function revealSearchOption(
  option: Pick<HTMLElement, "scrollIntoView"> | null,
) {
  if (!option) return false;
  option.scrollIntoView({ block: "nearest" });
  return true;
}

export function wrappedSearchDialogFocusTarget<T>(
  focusables: readonly T[],
  activeElement: T | null,
  shiftKey: boolean,
) {
  if (!focusables.length) return null;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (shiftKey && activeElement === first) return last;
  if (!shiftKey && activeElement === last) return first;
  return null;
}

export function graphResultKind(node: AtlasGraphNodeV1): SearchResult["kind"] {
  if (node.kind === "district") return "district";
  if (isGraphSource(node)) return "source";
  return "hub";
}

function structureResultMeta(node: (typeof atlasData.graph.nodes)[number]) {
  const district = graphNodeById.get(node.districtId)?.label ?? "지식 구역";
  if (node.kind === "district") return `${node.representedDocuments}개 기록 · 구역`;
  if (isGraphSource(node)) return `${district} · ${node.nameMode === "public_alias" ? "안전 별칭" : node.nameMode === "aggregate" ? "공개 안전 집계" : "승인 이름"}`;
  return `${district} · 고유 inbound ${node.gravity} · 출현 ${node.occurrences}`;
}

function dedupeKnowledge(results: SearchResult[]) {
  const labels = new Set<string>();
  return results.filter((result) => {
    const key = result.label.trim().toLocaleLowerCase("ko-KR");
    if (!key || labels.has(key)) return false;
    labels.add(key);
    return true;
  });
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
    const commandBar = document.querySelector<HTMLElement>(".command-bar");
    const workspaceShell = document.querySelector<HTMLElement>(".workspace-shell");
    const previousOverflow = document.body.style.overflow;
    let restoreDocumentScroll = () => {
      document.body.style.overflow = previousOverflow;
    };
    if (state.searchOpen) {
      returnFocusRef.current = document.activeElement as HTMLElement | null;
      setQuery("");
      setActiveIndex(0);
      claimModalInert(commandBar, "search");
      claimModalInert(workspaceShell, "search");
      restoreDocumentScroll = lockDocumentScroll(document.body.style);
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      releaseModalInert(commandBar, "search");
      releaseModalInert(workspaceShell, "search");
      const target = returnFocusRef.current;
      returnFocusRef.current = null;
      if (selectionCommittedRef.current) {
        selectionCommittedRef.current = false;
        requestAnimationFrame(() => {
          const destination = document.getElementById(destinationTitleRef.current);
          focusCommittedSearchDestination(destination);
        });
      } else {
        target?.focus();
      }
    }
    return () => {
      releaseModalInert(commandBar, "search");
      releaseModalInert(workspaceShell, "search");
      restoreDocumentScroll();
    };
  }, [state.searchOpen]);

  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko-KR");
    const roleResults = atlasData.agency.actors
      .filter((actor) => {
        if (!normalized) return true;
        const surface = atlasData.agency.surfaces.find((candidate) => candidate.id === actor.ownedSurfaceId)?.label ?? "";
        return [actor.label, actor.purpose, surface]
          .join(" ")
          .toLocaleLowerCase("ko-KR")
          .includes(normalized);
      })
      .map<SearchResult>((actor) => {
        const group = atlasData.agency.groups.find((candidate) => candidate.id === actor.groupId);
        const surface = atlasData.agency.surfaces.find((candidate) => candidate.id === actor.ownedSurfaceId)?.label ?? "책임 표면";
        return {
          id: actor.id,
          label: actor.label,
          meta: `${group?.label ?? "Operating Role"} · ${surface}`,
          kind: "actor",
          section: "roles",
        };
      });
    if (!normalized) {
      const knowledgeResults = [...atlasData.graph.nodes]
        .filter((node) => node.kind === "district" || isGraphHub(node))
        .sort((a, b) => (a.kind === "district" ? -1 : 0) - (b.kind === "district" ? -1 : 0) || b.gravity - a.gravity || a.label.localeCompare(b.label, "ko"))
        .slice(0, 12)
        .map<SearchResult>((node) => ({ id: node.id, label: node.label, meta: structureResultMeta(node), kind: graphResultKind(node), section: "knowledge" }));
      return [...roleResults, ...knowledgeResults].slice(0, 16);
    }
    const tokens = normalized.split(/\s+/).filter(Boolean);
    const structureResults = atlasData.graph.nodes
      .map((node) => {
        const district = graphNodeById.get(node.districtId)?.label ?? "";
        const label = node.label.toLocaleLowerCase("ko-KR");
        const haystack = `${label} ${district.toLocaleLowerCase("ko-KR")} ${node.kind}`;
        const score = tokens.reduce((total, token) => total + (label.startsWith(token) ? 8 : label.includes(token) ? 5 : haystack.includes(token) ? 2 : 0), 0);
        return { node, score };
      })
      .filter((item) => item.score >= tokens.length)
      .sort((a, b) => b.score - a.score || b.node.gravity - a.node.gravity || a.node.label.localeCompare(b.node.label, "ko"))
      .slice(0, 18)
      .map<SearchResult>(({ node }) => ({ id: node.id, label: node.label, meta: structureResultMeta(node), kind: graphResultKind(node), section: "knowledge" }));
    const knowledgeResults = dedupeKnowledge(structureResults);
    return [...roleResults, ...knowledgeResults].slice(0, 18);
  }, [query]);

  useLayoutEffect(() => {
    if (!state.searchOpen || !results.length) return;
    revealSearchOption(document.getElementById(`atlas-search-option-${activeIndex}`));
  }, [activeIndex, results, state.searchOpen]);

  if (!state.searchOpen) return null;

  const choose = (result: SearchResult) => {
    const plan = createSearchSelectionPlan(result, state.workspace, state.relationLayer);
    selectionCommittedRef.current = true;
    destinationTitleRef.current = plan.destinationTitleId;
    plan.actions.forEach(dispatch);
  };

  const activeOptionId = results[activeIndex]
    ? `atlas-search-option-${activeIndex}`
    : undefined;

  return (
    <div className="search-backdrop" role="presentation" onMouseDown={() => dispatch({ type: "search", open: false })}>
      <div
        ref={dialogRef}
        className="search-dialog"
        lang="ko"
        {...searchDialogAccessibility()}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const focusables = [...(dialogRef.current?.querySelectorAll<HTMLElement>(
            "button:not([disabled]):not([tabindex='-1']), input:not([disabled]), [tabindex]:not([tabindex='-1'])",
          ) ?? [])].filter((item) => item.offsetParent !== null);
          const wrappedTarget = wrappedSearchDialogFocusTarget(
            focusables,
            document.activeElement as HTMLElement | null,
            event.shiftKey,
          );
          if (!wrappedTarget) return;
          event.preventDefault();
          wrappedTarget.focus();
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
            placeholder="Operating Roles와 Knowledge 검색"
            aria-label="검색어"
            {...searchComboboxAccessibility(activeOptionId)}
          />
          <button className="icon-button" type="button" onClick={() => dispatch({ type: "search", open: false })} aria-label="검색 닫기">
            <X size={18} />
          </button>
        </div>
        <div className="search-context">Operating Roles와 Knowledge를 분리해 찾습니다. 역할은 Agency로, 공개 지식은 해당 workspace로 이동합니다.</div>
        <div className="search-results" id="atlas-search-results" role="listbox" aria-label="검색 결과">
          {results.map((result, index) => {
            const Icon = result.kind === "actor" ? Network : result.kind === "hub" ? CircleDot : result.kind === "document" || result.kind === "source" ? FileText : Folder;
            const destination = destinationFor(result, state.workspace, state.relationLayer);
            return (
              <div className="search-result-group" key={result.id}>
                {(index === 0 || results[index - 1]?.section !== result.section) && (
                  <p className="search-section-label" role="presentation">
                    {result.section === "roles" ? "Operating Roles" : "Knowledge"}
                  </p>
                )}
                <button
                  id={`atlas-search-option-${index}`}
                  type="button"
                  {...searchOptionAccessibility(index, activeIndex)}
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
              </div>
            );
          })}
          {!results.length && <p className="empty-state">일치하는 문서나 구역이 없습니다.</p>}
        </div>
      </div>
    </div>
  );
}
