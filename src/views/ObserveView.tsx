import { Grid3X3, Link2, Route, Waypoints } from "lucide-react";
import {
  arc as d3Arc,
  chord as d3Chord,
  chordDirected,
  descending,
  interpolateRgbBasis,
  ribbon as d3Ribbon,
  ribbonArrow,
  scaleBand,
  scaleSequential,
} from "d3";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { WorkspaceHeader } from "../components/WorkspaceHeader";
import { atlasData, entityById } from "../data";
import { useElementSize } from "../hooks/useElementSize";
import {
  dominantRelationDirection,
  dominantTypedDirection,
  isDirectedRelationLayer,
  relationDirectionCounts,
  useAtlasState,
  type RelationDirection,
} from "../state";
import type { MatrixCell, RelationLayer } from "../types";
import {
  colorForDistrict,
  relationColors,
  shortDistrictLabel,
} from "../viz/palette";

const layerItems: Array<{ id: RelationLayer; label: string; icon: typeof Link2 }> = [
  { id: "wikilink", label: "링크 출현", icon: Link2 },
  { id: "typed", label: "명시 관계", icon: Waypoints },
  { id: "route", label: "작업 흐름", icon: Route },
];
const availableLayerItems = layerItems.filter((item) => atlasData.relation.availableLayers.includes(item.id));

const mobileSiblingQuery = "(max-width: 820px), (max-height: 520px) and (pointer: coarse)";

