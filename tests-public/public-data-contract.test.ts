import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const names = ["agency", "bootstrap", "inventory", "graph", "relation", "flow", "temporal", "entity", "health", "insight", "publication"] as const;
const dataDir = path.resolve("public-safe", "data");
const packs = Object.fromEntries(names.map((name) => [name, JSON.parse(readFileSync(path.join(dataDir, `${name}.json`), "utf8"))]));

describe("public Atlas v7.5 data contract", () => {
  test("publishes atlas.graph.v1 as the only visualization pack", () => {
    expect(packs.graph).toMatchObject({ schema: "atlas.graph.v1", profile: "atlas-public" });
    expect(packs.graph.manifest).toMatchObject({
      nodeCount: packs.graph.nodes.length,
      edgeCount: packs.graph.edges.length,
      clusterCount: packs.graph.clusters.length,
    });
    expect(packs.graph.layout.defaultNodeIds.length).toBeLessThanOrEqual(60);
    expect(packs.graph.layout.defaultEdgeIds.length).toBeLessThanOrEqual(48);
    expect(() => readFileSync(path.join(dataDir, "structure.json"), "utf8")).toThrow();
  });

  test("uses stable path-free public ids and contains no document bodies", () => {
    expect(packs.publication.profile).toBe("public");
    expect(packs.publication.blockers).toEqual([]);
    for (const entity of packs.entity.entities) {
      expect(entity.id).toMatch(/^doc:pub:[a-f0-9]{18}$/);
      expect(entity.path).toMatch(/^public\//);
      expect(entity.frontmatter).toEqual({});
      expect(entity.aliases).toEqual([]);
      expect(entity.tags).toEqual([]);
      expect(entity.wordCount).toBe(0);
      expect(entity.ageDays).toBeNull();
      expect(entity).not.toHaveProperty("sha256");
    }
    expect(JSON.stringify(packs)).not.toMatch(/\/(?:Users|home)\/[^/]+\/|file:\/\//i);
  });

  test("allows only projection and publication digests", () => {
    const hashes: string[] = [];
    const visit = (value: unknown) => {
      if (typeof value === "string" && /^[a-f0-9]{64}$/.test(value)) hashes.push(value);
      else if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") Object.values(value).forEach(visit);
    };
    visit(packs);
    expect(hashes.sort()).toEqual([
      packs.agency.projectionDigest,
      packs.graph.manifest.semanticDigest,
      packs.graph.manifest.layoutDigest,
      packs.graph.manifest.projectionDigest,
      packs.publication.publicSnapshotDigest,
    ].sort());
  });

  test("keeps graph units and directions distinct", () => {
    const nodeIds = new Set(packs.graph.nodes.map((node: { id: string }) => node.id));
    for (const node of packs.graph.nodes) {
      expect(Number.isInteger(node.gravity) && node.gravity >= 0).toBe(true);
      expect(Number.isInteger(node.occurrences) && node.occurrences >= 0).toBe(true);
      expect(node).not.toHaveProperty("mtime");
    }
    for (const edge of packs.graph.edges) {
      expect(edge).toMatchObject({ kind: "references", direction: "forward" });
      expect(edge.occurrenceCount).toBeGreaterThan(0);
      expect(nodeIds.has(edge.source) && nodeIds.has(edge.target)).toBe(true);
    }
  });

  test("reconciles represented records exactly once", () => {
    const inventory = packs.inventory;
    expect(inventory.physicalMarkdownCount).toBe(inventory.namedCount + inventory.aggregateCount + inventory.excludedCount);
    expect(inventory.unclassifiedCount).toBe(0);
    const represented = packs.graph.nodes
      .filter((node: { kind: string; nameMode: string }) => node.kind !== "district" && node.nameMode !== "public_alias")
      .reduce((sum: number, node: { representedDocuments: number }) => sum + node.representedDocuments, 0);
    expect(represented).toBe(inventory.namedCount + inventory.aggregateCount);
  });

  test("publishes verified routes and an honest-empty chronology", () => {
    const edgeByPair = new Map(packs.graph.edges.map((edge: { source: string; target: string; occurrenceCount: number }) => [`${edge.source}\0${edge.target}`, edge.occurrenceCount]));
    const nodeIds = new Set(packs.graph.nodes.map((node: { id: string }) => node.id));
    expect(packs.flow.routes.length).toBeGreaterThan(0);
    for (const route of packs.flow.routes) {
      expect(route.provenance).toBe("resolved_wikilink_path");
      expect(route.weight).toBe(edgeByPair.get(`${route.members[0]}\0${route.members[1]}`));
      expect(route.stations.every((station: { entityId: string | null }) => station.entityId && nodeIds.has(station.entityId))).toBe(true);
    }
    expect(packs.flow.pulse).toEqual({ latestDailyId: null, latestDailyDate: null, sourceItemCount: null, chains: [] });
    expect(packs.temporal).toEqual({ eras: [], currentEra: null });
  });

  test("contains four evidence-backed public insights", () => {
    const ids = new Set(packs.entity.entities.map((entity: { id: string }) => entity.id));
    expect(packs.insight.items).toHaveLength(4);
    expect(packs.insight.items.every((item: { publicSafe: boolean; evidenceRefs: string[] }) =>
      item.publicSafe && item.evidenceRefs.length > 0 && item.evidenceRefs.every((id) => ids.has(id)))).toBe(true);
  });
});
