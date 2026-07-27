import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { buildSemanticSpaceScene } from "../src/graph/semantic-space-adapter";
import type { AtlasGraphV1 } from "../src/types";

const graph = JSON.parse(
  readFileSync(path.resolve("public-safe", "data", "graph.json"), "utf8"),
) as AtlasGraphV1;

function homeScene() {
  return buildSemanticSpaceScene({
    graph,
    kind: "field",
    presentation: "home",
    focusId: null,
    previewId: null,
    reducedMotion: false,
  });
}

function exploreScene() {
  return buildSemanticSpaceScene({
    graph,
    kind: "field",
    presentation: "workspace",
    focusId: null,
    previewId: null,
    reducedMotion: false,
  });
}

describe("Atlas v7.7 true semantic space contract", () => {
  test("builds deterministic authored 3D scenes from graph coordinates", () => {
    const first = homeScene();
    const second = homeScene();

    expect(first).toEqual(second);
    expect(first.nodes.length).toBeLessThanOrEqual(60);
    expect(first.nodes.every((node) =>
      node.position.every(Number.isFinite) && Number.isFinite(node.radius))).toBe(true);
    expect(first.camera.distance).toBeGreaterThan(first.camera.minDistance);
    expect(first.camera.distance).toBeLessThan(first.camera.maxDistance);
  });

  test("keeps every rendered relation traceable to atlas.graph.v1", () => {
    const graphEdgeIds = new Set(graph.edges.map((edge) => edge.id));
    for (const scene of [homeScene(), exploreScene()]) {
      const defaultEdges = scene.edges.filter((edge) => edge.defaultVisible);
      expect(defaultEdges.length).toBeGreaterThan(0);
      for (const edge of defaultEdges) {
        expect(edge.provenance).toBe("atlas.graph.v1");
        expect(edge.constituentEdgeIds.length).toBeGreaterThan(0);
        expect(edge.constituentEdgeIds.every((id) => graphEdgeIds.has(id))).toBe(true);
        if (edge.semanticKind === "exact_reference") expect(graphEdgeIds.has(edge.id)).toBe(true);
      }
    }
  });

  test("applies the Home and Explore density budgets without inventing Homi edges", () => {
    const home = homeScene();
    const explore = exploreScene();
    const homeDefaultEdges = home.edges.filter((edge) => edge.defaultVisible);
    const exploreDefaultEdges = explore.edges.filter((edge) => edge.defaultVisible);

    expect(homeDefaultEdges.length).toBeLessThanOrEqual(16);
    expect(exploreDefaultEdges.length).toBeGreaterThanOrEqual(18);
    expect(exploreDefaultEdges.length).toBeLessThanOrEqual(24);
    expect(home.nodes.some((node) => node.label === "Homi")).toBe(false);
    expect(home.edges.some((edge) =>
      edge.sourceId.toLowerCase().includes("homi")
      || edge.targetId.toLowerCase().includes("homi"))).toBe(false);
  });

  test("keeps MOC, Papers, and Signals legible in the semantic label layer", () => {
    const scene = homeScene();
    const labels = scene.nodes
      .filter((node) => scene.labelIds.includes(node.id))
      .map((node) => node.label);

    expect(labels.some((label) => label.startsWith("MOC ·"))).toBe(true);
    expect(labels.some((label) => label.startsWith("Papers ·"))).toBe(true);
    expect(labels.some((label) => label.startsWith("Signals ·"))).toBe(true);
    expect(scene.labelIds.length).toBeLessThanOrEqual(18);
  });

  test("keeps public concepts above outside-company labels in the default Home hierarchy", () => {
    const scene = homeScene();
    const labels = scene.nodes
      .filter((node) => scene.labelIds.includes(node.id))
      .map((node) => node.label);

    expect(labels).toContain("이미지생성");
    expect(labels).toContain("에이전트");
    expect(labels).toContain("노동·조직");
    expect(labels).not.toContain("OpenAI");
    expect(labels).not.toContain("Google");
    expect(labels).not.toContain("Anthropic");
  });

  test("renders each reconciled public record once as static evidence, not decorative particles", () => {
    const scene = homeScene();
    const aggregateClusters = new Set(graph.nodes
      .filter((node) => node.kind === "aggregate_boundary" && node.representedDocuments > 0)
      .map((node) => node.clusterId));
    const representedDocuments = graph.nodes
      .filter((node) =>
        node.kind === "aggregate_boundary"
        || (node.kind === "district" && !aggregateClusters.has(node.clusterId)))
      .reduce((sum, node) => sum + node.representedDocuments, 0);

    expect(scene.evidenceMarks).toHaveLength(representedDocuments);
    expect(new Set(scene.evidenceMarks.map((mark) => mark.id)).size).toBe(scene.evidenceMarks.length);
    expect(scene.evidenceMarks.every((mark) => mark.representedDocuments === 1)).toBe(true);
  });
});
