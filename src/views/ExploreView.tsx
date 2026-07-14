import {
  ChevronLeft,
  CircleDot,
  LayoutGrid,
  ListTree,
  LocateFixed,
  Search,
} from "lucide-react";
import {
  forceCollide,
  forceSimulation,
  forceX,
  forceY,
  hierarchy,
  pack,
  stratify,
  tree,
  treemap,
  treemapSquarify,
} from "d3";
import { useMemo, useState, type KeyboardEvent } from "react";
import { WorkspaceHeader } from "../components/WorkspaceHeader";
import { atlasData, entityById, hierarchyById, hierarchyFocusForDistrict } from "../data";
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

function isDescendantOf(node: HierarchyNode, ancestorId: string) {
  let cursor: HierarchyNode | undefined = node;
  const visited = new Set<string>();
  while (cursor && !visited.has(cursor.id)) {
    if (cursor.id === ancestorId) return true;
    visited.add(cursor.id);
    cursor = cursor.parentId ? hierarchyById.get(cursor.parentId) : undefined;
  }
  return false;
}

function compactMapLabel(label: string, maxChars: number) {
  if (label === "Intelligence Layer" && maxChars < label.length) return "Intelligence";
  if (label.length <= maxChars) return label;
  return `${label.slice(0, Math.max(3, maxChars - 1))}…`;
}

function constellationDistrictLabel(label: string) {
  if (label === "Intelligence Layer") return "Intelligence";
  return label.split("/").at(-1) ?? label;
}

const structureLenses = [
  { id: "city", label: "도시 블록", icon: LayoutGrid },
  { id: "lineage", label: "계보", icon: ListTree },
  { id: "constellation", label: "성운", icon: CircleDot },
] as const;

