import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { buildAtlasMeaningV1 } from "../scripts/lib/atlas-meaning-v1.mjs";

const readPack = (name: string) => JSON.parse(
  readFileSync(path.resolve("public-safe", "data", `${name}.json`), "utf8"),
);

function snapshotIdentity(graph: {
  generatedAt: string;
  manifest: {
    semanticDigest: string;
    nodeCount: number;
    edgeCount: number;
  };
}) {
  return {
    release: "test",
    asOfDate: graph.generatedAt.slice(0, 10),
    graphSemanticDigest: graph.manifest.semanticDigest,
    graphNodeCount: graph.manifest.nodeCount,
    graphEdgeCount: graph.manifest.edgeCount,
  };
}

function ownerMovementFixture() {
  const publicGraph = readPack("graph");
  const graph = structuredClone(publicGraph);
  graph.profile = "atlas-owner";
  const edge = graph.edges[0];
  const source = graph.nodes.find((node: { id: string }) => node.id === edge.source);
  const target = graph.nodes.find((node: { id: string }) => node.id === edge.target);
  if (!source || !target) throw new Error("Owner movement fixture requires a resolved graph edge.");
  const changedPath = "MOC/Knowledge Tools.md";
  const addedPath = "Research/Weekly/Week 20.md";
  const graphMetrics = (
    node: typeof source,
    sourcePath: string,
    baseline: Record<string, unknown> | null,
    delta: Record<string, unknown>,
  ) => ({
    nodeId: node.id,
    label: node.label,
    path: sourcePath,
    kind: node.kind,
    district: node.districtId,
    gravity: node.gravity,
    occurrenceCount: node.occurrences,
    meaningfulDate: node.freshness ?? null,
    sourceHashChanged: true,
    baseline,
    delta,
  });
  const baselineGravity = Math.max(0, source.gravity - 1);
  const baselineOccurrences = Math.max(0, source.occurrences - 1);
  const graphDelta = {
    schema: "atlas.v7_6.graph_delta.v1",
    graph: {
      addedNodeIds: [target.id],
      removedNodeIds: [],
      addedEdgeIds: [edge.id],
      removedEdgeIds: [],
    },
    sourceFiles: {
      added: [{
        kind: "added",
        path: addedPath,
        currentNodeId: target.id,
        baselineNodeId: null,
        graphMetrics: graphMetrics(target, addedPath, null, { nodeAdded: true }),
      }],
      changed: [{
        kind: "changed",
        path: changedPath,
        currentNodeId: source.id,
        baselineNodeId: source.id,
        graphMetrics: graphMetrics(
          source,
          changedPath,
          {
            gravity: baselineGravity,
            occurrenceCount: baselineOccurrences,
            meaningfulDate: source.freshness ?? null,
          },
          {
            gravity: source.gravity - baselineGravity,
            occurrenceCount: source.occurrences - baselineOccurrences,
            meaningfulDateChanged: false,
          },
        ),
      }],
      removed: [],
    },
  };
  const movementJudgments = {
    schema: "atlas.v7_6.movement_judgment.v1",
    rows: [
      {
        sourcePath: addedPath,
        label: "이번 주 지식 흐름을 여섯 판단 축으로 압축했다",
        kind: "node_added",
        caveat: "새 노드의 존재 외에는 활동량을 추정하지 않습니다.",
        order: 2,
      },
      {
        sourcePath: changedPath,
        label: "근거가 다음 판단으로 순환하는 법",
        kind: "verified_handoff",
        caveat: "검증된 새 방향 관계만 handoff 증거로 사용합니다.",
        order: 1,
      },
    ],
  };
  return {
    graph,
    agency: readPack("agency"),
    graphDelta,
    movementJudgments,
    source,
    target,
    edge,
    changedPath,
  };
}

