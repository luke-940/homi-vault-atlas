import { CornerDownLeft, FileText, Folder, Network, Search, X } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { atlasData, entityById } from "../data-runtime";
import { useAtlasState, type Action } from "../state";
import type { Workspace } from "../types";
import { claimModalInert, releaseModalInert } from "./tray-accessibility";

export type SearchResult = {
  id: string;
  label: string;
  meta: string;
  kind: "actor" | "document" | "folder" | "district";
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
      : [{ type: "workspace", workspace: destination.workspace } as const]),
    ...(destination.workspace === "explore" ? [{ type: "lens", lens: "city" } as const] : []),
    ...(destination.relationPairId ? [{ type: "relationPair", relationPairId: destination.relationPairId } as const] : []),
    ...(destination.routeId ? [{ type: "route", routeId: destination.routeId } as const] : []),
    ...(destination.eraId ? [{ type: "era", eraId: destination.eraId } as const] : []),
    ...(result.kind === "actor" ? [] : [{ type: "focus", focusId: result.id } as const]),
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

export function SearchPalette() {
  const { state, dispatch } = useAtlasState();
  const isPublicProfile = atlasData.publication.profile === "public";
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
      const knowledgeResults = atlasData.entity.entities
        .filter((entity) => entity.defaultPreload || entity.authority === "L1" || entity.authority === "L2")
        .slice(0, 10)
        .map<SearchResult>((entity) => ({
          id: entity.id,
          label: entity.title,
          meta: isPublicProfile
            ? `${entity.district} · ${entity.authority}`
            : `${entity.path} · ${entity.authority}`,
          kind: "document",
          section: "knowledge",
        }));
      return [...roleResults, ...knowledgeResults].slice(0, 16);
    }
    const tokens = normalized.split(/\s+/).filter(Boolean);
    const documents = atlasData.entity.entities
      .map((entity) => {
        const searchableFields = isPublicProfile
          ? [entity.title, entity.displayLabel, entity.district]
          : [entity.title, entity.path, ...entity.aliases, ...entity.tags];
        const haystack = searchableFields
          .join(" ")
          .toLocaleLowerCase("ko-KR");
        const score = tokens.reduce((total, token) => {
          if (entity.title.toLocaleLowerCase("ko-KR").startsWith(token)) return total + 8;
          if (entity.title.toLocaleLowerCase("ko-KR").includes(token)) return total + 5;
          if (entity.district.toLocaleLowerCase("ko-KR").includes(token)) return total + 3;
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
        meta: isPublicProfile
          ? `${entity.district} · ${entity.authority}`
          : `${entity.path} · ${entity.authority}`,
        kind: "document",
        section: "knowledge",
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
        meta: isPublicProfile
          ? `${node.documentCount}개 공개 기록 · 집계 구역`
          : `${node.documentCount}개 문서 · ${node.path || "Homi Vault"}`,
        kind: node.kind === "district" ? "district" : "folder",
        section: "knowledge",
      }));
    return [...roleResults, ...documents, ...folders].slice(0, 18);
  }, [isPublicProfile, query]);

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
            const Icon = result.kind === "actor" ? Network : result.kind === "document" ? FileText : Folder;
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
