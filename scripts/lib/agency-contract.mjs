import { createHash } from "node:crypto";
import { stableJson } from "./data-model.mjs";
import { scanOperatingExposure, scanPrivacyText } from "./privacy-scanner.mjs";

export const DEVELOPMENT_AGENCY_CAPTURE = Object.freeze({
  generatedAt: "2026-07-16T05:43:47.475Z",
  asOfDate: "2026-07-16",
});

const principalId = "agency:principal:luke";
const coreGroupId = "agency:group:homi-core";
const independentGroupId = "agency:group:independent";
const coreActorIds = Object.freeze([
  "actor:control-plane",
  "actor:daily-runner",
  "actor:atlas-builder",
]);
const independentActorIds = Object.freeze([
  "actor:rocket-manager",
  "actor:groot-manager",
  "actor:intelligence-layer-manager",
]);
const evidenceActorIds = Object.freeze([
  "actor:daily-runner",
  "actor:atlas-builder",
  ...independentActorIds,
]);
const allowedLinkKinds = new Set([
  "sets_direction",
  "coordinates_boundary",
  "owns_surface",
  "returns_result",
  "returns_evidence",
]);
const expectedCaptureSourceIds = Object.freeze([
  "sessionTopology",
  "ownerBoundary",
  "controlPlaneRole",
  "dailyRunnerRole",
  "atlasBuilderRole",
]);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const surfaceDefinitions = Object.freeze([
  Object.freeze({ id: "surface:homi-control-plane", label: "Homi Control Plane", actorId: "actor:control-plane" }),
  Object.freeze({ id: "surface:daily-weekly-intelligence", label: "Daily / Weekly Intelligence", actorId: "actor:daily-runner" }),
  Object.freeze({ id: "surface:atlas-product-release", label: "Atlas Product & Release", actorId: "actor:atlas-builder" }),
  Object.freeze({ id: "surface:project-rocket", label: "Project Rocket", actorId: "actor:rocket-manager" }),
  Object.freeze({ id: "surface:project-groot", label: "Project Groot", actorId: "actor:groot-manager" }),
  Object.freeze({ id: "surface:homi-intelligence-layer", label: "Homi Intelligence Layer", actorId: "actor:intelligence-layer-manager" }),
]);

const actorDefinitions = Object.freeze([
  Object.freeze({
    id: "actor:control-plane",
    label: "Control Plane",
    groupId: coreGroupId,
    purpose: "Homi 전역의 순서, 소유 경계, 검증 일관성을 조정한다.",
    ownedSurfaceId: "surface:homi-control-plane",
    publicOutput: "검증 가능한 제어면 경계",
    proof: "경계와 검증 결과의 일치",
    stopBoundary: "Atlas와 독립 프로젝트 owner를 지휘하거나 승인하지 않는다.",
  }),
  Object.freeze({
    id: "actor:daily-runner",
    label: "Daily Runner",
    groupId: coreGroupId,
    purpose: "반복되는 Daily와 Weekly 지식 회로를 책임진다.",
    ownedSurfaceId: "surface:daily-weekly-intelligence",
    publicOutput: "정제된 반복 지식 흐름",
    proof: "입력, 변환, 전파 경계의 검증",
    stopBoundary: "다른 책임 주체의 제품과 공식 지식 표면을 수정하지 않는다.",
  }),
  Object.freeze({
    id: "actor:atlas-builder",
    label: "Atlas Builder",
    groupId: coreGroupId,
    purpose: "Atlas 제품, 공개 경계, QA와 릴리스를 책임진다.",
    ownedSurfaceId: "surface:atlas-product-release",
    publicOutput: "Homi Vault Atlas",
    proof: "데이터, 시각, 발행 결과의 검증",
    stopBoundary: "Luke Vault와 다른 책임 주체의 공식 지식 표면에는 쓰지 않는다.",
  }),
  Object.freeze({
    id: "actor:rocket-manager",
    label: "Rocket Manager",
    groupId: independentGroupId,
    purpose: "Project Rocket의 연구와 제품 경계를 책임진다.",
    ownedSurfaceId: "surface:project-rocket",
    publicOutput: "Rocket의 독립 지식 표면",
    proof: "Rocket 공식 지식과 읽기면의 일치",
    stopBoundary: "Homi Core와 형제 프로젝트의 공식 지식 표면을 수정하지 않는다.",
  }),
  Object.freeze({
    id: "actor:groot-manager",
    label: "Groot Manager",
    groupId: independentGroupId,
    purpose: "Project Groot의 분석과 실행 경계를 책임진다.",
    ownedSurfaceId: "surface:project-groot",
    publicOutput: "Groot의 독립 지식 표면",
    proof: "Groot 공식 지식과 읽기면의 일치",
    stopBoundary: "Homi Core와 형제 프로젝트의 공식 지식 표면을 수정하지 않는다.",
  }),
  Object.freeze({
    id: "actor:intelligence-layer-manager",
    label: "Intelligence Layer Manager",
    groupId: independentGroupId,
    purpose: "Homi Intelligence Layer의 독립된 지식 계약을 책임진다.",
    ownedSurfaceId: "surface:homi-intelligence-layer",
    publicOutput: "검증된 Intelligence Layer 표면",
    proof: "계약, 증거, 경계의 일치",
    stopBoundary: "다른 책임 주체의 공식 지식 표면을 수정하지 않는다.",
  }),
]);

