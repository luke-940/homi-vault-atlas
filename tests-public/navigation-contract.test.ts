import { describe, expect, test } from "vitest";
import { DEFAULT_ROUTE, readRoute, routeHash } from "../src/app/url";

describe("semantic navigation codec", () => {
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
});
