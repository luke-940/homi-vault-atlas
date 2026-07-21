import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { auditPublicPackBinding } from "../scripts/lib/public-data-wire.mjs";
import { buildAtlasGraphV1, verifyAtlasGraphV1 } from "../scripts/lib/atlas-graph-v1.mjs";
import { scanOperatingExposure, scanPrivacyText } from "../scripts/lib/privacy-scanner.mjs";
import {
  INVENTORY_EXCLUSION_PRIORITY,
  classifyDocument,
  semanticDateForDocument,
  structureKindForDocument,
} from "../scripts/lib/v7-4-profile-contract.mjs";
import {
  collectPublicProjectCountDisclosureFailures,
  validateAtlasPacksAtBoundary,
} from "../src/data-boundary-validation";
import { validateAtlasPacks } from "../src/data";
import { resolveWorkspaceScene } from "../src/components/workspaceSceneRegistry";
import { districtRelationRoutes, strongestConnectedNode, strongestIncidentEdge } from "../src/graph/model";

const publicPackNames = [
  "agency", "bootstrap", "inventory", "graph", "relation", "flow",
  "temporal", "entity", "health", "insight", "publication",
] as const;

const readPack = (name: string) => JSON.parse(
  readFileSync(path.resolve("public-safe", "data", `${name}.json`), "utf8"),
);

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

function assertGraphParentAncestry(graph: { nodes: Array<{ id: string; kind: string; parentId: string | null; clusterId: string }> }) {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const hubKinds = new Set(["moc_hub", "paper_gateway", "project", "signal_domain", "strategy_insight", "strategy_request", "aggregate_boundary"]);
  for (const node of graph.nodes) {
    if (!new Set(["source_document", "project_stage", "signal_storyline"]).has(node.kind)) continue;
    const visited = new Set([node.id]);
    let parent = node.parentId ? nodeById.get(node.parentId) : undefined;
    let foundHub = false;
    while (parent && !visited.has(parent.id)) {
      if (hubKinds.has(parent.kind)) {
        foundHub = true;
        break;
      }
      visited.add(parent.id);
      parent = parent.parentId ? nodeById.get(parent.parentId) : undefined;
    }
    expect(foundHub, `${node.id} must resolve to an evidenced hub ancestor`).toBe(true);
  }
}

function minimalStructure() {
  const node = (overrides: Record<string, unknown>) => ({
    id: "district:a",
    kind: "district",
    label: "A",
    parentId: null,
    districtId: "district:a",
    documentCount: 1,
    uniqueInboundDocuments: 0,
    inboundLinkOccurrences: 0,
    lastMeaningfulDate: null,
    nameMode: "approved_name",
    ...overrides,
  });
  return {
    schema: "atlas.structure.v2",
    profile: "atlas-public",
    generatedAt: "2026-07-21T00:00:00.000Z",
    nodes: [
      node({ id: "district:a", label: "A" }),
      node({ id: "district:b", label: "B", districtId: "district:b" }),
      node({ id: "node:a", kind: "moc_hub", label: "A hub", parentId: "district:a", uniqueInboundDocuments: 4, inboundLinkOccurrences: 7, lastMeaningfulDate: "2026-07-20" }),
      node({ id: "node:b", kind: "paper_gateway", label: "B hub", parentId: "district:b", districtId: "district:b", uniqueInboundDocuments: 2, inboundLinkOccurrences: 3, lastMeaningfulDate: null }),
    ],
    associations: [
      { id: "member:a", source: "node:a", target: "district:a", kind: "member_of", weight: 1 },
      { id: "reference:a-b", source: "node:a", target: "node:b", kind: "references", weight: 3 },
    ],
  };
}

