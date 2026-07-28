import { describe, expect, test } from "vitest";
import { buildAtlasGraphV2, verifyAtlasGraphV2 } from "../scripts/lib/atlas-graph-v2.mjs";
import {
  classifyRecordsWithPublicationPolicy,
  validatePublicationPolicyV2,
} from "../scripts/lib/atlas-publication-policy-v2.mjs";
import policy from "../public-safe/atlas-publication-policy.v2.json";

const record = (relativePath: string) => ({
  relativePath,
  title: relativePath.split("/").at(-1)?.replace(/\.md$/, "") ?? "",
  frontmatter: {},
  wikilinks: [],
});

const records = [
  record("MOC/에이전트.md"),
  record("Papers/Agent Papers.md"),
  record("Signals/AI 안전.md"),
  record("Rocket/Project Rocket.md"),
  record("Groot/Project Groot.md"),
  record("Intelligence Layer/Context Graph.md"),
  record("Strategy/SI-21 - [1] Commons Discovery.md"),
  record("Strategy/SR-09 - Private Request.md"),
  record("Console/Agent/Work Order.md"),
];

const resolvedEdges = [
  { sourcePath: "MOC/에이전트.md", targetPath: "Papers/Agent Papers.md", occurrences: 3 },
  { sourcePath: "Papers/Agent Papers.md", targetPath: "Signals/AI 안전.md", occurrences: 2 },
  { sourcePath: "Rocket/Project Rocket.md", targetPath: "MOC/에이전트.md", occurrences: 1 },
  { sourcePath: "Groot/Project Groot.md", targetPath: "MOC/에이전트.md", occurrences: 1 },
  { sourcePath: "Intelligence Layer/Context Graph.md", targetPath: "MOC/에이전트.md", occurrences: 1 },
  { sourcePath: "Strategy/SI-21 - [1] Commons Discovery.md", targetPath: "MOC/에이전트.md", occurrences: 1 },
];

describe("Atlas v7.8 publication policy and compact graph", () => {
  test("publishes the six approved roots with actual safe names and only connected strategy insight", () => {
    expect(validatePublicationPolicyV2(policy)).toEqual([]);
    const result = classifyRecordsWithPublicationPolicy(records, resolvedEdges, "atlas-public", policy);
    expect(result.inventory).toMatchObject({
      schema: "atlas.inventory.v1",
      namedCount: 7,
      aggregateCount: 0,
      excludedCount: 2,
      unclassifiedCount: 0,
      reconciliation: { pass: true },
    });
    expect(new Set(result.named.map((item) => item.domain))).toEqual(new Set([
      "MOC",
      "Papers",
      "Signals",
      "Rocket",
      "Groot",
      "Intelligence Layer",
      "Strategy",
    ]));
    expect(result.named.find((item) => item.domain === "Strategy")?.displayTitle).toBe("Commons Discovery");
    expect(result.classified.find((item) => item.kind === "strategy_request")?.classification.reason)
      .toBe("strategy_request");
    expect(result.classified.find((item) => item.domain === "Console")?.classification.disposition)
      .toBe("excluded");
  });

  test("builds deterministic topology coordinates and only resolved directed edges", () => {
    const classified = classifyRecordsWithPublicationPolicy(records, resolvedEdges, "atlas-public", policy);
    const input = {
      records: classified.classified,
      resolvedEdges,
      profile: "atlas-public",
      generatedAt: "2026-07-28T00:00:00.000Z",
    };
    const first = buildAtlasGraphV2(input);
    const second = buildAtlasGraphV2(input);
    expect(first).toEqual(second);
    expect(verifyAtlasGraphV2(first)).toEqual([]);
    expect(first).toMatchObject({
      schema: "atlas.graph.v2",
      profile: "atlas-public",
      manifest: {
        nodeCount: 7,
        edgeCount: 6,
        domainCount: 7,
      },
      layout: {
        axes: {
          position: "resolved_reference_topology_and_domain_structure",
          dateAxis: false,
        },
      },
    });
    expect(first.edges.every((edge) => edge[3] > 0)).toBe(true);
    expect(JSON.stringify(first)).not.toMatch(/relativePath|sourcePath|frontmatter|Work Order/);
  });
});