function useMobileSibling() {
  const [matches, setMatches] = useState(() => window.matchMedia(mobileSiblingQuery).matches);
  useEffect(() => {
    const media = window.matchMedia(mobileSiblingQuery);
    const sync = () => setMatches(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  return matches;
}

function layerLabel(layer: RelationLayer) {
  return layer === "wikilink" ? "해결된 링크 출현 횟수" : layer === "typed" ? "명시 관계 건수" : "선별된 구역 경로쌍";
}

export interface MatrixNavigationEntry {
  key: string;
  cell: MatrixCell;
  source: string;
  target: string;
  direction: RelationDirection | null;
  value: number;
  row: number;
  column: number;
}

export interface TypedPairPresentation {
  direction: RelationDirection | null;
  source: string;
  target: string;
  selectedCount: number;
  reverseCount: number;
}

export function directedPairPresentation(
  pair: MatrixCell,
  layer: RelationLayer,
  requestedDirection: RelationDirection | null,
): TypedPairPresentation {
  const counts = relationDirectionCounts(pair, layer);
  const direction = requestedDirection ?? dominantRelationDirection(pair, layer);
  if (direction === "reverse") {
    return {
      direction,
      source: pair.target,
      target: pair.source,
      selectedCount: counts.reverse,
      reverseCount: counts.forward,
    };
  }
  return {
    direction,
    source: pair.source,
    target: pair.target,
    selectedCount: counts.forward,
    reverseCount: counts.reverse,
  };
}

export function typedPairPresentation(
  pair: MatrixCell,
  requestedDirection: RelationDirection | null,
): TypedPairPresentation {
  return directedPairPresentation(pair, "typed", requestedDirection);
}

export function relationAnswer(
  pair: MatrixCell,
  layer: RelationLayer,
  direction: RelationDirection | null,
  selected: boolean,
) {
  if (isDirectedRelationLayer(layer)) {
    const presentation = directedPairPresentation(pair, layer, direction);
    const noun = layer === "typed" ? "명시 관계" : "링크 출현";
    const reverse = presentation.reverseCount > 0
      ? ` 반대 방향 ${presentation.reverseCount}건은 별도다.`
      : "";
    return `${presentation.source} → ${presentation.target}: ${noun} ${presentation.selectedCount}건${selected ? "을 선택했다." : "이 가장 강하다."}${reverse}`;
  }
  return `${pair.source} ↔ ${pair.target}: ${pair[layer]}건${selected ? "을 선택했다." : "으로 가장 강하다."}`;
}

export function matrixNavigationEntries(
  matrix: MatrixCell[],
  order: string[],
  layer: RelationLayer,
): MatrixNavigationEntry[] {
  const districtIndex = new Map(order.map((district, index) => [district, index]));
  const entries: MatrixNavigationEntry[] = [];
  for (const cell of matrix) {
    const sourceIndex = districtIndex.get(cell.source);
    const targetIndex = districtIndex.get(cell.target);
    if (sourceIndex == null || targetIndex == null || sourceIndex === targetIndex) continue;
    if (isDirectedRelationLayer(layer)) {
      const counts = relationDirectionCounts(cell, layer);
      if (counts.forward > 0) {
        entries.push({
          key: `${cell.id}:forward`, cell, source: cell.source, target: cell.target,
          direction: "forward", value: counts.forward, row: sourceIndex, column: targetIndex,
        });
      }
      if (counts.reverse > 0) {
        entries.push({
          key: `${cell.id}:reverse`, cell, source: cell.target, target: cell.source,
          direction: "reverse", value: counts.reverse, row: targetIndex, column: sourceIndex,
        });
      }
      continue;
    }
    const value = cell[layer];
    if (value <= 0) continue;
    const row = Math.min(sourceIndex, targetIndex);
    const column = Math.max(sourceIndex, targetIndex);
    entries.push({
      key: `${cell.id}:pair`, cell, source: order[row], target: order[column],
      direction: null, value, row, column,
    });
  }
  return entries.sort((a, b) => a.row - b.row || a.column - b.column || a.key.localeCompare(b.key));
}

export function nextMatrixEntryKey(
  entries: MatrixNavigationEntry[],
  currentKey: string,
  key: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" | "Home" | "End",
) {
  if (!entries.length) return null;
  if (key === "Home") return entries[0].key;
  if (key === "End") return entries[entries.length - 1].key;
  const currentIndex = Math.max(0, entries.findIndex((entry) => entry.key === currentKey));
  const current = entries[currentIndex];
  const vertical = key === "ArrowUp" || key === "ArrowDown";
  const forward = key === "ArrowRight" || key === "ArrowDown";
  const sameAxis = entries.filter((entry) => (
    vertical ? entry.column === current.column : entry.row === current.row
  ));
  const ordered = sameAxis.sort((a, b) => (
    vertical ? a.row - b.row : a.column - b.column
  ));
  const axisIndex = ordered.findIndex((entry) => entry.key === current.key);
  if (ordered.length > 1 && axisIndex >= 0) {
    const nextIndex = forward
      ? (axisIndex + 1) % ordered.length
      : (axisIndex - 1 + ordered.length) % ordered.length;
    return ordered[nextIndex].key;
  }
  const nextIndex = forward
    ? (currentIndex + 1) % entries.length
    : (currentIndex - 1 + entries.length) % entries.length;
  return entries[nextIndex].key;
}

function matrixEntryDomId(entry: MatrixNavigationEntry) {
  return `relation-matrix-cell-${entry.row}-${entry.column}`;
}

function pairHeading(pair: MatrixCell | undefined, layer: RelationLayer, direction: RelationDirection | null) {
  if (!pair) return "구역 간 연결 링";
  if (!isDirectedRelationLayer(layer)) return `${pair.source} ↔ ${pair.target}`;
  const presentation = directedPairPresentation(pair, layer, direction);
  return presentation.direction
    ? `${presentation.source} → ${presentation.target}`
    : `${pair.source} · ${pair.target}`;
}

function relationCoverageReadout(layer: RelationLayer) {
  const coverage = atlasData.relation.coverage;
  const layerCoverage = (coverage as typeof coverage & {
    layers?: Partial<Record<RelationLayer, { intraDistrict?: number }>>;
  }).layers?.[layer];
  const intraDistrict = layerCoverage?.intraDistrict;
  const intraCopy = typeof intraDistrict === "number"
    ? `같은 구역 안 ${intraDistrict}건 별도`
    : "같은 구역 안 관계 별도";
  const boundary = layer === "wikilink"
    ? `주소 미확인 ${coverage.unresolvedLinkTotal}건 제외`
    : layerCoverage?.boundary ?? "검증된 관계만 표시";
  return `수치 = ${layerLabel(layer)} · ${atlasData.relation.districtOrder.length}개 구역 · ${intraCopy} · ${boundary}`;
}

export function ObserveView() {
  const { state, dispatch } = useAtlasState();
  const selectedPair = atlasData.relation.matrix.find((pair) => pair.id === state.relationPairId);
  const rankedPairs = [...atlasData.relation.matrix]
    .filter((pair) => pair[state.relationLayer] > 0)
    .sort((a, b) => b[state.relationLayer] - a[state.relationLayer] || a.id.localeCompare(b.id));
  const strongestPair = rankedPairs[0];
  const strongestTieCount = strongestPair
    ? rankedPairs.filter((pair) => pair[state.relationLayer] === strongestPair[state.relationLayer]).length
    : 0;
  const handleLayerKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = availableLayerItems.length - 1;
    let nextIndex = index;
    if (event.key === "ArrowRight") nextIndex = index === last ? 0 : index + 1;
    else if (event.key === "ArrowLeft") nextIndex = index === 0 ? last : index - 1;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = last;
    else return;
    event.preventDefault();
    const next = availableLayerItems[nextIndex];
    dispatch({ type: "relationLayer", relationLayer: next.id });
    requestAnimationFrame(() => document.getElementById(`relation-layer-tab-${next.id}`)?.focus());
  };
  return (
    <section className="workspace-view observe-view" aria-labelledby="observe-title">
      <WorkspaceHeader
        titleId="observe-title"
        eyebrow="구역 간 관계 관측"
        title="Vault 구역들은 어떤 관계로 이어지는가"
        question="서로 다른 구역 사이의 확인된 관계를 비교한 뒤, 한 연결쌍과 대표 문서까지 내려가 읽는다. 같은 구역 안 관계는 별도 집계한다."
        answer={selectedPair
          ? relationAnswer(selectedPair, state.relationLayer, state.relationDirection, true)
          : strongestTieCount > 1
            ? `${layerLabel(state.relationLayer)} 최댓값 ${strongestPair[state.relationLayer]}건인 연결쌍이 ${strongestTieCount}개다. 한 쌍을 고르면 방향과 대표 문서까지 내려가 읽을 수 있다.`
            : relationAnswer(strongestPair, state.relationLayer, null, false)}
        keyItems={availableLayerItems.map((item) => ({ label: item.label, className: `key-${item.id}` }))}
        controls={
          <div className="view-switch relation-layer-switch" role="tablist" aria-label="관계층">
            {availableLayerItems.map((item, index) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  id={`relation-layer-tab-${item.id}`}
                  role="tab"
                  type="button"
                  aria-selected={state.relationLayer === item.id}
                  aria-controls="observe-relation-panel"
                  tabIndex={state.relationLayer === item.id ? 0 : -1}
                  className={state.relationLayer === item.id ? "is-active" : ""}
                  onClick={() => dispatch({ type: "relationLayer", relationLayer: item.id })}
                  onKeyDown={(event) => handleLayerKey(event, index)}
                >
                  <Icon size={16} /> {item.label}
                </button>
              );
            })}
          </div>
        }
      />
      <div
        className="desktop-visual-surface observation-surface"
        id="observe-relation-panel"
        role="tabpanel"
        aria-labelledby={`relation-layer-tab-${state.relationLayer}`}
      >
        <section className="matrix-panel" aria-label="구역 간 관계표">
          <div className="panel-title-row">
            <div><span className="eyebrow">확인된 관계</span><h2>구역 간 관계표</h2></div>
            <span className="panel-readout">{relationCoverageReadout(state.relationLayer)}</span>
          </div>
          <RelationMatrix />
        </section>
        <section className="chord-panel" aria-label="선택한 연결쌍">
          <div className="panel-title-row">
            <div><span className="eyebrow">선택 연결</span><h2>{pairHeading(selectedPair, state.relationLayer, state.relationDirection)}</h2></div>
          </div>
          <GlobalChord />
          <PairReadout pair={selectedPair} />
        </section>
      </div>
      <MobileObserve />
    </section>
  );
}

