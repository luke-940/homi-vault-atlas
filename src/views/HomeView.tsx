import {
  Activity,
  ArrowRight,
  Binoculars,
  Compass,
  GitBranch,
  Link2,
  Network,
  Route,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { MOTION_SECONDS } from "../agency/presentation";
import { atlasData } from "../data-runtime";
import { useAtlasState } from "../state";
import type { AtlasStructureAssociationV2, AtlasStructureNodeV2, Workspace } from "../types";
import { workspaceSceneRegistry } from "../components/workspaceSceneRegistry";
import { strokeColorForDistrict } from "../viz/palette";

type HomeSceneId = "living-terrain" | "knowledge-gravity" | "verified-activity" | "coverage-boundary";

type InventoryProjection = {
  profile: "atlas-owner" | "atlas-public";
  asOfDate: string;
  physicalMarkdownCount: number;
  namedCount: number;
  aggregateCount: number;
  excludedCount: number;
  unclassifiedCount: number;
  reconciliation: { pass: boolean };
};

const HOME_SCENE_COPY: Record<HomeSceneId, { kicker: string; title: string; body: string }> = {
  "living-terrain": {
    kicker: "01 · Living Terrain",
    title: "지식이 축적된 실제 지형을 먼저 읽습니다.",
    body: "구역과 허브를 같은 점으로 뭉개지 않고, 공개 스냅샷에 존재하는 구조와 관계를 서로 다른 층으로 보여줍니다.",
  },
  "knowledge-gravity": {
    kicker: "02 · Knowledge Gravity",
    title: "많이 연결된 허브가 더 큰 중력을 갖습니다.",
    body: "허브 크기는 고유 inbound 문서 수, 보조 수치는 link occurrence입니다. 두 단위를 합산하지 않습니다.",
  },
  "verified-activity": {
    kicker: "03 · Verified Activity Pulse",
    title: "날짜 근거가 확인된 변화만 한 번 맥동합니다.",
    body: "mtime이나 실시간 신호를 활동으로 추정하지 않습니다. 의미 있는 날짜가 없는 허브는 정적으로 남습니다.",
  },
  "coverage-boundary": {
    kicker: "04 · Coverage Boundary",
    title: "보이는 것과 집계·제외된 것을 함께 설명합니다.",
    body: "공개판의 이름은 allowlist와 안전 별칭을 따릅니다. 제외는 누락이 아니라 공개 경계의 일부입니다.",
  },
};

const districtAliases: Record<string, string> = {
  MOC: "중심 지식",
  Papers: "연구 논거",
  Strategy: "전략",
  Signals: "신호",
  "Console/Homi": "운영 기반",
};

const districtSlots = [
  { x: 118, y: 292 }, { x: 266, y: 138 }, { x: 354, y: 388 },
  { x: 486, y: 224 }, { x: 604, y: 410 }, { x: 700, y: 132 },
  { x: 808, y: 302 }, { x: 902, y: 164 }, { x: 906, y: 458 },
] as const;

const hubSlots = [
  { x: 70, y: 100 }, { x: 72, y: 480 }, { x: 188, y: 72 }, { x: 218, y: 232 },
  { x: 240, y: 500 }, { x: 382, y: 88 }, { x: 402, y: 496 }, { x: 526, y: 92 },
  { x: 542, y: 326 }, { x: 624, y: 508 }, { x: 734, y: 68 }, { x: 754, y: 454 },
  { x: 858, y: 88 }, { x: 926, y: 260 }, { x: 850, y: 520 },
] as const;

const launchItems: Array<{ id: Exclude<Workspace, "home">; label: string; description: string; icon: typeof Compass }> = [
  { id: "explore", label: "Explore", description: "구역 → 허브 → 공개 원천", icon: Compass },
  { id: "observe", label: "Observe", description: "구역과 허브의 관계", icon: Binoculars },
  { id: "flow", label: "Flow", description: "검증된 지식 경로", icon: Route },
  { id: "time", label: "Time", description: "기록된 변천 장면", icon: GitBranch },
  { id: "agency", label: "Agency", description: "책임과 증거 경계", icon: Network },
];

function normalizedDistrict(name: string) {
  return districtAliases[name] ?? name;
}

function inventoryProjection(): InventoryProjection {
  const inventory = atlasData.inventory;
  return {
    profile: inventory.profile,
    asOfDate: inventory.asOfDate,
    physicalMarkdownCount: inventory.physicalMarkdownCount,
    namedCount: inventory.namedCount,
    aggregateCount: inventory.aggregateCount,
    excludedCount: inventory.excludedCount,
    unclassifiedCount: inventory.unclassifiedCount,
    reconciliation: { pass: inventory.reconciliation.pass },
  };
}

function structureNodes(): AtlasStructureNodeV2[] {
  const projected = atlasData.structure.nodes;
  if (projected?.length) return projected;
  return atlasData.entity.entities.map((entity) => ({
    id: entity.id,
    kind: entity.surfaceRole === "hub" ? "moc_hub" : "source_document",
    label: entity.displayLabel,
    parentId: entity.parentId,
    districtId: entity.district,
    documentCount: entity.documentCount ?? 1,
    uniqueInboundDocuments: (atlasData.relation.neighborhoods[entity.id] ?? []).filter((neighbor) => neighbor.direction === "incoming").length,
    inboundLinkOccurrences: (atlasData.relation.neighborhoods[entity.id] ?? []).filter((neighbor) => neighbor.direction === "incoming").reduce((sum, neighbor) => sum + neighbor.weight, 0),
    lastMeaningfulDate: null,
    nameMode: "aggregate" as const,
  }));
}

function useOpeningScene() {
  const reduced = Boolean(useReducedMotion());
  const [opening, setOpening] = useState(() => {
    if (reduced) return false;
    try { return sessionStorage.getItem("homi-atlas-v7-4-opening-seen") !== "1"; } catch { return true; }
  });
  useEffect(() => {
    if (!opening) return;
    try { sessionStorage.setItem("homi-atlas-v7-4-opening-seen", "1"); } catch { /* optional */ }
    const timer = window.setTimeout(() => setOpening(false), 800);
    return () => window.clearTimeout(timer);
  }, [opening]);
  return { opening, reduced };
}

function HomeSceneRail({ scene }: { scene: HomeSceneId }) {
  const { dispatch } = useAtlasState();
  return (
    <nav className="v74-scene-rail" aria-label="Home scenes" lang="en">
      {workspaceSceneRegistry.home.scenes.map((item, index) => (
        <button
          key={item.id}
          type="button"
          className={scene === item.id ? "is-active" : ""}
          aria-current={scene === item.id ? "step" : undefined}
          onClick={() => dispatch({ type: "journey", target: { workspace: "home", sceneId: item.id } })}
        >
          <span>{String(index + 1).padStart(2, "0")}</span>
          <strong>{item.label}</strong>
        </button>
      ))}
    </nav>
  );
}

export function strongestDistrictRelation() {
  return [...atlasData.relation.matrix]
    .filter((pair) => pair.wikilink > 0)
    .sort((left, right) => right.wikilink - left.wikilink || left.id.localeCompare(right.id))[0] ?? null;
}

function districtRelationLabels(pair: ReturnType<typeof strongestDistrictRelation>) {
  if (!pair) return null;
  return pair.wikilinkReverse > pair.wikilinkForward
    ? { source: pair.target, target: pair.source }
    : { source: pair.source, target: pair.target };
}

function relationPath(source: { x: number; y: number }, target: { x: number; y: number }, index: number) {
  const midX = (source.x + target.x) / 2;
  const bend = 54 + (index % 3) * 22;
  return `M ${source.x} ${source.y} Q ${midX} ${Math.min(source.y, target.y) - bend} ${target.x} ${target.y}`;
}

function KnowledgeTerrain({ scene, opening, reduced }: { scene: HomeSceneId; opening: boolean; reduced: boolean }) {
  const { dispatch } = useAtlasState();
  const rawNodes = useMemo(structureNodes, []);
  const hubs = useMemo(() => rawNodes
    .filter((node) => ["moc_hub", "paper_gateway", "project", "signal_domain", "strategy_insight", "strategy_request"].includes(node.kind))
    .sort((left, right) => right.uniqueInboundDocuments - left.uniqueInboundDocuments || right.inboundLinkOccurrences - left.inboundLinkOccurrences || left.label.localeCompare(right.label, "ko"))
    .slice(0, 15), [rawNodes]);
  const districts = useMemo(() => rawNodes
    .filter((node) => node.kind === "district")
    .sort((left, right) => right.documentCount - left.documentCount || left.label.localeCompare(right.label, "ko"))
    .map((node, index) => ({
      ...node,
      label: normalizedDistrict(node.label),
      rawLabel: node.label,
      position: districtSlots[index % districtSlots.length],
    })), [rawNodes]);
  const districtByRaw = useMemo(() => new Map(districts.flatMap((district) => [
    [district.id, district.label] as const,
    [district.rawLabel, district.label] as const,
  ])), [districts]);
  const hubLayout = useMemo(() => hubs.map((hub, index) => {
    const districtName = districtByRaw.get(hub.districtId) ?? normalizedDistrict(hub.districtId) ?? districts[index % districts.length]?.label;
    const slot = hubSlots[index % hubSlots.length];
    return {
      ...hub,
      districtName,
      x: slot.x,
      y: slot.y,
    };
  }), [districtByRaw, districts, hubs]);
  const relations = useMemo(() => {
    const hubById = new Map(hubLayout.map((hub) => [hub.id, hub]));
    return atlasData.structure.associations
      .filter((edge) => edge.kind === "references" && edge.weight > 0)
      .map((relation) => ({
        relation,
        source: hubById.get(relation.source),
        target: hubById.get(relation.target),
      }))
      .filter((item): item is {
        relation: AtlasStructureAssociationV2;
        source: (typeof hubLayout)[number];
        target: (typeof hubLayout)[number];
      } => Boolean(item.source && item.target))
      .sort((left, right) => right.relation.weight - left.relation.weight || left.relation.id.localeCompare(right.relation.id));
  }, [hubLayout]);
  const strongest = relations[0];
  const strongestDistrict = useMemo(strongestDistrictRelation, []);
  const strongestDistrictLabels = districtRelationLabels(strongestDistrict);
  const strongestDistrictAnchors = strongestDistrictLabels
    ? {
        source: districts.find((district) => district.label === strongestDistrictLabels.source),
        target: districts.find((district) => district.label === strongestDistrictLabels.target),
      }
    : null;
  const maxInbound = Math.max(1, ...hubLayout.map((hub) => hub.uniqueInboundDocuments));
  const datedHubs = hubLayout.filter((hub) => Boolean(hub.lastMeaningfulDate));
  const sceneCopy = HOME_SCENE_COPY[scene];

  return (
    <m.section
      className="living-terrain"
      data-scene={scene}
      initial={opening && !reduced ? { opacity: .72, scale: 1.018 } : false}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: reduced ? MOTION_SECONDS.fast : MOTION_SECONDS.entry }}
      aria-labelledby="terrain-title"
    >
      <header className="terrain-intro">
        <div>
          <span className="eyebrow" lang="en">{sceneCopy.kicker}</span>
          <h2 id="terrain-title">{sceneCopy.title}</h2>
          <p>{sceneCopy.body}</p>
        </div>
      </header>
      <div className="terrain-stage" data-testid="living-terrain">
        <svg viewBox="0 0 1000 560" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          <defs>
            <linearGradient id="terrain-fade" x1="0" x2="1">
              <stop offset="0" stopColor="#fbfaf6" stopOpacity=".35" />
              <stop offset=".5" stopColor="#dfeae5" stopOpacity=".68" />
              <stop offset="1" stopColor="#fbfaf6" stopOpacity=".2" />
            </linearGradient>
          </defs>
          {relations.map(({ relation, source, target }, index) => {
            const sourcePoint = source;
            const targetPoint = target;
            const isStrongestHubEdge = relation.id === strongest?.relation.id;
            const width = 1.1 + 6.2 * Math.sqrt(relation.weight / Math.max(1, strongest?.relation.weight ?? relation.weight));
            return (
              <m.path
                key={relation.id}
                d={relationPath(sourcePoint, targetPoint, index)}
                className="v74-terrain-relation is-hub-edge"
                style={{ stroke: strokeColorForDistrict(source.districtName), strokeWidth: width }}
                initial={opening && isStrongestHubEdge && !reduced ? { pathLength: 0, opacity: 0 } : false}
                animate={{
                  pathLength: 1,
                  opacity: scene === "coverage-boundary" ? .13 : scene === "knowledge-gravity" ? .16 : .38,
                }}
                transition={{ duration: reduced ? MOTION_SECONDS.fast : MOTION_SECONDS.scene, delay: opening && isStrongestHubEdge ? .2 : 0 }}
              />
            );
          })}
          {strongestDistrict && strongestDistrictLabels && strongestDistrictAnchors?.source && strongestDistrictAnchors.target && (
            <m.path
              d={relationPath(strongestDistrictAnchors.source.position, strongestDistrictAnchors.target.position, 0)}
              className="v74-terrain-relation is-district-strongest"
              data-relation-source={strongestDistrictLabels.source}
              data-relation-target={strongestDistrictLabels.target}
              data-relation-value={strongestDistrict.wikilink}
              style={{ stroke: strokeColorForDistrict(strongestDistrictLabels.source), strokeWidth: 7.4 }}
              initial={opening && !reduced ? { pathLength: 0, opacity: 0 } : false}
              animate={{
                pathLength: 1,
                opacity: scene === "knowledge-gravity" ? .96 : scene === "coverage-boundary" ? .1 : .28,
              }}
              transition={{ duration: reduced ? MOTION_SECONDS.fast : MOTION_SECONDS.scene, delay: opening ? .2 : 0 }}
            />
          )}
        </svg>
        {districts.map((district, index) => {
          const position = district.position;
          return (
            <m.button
              key={district.id}
              type="button"
              className="terrain-district"
              style={{ left: `${position.x / 10}%`, top: `${position.y / 5.6}%`, color: strokeColorForDistrict(district.label) }}
              initial={opening && !reduced ? { opacity: 0, y: 12 } : false}
              animate={{ opacity: scene === "coverage-boundary" ? .42 : 1, y: 0 }}
              transition={{ duration: reduced ? MOTION_SECONDS.fast : MOTION_SECONDS.control, delay: opening ? .2 + index * .045 : 0 }}
              onClick={() => dispatch({ type: "journey", target: { workspace: "explore", sceneId: "hubs", focusId: district.id } })}
              aria-label={`${district.label}, ${district.documentCount}개 기록, Explore에서 열기`}
            >
              <span>{district.label}</span>
              <strong>{district.documentCount.toLocaleString("ko-KR")}</strong>
            </m.button>
          );
        })}
        {hubLayout.map((hub, index) => {
          const scale = .72 + .76 * Math.sqrt(hub.uniqueInboundDocuments / maxInbound);
          const dated = Boolean(hub.lastMeaningfulDate);
          return (
            <m.button
              key={hub.id}
              type="button"
              className={`terrain-hub${dated ? " has-date" : ""}`}
              data-activity={dated && scene === "verified-activity" ? "verified" : "static"}
              style={{
                left: `${hub.x / 10}%`,
                top: `${hub.y / 5.6}%`,
                color: strokeColorForDistrict(hub.districtName),
                width: `${Math.round(54 * scale)}px`,
                minHeight: `${Math.round(54 * scale)}px`,
              }}
              initial={opening && !reduced ? { opacity: 0, scale: .7 } : false}
              animate={scene === "verified-activity" && dated && !reduced
                ? { opacity: 1, scale: [1, 1.055, 1] }
                : { opacity: scene === "coverage-boundary" ? .48 : 1, scale: scene === "knowledge-gravity" ? Math.min(1.08, .96 + scale * .05) : 1 }}
              transition={{ duration: reduced ? MOTION_SECONDS.fast : dated && scene === "verified-activity" ? .56 : MOTION_SECONDS.scene, delay: opening ? .32 + index * .035 : index * .018 }}
              onClick={() => dispatch({ type: "journey", target: { workspace: "explore", sceneId: "sources", focusId: hub.id } })}
              aria-label={`${hub.label}, 고유 inbound 문서 ${hub.uniqueInboundDocuments}, 링크 출현 ${hub.inboundLinkOccurrences}${hub.lastMeaningfulDate ? `, 의미 날짜 ${hub.lastMeaningfulDate}` : ", 의미 날짜 미기록"}`}
            >
              <strong>{hub.uniqueInboundDocuments}</strong>
              <span>{hub.label}</span>
            </m.button>
          );
        })}
        {!hubLayout.length && (
          <div className="terrain-honest-empty" role="note">
            <ShieldCheck size={18} aria-hidden="true" />
            <p><strong>공개 이름으로 표현할 허브가 없습니다.</strong><span>구역 집계와 관계만 표시합니다. 허브 이름을 임의로 만들지 않습니다.</span></p>
          </div>
        )}
        {scene === "verified-activity" && !datedHubs.length && (
          <div className="terrain-honest-empty is-activity" role="note">
            <Activity size={18} aria-hidden="true" />
            <p><strong>맥동시킬 검증 날짜가 없습니다.</strong><span>부재를 0건이나 비활성으로 해석하지 않습니다.</span></p>
          </div>
        )}
        {strongestDistrict && strongestDistrictLabels && scene === "knowledge-gravity" && (
          <div className="terrain-relation-readout">
            <Link2 size={15} aria-hidden="true" />
            <span>{strongestDistrictLabels.source} ↔ {strongestDistrictLabels.target}</span>
            <strong>{strongestDistrict.wikilink.toLocaleString("ko-KR")}</strong>
            <small>district link occurrences</small>
          </div>
        )}
      </div>
      <div className="terrain-mobile-hubs" aria-label="중력 허브 순위">
        {hubLayout.slice(0, 8).map((hub) => (
          <button
            key={`mobile-${hub.id}`}
            type="button"
            onClick={() => dispatch({ type: "journey", target: { workspace: "explore", sceneId: "sources", focusId: hub.id } })}
          >
            <i style={{ background: strokeColorForDistrict(hub.districtName) }} aria-hidden="true" />
            <span><strong>{hub.label}</strong><small>고유 inbound {hub.uniqueInboundDocuments} · 출현 {hub.inboundLinkOccurrences}</small></span>
          </button>
        ))}
      </div>
    </m.section>
  );
}

