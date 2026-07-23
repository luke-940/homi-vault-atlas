import { CircleDot, CornerDownLeft, FileText, Folder, GitBranch, Network, Search, Star, X } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { atlasData, entityById, graphNodeById } from "../data-runtime";
import { useAtlasState, type Action } from "../state";
import { isGraphHub, isGraphSource } from "../graph-navigation";
import {
  canonicalGraphNodeLabel,
  graphNodeKindLabel,
  graphNodeLabel,
  humanReadableKnowledgeLabel,
  movementKindLabel,
  protagonistRoleLabel,
} from "../graph/model";
import type { AtlasGraphNodeV1, Workspace } from "../types";
import { claimModalInert, releaseModalInert } from "./tray-accessibility";

export type SearchResult = {
  id: string;
  label: string;
  meta: string;
  kind: "actor" | "document" | "folder" | "district" | "hub" | "source" | "protagonist" | "change";
  section: "protagonists" | "knowledge" | "roles" | "changes";
};

export type SearchDestination = {
  workspace: Workspace;
  label: string;
  reason: string;
  routeId?: string;
  eraId?: number;
  relationPairId?: string;
  actorId?: string;
  changeId?: string;
  sceneId?: string;
};

const searchSectionLabels = {
  protagonists: "지식의 주인공",
  knowledge: "지식 그래프",
  roles: "운영 역할",
  changes: "검증된 변화",
} as const satisfies Record<SearchResult["section"], string>;

function strongestPairForDistrict(district: string, layer: "wikilink" | "typed" | "route") {
  return atlasData.relation.matrix
    .filter((pair) => pair.source === district || pair.target === district)
    .filter((pair) => pair[layer] > 0)
    .sort((a, b) => b[layer] - a[layer] || a.id.localeCompare(b.id))[0];
}

function searchRouteLabel(route: (typeof atlasData.flow.routes)[number]) {
  const nodes = route.stations
    .map((station) => station.entityId ? graphNodeById.get(station.entityId) : undefined)
    .filter((node): node is AtlasGraphNodeV1 => Boolean(node));
  const first = nodes[0];
  const last = nodes.at(-1);
  return first && last && first.id !== last.id
    ? `${graphNodeLabel(first)} → ${graphNodeLabel(last)}`
    : humanReadableKnowledgeLabel(route.label);
}

export function destinationFor(result: SearchResult, workspace: Workspace, layer: "wikilink" | "typed" | "route"): SearchDestination {
  if (result.kind === "change") {
    return {
      workspace: "time",
      sceneId: "version-evolution",
      changeId: result.id,
      label: "Time에서 변화 보기",
      reason: "검증된 버전 변화는 Time의 Version Evolution에서 엽니다.",
    };
  }
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
      reason: "방향 그래프에서 실제 위치와 관계를 엽니다.",
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
    if (route) return { workspace, routeId: route.id, label: "흐름에서 경로 보기", reason: `${searchRouteLabel(route)}에 포함된 문서로 현재 선택을 유지합니다.` };
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
      : result.kind === "change"
        ? [{
            type: "journey",
            target: {
              workspace: "time",
              sceneId: "version-evolution",
              changeId: destination.changeId ?? result.id,
            },
          } as const]
      : destination.workspace === "explore"
        ? [{ type: "journey", target: { workspace: "explore", sceneId: destination.sceneId ?? "graph", focusId: result.id } } as const]
        : [{ type: "workspace", workspace: destination.workspace } as const]),
    ...(destination.workspace === "explore" ? [{ type: "lens", lens: "city" } as const] : []),
    ...(destination.relationPairId ? [{ type: "relationPair", relationPairId: destination.relationPairId } as const] : []),
    ...(destination.routeId ? [{ type: "route", routeId: destination.routeId } as const] : []),
    ...(destination.eraId ? [{ type: "era", eraId: destination.eraId } as const] : []),
    ...(result.kind === "actor" || result.kind === "change" || destination.workspace === "explore" ? [] : [{ type: "focus", focusId: result.id } as const]),
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
  const districtNode = graphNodeById.get(node.districtId);
  const district = districtNode ? graphNodeLabel(districtNode) : "지식 구역";
  if (node.kind === "district") return `${node.representedDocuments}개 기록 · 구역`;
  if (isGraphSource(node)) return `${district} · ${atlasData.graph.profile === "atlas-owner" ? "실제 허용 제목" : node.nameMode === "public_alias" ? "안전 별칭" : node.nameMode === "aggregate" ? "공개 안전 집계" : "승인 이름"}`;
  return `${district} · ${graphNodeKindLabel(node.kind)} · 참조한 고유 문서 ${node.gravity} · 전체 참조 ${node.occurrences}회`;
}

