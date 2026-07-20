import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, test } from "vitest";
import { installPublicAtlasDomFixture } from "./atlas-packs.fixture";

const readJson = (name: string) => JSON.parse(
  readFileSync(path.resolve("public-safe", "data", `${name}.json`), "utf8"),
);

let stateModule: typeof import("../src/state");
let dataModule: typeof import("../src/data-runtime");
let commandModule: typeof import("../src/components/CommandBar");
let navigatorModule: typeof import("../src/components/NavigatorTray");
let trayModule: typeof import("../src/components/tray-accessibility");
let homeModule: typeof import("../src/views/HomeView");
let inspectorModule: typeof import("../src/components/InspectorTray");
let searchModule: typeof import("../src/components/SearchPalette");
let exploreModule: typeof import("../src/views/ExploreView");
let agencyModule: typeof import("../src/views/AgencyView");
let paletteModule: typeof import("../src/viz/palette");

beforeAll(async () => {
  installPublicAtlasDomFixture();
  Object.assign(window, {
    location: { hash: "#home", href: "http://127.0.0.1/#home" },
    matchMedia: () => ({
      matches: false,
      media: "",
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => true,
    }),
    addEventListener() {},
    removeEventListener() {},
    localStorage: { getItem: () => "1", setItem() {} },
  });
  Object.assign(document, { hidden: false });
  stateModule = await import("../src/state");
  dataModule = await import("../src/data-runtime");
  commandModule = await import("../src/components/CommandBar");
  navigatorModule = await import("../src/components/NavigatorTray");
  trayModule = await import("../src/components/tray-accessibility");
  homeModule = await import("../src/views/HomeView");
  inspectorModule = await import("../src/components/InspectorTray");
  searchModule = await import("../src/components/SearchPalette");
  exploreModule = await import("../src/views/ExploreView");
  agencyModule = await import("../src/views/AgencyView");
  paletteModule = await import("../src/viz/palette");
});

function renderWorkspace(hash: string, View: React.ComponentType) {
  window.location.hash = hash;
  window.location.href = `http://127.0.0.1/${hash}`;
  return renderToStaticMarkup(
    React.createElement(
      stateModule.AtlasStateProvider,
      null,
      React.createElement(View),
    ),
  );
}

