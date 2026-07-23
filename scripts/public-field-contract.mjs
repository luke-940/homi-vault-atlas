const fields = (value) => new Set(value.split(/\s+/).filter(Boolean));

const exactRules = new Map([
  ["agency", fields("schema generatedAt snapshot principal groups actors surfaces links transition evidenceBoundary projectionDigest")],
  ["agency.snapshot", fields("asOfDate status live caveat")],
  ["agency.principal", fields("id label kind")],
  ["agency.groups[]", fields("id label kind actorIds")],
  ["agency.actors[]", fields("id label groupId purpose ownedSurfaceId publicOutput proof stopBoundary")],
  ["agency.surfaces[]", fields("id label actorId")],
  ["agency.links[]", fields("id source target kind")],
  ["agency.transition", fields("id label kind fromModel toActorIds evidenceStatus")],
  ["bootstrap", fields("schema version generatedAt snapshot proofBoundary workspaces defaultFocus")],
  ["bootstrap.snapshot", fields("memoryEngineSchema memoryFiles graphJsonUsedAsNodeEdgeSource activeMarkdownCount archiveMarkdownCount buildState")],
  ["entity", fields("entities searchFields")],
  ["entity.entities[]", fields("id path title displayLabel aliases tags parentId district topLevel depth authority currentness currentnessRaw surfaceRole sourceRole defaultPreload wordCount documentCount ageDays frontmatter")],
  ["flow", fields("coordinateContract routes pulse")],
  ["flow.coordinateContract", fields("mode sharedXAxis xUnit crossRouteAlignmentMeaning readerLabel")],
  ["flow.routes[]", fields("id label question weight members provenance classifier sourceRefs stations")],
  ["flow.routes[].stations[]", fields("id label order entityId external kind")],
  ["flow.pulse", fields("latestDailyId latestDailyDate sourceItemCount chains")],
  ["flow.pulse.chains[]", fields("id stages")],
  ["flow.pulse.chains[].stages[]", fields("role label entityId")],
  ["health", fields("memoryEngine currentnessCounts authorityCounts unresolvedLinks ambiguousAutoSelections unresolvedTypedRelations activeIsolates countReconciliation")],
  ["health.memoryEngine", fields("schema files")],
  ["health.countReconciliation", fields("entities memoryFiles hierarchyDocuments pass")],
  ["inventory", fields("schema profile generatedAt asOfDate physicalMarkdownCount namedCount aggregateCount excludedCount unclassifiedCount reconciliation coverage exclusions publicTitlePolicy")],
  ["inventory.reconciliation", fields("classifiedTotal pass")],
  ["inventory.coverage[]", fields("id label physical named aggregate excluded")],
  ["inventory.exclusions", fields("priority byReason")],
  ["inventory.publicTitlePolicy", fields("schema mode fallback projectCountDisclosure")],
  ["insight", fields("schema generatedAt evidenceBoundary items")],
  ["insight.items[]", fields("id kind question headline metric evidenceRefs targetScene confidence caveat publicSafe")],
  ["insight.items[].metric", fields("value label unit")],
  ["insight.items[].targetScene", fields("workspace scene focusId lens relationPairId relationLayer routeId eraId")],
  ["meaning", fields("schema profile generatedAt baseline current protagonists constellations movements operationalCompass scenes manifest")],
  ["meaning.baseline", fields("release asOfDate graphSemanticDigest graphNodeCount graphEdgeCount")],
  ["meaning.current", fields("release asOfDate graphSemanticDigest graphNodeCount graphEdgeCount")],
  ["meaning.protagonists[]", fields("id nodeId role thesis caveat metrics evidenceRefs selectionMode")],
  ["meaning.protagonists[].metrics", fields("gravity occurrences crossDomainReach bridgeCentrality meaningfulDate incomingCount outgoingCount")],
  ["meaning.constellations[]", fields("id focalNodeId incomingEdgeIds outgoingEdgeIds boundedPathEdgeIds explanations")],
  ["meaning.constellations[].explanations[]", fields("edgeId direction statement")],
  ["meaning.movements[]", fields("id kind label nodeIds edgeIds previousValue currentValue evidenceRefs caveat")],
  ["meaning.movements[].previousValue", fields("nodes edges gravity occurrenceCount occurrences meaningfulDate")],
  ["meaning.movements[].currentValue", fields("nodes edges gravity occurrenceCount occurrences meaningfulDate")],
  ["meaning.operationalCompass[]", fields("id kind actorId domainIds label statement")],
  ["meaning.scenes[]", fields("id label thesis focusIds")],
  ["meaning.manifest", fields("protagonistCount constellationCount movementCount projectionDigest")],
  ["publication", fields("schema profile generatedAt publicSnapshotDigest allowedSurfaces excludedFields redactionCounts blockers")],
  ["relation", fields("districtOrder matrix typedRelations routeCoMembership neighborhoods layerDefinitions availableLayers redactedLayers coverage")],
  ["relation.matrix[]", fields("id source target wikilink wikilinkForward wikilinkReverse typed typedForward typedReverse route total")],
  ["relation.layerDefinitions[]", fields("id label meaning unit")],
  ["relation.coverage", fields("resolvedLinkPairs resolvedLinkWeight unresolvedLinks unresolvedLinkTotal ambiguousLinks typedRelations layers boundary")],
  ["relation.coverage.layers", fields("wikilink typed route")],
  ["relation.coverage.layers.wikilink", fields("unit total interDistrict intraDistrict displayed reconciled boundary")],
  ["relation.coverage.layers.typed", fields("unit total interDistrict intraDistrict displayed reconciled boundary")],
  ["relation.coverage.layers.route", fields("unit total interDistrict intraDistrict displayed reconciled boundary")],
  ["graph", fields("schema profile generatedAt nodes edges clusters layout manifest")],
  ["graph.nodes[]", fields("id kind label parentId districtId clusterId representedDocuments gravity occurrences freshness nameMode")],
  ["graph.edges[]", fields("id source target kind direction occurrenceCount defaultVisible")],
  ["graph.clusters[]", fields("id districtId label nodeCount representedDocumentCount representativeNodeCount summary contour")],
  ["graph.clusters[].contour", fields("type coordinates")],
  ["graph.layout", fields("algorithm seed ticks axes bounds undatedRail coordinates defaultNodeIds defaultEdgeIds labelBudget")],
  ["graph.layout.axes", fields("x y z")],
  ["graph.layout.axes.x", fields("field kind direction")],
  ["graph.layout.axes.y", fields("field kind direction scale")],
  ["graph.layout.axes.z", fields("field kind direction")],
  ["graph.layout.bounds", fields("x y z width height depth")],
  ["graph.layout.undatedRail", fields("y label")],
  ["graph.layout.coordinates[]", fields("id x y z depthLevel radius dated clusterIndex")],
  ["graph.manifest", fields("nodeCount edgeCount clusterCount semanticDigest layoutDigest projectionDigest")],
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
  "inventory.exclusions.byReason",
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
export const publicGraphNodeFields = exactRules.get("graph.nodes[]");
