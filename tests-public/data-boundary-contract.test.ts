import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { auditPublicPackBinding } from "../scripts/lib/public-data-wire.mjs";
import { verifyAtlasGraphV2 } from "../scripts/lib/atlas-graph-v2.mjs";

const packNames = ["agency", "inventory", "graph", "meaning", "publication"] as const;
const packs = Object.fromEntries(packNames.map((name) => [
  name,
  JSON.parse(readFileSync(path.resolve("public-safe", "data", `${name}.json`), "utf8")),
]));

describe("public data boundary", () => {
  test("binds every browser wrapper to exact authoritative JSON bytes", () => {
    for (const name of packNames) {
      const jsonText = readFileSync(path.resolve("public-safe", "data", `${name}.json`), "utf8");
      const jsText = readFileSync(path.resolve("public-safe", "data", `${name}.js`), "utf8");
      expect(auditPublicPackBinding({ name, jsonText, jsText })).toMatchObject({
        pass: true,
        exactJsonBytesEmbedded: true,
        deepEqual: true,
      });
    }
  });

  test("reconciles all source records and exposes the approved roots", () => {
    expect(verifyAtlasGraphV2(packs.graph)).toEqual([]);
    const inventory = packs.inventory;
    expect(inventory.physicalMarkdownCount).toBe(
      inventory.namedCount + inventory.aggregateCount + inventory.excludedCount,
    );
    expect(inventory.unclassifiedCount).toBe(0);
    const domainLabels = packs.graph.domains.map((domain: number[]) => packs.graph.strings[domain[1]]);
    expect(new Set(domainLabels)).toEqual(new Set([
      "Groot",
      "Intelligence Layer",
      "MOC",
      "Papers",
      "Rocket",
      "Signals",
      "Strategy",
    ]));
    expect(packs.graph.structure).toMatchObject({
      schema: "atlas.directory.v1",
      manifest: {
        folderCount: expect.any(Number),
        representedNodeCount: expect.any(Number),
        omittedNodeCount: expect.any(Number),
      },
    });
    expect(
      packs.graph.structure.manifest.representedNodeCount
      + packs.graph.structure.manifest.omittedNodeCount,
    ).toBe(packs.graph.manifest.nodeCount);
  });

  test("keeps public and owner graph projections distinct", () => {
    const owner = JSON.parse(
      readFileSync(path.resolve(".generated", "profiles", "owner", "data", "graph.json"), "utf8"),
    );
    expect(owner.profile).toBe("atlas-owner");
    expect(packs.graph.profile).toBe("atlas-public");
    expect(owner.manifest.nodeCount).toBeGreaterThan(packs.graph.manifest.nodeCount);
    expect(owner.manifest.projectionDigest).not.toBe(packs.graph.manifest.projectionDigest);
  });
});
