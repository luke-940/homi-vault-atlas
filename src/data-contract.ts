export const RELATION_LAYERS = ["wikilink", "typed", "route"] as const;

const WORKSPACES = ["home", "explore", "observe", "flow", "time", "agency"] as const;
const ATLAS_PROFILES = ["atlas-owner", "atlas-public"] as const;
const INVENTORY_EXCLUSION_PRIORITY = [
  "archive",
  "scaffolding",
  "control_internal",
  "raw_daily",
  "explicit_policy",
  "public_name_not_approved",
] as const;
const STRUCTURE_NODE_KINDS = [
  "district",
  "moc_hub",
  "paper_gateway",
  "strategy_insight",
  "strategy_request",
  "project",
  "project_stage",
  "signal_domain",
  "signal_storyline",
  "source_document",
  "aggregate_boundary",
] as const;
const AGENCY_LINK_KINDS = [
  "sets_direction",
  "coordinates_boundary",
  "owns_surface",
  "returns_result",
  "returns_evidence",
] as const;

export interface AtlasShapeIssue {
  path: string;
  message: string;
}

type Validator = (value: unknown, path: string, issues: AtlasShapeIssue[]) => void;
type FieldRule = { validate: Validator; optional?: boolean };

const required = (validate: Validator): FieldRule => ({ validate });
const optional = (validate: Validator): FieldRule => ({ validate, optional: true });
const issue = (issues: AtlasShapeIssue[], path: string, message: string) => {
  issues.push({ path, message });
};

function isPlainJsonObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  if (Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Reflect.ownKeys(value).every((key) => {
    if (typeof key !== "string") return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor?.enumerable === true && "value" in descriptor;
  });
}

function objectOf(
  fields: Record<string, FieldRule>,
  { exact = false }: { exact?: boolean } = {},
): Validator {
  return (value, path, issues) => {
    if (!isPlainJsonObject(value)) {
      issue(issues, path, "must be a plain JSON object with own enumerable data fields");
      return;
    }
    const allowed = new Set(Object.keys(fields));
    if (exact) {
      for (const key of Object.keys(value)) {
        if (!allowed.has(key)) issue(issues, `${path}.${key}`, "is not allowed");
      }
    }
    for (const [key, rule] of Object.entries(fields)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor)) {
        if (!rule.optional) issue(issues, `${path}.${key}`, "is required");
        continue;
      }
      if (rule.optional && descriptor.value === undefined) continue;
      rule.validate(descriptor.value, `${path}.${key}`, issues);
    }
  };
}

function arrayOf(
  item: Validator,
  { min, max, length }: { min?: number; max?: number; length?: number } = {},
): Validator {
  return (value, path, issues) => {
    if (!Array.isArray(value)) {
      issue(issues, path, "must be an array");
      return;
    }
    if (length !== undefined && value.length !== length) issue(issues, path, `must contain exactly ${length} items`);
    if (min !== undefined && value.length < min) issue(issues, path, `must contain at least ${min} items`);
    if (max !== undefined && value.length > max) issue(issues, path, `must contain at most ${max} items`);
    value.forEach((entry, index) => item(entry, `${path}.${index}`, issues));
  };
}

function tupleOf(items: readonly Validator[]): Validator {
  return (value, path, issues) => {
    if (!Array.isArray(value) || value.length !== items.length) {
      issue(issues, path, `must be a ${items.length}-item tuple`);
      return;
    }
    items.forEach((validator, index) => validator(value[index], `${path}.${index}`, issues));
  };
}

function recordOf(entry: Validator): Validator {
  return (value, path, issues) => {
    if (!isPlainJsonObject(value)) {
      issue(issues, path, "must be a plain JSON record");
      return;
    }
    for (const [key, child] of Object.entries(value)) entry(child, `${path}.${key}`, issues);
  };
}

function literal(expected: unknown): Validator {
  return (value, path, issues) => {
    if (value !== expected) issue(issues, path, `must equal ${JSON.stringify(expected)}`);
  };
}

function oneOf(values: readonly unknown[]): Validator {
  return (value, path, issues) => {
    if (!values.includes(value)) issue(issues, path, `must be one of ${values.join(", ")}`);
  };
}