function CoverageLedger({ inventory }: { inventory: InventoryProjection }) {
  const rows = [
    { label: "전체 Markdown", value: inventory.physicalMarkdownCount, tone: "physical" },
    { label: "이름으로 표현", value: inventory.namedCount, tone: "named" },
    { label: "안전하게 집계", value: inventory.aggregateCount, tone: "aggregate" },
    { label: "경계상 제외", value: inventory.excludedCount, tone: "excluded" },
  ];
  return (
    <section className="coverage-ledger" aria-labelledby="coverage-ledger-title">
      <header>
        <div><span className="eyebrow" lang="en">Coverage Ledger</span><h2 id="coverage-ledger-title">보이는 것과 보이지 않는 이유</h2></div>
        <span className={inventory.reconciliation.pass && inventory.unclassifiedCount === 0 ? "coverage-status is-pass" : "coverage-status is-fail"}>
          {inventory.reconciliation.pass && inventory.unclassifiedCount === 0 ? "RECONCILED" : "REVIEW REQUIRED"}
        </span>
      </header>
      <div className="coverage-ledger-grid">
        {rows.map((row) => (
          <div key={row.label} className={`is-${row.tone}`}><strong>{row.value.toLocaleString("ko-KR")}</strong><span>{row.label}</span></div>
        ))}
      </div>
      <p>공개판은 승인 이름·구조적 별칭·집계를 사용합니다. 미분류 {inventory.unclassifiedCount}개 · 기준일 {inventory.asOfDate}</p>
    </section>
  );
}

