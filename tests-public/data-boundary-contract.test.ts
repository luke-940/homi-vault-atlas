import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { auditPublicPackBinding } from "../scripts/lib/public-data-wire.mjs";
import { verifyAtlasGraphV2 } from "../scripts/lib/atlas-graph-v2.mjs";
import {
  validateKnowledgeIndex,
  validatePublicationV3,
} from "../scripts/lib/knowledge-pack-contract.mjs";

const dataRoot = path.resolve(process.env.ATLAS_TEST_DATA_DIR ?? "public-safe/data");
const gate1Slice = process.env.ATLAS_GATE1_SLICE === "true";
const packNames = ["agency", "inventory", "graph", "meaning", "knowledge", "publication"] as const;
const packs = Object.fromEntries(packNames.map((name) => [
  name,
  JSON.parse(readFileSync(path.join(dataRoot, `${name}.json`), "utf8")),
]));

describe("public data boundary", () => {
  test("binds every browser wrapper to exact authoritative JSON bytes", () => {
    for (const name of packNames) {
      const jsonText = readFileSync(path.join(dataRoot, `${name}.json`), "utf8");
      const jsText = readFileSync(path.join(dataRoot, `${name}.js`), "utf8");
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

  test("keeps knowledge coverage fail-closed outside the five-node Gate 1 slice", () => {
    expect(validateKnowledgeIndex(packs.knowledge, packs.graph, {
      gate1: gate1Slice,
    })).toEqual([]);
    expect(validatePublicationV3(packs.publication, packs, {
      gate1: gate1Slice,
    })).toEqual([]);
    if (gate1Slice) {
      expect(packs.knowledge.releaseEligible).toBe(false);
      expect(packs.knowledge.manifest.dossierCount).toBe(5);
      expect(packs.publication.blockers).toContain("gate1_vertical_slice_not_full_coverage");
    } else {
      expect(packs.knowledge.releaseEligible).toBe(true);
      expect(packs.knowledge.manifest.dossierCount).toBe(packs.graph.manifest.nodeCount);
      expect(packs.publication.blockers).toEqual([]);
    }
  });

  test("keeps public and owner graph projections separated by runtime boundary", () => {
    const ownerGraphPath = path.resolve(".generated", "profiles", "owner", "data", "graph.json");
    if (!existsSync(ownerGraphPath)) {
      expect(packs.graph.profile).toBe("atlas-public");
      expect(packs.publication.profile).toBe("public");
      return;
    }
    const owner = JSON.parse(
      readFileSync(ownerGraphPath, "utf8"),
    );
    expect(owner.profile).toBe("atlas-owner");
    expect(packs.graph.profile).toBe("atlas-public");
    expect(owner.manifest.nodeCount).toBeGreaterThan(packs.graph.manifest.nodeCount);
    expect(owner.manifest.projectionDigest).not.toBe(packs.graph.manifest.projectionDigest);
  });
});
