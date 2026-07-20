import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { auditPublicPackBinding } from "../scripts/lib/public-data-wire.mjs";
import { scanOperatingExposure, scanPrivacyText } from "../scripts/lib/privacy-scanner.mjs";
import {
  collectPublicProjectCountDisclosureFailures,
  validateAtlasPacksAtBoundary,
} from "../src/data-boundary-validation";
import { validateAtlasPacks } from "../src/data";
import { resolveWorkspaceScene } from "../src/components/workspaceSceneRegistry";
import {
  INVENTORY_EXCLUSION_PRIORITY,
  cacheVerifiedWitnessBytes,
  classifyDocument,
  semanticDateForDocument,
  structureKindForDocument,
} from "../scripts/lib/v7-4-profile-contract.mjs";

const readPack = (name: string) => JSON.parse(
  readFileSync(path.resolve("public-safe", "data", `${name}.json`), "utf8"),
);

const publicPackNames = [
  "agency", "bootstrap", "inventory", "structure", "relation", "flow",
  "temporal", "entity", "health", "insight", "publication",
] as const;

const readPackSet = (root: string, names: readonly string[]) => Object.fromEntries(
  names.map((name) => [name, JSON.parse(readFileSync(path.join(root, `${name}.json`), "utf8"))]),
);

const atlasTestProfile = process.env.ATLAS_TEST_PROFILE ?? "public-ci";
if (!new Set(["public-ci", "owner-local"]).has(atlasTestProfile)) {
  throw new Error(`Unsupported ATLAS_TEST_PROFILE ${JSON.stringify(atlasTestProfile)}`);
}
const ownerRoot = path.resolve(".generated", "owner");
if (atlasTestProfile === "owner-local" && !existsSync(path.join(ownerRoot, "atlas-owner.json"))) {
  throw new Error("Owner-local QA requires the fresh local .generated/owner projection; public CI must never synthesize or import it.");
}
const ownerTest = (atlasTestProfile === "owner-local" ? test : (() => undefined)) as typeof test;

function assertSourceHubAncestry(file: string) {
  const structure = JSON.parse(readFileSync(file, "utf8"));
  const nodeById = new Map(structure.nodes.map((node: { id: string }) => [node.id, node]));
  const sourceKinds = new Set(["source_document", "project_stage", "signal_storyline", "aggregate_boundary"]);
  const hubKinds = new Set([
    "moc_hub", "paper_gateway", "project", "signal_domain", "strategy_insight", "strategy_request",
  ]);
  const isSafeAggregateHub = (node: { kind: string; documentCount: number; nameMode: string } | undefined) =>
    node?.kind === "aggregate_boundary"
    && node.documentCount === 0
    && ["aggregate", "public_alias"].includes(node.nameMode);

  for (const node of structure.nodes) {
    if (!sourceKinds.has(node.kind) || isSafeAggregateHub(node)) continue;
    const visited = new Set([node.id]);
    let parent = nodeById.get(node.parentId) as {
      id: string; kind: string; parentId: string | null; documentCount: number; nameMode: string;
    } | undefined;
    let foundHub = false;
    while (parent && !visited.has(parent.id)) {
      if (hubKinds.has(parent.kind) || isSafeAggregateHub(parent)) {
        foundHub = true;
        break;
      }
      visited.add(parent.id);
      parent = nodeById.get(parent.parentId) as typeof parent;
    }
    expect(foundHub, `${node.label} must resolve to a hub ancestor`).toBe(true);
  }

  const storylines = structure.nodes.filter((node: { kind: string }) => node.kind === "signal_storyline");
  expect(storylines.every((node: { parentId: string }) => {
    const parent = nodeById.get(node.parentId) as { kind: string; documentCount: number; nameMode: string } | undefined;
    return parent?.kind === "signal_domain" || isSafeAggregateHub(parent);
  })).toBe(true);
}

