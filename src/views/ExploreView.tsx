import { LocateFixed } from "lucide-react";
import { stratify, treemap, treemapSquarify } from "d3-hierarchy";
import { useMemo, type KeyboardEvent } from "react";
import { WorkspaceHeader } from "../components/WorkspaceHeader";
import { atlasData, entityById, hierarchyById, hierarchyFocusForDistrict } from "../data-runtime";
import { useElementSize } from "../hooks/useElementSize";
import { useAtlasState } from "../state";
import type { HierarchyNode } from "../types";
import { colorForDistrict as colorFor } from "../viz/palette";

function districtForFocus(focusId: string) {
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
  const largestDistrict = [...atlasData.structure.districts]
    .sort((a, b) => b.documentCount - a.documentCount || a.name.localeCompare(b.name))[0];

  return (
    <section className="workspace-view explore-view" aria-labelledby="explore-title">
      <WorkspaceHeader
        titleId="explore-title"
        eyebrow="CITY · PUBLIC KNOWLEDGE"
        title="Vault의 지식은 어느 구역에 모여 있는가"
        question="면적은 공개 기록 수, 경계는 집계된 지식 구역이다. 공개판은 City 한 가지 문법으로만 읽는다."
        answer={selectedDistrict
          ? `${selectedDistrict}을 선택했다. 가장 큰 공개 구역은 ${largestDistrict.name} ${largestDistrict.documentCount}개 기록이다.`
          : `${largestDistrict.name}이 ${largestDistrict.documentCount}개 기록으로 가장 큰 공개 구역이다.`}
        keyItems={[
          { label: "공개 기록 수", className: "key-area" },
          { label: "현재 선택", className: "key-focus" },
          { label: "집계 경계", className: "key-authority" },
        ]}
      />
      {state.mobileSibling ? <MobileCity /> : <CityBlocks />}
    </section>
  );
}