const groups = Object.freeze([
  Object.freeze({
    id: coreGroupId,
    label: "Homi Core",
    kind: "core",
    actorIds: [...coreActorIds],
  }),
  Object.freeze({
    id: independentGroupId,
    label: "Independent Project Owners",
    kind: "independent",
    actorIds: [...independentActorIds],
  }),
]);

function clone(value) {
  return structuredClone(value);
}

export function agencyProjectionDigest(agency) {
  if (!agency || typeof agency !== "object" || Array.isArray(agency)) {
    throw new TypeError("Agency projection digest requires an object.");
  }
  const { projectionDigest: _discardedSelfDigest, ...projection } = agency;
  return sha256(stableJson(projection));
}

export function createPublicAgencyPack(capture = DEVELOPMENT_AGENCY_CAPTURE) {
  const { generatedAt, asOfDate } = capture ?? {};
  if (typeof generatedAt !== "string"
    || Number.isNaN(Date.parse(generatedAt))
    || typeof asOfDate !== "string"
    || !/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)
    || generatedAt.slice(0, 10) !== asOfDate) {
    throw new TypeError("Agency pack requires an explicit, stable release-capture generatedAt and matching asOfDate.");
  }
  const actors = clone(actorDefinitions);
  const surfaces = clone(surfaceDefinitions);
  const pack = {
    schema: "atlas.agency.v1",
    generatedAt,
    snapshot: {
      asOfDate,
      status: "current_at_release_capture",
      live: false,
      caveat: "검증된 버전 스냅샷이며 실시간 작업 상태가 아닙니다.",
    },
    principal: { id: principalId, label: "Luke", kind: "human_principal" },
    groups: clone(groups),
    actors,
    surfaces,
    links: [
      ...actors.map((actor) => ({
        id: `link:direction:${actor.id.slice("actor:".length)}`,
        source: principalId,
        target: actor.id,
        kind: "sets_direction",
      })),
      ...actors.map((actor) => ({
        id: `link:ownership:${actor.id.slice("actor:".length)}`,
        source: actor.id,
        target: actor.ownedSurfaceId,
        kind: "owns_surface",
      })),
      ...actors.map((actor) => ({
        id: `link:result:${actor.id.slice("actor:".length)}`,
        source: actor.id,
        target: principalId,
        kind: "returns_result",
      })),
      {
        id: "link:boundary:control-plane:daily-runner",
        source: "actor:control-plane",
        target: "actor:daily-runner",
        kind: "coordinates_boundary",
      },
      ...evidenceActorIds.map((actorId) => ({
        id: `link:evidence:${actorId.slice("actor:".length)}:control-plane`,
        source: actorId,
        target: "actor:control-plane",
        kind: "returns_evidence",
      })),
    ],
    transition: {
      id: "agency:transition:role-specialization",
      label: "단일 관리 세션 중심 → 역할별 세 지속 세션",
      kind: "responsibility_specialization",
      fromModel: "single_coordination",
      toActorIds: [...coreActorIds],
      evidenceStatus: "verified_operating_model",
    },
    evidenceBoundary: "공개 Agency 투영은 기준일에 검증된 역할, 소유 표면, 결과와 증거 반환 구조만 설명합니다. 실시간 운영 정보는 제공하지 않습니다.",
  };
  return { ...pack, projectionDigest: agencyProjectionDigest(pack) };
}

