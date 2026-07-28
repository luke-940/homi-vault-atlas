import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { decodeGraph } from "../src/app/data";
import { buildSemanticScene } from "../src/app/scene";

const rawGraph = JSON.parse(
  readFileSync(path.resolve("public-safe", "data", "graph.json"), "utf8"),
);
const graph = decodeGraph(rawGraph);

function scene(lens: "whole-vault" | "knowledge-core" | "project-frontiers" | "agent-stewardship") {
  return buildSemanticScene({
    graph,
    lens,
    focusId: null,
    previewId: null,
    compact: false,
    mode: "home",
    reducedMotion: false,
  });
}

describe("semantic space renderer contract", () => {
  test("builds deterministic fixed-coordinate scenes without runtime layout", () => {
    const first = scene("whole-vault");
    const second = scene("whole-vault");
    expect(first).toEqual(second);
    expect(first.nodes).toHaveLength(graph.nodes.length);
    expect(first.nodes.every((node) => (
      node.position.every(Number.isFinite)
      && Number.isFinite(node.radius)
      && node.radius > 0
    ))).toBe(true);
    expect(first.camera.minDistance).toBeLessThan(first.camera.maxDistance);
  });

  test("binds every rendered line to an actual graph v2 edge", () => {
    const actualIds = new Set(graph.edges.map((edge) => edge.id));
    for (const candidate of [
      scene("whole-vault"),
      scene("knowledge-core"),
      scene("project-frontiers"),
    ]) {
      expect(candidate.edges).toHaveLength(graph.edges.length);
      for (const edge of candidate.edges) {
        expect(edge.provenance).toBe("atlas.graph.v2");
        expect(edge.constituentEdgeIds).toEqual([edge.id]);
        expect(actualIds.has(edge.id)).toBe(true);
      }
    }
  });

  test("keeps the six core domains visible while Homi remains provenance only", () => {
    const wholeVault = scene("whole-vault");
    const required = ["MOC", "Papers", "Signals", "Rocket", "Groot", "Intelligence Layer"];
    const labeledDomains = new Set(wholeVault.labelIds
      .map((id) => graph.nodeById.get(id)?.domain)
      .filter(Boolean));
    expect(required.every((domain) => labeledDomains.has(domain))).toBe(true);
    expect(wholeVault.labelIds.length).toBeLessThanOrEqual(20);
    expect(wholeVault.nodes.some((node) => node.label === "Homi")).toBe(false);
    expect(wholeVault.edges.some((edge) => (
      edge.sourceId.toLowerCase().includes("homi")
      || edge.targetId.toLowerCase().includes("homi")
    ))).toBe(false);
  });
});