export function ExploreView() {
  const { state, dispatch } = useAtlasState();
  const selectedEntity = entityById.get(state.focusId);
  const selectedNode = hierarchyById.get(state.focusId);
  const selectedDistrict = districtForFocus(state.focusId);
  const largestDistrict = atlasData.structure.districts[0];
  const lensCopy = state.lens === "city"
    ? {
        eyebrow: "문서량과 포함 구조",
        title: "Vault의 지식은 어느 구역에 모여 있는가",
        question: "면적은 문서량, 경계는 폴더 계층이다. 큰 구역과 그 안의 주요 가지를 비교한다.",
        answer: selectedDistrict
          ? `${selectedDistrict}을 선택했다. 전체에서 가장 큰 구역은 ${largestDistrict.name} ${largestDistrict.documentCount}개 문서다.`
          : `${largestDistrict.name}이 ${largestDistrict.documentCount}개 문서로 가장 큰 구역이다.`,
        keyItems: [
          { label: "문서량", className: "key-area" },
          { label: "현재 선택", className: "key-focus" },
          { label: "L1/L2 포함", className: "key-authority" },
        ],
      }
    : state.lens === "lineage"
      ? {
          eyebrow: "폴더 계보와 문서 위치",
          title: "선택한 문서는 어느 가지에서 내려오는가",
          question: "왼쪽에서 오른쪽으로 root, 상위 가지, 문서 leaf를 따라가며 형제 가지와 문서군을 함께 읽는다.",
          answer: `${selectedEntity?.displayLabel ?? selectedNode?.label ?? "Homi Vault"}은 ${selectedEntity?.path ?? selectedNode?.path ?? "Vault root"}에 있다.`,
          keyItems: [
            { label: "상위 계보", className: "key-area" },
            { label: "현재 선택", className: "key-focus" },
            { label: "문서 leaf", className: "key-authority" },
          ],
        }
      : {
          eyebrow: "문서군 분포와 집중도",
          title: "각 구역은 몇 개의 문서군으로 퍼져 있는가",
          question: "원 크기는 문서량, 내부 원은 하위 폴더 문서군과 직접 문서의 비중을 나타낸다. 도시 블록과 다른 질문을 읽는다.",
          answer: `${selectedDistrict ?? largestDistrict.name}의 문서군 분포를 보고 있다. 원 크기는 문서량이다.`,
          keyItems: [
            { label: "구역 문서량", className: "key-area" },
            { label: "문서군 분포", className: "key-focus" },
            { label: "선택 구역", className: "key-authority" },
          ],
        };
  const handleLensKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = structureLenses.length - 1;
    let nextIndex = index;
    if (event.key === "ArrowRight") nextIndex = index === last ? 0 : index + 1;
    else if (event.key === "ArrowLeft") nextIndex = index === 0 ? last : index - 1;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = last;
    else return;
    event.preventDefault();
    const next = structureLenses[nextIndex];
    dispatch({ type: "lens", lens: next.id });
    requestAnimationFrame(() => document.getElementById(`structure-lens-tab-${next.id}`)?.focus());
  };
  return (
    <section className="workspace-view explore-view" aria-labelledby="explore-title">
      <WorkspaceHeader
        titleId="explore-title"
        eyebrow={lensCopy.eyebrow}
        title={lensCopy.title}
        question={lensCopy.question}
        answer={lensCopy.answer}
        keyItems={lensCopy.keyItems}
        controls={
          <div className="view-switch" role="tablist" aria-label="구조 렌즈">
            {structureLenses.map((item, index) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  id={`structure-lens-tab-${item.id}`}
                  type="button"
                  role="tab"
                  aria-selected={state.lens === item.id}
                  aria-controls="explore-lens-panel"
                  tabIndex={state.lens === item.id ? 0 : -1}
                  className={state.lens === item.id ? "is-active" : ""}
                  onClick={() => dispatch({ type: "lens", lens: item.id })}
                  onKeyDown={(event) => handleLensKey(event, index)}
                >
                  <Icon size={16} /> {item.label}
                </button>
              );
            })}
          </div>
        }
      />
      <div
        className="desktop-visual-surface"
        id="explore-lens-panel"
        role="tabpanel"
        aria-labelledby={`structure-lens-tab-${state.lens}`}
      >
        {state.lens === "city" && <CityBlocks />}
        {state.lens === "lineage" && <LineageRadial />}
        {state.lens === "constellation" && <Constellation />}
      </div>
      <MobileExplore />
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
    const layoutRoot = treemap<HierarchyNode>()
      .size([width, height])
      .paddingOuter(10)
      .paddingTop((node) => (node.depth === 1 ? 34 : 4))
      .paddingInner(3)
      .tile(treemapSquarify.ratio(1.2))(root);
    return layoutRoot.descendants().filter((node) => node.depth === 1 || node.depth === 2);
  }, [height, width]);
  const focusedPath = entityById.get(state.focusId)?.path ?? hierarchyById.get(state.focusId)?.path ?? "";
  const selectedLayoutId = [...layout]
    .filter((node) => node.data.path && (focusedPath === node.data.path || focusedPath.startsWith(`${node.data.path}/`)))
    .sort((a, b) => b.depth - a.depth)[0]?.id;
  const selectedLayout = layout.find((node) => node.id === selectedLayoutId);
  const focusedEntity = entityById.get(state.focusId);

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
                <rect x={4} y={3} width={Math.max(0, node.x1 - node.x0 - 8)} height={Math.max(0, node.y1 - node.y0 - 6)} rx="3" />
              </clipPath>
            ))}
          </defs>
          {layout.map((node, index) => {
          const x = node.x0;
          const y = node.y0;
          const w = Math.max(0, node.x1 - node.x0);
          const h = Math.max(0, node.y1 - node.y0);
          const district = node.data.path.split("/").slice(0, node.data.path.startsWith("Console/") ? 2 : 1).join("/");
          const selected = node.id === selectedLayoutId;
          const previewed = state.previewId === node.id;
          const labelFits = w > 90 && h > 30;
          const labelBudget = Math.max(6, Math.floor((w - (node.depth === 1 ? 28 : 16)) / 7.2));
          const mapLabel = compactMapLabel(node.data.label, labelBudget);
          const authorityRatio = node.data.documentCount
            ? node.data.authorityL1L2 / node.data.documentCount
            : 0;
          return (
            <g
              key={node.id}
              className={`city-block depth-${node.depth}${selected ? " is-selected" : ""}${previewed ? " is-preview" : ""}`}
              transform={`translate(${x},${y})`}
              onPointerEnter={node.depth === 2 ? () => dispatch({ type: "preview", focusId: node.id! }) : undefined}
              onPointerLeave={node.depth === 2 ? () => dispatch({ type: "preview", focusId: null }) : undefined}
              onClick={node.depth === 2 ? () => dispatch({ type: "focus", focusId: node.id! }) : undefined}
              role={node.depth === 2 ? "button" : "presentation"}
              tabIndex={node.depth === 2 ? -1 : undefined}
              aria-label={`${node.data.label}, ${node.data.documentCount}개 문서`}
              onKeyDown={(event) => {
                if (node.depth === 2 && (event.key === "Enter" || event.key === " ")) {
                  dispatch({ type: "focus", focusId: node.id! });
                }
              }}
              pointerEvents={node.depth === 1 ? "none" : undefined}
            >
              <rect data-authority-count={node.data.authorityL1L2} width={w} height={h} rx={node.depth === 1 ? 8 : 3} fill={colorFor(district)} fillOpacity={node.depth === 1 ? 0.82 : 0.96} stroke={selected ? "#183b33" : "#f9fbf9"} strokeWidth={selected ? 2.5 : node.depth === 1 ? 2 : 1} filter={selected && node.depth === 1 ? "url(#focus-shadow)" : undefined} />
              {node.data.authorityL1L2 > 0 && <rect width={w} height={h} rx={node.depth === 1 ? 8 : 3} fill="url(#authority-grid)" opacity={selected ? 0.72 : Math.min(0.48, 0.16 + authorityRatio)} />}
              {node.depth === 2 && labelFits && (
                <text clipPath={`url(#city-label-clip-${index})`} x={8} y={16} className="branch-label">
                  <tspan>{mapLabel}</tspan>
                </text>
              )}
              <title>{`${node.data.label} · ${node.data.documentCount}개 문서`}</title>
            </g>
          );
          })}
          {layout.filter((node) => node.depth === 1).map((node) => {
            const widthBudget = Math.max(74, Math.min(node.x1 - node.x0 - 20, 190));
            const label = compactMapLabel(node.data.label, Math.max(6, Math.floor((widthBudget - 16) / 7.4)));
            return (
              <g
                key={`district-anchor-${node.id}`}
                className={`city-district-anchor${node.id === selectedLayoutId ? " is-selected" : ""}${state.previewId === node.id ? " is-preview" : ""}`}
                transform={`translate(${node.x0 + 10},${node.y0 + 6})`}
                onPointerEnter={() => dispatch({ type: "preview", focusId: node.id! })}
                onPointerLeave={() => dispatch({ type: "preview", focusId: null })}
                onFocus={() => dispatch({ type: "preview", focusId: node.id! })}
                onBlur={() => dispatch({ type: "preview", focusId: null })}
                onClick={() => dispatch({ type: "focus", focusId: node.id! })}
                role="button"
                tabIndex={0}
                aria-label={`${node.data.label}, ${node.data.documentCount}개 문서`}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    dispatch({ type: "focus", focusId: node.id! });
                  }
                }}
              >
                <rect width={widthBudget} height={28} rx={4} fill="#fbfdfa" fillOpacity={0.94} stroke={node.id === selectedLayoutId ? "#183b33" : "#a9c8bf"} strokeWidth={node.id === selectedLayoutId ? 1.8 : 1} />
                <text x={9} y={18} className="district-label">
                  <tspan>{label}</tspan>
                  <tspan className="map-count"> · {node.data.documentCount}</tspan>
                </text>
                <title>{`${node.data.label} · ${node.data.documentCount}개 문서`}</title>
              </g>
            );
          })}
          {focusedEntity && selectedLayout && (() => {
            const markerX = selectedLayout.x0 + 14;
            const markerY = Math.max(selectedLayout.y0 + 46, selectedLayout.y1 - 18);
            return (
              <g className="city-focus-locator" transform={`translate(${markerX},${markerY})`} pointerEvents="none">
                <circle r="5" fill="#fff" stroke="#173c34" strokeWidth="2.5" />
                <text x="11" y="4" className="branch-label">
                  <tspan>{focusedEntity.displayLabel}</tspan>
                  <tspan className="map-count"> · 이 구역 안</tspan>
                </text>
                <title>{`${focusedEntity.title} · ${focusedEntity.path}`}</title>
              </g>
            );
          })()}
        </svg>
      </div>
      <div className="map-status-band" aria-label="지도 범위">
        <span>활성 {atlasData.structure.archiveScope.active}</span>
        <span>보관 {atlasData.structure.archiveScope.archive} 별도</span>
        <span>{atlasData.structure.districts.length}개 구역</span>
      </div>
    </div>
  );
}