function CityBlocks() {
  const { state, dispatch } = useAtlasState();
  const { ref, width, height } = useElementSize<HTMLDivElement>();
  const layout = useMemo(() => {
    if (!width || !height) return [];
    const root = stratify<HierarchyNode>()
      .id((node) => node.id)
      .parentId((node) => node.parentId)(atlasData.structure.hierarchyNodes)
      .sum((node) => (node.kind === "document" ? node.value ?? 1 : 0))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    return treemap<HierarchyNode>()
      .size([width, height])
      .paddingOuter(10)
      .paddingTop((node) => (node.depth === 1 ? 36 : 4))
      .paddingInner(3)
      .tile(treemapSquarify.ratio(1.2))(root)
      .descendants()
      .filter((node) => node.depth === 1 || node.depth === 2);
  }, [height, width]);

  const focusedPath = entityById.get(state.focusId)?.path ?? hierarchyById.get(state.focusId)?.path ?? "";
  const selectedLayoutId = [...layout]
    .filter((node) => node.data.path && (focusedPath === node.data.path || focusedPath.startsWith(`${node.data.path}/`)))
    .sort((a, b) => b.depth - a.depth)[0]?.id;
  const selectedDistrictId = layout.find((node) => node.depth === 1 && (
    node.id === selectedLayoutId || focusedPath.startsWith(`${node.data.path}/`)
  ))?.id;
  const selectedDistrict = layout.find((node) => node.id === selectedDistrictId);
  const accessibleBranches = layout
    .filter((node) => node.depth === 2 && (!selectedDistrict || node.parent?.id === selectedDistrict.id))
    .slice(0, 12);

  const activate = (focusId: string | undefined) => {
    if (focusId) dispatch({ type: "focus", focusId });
  };
  const activateWithKeyboard = (event: KeyboardEvent, focusId: string | undefined) => {
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
            const district = node.data.path.split("/").slice(0, node.data.path.startsWith("Console/") ? 2 : 1).join("/");
            const selected = node.id === selectedLayoutId || node.id === selectedDistrictId;
            const previewed = state.previewId === node.id;
            const labelFits = w > 90 && h > 30;
            const mapLabel = compactMapLabel(node.data.label, Math.max(6, Math.floor((w - 18) / 7.2)));
            const authorityRatio = node.data.documentCount ? node.data.authorityL1L2 / node.data.documentCount : 0;
            return (
              <g
                key={node.id}
                className={`city-block depth-${node.depth}${selected ? " is-selected" : ""}${previewed ? " is-preview" : ""}`}
                transform={`translate(${node.x0},${node.y0})`}
                onPointerEnter={node.depth === 2 ? () => dispatch({ type: "preview", focusId: node.id! }) : undefined}
                onPointerLeave={node.depth === 2 ? () => dispatch({ type: "preview", focusId: null }) : undefined}
                onClick={node.depth === 2 ? () => activate(node.id) : undefined}
                {...cityMapNodeAccessibility(node.depth)}
                pointerEvents={node.depth === 1 ? "none" : undefined}
              >
                <rect
                  data-authority-count={node.data.authorityL1L2}
                  width={w}
                  height={h}
                  rx={node.depth === 1 ? 8 : 3}
                  fill={colorFor(district)}
                  fillOpacity={node.depth === 1 ? 0.82 : 0.96}
                  stroke={selected ? "#183b33" : "#f9fbf9"}
                  strokeWidth={selected ? 2.5 : node.depth === 1 ? 2 : 1}
                  filter={selected && node.depth === 1 ? "url(#focus-shadow)" : undefined}
                />
                {node.data.authorityL1L2 > 0 && (
                  <rect width={w} height={h} rx={node.depth === 1 ? 8 : 3} fill="url(#authority-grid)" opacity={selected ? 0.72 : Math.min(0.48, 0.16 + authorityRatio)} />
                )}
                {node.depth === 2 && labelFits && (
                  <text clipPath={`url(#city-label-clip-${index})`} x="8" y="17" className="branch-label">
                    <tspan>{mapLabel}</tspan>
                  </text>
                )}
                <title>{`${node.data.label} · ${node.data.documentCount}개 공개 기록`}</title>
              </g>
            );
          })}
          {layout.filter((node) => node.depth === 1).map((node) => {
            const labelWidth = Math.max(94, Math.min(node.x1 - node.x0 - 20, 210));
            return (
              <g
                key={`district-anchor-${node.id}`}
                className={`city-district-anchor${node.id === selectedDistrictId ? " is-selected" : ""}`}
                transform={`translate(${node.x0 + 10},${node.y0 + 6})`}
                onClick={() => activate(node.id)}
                onKeyDown={(event) => activateWithKeyboard(event, node.id)}
                {...cityDistrictAnchorAccessibility(node.data.label, node.data.documentCount)}
              >
                <rect width={labelWidth} height="30" rx="4" fill="#fbfdfa" fillOpacity="0.96" stroke={node.id === selectedDistrictId ? "#173c34" : "#a9c8bf"} />
                <text x="10" y="20" className="district-label">
                  <tspan>{compactMapLabel(node.data.label, 20)}</tspan>
                  <tspan className="map-count"> · {node.data.documentCount}</tspan>
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="city-accessible-index" aria-label="선택 구역의 하위 지식 가지">
        {accessibleBranches.map((node) => (
          <button key={node.id} type="button" onClick={() => activate(node.id)}>
            <span>{node.data.label}</span><small>{node.data.documentCount}개 공개 기록</small>
          </button>
        ))}
      </div>
      <div className="map-status-band" aria-label="지도 범위">
        <span>공개 기록 {atlasData.structure.archiveScope.active}개 (Public Records)</span>
        <span>지식 구역 {atlasData.structure.districts.length}개 (Knowledge Districts)</span>
        <span>공개 City 전용 보기</span>
      </div>
    </div>
  );
}

function MobileCity() {
  const { state, dispatch } = useAtlasState();
  const entity = entityById.get(state.focusId);
  const district = districtForFocus(state.focusId);
  const districtRecord = atlasData.structure.districts.find((item) => item.name === district)
    ?? [...atlasData.structure.districts].sort((a, b) => b.documentCount - a.documentCount)[0];
  const neighbors = entity ? atlasData.relation.neighborhoods[entity.id] ?? [] : [];
  const rankedItems = entity
    ? neighbors.slice(0, 6).map((neighbor) => entityById.get(neighbor.id)).filter(Boolean)
    : atlasData.structure.districts.slice(0, 6);

  return (
    <div className="mobile-sibling mobile-explore lens-city">
      <section className="mobile-selection">
        <span className="eyebrow">CITY · PUBLIC KNOWLEDGE</span>
        <h2>{entity?.title ?? hierarchyById.get(state.focusId)?.label ?? "Homi Vault"}</h2>
        <p>{districtRecord?.name ?? "전체"} · {districtRecord?.documentCount ?? 0}개 공개 기록</p>
        <button className="mobile-inspector-cue" type="button" onClick={() => dispatch({ type: "panel", panel: "inspector" })}>
          선택 해석 보기
        </button>
      </section>
      <section className="mobile-ranked-list">
        <h3>{entity ? "가까운 지식" : `${district ?? "전체"}의 주요 구역`}</h3>
        {rankedItems.map((item) => item && (
          <button
            key={item.id}
            type="button"
            onClick={() => dispatch({
              type: "focus",
              focusId: "path" in item
                ? item.id
                : hierarchyFocusForDistrict(item.name) ?? atlasData.structure.rootId,
            })}
          >
            <span><strong>{"title" in item ? item.title : item.name}</strong><small>{"path" in item ? `${item.district} · 공개 집계` : `${item.documentCount}개 공개 기록`}</small></span>
            <LocateFixed size="16" aria-hidden="true" />
          </button>
        ))}
      </section>
      <section className="mobile-district-map" aria-label="주요 지식 구역">
        <h3>지식 구역 (Knowledge Districts)</h3>
        <div>
          {atlasData.structure.districts.slice(0, 8).map((item) => (
            <button
              key={item.id}
              type="button"
              style={{ background: colorFor(item.name) }}
              onClick={() => dispatch({ type: "focus", focusId: hierarchyFocusForDistrict(item.name) ?? atlasData.structure.rootId })}
            >
              <strong>{item.name}</strong><small>{item.documentCount}개 공개 기록</small>
            </button>
          ))}
        </div>
      </section>
      <button className="mobile-theatre-action" type="button" onClick={() => dispatch({ type: "theatre", open: true })}>읽기 집중 보기</button>
    </div>
  );
}