describe("Atlas v7.5 graph and dual-profile boundary", () => {
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
    expect(inventory.reconciliation).toEqual({ classifiedTotal: classified, pass: true });
    expect(inventory.coverage.reduce((sum: number, row: { physical: number }) => sum + row.physical, 0))
      .toBe(inventory.physicalMarkdownCount);
    expect(inventory.exclusions.priority).toEqual(INVENTORY_EXCLUSION_PRIORITY);
  });

  test("applies fixed exclusion priority before public-title policy", () => {
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

  test("derives freshness only from meaningful dates and never mtime", () => {
    expect(semanticDateForDocument("MOC/Trust.md", { updated: "2026-07-03", mtime_ns: "999" }))
      .toBe("2026-07-03");
    expect(semanticDateForDocument("Research/Daily/2026-07/2026-07-20.md", { mtime_ns: "999" }))
      .toBe("2026-07-20");
    expect(semanticDateForDocument("Research/Weekly/2026-07-20 weekly note.md", {})).toBe("2026-07-20");
    expect(semanticDateForDocument("Rocket/2026-07-20 note.md", {})).toBeNull();
    expect(semanticDateForDocument("MOC/Unknown.md", { mtime_ns: "999" })).toBeNull();
  });

  test("keeps Paper, project, signal, and source kinds evidence-based", () => {
    expect(structureKindForDocument("Signals/Domains/AI 거버넌스.md", {})).toBe("signal_domain");
    expect(structureKindForDocument("Signals/Storylines/Agent work surface.md", {})).toBe("signal_storyline");
    expect(structureKindForDocument("Papers/Paper Atlas/AI Systems.md", {})).toBe("paper_gateway");
    expect(structureKindForDocument("Papers/RoadmapBench.md", {})).toBe("source_document");
    expect(structureKindForDocument("Rocket/00 - Rocket Control Tower.md", {})).toBe("project");
    expect(structureKindForDocument("Rocket/03 - Domain Scouting/_Index.md", {})).toBe("project_stage");
    expect(structureKindForDocument("Rocket/03 - Domain Scouting/Study.md", {})).toBe("source_document");
  });

  test("compiles identical graph and layout bytes from identical semantic input", () => {
    const source = minimalStructure();
    const first = buildAtlasGraphV1(structuredClone(source));
    const second = buildAtlasGraphV1(structuredClone(source));
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(verifyAtlasGraphV1(first)).toEqual([]);
    expect(first.edges).toEqual([
      expect.objectContaining({ source: "node:a", target: "node:b", kind: "references", direction: "forward", occurrenceCount: 3 }),
    ]);
    expect(first.edges.some((edge: { id: string }) => edge.id === "member:a")).toBe(false);
    expect(first.layout.coordinates.find((coordinate: { id: string }) => coordinate.id === "node:b")?.y)
      .toBe(first.layout.undatedRail.y);
  });

  test("publishes atlas.graph.v1 as the only runtime structure contract", () => {
    const graph = readPack("graph");
    expect(graph).toMatchObject({ schema: "atlas.graph.v1", profile: "atlas-public" });
    expect(verifyAtlasGraphV1(graph)).toEqual([]);
    expect(graph.layout.defaultNodeIds.length).toBeLessThanOrEqual(60);
    expect(graph.layout.defaultEdgeIds.length).toBeLessThanOrEqual(48);
    expect(graph.layout.axes).toEqual({
      x: { field: "districtId", kind: "categorical_cluster", direction: "left_to_right" },
      y: { field: "freshness", kind: "semantic_date", direction: "newer_is_higher", scale: "order_preserving_rank" },
      z: { field: "kind", kind: "structural_depth", direction: "district_to_source" },
    });
    expect(graph.layout.coordinates.every((coordinate: { z: number; depthLevel: number }) =>
      Number.isFinite(coordinate.z) && coordinate.depthLevel >= 0 && coordinate.depthLevel <= 4)).toBe(true);
    expect(graph.nodes.every((node: { id: string }) => !node.id.startsWith("actor:"))).toBe(true);
    expect(graph.edges.every((edge: { kind: string; direction: string; occurrenceCount: number }) =>
      edge.kind === "references" && edge.direction === "forward" && edge.occurrenceCount > 0)).toBe(true);
    const coordinateById = new Map(graph.layout.coordinates.map((coordinate: { id: string }) => [coordinate.id, coordinate]));
    const districtCoordinates = graph.nodes
      .filter((node: { kind: string }) => node.kind === "district")
      .map((node: { id: string }) => coordinateById.get(node.id) as { x: number; y: number; z: number });
    for (let leftIndex = 0; leftIndex < districtCoordinates.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < districtCoordinates.length; rightIndex += 1) {
        const left = districtCoordinates[leftIndex];
        const right = districtCoordinates[rightIndex];
        expect(Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z)).toBeGreaterThanOrEqual(120);
      }
    }
    const defaultCoordinates = graph.layout.defaultNodeIds
      .map((id: string) => coordinateById.get(id) as { x: number; y: number; z: number; radius: number });
    for (let leftIndex = 0; leftIndex < defaultCoordinates.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < defaultCoordinates.length; rightIndex += 1) {
        const left = defaultCoordinates[leftIndex];
        const right = defaultCoordinates[rightIndex];
        const target = Math.min(74, left.radius + right.radius + 10);
        expect(Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z)).toBeGreaterThanOrEqual(target - 0.75);
      }
    }
    expect(existsSync(path.resolve("public-safe", "data", "structure.json"))).toBe(false);
    expect(existsSync(path.resolve("public-safe", "data", "structure.js"))).toBe(false);
  });

  test("keeps every public source-level graph node under an evidenced hub", () => {
    assertGraphParentAncestry(readPack("graph"));
  });

  test("reconciles relation matrix directions and insight scene aliases", () => {
    const inventory = readPack("inventory");
    const graph = readPack("graph");
    const relation = readPack("relation");
    const insight = readPack("insight");
    const inventoryDistricts = new Set(inventory.coverage.map((row: { label: string }) => row.label));
    const graphDistricts = new Set(graph.nodes.filter((node: { kind: string }) => node.kind === "district").map((node: { label: string }) => node.label));
    expect(new Set(relation.districtOrder)).toEqual(inventoryDistricts);
    expect(graphDistricts).toEqual(inventoryDistricts);
    expect(relation.matrix.every((pair: { wikilink: number; wikilinkForward: number; wikilinkReverse: number; total: number }) =>
      pair.wikilink === pair.wikilinkForward + pair.wikilinkReverse && pair.total === pair.wikilink)).toBe(true);
    for (const item of insight.items) {
      expect(resolveWorkspaceScene(item.targetScene.workspace, item.targetScene.scene), item.id).not.toBeNull();
    }
  });

  test("keeps the visible content journey bound to real directed evidence", () => {
    const graph = readPack("graph");
    const relation = readPack("relation");
    const flow = readPack("flow");
    const focus = strongestConnectedNode(graph);
    expect(focus).not.toBeNull();
    if (!focus) throw new Error("Expected a connected public graph focus.");
    const trace = strongestIncidentEdge(graph, focus.id);
    expect(trace).not.toBeNull();
    if (!trace) throw new Error("Expected an incident edge for the public graph focus.");
    expect([trace.source, trace.target]).toContain(focus.id);
    const isolated = graph.nodes.find((node: { id: string }) => !graph.edges.some((edge: { source: string; target: string }) => edge.source === node.id || edge.target === node.id));
    if (isolated) expect(strongestIncidentEdge(graph, isolated.id)).toBeNull();

    const districtRoutes = districtRelationRoutes(graph, relation.matrix);
    expect(districtRoutes.length).toBeGreaterThan(0);
    expect(districtRoutes.every((route) => route.occurrenceCount > 0 && route.sourceId !== route.targetId)).toBe(true);

    const graphEdgeByPair = new Map(graph.edges.map((edge: { source: string; target: string }) => [`${edge.source}\0${edge.target}`, edge]));
    for (const route of flow.routes) {
      expect(route.members.length, route.id).toBeGreaterThan(0);
      const stationIds = route.stations.map((station: { entityId?: string }) => station.entityId).filter(Boolean);
      expect(stationIds, route.id).toHaveLength(2);
      const edge = graphEdgeByPair.get(`${stationIds[0]}\0${stationIds[1]}`) as { occurrenceCount: number } | undefined;
      expect(edge, route.id).toBeDefined();
      expect(edge?.occurrenceCount, route.id).toBe(route.weight);
    }
  });

  test("keeps activity owner-only and six public knowledge aggregates unchanged", () => {
    expect(readPack("entity").entities).toHaveLength(6);
    expect(existsSync(path.resolve("public-safe", "data", "activity.json"))).toBe(false);
    expect(existsSync(path.resolve("public-safe", "data", "activity.js"))).toBe(false);
    expect(readPack("publication").profile).toBe("public");
    expect(execFileSync("git", ["ls-files", ".generated/owner"], { encoding: "utf8" }).trim()).toBe("");
  });

  test("withholds project-specific counts and stages from public surfaces", () => {
    const packs = readPackSet(path.resolve("public-safe", "data"), publicPackNames);
    expect(collectPublicProjectCountDisclosureFailures(packs)).toEqual([]);
    expect(packs.inventory.coverage.filter((row: { label: string }) => ["Rocket", "Groot", "Intelligence Layer"].includes(row.label)))
      .toHaveLength(0);
    expect(packs.inventory.coverage.filter((row: { label: string }) => row.label === "Independent Projects"))
      .toHaveLength(1);
    expect(packs.graph.nodes.some((node: { kind: string }) => node.kind === "project_stage")).toBe(false);

    const injected = structuredClone(packs);
    injected.inventory.coverage.push({ id: "coverage:forbidden", label: "Rocket", physical: 1, named: 0, aggregate: 1, excluded: 0 });
    expect(() => validateAtlasPacksAtBoundary(injected)).toThrow(/프로젝트 수 비공개 계약/i);
  });

  test.each([...publicPackNames])("binds %s JavaScript to exact JSON bytes", (name) => {
    const jsonText = readFileSync(path.resolve("public-safe", "data", `${name}.json`), "utf8");
    const jsText = readFileSync(path.resolve("public-safe", "data", `${name}.js`), "utf8");
    expect(auditPublicPackBinding({ name, jsonText, jsText })).toMatchObject({
      pass: true,
      exactJsonBytesEmbedded: true,
      deepEqual: true,
    });
  });

  test("keeps all public authoritative packs free of privacy and operating exposure", () => {
    for (const name of publicPackNames) {
      const body = readFileSync(path.resolve("public-safe", "data", `${name}.json`), "utf8");
      expect(scanPrivacyText(body, { path: `data/${name}.json` })).toEqual([]);
      expect(scanOperatingExposure(body, { path: `data/${name}.json` })).toEqual([]);
    }
  });

  test("keeps tracked build source free of machine paths and release identifiers", () => {
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

  ownerTest("builds a bounded owner graph without crossing it into public bytes", () => {
    const ownerDataRoot = path.join(ownerRoot, "data");
    const owner = readPackSet(ownerDataRoot, [...publicPackNames, "activity"]);
    const publicPacks = readPackSet(path.resolve("public-safe", "data"), publicPackNames);
    expect(() => validateAtlasPacks(owner)).not.toThrow();
    expect(() => validateAtlasPacksAtBoundary(owner)).not.toThrow();
    expect(owner.graph).toMatchObject({ schema: "atlas.graph.v1", profile: "atlas-owner" });
    expect(verifyAtlasGraphV1(owner.graph)).toEqual([]);
    expect(owner.graph.nodes.length).toBeGreaterThan(publicPacks.graph.nodes.length);
    expect(owner.graph.edges.length).toBeGreaterThan(publicPacks.graph.edges.length);
    expect(owner.graph.layout.defaultNodeIds.length).toBeLessThanOrEqual(60);
    expect(owner.graph.layout.defaultEdgeIds.length).toBeLessThanOrEqual(48);
    expect(owner.activity).toMatchObject({ schema: "atlas.activity.v1", profile: "atlas-owner", live: false });
    expect(JSON.stringify(publicPacks)).not.toContain('"schema":"atlas.activity.v1"');
    expect(readFileSync(path.join(ownerDataRoot, "graph.json"), "utf8"))
      .not.toBe(readFileSync(path.resolve("public-safe", "data", "graph.json"), "utf8"));
    expect(existsSync(path.join(ownerDataRoot, "structure.json"))).toBe(false);
  });

  ownerTest("keeps owner source ancestry, Paper dimensions, and routes evidence-bound", () => {
    const projection = JSON.parse(readFileSync(path.join(ownerRoot, "atlas-owner.json"), "utf8"));
    const graph = JSON.parse(readFileSync(path.join(ownerRoot, "data", "graph.json"), "utf8"));
    const paper = JSON.parse(readFileSync(path.join(ownerRoot, "paper-dimension-receipt.json"), "utf8"));
    const flow = JSON.parse(readFileSync(path.join(ownerRoot, "data", "flow.json"), "utf8"));
    assertGraphParentAncestry(graph);
    expect(projection.sourceIndex.length).toBe(projection.inventory.namedCount);
    expect(paper).toMatchObject({
      schema: "atlas.paper_dimension_receipt.v1",
      sourceDocuments: 138,
      gatewayDocuments: 10,
      derivedFromFreshCapture: true,
      hardcodedHistoricalCounts: false,
      pass: true,
    });
    const edgeByPair = new Map(graph.edges.map((edge: { source: string; target: string; occurrenceCount: number }) => [`${edge.source}\0${edge.target}`, edge.occurrenceCount]));
    for (const route of flow.routes) {
      expect(route.weight).toBe(edgeByPair.get(`${route.members[0]}\0${route.members[1]}`));
    }
  });
});
