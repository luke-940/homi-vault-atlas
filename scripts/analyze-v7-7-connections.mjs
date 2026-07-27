import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const requiredPath = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return path.resolve(value);
};

const baselineGraphPath = requiredPath("ATLAS_V77_BASELINE_GRAPH");
const currentGraphPath = requiredPath("ATLAS_V77_CURRENT_GRAPH");
const baselinePackPath = requiredPath("ATLAS_V77_BASELINE_PACK");
const currentPackPath = requiredPath("ATLAS_V77_CURRENT_PACK");
const baselineCapturePath = requiredPath("ATLAS_V77_BASELINE_CAPTURE");
const currentCapturePath = requiredPath("ATLAS_V77_CURRENT_CAPTURE");
const outputDir = requiredPath("ATLAS_V77_ANALYSIS_OUTPUT");
const baselineDossierPath = requiredPath("ATLAS_V77_BASELINE_DOSSIER");
const currentPublicGraphPath = requiredPath("ATLAS_V77_CURRENT_PUBLIC_GRAPH");

const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const [
  baselineGraph,
  currentGraph,
  baselinePack,
  currentPack,
  baselineCapture,
  currentCapture,
  baselineDossiers,
  currentPublicGraph,
] = await Promise.all([
  readJson(baselineGraphPath),
  readJson(currentGraphPath),
  readJson(baselinePackPath),
  readJson(currentPackPath),
  readJson(baselineCapturePath),
  readJson(currentCapturePath),
  readJson(baselineDossierPath),
  readJson(currentPublicGraphPath),
]);

for (const graph of [baselineGraph, currentGraph]) {
  if (graph.schema !== "atlas.graph.v1") {
    throw new Error(`Connection analysis blocked: expected atlas.graph.v1, received ${graph.schema}.`);
  }
}
for (const capture of [baselineCapture, currentCapture]) {
  if (capture.schema !== "atlas.canonical_capture.v1" || capture.pass !== true || capture.tornRead !== false) {
    throw new Error("Connection analysis blocked: canonical capture is missing or torn.");
  }
}
if (baselineDossiers.schema !== "atlas.v7_7.protagonist_dossiers.v1"
  || baselineDossiers.selectionMode !== "atlas_builder_judgment"
  || !Array.isArray(baselineDossiers.selected)) {
  throw new Error("Connection analysis blocked: baseline protagonist dossier is invalid.");
}
if (currentPublicGraph.schema !== "atlas.graph.v1" || currentPublicGraph.profile !== "atlas-public") {
  throw new Error("Connection analysis blocked: current public graph is invalid.");
}

const compareText = (left, right) => String(left).localeCompare(String(right));
const currentNodeById = new Map(currentGraph.nodes.map((node) => [node.id, node]));
const baselineNodeById = new Map(baselineGraph.nodes.map((node) => [node.id, node]));
const currentSourceById = new Map(currentPack.sourceIndex.map((entry) => [entry.id, entry]));
const baselineSourceById = new Map(baselinePack.sourceIndex.map((entry) => [entry.id, entry]));
const currentSourceByPath = new Map(currentPack.sourceIndex.map((entry) => [entry.path, entry]));
const baselineSourceByPath = new Map(baselinePack.sourceIndex.map((entry) => [entry.path, entry]));
const currentFiles = new Map(currentCapture.vault.files.map((file) => [file.relativePath, file]));
const baselineFiles = new Map(baselineCapture.vault.files.map((file) => [file.relativePath, file]));
const districtLabelById = new Map(
  currentGraph.nodes
    .filter((node) => node.kind === "district")
    .map((node) => [node.id, node.label]),
);

const incomingByNode = new Map(currentGraph.nodes.map((node) => [node.id, []]));
const outgoingByNode = new Map(currentGraph.nodes.map((node) => [node.id, []]));
for (const edge of currentGraph.edges) {
  incomingByNode.get(edge.target)?.push(edge);
  outgoingByNode.get(edge.source)?.push(edge);
}
for (const edges of [...incomingByNode.values(), ...outgoingByNode.values()]) {
  edges.sort((left, right) => compareText(left.id, right.id));
}

