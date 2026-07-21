import { ArrowRight, CircleCheck, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { WorkspaceHeader } from "../components/WorkspaceHeader";
import { atlasData, entityById, graphNodeById } from "../data-runtime";
import { useElementSize } from "../hooks/useElementSize";
import { useAtlasState } from "../state";
import type { RouteStation, RouteStationKind } from "../types";

const publicProfile = atlasData.publication.profile === "public";

const routeColors = ["#4fd5b9", "#6f91f4", "#ae82e3", "#a8d05f", "#f0a04b", "#f36f87"];

function verifiedRoutes() {
  return atlasData.flow.routes.filter((route) => (
    route.members.length > 0 && route.stations.some((station) => Boolean(station.entityId))
  ));
}

function routeColor(routeId: string) {
  const index = atlasData.flow.routes.findIndex((route) => route.id === routeId);
  return routeColors[Math.max(0, index) % routeColors.length];
}

function stationKind(station: RouteStation): RouteStationKind {
  if (station.kind) return station.kind;
  if (/proof|verify|visual/i.test(station.id) || /검증|확인|QA/.test(station.label)) return "proof_gate";
  if (station.external) return "external";
  return "standard";
}

function StationGlyph({ kind, active, focused, color }: { kind: RouteStationKind; active: boolean; focused: boolean; color: string }) {
  const radius = active ? 10 : 7;
  if (kind === "proof_gate") {
    const half = active ? 9 : 7;
    return (
      <>
        <rect x={-half} y={-half} width={half * 2} height={half * 2} rx="2" transform="rotate(45)" fill="#100f17" stroke={active ? color : "#625d69"} strokeWidth={focused ? 4 : active ? 3 : 2} />
        <circle r="2.8" fill={color} />
      </>
    );
  }
  return (
    <>
      <circle r={radius} fill={kind === "external" ? "#241b13" : "#100f17"} stroke={active ? color : "#625d69"} strokeWidth={focused ? 4 : active ? 3 : 2} />
      <circle r="3" fill={kind === "external" ? "#f0a04b" : color} />
    </>
  );
}

export function revealSelectedRoute(
  target: Pick<HTMLElement, "scrollIntoView"> | null,
) {
  if (!target) return false;
  target.scrollIntoView({ inline: "center", block: "nearest" });
  return true;
}

export function FlowView() {
  const { state, dispatch } = useAtlasState();
  const routes = verifiedRoutes();
  const route = routes.find((item) => item.id === state.routeId) ?? routes[0];
  const focusedGraphNode = graphNodeById.get(state.focusId);
  const activeRouteRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    revealSelectedRoute(activeRouteRef.current);
  }, [state.routeId]);
  return (
    <section className="workspace-view flow-view" aria-labelledby="flow-title">
      <WorkspaceHeader
        titleId="flow-title"
        eyebrow="볼트 경로 · 지식 전파"
        title="근거가 어떤 경로를 지나 판단과 설명이 되는가"
        question={`경로는 실제로 해석된 허브 간 위키링크이며, 선 폭은 link occurrence를 뜻한다. ${atlasData.flow.coordinateContract.readerLabel}`}
        answer={!route
          ? "현재 프로필에서 구성원이 확인된 공개 경로가 없다. 빈 상태는 0건이나 활동 부재를 뜻하지 않는다."
          : publicProfile
          ? `${route.label}은 ${route.stations.length}개 공개 허브를 잇는 검증된 지식 경로다. 실제 최신 실행 기록은 공개판에 포함하지 않는다.`
          : `${route.label}은 ${route.stations.length}개 지식 허브를 잇는다. 검증된 Daily 관계 집계는 ${atlasData.flow.pulse.chains.length}개다.`}
        keyItems={[
          { label: "선택 경로", className: "key-focus" },
          { label: "검증 관문", className: "key-proof" },
          { label: "외부 읽기면", className: "key-readable" },
        ]}
      />
      {!route ? (
        <div className="workspace-honest-empty flow-honest-empty" role="note">
          <ShieldCheck size={24} aria-hidden="true" />
          <h2>공개 가능한 검증 경로가 없습니다.</h2>
          <p>검증된 구성원이 없는 안내 요소는 경로처럼 그리지 않습니다. Owner Atlas의 내부 경로도 공개판에 추정해 넣지 않습니다.</p>
        </div>
      ) : <>
      <nav className="route-rail" aria-label="작업 흐름 선택">
        {routes.map((item) => (
          <button
            key={item.id}
            ref={item.id === state.routeId ? activeRouteRef : undefined}
            type="button"
            className={item.id === state.routeId ? "is-active" : ""}
            aria-pressed={item.id === state.routeId}
            onClick={() => dispatch({ type: "route", routeId: item.id })}
          >
            <i style={{ background: routeColor(item.id) }} aria-hidden="true" />
            <span><strong>{item.label}</strong><small>{item.stations.length}개 연결 허브 · link occurrence {item.weight}</small></span>
          </button>
        ))}
      </nav>
      {focusedGraphNode && route.stations.some((station) => station.entityId === focusedGraphNode.id) && (
        <button className="panel-readout" style={{ position: "absolute", zIndex: 4, top: 124, right: 28, cursor: "pointer" }} type="button" onClick={() => dispatch({ type: "journey", target: { workspace: "explore", sceneId: "graph", focusId: focusedGraphNode.id } })}>
          {focusedGraphNode.label} · Explore에서 위치 보기 <ArrowRight size={14} aria-hidden="true" />
        </button>
      )}
      <div className="desktop-visual-surface flow-surface">
        <VaultMetro />
        <PulseRail />
      </div>
      <MobileFlow />
      <div className="sr-only" aria-live="polite">선택 경로 {route.label}: {route.question}</div>
      </>}
    </section>
  );
}