function stringValue(
  { min = 0, length, prefix, pattern }: { min?: number; length?: number; prefix?: string; pattern?: RegExp } = {},
): Validator {
  return (value, path, issues) => {
    if (typeof value !== "string") {
      issue(issues, path, "must be a string");
      return;
    }
    if (value.length < min) issue(issues, path, `must contain at least ${min} characters`);
    if (length !== undefined && value.length !== length) issue(issues, path, `must contain exactly ${length} characters`);
    if (prefix !== undefined && !value.startsWith(prefix)) issue(issues, path, `must start with ${prefix}`);
    if (pattern && !pattern.test(value)) issue(issues, path, `must match ${pattern}`);
  };
}

function numberValue(
  { integer = false, min, exclusiveMin, max }: { integer?: boolean; min?: number; exclusiveMin?: number; max?: number } = {},
): Validator {
  return (value, path, issues) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      issue(issues, path, "must be a finite number");
      return;
    }
    if (integer && !Number.isInteger(value)) issue(issues, path, "must be an integer");
    if (min !== undefined && value < min) issue(issues, path, `must be at least ${min}`);
    if (exclusiveMin !== undefined && value <= exclusiveMin) issue(issues, path, `must be greater than ${exclusiveMin}`);
    if (max !== undefined && value > max) issue(issues, path, `must be at most ${max}`);
  };
}

const anyValue: Validator = () => {};
const string = stringValue();
const nonEmptyString = stringValue({ min: 1 });
const booleanValue: Validator = (value, path, issues) => {
  if (typeof value !== "boolean") issue(issues, path, "must be a boolean");
};
const finiteNumber = numberValue();
const nonNegativeNumber = numberValue({ min: 0 });
const positiveNumber = numberValue({ exclusiveMin: 0 });
const integer = numberValue({ integer: true });
const positiveInteger = numberValue({ integer: true, exclusiveMin: 0 });
const nonNegativeInteger = numberValue({ integer: true, min: 0 });
const stringArray = arrayOf(string);
const nullable = (validator: Validator): Validator => (value, path, issues) => {
  if (value !== null) validator(value, path, issues);
};
const isoDate = stringValue({ pattern: /^\d{4}-\d{2}-\d{2}$/ });
const numberOrString: Validator = (value, path, issues) => {
  if (typeof value === "string") return;
  finiteNumber(value, path, issues);
};

const neighborValidator = objectOf({
  id: required(nonEmptyString),
  direction: required(oneOf(["incoming", "outgoing"])),
  weight: required(nonNegativeNumber),
  evidence: required(nullable(string)),
  layer: required(oneOf(RELATION_LAYERS)),
  relation: required(nonEmptyString),
}, { exact: true });

const entityValidator = objectOf({
  id: required(stringValue({ prefix: "doc:" })),
  fileId: optional(positiveInteger),
  path: required(nonEmptyString),
  title: required(nonEmptyString),
  displayLabel: required(nonEmptyString),
  aliases: required(stringArray),
  tags: required(stringArray),
  parentId: required(string),
  district: required(nonEmptyString),
  topLevel: required(nonEmptyString),
  depth: required(nonNegativeInteger),
  authority: required(nonEmptyString),
  currentness: required(nonEmptyString),
  currentnessRaw: required(string),
  surfaceRole: required(nonEmptyString),
  sourceRole: required(string),
  defaultPreload: required(booleanValue),
  wordCount: required(nonNegativeNumber),
  documentCount: optional(nonNegativeInteger),
  mtimeNs: optional(string),
  ageDays: required(nullable(nonNegativeNumber)),
  sha256: optional(stringValue({ length: 64 })),
  frontmatter: required(recordOf(anyValue)),
}, { exact: true });

const hierarchyValidator = objectOf({
  id: required(nonEmptyString),
  path: required(string),
  label: required(nonEmptyString),
  parentId: required(nullable(string)),
  depth: required(nonNegativeInteger),
  kind: required(oneOf(["vault", "district", "folder", "document"])),
  authority: optional(nonEmptyString),
  currentness: optional(nonEmptyString),
  surfaceRole: optional(nonEmptyString),
  value: optional(nonNegativeNumber),
  childrenCount: required(nonNegativeInteger),
  documentCount: required(nonNegativeInteger),
  authorityL1L2: required(nonNegativeInteger),
}, { exact: true });

