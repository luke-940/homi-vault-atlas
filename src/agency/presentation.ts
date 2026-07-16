import type {
  AgencyActor,
  AgencyScene,
  AtlasAgencyV1,
  AtlasData,
  MatrixCell,
} from "../types";

export type HomeSceneId =
  | "system-overview"
  | "responsibility-partition"
  | "independent-ownership"
  | "knowledge-return";

const LEGACY_HOME_SCENE_ALIASES: Readonly<Record<string, HomeSceneId>> = Object.freeze({
  "terrain-convergence": "independent-ownership",
  "public-boundary": "knowledge-return",
});

export const HOME_SCENES: ReadonlyArray<{
  id: HomeSceneId;
  index: string;
  shortLabel: string;
  label: string;
  headline: string;
  body: string;
}> = [
  {
    id: "system-overview",
    index: "01",
    shortLabel: "System",
    label: "Human-led System",
    headline: "Luke가 여섯 전문 역할에 직접 방향을 전달한다.",
    body: "하나의 방향은 지휘 계층이 아니라 서로 분리된 여섯 책임 표면으로 전달됩니다.",
  },
  {
    id: "responsibility-partition",
    index: "02",
    shortLabel: "1→3",
    label: "Core Specialization",
    headline: "하나의 통합 역할을 세 전문 책임으로 분리했다.",
    body: "Control Plane, Daily Runner, Atlas Builder가 각자의 지속 책임을 갖고 독립 오너는 기존 경계를 유지합니다.",
  },
  {
    id: "independent-ownership",
    index: "03",
    shortLabel: "Owners",
    label: "Independent Ownership",
    headline: "세 독립 프로젝트 오너는 각자의 책임 경계를 직접 소유한다.",
    body: "Rocket·Groot·Intelligence Layer는 Control Plane의 하위가 아니라 Luke에게 직접 결과를 돌려주는 독립 주체입니다.",
  },
  {
    id: "knowledge-return",
    index: "04",
    shortLabel: "Return",
    label: "Knowledge Return",
    headline: "검증된 결과가 공개 안전한 지식 지형으로 돌아온다.",
    body: "관계의 굵기와 구역의 크기는 릴리스 시점에 검증된 공개 스냅샷의 실제 집계에서 계산됩니다.",
  },
] as const;

export const AGENCY_SCENES: ReadonlyArray<{
  id: AgencyScene;
  label: string;
  description: string;
}> = [
  { id: "system", label: "System", description: "Luke, 여섯 역할, 여섯 책임 표면의 전체 구조" },
  { id: "roles", label: "Roles", description: "선택 역할의 목적·결과·증거·중지 경계" },
  { id: "evolution", label: "Evolution", description: "통합 역할 중심에서 세 지속 책임으로의 전문화" },
] as const;

export const DISTRICT_COLORS: Record<string, string> = {
  "중심 지식": "var(--district-knowledge)",
  "연구 논거": "var(--district-research)",
  전략: "var(--district-strategy)",
  신호: "var(--district-signal)",
  "운영 기반": "var(--district-operations)",
  "공개 근거 경계": "var(--public-boundary)",
};

export const MOTION_SECONDS = {
  instant: 0.001,
  fast: 0.12,
  control: 0.18,
  scene: 0.48,
  emphasis: 0.56,
  entry: 0.8,
} as const;

export function normalizeHomeSceneId(sceneId: string | null | undefined): HomeSceneId | null {
  if (!sceneId) return null;
  if (HOME_SCENES.some((scene) => scene.id === sceneId)) return sceneId as HomeSceneId;
  return LEGACY_HOME_SCENE_ALIASES[sceneId] ?? null;
}

export function currentHomeScene(sceneId: string): HomeSceneId {
  return normalizeHomeSceneId(sceneId) ?? "system-overview";
}

export function currentAgencyScene(sceneId: string): AgencyScene {
  return AGENCY_SCENES.some((scene) => scene.id === sceneId)
    ? sceneId as AgencyScene
    : "system";
}

export function publicDocumentCount(data: AtlasData) {
  return data.publication.redactionCounts.aggregatedSourceDocuments
    ?? data.structure.districts.reduce((sum, district) => sum + district.documentCount, 0);
}

export function strongestKnowledgeRelation(data: AtlasData): MatrixCell | null {
  return [...data.relation.matrix]
    .sort((left, right) => right.wikilink - left.wikilink || left.id.localeCompare(right.id))[0]
    ?? null;
}

export function actorsByGroup(pack: AtlasAgencyV1) {
  const actorById = new Map(pack.actors.map((actor) => [actor.id, actor]));
  return pack.groups.map((group) => ({
    ...group,
    actors: group.actorIds
      .map((actorId) => actorById.get(actorId))
      .filter((actor): actor is AgencyActor => Boolean(actor)),
  }));
}

