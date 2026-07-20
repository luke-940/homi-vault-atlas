import { createHash } from "node:crypto";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicPackArtifacts } from "./lib/public-data-wire.mjs";
import { computePublicSnapshotDigest } from "./lib/public-snapshot-digest.mjs";
import {
  aggregateLinkMetrics,
  assertOwnerPublicSeparation,
  assertPublicProjectionBoundary,
  buildLinkAnalysis,
  buildResolvedLinkEdges,
  cacheVerifiedWitnessBytes,
  extractWikilinkTargets,
  parseFrontmatterScalarMap,
  privacySafeDigestToken,
  reconcileInventory,
  semanticDateForDocument,
  stableDigest,
  structureKindForDocument,
} from "./lib/v7-4-profile-contract.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatedRoot = path.join(projectDir, ".generated");
const ownerRoot = path.join(generatedRoot, "owner");
const publicRoot = path.join(generatedRoot, "public");
const publicDataRoot = path.join(publicRoot, "data");
const publicSafeDataRoot = path.join(projectDir, "public-safe", "data");
const captureDir = path.resolve(
  process.env.ATLAS_V7_4_CAPTURE_DIR
    ?? path.join(generatedRoot, "capture"),
);
const capturePath = path.join(captureDir, "canonical-capture-manifest.json");
const allowlistPath = path.join(projectDir, "public-safe", "public-title-allowlist.v1.json");
const promotePublicSafe = process.argv.includes("--promote-public-safe");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const packNames = [
  "agency",
  "bootstrap",
  "inventory",
  "structure",
  "relation",
  "flow",
  "temporal",
  "entity",
  "health",
  "insight",
  "publication",
];

const captureText = await readFile(capturePath, "utf8");
const capture = JSON.parse(captureText);
if (capture.schema !== "atlas.canonical_capture.v1" || capture.pass !== true || capture.tornRead !== false) {
  throw new Error("Profile build blocked: canonical capture is missing or torn.");
}
const allowlist = JSON.parse(await readFile(allowlistPath, "utf8"));
if (allowlist.schema !== "public-title-allowlist.v1"
  || allowlist.mode !== "safe_hybrid"
  || !Array.isArray(allowlist.titles)
  || !Array.isArray(allowlist.aliases)) {
  throw new Error("Profile build blocked: public title allowlist is invalid.");
}
if (new Set(allowlist.titles).size !== allowlist.titles.length
  || new Set(allowlist.aliases.map((item) => item.id)).size !== allowlist.aliases.length) {
  throw new Error("Profile build blocked: public title allowlist contains duplicate entries.");
}

const records = [];
for (const file of capture.vault.files) {
  const absolute = path.join(capture.sourceBoundary.vaultRoot, file.relativePath);
  const body = await readFile(absolute);
  if (body.length !== file.bytes || sha256(body) !== file.sha256) {
    throw new Error(`Profile build blocked: canonical source drift at ${file.relativePath}.`);
  }
  const markdown = body.toString("utf8");
  const frontmatter = parseFrontmatterScalarMap(markdown);
  records.push({
    relativePath: file.relativePath,
    title: path.posix.basename(file.relativePath, ".md"),
    bytes: file.bytes,
    sha256: file.sha256,
    frontmatter,
    meaningfulDate: semanticDateForDocument(file.relativePath, frontmatter),
    wikilinks: extractWikilinkTargets(markdown),
    wordCount: markdown.split(/\s+/).filter(Boolean).length,
  });
}
if (records.length !== capture.vault.markdownCount) {
  throw new Error("Profile build blocked: captured Markdown inventory count changed.");
}
const verifiedWitnessBytes = await cacheVerifiedWitnessBytes(
  [capture.memoryEngine, ...capture.controlPlaneLedger],
  (sourcePath) => readFile(sourcePath),
);

const generatedAt = capture.capturedAt;
const ownerReconciliation = reconcileInventory(records, "atlas-owner", allowlist, { generatedAt });
const publicReconciliation = reconcileInventory(records, "atlas-public", allowlist, {
  generatedAt,
  labels: allowlist.districtLabels,
});
const linkAnalysis = buildLinkAnalysis(records);
const resolvedLinkEdges = buildResolvedLinkEdges(records);
const resolvedNeighborWeights = new Map();
for (const edge of resolvedLinkEdges) {
  for (const [sourcePath, targetPath] of [
    [edge.sourcePath, edge.targetPath],
    [edge.targetPath, edge.sourcePath],
  ]) {
    const neighbors = resolvedNeighborWeights.get(sourcePath) ?? new Map();
    neighbors.set(targetPath, (neighbors.get(targetPath) ?? 0) + edge.occurrences);
    resolvedNeighborWeights.set(sourcePath, neighbors);
  }
}

function strongestConnectedRecord(sourcePath, candidates) {
  const weights = resolvedNeighborWeights.get(sourcePath) ?? new Map();
  return [...candidates]
    .map((candidate) => ({ candidate, weight: weights.get(candidate.relativePath) ?? 0 }))
    .filter((item) => item.weight > 0)
    .sort((left, right) => right.weight - left.weight
      || compareText(left.candidate.relativePath, right.candidate.relativePath))[0]?.candidate ?? null;
}

function maximumMeaningfulDate(members) {
  return members.map((record) => record.meaningfulDate).filter(Boolean).sort(compareText).at(-1) ?? null;
}

function districtId(profile, label) {
  const digestKey = profile === "atlas-owner"
    ? stableDigest(label).slice(0, 18)
    : privacySafeDigestToken(label);
  return `district:${profile === "atlas-owner" ? "owner" : "pub"}:${digestKey}`;
}