const matrixValidator = objectOf({
  id: required(stringValue({ prefix: "pair:" })),
  source: required(nonEmptyString),
  target: required(nonEmptyString),
  wikilink: required(nonNegativeNumber),
  wikilinkForward: required(nonNegativeNumber),
  wikilinkReverse: required(nonNegativeNumber),
  typed: required(nonNegativeNumber),
  typedForward: required(nonNegativeNumber),
  typedReverse: required(nonNegativeNumber),
  route: required(nonNegativeNumber),
  total: required(nonNegativeNumber),
});

const coverageLayerValidator = objectOf({
  unit: required(oneOf(["resolved_link_occurrence", "typed_relation", "curated_cross_district_route_pair"])),
  total: required(nonNegativeInteger),
  interDistrict: required(nonNegativeInteger),
  intraDistrict: required(nonNegativeInteger),
  displayed: required(nonNegativeInteger),
  reconciled: required(booleanValue),
  boundary: required(nonEmptyString),
});

const insightValidator = objectOf({
  schema: required(literal("atlas.insight.v1")),
  generatedAt: required(string),
  evidenceBoundary: required(nonEmptyString),
  items: required(arrayOf(objectOf({
    id: required(nonEmptyString),
    kind: required(oneOf(["latest_pulse", "strongest_relation", "knowledge_concentration", "attention"])),
    question: required(nonEmptyString),
    headline: required(nonEmptyString),
    metric: required(objectOf({
      value: required(numberOrString),
      label: required(string),
      unit: optional(string),
    })),
    evidenceRefs: required(arrayOf(string, { min: 1 })),
    targetScene: required(objectOf({
      workspace: required(oneOf(WORKSPACES)),
      scene: required(nonEmptyString),
      focusId: optional(string),
      lens: optional(literal("city")),
      relationPairId: optional(string),
      relationLayer: optional(oneOf(RELATION_LAYERS)),
      routeId: optional(string),
      eraId: optional(positiveInteger),
    })),
    confidence: required(oneOf(["high", "medium", "low"])),
    caveat: required(string),
    publicSafe: required(booleanValue),
  }), { length: 4 })),
}, { exact: true });

const publicationValidator = objectOf({
  schema: required(literal("atlas.publication.v1")),
  profile: required(oneOf(["internal", "owner", "public"])),
  generatedAt: required(string),
  publicSnapshotDigest: required(nullable(string)),
  allowedSurfaces: required(stringArray),
  excludedFields: required(stringArray),
  redactionCounts: required(recordOf(nonNegativeInteger)),
  blockers: required(stringArray),
}, { exact: true });

const agencyValidator = objectOf({
  schema: required(literal("atlas.agency.v1")),
  generatedAt: required(nonEmptyString),
  snapshot: required(objectOf({
    asOfDate: required(stringValue({ pattern: /^\d{4}-\d{2}-\d{2}$/ })),
    status: required(literal("current_at_release_capture")),
    live: required(literal(false)),
    caveat: required(nonEmptyString),
  }, { exact: true })),
  principal: required(objectOf({
    id: required(literal("agency:principal:luke")),
    label: required(literal("Luke")),
    kind: required(literal("human_principal")),
  }, { exact: true })),
  groups: required(arrayOf(objectOf({
    id: required(stringValue({ prefix: "agency:group:" })),
    label: required(nonEmptyString),
    kind: required(oneOf(["core", "independent"])),
    actorIds: required(arrayOf(stringValue({ prefix: "actor:" }))),
  }, { exact: true }), { length: 2 })),
  actors: required(arrayOf(objectOf({
    id: required(stringValue({ prefix: "actor:" })),
    label: required(nonEmptyString),
    groupId: required(stringValue({ prefix: "agency:group:" })),
    purpose: required(nonEmptyString),
    ownedSurfaceId: required(stringValue({ prefix: "surface:" })),
    publicOutput: required(nonEmptyString),
    proof: required(nonEmptyString),
    stopBoundary: required(nonEmptyString),
  }, { exact: true }), { length: 6 })),
  surfaces: required(arrayOf(objectOf({
    id: required(stringValue({ prefix: "surface:" })),
    label: required(nonEmptyString),
    actorId: required(stringValue({ prefix: "actor:" })),
  }, { exact: true }), { length: 6 })),
  links: required(arrayOf(objectOf({
    id: required(stringValue({ prefix: "link:" })),
    source: required(nonEmptyString),
    target: required(nonEmptyString),
    kind: required(oneOf(AGENCY_LINK_KINDS)),
  }, { exact: true }))),
  transition: required(objectOf({
    id: required(literal("agency:transition:role-specialization")),
    label: required(nonEmptyString),
    kind: required(literal("responsibility_specialization")),
    fromModel: required(literal("single_coordination")),
    toActorIds: required(tupleOf([
      literal("actor:control-plane"),
      literal("actor:daily-runner"),
      literal("actor:atlas-builder"),
    ])),
    evidenceStatus: required(literal("verified_operating_model")),
  }, { exact: true })),
  evidenceBoundary: required(nonEmptyString),
  projectionDigest: required(stringValue({ length: 64 })),
}, { exact: true });

