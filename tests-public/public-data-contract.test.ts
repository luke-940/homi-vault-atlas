import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const names = ["agency", "bootstrap", "structure", "relation", "flow", "temporal", "entity", "health", "insight", "publication"] as const;
const dataDir = path.resolve("public-safe", "data");
const packs = Object.fromEntries(names.map((name) => [name, JSON.parse(readFileSync(path.join(dataDir, `${name}.json`), "utf8"))]));

describe("public Atlas data contract", () => {
  test("uses the public publication profile and stable path-free ids", () => {
    expect(packs.publication.profile).toBe("public");
    expect(packs.publication.blockers).toEqual([]);
    expect(packs.entity.entities.length).toBeGreaterThan(5);
    expect(packs.entity.entities.length).toBeLessThan(40);
    for (const entity of packs.entity.entities) {
      expect(entity.id).toMatch(/^doc:pub:[a-f0-9]{18}$/);
      expect(entity.path).toMatch(/^public\//);
      expect(entity.frontmatter).toEqual({});
      expect(entity.aliases).toEqual([]);
      expect(entity.tags).toEqual([]);
      expect(["public_aggregate", "public_snapshot_boundary"]).toContain(entity.sourceRole);
      expect(entity.authority).toMatch(/^공개 /);
      expect(entity.currentness).toBe("public_snapshot");
      expect(entity.wordCount).toBe(0);
      expect(entity.documentCount).toBeGreaterThanOrEqual(0);
      expect(entity.ageDays).toBeNull();
      expect(entity).not.toHaveProperty("sha256");
    }
    expect(packs.bootstrap.snapshot).not.toHaveProperty("officialCursor");
    for (const field of [
      "stateSnapshot",
      "currentStateHash",
      "candidateInputHash",
      "activeManifestHash",
      "memoryEngineCodeHash",
      "memoryIndexHash",
      "memoryCorpusDigest",
      "graphConfigHash",
    ]) expect(packs.bootstrap.snapshot).not.toHaveProperty(field);
    const hashes: string[] = [];
    const visit = (value: unknown) => {
      if (typeof value === "string" && /^[a-f0-9]{64}$/.test(value)) hashes.push(value);
      else if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") Object.values(value).forEach(visit);
    };
    visit(packs);
    expect(hashes.sort()).toEqual([
      packs.agency.projectionDigest,
      packs.publication.publicSnapshotDigest,
    ].sort());
  });

  test("contains four evidence-backed public insights", () => {
    const ids = new Set(packs.entity.entities.map((entity: { id: string }) => entity.id));
    expect(packs.insight.items).toHaveLength(4);
    for (const insight of packs.insight.items) {
      expect(insight.publicSafe).toBe(true);
      expect(insight.evidenceRefs.length).toBeGreaterThan(0);
      expect(insight.evidenceRefs.every((id: string) => ids.has(id))).toBe(true);
    }
  });

  test("contains no local path or private operating surface", () => {
    const body = JSON.stringify(packs);
    expect(body).not.toMatch(/\/(?:Users|home)\/[^/]+\/|Documents\/[A-Za-z0-9 _.-]+\/|file:\/\//i);
    expect(packs.relation.neighborhoods).toEqual({});
    expect(packs.publication.allowedSurfaces).toEqual(expect.arrayContaining(["district_role_aggregate", "district_relation_aggregate"]));
    expect(packs.publication.excludedFields).toContain("document_level_relation");
    const publicStageIds = packs.flow.routes.flatMap((route: { stations: Array<{ id: string }> }) => route.stations.map((station) => station.id));
    expect(publicStageIds.every((id: string) => /^stage:[a-z]+:\d+$/.test(id))).toBe(true);
    expect(packs.flow.routes.every((route: { sourceRefs: string[] }) => route.sourceRefs.length === 0)).toBe(true);
    const stationEntityIds = packs.flow.routes.flatMap((route: { stations: Array<{ entityId: string | null }> }) => route.stations.map((station) => station.entityId).filter(Boolean));
    expect(stationEntityIds.every((id: string) => /^doc:pub:[a-f0-9]{18}$/.test(id))).toBe(true);
  });

  test("uses one represented-document unit across public insight, hierarchy, city, and inspector data", () => {
    const districtByName = new Map(packs.structure.districts.map((district: { name: string }) => [district.name, district]));
    const districtNodes = packs.structure.hierarchyNodes.filter((node: { kind: string }) => node.kind === "district");
    for (const node of districtNodes) {
      expect(node.documentCount).toBe(districtByName.get(node.label)?.documentCount);
      const childCount = packs.structure.hierarchyNodes
        .filter((child: { parentId: string }) => child.parentId === node.id)
        .reduce((sum: number, child: { documentCount: number }) => sum + child.documentCount, 0);
      expect(childCount).toBe(node.documentCount);
    }
    const concentration = packs.insight.items.find((item: { kind: string }) => item.kind === "knowledge_concentration");
    const focusedNode = packs.structure.hierarchyNodes.find((node: { id: string }) => node.id === concentration.targetScene.focusId);
    expect(focusedNode.documentCount).toBe(concentration.metric.value);
  });

  test("keeps public route semantics and pulse counts explicit", () => {
    const daily = packs.flow.routes.find((route: { id: string }) => route.id === "daily");
    expect(daily.stations.map((station: { label: string }) => station.label)).toEqual([
      "소스 수집", "Daily", "중심 지식", "판단·행동", "검증", "팀 읽기면",
    ]);
    const pulse = packs.insight.items.find((item: { kind: string }) => item.kind === "latest_pulse");
    const publicPulseEntityIds = packs.flow.pulse.chains
      .flatMap((chain: { stages: Array<{ entityId: string | null }> }) => chain.stages)
      .map((stage: { entityId: string | null }) => stage.entityId)
      .filter(Boolean);
    expect(publicPulseEntityIds).toEqual([]);
    expect(pulse.metric.value).toBe(packs.flow.pulse.chains.length);
    expect(pulse.metric.label).toBe("공개 역할 경로");
    expect(pulse.headline).toContain(`공개 역할 경로 ${packs.flow.pulse.chains.length}개`);
    expect(pulse.headline).not.toContain("확인된 전파");
    expect(pulse.confidence).toBe("medium");
  });

  test("exposes only relation layers supported by the public evidence boundary", () => {
    expect(packs.relation.availableLayers).toEqual(["wikilink"]);
    expect(packs.relation.redactedLayers).toEqual(["typed", "route"]);
  });

  test("uses aggregate-safe Korean Era labels without invented calibration", () => {
    for (const era of packs.temporal.eras) {
      for (const delta of era.deltas) {
        expect(delta.label).toMatch(/(?:새로 생김|계속 유지|약해짐|역사로 이동|판단 근거 부족|변화) 집계 \d+/);
        expect(delta.label).not.toMatch(/\b(?:born|persisted|weakened|retired|unknown)\b/i);
        expect(delta.evidenceStatus).toBe("recorded");
        expect(delta).not.toHaveProperty("confidence");
      }
    }
  });
});