describe("Atlas v7.6 semantic meaning contract", () => {
  test("binds every protagonist and constellation to actual directed graph evidence", () => {
    const graph = readPack("graph");
    const meaning = readPack("meaning");
    const nodeById = new Map(graph.nodes.map((node: { id: string }) => [node.id, node]));
    const edgeById = new Map(graph.edges.map((edge: { id: string }) => [edge.id, edge]));

    expect(meaning).toMatchObject({
      schema: "atlas.meaning.v1",
      profile: "atlas-public",
      manifest: {
        protagonistCount: meaning.protagonists.length,
        constellationCount: meaning.constellations.length,
        movementCount: meaning.movements.length,
      },
    });
    expect(meaning.protagonists.length).toBeGreaterThanOrEqual(3);
    for (const protagonist of meaning.protagonists) {
      const node = nodeById.get(protagonist.nodeId) as {
        gravity: number;
        occurrences: number;
      } | undefined;
      expect(node).toBeDefined();
      expect(protagonist.metrics.gravity).toBe(node?.gravity);
      expect(protagonist.metrics.occurrences).toBe(node?.occurrences);
    }
    for (const constellation of meaning.constellations) {
      expect(nodeById.has(constellation.focalNodeId)).toBe(true);
      for (const edgeId of constellation.incomingEdgeIds) {
        const edge = edgeById.get(edgeId) as { target: string } | undefined;
        expect(edge?.target).toBe(constellation.focalNodeId);
      }
      for (const edgeId of constellation.outgoingEdgeIds) {
        const edge = edgeById.get(edgeId) as { source: string } | undefined;
        expect(edge?.source).toBe(constellation.focalNodeId);
      }
    }
  });

  test("keeps Homi as a non-metric system anchor and OpenAI as a factual constellation", () => {
    const graph = readPack("graph");
    const meaning = readPack("meaning");
    const core = meaning.scenes.find((scene: { id: string }) => scene.id === "core-gravity");
    const openAi = graph.nodes.find((node: { label: string }) => node.label === "OpenAI");
    const constellation = meaning.constellations.find(
      (item: { focalNodeId: string }) => item.focalNodeId === openAi?.id,
    );

    expect(core?.thesis).toContain("Homi");
    expect(core?.focusIds.length).toBe(3);
    expect(core?.focusIds.every((id: string) => graph.nodes.some((node: { id: string }) => node.id === id))).toBe(true);
    expect(graph.nodes.some((node: { label: string }) => node.label === "Homi")).toBe(false);
    expect(openAi).toBeDefined();
    expect(constellation?.incomingEdgeIds.length).toBeGreaterThan(0);
    expect(constellation?.outgoingEdgeIds.length).toBeGreaterThan(0);
  });

  test("keeps Control Plane observational and independent owners in stewardship", () => {
    const graph = readPack("graph");
    const agency = readPack("agency");
    const current = readPack("meaning");
    const identity = snapshotIdentity(graph);
    const dossiers = current.protagonists.map((item: {
      nodeId: string;
      role: string;
      thesis: string;
      caveat: string;
      metrics: Record<string, unknown>;
    }) => ({
      nodeId: item.nodeId,
      role: item.role,
      thesis: item.thesis,
      caveat: item.caveat,
      metrics: item.metrics,
    }));
    const meaning = buildAtlasMeaningV1({
      graph,
      agency,
      generatedAt: current.generatedAt,
      baseline: identity,
      baselineGraph: graph,
      current: identity,
      dossiers,
    });
    const controlPlane = agency.actors.find(
      (actor: { label: string }) => actor.label === "Control Plane",
    );
    const stewardshipActorIds = meaning.operationalCompass
      .filter((item: { kind: string }) => item.kind === "stewardship")
      .map((item: { actorId: string }) => item.actorId)
      .sort();

    expect(meaning.operationalCompass.find(
      (item: { actorId: string }) => item.actorId === controlPlane?.id,
    )?.kind).toBe("observation");
    expect(meaning.operationalCompass.some(
      (item: { actorId: string; kind: string }) =>
        item.actorId === controlPlane?.id && item.kind === "stewardship",
    )).toBe(false);
    expect(stewardshipActorIds).toEqual([
      "actor:groot-manager",
      "actor:intelligence-layer-manager",
      "actor:rocket-manager",
    ]);
    expect(meaning.operationalCompass.every(
      (item: { actorId: string; domainIds: string[] }) =>
        Boolean(item.actorId) && item.domainIds.length > 0,
    )).toBe(true);
  });

  test("is deterministic for identical graph, agency, dossier, and snapshot inputs", () => {
    const graph = readPack("graph");
    const agency = readPack("agency");
    const current = readPack("meaning");
    const dossiers = current.protagonists.map((item: {
      nodeId: string;
      role: string;
      thesis: string;
      caveat: string;
      metrics: Record<string, unknown>;
    }) => ({
      nodeId: item.nodeId,
      role: item.role,
      thesis: item.thesis,
      caveat: item.caveat,
      metrics: item.metrics,
    }));
    const input = {
      graph,
      agency,
      generatedAt: current.generatedAt,
      baseline: current.baseline,
      baselineGraph: graph,
      current: current.current,
      dossiers,
    };
    const first = buildAtlasMeaningV1(structuredClone(input));
    const second = buildAtlasMeaningV1(structuredClone(input));
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.manifest.projectionDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  test("uses explicit Owner movement judgment order and labels while deriving all truth from graph delta", () => {
    const fixture = ownerMovementFixture();
    const current = snapshotIdentity(fixture.graph);
    const meaning = buildAtlasMeaningV1({
      graph: fixture.graph,
      agency: fixture.agency,
      generatedAt: fixture.graph.generatedAt,
      baseline: current,
      current,
      graphDelta: fixture.graphDelta as never,
      movementJudgments: fixture.movementJudgments as never,
    });

    expect(meaning.movements.map((movement: { label: string }) => movement.label)).toEqual([
      "근거가 다음 판단으로 순환하는 법",
      "이번 주 지식 흐름을 여섯 판단 축으로 압축했다",
    ]);
    expect(meaning.movements.map((movement: { kind: string }) => movement.kind)).toEqual([
      "verified_handoff",
      "node_added",
    ]);
    expect(meaning.movements[0]).toMatchObject({
      nodeIds: [fixture.source.id],
      edgeIds: [fixture.edge.id],
      previousValue: fixture.graphDelta.sourceFiles.changed[0].graphMetrics.baseline,
      currentValue: {
        gravity: fixture.source.gravity,
        occurrences: fixture.source.occurrences,
        meaningfulDate: fixture.source.freshness ?? null,
      },
      evidenceRefs: [fixture.source.id, fixture.edge.id],
    });
    expect(meaning.movements[1]).toMatchObject({
      nodeIds: [fixture.target.id],
      edgeIds: [fixture.edge.id],
      previousValue: null,
      currentValue: {
        gravity: fixture.target.gravity,
        occurrences: fixture.target.occurrences,
        meaningfulDate: fixture.target.freshness ?? null,
      },
    });
  });

  test("rejects an Owner movement judgment whose exact source is missing", () => {
    const fixture = ownerMovementFixture();
    const current = snapshotIdentity(fixture.graph);
    const missingSourceJudgments = {
      schema: "atlas.v7_6.movement_judgment.v1",
      rows: [{
        sourcePath: "MOC/Not Present.md",
        label: "존재하지 않는 판단",
        kind: "meaningfully_updated",
        caveat: "존재하지 않는 근거는 사용할 수 없습니다.",
        order: 1,
      }],
    };

    expect(() => buildAtlasMeaningV1({
      graph: fixture.graph,
      agency: fixture.agency,
      generatedAt: fixture.graph.generatedAt,
      baseline: current,
      current,
      graphDelta: fixture.graphDelta as never,
      movementJudgments: missingSourceJudgments as never,
    })).toThrow("source is absent from graph delta");
  });

  test("ignores Owner movement judgments for the Public movement projection", () => {
    const fixture = ownerMovementFixture();
    const publicGraph = readPack("graph");
    const current = snapshotIdentity(publicGraph);
    const input: any = {
      graph: publicGraph,
      agency: fixture.agency,
      generatedAt: publicGraph.generatedAt,
      baseline: current,
      baselineGraph: publicGraph,
      current,
      graphDelta: fixture.graphDelta as never,
    };
    const withoutJudgments = buildAtlasMeaningV1(structuredClone(input));
    const withJudgments = buildAtlasMeaningV1({
      ...structuredClone(input),
      movementJudgments: structuredClone(fixture.movementJudgments) as never,
    });

    expect(withJudgments.movements).toEqual(withoutJudgments.movements);
    expect(withJudgments.manifest.projectionDigest).toBe(
      withoutJudgments.manifest.projectionDigest,
    );
  });
});
