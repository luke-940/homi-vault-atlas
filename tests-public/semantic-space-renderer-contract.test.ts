import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { decodeGraph } from "../src/app/data";
import { buildSemanticScene, interactionLabelIds } from "../src/app/scene";
import {
  selectionLightTone,
  selectionLightWeights,
} from "../src/graph/semantic-space-selection-light";

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

  test("applies Home index facets as appearance state without changing spatial geometry", () => {
    const baseline = scene("whole-vault");
    const filtered = buildSemanticScene({
      graph,
      lens: "whole-vault",
      focusId: null,
      previewId: null,
      activeDomainsOverride: ["Signals"],
      activeKindsOverride: ["signal_domain"],
      compact: false,
      mode: "home",
      reducedMotion: false,
    });
    expect(filtered.activeDomains).toEqual(["Signals"]);
    expect(filtered.activeKinds).toEqual(["signal_domain"]);
    expect(filtered.graphVersion).toBe(baseline.graphVersion);
    expect(filtered.camera).toEqual(baseline.camera);
    expect(filtered.nodes.map(({ id, position, radius }) => ({ id, position, radius })))
      .toEqual(baseline.nodes.map(({ id, position, radius }) => ({ id, position, radius })));
    expect(filtered.edges).toEqual(baseline.edges);
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
    expect(wholeVault.labelIds).toHaveLength(graph.manifest.domainCount);
    expect(wholeVault.nodes.some((node) => node.label === "Homi")).toBe(false);
    expect(wholeVault.edges.some((edge) => (
      edge.sourceId.toLowerCase().includes("homi")
      || edge.targetId.toLowerCase().includes("homi")
    ))).toBe(false);
  });

  test("adds the strongest actual incoming and outgoing endpoints to a focused label set", () => {
    const focus = graph.nodes.find((node) => node.incoming.length && node.outgoing.length);
    expect(focus).toBeTruthy();
    const focused = buildSemanticScene({
      graph,
      lens: "whole-vault",
      focusId: focus!.id,
      previewId: null,
      compact: false,
      mode: "home",
      reducedMotion: false,
    });
    const expected = [
      ...focus!.incoming.slice(0, 6).map((index) => graph.nodes[graph.edges[index].source].id),
      ...focus!.outgoing.slice(0, 6).map((index) => graph.nodes[graph.edges[index].target].id),
    ];
    expect(expected.every((id) => focused.labelIds.includes(id))).toBe(true);
    expect(focused.labelIds.length).toBeLessThanOrEqual(20);
  });

  test("reveals the hovered node and its actual directed neighbors without rebuilding the scene", () => {
    const baseline = scene("whole-vault");
    const preview = graph.nodes.find((node) => node.incoming.length && node.outgoing.length);
    expect(preview).toBeTruthy();
    const labels = interactionLabelIds(graph, baseline.labelIds, preview!.id, 20);
    const expected = [
      preview!.id,
      ...preview!.incoming.slice(0, 6).map((index) => graph.nodes[graph.edges[index].source].id),
      ...preview!.outgoing.slice(0, 6).map((index) => graph.nodes[graph.edges[index].target].id),
    ];
    expect(expected.every((id) => labels.includes(id))).toBe(true);
    expect(labels.length).toBeLessThanOrEqual(20);
    expect(buildSemanticScene({
      graph,
      lens: "whole-vault",
      focusId: null,
      previewId: null,
      compact: false,
      mode: "home",
      reducedMotion: false,
    })).toEqual(baseline);
  });

  test("keeps node geometry while lighting only committed focus and actual major neighbors", () => {
    const candidate = graph.nodes.find((node) => node.incoming.length && node.outgoing.length);
    expect(candidate).toBeTruthy();
    const focused = buildSemanticScene({
      graph,
      lens: "whole-vault",
      focusId: candidate!.id,
      previewId: null,
      compact: false,
      mode: "home",
      reducedMotion: false,
    });
    const edgeIndexById = new Map(focused.edges.map((edge, index) => [edge.id, index]));
    const incoming = candidate!.incoming.slice(0, 6)
      .map((index) => edgeIndexById.get(graph.edges[index].id))
      .filter((index): index is number => index !== undefined);
    const outgoing = candidate!.outgoing.slice(0, 6)
      .map((index) => edgeIndexById.get(graph.edges[index].id))
      .filter((index): index is number => index !== undefined);
    const weights = selectionLightWeights(focused, candidate!.id, { incoming, outgoing });
    const indexById = new Map(focused.nodes.map((node, index) => [node.id, index]));
    expect(weights[indexById.get(candidate!.id)!]).toBe(1);
    expect(selectionLightTone(1)).toBe("#fff4d2");
    expect(selectionLightTone(0.78)).toBe("#bfe8ff");
    expect(selectionLightTone(0.84)).toBe("#ffd18a");
    expect(selectionLightTone(0.94)).toBe("#eadcff");
    for (const edgeIndex of incoming) {
      expect(weights[indexById.get(focused.edges[edgeIndex].sourceId)!]).toBeGreaterThan(0);
    }
    for (const edgeIndex of outgoing) {
      expect(weights[indexById.get(focused.edges[edgeIndex].targetId)!]).toBeGreaterThan(0);
    }
    const connectedIds = new Set([
      candidate!.id,
      ...incoming.map((index) => focused.edges[index].sourceId),
      ...outgoing.map((index) => focused.edges[index].targetId),
    ]);
    const unrelated = focused.nodes.find((node) => !connectedIds.has(node.id));
    expect(unrelated).toBeTruthy();
    expect(weights[indexById.get(unrelated!.id)!]).toBe(0);
    expect(focused.nodes.map(({ id, kind, position, radius }) => ({ id, kind, position, radius })))
      .toEqual(scene("whole-vault").nodes.map(({ id, kind, position, radius }) => ({
        id,
        kind,
        position,
        radius,
      })));
  });
});
