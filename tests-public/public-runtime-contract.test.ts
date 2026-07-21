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
let agencyModule: typeof import("../src/views/AgencyView");
let paletteModule: typeof import("../src/viz/palette");
let graphModel: typeof import("../src/graph/model");

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
    sessionStorage: { getItem: () => "1", setItem() {} },
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
  agencyModule = await import("../src/views/AgencyView");
  paletteModule = await import("../src/viz/palette");
  graphModel = await import("../src/graph/model");
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

describe("public Atlas v7.5 runtime contracts", () => {
  test("resolves every public district into the Living Graph", () => {
    const graph = readJson("graph");
    for (const cluster of graph.clusters) {
      const district = graph.nodes.filter(
        (node: { id: string; kind: string }) => node.id === cluster.id && node.kind === "district",
      );
      expect(district).toHaveLength(1);
      expect(dataModule.hierarchyFocusForDistrict(cluster.label)).toBe(cluster.id);
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

  test("hides Time when chronology is empty and keeps keyboard tray intent", () => {
    const command = renderWorkspace("#home", commandModule.CommandBar);
    expect(command).toContain('id="workspace-tab-home"');
    expect(command).toContain('id="workspace-tab-explore"');
    expect(command).toContain('id="workspace-tab-agency"');
    expect(command).not.toContain('id="workspace-tab-time"');
    expect(command.match(/class="workspace-tab(?: |")/g)).toHaveLength(4);
    expect(command).toContain("Explore");
    expect(command).toContain("Observe");
    expect(command).toContain("Flow");
    expect(command).toContain("Agency");
    expect(trayModule.trayDialogKeyIntent("Escape", true, false)).toBe("close");
    expect(trayModule.trayDialogKeyIntent("Tab", true, false)).toBe("trap-focus");
  });

  test("uses four canonical v7.5 Home scenes and graph district journeys", () => {
    const environment = { reducedMotion: false, mobileSibling: false };
    const initial = stateModule.createAtlasState("#home", environment);
    const expected = ["knowledge-field", "knowledge-gravity", "freshness-field", "link-trace"];
    expect(navigatorModule.navigatorHomeScenes().map((scene) => scene.id)).toEqual(expected);
    for (const scene of expected) {
      const next = stateModule.reduceAtlasState(initial, {
        type: "journey",
        target: navigatorModule.navigatorHomeTarget(scene),
      });
      expect(next).toMatchObject({ workspace: "home", sceneId: scene });
    }
    for (const district of navigatorModule.navigatorDistricts()) {
      const next = stateModule.reduceAtlasState(initial, {
        type: "journey",
        target: navigatorModule.navigatorDistrictTarget(district.id),
      });
      expect(next).toMatchObject({
        workspace: "explore",
        sceneId: "graph",
        focusId: district.id,
        districtId: district.id,
      });
    }
  });

  test("canonicalizes v7.3 and v7.4 aliases without ghost scenes", () => {
    const environment = { reducedMotion: false, mobileSibling: false };
    expect(stateModule.createAtlasState("#home?scene=living-terrain", environment).sceneId)
      .toBe("knowledge-field");
    expect(stateModule.createAtlasState("#home?scene=coverage-boundary", environment).sceneId)
      .toBe("link-trace");
    expect(stateModule.createAtlasState("#explore?scene=city-focus", environment).sceneId)
      .toBe("clusters");
    expect(stateModule.createAtlasState("#observe?scene=entity-relation", environment).sceneId)
      .toBe("hub-relations");
    expect(stateModule.createAtlasState("#explore?scene=unknown", environment).fallbackReason)
      .toContain("기본 장면");
  });

  test("recovers old Time URLs into honest Explore freshness context", () => {
    const environment = { reducedMotion: false, mobileSibling: false };
    const state = stateModule.createAtlasState("#time?scene=chronology", environment);
    expect(state).toMatchObject({ workspace: "explore", sceneId: "graph" });
    expect(state.fallbackReason).toContain("chronology");
  });

  test("round-trips graph district, freshness, focus, and directed path URL state", () => {
    const environment = { reducedMotion: false, mobileSibling: false };
    const graph = readJson("graph");
    const district = graph.clusters[0].id;
    const [from, to] = graph.edges.length
      ? [graph.edges[0].source, graph.edges[0].target]
      : [graph.nodes[0].id, graph.nodes[1].id];
    const state = stateModule.createAtlasState(
      `#explore?scene=graph&focus=${encodeURIComponent(from)}&district=${encodeURIComponent(district)}&freshness=1y&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      environment,
    );
    expect(state).toMatchObject({ workspace: "explore", sceneId: "graph", focusId: from, districtId: district, freshness: "1y", pathFrom: from, pathTo: to });
    expect(stateModule.createAtlasState(stateModule.stateToHash(state), environment))
      .toMatchObject({ workspace: "explore", sceneId: "graph", focusId: from, districtId: district, freshness: "1y", pathFrom: from, pathTo: to });
  });

  test("links every Agency knowledge district into Explore Graph", () => {
    const environment = { reducedMotion: false, mobileSibling: false };
    const initial = stateModule.createAtlasState("#agency?scene=evolution", environment);
    const districts = agencyModule.agencyKnowledgeDistricts();
    expect(districts).toHaveLength(readJson("graph").clusters.length);
    for (const district of districts) {
      const next = stateModule.reduceAtlasState(initial, {
        type: "journey",
        target: agencyModule.agencyKnowledgeTarget(district.id),
      });
      expect(next).toMatchObject({ workspace: "explore", sceneId: "graph", focusId: district.id });
    }
  });

  test("assigns one non-neutral district color role to each current cluster", () => {
    const districts = agencyModule.agencyKnowledgeDistricts();
    const fills = districts.map((district) => paletteModule.colorForDistrict(district.label));
    const strokes = districts.map((district) => paletteModule.strokeColorForDistrict(district.label));
    expect(fills.every((color) => color !== "var(--district-neutral-fill)")).toBe(true);
    expect(strokes.every((color) => color !== "var(--district-neutral)")).toBe(true);
    expect(new Set(fills)).toHaveLength(districts.length);
    expect(new Set(strokes)).toHaveLength(districts.length);
  });

  test("renders actual Living Graph semantics and reconciled coverage on Home", () => {
    const markup = renderWorkspace("#home?scene=knowledge-field", homeModule.HomeView);
    const inventory = readJson("inventory");
    const graph = readJson("graph");
    expect(markup).toContain("MEANINGFUL SPACE · LIVING GRAPH");
    expect(markup).toContain("지식이 어디에 있고,");
    expect(markup).toContain("표현 기록");
    expect(markup).toContain("방향 관계");
    expect(markup).toContain(inventory.physicalMarkdownCount.toLocaleString("ko-KR"));
    expect(markup).toContain(graph.manifest.edgeCount.toLocaleString("ko-KR"));
    expect(markup).toContain("날짜 미기록");
    expect(markup).toContain("검증된 버전 스냅샷");
    expect(inventory.reconciliation.pass).toBe(true);
  });

  test("routes graph search results to their exact graph focus", () => {
    const graph = readJson("graph");
    const node = graph.nodes.find((candidate: { kind: string }) => candidate.kind !== "district") ?? graph.nodes[0];
    const result = {
      id: node.id,
      label: node.label,
      meta: "graph",
      kind: searchModule.graphResultKind(node),
      section: "knowledge" as const,
    };
    expect(searchModule.destinationFor(result, "observe", "wikilink")).toMatchObject({
      workspace: "explore",
      sceneId: "graph",
    });
    expect(searchModule.createSearchSelectionPlan(result, "observe", "wikilink").actions[0])
      .toMatchObject({ type: "journey", target: { workspace: "explore", sceneId: "graph", focusId: node.id } });
  });

  test("explains matrix pairs with graph district aggregates, never invented documents", () => {
    const relation = readJson("relation");
    const strongest = [...relation.matrix].sort((left, right) => right.wikilink - left.wikilink)[0];
    const rows = inspectorModule.pairAggregateEvidenceRows(strongest, readJson("graph").nodes);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.label)).toEqual([strongest.source, strongest.target]);
    expect(rows.every((row) => /표현 기록 · 나감 .*회 · 들어옴 .*회/.test(row.meta))).toBe(true);
    expect(rows.some((row) => /대표 문서|대표 집계/.test(row.meta))).toBe(false);
  });

  test("uses deterministic directed path tie-breaking and bounded disclosure", () => {
    const graph = readJson("graph");
    const synthetic = {
      ...graph,
      nodes: ["a", "b", "c", "d"].map((id) => ({ ...graph.nodes[0], id, parentId: null, districtId: "a", clusterId: "a", label: id })),
      edges: [
        { id: "a-b", source: "a", target: "b", kind: "references", direction: "forward", occurrenceCount: 2, defaultVisible: true },
        { id: "b-d", source: "b", target: "d", kind: "references", direction: "forward", occurrenceCount: 2, defaultVisible: true },
        { id: "a-c", source: "a", target: "c", kind: "references", direction: "forward", occurrenceCount: 5, defaultVisible: true },
        { id: "c-d", source: "c", target: "d", kind: "references", direction: "forward", occurrenceCount: 5, defaultVisible: true },
      ],
    };
    expect(graphModel.shortestDirectedPath(synthetic, "a", "d")).toEqual(["a", "c", "d"]);
    expect(graphModel.shortestDirectedPath(synthetic, "d", "a")).toEqual([]);

    const selection = graphModel.visibleGraphSelection(graph, {
      districtId: null,
      freshness: "all",
      focusId: null,
      mobile: true,
      from: null,
      to: null,
    });
    expect(selection.nodes.length).toBeLessThanOrEqual(20);
    expect(selection.edges.every((edge) => edge.direction === "forward")).toBe(true);
  });

  test("declares a public Living Graph snapshot without private live claims", () => {
    const readmePath = existsSync(path.resolve("README.md"))
      ? path.resolve("README.md")
      : path.resolve("publication-template", "README.md");
    const readme = readFileSync(readmePath, "utf8");
    const publication = readJson("publication");
    expect(publication.profile).toBe("public");
    expect(publication.blockers).toEqual([]);
    expect(readme).toContain("Living Terrain");
    expect(readme).toContain("Dual-profile boundary");
    expect(readme).not.toContain("최신 지식 Pulse");
  });
});
