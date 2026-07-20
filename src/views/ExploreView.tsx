import { ChevronRight, CircleDot, FileText, FolderTree, LocateFixed, Search, ShieldCheck } from "lucide-react";
import { hierarchy, treemap, treemapSquarify } from "d3-hierarchy";
import { useMemo, useState, type KeyboardEvent, type ReactNode, type UIEvent } from "react";
import { WorkspaceHeader } from "../components/WorkspaceHeader";
import { atlasData, entityById, hierarchyById, structureNodeById } from "../data-runtime";
import { useElementSize } from "../hooks/useElementSize";
import { useAtlasState } from "../state";
import { isStructuralHub, isStructureSourceLevel, resolveStructureNodeContext } from "../structure-navigation";
import type { AtlasStructureNodeV2 } from "../types";
import { colorForDistrict as colorFor } from "../viz/palette";

function projectedStructureNodes() {
  return atlasData.structure.nodes;
}

function districtForFocus(focusId: string) {
  const projected = structureNodeById.get(focusId);
  if (projected) {
    if (projected.kind === "district") return projected.label;
    return structureNodeById.get(projected.districtId)?.label ?? null;
  }
  const entity = entityById.get(focusId);
  if (entity) return entity.district;
  let node = hierarchyById.get(focusId);
  const visited = new Set<string>();
  while (node && !visited.has(node.id)) {
    if (node.kind === "district") return node.label;
    visited.add(node.id);
    node = node.parentId ? hierarchyById.get(node.parentId) : undefined;
  }
  return null;
}

function compactMapLabel(label: string, maxChars: number) {
  if (label === "Intelligence Layer" && maxChars < label.length) return "Intelligence";
  if (label.length <= maxChars) return label;
  return `${label.slice(0, Math.max(3, maxChars - 1))}…`;
}

export function cityMapNodeAccessibility(depth: number) {
  return {
    role: "presentation" as const,
    "aria-hidden": depth === 2 ? "true" as const : undefined,
  };
}

export function cityDistrictAnchorAccessibility(label: string, documentCount: number) {
  return {
    role: "button" as const,
    tabIndex: 0,
    "aria-label": `${label}, ${documentCount}개 문서`,
  };
}

export function ExploreView() {
  const { state } = useAtlasState();
  const selectedDistrict = districtForFocus(state.focusId);
  const districtNodes = atlasData.structure.nodes.filter((node) => node.kind === "district");
  const largestDistrict = [...districtNodes]
    .sort((a, b) => b.documentCount - a.documentCount || a.label.localeCompare(b.label, "ko"))[0];

  return (
    <section className="workspace-view explore-view" aria-labelledby="explore-title">
      <WorkspaceHeader
        titleId="explore-title"
        eyebrow="CITY · PUBLIC KNOWLEDGE"
        title="Vault의 지식은 어느 구역에 모여 있는가"
        question="면적은 프로필에서 표현되는 기록 수, 경계는 reconciliation을 통과한 지식 구역이다. 공개판은 City 한 가지 문법으로만 읽는다."
        answer={selectedDistrict
          ? `${selectedDistrict}을 선택했다. 가장 큰 표현 구역은 ${largestDistrict.label} ${largestDistrict.documentCount}개 기록이다.`
          : `${largestDistrict.label}이 ${largestDistrict.documentCount}개 기록으로 가장 큰 표현 구역이다.`}
        keyItems={[
          { label: "공개 기록 수", className: "key-area" },
          { label: "현재 선택", className: "key-focus" },
          { label: "집계 경계", className: "key-authority" },
        ]}
      />
      {state.mobileSibling ? <MobileCity /> : (
        <div className="explore-v74-experience">
          <ExploreStructureBrowser />
          <CityBlocks />
        </div>
      )}
    </section>
  );
}

export function resolveExploreStructureFocus(
  nodes: readonly AtlasStructureNodeV2[],
  focusId: string,
) {
  return resolveStructureNodeContext(nodes, focusId);
}