function pairKey(a: string, b: string) {
  return [a, b].sort().join("→");
}

function relationValue(
  cell: MatrixCell | undefined,
  source: string,
  target: string,
  layer: RelationLayer,
) {
  if (!cell || source === target) return 0;
  if (!isDirectedRelationLayer(layer)) return cell[layer];
  const counts = relationDirectionCounts(cell, layer);
  if (source === cell.source && target === cell.target) return counts.forward;
  if (source === cell.target && target === cell.source) return counts.reverse;
  return 0;
}

function directionFor(cell: MatrixCell | undefined, source: string, target: string) {
  if (!cell) return null;
  return source === cell.source && target === cell.target ? "forward" : "reverse";
}

function RelationMatrix() {
  const { state, dispatch } = useAtlasState();
  const mobileSibling = useMobileSibling() && !state.theatre;
  const { ref, width, height } = useElementSize<HTMLDivElement>();
  const order = atlasData.relation.districtOrder;
  const cells = useMemo(
    () => new Map(atlasData.relation.matrix.map((cell) => [pairKey(cell.source, cell.target), cell])),
    [],
  );
  const navigationEntries = useMemo(
    () => matrixNavigationEntries(atlasData.relation.matrix, order, state.relationLayer),
    [order, state.relationLayer],
  );
  const entryByCoordinate = useMemo(
    () => new Map(navigationEntries.map((entry) => [`${entry.row}:${entry.column}`, entry])),
    [navigationEntries],
  );
  const selectedEntryKey = state.relationPairId
    ? `${state.relationPairId}:${isDirectedRelationLayer(state.relationLayer) ? state.relationDirection ?? "forward" : "pair"}`
    : null;
  const [activeEntryKey, setActiveEntryKey] = useState(
    () => selectedEntryKey ?? navigationEntries[0]?.key ?? "",
  );
  useEffect(() => {
    const preferred = selectedEntryKey && navigationEntries.some((entry) => entry.key === selectedEntryKey)
      ? selectedEntryKey
      : navigationEntries.some((entry) => entry.key === activeEntryKey)
        ? activeEntryKey
        : navigationEntries[0]?.key ?? "";
    if (preferred !== activeEntryKey) setActiveEntryKey(preferred);
  }, [activeEntryKey, navigationEntries, selectedEntryKey]);
  const compactTheatre = state.theatre && width < 600;
  const margin = compactTheatre
    ? { top: 68, right: 12, bottom: 16, left: 78 }
    : { top: 82, right: 18, bottom: 20, left: 98 };
  const bandPadding = 0.08;
  const minimumInteractiveBand = compactTheatre ? 24 : 0;
  const minimumPlotExtent = minimumInteractiveBand
    ? Math.ceil((order.length - bandPadding + (bandPadding * 2)) * minimumInteractiveBand / (1 - bandPadding))
    : 0;
  const renderWidth = Math.max(width, margin.left + margin.right + minimumPlotExtent);
  const renderHeight = Math.max(height, margin.top + margin.bottom + minimumPlotExtent);
  const x = scaleBand<string>()
    .domain(order)
    .range([margin.left, Math.max(margin.left + 1, renderWidth - margin.right)])
    .padding(bandPadding);
  const y = scaleBand<string>()
    .domain(order)
    .range([margin.top, Math.max(margin.top + 1, renderHeight - margin.bottom)])
    .padding(bandPadding);
  const max = Math.max(
    1,
    ...atlasData.relation.matrix.flatMap((cell) =>
      isDirectedRelationLayer(state.relationLayer)
        ? Object.values(relationDirectionCounts(cell, state.relationLayer))
        : [cell[state.relationLayer]],
    ),
  );
  const color = scaleSequential(interpolateRgbBasis(["#edf4f1", relationColors[state.relationLayer]])).domain([0, max]);
  return (
    <div className="matrix-canvas" ref={ref} data-testid="relation-matrix">
      <svg
        width={renderWidth}
        height={renderHeight}
        role={mobileSibling ? undefined : "group"}
        aria-label={mobileSibling ? undefined : `${layerLabel(state.relationLayer)}의 구역 간 관계표`}
        aria-hidden={mobileSibling ? "true" : undefined}
        focusable="false"
      >
        {order.map((district) => (
          <g key={`labels-${district}`}>
            <text className="matrix-row-label" x={margin.left - 10} y={(y(district) ?? 0) + (y.bandwidth() / 2) + 4} textAnchor="end">{shortDistrictLabel(district)}</text>
            <text className="matrix-column-label" transform={`translate(${(x(district) ?? 0) + x.bandwidth() / 2},${margin.top - 10}) rotate(-48)`} textAnchor="start">{shortDistrictLabel(district)}</text>
          </g>
        ))}
        {order.flatMap((source, row) =>
          order.map((target, column) => {
            const cell = cells.get(pairKey(source, target));
            const value = relationValue(cell, source, target, state.relationLayer);
            const direction = directionFor(cell, source, target);
            const navigationEntry = entryByCoordinate.get(`${row}:${column}`);
            const selected = cell?.id === state.relationPairId && (
              !isDirectedRelationLayer(state.relationLayer) || state.relationDirection === direction
            );
            const focusedDistrict = entityById.get(state.focusId)?.district;
            const focused = source === focusedDistrict || target === focusedDistrict;
            const markInteractive = Boolean(navigationEntry) && !mobileSibling;
            const highContrast = value / max >= 0.48;
            return (
              <g
                key={`${source}-${target}`}
                id={navigationEntry ? matrixEntryDomId(navigationEntry) : undefined}
                className={selected ? "matrix-cell is-selected" : focused ? "matrix-cell is-focused" : "matrix-cell"}
                role={markInteractive ? "button" : undefined}
                tabIndex={markInteractive ? (navigationEntry?.key === activeEntryKey ? 0 : -1) : undefined}
                aria-current={markInteractive && selected ? "true" : undefined}
                aria-label={markInteractive && navigationEntry ? `${navigationEntry.source}${isDirectedRelationLayer(state.relationLayer) ? "에서" : "와"} ${navigationEntry.target}${isDirectedRelationLayer(state.relationLayer) ? "로" : ""}: ${layerLabel(state.relationLayer)} ${navigationEntry.value}` : undefined}
                onFocus={() => navigationEntry && setActiveEntryKey(navigationEntry.key)}
                onClick={() => navigationEntry && dispatch({ type: "relationPair", relationPairId: navigationEntry.cell.id, direction: navigationEntry.direction })}
                onKeyDown={(event) => {
                  if (!navigationEntry) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    dispatch({ type: "relationPair", relationPairId: navigationEntry.cell.id, direction: navigationEntry.direction });
                    return;
                  }
                  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
                    event.preventDefault();
                    const nextKey = nextMatrixEntryKey(
                      navigationEntries,
                      navigationEntry.key,
                      event.key as "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" | "Home" | "End",
                    );
                    const nextEntry = navigationEntries.find((entry) => entry.key === nextKey);
                    if (nextEntry) {
                      setActiveEntryKey(nextEntry.key);
                      document.getElementById(matrixEntryDomId(nextEntry))?.focus();
                    }
                  }
                }}
              >
                <rect
                  x={x(target)}
                  y={y(source)}
                  width={x.bandwidth()}
                  height={y.bandwidth()}
                  rx={2}
                  fill={source === target ? "#eef3f0" : value ? color(value) : "#f4f7f5"}
                  fillOpacity={source === target ? 0.46 : value ? 0.92 : 0.5}
                  stroke={selected ? "#173c34" : focused ? "#7ea99d" : "#e3ebe7"}
                  strokeWidth={selected ? 2.5 : 1}
                  aria-hidden="true"
                />
                {value > 0 && x.bandwidth() > 28 && (
                  <text x={(x(target) ?? 0) + x.bandwidth() / 2} y={(y(source) ?? 0) + y.bandwidth() / 2 + 4} textAnchor="middle" className="matrix-value" style={{ fill: highContrast ? "#fff" : "#173c34" }}>{value}</text>
                )}
              </g>
            );
          }),
        )}
      </svg>
    </div>
  );
}