const bootstrapValidator = objectOf({
  schema: required(literal("atlas.snapshot.v7")),
  version: required(string),
  generatedAt: required(string),
  snapshot: required(objectOf({
    officialCursor: optional(integer),
    stateSnapshot: optional(stringValue({ min: 16 })),
    currentStateHash: optional(stringValue({ length: 64 })),
    candidateInputHash: optional(stringValue({ length: 64 })),
    activeManifestHash: optional(stringValue({ length: 64 })),
    memoryEngineCodeHash: optional(stringValue({ length: 64 })),
    memoryIndexHash: optional(stringValue({ length: 64 })),
    memoryEngineSchema: required(string),
    memoryCorpusDigest: optional(stringValue({ length: 64 })),
    memoryFiles: required(positiveInteger),
    graphConfigHash: optional(stringValue({ length: 64 })),
    graphJsonUsedAsNodeEdgeSource: required(literal(false)),
    activeMarkdownCount: required(positiveInteger),
    archiveMarkdownCount: required(nonNegativeInteger),
    buildState: required(string),
  })),
  proofBoundary: required(recordOf(string)),
  workspaces: required(arrayOf(oneOf(WORKSPACES), { min: 5, max: 6 })),
  defaultFocus: required(string),
}, { exact: true });

const inventoryValidator = objectOf({
  schema: required(literal("atlas.inventory.v1")),
  profile: required(oneOf(ATLAS_PROFILES)),
  generatedAt: required(nonEmptyString),
  asOfDate: required(isoDate),
  physicalMarkdownCount: required(nonNegativeInteger),
  namedCount: required(nonNegativeInteger),
  aggregateCount: required(nonNegativeInteger),
  excludedCount: required(nonNegativeInteger),
  unclassifiedCount: required(literal(0)),
  reconciliation: required(objectOf({
    classifiedTotal: required(nonNegativeInteger),
    pass: required(literal(true)),
  }, { exact: true })),
  coverage: required(arrayOf(objectOf({
    id: required(nonEmptyString),
    label: required(nonEmptyString),
    physical: required(nonNegativeInteger),
    named: required(nonNegativeInteger),
    aggregate: required(nonNegativeInteger),
    excluded: required(nonNegativeInteger),
  }, { exact: true }), { min: 1 })),
  exclusions: required(objectOf({
    priority: required(tupleOf(INVENTORY_EXCLUSION_PRIORITY.map((reason) => literal(reason)))),
    byReason: required(objectOf(Object.fromEntries(
      INVENTORY_EXCLUSION_PRIORITY.map((reason) => [reason, required(nonNegativeInteger)]),
    ), { exact: true })),
  }, { exact: true })),
  publicTitlePolicy: required(objectOf({
    schema: required(literal("public-title-allowlist.v1")),
    mode: required(literal("safe_hybrid")),
    fallback: required(literal("alias_or_aggregate")),
    projectCountDisclosure: required(oneOf(["combined_non_attributable", "owner_exact"])),
  }, { exact: true })),
}, { exact: true });