export function assertAgencyReleaseCaptureBinding(capture, candidateCurrentStateHash) {
  if (!capture || typeof capture !== "object" || Array.isArray(capture)
    || capture.schema !== "homi.atlas_agency_release_capture.v1") {
    throw new Error("Agency release capture binding requires the exact capture schema.");
  }
  if (typeof candidateCurrentStateHash !== "string" || !/^[a-f0-9]{64}$/i.test(candidateCurrentStateHash)) {
    throw new Error("Agency release capture binding requires the candidate Current State SHA-256.");
  }
  if (capture.semanticTupleDigest !== sha256(stableJson(capture.semanticTuple))) {
    throw new Error("Agency release capture semantic tuple digest is invalid.");
  }
  if (capture.authorityWitnessDigest !== sha256(stableJson(capture.authorityWitness))) {
    throw new Error("Agency release capture authority witness digest is invalid.");
  }
  if (capture.currentStateWitness?.sha256 !== candidateCurrentStateHash
    || capture.currentStateWitness?.doubleReadEqual !== true) {
    throw new Error("Agency release capture is not bound to the candidate Current State.");
  }
  const sourceIds = Object.keys(capture.sourceBindings ?? {}).sort();
  const expectedIds = [...expectedCaptureSourceIds].sort();
  if (sourceIds.join("|") !== expectedIds.join("|")
    || expectedIds.some((id) => (
      capture.sourceBindings[id]?.doubleReadEqual !== true
      || !/^[a-f0-9]{64}$/i.test(capture.sourceBindings[id]?.sha256 ?? "")
      || !Number.isInteger(capture.sourceBindings[id]?.bytes)
      || capture.sourceBindings[id].bytes < 1
    ))) {
    throw new Error("Agency release capture source bindings are incomplete or torn.");
  }
  const { generatedAt, asOfDate } = capture.publicCapture ?? {};
  if (typeof generatedAt !== "string"
    || Number.isNaN(Date.parse(generatedAt))
    || typeof asOfDate !== "string"
    || generatedAt.slice(0, 10) !== asOfDate) {
    throw new Error("Agency release capture public timestamp is invalid.");
  }
  return {
    semanticTupleDigest: capture.semanticTupleDigest,
    authorityWitnessDigest: capture.authorityWitnessDigest,
    currentStateSha256: candidateCurrentStateHash,
    sourceIds: expectedIds,
    doubleReadEqual: true,
  };
}

function finding(id, path, details = {}) {
  return { id, path, ...details };
}

function sameMembers(actual, expected) {
  return actual.length === expected.length
    && actual.every((item) => expected.includes(item))
    && new Set(actual).size === expected.length;
}