const nodeIds = currentGraph.nodes.map((node) => node.id).sort(compareText);
const betweenness = new Map(nodeIds.map((id) => [id, 0]));
for (const source of nodeIds) {
  const stack = [];
  const predecessors = new Map(nodeIds.map((id) => [id, []]));
  const sigma = new Map(nodeIds.map((id) => [id, 0]));
  const distance = new Map(nodeIds.map((id) => [id, -1]));
  sigma.set(source, 1);
  distance.set(source, 0);
  const queue = [source];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const vertex = queue[cursor];
    stack.push(vertex);
    const neighbors = [...new Set((outgoingByNode.get(vertex) ?? []).map((edge) => edge.target))]
      .sort(compareText);
    for (const neighbor of neighbors) {
      if (distance.get(neighbor) < 0) {
        distance.set(neighbor, distance.get(vertex) + 1);
        queue.push(neighbor);
      }
      if (distance.get(neighbor) === distance.get(vertex) + 1) {
        sigma.set(neighbor, sigma.get(neighbor) + sigma.get(vertex));
        predecessors.get(neighbor).push(vertex);
      }
    }
  }
  const dependency = new Map(nodeIds.map((id) => [id, 0]));
  while (stack.length) {
    const child = stack.pop();
    for (const parent of predecessors.get(child)) {
      if (sigma.get(child) > 0) {
        dependency.set(
          parent,
          dependency.get(parent) + (sigma.get(parent) / sigma.get(child)) * (1 + dependency.get(child)),
        );
      }
    }
    if (child !== source) {
      betweenness.set(child, betweenness.get(child) + dependency.get(child));
    }
  }
}

const edgeSummary = (edge, direction) => {
  const neighborId = direction === "incoming" ? edge.source : edge.target;
  const neighbor = currentNodeById.get(neighborId);
  return {
    edgeId: edge.id,
    direction,
    occurrenceCount: edge.occurrenceCount,
    neighborId,
    neighborLabel: neighbor?.label ?? neighborId,
    neighborDistrict: neighbor ? districtLabelById.get(neighbor.districtId) ?? null : null,
    neighborKind: neighbor?.kind ?? null,
  };
};
const strongestFirst = (left, right) =>
  right.occurrenceCount - left.occurrenceCount
  || compareText(left.neighborLabel, right.neighborLabel)
  || compareText(left.edgeId, right.edgeId);

const eligibleNodes = currentGraph.nodes.filter(
  (node) => !["district", "aggregate_boundary", "source_document"].includes(node.kind),
);
const metricFor = (node) => {
  const incoming = incomingByNode.get(node.id) ?? [];
  const outgoing = outgoingByNode.get(node.id) ?? [];
  const ownDistrict = districtLabelById.get(node.districtId) ?? null;
  const crossDomainDistricts = new Set();
  let crossDomainEdgeCount = 0;
  for (const edge of [...incoming, ...outgoing]) {
    const neighborId = edge.source === node.id ? edge.target : edge.source;
    const neighbor = currentNodeById.get(neighborId);
    const neighborDistrict = neighbor ? districtLabelById.get(neighbor.districtId) ?? null : null;
    if (neighborDistrict && neighborDistrict !== ownDistrict) {
      crossDomainDistricts.add(neighborDistrict);
      crossDomainEdgeCount += 1;
    }
  }
  const source = currentSourceById.get(node.id);
  const baseline = baselineNodeById.get(node.id);
  const currentFile = source ? currentFiles.get(source.path) : null;
  const baselineFile = source ? baselineFiles.get(source.path) : null;
  return {
    nodeId: node.id,
    label: node.label,
    path: source?.path ?? null,
    kind: node.kind,
    district: ownDistrict,
    gravity: node.gravity,
    occurrenceCount: node.occurrences,
    meaningfulDate: node.freshness,
    incomingEdgeCount: incoming.length,
    outgoingEdgeCount: outgoing.length,
    strongestIncoming: incoming.map((edge) => edgeSummary(edge, "incoming")).sort(strongestFirst).slice(0, 8),
    strongestOutgoing: outgoing.map((edge) => edgeSummary(edge, "outgoing")).sort(strongestFirst).slice(0, 8),
    crossDomainReach: crossDomainDistricts.size,
    crossDomainDistricts: [...crossDomainDistricts].sort(compareText),
    crossDomainEdgeCount,
    directedBridgeCentralityRaw: Number(betweenness.get(node.id).toFixed(6)),
    sourceHashChanged: Boolean(currentFile && (!baselineFile || currentFile.sha256 !== baselineFile.sha256)),
    delta: baseline
      ? {
          gravity: node.gravity - baseline.gravity,
          occurrenceCount: node.occurrences - baseline.occurrences,
          meaningfulDateChanged: node.freshness !== baseline.freshness,
        }
      : { nodeAdded: true },
  };
};

const metrics = eligibleNodes.map(metricFor);
const stable = (left, right) => compareText(left.nodeId, right.nodeId);
const top = (compare, count = 12) =>
  [...metrics].sort((left, right) => compare(left, right) || stable(left, right)).slice(0, count);