const graphValidator = objectOf({
  schema: required(literal("atlas.graph.v1")),
  profile: required(oneOf(ATLAS_PROFILES)),
  generatedAt: required(nonEmptyString),
  nodes: required(arrayOf(objectOf({
    id: required(nonEmptyString),
    kind: required(oneOf(STRUCTURE_NODE_KINDS)),
    label: required(nonEmptyString),
    parentId: required(nullable(string)),
    districtId: required(nonEmptyString),
    clusterId: required(nonEmptyString),
    representedDocuments: required(nonNegativeInteger),
    gravity: required(nonNegativeInteger),
    occurrences: required(nonNegativeInteger),
    freshness: required(nullable(isoDate)),
    nameMode: required(oneOf(["approved_name", "public_alias", "aggregate", "owner_name"])),
  }, { exact: true }), { min: 1 })),
  edges: required(arrayOf(objectOf({
    id: required(nonEmptyString),
    source: required(nonEmptyString),
    target: required(nonEmptyString),
    kind: required(literal("references")),
    direction: required(literal("forward")),
    occurrenceCount: required(positiveInteger),
    defaultVisible: required(booleanValue),
  }, { exact: true }))),
  clusters: required(arrayOf(objectOf({
    id: required(nonEmptyString),
    districtId: required(nonEmptyString),
    label: required(nonEmptyString),
    nodeCount: required(positiveInteger),
    representedDocumentCount: required(nonNegativeInteger),
    representativeNodeCount: required(nonNegativeInteger),
    summary: required(nullable(nonEmptyString)),
    contour: required(objectOf({
      type: required(literal("MultiPolygon")),
      coordinates: required(arrayOf(arrayOf(arrayOf(
        tupleOf([finiteNumber, finiteNumber]),
        { min: 4 },
      )))),
    }, { exact: true })),
  }, { exact: true }), { min: 1 })),
  layout: required(objectOf({
    algorithm: required(literal("seeded-d3-force-projected-3d-v1")),
    seed: required(nonEmptyString),
    ticks: required(positiveInteger),
    axes: required(objectOf({
      x: required(objectOf({
        field: required(literal("districtId")),
        kind: required(literal("categorical_cluster")),
        direction: required(literal("left_to_right")),
      }, { exact: true })),
      y: required(objectOf({
        field: required(literal("freshness")),
        kind: required(literal("semantic_date")),
        direction: required(literal("newer_is_higher")),
        scale: required(literal("order_preserving_rank")),
      }, { exact: true })),
      z: required(objectOf({
        field: required(literal("kind")),
        kind: required(literal("structural_depth")),
        direction: required(literal("district_to_source")),
      }, { exact: true })),
    }, { exact: true })),
    bounds: required(objectOf({
      x: required(nonNegativeNumber),
      y: required(nonNegativeNumber),
      z: required(nonNegativeNumber),
      width: required(positiveNumber),
      height: required(positiveNumber),
      depth: required(positiveNumber),
    }, { exact: true })),
    undatedRail: required(objectOf({
      y: required(nonNegativeNumber),
      label: required(nonEmptyString),
    }, { exact: true })),
    coordinates: required(arrayOf(objectOf({
      id: required(nonEmptyString),
      x: required(nonNegativeNumber),
      y: required(nonNegativeNumber),
      z: required(nonNegativeNumber),
      depthLevel: required(nonNegativeInteger),
      radius: required(positiveNumber),
      dated: required(booleanValue),
      clusterIndex: required(nonNegativeInteger),
    }, { exact: true }), { min: 1 })),
    defaultNodeIds: required(stringArray),
    defaultEdgeIds: required(stringArray),
    labelBudget: required(positiveInteger),
  }, { exact: true })),
  manifest: required(objectOf({
    nodeCount: required(positiveInteger),
    edgeCount: required(nonNegativeInteger),
    clusterCount: required(positiveInteger),
    semanticDigest: required(stringValue({ length: 64 })),
    layoutDigest: required(stringValue({ length: 64 })),
    projectionDigest: required(stringValue({ length: 64 })),
  }, { exact: true })),
}, { exact: true });

const meaningSnapshotValidator = objectOf({
  release: required(nonEmptyString),
  asOfDate: required(isoDate),
  graphSemanticDigest: required(stringValue({ length: 64 })),
  graphNodeCount: required(positiveInteger),
  graphEdgeCount: required(nonNegativeInteger),
}, { exact: true });

