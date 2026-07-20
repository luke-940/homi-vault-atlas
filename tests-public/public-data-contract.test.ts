import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const names = ["agency", "bootstrap", "inventory", "structure", "relation", "flow", "temporal", "entity", "health", "insight", "publication"] as const;
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
    expect(publicStageIds.every((id: string) => /^station:[a-p]+:\d+$/.test(id))).toBe(true);
    expect(packs.flow.routes.every((route: { sourceRefs: string[] }) => route.sourceRefs.length === 0)).toBe(true);
    const stationEntityIds = packs.flow.routes.flatMap((route: { stations: Array<{ entityId: string | null }> }) => route.stations.map((station) => station.entityId).filter(Boolean));
    expect(stationEntityIds.every((id: string) => /^(?:hub|district):pub:[a-p]{18}$/.test(id))).toBe(true);
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
    const focusedNode = packs.structure.nodes.find((node: { id: string }) => node.id === concentration.targetScene.focusId);
    expect(focusedNode.kind).toBe("district");
    expect(focusedNode.documentCount).toBe(concentration.metric.value);
  });

  test("publishes only verified structure paths and keeps pulse and chronology honest-empty", () => {
    const pulse = packs.insight.items.find((item: { kind: string }) => item.kind === "latest_pulse");
    const structureNodeIds = new Set(packs.structure.nodes.map((node: { id: string }) => node.id));
    expect(packs.flow.routes.length).toBeGreaterThan(0);
    for (const route of packs.flow.routes) {
      const reference = packs.structure.associations.find((edge: { kind: string; source: string; target: string }) =>
        edge.kind === "references" && edge.source === route.members[0] && edge.target === route.members[1]);
      expect(route.provenance).toBe("resolved_wikilink_path");
      expect(Number.isInteger(route.weight) && route.weight > 0).toBe(true);
      expect(route.weight).toBe(reference?.weight);
      expect(route.classifier).toContain("weight 단위는 link occurrence");
      expect(route.members.length).toBeGreaterThanOrEqual(2);
      expect(route.sourceRefs).toEqual([]);
      expect(route.stations.length).toBeGreaterThanOrEqual(2);
      expect(route.stations.every((station: { entityId: string | null }) =>
        station.entityId !== null && structureNodeIds.has(station.entityId))).toBe(true);
    }
    expect(packs.flow.pulse).toEqual({
      latestDailyId: null,
      latestDailyDate: null,
      sourceItemCount: null,
      chains: [],
    });
    expect(packs.temporal).toEqual({ eras: [], currentEra: null });
    expect(pulse.metric).toEqual({ value: packs.flow.routes.length, label: "검증된 공개 경로", unit: "개" });
    expect(pulse.targetScene).toEqual({ workspace: "flow", scene: "routes", routeId: packs.flow.routes[0].id });
    expect(pulse.headline).toContain(`경로 ${packs.flow.routes.length}개`);
    expect(pulse.confidence).toBe("high");
    expect(JSON.stringify([packs.flow, packs.temporal])).not.toMatch(/역할 경계 \d+|새로 생김 집계 \d+|미확정 변화 \d+/);
  });

  test("exposes only relation layers supported by the public evidence boundary", () => {
    expect(packs.relation.availableLayers).toEqual(["wikilink"]);
    expect(packs.relation.redactedLayers).toEqual(["typed", "route"]);
  });

  test("does not publish invented lifecycle calibration", () => {
    expect(packs.temporal.eras).toEqual([]);
    expect(packs.temporal.currentEra).toBeNull();
  });
});
