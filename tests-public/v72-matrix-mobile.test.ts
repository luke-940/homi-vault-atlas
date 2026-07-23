import { readFileSync } from "node:fs";
import path from "node:path";
import { scaleBand } from "d3-scale";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, test, vi } from "vitest";

const packNames = [
  "agency",
  "meaning",
  "bootstrap",
  "inventory",
  "graph",
  "relation",
  "flow",
  "temporal",
  "entity",
  "health",
  "insight",
  "publication",
] as const;

let observeModule: typeof import("../src/views/ObserveView");

beforeAll(async () => {
  const packs = Object.fromEntries(packNames.map((name) => [
    name,
    JSON.parse(readFileSync(path.resolve("public-safe", "data", `${name}.json`), "utf8")),
  ]));
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      __HOMI_ATLAS_V7_PACKS__: packs,
      location: { hash: "#observe?layer=wikilink" },
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
    },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { getElementById: () => null },
  });
  observeModule = await import("../src/views/ObserveView");
});

describe("v7.2 matrix reading and mobile theatre contract", () => {
  test("states directed axes and exposes an undirected comparison key", () => {
    const districts = ["Research", "Projects", "Operations"];
    expect(observeModule.matrixReadingContract("wikilink", districts)).toMatchObject({
      mode: "directed",
      label: "행 = 출발 구역 · 열 = 도착 구역",
      districts: [],
    });
    expect(observeModule.matrixReadingContract("route", districts)).toMatchObject({
      mode: "comparison",
      label: "비교 구역 key",
      districts,
    });
  });

  test("renders direct reading guidance for both relation modes", () => {
    const directedMarkup = renderToStaticMarkup(React.createElement(
      observeModule.MatrixReadingGuide,
      { layer: "typed", districts: ["Research", "Projects"], theatre: true },
    ));
    expect(directedMarkup).toContain('role="note"');
    expect(directedMarkup).toContain('data-reading-mode="directed"');
    expect(directedMarkup).toContain("행 = 출발 구역 · 열 = 도착 구역");
    expect(directedMarkup).toContain("가로·세로로 스크롤");

    const comparisonMarkup = renderToStaticMarkup(React.createElement(
      observeModule.MatrixReadingGuide,
      { layer: "route", districts: ["Research", "Projects"], theatre: false },
    ));
    expect(comparisonMarkup).toContain('data-reading-mode="comparison"');
    expect(comparisonMarkup).toContain("비교 구역 key");
    expect(comparisonMarkup).toContain("Research");
    expect(comparisonMarkup).toContain("Projects");
  });

  test("keeps matrix cells at 32px on 390px and 24px on 320px theatres", () => {
    for (const [viewportWidth, minimum] of [[390, 32], [320, 24]] as const) {
      const target = observeModule.matrixTheatreMinimumCellSize(viewportWidth, true);
      expect(target).toBe(minimum);
      const extent = observeModule.minimumMatrixPlotExtent(5, target, 0.08);
      const band = scaleBand<string>()
        .domain(["A", "B", "C", "D", "E"])
        .range([0, extent])
        .padding(0.08);
      expect(band.bandwidth()).toBeGreaterThanOrEqual(minimum);
    }
    expect(observeModule.matrixTheatreMinimumCellSize(390, false)).toBe(0);
    expect(observeModule.matrixTheatreMinimumCellSize(600, true)).toBe(0);
  });

  test("focuses and scrolls the arrow-key destination into the nearest viewport", () => {
    const target = {
      focus: vi.fn(),
      scrollIntoView: vi.fn(),
    };
    expect(observeModule.focusAndRevealMatrixEntry(target)).toBe(true);
    expect(target.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(target.scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      inline: "nearest",
    });
    expect(observeModule.focusAndRevealMatrixEntry(null)).toBe(false);
  });
});
