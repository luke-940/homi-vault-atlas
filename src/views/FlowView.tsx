import { ArrowRight, CircleCheck } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { WorkspaceHeader } from "../components/WorkspaceHeader";
import { atlasData, entityById } from "../data";
import { useElementSize } from "../hooks/useElementSize";
import { useAtlasState } from "../state";
import type { Route, RouteStation, RouteStationKind } from "../types";

const routeColors: Record<string, string> = {
  daily: "#338f80",
  batch: "#517db3",
  provider: "#8a6cc2",
  paper: "#89a94f",
  chronicle: "#c88652",
  graph: "#cf6767",
};

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
        <rect x={-half} y={-half} width={half * 2} height={half * 2} rx="2" transform="rotate(45)" fill="#fffdf6" stroke={active ? color : "#9fb3aa"} strokeWidth={focused ? 4 : active ? 3 : 2} />
        <circle r="2.8" fill={color} />
      </>
    );
  }
  return (
    <>
      <circle r={radius} fill={kind === "external" ? "#fff8e8" : "#f8fbf9"} stroke={active ? color : "#9fb3aa"} strokeWidth={focused ? 4 : active ? 3 : 2} />
      <circle r="3" fill={kind === "external" ? "#d18d52" : color} />
    </>
  );
}

export function FlowView() {
  const { state, dispatch } = useAtlasState();
  const route = atlasData.flow.routes.find((item) => item.id === state.routeId)!;
  const activeRouteRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeRouteRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [state.routeId]);
  return (
    <section className="workspace-view flow-view" aria-labelledby="flow-title">
      <WorkspaceHeader
        titleId="flow-title"
        eyebrow="볼트 경로 · 지식 전파"
        title="근거가 어떤 경로를 지나 판단과 설명이 되는가"
        question={`선 폭은 수량을 뜻하지 않는다. ${atlasData.flow.coordinateContract.readerLabel}`}
        answer={`${route.label}은 ${route.stations.length}개 경유점을 지나며, 최신 Pulse는 ${atlasData.flow.pulse.chains.length}개 중심 지식에 도달했다.`}
        keyItems={[
          { label: "선택 경로", className: "key-focus" },
          { label: "검증 관문", className: "key-proof" },
          { label: "외부 읽기면", className: "key-readable" },
        ]}
      />
      <nav className="route-rail" aria-label="작업 흐름 선택">
        {atlasData.flow.routes.map((item) => (
          <button
            key={item.id}
            ref={item.id === state.routeId ? activeRouteRef : undefined}
            type="button"
            className={item.id === state.routeId ? "is-active" : ""}
            aria-pressed={item.id === state.routeId}
            onClick={() => dispatch({ type: "route", routeId: item.id })}
          >
            <i style={{ background: routeColors[item.id] }} aria-hidden="true" />
            <span><strong>{item.label}</strong><small>{item.stations.length}개 경유점</small></span>
          </button>
        ))}
      </nav>
      <div className="desktop-visual-surface flow-surface">
        <VaultMetro />
        <PulseRail />
      </div>
      <MobileFlow />
      <div className="sr-only" aria-live="polite">선택 경로 {route.label}: {route.question}</div>
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
  const startX = 150;
  const endX = Math.max(startX + 20, width - 82);
  const step = stationCount > 1 ? (endX - startX) / (stationCount - 1) : 0;
  const points = Array.from({ length: stationCount }, (_, index) => ({
    x: startX + index * step,
    y: laneY + (index % 3 === 1 ? -9 : index % 3 === 2 ? 7 : 0),
  }));
  const path = pathThroughPoints(points);
  return { points, path };
}