function AgencyProvenanceBand() {
  const { dispatch } = useAtlasState();
  const groups = atlasData.agency.groups.map((group) => ({
    ...group,
    actors: group.actorIds.map((id) => atlasData.agency.actors.find((actor) => actor.id === id)).filter(Boolean),
  }));
  return (
    <section className="provenance-band" aria-labelledby="provenance-title">
      <button type="button" className="provenance-owner" onClick={() => dispatch({ type: "workspace", workspace: "agency" })}>
        <span>Luke</span><small>Human Owner</small>
      </button>
      <div className="provenance-rail" aria-hidden="true" />
      <div className="provenance-groups">
        {groups.map((group) => (
          <div key={group.id}>
            <span>{group.kind === "core" ? "Homi Core" : "Independent Owners"}</span>
            <div>
              {group.actors.map((actor) => actor && (
                <button key={actor.id} type="button" onClick={() => dispatch({ type: "actor", actorId: actor.id })}>{actor.label}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="provenance-copy">
        <span className="eyebrow" lang="en">Agency Provenance</span>
        <h2 id="provenance-title">방향·책임·증거의 출처</h2>
        <p>운영 역할은 지식 노드가 아닙니다. Luke의 방향 아래 분리된 책임이 결과와 검증 가능한 증거를 돌려줍니다.</p>
      </div>
    </section>
  );
}

function WorkspaceLauncher() {
  const { dispatch } = useAtlasState();
  return (
    <nav className="home-workspace-launcher" aria-label="Atlas 작업 공간">
      {launchItems.map(({ id, label, description, icon: Icon }) => (
        <button key={id} type="button" aria-label={`${label}: ${description}`} onClick={() => dispatch({ type: "workspace", workspace: id })}>
          <Icon size={17} aria-hidden="true" />
          <strong lang="en">{label}</strong>
          <ArrowRight size={15} aria-hidden="true" />
        </button>
      ))}
      <button type="button" aria-label="Search: 역할과 지식 통합 검색" onClick={() => dispatch({ type: "search", open: true })}>
        <Search size={17} aria-hidden="true" />
        <strong lang="en">Search</strong>
        <ArrowRight size={15} aria-hidden="true" />
      </button>
    </nav>
  );
}

export function HomeView() {
  const { state, dispatch } = useAtlasState();
  const scene = (workspaceSceneRegistry.home.scenes.some((item) => item.id === state.sceneId)
    ? state.sceneId
    : workspaceSceneRegistry.home.defaultScene) as HomeSceneId;
  const inventory = inventoryProjection();
  const strongest = strongestDistrictRelation();
  const { opening, reduced } = useOpeningScene();
  const represented = inventory.namedCount + inventory.aggregateCount;

  return (
    <section className="home-view-v74" aria-labelledby="home-title" data-scene={scene} data-opening={opening && !reduced ? "true" : "false"}>
      <header className="home-v74-hero">
        <div className="home-v74-copy">
          <span className="eyebrow" lang="en">HUMAN × AGENT · LIVING KNOWLEDGE TERRAIN</span>
          <h1 id="home-title">한 사람의 방향이<br />살아 있는 지식 지형이 된다.</h1>
          <p>{inventory.physicalMarkdownCount.toLocaleString("ko-KR")}개의 기록에서 구조·관계·시간 증거를 분리해, 지식이 어디에 쌓이고 무엇이 서로를 움직이는지 보여줍니다.</p>
          <div className="home-v74-actions">
            <button type="button" className="is-primary" onClick={() => dispatch({ type: "journey", target: { workspace: "explore", sceneId: "districts" } })}>지형 탐색 <ArrowRight size={16} aria-hidden="true" /></button>
            <button type="button" onClick={() => dispatch({ type: "search", open: true })}>증거 찾기 <Search size={16} aria-hidden="true" /></button>
          </div>
          <dl className="home-v74-proof">
            <div><dt>표현 범위</dt><dd>{represented.toLocaleString("ko-KR")}<small>named + aggregate</small></dd></div>
            <div><dt>지식 구역</dt><dd>{atlasData.structure.nodes.filter((node) => node.kind === "district").length}<small>districts</small></dd></div>
            <div><dt>가장 강한 관계</dt><dd>{strongest?.wikilink.toLocaleString("ko-KR") ?? "—"}<small>district link occurrences</small></dd></div>
          </dl>
        </div>
        <div className="home-v74-terrain-column">
          <HomeSceneRail scene={scene} />
          <KnowledgeTerrain scene={scene} opening={opening && !reduced} reduced={reduced} />
        </div>
      </header>
      <div className="home-v74-evidence-row">
        <CoverageLedger inventory={inventory} />
        <AgencyProvenanceBand />
      </div>
      <WorkspaceLauncher />
      <p className="home-v74-snapshot"><ShieldCheck size={14} aria-hidden="true" /> 검증된 버전 스냅샷 · 실시간 운영 상태 아님 · 기준일 {inventory.asOfDate}</p>
    </section>
  );
}
