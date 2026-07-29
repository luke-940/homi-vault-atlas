import { describe, expect, test } from "vitest";
import { DEFAULT_ROUTE, readRoute, routeHash } from "../src/app/url";

describe("semantic navigation codec", () => {
  test("opens Home with no committed selection", () => {
    const route = readRoute("#home");
    expect(route.focusId).toBeNull();
    expect(route.panel).toBe("none");
    expect(routeHash(route)).toBe("#home");
  });

  test("round-trips committed focus and path state", () => {
    const route = {
      ...DEFAULT_ROUTE,
      workspace: "explore" as const,
      lens: "project-frontiers" as const,
      focusId: "n:focus",
      fromId: "n:source",
      toId: "n:target",
      exploreMode: "list" as const,
    };
    expect(readRoute(routeHash(route))).toEqual(route);
  });

  test("recovers legacy scenes and malformed workspaces safely", () => {
    expect(readRoute("#home?scene=domain-backbone").lens).toBe("whole-vault");
    expect(readRoute("#home?scene=operational-compass").lens).toBe("agent-stewardship");
    expect(readRoute("#unknown?scene=bad")).toEqual(DEFAULT_ROUTE);
  });

  test("keeps the curated directory as a shareable Explore view", () => {
    const route = readRoute("#explore?view=structure&focus=n%3Asafe");
    expect(route.exploreMode).toBe("structure");
    expect(routeHash(route)).toBe("#explore?focus=n%3Asafe&view=structure");
  });

  test("round-trips dossier tabs without persisting transient preview", () => {
    const route = readRoute("#home?focus=n%3Asafe&panel=dossier&tab=relations");
    expect(route.panel).toBe("dossier");
    expect(route.dossierTab).toBe("relations");
    expect(routeHash(route)).toBe("#home?focus=n%3Asafe&panel=dossier&tab=relations");
  });

  test("round-trips nested Reader node and exact section", () => {
    const route = readRoute("#read?node=n%3Asafe&section=section%3Aevidence");
    expect(route.workspace).toBe("read");
    expect(route.readerNodeId).toBe("n:safe");
    expect(route.readerSectionId).toBe("section:evidence");
    expect(routeHash(route)).toBe("#read?node=n%3Asafe&section=section%3Aevidence");
  });

  test("keeps direct relation and evidence workbench state distinct", () => {
    const node = readRoute("#observe?focus=n%3Asafe&mode=node&tab=relations");
    expect(node.observeMode).toBe("node");
    expect(node.dossierTab).toBe("relations");
    expect(routeHash(node)).toBe("#observe?focus=n%3Asafe&mode=node&tab=relations");

    const relation = readRoute("#observe?mode=relation&from=n%3Afrom&to=n%3Ato");
    expect(relation.observeMode).toBe("relation");
    expect(routeHash(relation)).toBe("#observe?from=n%3Afrom&to=n%3Ato&mode=relation");

    const evidence = readRoute("#observe?focus=n%3Asafe&mode=evidence&claim=claim%3A1");
    expect(evidence.observeMode).toBe("evidence");
    expect(evidence.claimId).toBe("claim:1");
    expect(routeHash(evidence)).toBe("#observe?focus=n%3Asafe&mode=evidence&claim=claim%3A1");
  });

  test("preserves each Observe mode before a workbench selection exists", () => {
    const node = readRoute("#observe?mode=node");
    expect(node.observeMode).toBe("node");
    expect(node.focusId).toBeNull();
    expect(routeHash(node)).toBe("#observe?mode=node");

    const relation = readRoute("#observe?mode=relation");
    expect(relation.observeMode).toBe("relation");
    expect(relation.fromId).toBeNull();
    expect(relation.toId).toBeNull();
    expect(routeHash(relation)).toBe("#observe?mode=relation");

    const evidence = readRoute("#observe?mode=evidence");
    expect(evidence.observeMode).toBe("evidence");
    expect(evidence.claimId).toBeNull();
    expect(routeHash(evidence)).toBe("#observe?mode=evidence");
  });
});