export function sourceNodesForHub(
  nodes: readonly AtlasStructureNodeV2[],
  hubId: string,
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  return nodes.filter((node) => {
    if (!isStructureSourceLevel(node)) return false;
    let cursor: AtlasStructureNodeV2 | undefined = node;
    const visited = new Set<string>();
    while (cursor?.parentId && !visited.has(cursor.id)) {
      visited.add(cursor.id);
      if (cursor.parentId === hubId) return true;
      const parent = nodeById.get(cursor.parentId);
      if (!parent || parent.kind === "district" || isStructuralHub(parent)) return false;
      cursor = parent;
    }
    return false;
  });
}

export function sourceTreeRowsForHub(
  nodes: readonly AtlasStructureNodeV2[],
  hubId: string,
) {
  const sources = sourceNodesForHub(nodes, hubId);
  const sourceIds = new Set(sources.map((node) => node.id));
  const childrenByParent = new Map<string, AtlasStructureNodeV2[]>();
  for (const source of sources) {
    const parentId = sourceIds.has(source.parentId ?? "") ? source.parentId! : hubId;
    const children = childrenByParent.get(parentId) ?? [];
    children.push(source);
    childrenByParent.set(parentId, children);
  }
  const compare = (left: AtlasStructureNodeV2, right: AtlasStructureNodeV2) => {
    const leftRank = left.kind === "project_stage" || left.kind === "signal_storyline" ? 0 : 1;
    const rightRank = right.kind === "project_stage" || right.kind === "signal_storyline" ? 0 : 1;
    return leftRank - rightRank
      || right.uniqueInboundDocuments - left.uniqueInboundDocuments
      || left.label.localeCompare(right.label, "ko");
  };
  const rows: Array<{ node: AtlasStructureNodeV2; depth: number }> = [];
  const visited = new Set<string>();
  const visit = (parentId: string, depth: number) => {
    for (const node of [...(childrenByParent.get(parentId) ?? [])].sort(compare)) {
      if (visited.has(node.id)) continue;
      visited.add(node.id);
      rows.push({ node, depth });
      visit(node.id, depth + 1);
    }
  };
  visit(hubId, 0);
  for (const node of [...sources].sort(compare)) {
    if (!visited.has(node.id)) rows.push({ node, depth: 0 });
  }
  return rows;
}

const virtualRowHeight = 54;

interface CityTreeDatum {
  id: string;
  label: string;
  documentCount: number;
  children?: CityTreeDatum[];
}