function pathThroughPoints(points: Array<{ x: number; y: number }>) {
  return points.reduce((d, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const previous = points[index - 1];
    const mid = (previous.x + point.x) / 2;
    return `${d} C ${mid} ${previous.y}, ${mid} ${point.y}, ${point.x} ${point.y}`;
  }, "");
}

function routeGeometry(width: number, laneY: number, stationCount: number) {
  const startX = 220;
  const endX = Math.max(startX + 20, width - 82);
  const step = stationCount > 1 ? (endX - startX) / (stationCount - 1) : 0;
  const points = Array.from({ length: stationCount }, (_, index) => ({
    x: startX + index * step,
    y: laneY + (index % 3 === 1 ? -9 : index % 3 === 2 ? 7 : 0),
  }));
  const path = pathThroughPoints(points);
  return { points, path };
}

function VaultMetro() {
  const { state, dispatch } = useAtlasState();
  const { ref, width, height } = useElementSize<HTMLDivElement>();
  const pulseEntityIds = useMemo(() => new Set(
    atlasData.flow.pulse.chains.flatMap((chain: any) => (chain.stages ?? []).map((stage: any) => stage.entityId).filter(Boolean)),
  ), []);
  const top = 54;
  const laneGap = Math.max(72, (height - 90) / Math.max(1, atlasData.flow.routes.length));
  const geometries = useMemo(
    () => verifiedRoutes().map((route, index) => ({
      route,
      ...routeGeometry(width, top + laneGap * index, route.stations.length),
    })),
    [laneGap, width],
  );
  const maxWeight = Math.max(1, ...geometries.map(({ route }) => route.weight));
  return (
    <div className="metro-canvas" ref={ref} data-testid="vault-metro">
      <svg width={width} height={height} role="group" aria-label="확인된 허브 간 위키링크 경로 지도">
        {geometries.map(({ route, path, points }) => {
          const active = route.id === state.routeId;
          const weightRatio = Math.sqrt(route.weight / maxWeight);
          const strokeWidth = active ? 3.2 + weightRatio * 3.8 : 1.2 + weightRatio * 2.2;
          const first = points[0];
          const last = points.at(-1) ?? first;
          const arrowX = first.x + (last.x - first.x) * 0.67;
          const arrowY = first.y + (last.y - first.y) * 0.67;
          const arrowAngle = Math.atan2(last.y - first.y, last.x - first.x) * 180 / Math.PI;
          return (
            <g key={route.id} className={`metro-route${active ? " is-active" : ""}`}>
              <line className="metro-route-guide" x1="12" x2={Math.max(12, width - 12)} y1={first.y} y2={first.y} aria-hidden="true" />
              <path d={path} fill="none" stroke={active ? routeColor(route.id) : "#56515d"} strokeWidth={strokeWidth} strokeOpacity={active ? 1 : 0.48} strokeLinecap="round" />
              {active && <path d={path} fill="none" stroke="#f3edde" strokeWidth="1" strokeOpacity=".68" strokeLinecap="round" />}
              <path d="M-5,-4 L4,0 L-5,4 Z" transform={`translate(${arrowX},${arrowY}) rotate(${arrowAngle})`} fill={routeColor(route.id)} opacity={active ? 1 : .56} aria-hidden="true" />
              <text x={18} y={(points[0]?.y ?? 0) + 4} className={active ? "metro-route-label is-active" : "metro-route-label"}>{route.label}</text>
              {route.stations.map((station, index) => {
                const point = points[index];
                const entity = station.entityId ? entityById.get(station.entityId) : undefined;
                const structureNode = station.entityId ? graphNodeById.get(station.entityId) : undefined;
                const resolvedLabel = entity?.displayLabel ?? structureNode?.label ?? station.label;
                const focused = station.entityId === state.focusId;
                const previewed = station.entityId === state.previewId;
                const pulseReached = !publicProfile && Boolean(station.entityId && pulseEntityIds.has(station.entityId));
                const kind = stationKind(station);
                return (
                  <g key={station.id} transform={`translate(${point.x},${point.y})`} className={`metro-station kind-${kind}${focused ? " is-focused" : ""}${previewed ? " is-preview" : ""}${pulseReached ? " has-pulse" : ""}`} role={station.entityId ? "button" : undefined} aria-label={station.entityId ? `${station.label}${kind === "proof_gate" ? ", 검증 관문" : ""}${pulseReached ? ", 검증된 Daily 관계 집계에 포함" : ""}: ${resolvedLabel}` : undefined} tabIndex={station.entityId ? 0 : -1} onPointerEnter={() => station.entityId && dispatch({ type: "preview", focusId: station.entityId })} onPointerLeave={() => dispatch({ type: "preview", focusId: null })} onFocus={() => station.entityId && dispatch({ type: "preview", focusId: station.entityId })} onBlur={() => dispatch({ type: "preview", focusId: null })} onClick={() => station.entityId && dispatch({ type: "focus", focusId: station.entityId })} onKeyDown={(event) => {
                    if (station.entityId && (event.key === "Enter" || event.key === " ")) dispatch({ type: "focus", focusId: station.entityId });
                  }}>
                    {pulseReached && <circle className="pulse-station-ring" r={active ? 16 : 12} />}
                    <StationGlyph kind={kind} active={active} focused={focused} color={routeColor(route.id)} />
                    {(active || index === 0 || index === route.stations.length - 1) && (
                      <text x={0} y={index % 2 === 0 ? -17 : 27} textAnchor="middle" className="station-label">
                        <tspan>{station.label}</tspan>
                        {active && (entity || structureNode) && resolvedLabel !== station.label && (
                          <tspan x={0} dy={12} className="station-path">
                            {resolvedLabel.length > 24 ? `${resolvedLabel.slice(0, 22)}…` : resolvedLabel}
                          </tspan>
                        )}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function PulseRail() {
  const pulse = atlasData.flow.pulse;
  const chain = pulse.chains[0] as any | undefined;
  if (!chain) {
    return (
      <section className="pulse-rail flow-pulse-empty" role="note" aria-label="기록된 활동 연결 없음">
        <div className="pulse-heading">
          <span className="eyebrow">Verified activity boundary</span>
          <strong>표시할 활동 연결이 없습니다.</strong>
          <small>근거가 없는 단계나 진행 상태를 경로처럼 만들지 않습니다.</small>
        </div>
      </section>
    );
  }
  const stages = chain.stages ?? [];
  return (
    <section className="pulse-rail" aria-label="검증된 Daily 관계 집계">
      <div className="pulse-heading">
        <span className="eyebrow">Verified activity relation</span>
        <strong>{pulse.latestDailyDate ?? "날짜 미기록"}</strong>
        <small>Daily → 중심 지식 직접 관계 {pulse.chains.length}개 · 실행 상태가 아닌 버전 스냅샷</small>
      </div>
      <ol>
        {stages.map((stage: any, index: number) => (
          <li key={`${stage.role}-${index}`} className={stage.entityId ? "has-entity" : ""}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{stage.label}</strong>
            {index < stages.length - 1 && <ArrowRight size={15} aria-hidden="true" />}
          </li>
        ))}
      </ol>
    </section>
  );
}

function MobileFlow() {
  const { state, dispatch } = useAtlasState();
  const routes = verifiedRoutes();
  const route = routes.find((item) => item.id === state.routeId) ?? routes[0];
  const activeRouteRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    revealSelectedRoute(activeRouteRef.current);
  }, [state.routeId]);
  if (!route) return null;
  return (
    <div className="mobile-sibling mobile-flow">
      <section className="mobile-selection">
        <span className="eyebrow">선택 경로</span>
        <h2>{route.label}</h2>
        <p>{route.question}</p>
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
      <div className="mobile-route-switch">
        {routes.map((item) => <button key={item.id} ref={item.id === state.routeId ? activeRouteRef : undefined} type="button" aria-pressed={item.id === state.routeId} className={item.id === state.routeId ? "is-active" : ""} onClick={() => dispatch({ type: "route", routeId: item.id })}><i style={{ background: routeColor(item.id) }} />{item.label}</button>)}
      </div>
      <ol className="mobile-stepper">
        {route.stations.map((station, index) => (
          <li key={station.id}>
            <span style={{ borderColor: routeColor(route.id) }}>{stationKind(station) === "proof_gate" ? "◇" : String(index + 1).padStart(2, "0")}</span>
            <button type="button" disabled={!station.entityId} onClick={() => station.entityId && dispatch({ type: "focus", focusId: station.entityId })}>
              <strong>{station.label}</strong>
              <small>{stationKind(station) === "proof_gate" ? "검증 관문 · " : ""}{station.entityId ? (entityById.get(station.entityId)?.displayLabel ?? graphNodeById.get(station.entityId)?.label ?? station.label) : station.external ? "공개 경계 단계" : "관계 단계"}</small>
            </button>
          </li>
        ))}
      </ol>
      <div className="mobile-flow-proof"><CircleCheck size={18} /><span>이 지식 경로에는 {route.members.length}개 허브와 link occurrence {route.weight}건이 연결되어 있다. 실행 완료나 진행 상태를 뜻하지 않는다.</span></div>
      <button className="mobile-theatre-action" type="button" onClick={() => dispatch({ type: "theatre", open: true })}>경로 읽기 집중 보기</button>
    </div>
  );
}