function dedupeKnowledge(results: SearchResult[]) {
  const stableResults = new Set<string>();
  return results.filter((result) => {
    const key = `${result.section}:${result.id}`;
    if (!result.label.trim() || stableResults.has(key)) return false;
    stableResults.add(key);
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
    const tokens = normalized.split(/\s+/).filter(Boolean);
    const matchScore = (label: string, haystack: string) => tokens.reduce(
      (total, token) => total + (label.startsWith(token) ? 8 : label.includes(token) ? 5 : haystack.includes(token) ? 2 : 0),
      0,
    );
    const protagonistResults = atlasData.meaning.protagonists
      .map((protagonist) => {
        const node = graphNodeById.get(protagonist.nodeId);
        if (!node) return null;
        const label = graphNodeLabel(node);
        const normalizedLabel = label.toLocaleLowerCase("ko-KR");
        const haystack = `${normalizedLabel} ${canonicalGraphNodeLabel(node).toLocaleLowerCase("ko-KR")} ${protagonist.role} ${protagonist.thesis.toLocaleLowerCase("ko-KR")}`;
        const score = normalized ? matchScore(normalizedLabel, haystack) : protagonist.metrics.gravity;
        if (normalized && score < tokens.length) return null;
        return {
          result: {
            id: node.id,
            label,
            meta: `${protagonistRoleLabel(protagonist.role)} · 들어오는 참조 ${protagonist.metrics.incomingCount} · 나가는 참조 ${protagonist.metrics.outgoingCount}`,
            kind: "protagonist",
            section: "protagonists",
          } satisfies SearchResult,
          score,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((left, right) => right.score - left.score || left.result.label.localeCompare(right.result.label, "ko"))
      .slice(0, normalized ? 8 : 5)
      .map((item) => item.result);
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
          meta: `${group?.label ?? "운영 역할"} · ${surface}`,
          kind: "actor",
          section: "roles",
        };
      });
    const changeResults = atlasData.meaning.movements
      .filter((movement) => !normalized || [
        movement.label,
        movement.kind,
        movement.caveat,
      ].join(" ").toLocaleLowerCase("ko-KR").includes(normalized))
      .slice(0, normalized ? 6 : 3)
      .map<SearchResult>((movement) => {
        const node = movement.nodeIds.map((nodeId) => graphNodeById.get(nodeId)).find(Boolean);
        return {
          id: movement.id,
          label: node ? graphNodeLabel(node) : humanReadableKnowledgeLabel(movement.label),
          meta: `${movementKindLabel(movement.kind)} · 검증된 버전 변화`,
          kind: "change",
          section: "changes",
        };
      });
    if (!normalized) {
      const knowledgeResults = [...atlasData.graph.nodes]
        .filter((node) => node.kind === "district" || isGraphHub(node))
        .sort((a, b) => (a.kind === "district" ? -1 : 0) - (b.kind === "district" ? -1 : 0) || b.gravity - a.gravity || a.label.localeCompare(b.label, "ko"))
        .slice(0, 12)
        .map<SearchResult>((node) => ({ id: node.id, label: graphNodeLabel(node), meta: structureResultMeta(node), kind: graphResultKind(node), section: "knowledge" }));
      return [...protagonistResults, ...knowledgeResults, ...roleResults, ...changeResults].slice(0, 24);
    }
    const structureResults = atlasData.graph.nodes
      .map((node) => {
        const district = graphNodeById.get(node.districtId)?.label ?? "";
        const displayLabel = graphNodeLabel(node);
        const label = displayLabel.toLocaleLowerCase("ko-KR");
        const canonical = canonicalGraphNodeLabel(node).toLocaleLowerCase("ko-KR");
        const haystack = `${label} ${atlasData.graph.profile === "atlas-owner" ? canonical : ""} ${district.toLocaleLowerCase("ko-KR")} ${node.kind}`;
        const score = matchScore(label, haystack);
        return { node, score };
      })
      .filter((item) => item.score >= tokens.length)
      .sort((a, b) => b.score - a.score || b.node.gravity - a.node.gravity || a.node.label.localeCompare(b.node.label, "ko"))
      .slice(0, 18)
      .map<SearchResult>(({ node }) => ({ id: node.id, label: graphNodeLabel(node), meta: structureResultMeta(node), kind: graphResultKind(node), section: "knowledge" }));
    const knowledgeResults = dedupeKnowledge(structureResults);
    return [...protagonistResults, ...knowledgeResults, ...roleResults, ...changeResults].slice(0, 28);
  }, [query]);

  useLayoutEffect(() => {
    if (!state.searchOpen || !results.length) return;
    revealSearchOption(document.getElementById(`atlas-search-option-${activeIndex}`));
  }, [activeIndex, results, state.searchOpen]);

  useLayoutEffect(() => {
    if (!state.searchOpen) return;
    const result = results[activeIndex];
    dispatch({ type: "preview", focusId: result && graphNodeById.has(result.id) ? result.id : null });
    dispatch({ type: "previewChange", changeId: result?.kind === "change" ? result.id : null });
    return () => {
      dispatch({ type: "preview", focusId: null });
      dispatch({ type: "previewChange", changeId: null });
    };
  }, [activeIndex, dispatch, results, state.searchOpen]);

  if (!state.searchOpen) return null;

  const choose = (result: SearchResult) => {
    const plan = createSearchSelectionPlan(result, state.workspace, state.relationLayer);
    selectionCommittedRef.current = true;
    destinationTitleRef.current = plan.destinationTitleId;
    dispatch({ type: "preview", focusId: null });
    dispatch({ type: "previewChange", changeId: null });
    plan.actions.forEach(dispatch);
  };

  const activeOptionId = results[activeIndex]
    ? `atlas-search-option-${activeIndex}`
    : undefined;
  const resultStrata = results.reduce<Array<{
    section: SearchResult["section"];
    entries: Array<{ result: SearchResult; index: number }>;
  }>>((strata, result, index) => {
    const current = strata.at(-1);
    if (current?.section === result.section) {
      current.entries.push({ result, index });
      return strata;
    }
    strata.push({ section: result.section, entries: [{ result, index }] });
    return strata;
  }, []);

  return (
    <div
      className="search-backdrop search-command-backdrop"
      role="presentation"
      data-workspace={state.workspace}
      onMouseDown={() => dispatch({ type: "search", open: false })}
    >
      <div
        ref={dialogRef}
        className="search-dialog search-command-veil"
        lang="ko"
        {...searchDialogAccessibility()}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            dispatch({ type: "search", open: false });
            return;
          }
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
        <header className="search-command-ribbon">
          <div className="search-input-row search-command-query">
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
                }
              }}
              placeholder="주인공 · 지식 · 운영 역할 · 변화 검색"
              aria-label="검색어"
              {...searchComboboxAccessibility(activeOptionId)}
            />
            <button className="icon-button" type="button" onClick={() => dispatch({ type: "search", open: false })} aria-label="검색 닫기">
              <X size={18} />
            </button>
          </div>
          <div className="search-context search-command-profile">
            <span>주인공 · 지식 그래프 · 운영 역할 · 변화를 분리합니다.</span>
            <span>
              {atlasData.graph.profile === "atlas-owner"
                ? "Owner 허용 제목 전체를 검색하고 Enter에서만 이동을 확정합니다."
                : "공개 승인 이름과 안전 별칭만 검색합니다."}
            </span>
          </div>
        </header>
        <div
          className="search-results search-result-strata"
          id="atlas-search-results"
          role="listbox"
          aria-label="검색 결과"
        >
          {resultStrata.map((stratum) => {
            const headingId = `atlas-search-section-${stratum.section}`;
            return (
              <section
                className={`search-result-stratum search-result-stratum-${stratum.section}`}
                role="group"
                aria-labelledby={headingId}
                key={stratum.section}
              >
                <header className="search-result-stratum-header">
                  <p className="search-section-label" id={headingId}>
                    {searchSectionLabels[stratum.section]}
                  </p>
                  <span className="search-result-stratum-count" aria-hidden="true">
                    {stratum.entries.length}
                  </span>
                </header>
                <div className="search-result-list">
                  {stratum.entries.map(({ result, index }) => {
                    const Icon = result.kind === "actor"
                      ? Network
                      : result.kind === "protagonist"
                        ? Star
                        : result.kind === "change"
                          ? GitBranch
                          : result.kind === "hub"
                            ? CircleDot
                            : result.kind === "document" || result.kind === "source"
                              ? FileText
                              : Folder;
                    const destination = destinationFor(result, state.workspace, state.relationLayer);
                    return (
                      <button
                        id={`atlas-search-option-${index}`}
                        type="button"
                        {...searchOptionAccessibility(index, activeIndex)}
                        aria-label={`${result.label}. ${result.meta}. ${destination.label}`}
                        className={index === activeIndex ? "search-result is-active" : "search-result"}
                        title={destination.reason}
                        onFocus={() => setActiveIndex(index)}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => choose(result)}
                        key={`${result.section}:${result.id}`}
                      >
                        <Icon size={17} aria-hidden="true" />
                        <span className="search-result-copy">
                          <strong>{result.label}</strong>
                          <small>{result.meta}</small>
                        </span>
                        {index === activeIndex && (
                          <span className="search-result-action" aria-hidden="true">
                            <span>{destination.label}</span>
                            <CornerDownLeft size={15} aria-hidden="true" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
          {!results.length && <p className="empty-state" role="status">일치하는 문서나 구역이 없습니다.</p>}
        </div>
      </div>
    </div>
  );
}
