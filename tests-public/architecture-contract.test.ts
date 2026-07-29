import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const root = path.resolve(".");
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

describe("v7.9 architecture ownership", () => {
  test("keeps Home as a small composition boundary", () => {
    const source = read("src/app/Home.tsx");
    expect(source.split(/\r?\n/).length).toBeLessThanOrEqual(120);
    expect(source).toContain('from "./home/HomeRail"');
    expect(source).toContain('from "./home/useResizableRail"');
  });

  test("keeps Observe outside the miscellaneous analysis module", () => {
    const analysisViews = read("src/app/AnalysisViews.tsx");
    const observe = read("src/app/observe/Observe.tsx");
    expect(analysisViews).not.toMatch(/\bObserve\b/);
    expect(observe).toContain("GlobalRelations");
    expect(observe).toContain("NodeWorkbench");
    expect(observe).toContain("RelationWorkbench");
    expect(observe).toContain("EvidenceWorkbench");
  });

  test("keeps Home and Observe selectors in their owned stylesheets", () => {
    const index = read("src/styles/index.css");
    const home = read("src/styles/home.css");
    const observe = read("src/styles/observe.css");
    expect(index).toContain('@import "./home.css" layer(workspace)');
    expect(index).toContain('@import "./observe.css" layer(workspace)');
    expect(home).toMatch(/\.home-layout\b/);
    expect(home).toMatch(/\.home-rail-resizer\b/);
    expect(observe).toMatch(/\.observe-mode-deck\b/);
    expect(observe).toMatch(/\.relation-workbench\b/);
  });

  test("records completed replacement and narrowly ratchets inherited debt", () => {
    const ledger = JSON.parse(read("docs/replacement-ledger.json"));
    const completed = ledger.entries.filter(
      (entry: { removalEvidence?: { status?: string } }) =>
        entry.removalEvidence?.status === "completed",
    );
    expect(completed.some(
      (entry: { newResponsibility?: string }) =>
        entry.newResponsibility === "Observe Insight Workbench",
    )).toBe(true);
    expect(completed.some(
      (entry: { newResponsibility?: string }) =>
        entry.newResponsibility === "executable architecture erosion contract",
    )).toBe(true);

    const ratchet = JSON.parse(read("docs/architecture-debt-ratchet.json"));
    expect(Object.keys(ratchet.ceilings)).toEqual(["src/app/MobileGraphCanvas.tsx"]);
  });
});