describe("public Atlas runtime contracts", () => {
  test("every public district resolves to exactly one hierarchy district at runtime", () => {
    const structure = readJson("structure");
    for (const district of structure.districts) {
      const matches = structure.hierarchyNodes.filter(
        (node: { kind: string; label: string }) => node.kind === "district" && node.label === district.name,
      );
      expect(matches).toHaveLength(1);
      expect(matches[0].id).toMatch(/^tax:pub:district:/);
      expect(dataModule.hierarchyFocusForDistrict(district.name)).toBe(matches[0].id);
    }
    expect(dataModule.hierarchyFocusForDistrict("folder:invented")).toBeNull();
  });

  test("keeps insights, matrix districts, and public entities reference-clean", () => {
    const entity = readJson("entity");
    const relation = readJson("relation");
    const insight = readJson("insight");
    const entityIds = new Set(entity.entities.map((item: { id: string }) => item.id));
    const districts = new Set(relation.districtOrder);
    for (const item of insight.items) {
      expect(item.evidenceRefs.every((id: string) => entityIds.has(id))).toBe(true);
    }
    for (const cell of relation.matrix) {
      expect(districts.has(cell.source)).toBe(true);
      expect(districts.has(cell.target)).toBe(true);
      expect(cell.total).toBe(cell.wikilink);
      expect(cell.wikilink).toBe(cell.wikilinkForward + cell.wikilinkReverse);
      expect(cell.typed).toBe(0);
      expect(cell.route).toBe(0);
    }
  });

  test("renders keyboard entry and compact navigation while preserving Escape intent", () => {
    const command = renderWorkspace("#home", commandModule.CommandBar);
    expect(command).toContain('id="workspace-tab-explore"');
    expect(command.match(/class="workspace-tab(?: |")/g)).toHaveLength(5);
    expect(command).toContain('id="workspace-tab-agency"');
    expect(command).toContain("Explore");
    expect(command).toContain("Observe");
    expect(command).toContain("Flow");
    expect(command).toContain("Time");
    expect(command).toContain("Agency");

    const navigator = renderWorkspace("#home?panel=navigator", navigatorModule.NavigatorTray);
    expect(navigator).toContain('class="navigator-workspaces"');
    expect(navigator).toContain("작업 공간 바로가기");
    expect(trayModule.trayDialogKeyIntent("Escape", true, false)).toBe("close");
    expect(trayModule.trayDialogKeyIntent("Escape", false, true)).toBe("close");
    expect(trayModule.trayDialogKeyIntent("Tab", true, false)).toBe("trap-focus");
    expect(trayModule.trayDialogKeyIntent("Tab", false, false)).toBe("ignore");
  });

  test("uses canonical v7.4 scenes and every public-safe v2 district in Navigator journeys", () => {
    const environment = { reducedMotion: false, mobileSibling: false };
    const initial = stateModule.createAtlasState("#home", environment);
    const expectedHomeScenes = ["living-terrain", "knowledge-gravity", "verified-activity", "coverage-boundary"];
    expect(navigatorModule.navigatorHomeScenes().map((scene) => scene.id)).toEqual(expectedHomeScenes);
    for (const scene of navigatorModule.navigatorHomeScenes()) {
      const next = stateModule.reduceAtlasState(initial, {
        type: "journey",
        target: navigatorModule.navigatorHomeTarget(scene.id),
      });
      expect(next.workspace).toBe("home");
      expect(next.sceneId).toBe(scene.id);
    }

    const districts = navigatorModule.navigatorDistricts();
    expect(districts).toHaveLength(readJson("inventory").coverage.length);
    for (const district of districts) {
      const next = stateModule.reduceAtlasState(initial, {
        type: "journey",
        target: navigatorModule.navigatorDistrictTarget(district.id),
      });
      expect(next).toMatchObject({ workspace: "explore", sceneId: "hubs", focusId: district.id });
    }
  });

  test("canonicalizes internal scene aliases before URL and history state", () => {
    const environment = { reducedMotion: false, mobileSibling: false };
    const initial = stateModule.createAtlasState("#home", environment);
    const explore = stateModule.reduceAtlasState(initial, {
      type: "journey",
      target: { workspace: "explore", sceneId: "city-focus" },
    });
    expect(explore.sceneId).toBe("hubs");
    expect(stateModule.stateToHash(explore)).toContain("scene=hubs");

    const observe = stateModule.reduceAtlasState(explore, {
      type: "journey",
      target: { workspace: "observe", sceneId: "entity-relation" },
    });
    expect(observe.sceneId).toBe("hub-relations");
    expect(stateModule.stateToHash(observe)).toContain("scene=hub-relations");
    expect(stateModule.createAtlasState("#explore?scene=unknown", environment).fallbackReason)
      .toContain("기본 장면");
  });

  test("links every public-safe Agency knowledge district into canonical Explore journeys", () => {
    const environment = { reducedMotion: false, mobileSibling: false };
    const initial = stateModule.createAtlasState("#agency?scene=evolution", environment);
    const districts = agencyModule.agencyKnowledgeDistricts();
    expect(districts).toHaveLength(readJson("inventory").coverage.length);
    for (const district of districts) {
      const next = stateModule.reduceAtlasState(initial, {
        type: "journey",
        target: agencyModule.agencyKnowledgeTarget(district.id),
      });
      expect(next).toMatchObject({ workspace: "explore", sceneId: "hubs", focusId: district.id });
      expect(stateModule.createAtlasState(stateModule.stateToHash(next), environment))
        .toMatchObject({ workspace: "explore", sceneId: "hubs", focusId: district.id });
    }
  });

  test("assigns one shared non-neutral color role to every current district", () => {
    const districts = agencyModule.agencyKnowledgeDistricts();
    expect(districts).toHaveLength(readJson("inventory").coverage.length);
    const fills = districts.map((district) => paletteModule.colorForDistrict(district.label));
    const strokes = districts.map((district) => paletteModule.strokeColorForDistrict(district.label));
    expect(fills.every((color) => color !== "var(--district-neutral-fill)")).toBe(true);
    expect(strokes.every((color) => color !== "var(--district-neutral)")).toBe(true);
    expect(new Set(fills)).toHaveLength(districts.length);
    expect(new Set(strokes)).toHaveLength(districts.length);
  });

  test("renders reconciled coverage and Living Terrain vocabulary for public home metrics", () => {
    const markup = renderWorkspace("#home", homeModule.HomeView);
    const publication = readJson("publication");
    const inventory = readJson("inventory");
    const relation = readJson("relation");
    const entities = readJson("entity").entities;
    const strongestDistrictRelation = Math.max(...relation.matrix.map((pair: { wikilink: number }) => pair.wikilink));
    expect(markup).toContain("Human Owner");
    expect(markup).toContain("Homi Core");
    expect(markup).toContain("Independent Owners");
    expect(markup).toContain("Living Terrain");
    expect(markup).toContain("표현 범위");
    expect(markup).toContain(String(inventory.physicalMarkdownCount));
    expect(markup).toContain(String(inventory.aggregateCount));
    expect(markup).toContain(strongestDistrictRelation.toLocaleString("ko-KR"));
    expect(markup).toContain("district link occurrences");
    expect(markup).toContain("검증된 버전 스냅샷");
    expect(publication.redactionCounts.aggregatedSourceDocuments).toBeGreaterThan(entities.length);
    expect(inventory.reconciliation.pass).toBe(true);
  });

  test("binds the highlighted Home district edge to the same strongest relation readout", () => {
    const strongest = homeModule.strongestDistrictRelation();
    expect(strongest).toBeTruthy();
    const markup = renderWorkspace("#home?scene=knowledge-gravity", homeModule.HomeView);
    const dominantSource = strongest.wikilinkReverse > strongest.wikilinkForward ? strongest.target : strongest.source;
    const dominantTarget = dominantSource === strongest.source ? strongest.target : strongest.source;
    expect(markup).toContain(`data-relation-source="${dominantSource}"`);
    expect(markup).toContain(`data-relation-target="${dominantTarget}"`);
    expect(markup).toContain(`data-relation-value="${strongest.wikilink}"`);
    expect(markup).toContain(strongest.wikilink.toLocaleString("ko-KR"));
  });

  test("declares a public snapshot without claiming a private latest pulse", () => {
    const readmePath = existsSync(path.resolve("README.md"))
      ? path.resolve("README.md")
      : path.resolve("publication-template", "README.md");
    const readme = readFileSync(readmePath, "utf8");
    const publication = readJson("publication");
    expect(publication.profile).toBe("public");
    expect(publication.blockers).toEqual([]);
    expect(readme).toContain("Living Terrain");
    expect(readme).toContain("Dual-profile boundary");
    expect(readme).toContain("Agency");
    expect(readme).not.toContain("최신 지식 Pulse");
  });

  test("uses document units in public comparison", () => {
    expect(inspectorModule.comparisonEntitySize({ documentCount: 42, wordCount: 9_999 }, true))
      .toBe("42개 문서");
    expect(inspectorModule.comparisonEntitySize({ documentCount: 42, wordCount: 9_999 }, false))
      .toBe("9,999단어");
  });

  test("explains a selected fresh relation with district aggregates, not invented documents", () => {
    const relation = readJson("relation");
    const strongest = [...relation.matrix].sort((left, right) => right.wikilink - left.wikilink)[0];
    const rows = inspectorModule.pairAggregateEvidenceRows(strongest, readJson("structure").nodes);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.label)).toEqual([strongest.source, strongest.target]);
    expect(rows.every((row) => /표현 기록 · 나감 .*회 · 들어옴 .*회/.test(row.meta))).toBe(true);
    expect(rows.some((row) => /대표 문서|대표 집계/.test(row.meta))).toBe(false);
  });

  test("routes every third-level structure kind to its actual Explore hub", () => {
    const structure = readJson("structure");
    const aggregateHubs = structure.nodes.filter((node: { kind: string; documentCount: number }) =>
      node.kind === "aggregate_boundary" && node.documentCount === 0);
    expect(aggregateHubs.length).toBeGreaterThanOrEqual(3);
    for (const hub of aggregateHubs) {
      expect(searchModule.structureResultKind(hub)).toBe("hub");
      const sources = exploreModule.sourceNodesForHub(structure.nodes, hub.id);
      expect(sources.length).toBeGreaterThan(0);
      for (const source of sources) {
        expect(searchModule.structureResultKind(source)).toBe("source");
        expect(exploreModule.resolveExploreStructureFocus(structure.nodes, source.id))
          .toMatchObject({ sourceId: source.id, hubId: hub.id });
      }
    }
  });

  test("resolves a nested owner source through source-level ancestors", () => {
    const nodes = [
      { id: "district:owner:project", kind: "district", label: "Project", parentId: null, districtId: "district:owner:project", documentCount: 3, uniqueInboundDocuments: 0, inboundLinkOccurrences: 0, lastMeaningfulDate: null, nameMode: "owner_name" },
      { id: "node:owner:project", kind: "project", label: "Project Hub", parentId: "district:owner:project", districtId: "district:owner:project", documentCount: 1, uniqueInboundDocuments: 3, inboundLinkOccurrences: 4, lastMeaningfulDate: null, nameMode: "owner_name" },
      { id: "node:owner:stage", kind: "project_stage", label: "Stage", parentId: "node:owner:project", districtId: "district:owner:project", documentCount: 1, uniqueInboundDocuments: 1, inboundLinkOccurrences: 2, lastMeaningfulDate: null, nameMode: "owner_name" },
      { id: "node:owner:source", kind: "source_document", label: "Source", parentId: "node:owner:stage", districtId: "district:owner:project", documentCount: 1, uniqueInboundDocuments: 0, inboundLinkOccurrences: 0, lastMeaningfulDate: null, nameMode: "owner_name" },
    ] as const;
    const resolved = exploreModule.resolveExploreStructureFocus(nodes, "node:owner:source");
    expect(resolved).toEqual({
      districtId: "district:owner:project",
      hubId: "node:owner:project",
      sourceId: "node:owner:source",
    });
    expect(exploreModule.sourceNodesForHub(nodes, "node:owner:project").map((node) => node.id))
      .toEqual(["node:owner:stage", "node:owner:source"]);
    expect(exploreModule.sourceTreeRowsForHub(nodes, "node:owner:project").map((row) => ({
      id: row.node.id,
      depth: row.depth,
    }))).toEqual([
      { id: "node:owner:stage", depth: 0 },
      { id: "node:owner:source", depth: 1 },
    ]);
  });

  test("treats a zero-count owner aggregate boundary as a structural hub", () => {
    const nodes = [
      { id: "district:owner:research", kind: "district", label: "Research", parentId: null, districtId: "district:owner:research", documentCount: 1, uniqueInboundDocuments: 0, inboundLinkOccurrences: 0, lastMeaningfulDate: null, nameMode: "owner_name" },
      { id: "node:owner:safe-hub", kind: "aggregate_boundary", label: "Safe hub", parentId: "district:owner:research", districtId: "district:owner:research", documentCount: 0, uniqueInboundDocuments: 0, inboundLinkOccurrences: 0, lastMeaningfulDate: null, nameMode: "aggregate" },
      { id: "node:owner:source", kind: "source_document", label: "Source", parentId: "node:owner:safe-hub", districtId: "district:owner:research", documentCount: 1, uniqueInboundDocuments: 0, inboundLinkOccurrences: 0, lastMeaningfulDate: null, nameMode: "owner_name" },
    ] as const;
    expect(searchModule.structureResultKind(nodes[1])).toBe("hub");
    expect(exploreModule.resolveExploreStructureFocus(nodes, nodes[2].id))
      .toEqual({ districtId: nodes[0].id, hubId: nodes[1].id, sourceId: nodes[2].id });
    expect(exploreModule.sourceNodesForHub(nodes, nodes[1].id).map((node) => node.id))
      .toEqual([nodes[2].id]);
  });
});
