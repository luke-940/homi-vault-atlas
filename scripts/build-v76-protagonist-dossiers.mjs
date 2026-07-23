import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const requiredPath = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return path.resolve(value);
};

const previousPath = requiredPath("ATLAS_V76_PREVIOUS_DOSSIERS");
const metricsPath = requiredPath("ATLAS_V76_CANDIDATE_METRICS");
const deltaPath = requiredPath("ATLAS_V76_GRAPH_DELTA");
const capturePath = requiredPath("ATLAS_V76_CURRENT_CAPTURE");
const ownerGraphPath = requiredPath("ATLAS_V76_OWNER_GRAPH");
const publicGraphPath = requiredPath("ATLAS_V76_PUBLIC_GRAPH");
const outputPath = requiredPath("ATLAS_V76_DOSSIER_OUTPUT");
const selectionAmendmentPath = process.env.ATLAS_V76_SELECTION_AMENDMENT
  ? path.resolve(process.env.ATLAS_V76_SELECTION_AMENDMENT)
  : null;

const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const [previous, metrics, delta, capture, ownerGraph, publicGraph, selectionAmendment] = await Promise.all([
  readJson(previousPath),
  readJson(metricsPath),
  readJson(deltaPath),
  readJson(capturePath),
  readJson(ownerGraphPath),
  readJson(publicGraphPath),
  selectionAmendmentPath ? readJson(selectionAmendmentPath) : null,
]);

const metricByLabel = new Map(metrics.candidateUnion.map((item) => [item.label, item]));
const ownerNodeByLabel = new Map(ownerGraph.nodes.map((node) => [node.label, node]));
const publicNodeByLabel = new Map(publicGraph.nodes.map((node) => [node.label, node]));
const captureFileByPath = new Map(capture.vault.files.map((file) => [file.relativePath, file]));
const requestedProtagonists = Array.isArray(selectionAmendment?.homePrimaryProtagonists)
  ? selectionAmendment.homePrimaryProtagonists
  : previous.protagonists;
if (requestedProtagonists.length < 6 || requestedProtagonists.length > 10) {
  throw new Error(`Home protagonist selection must contain 6–10 entries, received ${requestedProtagonists.length}.`);
}
const selected = requestedProtagonists.map((prior) => {
  const ownerNode = ownerNodeByLabel.get(prior.label);
  if (!ownerNode) throw new Error(`Selected protagonist disappeared from current graph: ${prior.label}`);
  const metric = metricByLabel.get(prior.label);
  const publicNode = publicNodeByLabel.get(prior.label);
  const evidenceRefs = prior.evidenceRefs.map((reference) => {
    const current = captureFileByPath.get(reference.path);
    if (!current) throw new Error(`Dossier evidence disappeared from current capture: ${reference.path}`);
    return { path: reference.path, sha256: current.sha256 };
  });
  return {
    ...prior,
    nodeId: metric?.nodeId ?? ownerNode.id,
    publicNodeId: publicNode?.id ?? null,
    district: metric?.district ?? prior.district,
    kind: metric?.kind ?? ownerNode.kind,
    metrics: {
      gravity: metric?.gravity ?? ownerNode.gravity,
      occurrenceCount: metric?.occurrenceCount ?? ownerNode.occurrences,
      crossDomainReach: metric?.crossDomainReach ?? prior.metrics?.crossDomainReach ?? 0,
      directedBridgeCentralityRaw: metric?.directedBridgeCentralityRaw ?? prior.metrics?.directedBridgeCentralityRaw ?? 0,
      meaningfulDate: metric?.meaningfulDate ?? ownerNode.freshness,
    },
    constellation: {
      incomingEdgeIds: metric?.strongestIncoming
        ? metric.strongestIncoming.slice(0, 6).map((edge) => edge.edgeId)
        : prior.constellation?.incomingEdgeIds?.slice(0, 6) ?? [],
      outgoingEdgeIds: metric?.strongestOutgoing
        ? metric.strongestOutgoing.slice(0, 6).map((edge) => edge.edgeId)
        : prior.constellation?.outgoingEdgeIds?.slice(0, 6) ?? [],
    },
    evidenceRefs,
  };
});

const dossier = {
  ...previous,
  generatedAt: new Date().toISOString(),
  baseline: {
    ...previous.baseline,
    vaultTreeDigest: delta.baseline.treeDigest,
    ownerGraphSemanticDigest: delta.baseline.semanticDigest,
  },
  current: {
    capturedAt: delta.current.capturedAt,
    vaultTreeDigest: delta.current.treeDigest,
    ownerGraphSemanticDigest: ownerGraph.manifest.semanticDigest,
    ownerGraphNodeCount: ownerGraph.manifest.nodeCount,
    ownerGraphEdgeCount: ownerGraph.manifest.edgeCount,
  },
  candidateMethod: {
    ...previous.candidateMethod,
    candidateUnionCount: metrics.unionCount,
    selectionAmendment: selectionAmendmentPath,
  },
  protagonists: selected,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(dossier, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  outputPath,
  protagonistCount: dossier.protagonists.length,
  current: dossier.current,
}, null, 2));