export function auditPublicAgencyContract(agency, { knowledgeEntityIds = [] } = {}) {
  const findings = [];
  if (!agency || typeof agency !== "object" || Array.isArray(agency)) {
    return [finding("agency-not-object", "agency")];
  }
  if (agency.schema !== "atlas.agency.v1") findings.push(finding("agency-schema-invalid", "agency.schema"));
  if (typeof agency.generatedAt !== "string"
    || Number.isNaN(Date.parse(agency.generatedAt))
    || agency.generatedAt.slice(0, 10) !== agency.snapshot?.asOfDate) {
    findings.push(finding("agency-capture-timestamp-invalid", "agency.generatedAt"));
  }
  if (agency.projectionDigest !== agencyProjectionDigest(agency)) {
    findings.push(finding("agency-projection-digest-mismatch", "agency.projectionDigest"));
  }
  const snapshot = agency.snapshot;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshot?.asOfDate ?? "")
    || snapshot?.status !== "current_at_release_capture"
    || snapshot?.live !== false
    || typeof snapshot?.caveat !== "string"
    || !snapshot.caveat.trim()) {
    findings.push(finding("agency-snapshot-invalid", "agency.snapshot"));
  }
  const principal = agency.principal;
  if (principal?.id !== principalId || principal?.label !== "Luke" || principal?.kind !== "human_principal") {
    findings.push(finding("agency-principal-invalid", "agency.principal"));
  }
  const actors = Array.isArray(agency.actors) ? agency.actors : [];
  const actorIds = actors.map((actor) => actor?.id);
  const expectedActorIds = [...coreActorIds, ...independentActorIds];
  if (actors.length !== 6 || !sameMembers(actorIds, expectedActorIds)) {
    findings.push(finding("agency-actor-set-invalid", "agency.actors", { actual: actors.length, expected: 6 }));
  }
  const surfaces = Array.isArray(agency.surfaces) ? agency.surfaces : [];
  const surfaceIds = surfaces.map((surface) => surface?.id);
  if (surfaces.length !== 6 || new Set(surfaceIds).size !== 6) {
    findings.push(finding("agency-ownership-surfaces-invalid", "agency.surfaces"));
  }
  for (const actor of actors) {
    const surface = surfaces.find((candidate) => candidate?.id === actor?.ownedSurfaceId);
    if (!surface || surface.actorId !== actor.id) {
      findings.push(finding("agency-actor-surface-mismatch", actor?.id ?? "agency.actors"));
    }
  }
  const groupList = Array.isArray(agency.groups) ? agency.groups : [];
  const coreGroup = groupList.find((group) => group?.id === coreGroupId);
  const independentGroup = groupList.find((group) => group?.id === independentGroupId);
  if (groupList.length !== 2
    || coreGroup?.kind !== "core"
    || !sameMembers(coreGroup?.actorIds ?? [], coreActorIds)
    || independentGroup?.kind !== "independent"
    || !sameMembers(independentGroup?.actorIds ?? [], independentActorIds)) {
    findings.push(finding("agency-groups-invalid", "agency.groups"));
  }
  for (const actor of actors) {
    const group = groupList.find((candidate) => candidate?.id === actor?.groupId);
    if (!group?.actorIds?.includes(actor.id)) {
      findings.push(finding("agency-actor-group-mismatch", actor?.id ?? "agency.actors"));
    }
  }
  const links = Array.isArray(agency.links) ? agency.links : [];
  if (links.some((link) => !allowedLinkKinds.has(link?.kind))) {
    findings.push(finding("agency-link-kind-invalid", "agency.links"));
  }
  const directionLinks = links.filter((link) => link?.kind === "sets_direction");
  if (directionLinks.length !== 6
    || !sameMembers(directionLinks.map((link) => link?.target), expectedActorIds)
    || directionLinks.some((link) => link?.source !== principalId)) {
    findings.push(finding("agency-direction-edges-invalid", "agency.links"));
  }
  const ownershipLinks = links.filter((link) => link?.kind === "owns_surface");
  if (ownershipLinks.length !== 6
    || !sameMembers(ownershipLinks.map((link) => link?.source), expectedActorIds)
    || !sameMembers(ownershipLinks.map((link) => link?.target), surfaceIds)
    || ownershipLinks.some((link) => {
      const actor = actors.find((candidate) => candidate?.id === link?.source);
      const surface = surfaces.find((candidate) => candidate?.id === link?.target);
      return !actor
        || !surface
        || actor.ownedSurfaceId !== link.target
        || surface.actorId !== link.source;
    })) {
    findings.push(finding("agency-ownership-links-invalid", "agency.links"));
  }
  const resultLinks = links.filter((link) => link?.kind === "returns_result");
  if (resultLinks.length !== 6
    || !sameMembers(resultLinks.map((link) => link?.source), expectedActorIds)
    || resultLinks.some((link) => link?.target !== principalId)) {
    findings.push(finding("agency-result-links-invalid", "agency.links"));
  }
  const boundaryLinks = links.filter((link) => link?.kind === "coordinates_boundary");
  if (boundaryLinks.length !== 1
    || boundaryLinks[0]?.source !== "actor:control-plane"
    || boundaryLinks[0]?.target !== "actor:daily-runner") {
    findings.push(finding("agency-boundary-link-invalid", "agency.links"));
  }
  const evidenceLinks = links.filter((link) => link?.kind === "returns_evidence");
  if (evidenceLinks.length !== 5
    || !sameMembers(evidenceLinks.map((link) => link?.source), evidenceActorIds)
    || evidenceLinks.some((link) => link?.target !== "actor:control-plane")) {
    findings.push(finding("agency-evidence-links-invalid", "agency.links"));
  }
  const controlToActorLinks = links.filter((link) => (
    link?.source === "actor:control-plane" && actorIds.includes(link?.target)
  ));
  if (controlToActorLinks.length !== 1
    || controlToActorLinks[0]?.kind !== "coordinates_boundary"
    || controlToActorLinks[0]?.target !== "actor:daily-runner") {
    findings.push(finding("agency-false-control-plane-authority", "agency.links"));
  }
  const transition = agency.transition;
  if (transition?.id !== "agency:transition:role-specialization"
    || transition?.label !== "단일 관리 세션 중심 → 역할별 세 지속 세션"
    || transition?.kind !== "responsibility_specialization"
    || transition?.fromModel !== "single_coordination"
    || !Array.isArray(transition?.toActorIds)
    || transition.toActorIds.join("|") !== coreActorIds.join("|")
    || transition?.evidenceStatus !== "verified_operating_model") {
    findings.push(finding("agency-transition-invalid", "agency.transition"));
  }
  const agencyIds = [
    principal?.id,
    ...actorIds,
    ...surfaceIds,
    ...groupList.map((group) => group?.id),
    ...links.map((link) => link?.id),
    transition?.id,
  ];
  const knowledgeIds = new Set(knowledgeEntityIds);
  if (agencyIds.some((id) => knowledgeIds.has(id) || String(id ?? "").startsWith("doc:pub:"))) {
    findings.push(finding("agency-knowledge-namespace-collision", "agency"));
  }
  const body = JSON.stringify(agency);
  const privacyFindings = [
    ...scanPrivacyText(body, { path: "agency" }),
    ...scanOperatingExposure(body, { path: "agency" }),
  ];
  if (privacyFindings.length) findings.push(finding("agency-private-operating-field", "agency", {
    patternIds: privacyFindings.map((item) => item.id),
  }));
  return findings;
}

export function assertPublicAgencyContract(agency, options) {
  const findings = auditPublicAgencyContract(agency, options);
  if (findings.length) {
    throw new Error(`atlas.agency.v1 contract failed: ${findings.map((item) => `${item.id}:${item.path}`).join(", ")}`);
  }
  return agency;
}