const topUniqueInbound = top(
  (left, right) => right.gravity - left.gravity || right.occurrenceCount - left.occurrenceCount,
);
const topDirectedBridge = top(
  (left, right) =>
    right.directedBridgeCentralityRaw - left.directedBridgeCentralityRaw
    || right.crossDomainReach - left.crossDomainReach
    || right.gravity - left.gravity,
);
const topCrossDomain = top(
  (left, right) =>
    right.crossDomainReach - left.crossDomainReach
    || right.crossDomainEdgeCount - left.crossDomainEdgeCount
    || right.gravity - left.gravity,
);
const topVerifiedChange = [...metrics]
  .filter((metric) =>
    metric.sourceHashChanged
    || metric.delta.nodeAdded
    || metric.delta.gravity !== 0
    || metric.delta.occurrenceCount !== 0
    || metric.delta.meaningfulDateChanged)
  .sort((left, right) =>
    Number(Boolean(right.delta.nodeAdded)) - Number(Boolean(left.delta.nodeAdded))
    || Number(right.sourceHashChanged) - Number(left.sourceHashChanged)
    || Math.abs(right.delta.gravity ?? 0) - Math.abs(left.delta.gravity ?? 0)
    || Math.abs(right.delta.occurrenceCount ?? 0) - Math.abs(left.delta.occurrenceCount ?? 0)
    || right.gravity - left.gravity
    || stable(left, right))
  .slice(0, 12);
const coreDomainTop = Object.fromEntries(
  ["MOC", "Papers", "Signals"].map((district) => [
    district,
    metrics
      .filter((metric) => metric.district === district)
      .sort((left, right) =>
        right.gravity - left.gravity
        || right.directedBridgeCentralityRaw - left.directedBridgeCentralityRaw
        || right.crossDomainReach - left.crossDomainReach
        || stable(left, right))
      .slice(0, 6),
  ]),
);

const candidateIds = new Set([
  ...topUniqueInbound,
  ...topDirectedBridge,
  ...topCrossDomain,
  ...topVerifiedChange,
  ...Object.values(coreDomainTop).flat(),
].map((metric) => metric.nodeId));
const candidateUnion = [...candidateIds]
  .map((id) => metrics.find((metric) => metric.nodeId === id))
  .filter(Boolean)
  .sort((left, right) => right.gravity - left.gravity || stable(left, right));

const publicNodeByLabel = new Map(currentPublicGraph.nodes.map((node) => [node.label, node]));
const refreshedDossiers = {
  ...baselineDossiers,
  generatedAt: currentCapture.capturedAt,
  captureTreeDigest: currentCapture.vault.treeDigest,
  selected: baselineDossiers.selected.map((dossier) => {
    const metric = metrics.find((candidate) => candidate.label === dossier.label);
    if (!metric) {
      throw new Error(`Connection analysis blocked: selected protagonist is absent: ${dossier.label}.`);
    }
    const captureFile = currentFiles.get(metric.path);
    if (!captureFile) {
      throw new Error(`Connection analysis blocked: selected protagonist source is absent: ${metric.path}.`);
    }
    const publicNode = publicNodeByLabel.get(dossier.label);
    return {
      ...dossier,
      ownerNodeId: metric.nodeId,
      ...(publicNode ? { publicNodeId: publicNode.id } : {}),
      source: {
        path: path.join(currentCapture.sourceBoundary.vaultRoot, metric.path),
        sha256: captureFile.sha256,
        bytes: captureFile.bytes,
        read: "direct",
      },
      metrics: {
        uniqueInboundDocuments: metric.gravity,
        inboundLinkOccurrences: metric.occurrenceCount,
        directedBridgeCentralityRaw: metric.directedBridgeCentralityRaw,
        crossDomainReach: metric.crossDomainReach,
        incomingEdgeCount: metric.incomingEdgeCount,
        outgoingEdgeCount: metric.outgoingEdgeCount,
      },
    };
  }),
  supportingNeighbors: (baselineDossiers.supportingNeighbors ?? []).map((neighbor) => {
    const metric = metrics.find((candidate) => candidate.label === neighbor.label);
    const captureFile = metric?.path ? currentFiles.get(metric.path) : null;
    return captureFile
      ? { ...neighbor, sourceSha256: captureFile.sha256, read: "direct" }
      : neighbor;
  }),
};

const addedPaths = [...currentFiles.keys()].filter((value) => !baselineFiles.has(value)).sort(compareText);
const removedPaths = [...baselineFiles.keys()].filter((value) => !currentFiles.has(value)).sort(compareText);
const changedPaths = [...currentFiles.keys()]
  .filter((value) => baselineFiles.has(value) && currentFiles.get(value).sha256 !== baselineFiles.get(value).sha256)
  .sort(compareText);