function StructureNodeList({
  nodes,
  selectedId,
  onChoose,
  render,
}: {
  nodes: AtlasStructureNodeV2[];
  selectedId?: string;
  onChoose: (node: AtlasStructureNodeV2) => void;
  render: (node: AtlasStructureNodeV2) => ReactNode;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const windowed = nodes.length > 40;
  const start = windowed ? Math.max(0, Math.floor(scrollTop / virtualRowHeight) - 3) : 0;
  const end = windowed ? Math.min(nodes.length, start + 12) : nodes.length;
  const visible = nodes.slice(start, end);
  const handleScroll = (event: UIEvent<HTMLDivElement>) => setScrollTop(event.currentTarget.scrollTop);
  return (
    <div className={windowed ? "explore-node-list is-windowed" : "explore-node-list"} onScroll={windowed ? handleScroll : undefined}>
      <div style={windowed ? { height: nodes.length * virtualRowHeight } : undefined}>
        {visible.map((node, offset) => (
          <button
            key={node.id}
            type="button"
            className={node.id === selectedId ? "is-selected" : ""}
            style={windowed ? { position: "absolute", top: (start + offset) * virtualRowHeight, height: virtualRowHeight } : undefined}
            onClick={() => onChoose(node)}
          >
            {render(node)}
          </button>
        ))}
      </div>
    </div>
  );
}

function ExploreStructureBrowser() {
  const { state, dispatch } = useAtlasState();
  const projected = useMemo(projectedStructureNodes, []);
  const [hubQuery, setHubQuery] = useState("");
  const districtNodes = projected
    .filter((node) => node.kind === "district")
    .sort((a, b) => b.documentCount - a.documentCount || a.label.localeCompare(b.label, "ko"));
  const focusNode = structureNodeById.get(state.focusId);
  const resolvedFocus = resolveExploreStructureFocus(projected, state.focusId);
  const selectedDistrict = structureNodeById.get(resolvedFocus.districtId ?? "") ?? districtNodes[0];
  const normalizedHubQuery = hubQuery.trim().toLocaleLowerCase("ko-KR");
  const hubs = projected
    .filter((node) => isStructuralHub(node))
    .filter((node) => !selectedDistrict || node.districtId === selectedDistrict.id)
    .filter((node) => !normalizedHubQuery || node.label.toLocaleLowerCase("ko-KR").includes(normalizedHubQuery))
    .sort((a, b) => b.uniqueInboundDocuments - a.uniqueInboundDocuments || b.inboundLinkOccurrences - a.inboundLinkOccurrences)
  const resolvedHub = structureNodeById.get(resolvedFocus.hubId ?? "");
  const selectedHub = resolvedHub && hubs.some((node) => node.id === resolvedHub.id) ? resolvedHub : hubs[0];
  const sourceRows = selectedHub ? sourceTreeRowsForHub(projected, selectedHub.id) : [];
  const sources = sourceRows.map((row) => row.node);
  const sourceDepthById = new Map(sourceRows.map((row) => [row.node.id, row.depth]));
  const scene = state.sceneId === "sources" ? "sources" : state.sceneId === "hubs" ? "hubs" : "districts";

  const chooseDistrict = (district: AtlasStructureNodeV2) => {
    dispatch({
      type: "journey",
      target: {
        workspace: "explore",
        sceneId: "hubs",
        focusId: district.id,
      },
    });
  };
  const chooseHub = (node: AtlasStructureNodeV2) => {
    dispatch({
      type: "journey",
      target: { workspace: "explore", sceneId: "sources", focusId: node.id },
    });
  };

  return (
    <section className="explore-level-browser" aria-label="구역에서 허브와 공개 원천까지 탐색">
      <header>
        <span className="eyebrow" lang="en">Three-level exploration</span>
        <p><strong>District</strong><ChevronRight size={13} aria-hidden="true" /><strong>Hub</strong><ChevronRight size={13} aria-hidden="true" /><strong>Public-safe source</strong></p>
      </header>
      <div className="explore-level-columns" data-level={scene}>
        <section className={scene === "districts" ? "is-active" : ""}>
          <h2><FolderTree size={16} aria-hidden="true" />구역</h2>
          <StructureNodeList nodes={districtNodes} selectedId={selectedDistrict?.id} onChoose={chooseDistrict} render={(district) => <>
            <i style={{ background: colorFor(district.label) }} />
            <span><strong>{district.label}</strong><small>{district.documentCount}개 기록</small></span>
            <ChevronRight size={14} aria-hidden="true" />
          </>} />
        </section>
        <section className={scene === "hubs" ? "is-active" : ""}>
          <h2><CircleDot size={16} aria-hidden="true" />중력 허브 <label><Search size={13} aria-hidden="true" /><span className="sr-only">허브 찾기</span><input value={hubQuery} onChange={(event) => setHubQuery(event.target.value)} placeholder="허브 찾기" /></label></h2>
          <StructureNodeList nodes={hubs} selectedId={selectedHub?.id} onChoose={chooseHub} render={(hub) => <>
            <span><strong>{hub.label}</strong><small>고유 inbound {hub.uniqueInboundDocuments} · 출현 {hub.inboundLinkOccurrences}</small></span>
            <ChevronRight size={14} aria-hidden="true" />
          </>} />
          {!hubs.length && <p className="explore-level-empty"><ShieldCheck size={15} />공개 이름으로 표현할 허브가 없어 구역 집계만 제공합니다.</p>}
        </section>
        <section className={scene === "sources" ? "is-active" : ""}>
          <h2><FileText size={16} aria-hidden="true" />공개 안전 원천</h2>
          <StructureNodeList nodes={sources} selectedId={state.focusId} onChoose={(source) => dispatch({ type: "focus", focusId: source.id })} render={(source) =>
            <span
              className={source.kind === "project_stage" || source.kind === "signal_storyline" ? "is-structure-step" : ""}
              style={{ paddingInlineStart: `${Math.min(sourceDepthById.get(source.id) ?? 0, 3) * 12}px` }}
            >
              <strong>{source.label}</strong>
              <small>{source.kind === "project_stage"
                ? "프로젝트 단계"
                : source.kind === "signal_storyline"
                  ? "신호 스토리라인"
                  : source.nameMode === "approved_name" || source.nameMode === "owner_name"
                    ? "승인 이름"
                    : "안전 별칭·집계"}</small>
            </span>
          } />
          {!sources.length && <p className="explore-level-empty"><ShieldCheck size={15} />이 허브에서 공개할 원천 이름이 없습니다. Owner Atlas의 내부 구조는 공개판에 추정해 넣지 않습니다.</p>}
        </section>
      </div>
    </section>
  );
}

function CityBlocks() {
  const { state, dispatch } = useAtlasState();
  const { ref, width, height } = useElementSize<HTMLDivElement>();
  const districts = useMemo(() => atlasData.structure.nodes
    .filter((node) => node.kind === "district")
    .sort((left, right) => right.documentCount - left.documentCount || left.label.localeCompare(right.label, "ko")), []);
  const layout = useMemo(() => {
    if (!width || !height) return [];
    const rootData: CityTreeDatum = {
      id: "atlas:v7.4:districts",
      label: "Homi Vault Atlas",
      documentCount: 0,
      children: districts.map((district) => ({
        id: district.id,
        label: district.label,
        documentCount: district.documentCount,
      })),
    };
    const root = hierarchy<CityTreeDatum>(rootData)
      .sum((node) => node.children?.length ? 0 : node.documentCount)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    return treemap<CityTreeDatum>()
      .size([width, height])
      .paddingOuter(10)
      .paddingInner(5)
      .tile(treemapSquarify.ratio(1.2))(root)
      .leaves();
  }, [districts, height, width]);

  const selectedDistrictLabel = districtForFocus(state.focusId);
  const selectedDistrictId = districts.find((district) => district.label === selectedDistrictLabel)?.id;
  const activate = (focusId: string) => {
    dispatch({ type: "journey", target: { workspace: "explore", sceneId: "hubs", focusId } });
  };
  const activateWithKeyboard = (event: KeyboardEvent, focusId: string) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    activate(focusId);
  };

  return (
    <div className="city-workspace-surface">
      <div className="map-surface city-map" ref={ref} data-testid="city-map">
        <svg width={width} height={height} role="group" aria-label="문서량 기준 Vault 도시 블록 지도">
          <defs>
            <pattern id="authority-grid" width="7" height="7" patternUnits="userSpaceOnUse">
              <path d="M0 7 L7 0" stroke="#1f5147" strokeOpacity="0.12" strokeWidth="1" />
            </pattern>
            <filter id="focus-shadow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="4" stdDeviation="7" floodColor="#2f8878" floodOpacity="0.28" />
            </filter>
            {layout.map((node, index) => (
              <clipPath id={`city-label-clip-${index}`} key={`clip-${node.id}`}>
                <rect x="4" y="3" width={Math.max(0, node.x1 - node.x0 - 8)} height={Math.max(0, node.y1 - node.y0 - 6)} rx="3" />
              </clipPath>
            ))}
          </defs>
          {layout.map((node, index) => {
            const w = Math.max(0, node.x1 - node.x0);
            const h = Math.max(0, node.y1 - node.y0);
            const selected = node.data.id === selectedDistrictId;
            const labelFits = w > 104 && h > 58;
            const mapLabel = compactMapLabel(node.data.label, Math.max(6, Math.floor((w - 18) / 7.2)));
            return (
              <g
                key={node.data.id}
                className={`city-block depth-1${selected ? " is-selected" : ""}`}
                transform={`translate(${node.x0},${node.y0})`}
                onClick={() => activate(node.data.id)}
                onKeyDown={(event) => activateWithKeyboard(event, node.data.id)}
                {...cityDistrictAnchorAccessibility(node.data.label, node.data.documentCount)}
              >
                <rect
                  width={w}
                  height={h}
                  rx="8"
                  fill={colorFor(node.data.label)}
                  fillOpacity="0.88"
                  stroke={selected ? "#183b33" : "#f9fbf9"}
                  strokeWidth={selected ? 2.5 : 2}
                  filter={selected ? "url(#focus-shadow)" : undefined}
                />
                <rect width={w} height={h} rx="8" fill="url(#authority-grid)" opacity={selected ? 0.48 : 0.2} />
                {labelFits && (
                  <text clipPath={`url(#city-label-clip-${index})`} x="12" y="24" className="district-label">
                    <tspan>{mapLabel} · {node.data.documentCount.toLocaleString("ko-KR")}</tspan>
                  </text>
                )}
                <title>{`${node.data.label} · ${node.data.documentCount}개 표현 기록`}</title>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="map-status-band" aria-label="지도 범위">
        <span>표현 범위 {(atlasData.inventory.namedCount + atlasData.inventory.aggregateCount).toLocaleString("ko-KR")}개 (Represented)</span>
        <span>전체 Markdown {atlasData.inventory.physicalMarkdownCount.toLocaleString("ko-KR")}개</span>
        <span>지식 구역 {districts.length}개 (Knowledge Districts)</span>
        <span>공개 City 전용 보기</span>
      </div>
    </div>
  );
}

function MobileCity() {
  const { state, dispatch } = useAtlasState();
  const entity = entityById.get(state.focusId);
  const focusNode = structureNodeById.get(state.focusId);
  const district = districtForFocus(state.focusId);
  const districtNodes = atlasData.structure.nodes
    .filter((node) => node.kind === "district")
    .sort((left, right) => right.documentCount - left.documentCount || left.label.localeCompare(right.label, "ko"));
  const districtRecord = districtNodes.find((item) => item.label === district) ?? districtNodes[0];
  const rankedItems = atlasData.structure.nodes
    .filter((node) => isStructuralHub(node) && node.districtId === districtRecord?.id)
    .sort((left, right) => right.uniqueInboundDocuments - left.uniqueInboundDocuments || right.inboundLinkOccurrences - left.inboundLinkOccurrences)
    .slice(0, 8);

  return (
    <div className="mobile-sibling mobile-explore lens-city">
      <section className="mobile-selection">
        <span className="eyebrow">CITY · PUBLIC KNOWLEDGE</span>
        <h2>{focusNode?.label ?? entity?.displayLabel ?? districtRecord?.label ?? "Homi Vault"}</h2>
        <p>{districtRecord?.label ?? "전체"} · {districtRecord?.documentCount ?? 0}개 표현 기록</p>
        <button className="mobile-inspector-cue" type="button" onClick={() => dispatch({ type: "panel", panel: "inspector" })}>
          선택 해석 보기
        </button>
      </section>
      <ExploreStructureBrowser />
      <section className="mobile-ranked-list">
        <h3>{`${district ?? "전체"}의 중력 허브`}</h3>
        {rankedItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => dispatch({ type: "journey", target: { workspace: "explore", sceneId: "sources", focusId: item.id } })}
          >
            <span><strong>{item.label}</strong><small>고유 inbound {item.uniqueInboundDocuments} · 출현 {item.inboundLinkOccurrences}</small></span>
            <LocateFixed size="16" aria-hidden="true" />
          </button>
        ))}
      </section>
      <section className="mobile-district-map" aria-label="주요 지식 구역">
        <h3>지식 구역 (Knowledge Districts)</h3>
        <div>
          {districtNodes.map((item) => (
            <button
              key={item.id}
              type="button"
              style={{ background: colorFor(item.label) }}
              onClick={() => dispatch({ type: "journey", target: { workspace: "explore", sceneId: "hubs", focusId: item.id } })}
            >
              <strong>{item.label}</strong><small>{item.documentCount}개 표현 기록</small>
            </button>
          ))}
        </div>
      </section>
      <button className="mobile-theatre-action" type="button" onClick={() => dispatch({ type: "theatre", open: true })}>읽기 집중 보기</button>
    </div>
  );
}