const meaningValidator = objectOf({
  schema: required(literal("atlas.meaning.v1")),
  profile: required(oneOf(ATLAS_PROFILES)),
  generatedAt: required(nonEmptyString),
  baseline: required(meaningSnapshotValidator),
  current: required(meaningSnapshotValidator),
  protagonists: required(arrayOf(objectOf({
    id: required(nonEmptyString),
    nodeId: required(nonEmptyString),
    role: required(oneOf(["gravity_anchor", "cross_domain_bridge", "frontier_signal"])),
    thesis: required(nonEmptyString),
    caveat: required(nonEmptyString),
    metrics: required(objectOf({
      gravity: required(nonNegativeInteger),
      occurrences: required(nonNegativeInteger),
      crossDomainReach: required(nonNegativeInteger),
      bridgeCentrality: required(nonNegativeNumber),
      meaningfulDate: required(nullable(isoDate)),
      incomingCount: required(nonNegativeInteger),
      outgoingCount: required(nonNegativeInteger),
    }, { exact: true })),
    evidenceRefs: required(stringArray),
    selectionMode: required(literal("atlas_builder_judgment")),
  }, { exact: true }))),
  constellations: required(arrayOf(objectOf({
    id: required(nonEmptyString),
    focalNodeId: required(nonEmptyString),
    incomingEdgeIds: required(stringArray),
    outgoingEdgeIds: required(stringArray),
    boundedPathEdgeIds: required(stringArray),
    explanations: required(arrayOf(objectOf({
      edgeId: required(nonEmptyString),
      direction: required(oneOf(["incoming", "outgoing"])),
      statement: required(nonEmptyString),
    }, { exact: true }))),
  }, { exact: true }))),
  movements: required(arrayOf(objectOf({
    id: required(nonEmptyString),
    kind: required(oneOf([
      "node_added",
      "edge_added",
      "edge_removed",
      "gravity_shift",
      "meaningfully_updated",
      "verified_handoff",
    ])),
    label: required(nonEmptyString),
    nodeIds: required(stringArray),
    edgeIds: required(stringArray),
    previousValue: required(nullable(recordOf(anyValue))),
    currentValue: required(nullable(recordOf(anyValue))),
    evidenceRefs: required(stringArray),
    caveat: required(nonEmptyString),
  }, { exact: true }))),
  operationalCompass: required(arrayOf(objectOf({
    id: required(nonEmptyString),
    kind: required(oneOf(["direction", "stewardship", "circulation", "translation", "observation"])),
    actorId: required(nonEmptyString),
    domainIds: required(stringArray),
    label: required(nonEmptyString),
    statement: required(nonEmptyString),
  }, { exact: true }))),
  scenes: required(arrayOf(objectOf({
    id: required(oneOf(["core-gravity", "protagonists", "vault-in-motion", "operational-compass"])),
    label: required(nonEmptyString),
    thesis: required(nonEmptyString),
    focusIds: required(stringArray),
  }, { exact: true }), { min: 4, max: 4 })),
  manifest: required(objectOf({
    protagonistCount: required(nonNegativeInteger),
    constellationCount: required(nonNegativeInteger),
    movementCount: required(nonNegativeInteger),
    projectionDigest: required(stringValue({ length: 64 })),
  }, { exact: true })),
}, { exact: true });

const relationValidator = objectOf({
  districtOrder: required(arrayOf(string, { min: 1 })),
  matrix: required(arrayOf(matrixValidator)),
  typedRelations: required(arrayOf(objectOf({
    id: required(string),
    source: required(string),
    target: required(string),
    relation: required(string),
    evidence: required(string),
    state: required(string),
    layer: required(literal("typed")),
    proofState: required(string),
  }))),
  routeCoMembership: required(arrayOf(recordOf(anyValue))),
  neighborhoods: required(recordOf(arrayOf(neighborValidator))),
  magnitudeUnits: optional(recordOf(anyValue)),
  layerDefinitions: required(arrayOf(objectOf({
    id: required(oneOf(RELATION_LAYERS)),
    label: required(string),
    meaning: required(string),
    unit: optional(string),
  }))),
  availableLayers: required(arrayOf(oneOf(RELATION_LAYERS), { min: 1 })),
  redactedLayers: required(arrayOf(oneOf(RELATION_LAYERS))),
  coverage: required(objectOf({
    resolvedLinkPairs: required(nonNegativeInteger),
    resolvedLinkWeight: required(nonNegativeInteger),
    unresolvedLinks: required(recordOf(nonNegativeInteger)),
    unresolvedLinkTotal: required(nonNegativeInteger),
    ambiguousLinks: required(nonNegativeInteger),
    typedRelations: required(nonNegativeInteger),
    layers: required(objectOf({
      wikilink: required(coverageLayerValidator),
      typed: required(coverageLayerValidator),
      route: required(coverageLayerValidator),
    })),
    boundary: required(string),
  })),
}, { exact: true });

