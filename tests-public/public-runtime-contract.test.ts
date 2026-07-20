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

  test("renders aggregate vocabulary for public home metrics", () => {
    const markup = renderWorkspace("#home", homeModule.HomeView);
    const publication = readJson("publication");
    const entities = readJson("entity").entities;
    expect(markup).toContain("Human Owner");
    expect(markup).toContain("에이전트 역할 · 핵심 3 · 독립 3");
    expect(markup).toContain("Public Records");
    expect(markup).toContain("Strongest Relation");
    expect(markup).toContain("검증된 버전 스냅샷");
    expect(publication.redactionCounts.aggregatedSourceDocuments).toBeGreaterThan(entities.length);
  });

  test("declares a public snapshot without claiming a private latest pulse", () => {
    const readmePath = existsSync(path.resolve("README.md"))
      ? path.resolve("README.md")
      : path.resolve("publication-template", "README.md");
    const readme = readFileSync(readmePath, "utf8");
    const publication = readJson("publication");
    expect(publication.profile).toBe("public");
    expect(publication.blockers).toEqual([]);
    expect(readme).toContain("Human–Agent");
    expect(readme).toContain("Agency");
    expect(readme).not.toContain("최신 지식 Pulse");
  });

  test("uses document units in public comparison", () => {
    expect(inspectorModule.comparisonEntitySize({ documentCount: 42, wordCount: 9_999 }, true))
      .toBe("42개 문서");
    expect(inspectorModule.comparisonEntitySize({ documentCount: 42, wordCount: 9_999 }, false))
      .toBe("9,999단어");
  });
});