function anchorForFocus(focusId: string) {
  let anchor = hierarchyById.get(focusId);
  if (anchor?.kind === "document" && anchor.parentId) anchor = hierarchyById.get(anchor.parentId);
  if (!anchor || anchor.kind === "document") anchor = hierarchyById.get(atlasData.structure.rootId);
  return anchor!;
}

function documentsForAnchor(anchor: HierarchyNode) {
  return atlasData.entity.entities.filter((entity) => {
    const documentNode = hierarchyById.get(entity.id);
    return documentNode ? isDescendantOf(documentNode, anchor.id) : false;
  });
}

function localHierarchy(focusId: string) {
  const anchor = anchorForFocus(focusId);
  const structural = atlasData.structure.hierarchyNodes.filter((node) => {
    if (node.id === anchor?.id) return true;
    if (node.kind === "document") return false;
    if (!anchor.path) return node.depth <= 2 || node.kind === "district";
    return node.path.startsWith(`${anchor.path}/`) && node.depth <= anchor.depth + 3;
  });
  const allDocuments = documentsForAnchor(anchor);
  const representedDocumentCount = atlasData.publication.profile === "public"
    ? allDocuments.reduce((total, entity) => total + entity.wordCount, 0)
    : allDocuments.length;
  const selectedFirst = [...allDocuments].sort((a, b) => {
    const selectedDelta = Number(b.id === focusId) - Number(a.id === focusId);
    if (selectedDelta) return selectedDelta;
    const authority = (value: string) => ({ L1: 5, L2: 4, L3: 3, L4: 2, L5: 1 }[value] ?? 0);
    const authorityDelta = authority(b.authority) - authority(a.authority);
    return authorityDelta || b.wordCount - a.wordCount || (a.title < b.title ? -1 : a.title > b.title ? 1 : 0);
  });
  const visibleDocumentIds = new Set(selectedFirst.slice(0, 28).map((entity) => entity.id));
  const documents = atlasData.structure.hierarchyNodes.filter((node) => visibleDocumentIds.has(node.id));
  const included = new Map(structural.map((node) => [node.id, node]));
  for (const documentNode of documents) {
    included.set(documentNode.id, documentNode);
    let parentId = documentNode.parentId;
    while (parentId) {
      const parent = hierarchyById.get(parentId);
      if (!parent) break;
      included.set(parent.id, parent);
      if (parent.id === anchor.id) break;
      parentId = parent.parentId;
    }
  }
  included.set(anchor.id, anchor);
  const descendants = [...included.values()];
  const ids = new Set(descendants.map((node) => node.id));
  return {
    anchor,
    totalDocuments: representedDocumentCount,
    visibleDocuments: documents.length,
    nodes: descendants.map((node) => ({
      ...node,
      parentId: node.id === anchor.id
        ? null
        : ids.has(node.parentId ?? "")
          ? node.parentId
          : anchor.id,
    })),
  };
}

