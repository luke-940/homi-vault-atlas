const fields = (value) => new Set(value.split(/\s+/).filter(Boolean));

const exactRules = new Map([
  ["bootstrap", fields("schema version generatedAt snapshot proofBoundary workspaces defaultFocus")],
  ["bootstrap.snapshot", fields("officialCursor stateSnapshot currentStateHash candidateInputHash activeManifestHash memoryEngineCodeHash memoryIndexHash memoryEngineSchema memoryCorpusDigest memoryFiles graphConfigHash graphJsonUsedAsNodeEdgeSource activeMarkdownCount archiveMarkdownCount buildState")],
  ["entity", fields("entities searchFields")],
  ["entity.entities[]", fields("id path title displayLabel aliases tags parentId district topLevel depth authority currentness currentnessRaw surfaceRole sourceRole defaultPreload wordCount documentCount ageDays sha256 frontmatter")],
  ["flow", fields("coordinateContract routes pulse")],
  ["flow.coordinateContract", fields("mode sharedXAxis xUnit crossRouteAlignmentMeaning readerLabel")],
  ["flow.routes[]", fields("id label question members provenance classifier sourceRefs stations")],
  ["flow.routes[].stations[]", fields("id label order entityId external kind")],
  ["flow.pulse", fields("latestDailyId latestDailyDate sourceItemCount chains")],
  ["flow.pulse.chains[]", fields("id stages")],
  ["flow.pulse.chains[].stages[]", fields("role label entityId")],
  ["health", fields("memoryEngine currentnessCounts authorityCounts unresolvedLinks ambiguousAutoSelections unresolvedTypedRelations activeIsolates countReconciliation")],
  ["health.memoryEngine", fields("schema files")],
  ["health.countReconciliation", fields("entities memoryFiles hierarchyDocuments pass")],
  ["insight", fields("schema generatedAt evidenceBoundary items")],
  ["insight.items[]", fields("id kind question headline metric evidenceRefs targetScene confidence caveat publicSafe")],
  ["insight.items[].metric", fields("value label unit")],
  ["insight.items[].targetScene", fields("workspace scene focusId lens relationPairId relationLayer routeId eraId")],
  ["publication", fields("schema profile generatedAt publicSnapshotDigest allowedSurfaces excludedFields redactionCounts blockers")],
  ["relation", fields("districtOrder matrix typedRelations routeCoMembership neighborhoods layerDefinitions availableLayers redactedLayers coverage")],
  ["relation.matrix[]", fields("id source target wikilink wikilinkForward wikilinkReverse typed typedForward typedReverse route total")],
  ["relation.layerDefinitions[]", fields("id label meaning unit")],
  ["relation.coverage", fields("resolvedLinkPairs resolvedLinkWeight unresolvedLinks unresolvedLinkTotal ambiguousLinks typedRelations layers boundary")],
  ["relation.coverage.layers", fields("wikilink typed route")],
  ["relation.coverage.layers.wikilink", fields("unit total interDistrict intraDistrict displayed reconciled boundary")],
  ["relation.coverage.layers.typed", fields("unit total interDistrict intraDistrict displayed reconciled boundary")],
  ["relation.coverage.layers.route", fields("unit total interDistrict intraDistrict displayed reconciled boundary")],
  ["structure", fields("districts hierarchyNodes rootId archiveScope")],
  ["structure.districts[]", fields("id name documentCount wordCount typedRelations currentDocuments authorityL1L2 constellationComposition topEntities")],
  ["structure.districts[].constellationComposition", fields("unit folderGroupCount directDocumentCount directDocumentShare categoryCount largestCategoryId largestCategoryShare categories reconciled")],
  ["structure.districts[].constellationComposition.categories[]", fields("id label kind documentCount share")],
  ["structure.hierarchyNodes[]", fields("id path label parentId depth kind authority currentness surfaceRole value childrenCount documentCount authorityL1L2")],
  ["structure.archiveScope", fields("active archive defaultState")],
  ["temporal", fields("currentEra eras")],
  ["temporal.eras[]", fields("id title range thesis evidenceRefs evidenceClass deltas unknown proofBoundary")],
  ["temporal.eras[].deltas[]", fields("state label evidenceRef evidenceAnchor evidenceClass evidenceStatus")],
]);

const primitiveRecordPaths = new Set([
  "bootstrap.proofBoundary",
  "entity.entities[].frontmatter",
  "health.currentnessCounts",
  "health.authorityCounts",
  "health.unresolvedLinks",
  "publication.redactionCounts",
  "relation.neighborhoods",
  "relation.coverage.unresolvedLinks",
]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function auditPublicFieldContract(packs) {
  const findings = [];
  const visit = (value, path) => {
    if (Array.isArray(value)) {
      for (const item of value) if (isObject(item)) visit(item, `${path}[]`);
      return;
    }
    if (!isObject(value)) return;
    const allowed = exactRules.get(path);
    if (allowed) {
      for (const key of Object.keys(value)) {
        if (!allowed.has(key)) findings.push({ id: "public-field-not-allowed", path: `${path}.${key}` });
      }
    } else if (primitiveRecordPaths.has(path)) {
      for (const [key, child] of Object.entries(value)) {
        if (isObject(child) || Array.isArray(child)) findings.push({ id: "public-record-value-not-primitive", path: `${path}.${key}` });
      }
    } else {
      findings.push({ id: "public-object-shape-unregistered", path });
    }
    for (const [key, child] of Object.entries(value)) {
      if (Array.isArray(child)) visit(child, `${path}.${key}`);
      else if (isObject(child)) visit(child, `${path}.${key}`);
    }
  };
  for (const [packName, pack] of Object.entries(packs)) visit(pack, packName);
  return findings;
}

export const publicEntityFields = exactRules.get("entity.entities[]");
export const publicHierarchyFields = exactRules.get("structure.hierarchyNodes[]");