const flowValidator = objectOf({
  coordinateContract: required(objectOf({
    mode: required(literal("route_local_small_multiples")),
    sharedXAxis: required(literal(false)),
    xUnit: required(literal("route-local ordered station index")),
    crossRouteAlignmentMeaning: required(literal("none")),
    readerLabel: required(nonEmptyString),
  })),
  routes: required(arrayOf(objectOf({
    id: required(string),
    label: required(string),
    question: required(string),
    weight: required(positiveInteger),
    members: required(stringArray),
    provenance: required(oneOf(["curated_operating_lens", "resolved_wikilink_path"])),
    classifier: required(string),
    sourceRefs: required(stringArray),
    stations: required(arrayOf(objectOf({
      id: required(string),
      label: required(string),
      order: required(integer),
      entityId: required(nullable(string)),
      external: required(booleanValue),
      kind: optional(oneOf(["standard", "proof_gate", "external"])),
    }))),
  }))),
  pulse: required(objectOf({
    latestDailyId: required(nullable(string)),
    latestDailyDate: required(nullable(string)),
    sourceItemCount: required(nullable(finiteNumber)),
    chains: required(arrayOf(recordOf(anyValue))),
  })),
}, { exact: true });

const temporalValidator = objectOf({
  eras: required(arrayOf(objectOf({
    id: required(positiveInteger),
    title: required(string),
    range: required(string),
    thesis: required(string),
    evidenceRefs: required(stringArray),
    evidenceClass: required(string),
    deltas: required(arrayOf(objectOf({
      state: required(oneOf(["born", "persisted", "weakened", "retired", "unknown"])),
      label: required(string),
      evidenceRef: required(string),
      evidenceAnchor: required(string),
      evidenceClass: required(string),
      evidenceStatus: required(literal("recorded")),
    }))),
    unknown: required(stringArray),
    proofBoundary: required(string),
  }))),
  currentEra: required(nullable(positiveInteger)),
}, { exact: true });

const activityValidator = objectOf({
  schema: required(literal("atlas.activity.v1")),
  profile: required(literal("atlas-owner")),
  generatedAt: required(nonEmptyString),
  asOfDate: required(isoDate),
  live: required(literal(false)),
  boundary: required(nonEmptyString),
  aggregates: required(arrayOf(objectOf({
    role: required(nonEmptyString),
    unitType: required(nonEmptyString),
    status: required(nonEmptyString),
    date: required(nullable(isoDate)),
    count: required(positiveInteger),
  }, { exact: true }))),
  lifecycle: required(arrayOf(objectOf({
    date: required(isoDate),
    created: required(nonNegativeInteger),
    completed: required(nonNegativeInteger),
    stopped: required(nonNegativeInteger),
  }, { exact: true }))),
}, { exact: true });

const entityPackValidator = objectOf({
  entities: required(arrayOf(entityValidator, { min: 1 })),
  searchFields: required(stringArray),
}, { exact: true });

const healthValidator = objectOf({
  memoryEngine: required(recordOf(anyValue)),
  currentnessCounts: required(recordOf(finiteNumber)),
  authorityCounts: required(recordOf(finiteNumber)),
  unresolvedLinks: required(recordOf(finiteNumber)),
  ambiguousAutoSelections: required(literal(0)),
  unresolvedTypedRelations: required(literal(0)),
  activeIsolates: required(stringArray),
  countReconciliation: required(objectOf({
    entities: required(positiveInteger),
    memoryFiles: required(positiveInteger),
    hierarchyDocuments: required(positiveInteger),
    pass: required(literal(true)),
  })),
}, { exact: true });

const atlasValidator = objectOf({
  bootstrap: required(bootstrapValidator),
  inventory: required(inventoryValidator),
  graph: required(graphValidator),
  meaning: required(meaningValidator),
  relation: required(relationValidator),
  flow: required(flowValidator),
  temporal: required(temporalValidator),
  entity: required(entityPackValidator),
  health: required(healthValidator),
  insight: required(insightValidator),
  publication: required(publicationValidator),
  agency: required(agencyValidator),
  activity: optional(activityValidator),
}, { exact: true });

export function collectAtlasShapeFailures(candidate: unknown): AtlasShapeIssue[] {
  const issues: AtlasShapeIssue[] = [];
  atlasValidator(candidate, "atlas", issues);
  return issues;
}