describe("Atlas v7.4 dual-profile data boundary", () => {
  test("reconciles every physical Markdown document exactly once", () => {
    const inventory = readPack("inventory");
    const classified = inventory.namedCount + inventory.aggregateCount + inventory.excludedCount;
    expect(inventory).toMatchObject({
      schema: "atlas.inventory.v1",
      profile: "atlas-public",
      unclassifiedCount: 0,
      publicTitlePolicy: {
        schema: "public-title-allowlist.v1",
        mode: "safe_hybrid",
        fallback: "alias_or_aggregate",
        projectCountDisclosure: "combined_non_attributable",
      },
    });
    expect(classified).toBe(inventory.physicalMarkdownCount);
    expect(inventory.namedCount).toBe(15);
    expect(inventory.reconciliation).toEqual({ classifiedTotal: classified, pass: true });
    expect(inventory.coverage.reduce((sum: number, row: { physical: number }) => sum + row.physical, 0))
      .toBe(inventory.physicalMarkdownCount);
    expect(inventory.exclusions.priority).toEqual(INVENTORY_EXCLUSION_PRIORITY);
  });

  test("applies the fixed exclusion priority before title policy", () => {
    const allowlist = { titles: ["Allowed"] };
    expect(classifyDocument({
      relativePath: "Console/Archive/Agent/Allowed.md",
      title: "Allowed",
      frontmatter: { atlas_public: "false" },
    }, "atlas-public", allowlist)).toEqual({ disposition: "excluded", reason: "archive" });
    expect(classifyDocument({
      relativePath: "MOC/Not Yet Approved.md",
      title: "Not Yet Approved",
      frontmatter: {},
    }, "atlas-public", allowlist)).toEqual({ disposition: "aggregate", reason: null });
  });

  test("derives freshness only from semantic dates and never mtime", () => {
    expect(semanticDateForDocument("MOC/Trust.md", { updated: "2026-07-03", mtime_ns: "999" }))
      .toBe("2026-07-03");
    expect(semanticDateForDocument("Research/Daily/2026-07/2026-07-20.md", { mtime_ns: "999" }))
      .toBe("2026-07-20");
    expect(semanticDateForDocument("Research/Weekly/2026-07-20 weekly note.md", {})).toBe("2026-07-20");
    expect(semanticDateForDocument("Rocket/2026-07-20 note.md", {})).toBeNull();
    expect(semanticDateForDocument("MOC/Unknown.md", { mtime_ns: "999" })).toBeNull();
  });

  test("caches each verified canonical witness exactly once before owner projection parsing", async () => {
    const body = Buffer.from("captured ledger bytes\n", "utf8");
    const witness = {
      sourcePath: "/virtual/activity-events.v1.jsonl",
      bytes: body.length,
      secondSha256: createHash("sha256").update(body).digest("hex"),
    };
    let reads = 0;
    const cache = await cacheVerifiedWitnessBytes([witness], async () => {
      reads += 1;
      return body;
    });
    expect(reads).toBe(1);
    expect(cache.get(witness.sourcePath)).toBe(body);
    await expect(cacheVerifiedWitnessBytes([{ ...witness, secondSha256: "0".repeat(64) }], async () => body))
      .rejects.toThrow(/witness drift/i);
  });

  test("classifies signal domains and storylines before the generic Signals fallback", () => {
    expect(structureKindForDocument("Signals/Domains/AI 거버넌스.md", {})).toBe("signal_domain");
    expect(structureKindForDocument("Signals/Storylines/Agent work surface.md", {})).toBe("signal_storyline");
  });

  test("classifies Paper gateways only from explicit gateway evidence", () => {
    expect(structureKindForDocument("Papers/Paper Atlas/AI Systems.md", {})).toBe("paper_gateway");
    expect(structureKindForDocument("Papers/Atlas - Paper Gateway.md", {})).toBe("paper_gateway");
    expect(structureKindForDocument("Papers/RoadmapBench.md", {})).toBe("source_document");
    expect(structureKindForDocument("Papers/A map of evaluation.md", {})).toBe("source_document");
  });

  test("classifies only explicit project roots and catalog evidence as project stages", () => {
    expect(structureKindForDocument("Rocket/00 - Rocket Control Tower.md", {})).toBe("project");
    expect(structureKindForDocument("Groot/_Index.md", {})).toBe("project");
    expect(structureKindForDocument("Rocket/03 - Domain Scouting/_Index.md", {})).toBe("project_stage");
    expect(structureKindForDocument("Rocket/03 - Domain Scouting/Study.md", {})).toBe("source_document");
    expect(structureKindForDocument("Intelligence Layer/Daily Radar/2026-07-20 - HIL Daily Radar.md", {}))
      .toBe("source_document");
    expect(structureKindForDocument("Groot/Research/Experiment.md", { project_stage: "discovery" }))
      .toBe("project_stage");
  });

  test("publishes structure v2 with distinct gravity and occurrence units", () => {
    const structure = readPack("structure");
    const allowlist = JSON.parse(readFileSync(path.resolve("public-safe", "public-title-allowlist.v1.json"), "utf8"));
    const ids = new Set(structure.nodes.map((node: { id: string }) => node.id));
    expect(structure).toMatchObject({
      schema: "atlas.structure.v2",
      profile: "atlas-public",
      measurement: {
        gravityMetric: "uniqueInboundDocuments",
        occurrenceMetric: "inboundLinkOccurrences",
        freshnessSource: "semantic_date_only",
      },
    });
    expect(structure.nodes.length).toBeGreaterThan(structure.districts.length);
    expect(structure.nodes.every((node: { id: string }) => !node.id.startsWith("actor:"))).toBe(true);
    expect(structure.nodes.every((node: { id: string }) => !/\d/.test(node.id))).toBe(true);
    expect(structure.nodes.every((node: { uniqueInboundDocuments: number; inboundLinkOccurrences: number }) =>
      node.inboundLinkOccurrences >= node.uniqueInboundDocuments)).toBe(true);
    const approvedNames = structure.nodes
      .filter((node: { nameMode: string }) => node.nameMode === "approved_name" && node.kind !== "district")
      .map((node: { label: string }) => node.label)
      .sort();
    expect(approvedNames).toEqual([...allowlist.titles].sort());
    expect(structure.associations.every((edge: { source: string; target: string }) =>
      ids.has(edge.source) && ids.has(edge.target))).toBe(true);
    const references = structure.associations.filter((edge: { kind: string }) => edge.kind === "references");
    expect(references.length).toBeGreaterThan(0);
    expect(references.every((edge: { weight: number }) => Number.isInteger(edge.weight) && edge.weight > 0)).toBe(true);
    expect(structure.associations.every((edge: { id: string }) => !/\d/.test(edge.id))).toBe(true);
    expect(JSON.stringify(structure)).not.toMatch(/mtime/i);
  });

  test("reconciles the fresh public-district relation matrix, coverage, directions, and strongest insight", () => {
    const inventory = readPack("inventory");
    const structure = readPack("structure");
    const relation = readPack("relation");
    const insight = readPack("insight");
    const inventoryDistricts = new Set(inventory.coverage.map((row: { label: string }) => row.label));
    const structureDistricts = new Set(structure.districts.map((row: { name: string }) => row.name));
    const v2Districts = new Set(structure.nodes
      .filter((node: { kind: string }) => node.kind === "district")
      .map((node: { label: string }) => node.label));
    const matrixInterDistrict = relation.matrix.reduce(
      (sum: number, pair: { wikilink: number }) => sum + pair.wikilink,
      0,
    );
    const strongestPair = [...relation.matrix]
      .sort((left: { wikilink: number; id: string }, right: { wikilink: number; id: string }) =>
        right.wikilink - left.wikilink || left.id.localeCompare(right.id))[0];
    const strongestInsight = insight.items.find((item: { kind: string }) => item.kind === "strongest_relation");

    expect(relation.districtOrder).toHaveLength(inventory.coverage.length);
    expect(new Set(relation.districtOrder)).toEqual(inventoryDistricts);
    expect(structureDistricts).toEqual(inventoryDistricts);
    expect(v2Districts).toEqual(inventoryDistricts);
    expect(relation.coverage.layers.wikilink.displayed).toBe(matrixInterDistrict);
    expect(relation.coverage.layers.wikilink.interDistrict).toBe(matrixInterDistrict);
    expect(relation.coverage.layers.wikilink.total).toBe(
      relation.coverage.layers.wikilink.interDistrict + relation.coverage.layers.wikilink.intraDistrict,
    );
    expect(relation.coverage.resolvedLinkWeight).toBe(relation.coverage.layers.wikilink.total);
    expect(relation.matrix.every((pair: {
      wikilink: number; wikilinkForward: number; wikilinkReverse: number; total: number;
    }) => pair.wikilink === pair.wikilinkForward + pair.wikilinkReverse && pair.total === pair.wikilink)).toBe(true);
    expect(strongestInsight.metric.value).toBe(strongestPair.wikilink);
    expect(strongestInsight.targetScene.relationPairId).toBe(strongestPair.id);
    expect(structure.nodes.some((node: { id: string; kind: string }) =>
      node.id === strongestInsight.targetScene.focusId && node.kind === "district")).toBe(true);
  });

  test("binds every insight to a real canonical or aliased workspace scene", () => {
    const insight = readPack("insight");
    for (const item of insight.items) {
      expect(resolveWorkspaceScene(item.targetScene.workspace, item.targetScene.scene), item.id).not.toBeNull();
    }
    const attention = insight.items.find((item: { kind: string }) => item.kind === "attention");
    expect(attention.targetScene).toEqual({ workspace: "home", scene: "coverage-boundary" });
  });

  test("keeps activity owner-only and the six public knowledge entities unchanged", () => {
    expect(readPack("entity").entities).toHaveLength(6);
    expect(existsSync(path.resolve("public-safe", "data", "activity.json"))).toBe(false);
    expect(existsSync(path.resolve("public-safe", "data", "activity.js"))).toBe(false);
    expect(readPack("publication").profile).toBe("public");
    const tracked = execFileSync("git", ["ls-files", ".generated/owner"], { encoding: "utf8" }).trim();
    expect(tracked).toBe("");
  });

  ownerTest("materializes the owner-only activity pack locally", () => {
    expect(existsSync(path.join(ownerRoot, "data", "activity.json"))).toBe(true);
  });

  ownerTest("builds one owner primary parent per represented document with real nested roles", () => {
    const ownerRoot = path.resolve(".generated", "owner", "data");
    const inventory = JSON.parse(readFileSync(path.join(ownerRoot, "inventory.json"), "utf8"));
    const structure = JSON.parse(readFileSync(path.join(ownerRoot, "structure.json"), "utf8"));
    const ids = new Set(structure.nodes.map((node: { id: string }) => node.id));
    const documentNodes = structure.nodes.filter((node: { kind: string; nameMode: string }) =>
      node.kind !== "district" && node.nameMode === "owner_name");
    const syntheticAggregateHubs = structure.nodes.filter((node: {
      kind: string; nameMode: string; documentCount: number;
    }) => node.kind === "aggregate_boundary" && node.nameMode === "aggregate" && node.documentCount === 0);
    const memberEdges = structure.associations.filter((edge: { kind: string }) => edge.kind === "member_of");
    const membershipCounts = new Map<string, number>();
    for (const edge of memberEdges) membershipCounts.set(edge.source, (membershipCounts.get(edge.source) ?? 0) + 1);

    expect(documentNodes).toHaveLength(inventory.namedCount);
    expect(documentNodes.reduce((sum: number, node: { documentCount: number }) => sum + node.documentCount, 0))
      .toBe(inventory.namedCount);
    expect(documentNodes.every((node: { parentId: string | null }) => node.parentId && ids.has(node.parentId))).toBe(true);
    expect(documentNodes.every((node: { id: string }) => membershipCounts.get(node.id) === 1)).toBe(true);
    expect(documentNodes.filter((node: { parentId: string }) => !node.parentId.startsWith("district:")).length)
      .toBeGreaterThan(0);
    expect(documentNodes.filter((node: { kind: string }) => node.kind === "signal_domain").length).toBeGreaterThan(0);
    expect(documentNodes.filter((node: { kind: string }) => node.kind === "signal_storyline").length).toBeGreaterThan(0);
    expect(syntheticAggregateHubs.length).toBeGreaterThan(0);
    expect(syntheticAggregateHubs.every((node: { id: string; parentId: string }) =>
      node.parentId.startsWith("district:") && membershipCounts.get(node.id) === 1)).toBe(true);
  });

  test("keeps every public source-level node under an evidenced or safe aggregate hub", () => {
    assertSourceHubAncestry(path.resolve("public-safe", "data", "structure.json"));
  });

  ownerTest("keeps every owner source-level node under an evidenced or safe aggregate hub", () => {
    assertSourceHubAncestry(path.join(ownerRoot, "data", "structure.json"));
  });

  ownerTest("preserves real project catalog hierarchy without promoting every deep document to a stage", () => {
    const owner = JSON.parse(readFileSync(path.resolve(".generated", "owner", "atlas-owner.json"), "utf8"));
    const nodeById = new Map(owner.structure.nodes.map((node: { id: string }) => [node.id, node]));
    const projectEntries = owner.sourceIndex.filter((entry: { path: string }) =>
      /^(?:Rocket|Groot|Intelligence Layer)\//.test(entry.path));
    const deepDocuments = projectEntries.filter((entry: { path: string; kind: string }) =>
      entry.path.split("/").length > 2 && entry.kind === "source_document");
    const stageNodes = owner.structure.nodes.filter((node: { kind: string }) => node.kind === "project_stage");
    const nestedSourceDocuments = owner.structure.nodes.filter((node: { kind: string; parentId: string }) => {
      if (node.kind !== "source_document") return false;
      const parent = nodeById.get(node.parentId) as { kind: string } | undefined;
      return parent?.kind === "project" || parent?.kind === "project_stage";
    });

    expect(deepDocuments.length).toBeGreaterThan(0);
    expect(projectEntries.some((entry: { path: string; kind: string }) =>
      entry.path.endsWith("/_Index.md") && entry.kind === "project_stage")).toBe(true);
    expect(stageNodes.every((node: { label: string }) => node.label !== "_Index" && node.label.length > 0)).toBe(true);
    expect(new Set(stageNodes.map((node: { label: string }) => node.label)).size).toBe(stageNodes.length);
    expect(nestedSourceDocuments.length).toBeGreaterThan(0);
  });

  ownerTest("derives Paper source, gateway, and multi-membership dimensions from fresh links", () => {
    const owner = JSON.parse(readFileSync(path.resolve(".generated", "owner", "atlas-owner.json"), "utf8"));
    const paper = JSON.parse(readFileSync(
      path.resolve(".generated", "owner", "paper-dimension-receipt.json"), "utf8",
    ));
    const papersDistrict = owner.structure.nodes.find((node: { kind: string; label: string }) =>
      node.kind === "district" && node.label === "Papers");
    const paperNodes = owner.structure.nodes.filter((node: { districtId: string }) =>
      node.districtId === papersDistrict.id);
    const sourceIds = new Set(paperNodes
      .filter((node: { kind: string }) => node.kind === "source_document")
      .map((node: { id: string }) => node.id));
    const gatewayIds = new Set(paperNodes
      .filter((node: { kind: string }) => node.kind === "paper_gateway")
      .map((node: { id: string }) => node.id));
    const catalogGateways = paperNodes.filter((node: { kind: string; parentId: string }) =>
      node.kind === "paper_gateway" && node.parentId === papersDistrict.id);
    const categoryGateways = paperNodes.filter((node: { kind: string; parentId: string }) =>
      node.kind === "paper_gateway" && node.parentId !== papersDistrict.id);
    const memberships = owner.structure.associations.filter((edge: { kind: string }) =>
      edge.kind === "associated_with");

    expect(paper).toMatchObject({
      schema: "atlas.paper_dimension_receipt.v1",
      sourceDocuments: sourceIds.size,
      gatewayDocuments: gatewayIds.size,
      catalogGatewayDocuments: catalogGateways.length,
      categoryGatewayDocuments: categoryGateways.length,
      associationEdges: memberships.length,
      derivedFromFreshCapture: true,
      hardcodedHistoricalCounts: false,
      pass: true,
    });
    expect(memberships.length).toBeGreaterThan(0);
    expect(catalogGateways.length).toBeGreaterThan(0);
    expect(categoryGateways.length).toBeGreaterThan(0);
    expect(memberships.every((edge: { source: string; target: string; weight: number }) =>
      sourceIds.has(edge.source)
      && gatewayIds.has(edge.target)
      && Number.isInteger(edge.weight)
      && edge.weight > 0)).toBe(true);
    expect(paper.associatedSourceDocuments + paper.unassociatedSourceDocuments).toBe(paper.sourceDocuments);
  });

  ownerTest("binds owner verified route weights to owner reference occurrences", () => {
    const ownerRoot = path.resolve(".generated", "owner", "data");
    const structure = JSON.parse(readFileSync(path.join(ownerRoot, "structure.json"), "utf8"));
    const flow = JSON.parse(readFileSync(path.join(ownerRoot, "flow.json"), "utf8"));
    for (const route of flow.routes) {
      const edge = structure.associations.find((candidate: { kind: string; source: string; target: string }) =>
        candidate.kind === "references"
        && candidate.source === route.members[0]
        && candidate.target === route.members[1]);
      expect(Number.isInteger(route.weight) && route.weight > 0).toBe(true);
      expect(route.weight).toBe(edge?.weight);
    }
  });

  test("adds public-safe third-level aggregates without inflating represented counts", () => {
    const inventory = readPack("inventory");
    const structure = readPack("structure");
    const nodeById = new Map(structure.nodes.map((node: { id: string }) => [node.id, node]));
    const aggregateChildren = structure.nodes.filter((node: { kind: string; nameMode: string }) =>
      node.kind === "aggregate_boundary" && node.nameMode === "aggregate");
    const represented = structure.nodes
      .filter((node: { kind: string; nameMode: string }) => node.kind !== "district" && node.nameMode !== "public_alias")
      .reduce((sum: number, node: { documentCount: number }) => sum + node.documentCount, 0);

    expect(aggregateChildren.length).toBeGreaterThan(0);
    expect(aggregateChildren.every((node: { parentId: string; label: string; documentCount: number }) => {
      const parent = nodeById.get(node.parentId) as { kind: string } | undefined;
      return parent?.kind !== "district"
        && node.label.endsWith("· 공개 안전 원천 집계")
        && node.documentCount > 0;
    })).toBe(true);
    expect(represented).toBe(inventory.namedCount + inventory.aggregateCount);
  });

  test("withholds individual project counts from JSON, JS, DOM, Search, and ARIA projections", () => {
    const publicRoot = path.resolve("public-safe", "data");
    const ownerRoot = path.resolve(".generated", "owner", "data");
    const publicPacks = readPackSet(publicRoot, publicPackNames);
    const ownerInventory = JSON.parse(readFileSync(path.join(ownerRoot, "inventory.json"), "utf8"));
    const projectNames = ["Rocket", "Groot", "Intelligence Layer"];
    const ownerRows = ownerInventory.coverage.filter((row: { label: string }) => projectNames.includes(row.label));
    const combined = publicPacks.inventory.coverage.find((row: { label: string }) => row.label === "Independent Projects");
    expect(ownerRows).toHaveLength(3);
    expect(publicPacks.inventory.coverage.filter((row: { label: string }) => projectNames.includes(row.label)))
      .toHaveLength(0);
    expect(combined).toMatchObject({
      physical: ownerRows.reduce((sum: number, row: { physical: number }) => sum + row.physical, 0),
      named: 0,
      aggregate: ownerRows.reduce((sum: number, row: { physical: number }) => sum + row.physical, 0),
      excluded: 0,
    });
    expect(publicPacks.inventory.publicTitlePolicy.projectCountDisclosure).toBe("combined_non_attributable");
    expect(collectPublicProjectCountDisclosureFailures(publicPacks)).toEqual([]);

    const structureLabels = [
      ...publicPacks.structure.districts.map((row: { name: string }) => row.name),
      ...publicPacks.structure.hierarchyNodes.map((row: { label: string }) => row.label),
      ...publicPacks.structure.nodes.map((row: { label: string }) => row.label),
    ];
    expect(structureLabels).toContain("Independent Projects");
    expect(structureLabels.some((label: string) => projectNames.some((name) => label === name || label.startsWith(`${name} `))))
      .toBe(false);
    expect(publicPacks.structure.nodes.some((node: { kind: string }) => node.kind === "project_stage")).toBe(false);

    const jsonSurface = publicPackNames.map((name) => readFileSync(path.join(publicRoot, `${name}.json`), "utf8")).join("\n");
    const jsSurface = publicPackNames.map((name) => readFileSync(path.join(publicRoot, `${name}.js`), "utf8")).join("\n");
    const districtNodes = publicPacks.structure.nodes.filter((node: { kind: string }) => node.kind === "district");
    const domSurface = districtNodes.map((node: { label: string; documentCount: number }) => `${node.label} ${node.documentCount}개 기록`).join(" | ");
    const searchSurface = districtNodes.map((node: { label: string; documentCount: number }) => `${node.label} ${node.documentCount}개 기록 · 구역`).join(" | ");
    const ariaSurface = districtNodes.map((node: { label: string; documentCount: number }) => `${node.label}, ${node.documentCount}개 문서`).join(" | ");
    for (const row of ownerRows) {
      const exactDisclosure = new RegExp(`${row.label}[^\\n]{0,120}${row.physical}(?:개|\\b)`);
      expect(jsonSurface).not.toMatch(exactDisclosure);
      expect(jsSurface).not.toMatch(exactDisclosure);
      expect(domSurface).not.toMatch(exactDisclosure);
      expect(searchSurface).not.toMatch(exactDisclosure);
      expect(ariaSurface).not.toMatch(exactDisclosure);
    }

    const injected = structuredClone(publicPacks);
    injected.inventory.coverage.push({
      id: "coverage:forbidden-project-fixture",
      label: "Rocket",
      physical: ownerRows.find((row: { label: string }) => row.label === "Rocket").physical,
      named: 0,
      aggregate: ownerRows.find((row: { label: string }) => row.label === "Rocket").aggregate,
      excluded: 0,
    });
    expect(() => validateAtlasPacksAtBoundary(injected)).toThrow(/프로젝트 수 비공개 계약/i);
  });

  test("binds every public redaction count to the fresh inventory", () => {
    const inventory = readPack("inventory");
    const counts = readPack("publication").redactionCounts;
    const attention = readPack("insight").items.find((item: { kind: string }) => item.kind === "attention");
    const represented = inventory.namedCount + inventory.aggregateCount;
    expect(counts).toMatchObject({
      sourceEntities: inventory.physicalMarkdownCount,
      namedSourceDocuments: inventory.namedCount,
      aggregateSourceDocuments: inventory.aggregateCount,
      aggregatedSourceDocuments: represented,
      representedSourceDocuments: represented,
      excludedEntities: inventory.excludedCount,
      excludedSourceDocuments: inventory.excludedCount,
      archiveExcluded: inventory.exclusions.byReason.archive,
      scaffoldingExcluded: inventory.exclusions.byReason.scaffolding,
      controlDocumentsExcluded: inventory.exclusions.byReason.control_internal,
      rawDailyExcluded: inventory.exclusions.byReason.raw_daily,
      explicitPolicyExcluded: inventory.exclusions.byReason.explicit_policy,
      publicNameNotApproved: inventory.exclusions.byReason.public_name_not_approved,
    });
    expect(attention.metric).toEqual({ value: inventory.excludedCount, label: "제외 문서", unit: "개" });
  });

  ownerTest("keeps owner-specific runtime bytes outside every public data root", () => {
    const ownerRoot = path.resolve(".generated", "owner", "data");
    const publicBody = [
      "agency", "bootstrap", "inventory", "structure", "relation", "flow",
      "temporal", "entity", "health", "insight", "publication",
    ].map((name) => readFileSync(path.resolve("public-safe", "data", `${name}.json`), "utf8")).join("\n");
    expect(readFileSync(path.join(ownerRoot, "inventory.json"), "utf8"))
      .not.toBe(readFileSync(path.resolve("public-safe", "data", "inventory.json"), "utf8"));
    expect(readFileSync(path.join(ownerRoot, "structure.json"), "utf8"))
      .not.toBe(readFileSync(path.resolve("public-safe", "data", "structure.json"), "utf8"));
    expect(publicBody).not.toContain('"schema": "atlas.activity.v1"');
    expect(publicBody).not.toContain('"profile": "atlas-owner"');
  });

  test("rejects a synthetic owner activity pack at the public boundary", () => {
    const syntheticActivity = {
      schema: "atlas.activity.v1",
      profile: "atlas-owner",
      generatedAt: "2026-07-20T00:00:00.000Z",
      asOfDate: "2026-07-20",
      live: false,
      boundary: "Synthetic contract fixture with no canonical owner bytes.",
      aggregates: [],
      lifecycle: [],
    };
    const publicWithActivity = {
      ...readPackSet(path.resolve("public-safe", "data"), publicPackNames),
      activity: syntheticActivity,
    };
    expect(() => validateAtlasPacksAtBoundary(publicWithActivity)).toThrow(/owner-activity:public-profile/i);
  });

  ownerTest("accepts the local owner activity pack while keeping it invalid in the public profile", () => {
    const ownerRoot = path.resolve(".generated", "owner", "data");
    const owner = readPackSet(ownerRoot, [...publicPackNames, "activity"]);
    expect(() => validateAtlasPacks(owner)).not.toThrow();
    expect(() => validateAtlasPacksAtBoundary(owner)).not.toThrow();

    const publicWithActivity = {
      ...readPackSet(path.resolve("public-safe", "data"), publicPackNames),
      activity: owner.activity,
    };
    expect(() => validateAtlasPacksAtBoundary(publicWithActivity)).toThrow(/owner-activity:public-profile/i);
  });

  test.each([
    ...publicPackNames,
  ])("binds %s JavaScript to exact JSON bytes", (name) => {
    const jsonText = readFileSync(path.resolve("public-safe", "data", `${name}.json`), "utf8");
    const jsText = readFileSync(path.resolve("public-safe", "data", `${name}.js`), "utf8");
    expect(auditPublicPackBinding({ name, jsonText, jsText })).toMatchObject({
      pass: true,
      exactJsonBytesEmbedded: true,
      deepEqual: true,
    });
  });

  test("keeps every authoritative public pack free of privacy and operating exposure", () => {
    for (const name of [
      "agency", "bootstrap", "inventory", "structure", "relation", "flow",
      "temporal", "entity", "health", "insight", "publication",
    ]) {
      const body = readFileSync(path.resolve("public-safe", "data", `${name}.json`), "utf8");
      expect(scanPrivacyText(body, { path: `data/${name}.json` })).toEqual([]);
      expect(scanOperatingExposure(body, { path: `data/${name}.json` })).toEqual([]);
    }
  });

  test("keeps tracked build source free of machine-specific paths and activity identifiers", () => {
    const scriptFiles = execFileSync("rg", ["--files", "scripts"], { encoding: "utf8" })
      .trim().split("\n").filter((file) => file.endsWith(".mjs"));
    for (const file of scriptFiles) {
      const body = readFileSync(path.resolve(file), "utf8");
      if (file !== "scripts/lib/privacy-scanner.mjs") {
        expect(scanPrivacyText(body, { path: file, toolingText: true })).toEqual([]);
      }
      expect(body).not.toMatch(/\/Users\/[A-Za-z0-9._-]+\//);
      expect(body).not.toMatch(/\bREL-ATLAS-[A-Z0-9-]+\b/);
    }
  });
});