function hierarchyToken(label) {
  return label.normalize("NFC").toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function refreshPublicEntityPack(legacyEntity) {
  const representedByDistrict = new Map(publicReconciliation.inventory.coverage.map((coverage) => [
    coverage.label,
    coverage.named + coverage.aggregate,
  ]));
  return {
    ...legacyEntity,
    entities: legacyEntity.entities.map((entity) => entity.surfaceRole === "reference"
      ? entity
      : {
          ...entity,
          documentCount: representedByDistrict.get(entity.district) ?? entity.documentCount ?? 0,
        }),
  };
}

function refreshPublicLegacyStructure(legacyStructure, entityPack) {
  const representedByDistrict = new Map(publicReconciliation.inventory.coverage.map((coverage) => [
    coverage.label,
    coverage.named + coverage.aggregate,
  ]));
  const existingDistricts = new Map(legacyStructure.districts.map((district) => [district.name, district]));
  const entitiesByDistrict = new Map();
  for (const entity of entityPack.entities) {
    const entities = entitiesByDistrict.get(entity.district) ?? [];
    entities.push(entity);
    entitiesByDistrict.set(entity.district, entities);
  }
  const existingHierarchyById = new Map(legacyStructure.hierarchyNodes.map((node) => [node.id, node]));
  const districts = publicReconciliation.inventory.coverage.map((coverage) => {
    const previous = existingDistricts.get(coverage.label);
    return {
      id: previous?.id ?? `district:${hierarchyToken(coverage.label)}`,
      name: coverage.label,
      documentCount: representedByDistrict.get(coverage.label) ?? 0,
      wordCount: 0,
      typedRelations: 0,
      currentDocuments: 0,
      authorityL1L2: 0,
      topEntities: (entitiesByDistrict.get(coverage.label) ?? []).map((entity) => entity.id),
    };
  });
  const representedTotal = districts.reduce((sum, district) => sum + district.documentCount, 0);
  const rootId = legacyStructure.rootId;
  const root = {
    ...(existingHierarchyById.get(rootId) ?? {
      id: rootId,
      path: "public",
      label: "Homi Vault 공개 지도",
      parentId: null,
      depth: 0,
      kind: "vault",
      authorityL1L2: 0,
    }),
    value: representedTotal,
    childrenCount: districts.length,
    documentCount: representedTotal,
  };
  const hierarchyNodes = [root];
  for (const district of districts) {
    const hierarchySlug = hierarchyToken(district.name);
    const hierarchyDistrictId = `tax:pub:district:${hierarchySlug}`;
    const entities = entitiesByDistrict.get(district.name) ?? [];
    const groups = new Map();
    for (const entity of entities) {
      const group = groups.get(entity.parentId) ?? [];
      group.push(entity);
      groups.set(entity.parentId, group);
    }
    if (!groups.size) groups.set(`tax:pub:group:${hierarchySlug}:coverage`, []);
    hierarchyNodes.push({
      id: hierarchyDistrictId,
      path: `public/${hierarchySlug}`,
      label: district.name,
      parentId: rootId,
      depth: 1,
      kind: "district",
      value: district.documentCount,
      childrenCount: groups.size,
      documentCount: district.documentCount,
      authorityL1L2: 0,
    });
    for (const [groupId, groupEntities] of groups) {
      const groupCount = groupEntities.length
        ? groupEntities.reduce((sum, entity) => sum + (entity.documentCount ?? 0), 0)
        : district.documentCount;
      const previousGroup = existingHierarchyById.get(groupId);
      hierarchyNodes.push({
        ...(previousGroup ?? {
          id: groupId,
          path: `public/${hierarchySlug}/coverage`,
          label: `${district.name} 공개 집계`,
          depth: 2,
          kind: "folder",
          authorityL1L2: 0,
        }),
        parentId: hierarchyDistrictId,
        value: groupCount,
        childrenCount: groupEntities.length,
        documentCount: groupCount,
      });
      for (const entity of groupEntities) {
        const previousDocument = existingHierarchyById.get(entity.id);
        hierarchyNodes.push({
          ...(previousDocument ?? {
            id: entity.id,
            path: entity.path,
            label: entity.displayLabel,
            depth: 3,
            kind: "document",
            authority: entity.authority,
            currentness: entity.currentness,
            surfaceRole: entity.surfaceRole,
            authorityL1L2: 0,
          }),
          parentId: groupId,
          value: entity.documentCount ?? 0,
          childrenCount: 0,
          documentCount: entity.documentCount ?? 0,
        });
      }
    }
  }
  return {
    ...legacyStructure,
    districts,
    hierarchyNodes,
  };
}

function buildFreshPublicRelation(legacyRelation, representedStructure) {
  const districtLabels = publicReconciliation.inventory.coverage.map((coverage) => coverage.label);
  const districtOrder = [
    ...legacyRelation.districtOrder.filter((label) => districtLabels.includes(label)),
    ...districtLabels.filter((label) => !legacyRelation.districtOrder.includes(label)).sort(compareText),
  ];
  const districtIndex = new Map(districtOrder.map((label, index) => [label, index]));
  const structureNodeById = new Map(representedStructure.nodes.map((node) => [node.id, node]));
  const districtLabelById = new Map(representedStructure.nodes
    .filter((node) => node.kind === "district")
    .map((node) => [node.id, allowlist.districtLabels[node.label] ?? node.label]));
  const pairMap = new Map();
  let intraDistrict = 0;
  for (const edge of representedStructure.associations.filter((association) => association.kind === "references")) {
    const sourceNode = structureNodeById.get(edge.source);
    const targetNode = structureNodeById.get(edge.target);
    const sourceLabel = districtLabelById.get(sourceNode?.districtId);
    const targetLabel = districtLabelById.get(targetNode?.districtId);
    if (!sourceLabel || !targetLabel) {
      throw new Error(`Relation projection blocked: reference ${edge.id} has no district.`);
    }
    if (sourceLabel === targetLabel) {
      intraDistrict += edge.weight;
      continue;
    }
    const sourceFirst = (districtIndex.get(sourceLabel) ?? Number.MAX_SAFE_INTEGER)
      < (districtIndex.get(targetLabel) ?? Number.MAX_SAFE_INTEGER);
    const pairSource = sourceFirst ? sourceLabel : targetLabel;
    const pairTarget = sourceFirst ? targetLabel : sourceLabel;
    const key = `${pairSource}\u0000${pairTarget}`;
    const pair = pairMap.get(key) ?? {
      id: `pair:${encodeURIComponent(pairSource)}:${encodeURIComponent(pairTarget)}`,
      source: pairSource,
      target: pairTarget,
      wikilink: 0,
      wikilinkForward: 0,
      wikilinkReverse: 0,
      typed: 0,
      typedForward: 0,
      typedReverse: 0,
      route: 0,
      total: 0,
    };
    pair.wikilink += edge.weight;
    if (sourceLabel === pairSource) pair.wikilinkForward += edge.weight;
    else pair.wikilinkReverse += edge.weight;
    pair.total = pair.wikilink;
    pairMap.set(key, pair);
  }
  const matrix = [...pairMap.values()].sort((left, right) =>
    (districtIndex.get(left.source) ?? 0) - (districtIndex.get(right.source) ?? 0)
    || (districtIndex.get(left.target) ?? 0) - (districtIndex.get(right.target) ?? 0));
  const interDistrict = matrix.reduce((sum, pair) => sum + pair.wikilink, 0);

  const unresolvedLinks = {};
  const unresolvedLinkTotal = 0;
  const resolvedLinkWeight = interDistrict + intraDistrict;
  return {
    districtOrder,
    matrix,
    typedRelations: [],
    routeCoMembership: [],
    neighborhoods: {},
    layerDefinitions: [
      {
        id: "wikilink",
        label: "링크 출현 횟수",
        meaning: "fresh release capture에서 유일하게 해결된 Markdown wikilink occurrence. 고유 문서쌍과 구분한다.",
        unit: "resolved_link_occurrence",
      },
      { id: "typed", label: "명시 관계", meaning: "공개 승인된 명시 관계", unit: "typed_relation" },
      { id: "route", label: "작업 경로 렌즈", meaning: "공개 승인된 경로 공동 소속", unit: "curated_cross_district_route_pair" },
    ],
    availableLayers: ["wikilink"],
    redactedLayers: ["typed", "route"],
    coverage: {
      resolvedLinkPairs: matrix.length,
      resolvedLinkWeight,
      unresolvedLinks,
      unresolvedLinkTotal,
      ambiguousLinks: 0,
      typedRelations: 0,
      layers: {
        wikilink: {
          unit: "resolved_link_occurrence",
          total: resolvedLinkWeight,
          interDistrict,
          intraDistrict,
          displayed: interDistrict,
          reconciled: true,
          boundary: "fresh capture에서 유일하게 해결된 represented hub 사이의 wikilink occurrence 집계",
        },
        typed: {
          unit: "typed_relation",
          total: 0,
          interDistrict: 0,
          intraDistrict: 0,
          displayed: 0,
          reconciled: true,
          boundary: "내부 방향성 관계 증거는 공개판에서 제외",
        },
        route: {
          unit: "curated_cross_district_route_pair",
          total: 0,
          interDistrict: 0,
          intraDistrict: 0,
          displayed: 0,
          reconciled: true,
          boundary: "내부 route membership은 공개판에서 제외",
        },
      },
      boundary: "공개판은 represented hub 사이에서 유일하게 해결된 fresh wikilink만 구역 단위로 보여주며 미해결 후보는 투영 전에 제외한다.",
    },
  };
}

function ownerStructure(legacyStructure) {
  const nodes = [];
  const associations = [];
  const nodeByPath = new Map();
  const recordNodes = [];
  const districtByTopLevel = new Map();
  for (const coverage of ownerReconciliation.inventory.coverage) {
    const topLevel = ownerReconciliation.classified.find(
      (record) => (record.relativePath.split("/")[0]) === coverage.label,
    )?.relativePath.split("/")[0] ?? coverage.label;
    const members = ownerReconciliation.classified.filter(
      (record) => record.relativePath.split("/")[0] === topLevel
        && record.classification.disposition !== "excluded",
    );
    const id = districtId("atlas-owner", topLevel);
    nodes.push({
      id,
      kind: "district",
      label: topLevel,
      parentId: null,
      districtId: id,
      documentCount: members.length,
      ...aggregateLinkMetrics(members.map((record) => record.relativePath), linkAnalysis),
      lastMeaningfulDate: maximumMeaningfulDate(members),
      nameMode: "owner_name",
    });
    districtByTopLevel.set(topLevel, id);
    for (const record of members) {
      const nodeId = `node:owner:${stableDigest(record.relativePath).slice(0, 18)}`;
      const metric = linkAnalysis.get(record.relativePath);
      const kind = structureKindForDocument(record.relativePath, record.frontmatter);
      const label = record.title === "_Index" && kind === "project_stage"
        ? path.posix.dirname(record.relativePath).split("/").join(" › ")
        : record.title === "_Index" && kind === "project"
          ? topLevel
          : record.title;
      const node = {
        id: nodeId,
        kind,
        label,
        parentId: null,
        districtId: id,
        documentCount: 1,
        uniqueInboundDocuments: metric?.uniqueInboundDocuments ?? 0,
        inboundLinkOccurrences: metric?.inboundLinkOccurrences ?? 0,
        lastMeaningfulDate: record.meaningfulDate,
        nameMode: "owner_name",
      };
      const item = { id: nodeId, kind, record, node, topLevel };
      nodeByPath.set(record.relativePath, item);
      recordNodes.push(item);
    }
  }

  const projectRootByTopLevel = new Map();
  for (const topLevel of districtByTopLevel.keys()) {
    const projectRecords = recordNodes
      .filter((item) => item.topLevel === topLevel && item.kind === "project")
      .sort((left, right) => {
        const rank = (item) => /control tower/i.test(item.record.title) ? 0
          : item.record.title === "_Index" ? 1
            : item.record.relativePath.split("/").length;
        return rank(left) - rank(right) || compareText(left.record.relativePath, right.record.relativePath);
      });
    if (projectRecords[0]) projectRootByTopLevel.set(topLevel, projectRecords[0]);
  }
  const paperCatalogRoot = recordNodes
    .filter((item) => item.topLevel === "Papers" && item.kind === "paper_gateway")
    .sort((left, right) => {
      const rank = (item) => item.record.title === "Papers" ? 0
        : item.record.relativePath.includes("/Paper Atlas/") ? 1 : 2;
      return rank(left) - rank(right) || compareText(left.record.relativePath, right.record.relativePath);
    })[0] ?? null;
  const projectCatalogByDirectory = new Map(
    recordNodes
      .filter((item) => /^(?:Rocket|Groot|Intelligence Layer)$/.test(item.topLevel)
        && item.record.title === "_Index")
      .map((item) => [path.posix.dirname(item.record.relativePath), item]),
  );
  const closestProjectCatalog = (item) => {
    let directory = path.posix.dirname(item.record.relativePath);
    while (directory && directory !== ".") {
      const candidate = projectCatalogByDirectory.get(directory);
      if (candidate && candidate.id !== item.id) return candidate;
      const parent = path.posix.dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
    return null;
  };
  const aggregateHubByTopLevel = new Map();
  const ensureAggregateHub = (topLevel) => {
    const existing = aggregateHubByTopLevel.get(topLevel);
    if (existing) return existing;
    const district = districtByTopLevel.get(topLevel);
    if (!district) throw new Error(`Owner structure blocked: district missing for ${topLevel}.`);
    const id = `hub:owner:${stableDigest(`aggregate-boundary:${topLevel}`).slice(0, 18)}`;
    const hub = {
      id,
      kind: "aggregate_boundary",
      label: `${topLevel} · 집계 경계`,
      parentId: district,
      districtId: district,
      documentCount: 0,
      uniqueInboundDocuments: 0,
      inboundLinkOccurrences: 0,
      lastMeaningfulDate: null,
      nameMode: "aggregate",
    };
    nodes.push(hub);
    associations.push({
      id: `association:owner:${stableDigest(`member:${id}:${district}`).slice(0, 18)}`,
      source: id,
      target: district,
      kind: "member_of",
      weight: 0,
    });
    aggregateHubByTopLevel.set(topLevel, hub);
    return hub;
  };
  const parentHubKinds = new Set([
    "moc_hub",
    "paper_gateway",
    "strategy_insight",
    "strategy_request",
    "project",
    "signal_domain",
  ]);
  for (const item of recordNodes) {
    let parentId = districtByTopLevel.get(item.topLevel);
    const projectRoot = projectRootByTopLevel.get(item.topLevel);
    if (/^(?:Rocket|Groot|Intelligence Layer)$/.test(item.topLevel)) {
      if (item.kind === "project" && projectRoot && item.id !== projectRoot.id) {
        parentId = projectRoot.id;
      } else if (item.id !== projectRoot?.id) {
        parentId = closestProjectCatalog(item)?.id ?? projectRoot?.id ?? ensureAggregateHub(item.topLevel).id;
      }
    } else if (item.kind === "paper_gateway" && paperCatalogRoot && item.id !== paperCatalogRoot.id) {
      parentId = paperCatalogRoot.id;
    } else if (item.kind === "signal_storyline") {
      const candidates = recordNodes.filter((candidate) =>
        candidate.topLevel === item.topLevel && candidate.kind === "signal_domain");
      const connectedDomain = strongestConnectedRecord(
        item.record.relativePath,
        candidates.map((candidate) => candidate.record),
      );
      parentId = connectedDomain
        ? nodeByPath.get(connectedDomain.relativePath)?.id ?? ensureAggregateHub(item.topLevel).id
        : ensureAggregateHub(item.topLevel).id;
    } else if (item.kind === "source_document") {
      const candidates = recordNodes.filter((candidate) => candidate.topLevel === item.topLevel
        && parentHubKinds.has(candidate.kind));
      const connectedHub = strongestConnectedRecord(item.record.relativePath, candidates.map((candidate) => candidate.record));
      parentId = connectedHub
        ? nodeByPath.get(connectedHub.relativePath)?.id ?? ensureAggregateHub(item.topLevel).id
        : ensureAggregateHub(item.topLevel).id;
    }
    if (!parentId) throw new Error(`Owner structure blocked: no primary parent for ${item.record.relativePath}.`);
    item.node.parentId = parentId;
    nodes.push(item.node);
    associations.push({
      id: `association:owner:${stableDigest(`member:${item.id}:${parentId}`).slice(0, 18)}`,
      source: item.id,
      target: parentId,
      kind: "member_of",
      weight: 1,
    });
  }

  const paperMembershipWeights = new Map();
  for (const edge of resolvedLinkEdges) {
    const source = nodeByPath.get(edge.sourcePath);
    const target = nodeByPath.get(edge.targetPath);
    if (!source || !target) continue;
    if (source.topLevel === "Papers" && target.topLevel === "Papers") {
      const document = source.kind === "source_document" && target.kind === "paper_gateway" ? source
        : target.kind === "source_document" && source.kind === "paper_gateway" ? target
          : null;
      const gateway = source.kind === "paper_gateway" ? source
        : target.kind === "paper_gateway" ? target
          : null;
      if (document && gateway) {
        const key = `${document.id}:${gateway.id}`;
        const membership = paperMembershipWeights.get(key) ?? {
          documentId: document.id,
          gatewayId: gateway.id,
          weight: 0,
        };
        membership.weight += edge.occurrences;
        paperMembershipWeights.set(key, membership);
      }
    }
    if (source.kind === "source_document" || target.kind === "source_document") continue;
    associations.push({
      id: `association:owner:${stableDigest(`references:${source.id}:${target.id}`).slice(0, 18)}`,
      source: source.id,
      target: target.id,
      kind: "references",
      weight: edge.occurrences,
    });
  }
  for (const membership of [...paperMembershipWeights.values()]
    .sort((left, right) => compareText(`${left.documentId}:${left.gatewayId}`, `${right.documentId}:${right.gatewayId}`))) {
    associations.push({
      id: `association:owner:${stableDigest(`paper-membership:${membership.documentId}:${membership.gatewayId}`).slice(0, 18)}`,
      source: membership.documentId,
      target: membership.gatewayId,
      kind: "associated_with",
      weight: membership.weight,
    });
  }
  return {
    ...legacyStructure,
    schema: "atlas.structure.v2",
    profile: "atlas-owner",
    generatedAt,
    nodes,
    associations,
    measurement: {
      gravityMetric: "uniqueInboundDocuments",
      occurrenceMetric: "inboundLinkOccurrences",
      freshnessSource: "semantic_date_only",
    },
  };
}

function paperDimensionForOwnerStructure(structure) {
  const paperDistrict = structure.nodes.find((node) => node.kind === "district" && node.label === "Papers");
  if (!paperDistrict) throw new Error("Paper dimension blocked: Papers district is missing.");
  const sourceDocuments = structure.nodes.filter((node) =>
    node.districtId === paperDistrict.id && node.kind === "source_document");
  const gateways = structure.nodes.filter((node) =>
    node.districtId === paperDistrict.id && node.kind === "paper_gateway");
  const catalogGateways = gateways.filter((node) => node.parentId === paperDistrict.id);
  const categoryGateways = gateways.filter((node) => node.parentId !== paperDistrict.id);
  const sourceIds = new Set(sourceDocuments.map((node) => node.id));
  const gatewayIds = new Set(gateways.map((node) => node.id));
  const memberships = structure.associations.filter((edge) =>
    edge.kind === "associated_with" && sourceIds.has(edge.source) && gatewayIds.has(edge.target));
  const gatewaysByDocument = new Map(sourceDocuments.map((node) => [node.id, new Set()]));
  for (const edge of memberships) gatewaysByDocument.get(edge.source)?.add(edge.target);
  const associatedSourceDocuments = [...gatewaysByDocument.values()].filter((items) => items.size > 0).length;
  const multiGatewaySourceDocuments = [...gatewaysByDocument.values()].filter((items) => items.size > 1).length;
  const usedGatewayIds = new Set(memberships.map((edge) => edge.target));
  const categoryGatewayIds = new Set(categoryGateways.map((node) => node.id));
  return {
    sourceDocuments: sourceDocuments.length,
    gatewayDocuments: gateways.length,
    catalogGatewayDocuments: catalogGateways.length,
    categoryGatewayDocuments: categoryGateways.length,
    categoryGatewaysWithAssociations: [...usedGatewayIds].filter((id) => categoryGatewayIds.has(id)).length,
    associationEdges: memberships.length,
    associationOccurrences: memberships.reduce((sum, edge) => sum + edge.weight, 0),
    associatedSourceDocuments,
    multiGatewaySourceDocuments,
    unassociatedSourceDocuments: sourceDocuments.length - associatedSourceDocuments,
    derivedFromFreshCapture: true,
    hardcodedHistoricalCounts: false,
  };
}

function assertSourceHubAncestry(structure) {
  const nodeById = new Map(structure.nodes.map((node) => [node.id, node]));
  const sourceKinds = new Set(["source_document", "project_stage", "signal_storyline", "aggregate_boundary"]);
  const hubKinds = new Set([
    "moc_hub",
    "paper_gateway",
    "project",
    "signal_domain",
    "strategy_insight",
    "strategy_request",
  ]);
  const isSafeAggregateHub = (node) => node?.kind === "aggregate_boundary"
    && node.documentCount === 0
    && ["aggregate", "public_alias"].includes(node.nameMode);
  for (const node of structure.nodes) {
    if (!sourceKinds.has(node.kind) || isSafeAggregateHub(node)) continue;
    const visited = new Set([node.id]);
    let cursor = nodeById.get(node.parentId);
    let foundHub = false;
    while (cursor && !visited.has(cursor.id)) {
      if (hubKinds.has(cursor.kind) || isSafeAggregateHub(cursor)) {
        foundHub = true;
        break;
      }
      visited.add(cursor.id);
      cursor = nodeById.get(cursor.parentId);
    }
    if (!foundHub) {
      throw new Error(`Structure blocked: source-level node has no evidenced hub ancestor (${node.label}).`);
    }
  }
}

function publicStructure(legacyStructure) {
  const nodes = [];
  const associations = [];
  const nodeByPath = new Map();
  for (const coverage of publicReconciliation.inventory.coverage) {
    const sourceKeys = Object.entries(allowlist.districtLabels)
      .filter(([, label]) => label === coverage.label)
      .map(([sourceKey]) => sourceKey);
    if (!sourceKeys.length) sourceKeys.push(coverage.label);
    const members = publicReconciliation.classified.filter(
      (record) => sourceKeys.includes(record.relativePath.split("/")[0])
        && record.classification.disposition !== "excluded",
    );
    const id = districtId("atlas-public", coverage.label);
    nodes.push({
      id,
      kind: "district",
      label: coverage.label,
      parentId: null,
      districtId: id,
      documentCount: members.length,
      ...aggregateLinkMetrics(members.map((record) => record.relativePath), linkAnalysis),
      lastMeaningfulDate: maximumMeaningfulDate(members),
      nameMode: "approved_name",
    });
    const alias = allowlist.aliases.find((item) => item.sourceKey === coverage.label)
      ?? allowlist.aliases.find((item) => sourceKeys.includes(item.sourceKey));
    if (!alias) throw new Error(`Public structure blocked: no safe alias for district ${coverage.label}.`);
    const aliasId = `hub:pub:${privacySafeDigestToken(alias.id)}`;
    const hubItems = [{ id: aliasId, label: alias.label, record: null }];
    nodes.push({
      id: aliasId,
      kind: alias.kind,
      label: alias.label,
      parentId: id,
      districtId: id,
      documentCount: 0,
      uniqueInboundDocuments: 0,
      inboundLinkOccurrences: 0,
      lastMeaningfulDate: null,
      nameMode: "public_alias",
    });
    associations.push({
      id: `association:pub:${privacySafeDigestToken(`member:${aliasId}:${id}`)}`,
      source: aliasId,
      target: id,
      kind: "member_of",
      weight: 0,
    });
    const namedRecords = members.filter((item) => item.classification.disposition === "named");
    for (const record of namedRecords) {
      const nodeId = `hub:pub:${privacySafeDigestToken(record.title)}`;
      const metric = linkAnalysis.get(record.relativePath);
      nodeByPath.set(record.relativePath, nodeId);
      hubItems.push({ id: nodeId, label: record.title, record });
      nodes.push({
        id: nodeId,
        kind: structureKindForDocument(record.relativePath, record.frontmatter),
        label: record.title,
        parentId: id,
        districtId: id,
        documentCount: 1,
        uniqueInboundDocuments: metric?.uniqueInboundDocuments ?? 0,
        inboundLinkOccurrences: metric?.inboundLinkOccurrences ?? 0,
        lastMeaningfulDate: record.meaningfulDate,
        nameMode: "approved_name",
      });
      associations.push({
        id: `association:pub:${privacySafeDigestToken(`member:${nodeId}:${id}`)}`,
        source: nodeId,
        target: id,
        kind: "member_of",
        weight: 1,
      });
    }
    const assignedByHub = new Map(hubItems.map((hub) => [hub.id, []]));
    for (const record of members.filter((item) => item.classification.disposition === "aggregate")) {
      const connected = strongestConnectedRecord(record.relativePath, namedRecords);
      const parentHubId = connected ? nodeByPath.get(connected.relativePath) : aliasId;
      if (!parentHubId) throw new Error(`Public structure blocked: aggregate parent missing for ${coverage.label}.`);
      assignedByHub.get(parentHubId).push(record);
    }
    for (const hub of hubItems) {
      const assigned = assignedByHub.get(hub.id) ?? [];
      if (!assigned.length) continue;
      const childId = `aggregate:pub:${privacySafeDigestToken(`${hub.id}:source-aggregate`)}`;
      nodes.push({
        id: childId,
        kind: "aggregate_boundary",
        label: `${hub.label} · 공개 안전 원천 집계`,
        parentId: hub.id,
        districtId: id,
        documentCount: assigned.length,
        ...aggregateLinkMetrics(assigned.map((record) => record.relativePath), linkAnalysis),
        lastMeaningfulDate: maximumMeaningfulDate(assigned),
        nameMode: "aggregate",
      });
      associations.push({
        id: `association:pub:${privacySafeDigestToken(`member:${childId}:${hub.id}`)}`,
        source: childId,
        target: hub.id,
        kind: "member_of",
        weight: assigned.length,
      });
    }
  }
  for (const edge of resolvedLinkEdges) {
    const source = nodeByPath.get(edge.sourcePath);
    const target = nodeByPath.get(edge.targetPath);
    if (!source || !target) continue;
    associations.push({
      id: `association:pub:${privacySafeDigestToken(`references:${source}:${target}`)}`,
      source,
      target,
      kind: "references",
      weight: edge.occurrences,
    });
  }
  return {
    ...legacyStructure,
    schema: "atlas.structure.v2",
    profile: "atlas-public",
    generatedAt,
    nodes,
    associations,
    measurement: {
      gravityMetric: "uniqueInboundDocuments",
      occurrenceMetric: "inboundLinkOccurrences",
      freshnessSource: "semantic_date_only",
    },
  };
}

function verifiedFlowForStructure(structure, profile) {
  const nodes = new Map(structure.nodes.map((node) => [node.id, node]));
  const references = structure.associations
    .filter((edge) => edge.kind === "references" && edge.weight > 0)
    .sort((left, right) => right.weight - left.weight || compareText(left.id, right.id))
    .slice(0, 6);
  const routes = references.map((edge) => {
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);
    if (!source || !target) throw new Error(`Flow projection blocked: unresolved structure edge ${edge.id}.`);
    const routeKey = privacySafeDigestToken(`${profile}:${edge.source}:${edge.target}`, 14);
    return {
      id: `verified:${routeKey}`,
      label: `${source.label} → ${target.label}`,
      question: "실제 해석 가능한 위키링크가 어떤 지식 허브를 연결하는가",
      weight: edge.weight,
      members: [source.id, target.id],
      provenance: "resolved_wikilink_path",
      classifier: "캡처 시점의 canonical 위키링크를 유일하게 해석한 허브 간 경로이며 weight 단위는 link occurrence다.",
      sourceRefs: [],
      stations: [source, target].map((node, order) => ({
        id: `station:${routeKey}:${order + 1}`,
        label: node.label,
        order,
        entityId: node.id,
        external: false,
      })),
    };
  });
  return {
    coordinateContract: {
      mode: "route_local_small_multiples",
      sharedXAxis: false,
      xUnit: "route-local ordered station index",
      crossRouteAlignmentMeaning: "none",
      readerLabel: "각 경로의 순서만 의미가 있으며 서로 다른 경로의 가로 위치는 비교하지 않는다.",
    },
    routes,
    pulse: {
      latestDailyId: null,
      latestDailyDate: null,
      sourceItemCount: null,
      chains: [],
    },
  };
}

const roleLabels = new Map([
  ["manager", "Control Plane"],
  ["daily", "Daily Runner"],
  ["atlas", "Atlas Builder"],
  ["rocket", "Rocket Manager"],
  ["groot", "Groot Manager"],
  ["hil", "Intelligence Layer Manager"],
]);

async function ownerActivity() {
  const eventWitness = capture.controlPlaneLedger.find((item) => path.basename(item.sourcePath) === "activity-events.v1.jsonl");
  if (!eventWitness) throw new Error("Owner activity build blocked: captured event ledger is missing.");
  const verifiedBytes = verifiedWitnessBytes.get(eventWitness.sourcePath);
  if (!verifiedBytes || verifiedBytes.length !== eventWitness.bytes || sha256(verifiedBytes) !== eventWitness.secondSha256) {
    throw new Error("Owner activity build blocked: verified event witness bytes are unavailable or changed.");
  }
  const text = verifiedBytes.toString("utf8");
  const events = text.split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const aggregateMap = new Map();
  const lifecycleMap = new Map();
  for (const event of events) {
    const role = roleLabels.get(event.actor?.owner) ?? "Other Owner";
    const unitType = String(event.unit_type ?? "unknown");
    const status = String(event.activity_state ?? "unknown");
    const date = /^\d{4}-\d{2}-\d{2}/.exec(String(event.occurred_at ?? ""))?.[0] ?? null;
    const key = JSON.stringify([role, unitType, status, date]);
    const aggregate = aggregateMap.get(key) ?? { role, unitType, status, date, count: 0 };
    aggregate.count += 1;
    aggregateMap.set(key, aggregate);
    if (date) {
      const lifecycle = lifecycleMap.get(date) ?? { date, created: 0, completed: 0, stopped: 0 };
      if (event.event_type === "START") lifecycle.created += 1;
      else if (event.event_type === "CLOSE") lifecycle.completed += 1;
      if (/blocked|stopped/i.test(status)) lifecycle.stopped += 1;
      lifecycleMap.set(date, lifecycle);
    }
  }
  return {
    schema: "atlas.activity.v1",
    profile: "atlas-owner",
    generatedAt,
    asOfDate: generatedAt.slice(0, 10),
    live: false,
    boundary: "검증된 원장 사건을 역할·단위·상태·날짜별 건수로만 집계하며 원문 식별자와 운영 경로를 포함하지 않습니다.",
    aggregates: [...aggregateMap.values()].sort((left, right) => compareText(JSON.stringify(left), JSON.stringify(right))),
    lifecycle: [...lifecycleMap.values()].sort((left, right) => compareText(left.date, right.date)),
  };
}

const legacyPacks = Object.fromEntries(await Promise.all(
  packNames.filter((name) => name !== "inventory")
    .map(async (name) => [name, JSON.parse(await readFile(path.join(publicSafeDataRoot, `${name}.json`), "utf8"))]),
));
const publicEntityPack = refreshPublicEntityPack(legacyPacks.entity);
const publicLegacyStructure = refreshPublicLegacyStructure(legacyPacks.structure, publicEntityPack);
const publicStructurePack = publicStructure(publicLegacyStructure);
assertSourceHubAncestry(publicStructurePack);
const ownerStructurePack = ownerStructure(publicLegacyStructure);
assertSourceHubAncestry(ownerStructurePack);
const publicFlowPack = verifiedFlowForStructure(publicStructurePack, "atlas-public");
const publicRelationPack = buildFreshPublicRelation(legacyPacks.relation, ownerStructurePack);
const publicPacks = {
  ...legacyPacks,
  bootstrap: {
    ...legacyPacks.bootstrap,
    version: "7.4.0-public",
    generatedAt,
    proofBoundary: {
      ...legacyPacks.bootstrap.proofBoundary,
      inventory: "실볼트 Markdown 인벤토리를 named·aggregate·excluded로 완전 reconciliation한 공개 안전 투영",
      freshness: "frontmatter 의미 날짜와 날짜형 Daily/Weekly 경로만 사용하며 mtime은 사용하지 않음",
    },
  },
  inventory: publicReconciliation.inventory,
  structure: publicStructurePack,
  entity: publicEntityPack,
  flow: publicFlowPack,
  relation: publicRelationPack,
  temporal: {
    eras: [],
    currentEra: null,
  },
};
const evidenceBoundaryEntity = publicEntityPack.entities.find((entity) => entity.surfaceRole === "reference")
  ?? publicEntityPack.entities[0];
const evidenceRefsForDistricts = (...labels) => {
  const matches = labels
    .map((label) => publicEntityPack.entities.find((entity) => entity.district === label && entity.surfaceRole !== "reference"))
    .filter(Boolean)
    .map((entity) => entity.id);
  return [...new Set(matches.length ? matches : [evidenceBoundaryEntity.id])];
};
const strongestPublicPair = [...publicRelationPack.matrix]
  .sort((left, right) => right.wikilink - left.wikilink || compareText(left.id, right.id))[0] ?? null;
const strongestDominantSource = strongestPublicPair
  ? strongestPublicPair.wikilinkReverse > strongestPublicPair.wikilinkForward
    ? strongestPublicPair.target
    : strongestPublicPair.source
  : null;
const strongestDominantTarget = strongestPublicPair
  ? strongestDominantSource === strongestPublicPair.source ? strongestPublicPair.target : strongestPublicPair.source
  : null;
const strongestFocusId = publicStructurePack.nodes.find((node) =>
  node.kind === "district" && node.label === strongestDominantSource)?.id;
const largestPublicDistrict = [...publicStructurePack.districts]
  .sort((left, right) => right.documentCount - left.documentCount || compareText(left.name, right.name))[0] ?? null;
const concentrationFocusId = publicStructurePack.nodes.find((node) =>
  node.kind === "district" && node.label === largestPublicDistrict?.name)?.id;
publicPacks.insight = {
  ...legacyPacks.insight,
  generatedAt,
  evidenceBoundary: "공개 스냅샷의 집계 수량과 정제된 관계만 사용하며 내부 문서 본문과 실행 증거는 포함하지 않는다.",
  items: legacyPacks.insight.items.map((item) => item.kind === "latest_pulse"
    ? {
        ...item,
        headline: publicFlowPack.routes.length
          ? `검증된 공개 허브 경로 ${publicFlowPack.routes.length}개를 실제 위키링크로 확인했다`
          : "검증 가능한 공개 경로가 없어 빈 상태로 남긴다",
        metric: { value: publicFlowPack.routes.length, label: "검증된 공개 경로", unit: "개" },
        targetScene: {
          workspace: "flow",
          scene: "routes",
          ...(publicFlowPack.routes[0] ? { routeId: publicFlowPack.routes[0].id } : {}),
        },
        confidence: "high",
        caveat: "Owner 전용 원장과 내부 운영 경로를 공개판에 추정하거나 자리표시자로 복제하지 않는다.",
      }
    : item.kind === "strongest_relation" && strongestPublicPair && strongestDominantSource && strongestDominantTarget
      ? {
          ...item,
          headline: `${strongestDominantSource} ↔ ${strongestDominantTarget}의 양방향 해결 링크 합계가 ${strongestPublicPair.wikilink}회로 가장 많다`,
          metric: { value: strongestPublicPair.wikilink, label: "양방향 해결 링크 합계", unit: "회" },
          evidenceRefs: evidenceRefsForDistricts(strongestPublicPair.source, strongestPublicPair.target),
          targetScene: {
            workspace: "observe",
            scene: "global-relation",
            ...(strongestFocusId ? { focusId: strongestFocusId } : {}),
            relationPairId: strongestPublicPair.id,
            relationLayer: "wikilink",
          },
          confidence: "high",
          caveat: `합계 ${strongestPublicPair.wikilink}회는 ${strongestDominantSource} → ${strongestDominantTarget} ${Math.max(strongestPublicPair.wikilinkForward, strongestPublicPair.wikilinkReverse)}회와 ${strongestDominantTarget} → ${strongestDominantSource} ${Math.min(strongestPublicPair.wikilinkForward, strongestPublicPair.wikilinkReverse)}회를 더한 fresh resolved link occurrence이며 두 방향은 따로 보존한다.`,
        }
    : item.kind === "knowledge_concentration" && largestPublicDistrict
      ? {
          ...item,
          headline: `${largestPublicDistrict.name}이 ${largestPublicDistrict.documentCount}개 표현 기록으로 가장 큰 구역이다`,
          metric: { value: largestPublicDistrict.documentCount, label: "표현된 기록", unit: "개" },
          evidenceRefs: evidenceRefsForDistricts(largestPublicDistrict.name),
          targetScene: {
            workspace: "explore",
            scene: "districts",
            ...(concentrationFocusId ? { focusId: concentrationFocusId } : {}),
            lens: "city",
          },
          confidence: "high",
          caveat: "크기는 named + aggregate로 reconciliation된 표현 기록 수이며 중요도나 활동량을 뜻하지 않는다.",
        }
    : item.kind === "attention"
      ? {
          ...item,
          headline: `전체 ${publicReconciliation.inventory.physicalMarkdownCount}개 중 ${publicReconciliation.inventory.excludedCount}개는 공개 경계에서 제외됐다`,
          metric: { value: publicReconciliation.inventory.excludedCount, label: "제외 문서", unit: "개" },
          targetScene: { workspace: "home", scene: "coverage-boundary" },
          caveat: "제외는 archive·scaffolding·control internal·raw Daily·명시 정책 우선순위로 재계산하며 활동 부재를 뜻하지 않는다.",
        }
      : item),
};
publicPacks.publication = {
  ...legacyPacks.publication,
  generatedAt,
  publicSnapshotDigest: null,
  excludedFields: [
    "absolute_path",
    "source_document_id",
    "source_document_title",
    "frontmatter",
    "aliases",
    "tags",
    "document_body",
    "document_level_relation",
    "raw_source",
    "internal_ownership_record",
    "internal_proof_record",
    "external_tool_identifier",
    "archive",
  ],
  allowedSurfaces: [...new Set([
    ...legacyPacks.publication.allowedSurfaces,
    "inventory_coverage",
    "named_or_alias_hub",
    "semantic_freshness_aggregate",
  ])],
  redactionCounts: {
    sourceEntities: publicReconciliation.inventory.physicalMarkdownCount,
    publicEntities: legacyPacks.entity.entities.length,
    namedSourceDocuments: publicReconciliation.inventory.namedCount,
    aggregateSourceDocuments: publicReconciliation.inventory.aggregateCount,
    aggregatedSourceDocuments: publicReconciliation.inventory.namedCount + publicReconciliation.inventory.aggregateCount,
    representedSourceDocuments: publicReconciliation.inventory.namedCount + publicReconciliation.inventory.aggregateCount,
    excludedEntities: publicReconciliation.inventory.excludedCount,
    excludedSourceDocuments: publicReconciliation.inventory.excludedCount,
    archiveExcluded: publicReconciliation.inventory.exclusions.byReason.archive,
    scaffoldingExcluded: publicReconciliation.inventory.exclusions.byReason.scaffolding,
    controlDocumentsExcluded: publicReconciliation.inventory.exclusions.byReason.control_internal,
    rawDailyExcluded: publicReconciliation.inventory.exclusions.byReason.raw_daily,
    explicitPolicyExcluded: publicReconciliation.inventory.exclusions.byReason.explicit_policy,
    publicNameNotApproved: publicReconciliation.inventory.exclusions.byReason.public_name_not_approved,
  },
  blockers: [],
};

function assertPublicProjectCountBoundary() {
  const projectNames = new Set(["Rocket", "Groot", "Intelligence Layer"]);
  const ownerRows = ownerReconciliation.inventory.coverage.filter((row) => projectNames.has(row.label));
  const combinedRows = publicPacks.inventory.coverage.filter((row) => row.label === "Independent Projects");
  if (ownerRows.length !== 3 || combinedRows.length !== 1) {
    throw new Error("Public project count boundary blocked: expected three owner rows and one combined public row.");
  }
  if (publicPacks.inventory.coverage.some((row) => projectNames.has(row.label))) {
    throw new Error("Public project count boundary blocked: project-specific inventory row found.");
  }
  const ownerPhysical = ownerRows.reduce((sum, row) => sum + row.physical, 0);
  if (combinedRows[0].physical !== ownerPhysical
    || combinedRows[0].named + combinedRows[0].aggregate + combinedRows[0].excluded !== ownerPhysical) {
    throw new Error("Public project count boundary blocked: combined project coverage does not reconcile.");
  }
  if (publicPacks.inventory.publicTitlePolicy.projectCountDisclosure !== "combined_non_attributable") {
    throw new Error("Public project count boundary blocked: disclosure policy is not combined_non_attributable.");
  }
  const structureLabels = [
    ...publicPacks.structure.districts.map((row) => row.name),
    ...publicPacks.structure.hierarchyNodes.map((row) => row.label),
    ...publicPacks.structure.nodes.map((row) => row.label),
  ];
  if (structureLabels.some((label) => [...projectNames].some((name) => label === name || label.startsWith(`${name} `)))) {
    throw new Error("Public project count boundary blocked: project-specific structure label found.");
  }
  if (publicPacks.structure.nodes.some((node) => node.kind === "project_stage")) {
    throw new Error("Public project count boundary blocked: project-stage count surface found.");
  }
}

assertPublicProjectCountBoundary();
publicPacks.publication.publicSnapshotDigest = computePublicSnapshotDigest(publicPacks);
assertPublicProjectionBoundary(publicPacks);

const ownerPaperDimension = paperDimensionForOwnerStructure(ownerStructurePack);
const ownerActivityPack = await ownerActivity();
const ownerFlowPack = verifiedFlowForStructure(ownerStructurePack, "atlas-owner");
const ownerProjection = {
  schema: "atlas.owner_projection.v1",
  profile: "atlas-owner",
  generatedAt,
  inventory: ownerReconciliation.inventory,
  structure: ownerStructurePack,
  paperDimension: ownerPaperDimension,
  activity: ownerActivityPack,
  sourceIndex: ownerReconciliation.classified
    .filter((record) => record.classification.disposition !== "excluded")
    .map((record) => ({
      id: `node:owner:${stableDigest(record.relativePath).slice(0, 18)}`,
      path: record.relativePath,
      title: record.title,
      kind: structureKindForDocument(record.relativePath, record.frontmatter),
      disposition: record.classification.disposition,
    })),
};
const publicV2DistrictLabelById = new Map(publicStructurePack.nodes
  .filter((node) => node.kind === "district")
  .map((node) => [node.id, node.label]));
const ownerV2DistrictIdByPublicLabel = new Map(ownerStructurePack.nodes
  .filter((node) => node.kind === "district")
  .map((node) => [allowlist.districtLabels[node.label] ?? node.label, node.id]));
const retargetOwnerInsightFocus = (item) => {
  const publicLabel = publicV2DistrictLabelById.get(item.targetScene.focusId);
  const ownerFocusId = publicLabel ? ownerV2DistrictIdByPublicLabel.get(publicLabel) : null;
  return ownerFocusId
    ? { ...item, targetScene: { ...item.targetScene, focusId: ownerFocusId } }
    : item;
};
const ownerRuntimePacks = {
  ...publicPacks,
  bootstrap: {
    ...publicPacks.bootstrap,
    version: "7.4.0-owner",
    proofBoundary: {
      ...publicPacks.bootstrap.proofBoundary,
      inventory: "Owner 전용 전체 구조와 공개 제외 사유를 포함하는 로컬 투영",
    },
  },
  inventory: ownerProjection.inventory,
  structure: ownerStructurePack,
  flow: ownerFlowPack,
  insight: {
    ...publicPacks.insight,
    items: publicPacks.insight.items.map((publicItem) => {
      const item = retargetOwnerInsightFocus(publicItem);
      return item.kind === "latest_pulse" ? {
          ...item,
          headline: ownerFlowPack.routes.length
            ? `검증된 Owner 허브 경로 ${ownerFlowPack.routes.length}개를 실제 위키링크로 확인했다`
            : "검증 가능한 Owner 허브 경로가 없어 빈 상태로 남긴다",
          metric: { value: ownerFlowPack.routes.length, label: "검증된 Owner 경로", unit: "개" },
          targetScene: {
            workspace: "flow",
            scene: "routes",
            ...(ownerFlowPack.routes[0] ? { routeId: ownerFlowPack.routes[0].id } : {}),
          },
        } : item;
    }),
  },
  publication: {
    ...publicPacks.publication,
    profile: "owner",
    publicSnapshotDigest: null,
    allowedSurfaces: [
      "owner_inventory",
      "owner_structure",
      "owner_activity_aggregate",
      "owner_verified_hub_path",
    ],
    redactionCounts: {
      sourceEntities: records.length,
      representedSourceDocuments: ownerReconciliation.inventory.namedCount,
      excludedSourceDocuments: ownerReconciliation.inventory.excludedCount,
      structureNodes: ownerStructurePack.nodes.length,
      activityAggregates: ownerActivityPack.aggregates.length,
    },
    blockers: [],
  },
  activity: ownerActivityPack,
};

await rm(ownerRoot, { recursive: true, force: true });
await rm(publicRoot, { recursive: true, force: true });
await mkdir(ownerRoot, { recursive: true });
await mkdir(publicDataRoot, { recursive: true });
assertOwnerPublicSeparation({ ownerRoot, publicRoot, trackedFiles: [] });
await writeFile(path.join(ownerRoot, "atlas-owner.json"), `${JSON.stringify(ownerProjection, null, 2)}\n`, "utf8");
await writeFile(path.join(ownerRoot, "paper-dimension-receipt.json"), `${JSON.stringify({
  schema: "atlas.paper_dimension_receipt.v1",
  generatedAt,
  captureManifestSha256: sha256(captureText),
  ...ownerPaperDimension,
  pass: true,
}, null, 2)}\n`, "utf8");
for (const [name, value] of Object.entries({
  inventory: ownerProjection.inventory,
  structure: ownerProjection.structure,
  activity: ownerProjection.activity,
})) {
  await writeFile(path.join(ownerRoot, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
const ownerDataRoot = path.join(ownerRoot, "data");
await mkdir(ownerDataRoot, { recursive: true });
for (const [name, value] of Object.entries(ownerRuntimePacks)) {
  const artifact = createPublicPackArtifacts(name, value);
  await writeFile(path.join(ownerDataRoot, `${name}.json`), artifact.jsonText, "utf8");
  await writeFile(path.join(ownerDataRoot, `${name}.js`), artifact.jsText, "utf8");
}

const outputBindings = {};
for (const name of packNames) {
  const artifact = createPublicPackArtifacts(name, publicPacks[name]);
  await writeFile(path.join(publicDataRoot, `${name}.json`), artifact.jsonText, "utf8");
  await writeFile(path.join(publicDataRoot, `${name}.js`), artifact.jsText, "utf8");
  if (promotePublicSafe) {
    await writeFile(path.join(publicSafeDataRoot, `${name}.json`), artifact.jsonText, "utf8");
    await writeFile(path.join(publicSafeDataRoot, `${name}.js`), artifact.jsText, "utf8");
  }
  outputBindings[name] = {
    jsonSha256: artifact.jsonSha256,
    javascriptSha256: artifact.jsSha256,
  };
}
try {
  await access(path.join(publicDataRoot, "activity.json"));
  throw new Error("Public profile build blocked: owner activity pack crossed the public boundary.");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const receipt = {
  schema: "atlas.dual_profile_projection.v1",
  generatedAt,
  captureManifestSha256: sha256(captureText),
  captureVaultTreeDigest: capture.vault.treeDigest,
  owner: {
    root: ownerRoot,
    runtimeDataRoot: ownerDataRoot,
    inventory: ownerProjection.inventory,
    structureNodes: ownerProjection.structure.nodes.length,
    referenceAssociations: ownerProjection.structure.associations.filter((edge) => edge.kind === "references").length,
    paperDimension: ownerPaperDimension,
    verifiedFlowRoutes: ownerRuntimePacks.flow.routes.length,
    activityAggregates: ownerProjection.activity.aggregates.length,
  },
  public: {
    root: publicRoot,
    promotedToPublicSafe: promotePublicSafe,
    inventory: publicPacks.inventory,
    structureNodes: publicPacks.structure.nodes.length,
    referenceAssociations: publicPacks.structure.associations.filter((edge) => edge.kind === "references").length,
    verifiedFlowRoutes: publicPacks.flow.routes.length,
    publicKnowledgeEntities: publicPacks.entity.entities.length,
    activityPackPresent: false,
    publicSnapshotDigest: publicPacks.publication.publicSnapshotDigest,
    outputBindings,
  },
  ownerPublicRootsDisjoint: true,
  unclassified: 0,
  pass: true,
};
const receiptText = `${JSON.stringify(receipt, null, 2)}\n`;
await writeFile(path.join(captureDir, "dual-profile-projection-receipt.json"), receiptText, "utf8");
await writeFile(path.join(publicRoot, "dual-profile-projection-receipt.json"), receiptText, "utf8");
console.log(JSON.stringify({
  pass: true,
  promotePublicSafe,
  ownerDocuments: ownerProjection.inventory.physicalMarkdownCount,
  publicRepresented: publicPacks.inventory.namedCount + publicPacks.inventory.aggregateCount,
  publicExcluded: publicPacks.inventory.excludedCount,
  publicSnapshotDigest: publicPacks.publication.publicSnapshotDigest,
}, null, 2));
