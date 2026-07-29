import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { scanOperatingExposure, scanPrivacyText } from "./privacy-scanner.mjs";
import { containsInternalKnowledgeMarker } from "./atlas-publication-policy-v3.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const digestPattern = /^[a-f0-9]{64}$/;
const hashedStemPattern = /^[a-f0-9]{16,64}$/;

function finding(id, target, extra = {}) {
  return { id, path: target, ...extra };
}

function relativeArtifactPath(root, absolute) {
  return path.relative(root, absolute).replaceAll("\\", "/");
}

async function regularFiles(directory) {
  const files = [];
  for (const entry of (await readdir(directory, { withFileTypes: true }))
    .sort((left, right) => left.name.localeCompare(right.name, "en"))) {
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Knowledge artifact boundary contains a symlink: ${absolute}`);
    }
    if (entry.isDirectory()) files.push(...await regularFiles(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

function manifestDigestRows(knowledge) {
  if (knowledge?.encoding === "string_table_v1"
    && Array.isArray(knowledge?.strings)
    && Array.isArray(knowledge?.dossiers)) {
    return knowledge.dossiers.map((row) => {
      const nodeId = knowledge.strings[row?.[0]];
      const jsonSha256 = knowledge.strings[row?.[5]];
      const javascriptSha256 = knowledge.strings[row?.[6]];
      const token = String(jsonSha256 ?? "").slice(0, 20);
      return {
        nodeId,
        path: `data/knowledge-shards/${token}.json`,
        jsonSha256,
        javascriptPath: `data/knowledge-shards/${token}.js`,
        javascriptSha256,
        bytes: row?.[7],
      };
    });
  }
  if (Array.isArray(knowledge?.knowledgeShardDigests)) return knowledge.knowledgeShardDigests;
  if (Array.isArray(knowledge?.shards)) return knowledge.shards;
  if (Array.isArray(knowledge?.manifest?.shards)) return knowledge.manifest.shards;
  return [];
}

function manifestSearchDigest(knowledge) {
  if (knowledge?.encoding === "string_table_v1" && knowledge?.search?.token) {
    return {
      path: `data/search.${knowledge.search.token}.json`,
      jsonSha256: knowledge.search.jsonSha256,
      javascriptPath: `data/search.${knowledge.search.token}.js`,
      javascriptSha256: knowledge.search.javascriptSha256,
      bytes: knowledge.search.bytes,
    };
  }
  return knowledge?.search
    ?? knowledge?.searchDigest
    ?? knowledge?.searchIndex
    ?? knowledge?.manifest?.searchIndex
    ?? null;
}

export function expandKnowledgeIndex(knowledge) {
  if (knowledge?.encoding !== "string_table_v1") return knowledge;
  const strings = Array.isArray(knowledge?.strings) ? knowledge.strings : [];
  const dossiers = (knowledge?.dossiers ?? []).map((row) => {
    const nodeId = strings[row?.[0]];
    const jsonSha256 = strings[row?.[5]];
    const token = String(jsonSha256 ?? "").slice(0, 20);
    return {
      nodeId,
      title: strings[row?.[1]],
      domain: strings[row?.[2]],
      kind: strings[row?.[3]],
      readerSummary: strings[row?.[4]],
      shardPath: `data/knowledge-shards/${token}.js`,
      shardJsonSha256: jsonSha256,
      shardJavascriptSha256: strings[row?.[6]],
      shardBytes: row?.[7],
      publishedSectionCount: row?.[8],
      omittedSectionCount: row?.[9],
    };
  });
  return {
    ...knowledge,
    dossiers,
    documents: dossiers.map((entry) => ({
      documentId: `document:${entry.nodeId}`,
      nodeId: entry.nodeId,
      publishedSectionIds: Array.from(
        { length: Number(entry.publishedSectionCount) || 0 },
        (_, index) => `compact:${index}`,
      ),
      omittedSectionCount: entry.omittedSectionCount,
      shardPath: entry.shardPath,
    })),
    shards: manifestDigestRows(knowledge),
    search: manifestSearchDigest(knowledge),
  };
}

function pathFromManifest(row, extension) {
  const direct = row?.[`${extension}Path`]
    ?? row?.paths?.[extension]
    ?? row?.[extension]?.path;
  if (typeof direct === "string") return direct.replaceAll("\\", "/");
  if (typeof row?.path === "string") {
    const normalized = row.path.replaceAll("\\", "/");
    if (normalized.endsWith(`.${extension}`)) return normalized;
    return `${normalized}.${extension}`;
  }
  return null;
}

function digestFromManifest(row, extension) {
  return row?.[`${extension}Sha256`]
    ?? row?.digests?.[extension]
    ?? row?.[extension]?.sha256
    ?? null;
}

function canonicalArtifactPath(value) {
  if (typeof value !== "string" || value.startsWith("/") || value.includes("..") || value.includes("\0")) {
    return null;
  }
  return value.replaceAll("\\", "/").replace(/^\.\//, "").replace(/^data\//, "");
}

function parseJsonStringLiteral(value, label) {
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed !== "string") throw new TypeError("not-string");
    return parsed;
  } catch {
    throw new Error(`Knowledge ${label} must be one canonical JSON string literal.`);
  }
}

function parseKnowledgeRegistration(jsText, kind) {
  const body = String(jsText);
  const jsonTextMatch = /(?:"jsonText"|jsonText)\s*:\s*("(?:\\.|[^"\\])*")/.exec(body);
  const digestMatch = /(?:"jsonSha256"|jsonSha256)\s*:\s*"([a-f0-9]{64})"/.exec(body);
  if (!jsonTextMatch || !digestMatch) {
    throw new Error("Knowledge wrapper is missing its exact JSON bytes or digest.");
  }
  const jsonText = parseJsonStringLiteral(jsonTextMatch[1], "jsonText");
  const registryToken = kind === "shard"
    ? /__HOMI_ATLAS_KNOWLEDGE_SHARDS__\s*\[\s*("(?:\\.|[^"\\])*")\s*\]\s*=/.exec(body)?.[1]
    : /(?:(?:window|globalThis)\.)?__HOMI_ATLAS_KNOWLEDGE_SEARCH__\s*=/.test(body)
      ? "\"knowledge-search\""
      : null;
  if (!registryToken) throw new Error("Knowledge wrapper registry assignment is missing.");
  const registryKey = parseJsonStringLiteral(registryToken, "registry key");
  if (sha256(jsonText) !== digestMatch[1]) {
    throw new Error("Knowledge wrapper declared digest differs from its exact JSON bytes.");
  }
  const wireValue = JSON.parse(jsonText);
  if (wireValue?.schema !== "atlas.knowledge_wire.v1"
    || wireValue?.kind !== kind
    || wireValue?.registryKey !== registryKey
    || wireValue?.encoding !== "gzip_base64_v1"
    || typeof wireValue?.payload !== "string"
    || !digestPattern.test(String(wireValue?.innerJsonSha256 ?? ""))
    || !Number.isInteger(wireValue?.innerBytes)
    || wireValue.innerBytes < 1) {
    throw new Error("Knowledge wrapper compressed envelope is invalid.");
  }
  const innerJsonText = gunzipSync(Buffer.from(wireValue.payload, "base64")).toString("utf8");
  if (Buffer.byteLength(innerJsonText) !== wireValue.innerBytes
    || sha256(innerJsonText) !== wireValue.innerJsonSha256) {
    throw new Error("Knowledge wrapper compressed payload differs from its declared bytes.");
  }
  const value = JSON.parse(innerJsonText);
  if (kind === "shard" && value?.nodeId !== registryKey) {
    throw new Error("Knowledge shard registry key differs from the shard nodeId.");
  }
  return {
    registryKey,
    jsonText,
    jsonSha256: digestMatch[1],
    innerJsonText,
    wireValue,
    value,
  };
}

export function validateKnowledgeIndex(knowledge, graph, {
  gate1 = false,
  reviewCandidate = false,
  requireCompleteGraphCoverage = true,
  expectedGate1Dossiers = 5,
} = {}) {
  const failures = [];
  const decoded = expandKnowledgeIndex(knowledge);
  const manifest = knowledge?.manifest ?? {};
  const graphNodeIds = new Set(
    graph?.nodes?.map((node) => graph.strings?.[node[0]]).filter(Boolean) ?? [],
  );
  const dossierEntries = Array.isArray(decoded?.dossiers) ? decoded.dossiers : [];
  const documentEntries = Array.isArray(decoded?.documents) ? decoded.documents : [];
  const shardEntries = manifestDigestRows(knowledge);
  const dossierNodeIds = dossierEntries.map((entry) => entry?.nodeId).filter(Boolean);
  const documentNodeIds = documentEntries.map((entry) => entry?.nodeId).filter(Boolean);
  const shardNodeIds = shardEntries.map((entry) => entry?.nodeId).filter(Boolean);
  const duplicateDossierIds = dossierNodeIds.filter((id, index) => dossierNodeIds.indexOf(id) !== index);

  if (knowledge?.schema !== "atlas.knowledge.v1"
    || (knowledge?.encoding && knowledge.encoding !== "string_table_v1")) failures.push("schema");
  if (knowledge?.graphProjectionDigest !== graph?.manifest?.projectionDigest) failures.push("graph-projection-digest");
  if (manifest.dossierCount !== dossierEntries.length) failures.push("dossier-count");
  if (manifest.documentCount !== documentEntries.length) failures.push("document-count");
  if (dossierEntries.some((entry) => (
    typeof entry?.nodeId !== "string" || !entry.nodeId
    || typeof entry?.title !== "string" || !entry.title.trim()
    || typeof entry?.domain !== "string" || !entry.domain.trim()
    || typeof entry?.kind !== "string" || !entry.kind
    || typeof entry?.readerSummary !== "string" || !entry.readerSummary.trim()
    || !canonicalArtifactPath(entry?.shardPath)
    || !digestPattern.test(String(entry?.shardJsonSha256 ?? ""))
  ))) failures.push("dossier-index-shape");
  if (documentEntries.some((entry) => (
    typeof entry?.documentId !== "string" || !entry.documentId
    || typeof entry?.nodeId !== "string" || !entry.nodeId
    || !Array.isArray(entry?.publishedSectionIds)
    || !Number.isInteger(entry?.omittedSectionCount) || entry.omittedSectionCount < 0
    || !canonicalArtifactPath(entry?.shardPath)
  ))) failures.push("document-index-shape");
  if (shardEntries.some((entry) => (
    typeof entry?.nodeId !== "string" || !entry.nodeId
    || !canonicalArtifactPath(pathFromManifest(entry, "json"))
    || !canonicalArtifactPath(pathFromManifest(entry, "javascript"))
    || !digestPattern.test(String(digestFromManifest(entry, "json") ?? ""))
    || !digestPattern.test(String(digestFromManifest(entry, "javascript") ?? ""))
    || !Number.isInteger(entry?.bytes) || entry.bytes < 1
  ))) failures.push("shard-index-shape");
  const searchEntry = manifestSearchDigest(knowledge);
  if (!searchEntry
    || !canonicalArtifactPath(pathFromManifest(searchEntry, "json"))
    || !canonicalArtifactPath(pathFromManifest(searchEntry, "javascript"))
    || !digestPattern.test(String(digestFromManifest(searchEntry, "json") ?? ""))
    || !digestPattern.test(String(digestFromManifest(searchEntry, "javascript") ?? ""))) {
    failures.push("search-index-shape");
  }
  if (duplicateDossierIds.length) failures.push("duplicate-dossier-node");
  if (new Set(documentNodeIds).size !== documentNodeIds.length) failures.push("duplicate-document-node");
  if (new Set(shardNodeIds).size !== shardNodeIds.length) failures.push("duplicate-shard-node");
  if (dossierNodeIds.some((id) => !graphNodeIds.has(id))) failures.push("dossier-node-not-in-graph");
  if (shardEntries.length !== dossierEntries.length) failures.push("shard-count");
  if (documentEntries.length !== dossierEntries.length) failures.push("dossier-document-cardinality");
  const shardByNodeId = new Map(shardEntries.map((entry) => [entry.nodeId, entry]));
  const documentByNodeId = new Map(documentEntries.map((entry) => [entry.nodeId, entry]));
  for (const dossier of dossierEntries) {
    const shard = shardByNodeId.get(dossier.nodeId);
    const document = documentByNodeId.get(dossier.nodeId);
    if (!shard
      || !document
      || dossier.shardPath !== pathFromManifest(shard, "javascript")
      || dossier.shardJsonSha256 !== digestFromManifest(shard, "json")
      || document.shardPath !== pathFromManifest(shard, "javascript")) {
      failures.push("dossier-shard-binding");
      break;
    }
  }
  for (const document of documentEntries) {
    const shard = shardByNodeId.get(document.nodeId);
    if (!shard || document.shardPath !== pathFromManifest(shard, "javascript")) {
      failures.push("document-shard-binding");
      break;
    }
  }
  if (!Number.isInteger(manifest.claimCount) || manifest.claimCount < dossierEntries.length) failures.push("claim-count");
  if (!Number.isInteger(manifest.evidenceCount) || manifest.evidenceCount < dossierEntries.length) failures.push("evidence-count");
  if (!Number.isInteger(manifest.relationExplanationCount) || manifest.relationExplanationCount < 0) {
    failures.push("relation-explanation-count");
  }
  if (!Number.isInteger(manifest.publishedSectionCount) || manifest.publishedSectionCount < 0) {
    failures.push("published-section-count");
  }
  if (!Number.isInteger(manifest.omittedSectionCount) || manifest.omittedSectionCount < 0) {
    failures.push("omitted-section-count");
  }
  if (manifest.unclassifiedSectionCount !== 0) failures.push("unclassified-section-count");
  if (!digestPattern.test(String(manifest.projectionDigest ?? ""))) failures.push("projection-digest");

  if (gate1) {
    if (knowledge?.releaseEligible !== false) failures.push("gate1-release-eligible");
    if (dossierEntries.length !== expectedGate1Dossiers) failures.push("gate1-dossier-count");
    if (documentEntries.length !== expectedGate1Dossiers) failures.push("gate1-document-count");
    const domains = new Set(dossierEntries.map((entry) => entry?.domain));
    if (!["MOC", "Papers", "Signals"].every((domain) => domains.has(domain))
      || !["Rocket", "Groot"].some((domain) => domains.has(domain))
      || !["Intelligence Layer", "Strategy"].some((domain) => domains.has(domain))) {
      failures.push("gate1-domain-coverage");
    }
  } else {
    if (reviewCandidate) {
      if (knowledge?.releaseEligible !== false) failures.push("review-candidate-release-eligible");
    } else if (knowledge?.releaseEligible !== true) {
      failures.push("release-eligible");
    }
    if (requireCompleteGraphCoverage) {
      if (dossierEntries.length !== graphNodeIds.size) failures.push("release-dossier-graph-cardinality");
      if (documentEntries.length !== graphNodeIds.size) failures.push("release-document-graph-cardinality");
      if (new Set(dossierNodeIds).size !== graphNodeIds.size
        || [...graphNodeIds].some((id) => !dossierNodeIds.includes(id))) {
        failures.push("release-dossier-node-coverage");
      }
      if (new Set(documentNodeIds).size !== graphNodeIds.size
        || [...graphNodeIds].some((id) => !documentNodeIds.includes(id))) {
        failures.push("release-document-node-coverage");
      }
    }
  }
  return failures;
}

function graphFacts(graph) {
  const nodeIds = graph?.nodes?.map((node) => graph.strings?.[node[0]]) ?? [];
  const nodes = new Map((graph?.nodes ?? []).map((node, index) => {
    const id = nodeIds[index];
    const domain = graph?.domains?.[node[3]];
    return [id, {
      id,
      title: graph.strings?.[node[1]],
      kind: graph.kinds?.[node[2]],
      domain: domain ? graph.strings?.[domain[1]] : null,
    }];
  }).filter(([id]) => id));
  const edges = new Map();
  for (const edge of graph?.edges ?? []) {
    const id = graph.strings?.[edge[0]];
    if (!id) continue;
    edges.set(id, {
      id,
      sourceId: nodeIds[edge[1]],
      targetId: nodeIds[edge[2]],
      occurrences: edge[3],
    });
  }
  return { nodeIds: new Set(nodeIds.filter(Boolean)), nodes, edges };
}

function uniqueValues(values) {
  return new Set(values).size === values.length;
}

function safeDocumentFailures(document) {
  const failures = [];
  const sectionIds = document?.sections?.map((section) => section?.id).filter(Boolean) ?? [];
  if (!document || typeof document !== "object") return ["document"];
  if (typeof document.id !== "string" || !document.id) failures.push("document-id");
  if (typeof document.nodeId !== "string" || !document.nodeId) failures.push("document-node");
  if (typeof document.title !== "string" || !document.title.trim()) failures.push("document-title");
  if (!Array.isArray(document.sections) || !document.sections.length) failures.push("document-sections");
  if (!uniqueValues(sectionIds)) failures.push("document-section-ids");
  if (!Number.isInteger(document.omittedSectionCount) || document.omittedSectionCount < 0) {
    failures.push("document-omitted-sections");
  }
  if (!Number.isInteger(document.omittedBlockCount) || document.omittedBlockCount < 0) {
    failures.push("document-omitted-blocks");
  }
  const blockTypes = new Set(["paragraph", "list", "table", "blockquote", "callout", "code"]);
  const inlineTypes = new Set(["text", "atlas_link", "section_link", "private_target"]);
  for (const section of document.sections ?? []) {
    if (typeof section?.heading !== "string" || !section.heading.trim()
      || !Number.isInteger(section?.depth)
      || section.depth < 1
      || !Array.isArray(section?.blocks)) {
      failures.push("document-section-shape");
      break;
    }
    const blockIds = section.blocks.map((block) => block?.id).filter(Boolean);
    if (!uniqueValues(blockIds)) {
      failures.push("document-block-ids");
      break;
    }
    for (const block of section.blocks) {
      if (!blockTypes.has(block?.type) || typeof block?.id !== "string" || !block.id) {
        failures.push("document-block-shape");
        break;
      }
      const inlineGroups = block.type === "list"
        ? block.items
        : block.type === "table"
          ? block.rows?.flat()
          : ["paragraph", "blockquote", "callout"].includes(block.type)
            ? [block.inlines]
            : [];
      if (!Array.isArray(inlineGroups)
        || inlineGroups.some((group) => !Array.isArray(group)
          || group.some((inline) => !inlineTypes.has(inline?.type)))) {
        failures.push("document-inline-shape");
        break;
      }
      if (block.type === "code" && typeof block.text !== "string") {
        failures.push("document-code-shape");
        break;
      }
    }
  }
  return failures;
}

export function validateKnowledgeShard(shard, graph) {
  const failures = [];
  const { nodeIds, nodes, edges } = graphFacts(graph);
  const dossier = shard?.dossier;
  const document = shard?.document;
  if (shard?.schema !== "atlas.knowledge_shard.v1") failures.push("schema");
  if (typeof shard?.nodeId !== "string" || !nodeIds.has(shard.nodeId)) failures.push("node");
  if (dossier?.nodeId !== shard?.nodeId || document?.nodeId !== shard?.nodeId) {
    failures.push("node-binding");
  }
  if (typeof dossier?.title !== "string" || !dossier.title.trim()
    || typeof dossier?.domain !== "string" || !dossier.domain.trim()
    || typeof dossier?.kind !== "string" || !dossier.kind) {
    failures.push("dossier-identity");
  }
  const node = nodes.get(shard?.nodeId);
  if (!node
    || dossier?.title !== node.title
    || dossier?.domain !== node.domain
    || dossier?.kind !== node.kind
    || document?.title !== node.title) {
    failures.push("dossier-graph-identity");
  }
  const evidence = Array.isArray(dossier?.evidence) ? dossier.evidence : [];
  const evidenceIds = evidence.map((item) => item?.id).filter(Boolean);
  if (!uniqueValues(evidenceIds) || evidence.length > 12) failures.push("evidence-cardinality");
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const claims = [
    dossier?.readerSummary,
    ...(dossier?.keyInsights ?? []),
    dossier?.whyItMatters,
    ...(dossier?.caveats ?? []),
    ...(dossier?.openQuestions ?? []),
  ].filter(Boolean);
  if (!dossier?.readerSummary || !dossier?.whyItMatters
    || !Array.isArray(dossier?.keyInsights) || dossier.keyInsights.length > 5
    || !Array.isArray(dossier?.caveats) || dossier.caveats.length > 4
    || !Array.isArray(dossier?.openQuestions) || dossier.openQuestions.length > 4) {
    failures.push("claim-cardinality");
  }
  const claimIds = claims.map((claim) => claim?.id).filter(Boolean);
  if (!uniqueValues(claimIds)) failures.push("claim-ids");
  for (const claim of claims) {
    if (typeof claim?.text !== "string" || !claim.text.trim()
      || !["source_explicit", "atlas_builder_bounded"].includes(claim?.interpretation)
      || !Array.isArray(claim?.evidenceIds) || !claim.evidenceIds.length
      || claim.evidenceIds.some((id) => !evidenceById.has(id))) {
      failures.push("claim-evidence-binding");
      break;
    }
  }
  const sectionIds = new Set(document?.sections?.map((section) => section.id) ?? []);
  const blockIdsBySection = new Map((document?.sections ?? []).map((section) => [
    section.id,
    new Set(section.blocks.map((block) => block.id)),
  ]));
  for (const section of document?.sections ?? []) {
    for (const block of section.blocks ?? []) {
      const inlineGroups = block.type === "list"
        ? block.items
        : block.type === "table"
          ? block.rows?.flat()
          : ["paragraph", "blockquote", "callout"].includes(block.type)
            ? [block.inlines]
            : [];
      for (const inline of (Array.isArray(inlineGroups) ? inlineGroups : []).flat()) {
        if ((inline?.type === "atlas_link" && !nodeIds.has(inline.nodeId))
          || (inline?.type === "section_link" && !sectionIds.has(inline.sectionId))
          || (inline?.type === "private_target" && inline.label !== "비공개 대상")
          || (inline?.type === "text" && typeof inline.text !== "string")) {
          failures.push("reader-link-boundary");
          break;
        }
      }
    }
  }
  for (const item of evidence) {
    if (typeof item?.id !== "string" || !item.id
      || typeof item?.nodeId !== "string" || !nodeIds.has(item.nodeId)
      || typeof item?.sectionId !== "string"
      || typeof item?.blockId !== "string"
      || (item.nodeId === shard?.nodeId
        && (!sectionIds.has(item.sectionId)
          || !blockIdsBySection.get(item.sectionId)?.has(item.blockId)))
      || typeof item?.excerpt !== "string" || !item.excerpt.trim()) {
      failures.push("evidence-reader-binding");
      break;
    }
  }
  const relations = Array.isArray(dossier?.relationExplanations)
    ? dossier.relationExplanations
    : [];
  const relationIds = relations.map((relation) => relation?.id).filter(Boolean);
  if (!uniqueValues(relationIds)
    || relations.filter((relation) => relation.direction === "incoming").length > 6
    || relations.filter((relation) => relation.direction === "outgoing").length > 6) {
    failures.push("relation-cardinality");
  }
  for (const relation of relations) {
    const edge = edges.get(relation?.edgeId);
    const expectedDirection = edge?.sourceId === shard?.nodeId
      ? "outgoing"
      : edge?.targetId === shard?.nodeId
        ? "incoming"
        : null;
    if (!edge
      || relation.sourceNodeId !== edge.sourceId
      || relation.targetNodeId !== edge.targetId
      || relation.direction !== expectedDirection
      || relation.occurrences !== edge.occurrences
      || !["direct_context", "bounded_synthesis", "evidence_gap"].includes(relation.kind)
      || typeof relation.explanation !== "string" || !relation.explanation.trim()
      || !Array.isArray(relation.evidenceIds)
      || relation.evidenceIds.some((id) => !evidenceById.has(id))
      || (relation.kind !== "evidence_gap" && !relation.evidenceIds.length)) {
      failures.push("relation-evidence-binding");
      break;
    }
  }
  failures.push(...safeDocumentFailures(document));
  const publishedSectionIds = dossier?.sourceReader?.publishedSectionIds;
  if (dossier?.sourceReader?.documentId !== document?.id
    || !Array.isArray(publishedSectionIds)
    || !uniqueValues(publishedSectionIds)
    || publishedSectionIds.some((id) => !sectionIds.has(id))
    || publishedSectionIds.length !== sectionIds.size
    || dossier?.sourceReader?.omittedSectionCount !== document?.omittedSectionCount) {
    failures.push("source-reader-binding");
  }
  const manifest = shard?.manifest ?? {};
  if (manifest.claimCount !== claims.length
    || manifest.evidenceCount !== evidence.length
    || manifest.relationExplanationCount !== relations.length
    || manifest.publishedSectionCount !== sectionIds.size
    || manifest.omittedSectionCount !== document?.omittedSectionCount) {
    failures.push("manifest-counts");
  }
  return [...new Set(failures)];
}

async function inspectPair(dataRoot, jsonAbsolute, jsAbsolute, kind, scanPublic) {
  const findings = [];
  const jsonRelative = relativeArtifactPath(dataRoot, jsonAbsolute);
  const jsRelative = relativeArtifactPath(dataRoot, jsAbsolute);
  const [jsonText, jsText] = await Promise.all([
    readFile(jsonAbsolute, "utf8"),
    readFile(jsAbsolute, "utf8"),
  ]);
  const jsonDigest = sha256(jsonText);
  const jsDigest = sha256(jsText);
  const filenameStem = path.basename(jsonAbsolute, ".json");
  const stem = kind === "search" ? filenameStem.replace(/^search\./, "") : filenameStem;
  let parsedJson = null;
  let parsedWire = null;
  try {
    parsedJson = JSON.parse(jsonText);
  } catch (error) {
    findings.push(finding("knowledge-json-invalid", `data/${jsonRelative}`, {
      message: error instanceof Error ? error.message : String(error),
    }));
  }
  try {
    parsedWire = parseKnowledgeRegistration(jsText, kind);
  } catch (error) {
    findings.push(finding("knowledge-wrapper-invalid", `data/${jsRelative}`, {
      message: error instanceof Error ? error.message : String(error),
    }));
  }
  if (parsedWire?.jsonText !== jsonText) {
    findings.push(finding("knowledge-json-js-byte-mismatch", `data/${jsRelative}`));
  }
  if (parsedJson && parsedWire
    && JSON.stringify(parsedWire.wireValue) !== JSON.stringify(parsedJson)) {
    findings.push(finding("knowledge-json-js-value-mismatch", `data/${jsRelative}`));
  }
  if (!hashedStemPattern.test(stem) || !jsonDigest.startsWith(stem)) {
    findings.push(finding("knowledge-content-hash-filename", `data/${jsonRelative}`, {
      expectedPrefix: jsonDigest.slice(0, Math.max(16, Math.min(64, stem.length))),
      actual: stem,
    }));
  }
  if (scanPublic) {
    const publicText = parsedWire?.innerJsonText ?? jsonText;
    findings.push(
      ...scanPrivacyText(publicText, { path: `data/${jsonRelative}` }),
      ...scanOperatingExposure(publicText, { path: `data/${jsonRelative}` }),
    );
    if (containsInternalKnowledgeMarker(parsedWire?.value ?? parsedJson)) {
      findings.push(finding("knowledge-internal-numbering", `data/${jsonRelative}`));
    }
  }
  const bytes = Buffer.byteLength(jsonText);
  if (kind === "shard" && bytes > 180 * 1024) {
    findings.push(finding("knowledge-shard-size", `data/${jsonRelative}`, { bytes }));
  }
  if (kind === "search" && gzipSync(jsText, { level: 9 }).length > 800 * 1024) {
    findings.push(finding("knowledge-search-wrapper-size", `data/${jsRelative}`, {
      gzipBytes: gzipSync(jsText, { level: 9 }).length,
    }));
  }
  return {
    kind,
    jsonPath: jsonRelative,
    javascriptPath: jsRelative,
    jsonBytes: bytes,
    javascriptBytes: Buffer.byteLength(jsText),
    jsonSha256: jsonDigest,
    javascriptSha256: jsDigest,
    registryKey: parsedWire?.registryKey ?? null,
    value: parsedWire?.value ?? null,
    findings,
  };
}

export async function auditKnowledgeArtifacts(dataRoot, knowledge, {
  requireManifestBinding = true,
  scanPublic = true,
  graph = null,
} = {}) {
  const findings = [];
  const shardRoot = path.join(dataRoot, "knowledge-shards");
  let dataFiles = [];
  try {
    dataFiles = await regularFiles(dataRoot);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const shardJsonFiles = dataFiles.filter((absolute) => (
    absolute.startsWith(`${shardRoot}${path.sep}`)
    && absolute.endsWith(".json")
  ));
  const shardPairs = [];
  for (const jsonAbsolute of shardJsonFiles) {
    const jsAbsolute = jsonAbsolute.replace(/\.json$/, ".js");
    try {
      const stats = await stat(jsAbsolute);
      if (!stats.isFile()) throw new Error("not-file");
      shardPairs.push(await inspectPair(dataRoot, jsonAbsolute, jsAbsolute, "shard", scanPublic));
    } catch (error) {
      findings.push(finding(
        "knowledge-shard-wrapper-missing",
        `data/${relativeArtifactPath(dataRoot, jsAbsolute)}`,
      ));
    }
  }
  const orphanShardJs = dataFiles.filter((absolute) => (
    absolute.startsWith(`${shardRoot}${path.sep}`)
    && absolute.endsWith(".js")
    && !shardJsonFiles.includes(absolute.replace(/\.js$/, ".json"))
  ));
  for (const absolute of orphanShardJs) {
    findings.push(finding("knowledge-shard-json-missing", `data/${relativeArtifactPath(dataRoot, absolute)}`));
  }

  const searchJsonFiles = dataFiles.filter((absolute) => (
    path.dirname(absolute) === dataRoot
    && /^search\.[a-f0-9]{16,64}\.json$/.test(path.basename(absolute))
  ));
  const searchPairs = [];
  for (const jsonAbsolute of searchJsonFiles) {
    const jsAbsolute = jsonAbsolute.replace(/\.json$/, ".js");
    try {
      const stats = await stat(jsAbsolute);
      if (!stats.isFile()) throw new Error("not-file");
      searchPairs.push(await inspectPair(dataRoot, jsonAbsolute, jsAbsolute, "search", scanPublic));
    } catch (error) {
      findings.push(finding(
        "knowledge-search-wrapper-missing",
        `data/${relativeArtifactPath(dataRoot, jsAbsolute)}`,
      ));
    }
  }
  if (searchPairs.length !== 1) {
    findings.push(finding("knowledge-search-count", "data", { actual: searchPairs.length, expected: 1 }));
  }

  if (requireManifestBinding) {
    const shardRows = manifestDigestRows(knowledge);
    const pairByJsonPath = new Map(shardPairs.map((pair) => [pair.jsonPath, pair]));
    for (const row of shardRows) {
      const jsonPath = canonicalArtifactPath(pathFromManifest(row, "json"));
      const javascriptPath = canonicalArtifactPath(pathFromManifest(row, "javascript"));
      const pair = jsonPath ? pairByJsonPath.get(jsonPath) : null;
      if (!pair
        || pair.javascriptPath !== javascriptPath
        || pair.jsonSha256 !== digestFromManifest(row, "json")
        || pair.javascriptSha256 !== digestFromManifest(row, "javascript")) {
        findings.push(finding("knowledge-shard-manifest-binding", `data/${jsonPath ?? "unknown"}`));
      }
    }
    if (shardRows.length !== shardPairs.length) {
      findings.push(finding("knowledge-shard-manifest-count", "data/knowledge.json", {
        manifest: shardRows.length,
        files: shardPairs.length,
      }));
    }
    const searchRow = manifestSearchDigest(knowledge);
    const searchPair = searchPairs[0];
    if (!searchRow || !searchPair) {
      findings.push(finding("knowledge-search-manifest-binding", "data/knowledge.json"));
    } else {
      const jsonPath = canonicalArtifactPath(pathFromManifest(searchRow, "json"));
      const javascriptPath = canonicalArtifactPath(pathFromManifest(searchRow, "javascript"));
      if (jsonPath !== searchPair.jsonPath
        || javascriptPath !== searchPair.javascriptPath
        || digestFromManifest(searchRow, "json") !== searchPair.jsonSha256
        || digestFromManifest(searchRow, "javascript") !== searchPair.javascriptSha256) {
        findings.push(finding("knowledge-search-manifest-binding", "data/knowledge.json"));
      }
    }
  }
  findings.push(...shardPairs.flatMap((pair) => pair.findings));
  findings.push(...searchPairs.flatMap((pair) => pair.findings));
  if (graph) {
    const shardByNodeId = new Map(shardPairs.map((pair) => [pair.value?.nodeId, pair.value]));
    for (const pair of shardPairs) {
      for (const evidence of pair.value?.dossier?.evidence ?? []) {
        const sourceShard = shardByNodeId.get(evidence?.nodeId);
        const sourceSection = sourceShard?.document?.sections
          ?.find((section) => section.id === evidence?.sectionId);
        if (!sourceSection?.blocks?.some((block) => block.id === evidence?.blockId)) {
          findings.push(finding("knowledge-cross-shard-evidence-binding", `data/${pair.jsonPath}`, {
            evidenceId: evidence?.id ?? null,
            sourceNodeId: evidence?.nodeId ?? null,
          }));
          break;
        }
      }
    }
    for (const pair of shardPairs) {
      for (const failure of validateKnowledgeShard(pair.value, graph)) {
        findings.push(finding(`knowledge-shard-${failure}`, `data/${pair.jsonPath}`));
      }
    }
    const search = searchPairs[0]?.value;
    const searchEntries = Array.isArray(search?.entries) ? search.entries : [];
    const searchStrings = Array.isArray(search?.strings) ? search.strings : [];
    const searchTerms = Array.isArray(search?.terms) ? search.terms : [];
    if (search?.schema !== "atlas.knowledge_search.v2"
      || search?.encoding !== "string_table_delta_postings_v1"
      || search?.manifest?.entryCount !== searchEntries.length
      || search?.manifest?.termCount !== searchTerms.length
      || !digestPattern.test(String(search?.manifest?.projectionDigest ?? ""))) {
      findings.push(finding("knowledge-search-shape", `data/${searchPairs[0]?.jsonPath ?? "search"}`));
    }
    const { nodeIds } = graphFacts(graph);
    for (const entry of searchEntries) {
      const kind = searchStrings[entry?.[0]];
      const nodeId = searchStrings[entry?.[1]];
      const label = searchStrings[entry?.[3]];
      const fromNodeId = searchStrings[entry?.[5]];
      const toNodeId = searchStrings[entry?.[6]];
      if (!Array.isArray(entry)
        || entry.length !== 7
        || !["knowledge", "insight", "source_section", "relationship", "operating_role"].includes(kind)
        || typeof label !== "string" || !label.trim()
        || (nodeId && !nodeIds.has(nodeId))
        || (fromNodeId && !nodeIds.has(fromNodeId))
        || (toNodeId && !nodeIds.has(toNodeId))) {
        findings.push(finding("knowledge-search-entry", `data/${searchPairs[0]?.jsonPath ?? "search"}`));
        break;
      }
    }
    for (const term of searchTerms) {
      if (!Array.isArray(term)
        || typeof searchStrings[term?.[0]] !== "string"
        || !searchStrings[term?.[0]]
        || !Array.isArray(term?.[1])
        || term[1].some((delta) => !Number.isInteger(delta) || delta < 0)
        || term[1].reduce((index, delta) => index + delta, 0) >= searchEntries.length) {
        findings.push(finding("knowledge-search-term", `data/${searchPairs[0]?.jsonPath ?? "search"}`));
        break;
      }
    }
    const totals = shardPairs.reduce((current, pair) => {
      const manifest = pair.value?.manifest ?? {};
      return {
        claims: current.claims + (manifest.claimCount ?? 0),
        evidence: current.evidence + (manifest.evidenceCount ?? 0),
        relations: current.relations + (manifest.relationExplanationCount ?? 0),
        published: current.published + (manifest.publishedSectionCount ?? 0),
        omitted: current.omitted + (manifest.omittedSectionCount ?? 0),
      };
    }, {
      claims: 0,
      evidence: 0,
      relations: 0,
      published: 0,
      omitted: 0,
    });
    if (totals.claims !== knowledge?.manifest?.claimCount
      || totals.evidence !== knowledge?.manifest?.evidenceCount
      || totals.relations !== knowledge?.manifest?.relationExplanationCount
      || totals.published !== knowledge?.manifest?.publishedSectionCount
      || totals.omitted !== knowledge?.manifest?.omittedSectionCount) {
      findings.push(finding("knowledge-manifest-shard-reconciliation", "data/knowledge.json"));
    }
  }
  return {
    shardPairs,
    searchPairs,
    findings,
    pass: findings.length === 0,
  };
}

export function validatePublicationV3(publication, packs, {
  gate1 = false,
  reviewCandidate = false,
} = {}) {
  const failures = [];
  if (publication?.schema !== "atlas.publication.v3") failures.push("schema");
  if (publication?.profile !== "public" && publication?.profile !== "owner") failures.push("profile");
  if (publication?.graphSchema !== "atlas.graph.v2") failures.push("graph-schema");
  if (publication?.publicationPolicy !== "atlas.publication_policy.v3") failures.push("publication-policy");
  const expectedPackNames = ["agency", "graph", "inventory", "meaning", "knowledge"];
  for (const name of expectedPackNames) {
    if (!digestPattern.test(String(publication?.packDigests?.[name] ?? ""))) {
      failures.push(`pack-digest-${name}`);
    }
  }
  const knowledgeShardDigests = manifestDigestRows(packs?.knowledge).map((row) => ({
    nodeId: row.nodeId,
    jsonSha256: digestFromManifest(row, "json"),
    javascriptSha256: digestFromManifest(row, "javascript"),
  }));
  if (JSON.stringify(publication?.knowledgeShardDigests ?? []) !== JSON.stringify(knowledgeShardDigests)) {
    failures.push("knowledge-shard-digests");
  }
  const knowledgeSearch = manifestSearchDigest(packs?.knowledge);
  const expectedSearchDigest = knowledgeSearch
    ? {
        jsonSha256: digestFromManifest(knowledgeSearch, "json"),
        javascriptSha256: digestFromManifest(knowledgeSearch, "javascript"),
      }
    : null;
  if (JSON.stringify(publication?.searchDigest ?? null) !== JSON.stringify(expectedSearchDigest)) {
    failures.push("knowledge-search-digest");
  }
  const blockers = Array.isArray(publication?.blockers) ? publication.blockers : [];
  if (gate1) {
    if (publication?.releaseEligible !== false) failures.push("gate1-release-eligible");
    if (!blockers.includes("gate1_vertical_slice_not_full_coverage")) failures.push("gate1-blocker");
  } else if (reviewCandidate) {
    if (publication?.releaseEligible !== false) failures.push("review-candidate-release-eligible");
    if (blockers.length !== 1
      || blockers[0] !== "gate2_review_candidate_not_release_eligible") {
      failures.push("review-candidate-blocker");
    }
  } else {
    if (publication?.releaseEligible !== true) failures.push("release-eligible");
    if (blockers.length) failures.push("blockers");
  }
  if (packs?.knowledge?.releaseEligible !== publication?.releaseEligible) {
    failures.push("knowledge-release-eligibility");
  }
  return failures;
}