function GlobalChord() {
  const { state, dispatch } = useAtlasState();
  const mobileSibling = useMobileSibling() && !state.theatre;
  const { ref, width, height } = useElementSize<HTMLDivElement>();
  const order = atlasData.relation.districtOrder;
  const layout = useMemo(() => {
    const index = new Map(order.map((district, i) => [district, i]));
    const values = order.map(() => order.map(() => 0));
    for (const cell of atlasData.relation.matrix) {
      const a = index.get(cell.source);
      const b = index.get(cell.target);
      if (a == null || b == null) continue;
      if (isDirectedRelationLayer(state.relationLayer)) {
        const counts = relationDirectionCounts(cell, state.relationLayer);
        values[a][b] = counts.forward;
        values[b][a] = counts.reverse;
      } else {
        values[a][b] = cell[state.relationLayer];
        values[b][a] = cell[state.relationLayer];
      }
    }
    return isDirectedRelationLayer(state.relationLayer)
      ? chordDirected().padAngle(0.045).sortSubgroups(descending)(values)
      : d3Chord().padAngle(0.045).sortSubgroups(descending)(values);
  }, [order, state.relationLayer]);
  const outer = Math.max(40, Math.min((width - 140) / 2, (height - 86) / 2));
  const inner = outer - Math.max(12, outer * 0.11);
  const arc = d3Arc().innerRadius(inner).outerRadius(outer);
  const ribbon = isDirectedRelationLayer(state.relationLayer)
    ? ribbonArrow().radius(inner - 1).padAngle(0.015)
    : d3Ribbon().radius(inner - 1);
  const selectedPair = atlasData.relation.matrix.find((pair) => pair.id === state.relationPairId);
  return (
    <div className="chord-canvas" ref={ref} data-testid="global-chord">
      <svg
        width={width}
        height={height}
        role={mobileSibling ? undefined : "img"}
        aria-label={mobileSibling ? undefined : `${layerLabel(state.relationLayer)}의 구역 간 연결 링 요약. 조작은 왼쪽 관계표에서 합니다.`}
        aria-hidden={mobileSibling ? "true" : undefined}
        focusable="false"
      >
        <g transform={`translate(${width / 2},${height / 2})`}>
          {layout.map((item, index) => {
            const source = order[item.source.index];
            const target = order[item.target.index];
            const cell = atlasData.relation.matrix.find((candidate) => pairKey(candidate.source, candidate.target) === pairKey(source, target));
            const direction = directionFor(cell, source, target);
            const selected = selectedPair && pairKey(source, target) === pairKey(selectedPair.source, selectedPair.target) && (
              !isDirectedRelationLayer(state.relationLayer) || state.relationDirection === direction
            );
            const dimmed = Boolean(selectedPair) && !selected;
            return (
              <path
                key={`ribbon-${index}`}
                d={ribbon(item as any) ?? undefined}
                className={selected ? "relation-ribbon is-selected" : "relation-ribbon"}
                fill={colorForDistrict(source)}
                fillOpacity={dimmed ? 0.08 : selected ? 0.82 : 0.2}
                stroke={selected ? relationColors[state.relationLayer] : "#fff"}
                strokeWidth={selected ? 2.4 : 0.8}
                aria-hidden="true"
                onClick={() => !mobileSibling && cell && dispatch({ type: "relationPair", relationPairId: cell.id, direction: isDirectedRelationLayer(state.relationLayer) ? direction : null })}
              >
                <title>{`${source} ${isDirectedRelationLayer(state.relationLayer) ? "→" : "↔"} ${target}: ${relationValue(cell, source, target, state.relationLayer)}`}</title>
              </path>
            );
          })}
          {layout.groups.map((group) => {
            const district = order[group.index];
            const angle = (group.startAngle + group.endAngle) / 2;
            const labelRadius = outer + 15;
            const x = Math.sin(angle) * labelRadius;
            const y = -Math.cos(angle) * labelRadius;
            return (
              <g key={district}>
                <path d={arc(group as any) ?? undefined} fill={colorForDistrict(district)} stroke="#fff" strokeWidth={1.5} />
                {group.endAngle - group.startAngle > 0.08 && (
                  <text x={x} y={y} textAnchor={x > 5 ? "start" : x < -5 ? "end" : "middle"} dominantBaseline="middle" className="chord-label">{shortDistrictLabel(district)}</text>
                )}
              </g>
            );
          })}
          <circle r={inner * 0.34} fill="#f8fbf9" stroke="#dce7e1" />
          <text textAnchor="middle" y={-4} className="chord-center-title">{layerLabel(state.relationLayer)}</text>
          <text textAnchor="middle" y={15} className="chord-center-sub">구역 간 → 선택 쌍</text>
        </g>
      </svg>
    </div>
  );
}

