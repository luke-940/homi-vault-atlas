import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const readJson = (name: string) => JSON.parse(
  readFileSync(path.resolve("public-safe", "data", `${name}.json`), "utf8"),
);
const readSource = (name: string) => readFileSync(path.resolve("src", name), "utf8");

describe("public Atlas runtime contracts", () => {
  test("every public district resolves to exactly one hierarchy district", () => {
    const structure = readJson("structure");
    for (const district of structure.districts) {
      const matches = structure.hierarchyNodes.filter(
        (node: { kind: string; label: string }) => node.kind === "district" && node.label === district.name,
      );
      expect(matches).toHaveLength(1);
      expect(matches[0].id).toMatch(/^tax:pub:district:/);
    }
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
      expect(cell.typed).toBe(0);
      expect(cell.route).toBe(0);
    }
  });

  test("uses data-backed district focus instead of internal folder id templates", () => {
    const navigator = readSource("components/NavigatorTray.tsx");
    const explore = readSource("views/ExploreView.tsx");
    expect(navigator).toContain("hierarchyFocusForDistrict");
    expect(explore).toContain("hierarchyFocusForDistrict");
    expect(navigator).not.toContain("`folder:${district.name}`");
    expect(explore).not.toContain("`folder:${item.name}`");
  });

  test("preserves keyboard entry and compact mobile workspace navigation", () => {
    const command = readSource("components/CommandBar.tsx");
    const inspector = readSource("components/InspectorTray.tsx");
    const navigator = readSource("components/NavigatorTray.tsx");
    const css = readSource("styles/app.css");
    expect(command).toContain('state.workspace === "home" && index === 0');
    expect(inspector).toMatch(/const handleDialogKey[\s\S]*event\.key === "Escape"[\s\S]*if \(!isMobile\) return/);
    expect(navigator).toContain('className="navigator-workspaces"');
    expect(css).toContain("@media (max-width: 360px)");
    expect(css).toContain(".workspace-tabs { display: none; }");
  });

  test("uses aggregate vocabulary for public home metrics", () => {
    const home = readSource("views/HomeView.tsx");
    const publication = readJson("publication");
    const entities = readJson("entity").entities;
    expect(home).toContain('publicProfile ? "집계 문서" : "활성 문서"');
    expect(home).toContain('publicProfile ? "연결군" : "명시 관계"');
    expect(publication.redactionCounts.aggregatedSourceDocuments).toBeGreaterThan(entities.length);
  });

  test("uses document units in public comparison and a complete paginated genealogy reader", () => {
    const inspector = readSource("components/InspectorTray.tsx");
    const explore = readSource("views/ExploreView.tsx");
    expect(inspector).toContain('isPublicProfile ? "개 문서" : "단어"');
    expect(explore).toContain('className="branch-reader-more"');
    expect(explore).toContain("filteredBranchDocuments.length");
    expect(explore).not.toContain("전체 목록은 오른쪽 reader");
  });
});