export function agencyTruthFailures(pack: AtlasAgencyV1): string[] {
  const failures: string[] = [];
  const expectedActors = [
    "actor:control-plane",
    "actor:daily-runner",
    "actor:atlas-builder",
    "actor:rocket-manager",
    "actor:groot-manager",
    "actor:intelligence-layer-manager",
  ];
  const expectedActorSet = new Set(expectedActors);
  const expectedEvidenceSources = new Set(expectedActors.filter((id) => id !== "actor:control-plane"));
  const actorIds = new Set(pack.actors.map((actor) => actor.id));
  const surfaceIds = new Set(pack.surfaces.map((surface) => surface.id));
  const groupedActorIds = pack.groups.flatMap((group) => group.actorIds);
  const directionLinks = pack.links.filter((link) => link.kind === "sets_direction");
  const ownershipLinks = pack.links.filter((link) => link.kind === "owns_surface");
  const resultLinks = pack.links.filter((link) => link.kind === "returns_result");
  const evidenceLinks = pack.links.filter((link) => link.kind === "returns_evidence");
  const boundaryLinks = pack.links.filter((link) => link.kind === "coordinates_boundary");
  const actorById = new Map(pack.actors.map((actor) => [actor.id, actor]));
  const surfaceById = new Map(pack.surfaces.map((surface) => [surface.id, surface]));

  if (pack.principal.id !== "agency:principal:luke") failures.push("principal-exact");
  if (pack.actors.length !== 6 || actorIds.size !== 6
    || expectedActors.some((id) => !actorIds.has(id))) failures.push("actor-count-exact");
  if (pack.groups.length !== 2) failures.push("group-count-exact");
  const coreGroup = pack.groups.find((group) => group.id === "agency:group:homi-core" && group.kind === "core");
  const independentGroup = pack.groups.find((group) => group.id === "agency:group:independent" && group.kind === "independent");
  if (!coreGroup || !independentGroup) failures.push("group-identity-exact");
  if (pack.groups.some((group) => group.actorIds.length !== 3)) failures.push("group-size-exact");
  if (new Set(groupedActorIds).size !== 6 || groupedActorIds.some((id) => !actorIds.has(id))) {
    failures.push("group-membership-exact");
  }
  if (pack.actors.some((actor) => !pack.groups.some((group) => (
    group.id === actor.groupId && group.actorIds.includes(actor.id)
  )))) failures.push("group-membership-exact", "actor-group-binding");
  if (pack.surfaces.length !== 6 || surfaceIds.size !== 6) failures.push("surface-count-exact");
  const ownedSurfaceIds = pack.actors.map((actor) => actor.ownedSurfaceId);
  if (new Set(ownedSurfaceIds).size !== 6
    || pack.actors.some((actor) => !surfaceIds.has(actor.ownedSurfaceId)
      || surfaceById.get(actor.ownedSurfaceId)?.actorId !== actor.id)) failures.push("actor-surface-binding");
  if (directionLinks.length !== 6
    || new Set(directionLinks.map((link) => link.target)).size !== 6
    || directionLinks.some((link) => link.source !== pack.principal.id || !expectedActorSet.has(link.target))) {
    failures.push("luke-direction-edge-exact");
  }
  if (ownershipLinks.length !== 6 || ownershipLinks.some((link) => (
    actorById.get(link.source)?.ownedSurfaceId !== link.target
    || surfaceById.get(link.target)?.actorId !== link.source
  ))) failures.push("ownership-edge-exact");
  if (resultLinks.length !== 6
    || new Set(resultLinks.map((link) => link.source)).size !== 6
    || resultLinks.some((link) => !expectedActorSet.has(link.source) || link.target !== pack.principal.id)) {
    failures.push("result-edge-exact");
  }
  if (boundaryLinks.length !== 1
    || boundaryLinks[0]?.source !== "actor:control-plane"
    || boundaryLinks[0]?.target !== "actor:daily-runner") failures.push("boundary-edge-exact");
  if (evidenceLinks.length !== 5
    || new Set(evidenceLinks.map((link) => link.source)).size !== 5
    || evidenceLinks.some((link) => !expectedEvidenceSources.has(link.source)
      || link.target !== "actor:control-plane")) failures.push("evidence-edge-exact");
  if (pack.links.some((link) => (
    link.source === "actor:control-plane"
    && link.target !== "actor:daily-runner"
    && link.kind !== "owns_surface"
    && link.kind !== "returns_result"
  ))) failures.push("control-plane-false-authority");
  if (pack.links.some((link) => (
    link.source.startsWith("doc:pub:") || link.target.startsWith("doc:pub:")
  ))) failures.push("knowledge-agency-namespace-mixed");
  if (pack.transition.toActorIds.length !== 3
    || pack.transition.toActorIds.join("|") !== [
      "actor:control-plane",
      "actor:daily-runner",
      "actor:atlas-builder",
    ].join("|")) {
    failures.push("transition-core-only");
  }
  return failures;
}

export function actorSurfaceLabel(pack: AtlasAgencyV1, actor: AgencyActor) {
  return pack.surfaces.find((surface) => surface.id === actor.ownedSurfaceId)?.label ?? actor.ownedSurfaceId;
}