const sourceDelta = (relativePath, kind) => {
  const currentSource = currentSourceByPath.get(relativePath);
  const baselineSource = baselineSourceByPath.get(relativePath);
  const node = currentSource ? currentNodeById.get(currentSource.id) : null;
  return {
    kind,
    path: relativePath,
    baselineSha256: baselineFiles.get(relativePath)?.sha256 ?? null,
    currentSha256: currentFiles.get(relativePath)?.sha256 ?? null,
    baselineNodeId: baselineSource?.id ?? null,
    currentNodeId: currentSource?.id ?? null,
    graphDisposition: currentSource ? "named" : "excluded_or_control",
    district: node ? districtLabelById.get(node.districtId) ?? null : null,
    nodeKind: node?.kind ?? null,
    graphMetrics: node ? metricFor(node) : null,
  };
};

const graphDelta = {
  schema: "atlas.v7_7.graph_delta.v1",
  baseline: {
    release: "v7.6.0",
    capturedAt: baselineCapture.capturedAt,
    treeDigest: baselineCapture.vault.treeDigest,
    markdownCount: baselineCapture.vault.markdownCount,
    graphNodeCount: baselineGraph.nodes.length,
    graphEdgeCount: baselineGraph.edges.length,
    semanticDigest: baselineGraph.manifest.semanticDigest,
  },
  current: {
    capturedAt: currentCapture.capturedAt,
    treeDigest: currentCapture.vault.treeDigest,
    markdownCount: currentCapture.vault.markdownCount,
    graphNodeCount: currentGraph.nodes.length,
    graphEdgeCount: currentGraph.edges.length,
    semanticDigest: currentGraph.manifest.semanticDigest,
  },
  sourceFiles: {
    added: addedPaths.map((relativePath) => sourceDelta(relativePath, "added")),
    removed: removedPaths.map((relativePath) => sourceDelta(relativePath, "removed")),
    changed: changedPaths.map((relativePath) => sourceDelta(relativePath, "changed")),
  },
  graph: {
    addedNodeIds: currentGraph.nodes.filter((node) => !baselineNodeById.has(node.id)).map((node) => node.id).sort(compareText),
    removedNodeIds: baselineGraph.nodes.filter((node) => !currentNodeById.has(node.id)).map((node) => node.id).sort(compareText),
    addedEdgeIds: currentGraph.edges
      .filter((edge) => !baselineGraph.edges.some((before) => before.id === edge.id))
      .map((edge) => edge.id)
      .sort(compareText),
    removedEdgeIds: baselineGraph.edges
      .filter((edge) => !currentGraph.edges.some((after) => after.id === edge.id))
      .map((edge) => edge.id)
      .sort(compareText),
  },
};

const candidateMetrics = {
  schema: "atlas.v7_7.connection_candidate_metrics.v1",
  method: {
    compositeScoreUsed: false,
    gravity: "atlas.graph.v1 node.gravity (unique inbound documents)",
    occurrenceCount: "atlas.graph.v1 node.occurrences",
    directedBridgeCentrality: "directed unweighted Brandes betweenness over actual atlas.graph.v1 references",
    crossDomainReach: "distinct incident neighbor districts excluding the node's own district",
    verifiedChange: "v7.6 capture to fresh v7.7 capture; mtime is not used",
  },
  topUniqueInbound,
  topDirectedBridgeCentrality: topDirectedBridge,
  topCrossDomainReach: topCrossDomain,
  topVerifiedChange,
  coreDomainTop,
  unionCount: candidateUnion.length,
  candidateUnion,
};

await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(path.join(outputDir, "graph-delta.json"), `${JSON.stringify(graphDelta, null, 2)}\n`, "utf8"),
  writeFile(path.join(outputDir, "candidate-metrics.json"), `${JSON.stringify(candidateMetrics, null, 2)}\n`, "utf8"),
  writeFile(path.join(outputDir, "protagonist-dossiers.json"), `${JSON.stringify(refreshedDossiers, null, 2)}\n`, "utf8"),
]);

console.log(JSON.stringify({
  outputDir,
  baseline: graphDelta.baseline,
  current: graphDelta.current,
  sourceDelta: {
    added: addedPaths.length,
    removed: removedPaths.length,
    changed: changedPaths.length,
  },
  graphDelta: {
    addedNodes: graphDelta.graph.addedNodeIds.length,
    removedNodes: graphDelta.graph.removedNodeIds.length,
    addedEdges: graphDelta.graph.addedEdgeIds.length,
    removedEdges: graphDelta.graph.removedEdgeIds.length,
  },
  candidateUnionCount: candidateUnion.length,
  coreDomainTop: Object.fromEntries(
    Object.entries(coreDomainTop).map(([district, rows]) => [
      district,
      rows.map(({ label, gravity, occurrenceCount, crossDomainReach }) => ({
        label,
        gravity,
        occurrenceCount,
        crossDomainReach,
      })),
    ]),
  ),
}, null, 2));