function PairReadout({ pair }: { pair?: MatrixCell }) {
  const { state } = useAtlasState();
  if (!pair) {
    return (
      <div className="pair-readout">
        <span className="eyebrow">읽는 순서</span>
        <p>왼쪽 관계표에서 한 칸을 고르면 오른쪽 링이 같은 연결쌍을 강조하고, 해석 패널에서 대표 문서를 보여준다.</p>
      </div>
    );
  }
  const selectedPresentation = isDirectedRelationLayer(state.relationLayer)
    ? directedPairPresentation(pair, state.relationLayer, state.relationDirection)
    : null;
  return (
    <dl className="pair-readout metrics">
      <div><dt>링크 출현</dt><dd>{state.relationLayer === "wikilink" && selectedPresentation ? `${selectedPresentation.selectedCount} → / ${selectedPresentation.reverseCount} ←` : pair.wikilink}</dd></div>
      <div><dt>명시 관계</dt><dd>{state.relationLayer === "typed" && selectedPresentation ? `${selectedPresentation.selectedCount} → / ${selectedPresentation.reverseCount} ←` : pair.typed}</dd></div>
      <div><dt>작업 흐름</dt><dd>{pair.route}</dd></div>
    </dl>
  );
}

function MobileObserve() {
  const { state, dispatch } = useAtlasState();
  const selectedPair = atlasData.relation.matrix.find((pair) => pair.id === state.relationPairId);
  const ranked = [...atlasData.relation.matrix]
    .sort((a, b) => (
      isDirectedRelationLayer(state.relationLayer)
        ? Math.max(...Object.values(relationDirectionCounts(b, state.relationLayer))) - Math.max(...Object.values(relationDirectionCounts(a, state.relationLayer)))
        : b[state.relationLayer] - a[state.relationLayer]
    ))
    .slice(0, 8);
  const previewPair = selectedPair ?? ranked[0];
  const selectedPresentation = selectedPair && isDirectedRelationLayer(state.relationLayer)
    ? directedPairPresentation(selectedPair, state.relationLayer, state.relationDirection)
    : null;
  const previewPresentation = previewPair && isDirectedRelationLayer(state.relationLayer)
    ? directedPairPresentation(
        previewPair,
        state.relationLayer,
        previewPair.id === state.relationPairId ? state.relationDirection : dominantRelationDirection(previewPair, state.relationLayer),
      )
    : null;
  const handleLayerKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = availableLayerItems.length - 1;
    let nextIndex = index;
    if (event.key === "ArrowRight") nextIndex = index === last ? 0 : index + 1;
    else if (event.key === "ArrowLeft") nextIndex = index === 0 ? last : index - 1;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = last;
    else return;
    event.preventDefault();
    const next = availableLayerItems[nextIndex];
    dispatch({ type: "relationLayer", relationLayer: next.id });
    requestAnimationFrame(() => document.getElementById(`mobile-relation-tab-${next.id}`)?.focus());
  };
  return (
    <div className="mobile-sibling mobile-observe">
      <section className="mobile-selection">
        <span className="eyebrow">구역 간 관계</span>
        <h2>{selectedPair ? (selectedPresentation ? `${selectedPresentation.source} → ${selectedPresentation.target}` : `${selectedPair.source} ↔ ${selectedPair.target}`) : "강한 구역 간 연결 쌍"}</h2>
        <p>{layerLabel(state.relationLayer)}를 기준으로 정렬했습니다. 같은 구역 안 관계와 주소가 확인되지 않은 연결은 이 표에서 별도 처리합니다.</p>
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
      <div className="mobile-layer-switch" role="tablist" aria-label="관계 보기 기준">
        {availableLayerItems.map((item, index) => (
          <button
            key={item.id}
            id={`mobile-relation-tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={item.id === state.relationLayer}
            aria-controls="mobile-relation-results"
            tabIndex={item.id === state.relationLayer ? 0 : -1}
            className={item.id === state.relationLayer ? "is-active" : ""}
            onClick={() => dispatch({ type: "relationLayer", relationLayer: item.id })}
            onKeyDown={(event) => handleLayerKey(event, index)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {previewPair && (
        <section
          className="mobile-relation-preview"
          tabIndex={0}
          aria-labelledby="mobile-relation-preview-title"
          aria-live="polite"
          aria-atomic="true"
          data-relation-direction={previewPresentation?.direction ?? "undirected"}
          aria-label={previewPresentation
            ? `${previewPresentation.source}에서 ${previewPresentation.target}로 ${layerLabel(state.relationLayer)} ${previewPresentation.selectedCount}건, 반대 방향 ${previewPresentation.reverseCount}건`
            : `${previewPair.source}와 ${previewPair.target} 사이 ${layerLabel(state.relationLayer)} ${previewPair[state.relationLayer]}건`}
        >
          <div>
            <span className="eyebrow">간단 관계 미리보기</span>
            <h3 id="mobile-relation-preview-title">{previewPresentation ? `${previewPresentation.source} → ${previewPresentation.target}` : `${previewPair.source} ↔ ${previewPair.target}`}</h3>
            <p>{previewPresentation ? `선택 방향 ${previewPresentation.selectedCount}건 · 반대 방향 ${previewPresentation.reverseCount}건` : `${layerLabel(state.relationLayer)} ${previewPair[state.relationLayer]}건`}</p>
          </div>
          <svg viewBox="0 0 220 72" aria-hidden="true" focusable="false">
            <path d="M48 36 C88 10 132 62 172 36" fill="none" stroke={relationColors[state.relationLayer]} strokeWidth="4" strokeOpacity=".62" />
            {previewPresentation && <circle cx="65" cy="27" r="3.5" fill={relationColors.typed} />}
            {previewPresentation && <line x1="155" y1="27" x2="155" y2="45" stroke={relationColors.typed} strokeWidth="4" strokeLinecap="round" />}
            <circle cx="46" cy="36" r="18" fill="#f8fbf9" stroke={colorForDistrict(previewPresentation?.source ?? previewPair.source)} strokeWidth="5" />
            <circle cx="174" cy="36" r="18" fill="#f8fbf9" stroke={colorForDistrict(previewPresentation?.target ?? previewPair.target)} strokeWidth="5" />
            <circle cx="46" cy="36" r="4" fill={colorForDistrict(previewPresentation?.source ?? previewPair.source)} />
            <circle cx="174" cy="36" r="4" fill={colorForDistrict(previewPresentation?.target ?? previewPair.target)} />
          </svg>
        </section>
      )}
      <section className="mobile-ranked-list" id="mobile-relation-results" role="tabpanel" aria-labelledby={`mobile-relation-tab-${state.relationLayer}`}>
        <h3>상위 구역 간 관계</h3>
        {ranked.map((pair, index) => {
          const presentation = state.relationLayer === "typed"
            ? directedPairPresentation(pair, state.relationLayer, pair.id === state.relationPairId ? state.relationDirection : dominantTypedDirection(pair))
            : state.relationLayer === "wikilink"
              ? directedPairPresentation(pair, state.relationLayer, pair.id === state.relationPairId ? state.relationDirection : dominantRelationDirection(pair, state.relationLayer))
            : null;
          return (
            <button
              key={pair.id}
              type="button"
              className={pair.id === state.relationPairId ? "is-active" : ""}
              aria-current={pair.id === state.relationPairId ? "true" : undefined}
              aria-label={presentation
                ? `${presentation.source}에서 ${presentation.target}로 ${layerLabel(state.relationLayer)} ${presentation.selectedCount}건, 반대 방향 ${presentation.reverseCount}건`
                : `${pair.source}와 ${pair.target}, ${layerLabel(state.relationLayer)} ${pair[state.relationLayer]}건`}
              onClick={() => dispatch({ type: "relationPair", relationPairId: pair.id, direction: presentation?.direction ?? null })}
            >
              <span className="rank-number">{String(index + 1).padStart(2, "0")}</span>
              <span><strong>{presentation ? `${presentation.source} → ${presentation.target}` : `${pair.source} ↔ ${pair.target}`}</strong><small>{presentation ? `${presentation.selectedCount} → / ${presentation.reverseCount} ←` : pair[state.relationLayer]} · 링크 출현 {pair.wikilink} / 명시 {pair.typed} / 흐름 {pair.route}</small></span>
            </button>
          );
        })}
      </section>
      <button className="mobile-theatre-action" type="button" onClick={() => dispatch({ type: "theatre", open: true })}>관계 읽기 집중 보기</button>
    </div>
  );
}
