import {
  ArrowRight,
  Box,
  Layers3,
  Link2,
  Radio,
  Rocket,
  SearchCheck,
  ShieldCheck,
  Sprout,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import {
  actorSurfaceLabel,
  actorsByGroup,
  currentHomeScene,
  DISTRICT_COLORS,
  HOME_SCENES,
  MOTION_SECONDS,
  publicDocumentCount,
  strongestKnowledgeRelation,
  type HomeSceneId,
} from "../agency/presentation";
import { atlasData } from "../data-runtime";
import { useAtlasState } from "../state";
import type { AgencyActor, MatrixCell } from "../types";

const actorIcons = {
  "actor:control-plane": ShieldCheck,
  "actor:daily-runner": Radio,
  "actor:atlas-builder": Box,
  "actor:rocket-manager": Rocket,
  "actor:groot-manager": Sprout,
  "actor:intelligence-layer-manager": Layers3,
} as const;

const publicDistrictAliases: Record<string, string> = {
  MOC: "중심 지식",
  Papers: "연구 논거",
  Strategy: "전략",
  Signals: "신호",
  "Console/Homi": "운영 기반",
};

const terrainPositions: Record<string, { x: number; y: number }> = {
  "중심 지식": { x: 92, y: 154 },
  "연구 논거": { x: 260, y: 92 },
  전략: { x: 430, y: 164 },
  "운영 기반": { x: 602, y: 100 },
  신호: { x: 756, y: 166 },
  "공개 근거 경계": { x: 858, y: 82 },
};

const terrainPositionsMobile: Record<string, { x: number; y: number }> = {
  "중심 지식": { x: 150, y: 64 },
  "연구 논거": { x: 460, y: 44 },
  전략: { x: 770, y: 64 },
  "운영 기반": { x: 150, y: 164 },
  신호: { x: 460, y: 144 },
  "공개 근거 경계": { x: 770, y: 164 },
};

function normalizeDistrict(name: string) {
  return publicDistrictAliases[name] ?? name;
}

function useOpeningScene() {
  const shouldReduceMotion = useReducedMotion();
  const [play, setPlay] = useState(() => {
    if (shouldReduceMotion) return false;
    try {
      return window.sessionStorage.getItem("homi-atlas-v7-3-home-entry-seen") !== "1";
    } catch {
      return true;
    }
  });
  useEffect(() => {
    if (!play) return;
    try { window.sessionStorage.setItem("homi-atlas-v7-3-home-entry-seen", "1"); } catch { /* session storage is optional */ }
    const timer = window.setTimeout(() => setPlay(false), 800);
    return () => window.clearTimeout(timer);
  }, [play]);
  return { play, shouldReduceMotion: Boolean(shouldReduceMotion) };
}

function HomeSceneRail({ active }: { active: HomeSceneId }) {
  const { dispatch } = useAtlasState();
  return (
    <nav className="home-scene-rail" aria-label="Home editorial scenes">
      {HOME_SCENES.map((scene) => (
        <button
          key={scene.id}
          type="button"
          className={active === scene.id ? "is-active" : ""}
          onClick={() => dispatch({ type: "journey", target: { workspace: "home", sceneId: scene.id } })}
          aria-current={active === scene.id ? "step" : undefined}
          aria-label={`${scene.index} ${scene.label}: ${scene.headline}`}
        >
          <span>{scene.index}</span>
          <strong>{scene.shortLabel}</strong>
        </button>
      ))}
    </nav>
  );
}

function ProofLedger({ recordCount, strongest }: { recordCount: number; strongest: MatrixCell | null }) {
  const metrics = [
    { value: "1", label: "사람 소유자 (Human Owner)", icon: UserRound },
    { value: String(atlasData.agency.actors.length), label: "에이전트 역할 · 핵심 3 · 독립 3", icon: SearchCheck },
    { value: recordCount.toLocaleString("ko-KR"), label: "공개 기록 (Public Records)", icon: Box },
    { value: strongest ? strongest.wikilink.toLocaleString("ko-KR") : "—", label: "최강 관계 (Strongest Relation)", icon: Link2 },
  ];
  return (
    <div className="home-proof-ledger" aria-label="공개 스냅샷 핵심 증거">
      {metrics.map(({ value, label, icon: Icon }) => (
        <div key={label}>
          <Icon size={19} strokeWidth={1.65} aria-hidden="true" />
          <strong>{value}</strong>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function HomeActions() {
  const { dispatch } = useAtlasState();
  return (
    <div className="home-primary-actions">
      <button type="button" className="is-primary" onClick={() => dispatch({ type: "workspace", workspace: "explore" })}>
        아틀라스 탐색 <ArrowRight size={17} aria-hidden="true" />
      </button>
      <button type="button" onClick={() => dispatch({ type: "workspace", workspace: "agency" })}>
        협업 구조 보기 <ArrowRight size={17} aria-hidden="true" />
      </button>
    </div>
  );
}

function HomeNarrative({ recordCount, strongest, deferActions = false }: {
  recordCount: number;
  strongest: MatrixCell | null;
  deferActions?: boolean;
}) {
  return (
    <section className="home-narrative">
      <span className="eyebrow">HUMAN × AGENT KNOWLEDGE SYSTEM</span>
      <h1 id="home-title" aria-label="한 사람의 방향이 전문 에이전트와 지식 지형을 움직인다.">
        <span>한 사람의 방향이</span>
        <span>전문 에이전트와</span>
        <span>지식 지형을 움직인다.</span>
      </h1>
      <p>
        Luke가 방향을 정하고, 세 개의 Homi 핵심 역할과 세 개의 독립 프로젝트 에이전트가 분리된 책임으로 지식을 선별·검증·발행합니다. 현재 {recordCount.toLocaleString("ko-KR")}개의 공개 기록이 그 협업이 남긴 지식 관계를 보여줍니다.
      </p>
      {!deferActions && <HomeActions />}
      <ProofLedger recordCount={recordCount} strongest={strongest} />
    </section>
  );
}

function ActorRow({ actor, selected }: { actor: AgencyActor; selected: boolean }) {
  const { dispatch } = useAtlasState();
  const Icon = actorIcons[actor.id as keyof typeof actorIcons] ?? Box;
  return (
    <button
      type="button"
      className={selected ? "home-actor-row is-selected" : "home-actor-row"}
      onClick={() => dispatch({ type: "actor", actorId: actor.id })}
      aria-label={`${actor.label}, 책임 표면 ${actorSurfaceLabel(atlasData.agency, actor)}`}
    >
      <Icon size={18} strokeWidth={1.65} aria-hidden="true" />
      <span><strong>{actor.label}</strong><small>{actorSurfaceLabel(atlasData.agency, actor)}</small></span>
    </button>
  );
}

function AgencyBand({ scene, playOpening, reducedMotion }: {
  scene: HomeSceneId;
  playOpening: boolean;
  reducedMotion: boolean;
}) {
  const groups = actorsByGroup(atlasData.agency);
  const showHistorical = scene === "responsibility-partition";
  const selectedActor = scene === "knowledge-return" ? "actor:atlas-builder" : null;
  return (
    <m.section
      className="home-agency-band"
      data-scene={scene}
      aria-label="Luke와 여섯 전문 역할"
      animate={reducedMotion ? { opacity: 1 } : {
        x: scene === "responsibility-partition" ? -10 : scene === "knowledge-return" ? 12 : 0,
        scale: scene === "responsibility-partition" ? 1.012 : 1,
      }}
      transition={{ duration: reducedMotion ? MOTION_SECONDS.fast : MOTION_SECONDS.scene }}
    >
      <m.div
        className="home-principal"
        initial={playOpening ? { opacity: 0.72, y: -4 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reducedMotion ? MOTION_SECONDS.fast : MOTION_SECONDS.control, delay: playOpening ? 0.12 : 0 }}
      >
        <UserRound size={20} aria-hidden="true" />
        <span><strong>Luke</strong><small>Human Owner</small></span>
      </m.div>

      {showHistorical && (
        <m.div
          className="home-historical-model"
          initial={{ opacity: 0, scaleX: 0.86 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ duration: reducedMotion ? MOTION_SECONDS.fast : MOTION_SECONDS.emphasis }}
        >
          <span>HISTORICAL MODEL · NON-ACTOR</span>
          <strong>단일 관리 세션 중심</strong>
          <small>SCHEMATIC · NOT WORKLOAD</small>
        </m.div>
      )}

      {showHistorical && (
        <m.div
          className="home-partition-flow"
          initial={reducedMotion ? false : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reducedMotion ? MOTION_SECONDS.fast : MOTION_SECONDS.emphasis }}
          aria-label="역사적 통합 역할에서 세 Homi Core 역할로 책임이 전문화됨"
        >
          <ArrowRight size={16} aria-hidden="true" />
          <span>3 DURABLE CORE ROLES</span>
        </m.div>
      )}

      <div className="home-authority-bus" aria-hidden="true">
        {atlasData.agency.actors.map((actor, index) => (
          <m.i
            key={actor.id}
            initial={playOpening ? { scaleY: 0, opacity: 0 } : false}
            animate={{ scaleY: 1, opacity: 1 }}
            transition={{ duration: reducedMotion ? MOTION_SECONDS.fast : MOTION_SECONDS.control, delay: playOpening ? 0.2 + index * 0.036 : 0 }}
          />
        ))}
      </div>

      <div className="home-agency-groups">
        {groups.map((group) => (
          <section key={group.id} className={`home-agency-group is-${group.kind}`}>
            <header><span>{group.kind === "core" ? "HOMI CORE" : "INDEPENDENT PROJECT OWNERS"}</span><b>{group.actors.length}</b></header>
            <div>
              {group.actors.map((actor, index) => (
                <m.div
                  key={actor.id}
                  initial={playOpening ? { opacity: 0, y: 8 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reducedMotion ? MOTION_SECONDS.fast : 0.2, delay: playOpening ? 0.24 + index * 0.036 : 0 }}
                >
                  <ActorRow actor={actor} selected={actor.id === selectedActor} />
                </m.div>
              ))}
            </div>
          </section>
        ))}
      </div>
      <p className="home-agency-note">직접 방향 6개 · 그룹은 권한 계층이 아닙니다.</p>
    </m.section>
  );
}

type TerrainNode = { name: string; documentCount: number; x: number; y: number; boundary?: boolean };

function terrainNodes(mobile: boolean): TerrainNode[] {
  const positions = mobile ? terrainPositionsMobile : terrainPositions;
  const districts = atlasData.structure.districts
    .map((district) => ({ ...district, publicName: normalizeDistrict(district.name) }))
    .filter((district) => positions[district.publicName])
    .filter((district, index, all) => all.findIndex((candidate) => candidate.publicName === district.publicName) === index)
    .map((district) => ({
      name: district.publicName,
      documentCount: district.documentCount,
      ...positions[district.publicName],
    }));
  return [
    ...districts,
    { name: "공개 근거 경계", documentCount: 0, ...positions["공개 근거 경계"], boundary: true },
  ];
}

function relationPath(source: TerrainNode, target: TerrainNode, index: number) {
  const midX = (source.x + target.x) / 2;
  const lift = 26 + (index % 4) * 12;
  const midY = Math.min(source.y, target.y) - lift;
  return `M ${source.x} ${source.y} Q ${midX} ${midY} ${target.x} ${target.y}`;
}

function KnowledgeTerrain({ scene, playOpening, reducedMotion }: {
  scene: HomeSceneId;
  playOpening: boolean;
  reducedMotion: boolean;
}) {
  const { state } = useAtlasState();
  const nodes = useMemo(() => terrainNodes(state.mobileSibling), [state.mobileSibling]);
  const byName = useMemo(() => new Map(nodes.map((node) => [node.name, node])), [nodes]);
  const visibleRelations = useMemo(() => atlasData.relation.matrix
    .map((relation) => ({
      relation,
      source: byName.get(normalizeDistrict(relation.source)),
      target: byName.get(normalizeDistrict(relation.target)),
    }))
    .filter((item): item is { relation: MatrixCell; source: TerrainNode; target: TerrainNode } => Boolean(item.source && item.target))
    .sort((left, right) => right.relation.wikilink - left.relation.wikilink), [byName]);
  const strongest = visibleRelations[0] ?? null;
  const maxDocuments = Math.max(1, ...nodes.map((node) => node.documentCount));
  const independentOwnership = scene === "independent-ownership";
  const knowledgeReturn = scene === "knowledge-return";
  const selectedNames = new Set(strongest ? [strongest.source.name, strongest.target.name] : []);

  return (
    <m.section
      className="home-knowledge-terrain"
      aria-label="공개 지식 지형"
      initial={playOpening && !reducedMotion ? { scale: 1.018, y: 4, opacity: .9 } : false}
      animate={{ scale: knowledgeReturn ? 1.018 : 1, x: knowledgeReturn ? -8 : 0 }}
      transition={{ duration: reducedMotion ? MOTION_SECONDS.fast : playOpening ? MOTION_SECONDS.entry : MOTION_SECONDS.scene }}
      data-scene={scene}
    >
      <header>
        <span>KNOWLEDGE TERRAIN</span>
        <p className="terrain-legend">구역색은 의미, 크기는 공개 기록 수, 선 굵기는 실제 관계 가중치를 나타냅니다.</p>
        {strongest && (
          <p className="terrain-header-summary">
            {strongest.source.name} ↔ {strongest.target.name} · <b>{strongest.relation.wikilink.toLocaleString("ko-KR")}</b>
          </p>
        )}
      </header>
      <div className="home-terrain-canvas">
        <svg viewBox="0 0 920 240" aria-hidden="true" preserveAspectRatio="none">
          {visibleRelations.map(({ relation, source, target }, index) => {
            const isStrongest = relation.id === strongest?.relation.id;
            const width = 1.25 + 4.75 * Math.sqrt(relation.wikilink / Math.max(1, strongest?.relation.wikilink ?? relation.wikilink));
            const path = relationPath(source, target, index);
            const relationColor = DISTRICT_COLORS[source.name] ?? "var(--district-research)";
            return (
              <g key={relation.id} className={isStrongest ? "is-strongest" : ""}>
                {isStrongest && (
                  <path
                    d={path}
                    className="terrain-relation-underlay"
                    style={{ stroke: `color-mix(in srgb, ${relationColor} 22%, transparent)` }}
                  />
                )}
                <m.path
                  d={path}
                  className="terrain-relation"
                  style={{ stroke: relationColor, strokeWidth: width }}
                  initial={playOpening && isStrongest ? { pathLength: 0, opacity: 0.2 } : false}
                  animate={{
                    pathLength: 1,
                    opacity: independentOwnership ? 0.12 : knowledgeReturn ? (isStrongest ? 1 : 0.18) : isStrongest ? 0.9 : 0.3,
                  }}
                  transition={{ duration: reducedMotion ? MOTION_SECONDS.fast : playOpening && isStrongest ? MOTION_SECONDS.control : MOTION_SECONDS.scene, delay: playOpening && isStrongest ? 0.62 : 0 }}
                />
              </g>
            );
          })}
        </svg>
        {nodes.map((node) => {
          const size = node.boundary ? 58 : 52 + 34 * Math.sqrt(node.documentCount / maxDocuments);
          const selected = knowledgeReturn && selectedNames.has(node.name);
          return (
            <div key={node.name}>
              {!node.boundary && (
                <m.i
                  className="terrain-contour"
                  aria-hidden="true"
                  style={{
                    left: `${(node.x / 920) * 100}%`,
                    top: `${(node.y / 240) * 100}%`,
                    width: size + 28,
                    height: size + 28,
                    color: DISTRICT_COLORS[node.name] ?? "var(--ink)",
                  }}
                  initial={playOpening && !reducedMotion ? { opacity: 0, scale: .84 } : false}
                  animate={{ opacity: independentOwnership ? .08 : knowledgeReturn && !selected ? .1 : .2, scale: 1 }}
                  transition={{ duration: reducedMotion ? MOTION_SECONDS.fast : MOTION_SECONDS.scene, delay: playOpening ? .5 : 0 }}
                />
              )}
              <m.div
                className={`terrain-node${node.boundary ? " is-boundary" : ""}${selected ? " is-selected" : ""}`}
                data-node={node.name}
                style={{
                  left: `${(node.x / 920) * 100}%`,
                  top: `${(node.y / 240) * 100}%`,
                  width: size,
                  minHeight: size,
                  color: DISTRICT_COLORS[node.name] ?? "var(--ink)",
                }}
                initial={playOpening && !reducedMotion ? { opacity: 0, scale: .84 } : false}
                animate={{
                  opacity: independentOwnership ? (node.boundary ? 0.72 : 0.34) : knowledgeReturn ? (selected ? 1 : 0.45) : 1,
                  scale: selected ? 1.05 : 1,
                }}
                transition={{ duration: reducedMotion ? MOTION_SECONDS.fast : MOTION_SECONDS.scene, delay: playOpening ? .5 : 0 }}
              >
                <strong>{node.name}</strong>
                <span>{node.boundary ? "PUBLIC" : node.documentCount.toLocaleString("ko-KR")}</span>
              </m.div>
            </div>
          );
        })}
        {strongest && (
          <m.p
            className="terrain-strongest-readout"
            animate={{ opacity: independentOwnership ? 0.24 : 1, y: knowledgeReturn ? -2 : 0 }}
            transition={{ duration: reducedMotion ? MOTION_SECONDS.fast : MOTION_SECONDS.scene }}
          >
            {strongest.source.name} ↔ {strongest.target.name} · <b>{strongest.relation.wikilink.toLocaleString("ko-KR")}</b>
          </m.p>
        )}
      </div>
      <p className="sr-only">
        {visibleRelations.map(({ relation, source, target }) => `${source.name}와 ${target.name} ${relation.wikilink}회`).join(", ")}
      </p>
    </m.section>
  );
}

function KnowledgeReturnBoundary({ active, reducedMotion }: {
  active: boolean;
  reducedMotion: boolean;
}) {
  return (
    <div
      className={active ? "home-knowledge-return-boundary is-active" : "home-knowledge-return-boundary"}
      aria-label="검증된 버전 스냅샷 경계"
    >
      <span className="snapshot-boundary-label">VERIFIED RELEASE SNAPSHOT</span>
      {active && (
        <m.aside
          className="publication-crossing"
          initial={reducedMotion ? false : { opacity: 0, x: -18 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: reducedMotion ? MOTION_SECONDS.fast : MOTION_SECONDS.emphasis }}
          aria-label="Atlas Builder가 검증된 공개 경계를 지나 지식 지형으로 결과와 증거를 돌려주는 경로"
        >
          <Box size={16} aria-hidden="true" />
          <span>ATLAS BUILDER</span>
          <ArrowRight size={16} aria-hidden="true" />
          <ShieldCheck size={16} aria-hidden="true" />
          <strong>VERIFIED KNOWLEDGE RETURN</strong>
        </m.aside>
      )}
    </div>
  );
}

function HomeStage({ scene, playOpening, reducedMotion }: {
  scene: HomeSceneId;
  playOpening: boolean;
  reducedMotion: boolean;
}) {
  const sceneCopy = HOME_SCENES.find((item) => item.id === scene)!;
  return (
    <section className="home-system-stage" data-scene={scene}>
      <HomeSceneRail active={scene} />
      <m.div
        className="home-scene-copy"
        key={scene}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reducedMotion ? MOTION_SECONDS.fast : 0.42 }}
        aria-live="polite"
      >
        <span>{sceneCopy.label}</span>
        <strong>{sceneCopy.headline}</strong>
        <p>{sceneCopy.body}</p>
      </m.div>
      <AgencyBand scene={scene} playOpening={playOpening} reducedMotion={reducedMotion} />
      <KnowledgeReturnBoundary active={scene === "knowledge-return"} reducedMotion={reducedMotion} />
      <KnowledgeTerrain scene={scene} playOpening={playOpening} reducedMotion={reducedMotion} />
    </section>
  );
}

function MobileHome({ scene, recordCount, strongest, playOpening, reducedMotion }: {
  scene: HomeSceneId;
  recordCount: number;
  strongest: MatrixCell | null;
  playOpening: boolean;
  reducedMotion: boolean;
}) {
  return (
    <div className="home-mobile-composition">
      <HomeNarrative recordCount={recordCount} strongest={strongest} deferActions />
      <HomeSceneRail active={scene} />
      <AgencyBand scene={scene} playOpening={playOpening} reducedMotion={reducedMotion} />
      <KnowledgeReturnBoundary active={scene === "knowledge-return"} reducedMotion={reducedMotion} />
      <KnowledgeTerrain scene={scene} playOpening={playOpening} reducedMotion={reducedMotion} />
      <HomeActions />
    </div>
  );
}

export function HomeView() {
  const { state } = useAtlasState();
  const scene = currentHomeScene(state.sceneId);
  const recordCount = publicDocumentCount(atlasData);
  const strongest = strongestKnowledgeRelation(atlasData);
  const { play: playOpening, shouldReduceMotion } = useOpeningScene();

  if (state.mobileSibling) {
    return (
      <section className="home-view-v73 is-mobile" aria-labelledby="home-title" data-scene={scene} data-opening={playOpening && !shouldReduceMotion}>
        <MobileHome
          scene={scene}
          recordCount={recordCount}
          strongest={strongest}
          playOpening={playOpening && !shouldReduceMotion}
          reducedMotion={shouldReduceMotion}
        />
        <p className="home-version-boundary"><ShieldCheck size={14} aria-hidden="true" /> {atlasData.agency.snapshot.caveat} · 기준일 {atlasData.agency.snapshot.asOfDate}</p>
      </section>
    );
  }

  return (
    <section className="home-view-v73" aria-labelledby="home-title" data-scene={scene} data-opening={playOpening && !shouldReduceMotion}>
      <HomeNarrative recordCount={recordCount} strongest={strongest} />
      <HomeStage scene={scene} playOpening={playOpening && !shouldReduceMotion} reducedMotion={shouldReduceMotion} />
      <p className="home-version-boundary"><ShieldCheck size={14} aria-hidden="true" /> {atlasData.agency.snapshot.caveat} · 기준일 {atlasData.agency.snapshot.asOfDate}</p>
    </section>
  );
}