function verifiedPulseSegment(
  route: Route,
  points: Array<{ x: number; y: number }>,
  chainEntitySets: Array<Set<string>>,
) {
  let bestStart = -1;
  let bestEnd = -1;
  for (const entityIds of chainEntitySets) {
    let runStart = -1;
    for (let index = 0; index < route.stations.length; index += 1) {
      const station = route.stations[index];
      const reached = Boolean(station.entityId && entityIds.has(station.entityId));
      if (reached && runStart < 0) runStart = index;
      const runEnds = runStart >= 0 && (!reached || index === route.stations.length - 1);
      if (!runEnds) continue;
      const runEnd = reached && index === route.stations.length - 1 ? index : index - 1;
      if (runEnd > runStart && runEnd - runStart > bestEnd - bestStart) {
        bestStart = runStart;
        bestEnd = runEnd;
      }
      runStart = -1;
    }
  }
  return bestStart >= 0 ? pathThroughPoints(points.slice(bestStart, bestEnd + 1)) : null;
}

function VaultMetro() {
  const { state, dispatch } = useAtlasState();
  const { ref, width, height } = useElementSize<HTMLDivElement>();
  const pulseEntityIds = useMemo(() => new Set(
    atlasData.flow.pulse.chains.flatMap((chain: any) => (chain.stages ?? []).map((stage: any) => stage.entityId).filter(Boolean)),
  ), []);
  const pulseChainEntitySets = useMemo(() => atlasData.flow.pulse.chains.map(
    (chain: any) => new Set<string>((chain.stages ?? []).map((stage: any) => stage.entityId).filter(Boolean)),
  ), []);
  const top = 54;
  const laneGap = Math.max(72, (height - 90) / Math.max(1, atlasData.flow.routes.length));
  const geometries = useMemo(
    () => atlasData.flow.routes.map((route, index) => ({
      route,
      ...routeGeometry(width, top + laneGap * index, route.stations.length),
    })),
    [laneGap, width],
  );
  return (
    <div className="metro-canvas" ref={ref} data-testid="vault-metro">
      <svg width={width} height={height} role="group" aria-label="여섯 작업 흐름이 검증 관문을 지나는 볼트 경로 지도">
        <defs>
          <filter id="metro-focus-glow" x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation="5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        {geometries.map(({ route, path, points }) => {
          const active = route.id === state.routeId;
          const pulseSegment = verifiedPulseSegment(route, points, pulseChainEntitySets);
          return (
            <g key={route.id} className={`metro-route${active ? " is-active" : ""}${pulseSegment ? " has-pulse" : ""}`}>
              <rect
                className="metro-route-band"
                x="8"
                y={(points[0]?.y ?? 0) - laneGap * 0.38}
                width={Math.max(0, width - 18)}
                height={laneGap * 0.76}
                rx="5"
                aria-hidden="true"
              />
              <path d={path} fill="none" stroke={active ? routeColors[route.id] : "#cad8d2"} strokeWidth={active ? 5 : 2} strokeOpacity={active ? 1 : 0.46} strokeLinecap="round" filter={active ? "url(#metro-focus-glow)" : undefined} />
              {active && pulseSegment && !state.reducedMotion && (
                <circle className="route-packet" r="5" fill="#fff" stroke={routeColors[route.id]} strokeWidth="3" style={{ offsetPath: `path('${pulseSegment}')` }} />
              )}
              <text x={18} y={(points[0]?.y ?? 0) + 4} className={active ? "metro-route-label is-active" : "metro-route-label"}>{route.label}</text>
              {route.stations.map((station, index) => {
                const point = points[index];
                const entity = station.entityId ? entityById.get(station.entityId) : undefined;
                const focused = station.entityId === state.focusId;
                const previewed = station.entityId === state.previewId;
                const pulseReached = Boolean(station.entityId && pulseEntityIds.has(station.entityId));
                const kind = stationKind(station);
                return (
                  <g key={station.id} transform={`translate(${point.x},${point.y})`} className={`metro-station kind-${kind}${focused ? " is-focused" : ""}${previewed ? " is-preview" : ""}${pulseReached ? " has-pulse" : ""}`} role={station.entityId ? "button" : undefined} aria-label={station.entityId ? `${station.label}${kind === "proof_gate" ? ", 검증 관문" : ""}${pulseReached ? ", 최신 Pulse 도달" : ""}: ${entity?.displayLabel ?? station.entityId}` : undefined} tabIndex={station.entityId ? 0 : -1} onPointerEnter={() => station.entityId && dispatch({ type: "preview", focusId: station.entityId })} onPointerLeave={() => dispatch({ type: "preview", focusId: null })} onFocus={() => station.entityId && dispatch({ type: "preview", focusId: station.entityId })} onBlur={() => dispatch({ type: "preview", focusId: null })} onClick={() => station.entityId && dispatch({ type: "focus", focusId: station.entityId })} onKeyDown={(event) => {
                    if (station.entityId && (event.key === "Enter" || event.key === " ")) dispatch({ type: "focus", focusId: station.entityId });
                  }}>
                    {pulseReached && <circle className="pulse-station-ring" r={active ? 16 : 12} />}
                    <StationGlyph kind={kind} active={active} focused={focused} color={routeColors[route.id]} />
                    {(active || index === 0 || index === route.stations.length - 1) && (
                      <text x={0} y={index % 2 === 0 ? -17 : 27} textAnchor="middle" className="station-label">
                        <tspan>{station.label}</tspan>
                        {active && entity && (
                          <tspan x={0} dy={12} className="station-path">
                            {entity.displayLabel.length > 24 ? `${entity.displayLabel.slice(0, 22)}…` : entity.displayLabel}
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
  const stages = chain?.stages ?? [
    { role: "source", label: "소스 창" },
    { role: "daily", label: "Daily" },
    { role: "knowledge", label: "중심 지식" },
    { role: "decision", label: "판단·행동" },
    { role: "readable", label: "읽기용 사본" },
  ];
  return (
    <section className="pulse-rail" aria-label="최신 Daily 지식 pulse">
      <div className="pulse-heading">
        <span className="eyebrow">최신 지식 전파</span>
        <strong>{pulse.latestDailyDate ?? "최신 Daily"}</strong>
        <small>{pulse.chains.length ? `대표 체인 1/${pulse.chains.length} · 전체 ${pulse.chains.length}개 종결` : "기록된 체인 없음"}</small>
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
  const route = atlasData.flow.routes.find((item) => item.id === state.routeId)!;
  const activeRouteRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeRouteRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [state.routeId]);
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
        {atlasData.flow.routes.map((item) => <button key={item.id} ref={item.id === state.routeId ? activeRouteRef : undefined} type="button" aria-pressed={item.id === state.routeId} className={item.id === state.routeId ? "is-active" : ""} onClick={() => dispatch({ type: "route", routeId: item.id })}><i style={{ background: routeColors[item.id] }} />{item.label}</button>)}
      </div>
      <ol className="mobile-stepper">
        {route.stations.map((station, index) => (
          <li key={station.id}>
            <span style={{ borderColor: routeColors[route.id] }}>{stationKind(station) === "proof_gate" ? "◇" : String(index + 1).padStart(2, "0")}</span>
            <button type="button" disabled={!station.entityId} onClick={() => station.entityId && dispatch({ type: "focus", focusId: station.entityId })}>
              <strong>{station.label}</strong>
              <small>{stationKind(station) === "proof_gate" ? "검증 관문 · " : ""}{station.entityId ? entityById.get(station.entityId)?.displayLabel : station.external ? "공개 경계 단계" : "역할 단계"}</small>
            </button>
          </li>
        ))}
      </ol>
      <div className="mobile-flow-proof"><CircleCheck size={18} /><span>이 안내 경로에는 {route.members.length}개 문서가 연결되어 있다. 실제 진행량이나 연결 횟수를 뜻하지 않는다.</span></div>
      <button className="mobile-theatre-action" type="button" onClick={() => dispatch({ type: "theatre", open: true })}>경로 읽기 집중 보기</button>
    </div>
  );
}