function radialProject(angle: number, radius: number, centerX: number, centerY: number) {
  return {
    x: centerX + Math.cos(angle - Math.PI / 2) * radius,
    y: centerY + Math.sin(angle - Math.PI / 2) * radius,
  };
}

function radialLinkPath(
  source: { x: number; y: number },
  target: { x: number; y: number },
  centerX: number,
  centerY: number,
) {
  const start = radialProject(source.x, source.y, centerX, centerY);
  const end = radialProject(target.x, target.y, centerX, centerY);
  const middleRadius = (source.y + target.y) / 2;
  const controlA = radialProject(source.x, middleRadius, centerX, centerY);
  const controlB = radialProject(target.x, middleRadius, centerX, centerY);
  return `M${start.x},${start.y} C${controlA.x},${controlA.y} ${controlB.x},${controlB.y} ${end.x},${end.y}`;
}

function LineageRadial() {
  const { state, dispatch } = useAtlasState();
  const { ref, width, height } = useElementSize<HTMLDivElement>();
  const [documentQuery, setDocumentQuery] = useState("");
  const localModel = useMemo(() => localHierarchy(state.focusId), [state.focusId]);
  const localNodes = localModel.nodes;
  const branchDocuments = useMemo(() => {
    const normalized = documentQuery.trim().toLocaleLowerCase("ko");
    return documentsForAnchor(localModel.anchor)
      .filter((entity) => !normalized || `${entity.title} ${entity.path} ${entity.aliases.join(" ")}`.toLocaleLowerCase("ko").includes(normalized))
      .sort((a, b) => Number(b.id === state.focusId) - Number(a.id === state.focusId) || a.title.localeCompare(b.title))
      .slice(0, normalized ? 100 : 60);
  }, [documentQuery, localModel.anchor, state.focusId]);
  const layout = useMemo(() => {
    if (!width || !height) return [];
    const root = stratify<HierarchyNode>()
      .id((node) => node.id)
      .parentId((node) => node.parentId)(localNodes)
      .sum((node) => (node.kind === "document" ? 1 : 0))
      .sort((a, b) => Number(b.id === state.focusId) - Number(a.id === state.focusId) || (b.value ?? 0) - (a.value ?? 0));
    const radius = Math.max(80, Math.min(width, height) * 0.41 - 24);
    const layoutRoot = tree<HierarchyNode>()
      .size([Math.PI * 2, radius])
      .separation((a, b) => (a.parent === b.parent ? 1 : 1.45) / Math.max(1, a.depth))(root);
    return layoutRoot.descendants();
  }, [height, localNodes, state.focusId, width]);
  const selectedPathIds = useMemo(() => {
    const selected = layout.find((node) => node.id === state.focusId);
    return new Set(selected?.ancestors().map((node) => node.id) ?? [localModel.anchor.id]);
  }, [layout, localModel.anchor.id, state.focusId]);
  const lineage = useMemo(() => {
    const items = [];
    let node = hierarchyById.get(state.focusId);
    while (node) {
      items.unshift(node);
      node = node.parentId ? hierarchyById.get(node.parentId) : undefined;
    }
    return items;
  }, [state.focusId]);
  return (
    <div className="lineage-workspace">
      <nav className="lineage-rail" aria-label="선택 계보">
        <button className="lineage-root-action" type="button" onClick={() => dispatch({ type: "focus", focusId: atlasData.structure.rootId })}>
          <ChevronLeft size={15} aria-hidden="true" />
          <strong>전체</strong>
        </button>
        {lineage.map((node, index) => (
          <button key={node.id} type="button" title={node.path || node.label} className={node.id === state.focusId ? "is-current" : ""} onClick={() => dispatch({ type: "focus", focusId: node.id })}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{node.label}</strong>
          </button>
        ))}
      </nav>
      <div className="lineage-body">
        <div className="map-surface radial-lineage-map" ref={ref} data-testid="lineage-map">
          <svg width={width} height={height} role="group" aria-label="선택 가지를 중심으로 폴더와 문서가 퍼지는 방사형 계보 지도">
            <defs>
              <filter id="lineage-focus-glow" x="-80%" y="-80%" width="260%" height="260%">
                <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#ed9840" floodOpacity=".62" />
              </filter>
            </defs>
            {width > 0 && height > 0 && (() => {
              const centerX = width / 2;
              const centerY = height / 2;
              const maxDepth = Math.max(1, ...layout.map((node) => node.depth));
              const radius = Math.max(80, Math.min(width, height) * 0.41 - 24);
              return (
                <g className="radial-lineage-stage">
                  {Array.from({ length: maxDepth }, (_, index) => (
                    <circle key={`depth-ring-${index}`} className="lineage-depth-ring" cx={centerX} cy={centerY} r={((index + 1) / maxDepth) * radius} />
                  ))}
                  <g className="lineage-links">
                    {layout.filter((node) => node.parent).map((node) => {
                      const active = selectedPathIds.has(node.id!) && selectedPathIds.has(node.parent!.id!);
                      return (
                        <path
                          key={`link-${node.id}`}
                          className={active ? "lineage-curve is-active" : "lineage-curve"}
                          d={radialLinkPath(node.parent!, node, centerX, centerY)}
                        />
                      );
                    })}
                  </g>
                  <g className="lineage-nodes">
                    {layout.map((node) => {
                      const point = radialProject(node.x, node.y, centerX, centerY);
                      const selected = node.id === state.focusId;
                      const previewed = node.id === state.previewId;
                      const onLineage = selectedPathIds.has(node.id!);
                      const documentNode = node.data.kind === "document";
                      const district = entityById.get(node.id!)?.district ?? districtForFocus(node.id!) ?? localModel.anchor.path.split("/")[0];
                      const angle = (node.x * 180) / Math.PI;
                      const showLabel = selected || node.depth === 0 || (!documentNode && node.depth <= 2);
                      const label = compactMapLabel(node.data.label, selected ? 24 : 16);
                      const labelRight = point.x >= centerX;
                      const labelX = node.depth === 0 ? point.x : point.x + (labelRight ? 12 : -12);
                      const labelY = node.depth === 0 ? point.y + 28 : point.y + 4;
                      return (
                        <g
                          key={node.id}
                          data-depth={node.depth}
                          data-node-id={node.id}
                          className={`radial-lineage-node kind-${node.data.kind}${selected ? " is-selected" : ""}${onLineage ? " is-lineage" : ""}${previewed ? " is-preview" : ""}`}
                          role="button"
                          tabIndex={selected || !documentNode ? 0 : -1}
                          aria-label={`${node.data.label}, ${node.data.path || "Homi Vault"}`}
                          onPointerEnter={() => dispatch({ type: "preview", focusId: node.id! })}
                          onPointerLeave={() => dispatch({ type: "preview", focusId: null })}
                          onFocus={() => dispatch({ type: "preview", focusId: node.id! })}
                          onBlur={() => dispatch({ type: "preview", focusId: null })}
                          onClick={() => dispatch({ type: "focus", focusId: node.id! })}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              dispatch({ type: "focus", focusId: node.id! });
                            }
                          }}
                        >
                          <circle className="lineage-hit-target" cx={point.x} cy={point.y} r="22" />
                          {documentNode ? (
                            <line
                              x1={point.x - (selected ? 7 : 4)}
                              x2={point.x + (selected ? 7 : 4)}
                              y1={point.y}
                              y2={point.y}
                              transform={`rotate(${angle} ${point.x} ${point.y})`}
                              stroke={selected ? "#ed9840" : onLineage ? "#3f887a" : "#8eaaa1"}
                              strokeWidth={selected ? 5 : 2}
                              strokeLinecap="round"
                              filter={selected ? "url(#lineage-focus-glow)" : undefined}
                            />
                          ) : (
                            <>
                              <circle cx={point.x} cy={point.y} r={selected ? 10 : node.depth === 0 ? 9 : 6.5} fill={node.depth === 0 ? "#fff7ed" : colorFor(district)} stroke={selected ? "#ed9840" : onLineage ? "#306e61" : "#fff"} strokeWidth={selected ? 4 : onLineage ? 2.5 : 1.5} filter={selected ? "url(#lineage-focus-glow)" : undefined} />
                              <circle cx={point.x} cy={point.y} r="2.3" fill={selected ? "#ed9840" : "#315f55"} />
                            </>
                          )}
                          {showLabel && (
                            <g className="lineage-label-mark" transform={`translate(${labelX} ${labelY})`}>
                              <rect x={node.depth === 0 ? -54 : labelRight ? -3 : -103} y="-12" width="106" height="25" rx="4" />
                              <text x={node.depth === 0 ? 0 : labelRight ? 5 : -5} textAnchor={node.depth === 0 ? "middle" : labelRight ? "start" : "end"}>{label}</text>
                            </g>
                          )}
                          <title>{`${node.data.label} · ${node.data.path || "Homi Vault"} · ${node.data.documentCount}개 문서`}</title>
                        </g>
                      );
                    })}
                  </g>
                  <text className="lineage-map-caption" x="18" y={height - 18}>{localModel.totalDocuments}개 문서 중 ranked {localModel.visibleDocuments}개 leaf · 전체 목록은 오른쪽 reader</text>
                </g>
              );
            })()}
          </svg>
        </div>
        <aside className="branch-document-reader" aria-label={`${localModel.anchor.label} 문서 목록`}>
          <div className="branch-reader-heading">
            <span className="eyebrow">가지 문서 목록</span>
            <h3>{localModel.anchor.label}</h3>
            <p>{localModel.totalDocuments}개 문서 · 지도 표식 {localModel.visibleDocuments}개</p>
            <small className="branch-ranking-note">선택 문서 → 권위 → 문서량 순으로 최대 28개를 지도에 표시</small>
          </div>
          <label className="branch-search">
            <Search size={15} aria-hidden="true" />
            <input value={documentQuery} onChange={(event) => setDocumentQuery(event.target.value)} placeholder="이 가지에서 문서 찾기" />
          </label>
          <div className="branch-document-list">
            {branchDocuments.map((entity) => (
              <button key={entity.id} type="button" className={`${entity.id === state.focusId ? "is-current" : ""}${entity.id === state.previewId ? " is-preview" : ""}`} title={entity.path} onPointerEnter={() => dispatch({ type: "preview", focusId: entity.id })} onPointerLeave={() => dispatch({ type: "preview", focusId: null })} onFocus={() => dispatch({ type: "preview", focusId: entity.id })} onBlur={() => dispatch({ type: "preview", focusId: null })} onClick={() => dispatch({ type: "focus", focusId: entity.id })}>
                <i aria-hidden="true" />
                <span><strong>{entity.displayLabel}</strong><small>{entity.path}</small></span>
              </button>
            ))}
            {!branchDocuments.length && <p className="empty-state">일치하는 문서가 없습니다.</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Constellation() {
  const { state, dispatch } = useAtlasState();
  const { ref, width, height } = useElementSize<HTMLDivElement>();
  const selectedDistrict = districtForFocus(state.focusId);
  const layout = useMemo(() => {
    if (!width || !height) return [];
    type ConstellationDatum = {
      id: string;
      name: string;
      value?: number;
      districtTotal?: number;
      remainder?: boolean;
      branchCount?: number;
      directDocumentCount?: number;
      largestBranchShare?: number;
      children?: ConstellationDatum[];
    };
    const districtDatum = (district: (typeof atlasData.structure.districts)[number]): ConstellationDatum => {
      const districtNodeId = hierarchyFocusForDistrict(district.name);
      const folders: ConstellationDatum[] = district.constellationComposition.categories.map((category) => {
        const hierarchyNode = atlasData.structure.hierarchyNodes.find((node) => (
          node.kind === "folder"
          && node.parentId === districtNodeId
          && node.label === category.label
        ));
        return {
          id: hierarchyNode?.id ?? category.id,
          name: category.label,
          value: category.documentCount,
          remainder: category.kind === "direct_documents",
        };
      });
      return {
        id: district.id,
        name: district.name,
        districtTotal: district.documentCount,
        branchCount: district.constellationComposition.folderGroupCount,
        directDocumentCount: district.constellationComposition.directDocumentCount,
        largestBranchShare: Math.round(district.constellationComposition.largestCategoryShare * 100),
        children: folders,
      };
    };
    const data: ConstellationDatum = {
      id: "root",
      name: "Homi Vault",
      children: atlasData.structure.districts.map(districtDatum),
    };
    const root = hierarchy<ConstellationDatum>(data)
      .sum((node) => (node.children?.length ? 0 : node.value ?? 1))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    const layoutRoot = pack<ConstellationDatum>().size([width, height]).padding(10)(root);
    return layoutRoot.descendants().filter((node) => node.depth <= 2);
  }, [height, width]);
  const focusedEntity = entityById.get(state.focusId);
  const focusedNode = hierarchyById.get(state.focusId);
  const focusedLabel = focusedEntity?.displayLabel ?? focusedNode?.label;
  const districtLabelMarks = useMemo(() => {
    const root = layout.find((node) => node.depth === 0);
    if (!root || !width || !height) return [];
    const marks = layout
      .filter((node) => node.depth === 1)
      .map((node) => {
        const aggregateConsoleFocus = selectedDistrict === "Console";
        const selected = node.data.name === selectedDistrict || (aggregateConsoleFocus && node.data.name.startsWith("Console/"));
        const label = constellationDistrictLabel(node.data.name);
        const branchCount = node.data.branchCount ?? 0;
        const directDocumentCount = node.data.directDocumentCount ?? 0;
        const distribution = branchCount === 0
          ? `하위 폴더 0 · 직접 문서 ${directDocumentCount}개`
          : `${branchCount}개 문서군 · 직접 문서 ${directDocumentCount}개`;
        const subtitle = selected && focusedLabel && !aggregateConsoleFocus
          ? `${compactMapLabel(focusedLabel, 18)} · 이 구역 안`
          : distribution;
        const plateWidth = Math.max(76, Math.min(selected ? 148 : 112, Math.max(label.length, subtitle.length) * 6.4 + 22));
        const plateHeight = selected ? 42 : 34;
        const dx = node.x - root.x;
        const dy = node.y - root.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const offset = Math.min(34, Math.max(12, node.r * 0.18));
        const preferredX = node.x + (dx / distance) * offset;
        const preferredY = node.y + (dy / distance) * offset;
        return {
          id: node.data.id,
          label,
          subtitle,
          selected,
          anchorX: node.x,
          anchorY: node.y,
          preferredX,
          preferredY,
          plateWidth,
          plateHeight,
          x: preferredX,
          y: preferredY,
        };
      });
    const simulation = forceSimulation(marks)
      .alpha(1)
      .alphaDecay(0.08)
      .velocityDecay(0.45)
      .force("x", forceX<(typeof marks)[number]>((mark) => mark.preferredX).strength(0.48))
      .force("y", forceY<(typeof marks)[number]>((mark) => mark.preferredY).strength(0.48))
      .force("collide", forceCollide<(typeof marks)[number]>((mark) => Math.hypot(mark.plateWidth / 2, mark.plateHeight / 2) + 5).strength(1).iterations(3))
      .stop();
    for (let index = 0; index < 140; index += 1) simulation.tick();
    simulation.stop();
    return marks.map((mark) => ({
      ...mark,
      x: Math.max(mark.plateWidth / 2 + 8, Math.min(width - mark.plateWidth / 2 - 8, mark.x ?? mark.preferredX)),
      y: Math.max(mark.plateHeight / 2 + 8, Math.min(height - mark.plateHeight / 2 - 8, mark.y ?? mark.preferredY)),
    }));
  }, [focusedLabel, height, layout, selectedDistrict, width]);
  return (
    <div className="map-surface constellation-map" ref={ref} data-testid="constellation-map">
      <svg width={width} height={height} role="group" aria-label="Vault district와 branch를 품은 성운 지도">
        <defs><filter id="soft-glow"><feGaussianBlur stdDeviation="9" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
        {layout.map((node) => {
          const name = node.data.name;
          const district = node.depth === 1 ? name : node.parent?.data.name ?? name;
          const selected = node.depth === 1 && (
            district === selectedDistrict || (selectedDistrict === "Console" && district.startsWith("Console/"))
          );
          const isRemainder = node.data.remainder === true;
          const interactive = node.data.id !== "root" && !isRemainder;
          const count = node.depth === 1 ? node.data.districtTotal ?? Math.round(node.value ?? 0) : Math.round(node.value ?? 0);
          return (
            <g key={node.data.id} transform={`translate(${node.x},${node.y})`} className={`constellation-node depth-${node.depth}${selected ? " is-selected" : ""}${isRemainder ? " is-remainder" : ""}`} role={interactive ? "button" : undefined} tabIndex={interactive && (node.depth === 1 || node.data.id === state.focusId) ? 0 : -1} aria-label={interactive ? `${name}, ${count}개 문서` : undefined} onClick={() => interactive && dispatch({ type: "focus", focusId: node.depth === 1 ? hierarchyFocusForDistrict(name) ?? atlasData.structure.rootId : node.data.id })} onKeyDown={(event) => {
              if (interactive && (event.key === "Enter" || event.key === " ")) dispatch({ type: "focus", focusId: node.depth === 1 ? hierarchyFocusForDistrict(name) ?? atlasData.structure.rootId : node.data.id });
            }}>
              <circle r={node.r} fill={node.depth === 0 ? "#f8faf8" : colorFor(district)} fillOpacity={isRemainder ? 0.24 : node.depth === 1 ? 0.42 : 0.68} stroke={selected ? "#1f5f52" : isRemainder ? "#9fb7af" : "#fff"} strokeDasharray={isRemainder ? "3 3" : undefined} strokeWidth={selected ? 3 : node.depth === 1 ? 2 : 1} filter={selected && node.depth === 1 ? "url(#soft-glow)" : undefined} />
              <title>{`${name} · ${count}개 문서${isRemainder ? " · 합계 보존 표식" : ""}`}</title>
            </g>
          );
        })}
        <g className="constellation-label-layer" pointerEvents="none">
          {selectedDistrict === "Console" && (
            <g className="constellation-label-mark is-selected" transform="translate(92,28)">
              <circle r="5" fill="#fff" stroke="#1f5f52" strokeWidth="2.5" />
              <text x="12" y="4" textAnchor="start">Console · 3개 구역 선택</text>
            </g>
          )}
          {districtLabelMarks.map((mark) => (
            <g key={`label-${mark.id}`} className={`constellation-label-mark${mark.selected ? " is-selected" : ""}`} transform={`translate(${mark.x},${mark.y})`}>
              <line x1={mark.anchorX - mark.x} y1={mark.anchorY - mark.y} x2={0} y2={0} />
              <rect className="constellation-label-plate" x={-mark.plateWidth / 2} y={-mark.plateHeight / 2} width={mark.plateWidth} height={mark.plateHeight} rx="4" />
              <text textAnchor="middle" y={-2}>
                <tspan>{mark.label}</tspan>
                <tspan x={0} dy={12} className="map-count">{mark.subtitle}</tspan>
              </text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}

function MobileExplore() {
  const { state, dispatch } = useAtlasState();
  const entity = entityById.get(state.focusId);
  const district = districtForFocus(state.focusId);
  const lineage = [];
  let node = hierarchyById.get(state.focusId);
  while (node) {
    lineage.unshift(node);
    node = node.parentId ? hierarchyById.get(node.parentId) : undefined;
  }
  const neighbors = entity ? atlasData.relation.neighborhoods[entity.id] ?? [] : [];
  return (
    <div className="mobile-sibling mobile-explore">
      <section className="mobile-selection">
        <span className="eyebrow">현재 위치</span>
        <h2>{entity?.title ?? hierarchyById.get(state.focusId)?.label ?? "Homi Vault"}</h2>
        <p>{entity?.path ?? hierarchyById.get(state.focusId)?.path}</p>
        <button
          className="mobile-inspector-cue"
          type="button"
          aria-expanded={state.panel === "inspector"}
          aria-controls="atlas-inspector-tray"
          onClick={() => dispatch({ type: "panel", panel: "inspector" })}
        >
          선택 해석 보기
        </button>
      </section>
      <nav className="mobile-lineage" aria-label="계보 경로">
        {lineage.map((item) => <button key={item.id} type="button" onClick={() => dispatch({ type: "focus", focusId: item.id })}>{item.label}</button>)}
      </nav>
      <section className="mobile-ranked-list">
        <h3>{entity ? "가까운 문서" : `${district ?? "전체"}의 주요 구역`}</h3>
        {(entity ? neighbors.slice(0, 5).map((neighbor) => entityById.get(neighbor.id)).filter(Boolean) : atlasData.structure.districts.slice(0, 6)).map((item: any) => (
          <button key={item.id} type="button" onClick={() => dispatch({ type: "focus", focusId: item.path ? item.id : hierarchyFocusForDistrict(item.name) ?? atlasData.structure.rootId })}>
            <span><strong>{item.title ?? item.name}</strong><small>{item.path ?? `${item.documentCount}개 문서`}</small></span><LocateFixed size={16} />
          </button>
        ))}
      </section>
      <section className="mobile-district-map" aria-label="주요 구역 미니 지도">
        <h3>주요 구역</h3>
        <div>
          {atlasData.structure.districts.slice(0, 8).map((item) => (
            <button key={item.id} type="button" style={{ background: colorFor(item.name) }} onClick={() => dispatch({ type: "focus", focusId: hierarchyFocusForDistrict(item.name) ?? atlasData.structure.rootId })}>
              <strong>{item.name}</strong><small>{item.documentCount}개 문서</small>
            </button>
          ))}
        </div>
      </section>
      <button className="mobile-theatre-action" type="button" onClick={() => dispatch({ type: "theatre", open: true })}>읽기 집중 보기</button>
    </div>
  );
}
