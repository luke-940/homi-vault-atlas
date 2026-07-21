import {
  ArrowDown,
  Ban,
  Box,
  CheckCircle2,
  FileCheck2,
  Layers3,
  Radio,
  Rocket,
  ShieldCheck,
  Sprout,
  UserRound,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { atlasData } from "../data-runtime";
import {
  actorSurfaceLabel,
  actorsByGroup,
  AGENCY_SCENES,
  currentAgencyScene,
  MOTION_SECONDS,
  strongestKnowledgeRelation,
} from "../agency/presentation";
import { useAtlasState } from "../state";
import type { AgencyActor, AgencyScene } from "../types";
import { strokeColorForDistrict } from "../viz/palette";

const actorIcons = {
  "actor:control-plane": ShieldCheck,
  "actor:daily-runner": Radio,
  "actor:atlas-builder": Box,
  "actor:rocket-manager": Rocket,
  "actor:groot-manager": Sprout,
  "actor:intelligence-layer-manager": Layers3,
} as const;

const defaultActorId = "actor:atlas-builder";

export function agencyKnowledgeDistricts() {
  return atlasData.graph.nodes
    .filter((node) => node.kind === "district")
    .sort((left, right) => right.representedDocuments - left.representedDocuments || left.label.localeCompare(right.label, "ko"));
}

export function agencyKnowledgeTarget(districtId: string) {
  return { workspace: "explore" as const, sceneId: "graph", focusId: districtId, districtId };
}

function AgencySceneRail({ scene }: { scene: AgencyScene }) {
  const { state, dispatch } = useAtlasState();
  return (
    <nav className="agency-scene-rail" aria-label="Agency scenes">
      {AGENCY_SCENES.map((item, index) => (
        <button
          key={item.id}
          type="button"
          className={scene === item.id ? "is-active" : ""}
          aria-current={scene === item.id ? "step" : undefined}
          onClick={() => dispatch({
            type: "journey",
            target: {
              workspace: "agency",
              sceneId: item.id,
              actorId: item.id === "roles" ? state.actorId ?? defaultActorId : null,
            },
          })}
        >
          <span>{String(index + 1).padStart(2, "0")}</span>
          <strong>{item.label}</strong>
          <small>{item.description}</small>
        </button>
      ))}
    </nav>
  );
}

function ActorButton({ actor, selected }: { actor: AgencyActor; selected: boolean }) {
  const { dispatch } = useAtlasState();
  const Icon = actorIcons[actor.id as keyof typeof actorIcons] ?? Box;
  return (
    <button
      type="button"
      className={selected ? "agency-actor-row is-selected" : "agency-actor-row"}
      onClick={() => dispatch({ type: "actor", actorId: actor.id })}
      aria-pressed={selected}
      aria-label={`${actor.label}, 책임 표면 ${actorSurfaceLabel(atlasData.agency, actor)}`}
    >
      <Icon size={20} strokeWidth={1.65} aria-hidden="true" />
      <span>
        <strong>{actor.label}</strong>
        <small>{actorSurfaceLabel(atlasData.agency, actor)}</small>
      </span>
    </button>
  );
}

function CurrentSystem({ selectedActorId }: { selectedActorId: string | null }) {
  return (
    <section className="agency-system-map" aria-label="Luke와 여섯 전문 역할의 책임 구조">
      <div className="agency-principal">
        <UserRound size={22} strokeWidth={1.65} aria-hidden="true" />
        <span><strong>Luke</strong><small>Human Owner</small></span>
      </div>
      <div className="agency-authority-bus" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
      <div className="agency-groups">
        {actorsByGroup(atlasData.agency).map((group) => (
          <section key={group.id} className={`agency-group agency-group-${group.kind}`}>
            <header>
              <span>{group.kind === "core" ? "HOMI CORE" : "INDEPENDENT PROJECT OWNERS"}</span>
              <b>{group.actors.length}</b>
            </header>
            <div>
              {group.actors.map((actor) => (
                <ActorButton key={actor.id} actor={actor} selected={actor.id === selectedActorId} />
              ))}
            </div>
          </section>
        ))}
      </div>
      <p className="agency-system-note">Luke가 각 역할에 직접 방향을 제시합니다. 그룹은 책임을 구분하지만 지휘 계층을 만들지 않습니다.</p>
    </section>
  );
}

function RoleDetail({ actor, reducedMotion, animateEntry }: { actor: AgencyActor; reducedMotion: boolean; animateEntry: boolean }) {
  const surface = actorSurfaceLabel(atlasData.agency, actor);
  const items = [
    { label: "목적 (Purpose)", value: actor.purpose, icon: CheckCircle2 },
    { label: "책임 영역 (Owned surface)", value: surface, icon: Box },
    { label: "공개 결과 (Public output)", value: actor.publicOutput, icon: FileCheck2 },
    { label: "검증 증거 (Proof)", value: actor.proof, icon: ShieldCheck },
    { label: "중지 경계 (Stop boundary)", value: actor.stopBoundary, icon: Ban },
  ];
  return (
    <m.section
      key={actor.id}
      className="agency-role-detail"
      aria-labelledby="agency-role-detail-title"
      initial={animateEntry && !reducedMotion ? { y: 12 } : false}
      animate={{ y: 0 }}
      transition={{ duration: reducedMotion ? MOTION_SECONDS.fast : 0.42 }}
    >
      <header>
        <span>SELECTED RESPONSIBILITY</span>
        <h2 id="agency-role-detail-title">{actor.label}</h2>
      </header>
      <dl>
        {items.map(({ label, value, icon: Icon }) => (
          <div key={label}>
            <dt><Icon size={16} aria-hidden="true" />{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </m.section>
  );
}

function MobileRolePicker({ selectedActorId }: { selectedActorId: string }) {
  return (
    <section className="agency-mobile-role-picker" aria-label="Operating Roles 선택">
      {actorsByGroup(atlasData.agency).map((group) => (
        <div key={group.id}>
          <h2>{group.kind === "core" ? "Homi Core" : "Independent Project Owners"}</h2>
          <div>
            {group.actors.map((actor) => (
              <ActorButton key={actor.id} actor={actor} selected={actor.id === selectedActorId} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function EvolutionScene() {
  const { dispatch } = useAtlasState();
  const core = atlasData.agency.actors.filter((actor) => actor.groupId === "agency:group:homi-core");
  const independent = atlasData.agency.actors.filter((actor) => actor.groupId === "agency:group:independent");
  const strongest = strongestKnowledgeRelation(atlasData);
  const knowledgeItems = agencyKnowledgeDistricts();
  return (
    <section className="agency-evolution" aria-label="역할 전문화 전환">
      <div className="agency-principal">
        <UserRound size={22} strokeWidth={1.65} aria-hidden="true" />
        <span><strong>Luke</strong><small>Human Owner · unchanged direction</small></span>
      </div>
      <div className="agency-evolution-grid">
        <div className="agency-evolution-specialization">
          <div className="agency-evolution-before">
            <span>BEFORE</span>
            <strong>HISTORICAL MODEL · NON-ACTOR</strong>
            <p>단일 관리 세션 중심</p>
          </div>
          <div className="agency-evolution-transition" aria-hidden="true">
            <ArrowDown size={22} />
            <span>RESPONSIBILITY SPECIALIZATION</span>
          </div>
          <div className="agency-evolution-current">
            <span>CURRENT · HOMI CORE</span>
            <div>
              {core.map((actor) => <ActorButton key={actor.id} actor={actor} selected={false} />)}
            </div>
          </div>
        </div>
        <div className="agency-evolution-independent">
          <span>UNCHANGED BOUNDARY · INDEPENDENT PROJECT OWNERS</span>
          <div>
            {independent.map((actor) => <ActorButton key={actor.id} actor={actor} selected={false} />)}
          </div>
        </div>
      </div>
      <section className="agency-knowledge-context" aria-label="전문화 전후 동일한 지식 지형 문맥">
        <header><span>KNOWLEDGE TERRAIN · UNCHANGED CONTEXT</span><strong>{strongest ? `가장 강한 관계 ${strongest.wikilink.toLocaleString("ko-KR")}회` : "공개 집계"}</strong></header>
        <div>
          {knowledgeItems.map((item) => (
            <button
              key={item.id}
              type="button"
              style={{ color: strokeColorForDistrict(item.label) }}
              aria-label={`${item.label} ${item.representedDocuments.toLocaleString("ko-KR")}개 표현 기록, Explore에서 열기`}
              onClick={() => dispatch({ type: "journey", target: agencyKnowledgeTarget(item.id) })}
            >
              <b>{item.label}</b><small>{item.representedDocuments.toLocaleString("ko-KR")}개</small>
            </button>
          ))}
        </div>
      </section>
      <p>SCHEMATIC · NOT WORKLOAD</p>
    </section>
  );
}

export function AgencyView() {
  const { state } = useAtlasState();
  const scene = currentAgencyScene(state.sceneId);
  const shouldReduceMotion = useReducedMotion();
  const initialViewCommittedRef = useRef(false);
  const selectedActor = atlasData.agency.actors.find((actor) => actor.id === state.actorId)
    ?? atlasData.agency.actors.find((actor) => actor.id === defaultActorId)
    ?? atlasData.agency.actors[0];
  const directRolesEntry = !initialViewCommittedRef.current && scene === "roles";

  useEffect(() => {
    initialViewCommittedRef.current = true;
  }, []);

  return (
    <section className="agency-view" aria-labelledby="agency-title" data-scene={scene}>
      <header className="agency-intro">
        <span className="eyebrow">HUMAN × AGENT RESPONSIBILITY MAP</span>
        <h1 id="agency-title">방향과 책임의 경계를 지식 지형과 함께 읽습니다.</h1>
        <p>Luke와 여섯 전문 역할의 목적·책임 표면·공개 결과·검증·중지 경계를 릴리스 시점의 공개 안전 스냅샷으로 보여줍니다.</p>
      </header>

      <AgencySceneRail scene={scene} />

      <m.div
        className="agency-stage"
        key={scene}
        initial={directRolesEntry || shouldReduceMotion ? false : { x: 24, scale: 0.995 }}
        animate={{ x: 0, scale: 1 }}
      transition={{ duration: shouldReduceMotion ? MOTION_SECONDS.fast : scene === "evolution" ? MOTION_SECONDS.emphasis : MOTION_SECONDS.scene }}
      >
        {scene === "system" && <CurrentSystem selectedActorId={null} />}
        {scene === "roles" && selectedActor && (
          <div className={state.mobileSibling ? "agency-roles-scene is-mobile" : "agency-roles-scene"}>
            {state.mobileSibling
              ? <MobileRolePicker selectedActorId={selectedActor.id} />
              : <CurrentSystem selectedActorId={selectedActor.id} />}
            <RoleDetail actor={selectedActor} reducedMotion={Boolean(shouldReduceMotion)} animateEntry={!directRolesEntry} />
          </div>
        )}
        {scene === "evolution" && <EvolutionScene />}
      </m.div>

      <footer className="agency-snapshot-boundary">
        <span>VERIFIED VERSION SNAPSHOT</span>
        <p>{atlasData.agency.snapshot.caveat} · 기준일 {atlasData.agency.snapshot.asOfDate}</p>
      </footer>
    </section>
  );
}
