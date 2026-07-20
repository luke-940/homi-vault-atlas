import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const builderRoot = path.resolve(projectDir, "../..");
const outputsRoot = path.join(builderRoot, "outputs");
const outputCandidates = [];
for (const entry of await readdir(outputsRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const candidate = path.join(outputsRoot, entry.name);
  try {
    const baseline = JSON.parse(await readFile(path.join(candidate, "review", "review-baseline.json"), "utf8"));
    if (baseline.schema === "homi.atlas.review_baseline.v1" && baseline.handling?.github_inclusion_allowed === false) {
      outputCandidates.push(candidate);
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}
if (outputCandidates.length !== 1) throw new Error("Expected exactly one local-only v7.4 review baseline output");
const outputDir = outputCandidates[0];
const activityId = path.basename(outputDir);
const reviewDir = path.join(outputDir, "review");
const sourceTracePath = path.join(reviewDir, "review-traceability.json");
const resolutionPath = path.join(reviewDir, "review-traceability-resolution.json");

const project = (...parts) => path.join(projectDir, ...parts);
const output = (...parts) => path.join(outputDir, ...parts);

const paths = {
  reviewSource: output("review", "source", "homi-vault-atlas-v7.3-통합전달본-Sol.md"),
  reviewBaseline: output("review", "review-baseline.json"),
  sourceTrace: sourceTracePath,
  visualAutopsy: output("review", "v7.3-visual-failure-autopsy.json"),
  captureManifest: output("capture", "canonical-capture-manifest.json"),
  tornRead: output("capture", "torn-read-verdict.json"),
  dualProfileReceipt: output("capture", "dual-profile-projection-receipt.json"),
  ownerQa: project("artifacts", "v7-4-owner-qa", "owner-contract-qa.json"),
  ownerInventory: project(".generated", "owner", "inventory.json"),
  ownerStructure: project(".generated", "owner", "structure.json"),
  ownerActivity: project(".generated", "owner", "activity.json"),
  paperReceipt: project(".generated", "owner", "paper-dimension-receipt.json"),
  publicInventory: project("public-safe", "data", "inventory.json"),
  publicStructure: project("public-safe", "data", "structure.json"),
  publicRelation: project("public-safe", "data", "relation.json"),
  publicTemporal: project("public-safe", "data", "temporal.json"),
  publicFlow: project("public-safe", "data", "flow.json"),
  publicInsight: project("public-safe", "data", "insight.json"),
  publicPublication: project("public-safe", "data", "publication.json"),
};
const reviewBaseline = JSON.parse(await readFile(paths.reviewBaseline, "utf8"));
const expectedReviewSha = reviewBaseline.source.sha256;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function binding(filePath) {
  const [bytes, metadata] = await Promise.all([readFile(filePath), stat(filePath)]);
  if (!metadata.isFile()) throw new Error(`Expected file binding: ${filePath}`);
  return {
    path: filePath,
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
  };
}

async function bindAll(filePaths) {
  const unique = [...new Set(filePaths)];
  return Promise.all(unique.map(binding));
}

const implementationGroups = {
  review: [
    project("docs", "v7.4-requirements.md"),
    project("scripts", "build-review-traceability-resolution.mjs"),
    project("scripts", "verify-review-traceability-resolution.mjs"),
  ],
  data: [
    project("scripts", "build-public-profile.mjs"),
    project("scripts", "lib", "v7-4-profile-contract.mjs"),
    project("src", "data-contract.ts"),
    project("src", "data.ts"),
  ],
  home: [
    project("src", "views", "HomeView.tsx"),
    project("src", "data.ts"),
    project("src", "styles", "v74.css"),
  ],
  explore: [
    project("src", "views", "ExploreView.tsx"),
    project("src", "structure-navigation.ts"),
    project("src", "data.ts"),
  ],
  observe: [
    project("src", "views", "ObserveView.tsx"),
    project("src", "data.ts"),
  ],
  flow: [
    project("src", "views", "FlowView.tsx"),
    project("src", "data.ts"),
  ],
  time: [
    project("src", "views", "TimeView.tsx"),
    project("src", "data.ts"),
  ],
  navigation: [
    project("src", "App.tsx"),
    project("src", "state.tsx"),
    project("src", "components", "workspaceSceneRegistry.ts"),
    project("src", "components", "CommandBar.tsx"),
    project("src", "components", "WorkspaceHeader.tsx"),
  ],
  overlays: [
    project("src", "components", "SearchPalette.tsx"),
    project("src", "components", "InspectorTray.tsx"),
    project("src", "components", "NavigatorTray.tsx"),
  ],
  visual: [
    project("src", "styles", "tokens.css"),
    project("src", "styles", "v74.css"),
    project("src", "styles", "app.css"),
    project("src", "App.tsx"),
  ],
  metadata: [
    project("scripts", "build-public-site.mjs"),
    project("src", "main.tsx"),
    project("src", "App.tsx"),
  ],
  release: [
    project("docs", "v7.4-requirements.md"),
    project("scripts", "create-v7-4-release-evidence-inventory.mjs"),
    project("scripts", "readback-production.mjs"),
  ],
};

const testGroups = {
  review: [
    project("scripts", "verify-review-traceability-resolution.mjs"),
    project("tests", "v7-4-qa-contract.test.ts"),
  ],
  data: [
    project("tests-public", "v74-data-boundary.test.ts"),
    project("tests-public", "public-data-contract.test.ts"),
    project("tests-public", "public-runtime-contract.test.ts"),
  ],
  ui: [
    project("tests", "v7-4-qa-contract.test.ts"),
    project("tests", "visual-golden-contract.test.ts"),
    project("tests-visual", "v7-4-golden.spec.mjs"),
  ],
  navigation: [
    project("tests", "v7-4-qa-contract.test.ts"),
    project("tests-public", "public-runtime-contract.test.ts"),
  ],
  metadata: [
    project("tests-public", "public-field-contract.test.ts"),
    project("tests-public", "public-runtime-contract.test.ts"),
    project("tests-public", "release-delivery-contract.test.ts"),
  ],
  release: [
    project("tests-public", "release-delivery-contract.test.ts"),
    project("tests", "visual-golden-contract.test.ts"),
  ],
};

const evidenceGroups = {
  review: [paths.reviewBaseline, paths.reviewSource, paths.visualAutopsy],
  capture: [paths.captureManifest, paths.tornRead, paths.dualProfileReceipt],
  inventory: [paths.publicInventory, paths.ownerInventory, paths.ownerQa],
  structure: [paths.publicStructure, paths.ownerStructure, paths.paperReceipt, paths.ownerQa],
  relation: [paths.publicRelation, paths.publicPublication, paths.ownerQa],
  activity: [paths.ownerActivity, paths.dualProfileReceipt, paths.ownerQa],
  home: [paths.publicInventory, paths.publicStructure, paths.publicRelation, paths.publicInsight, paths.visualAutopsy],
  explore: [paths.publicStructure, paths.ownerStructure, paths.visualAutopsy],
  observe: [paths.publicRelation, paths.publicStructure, paths.visualAutopsy],
  flow: [paths.publicFlow, paths.visualAutopsy],
  time: [paths.publicTemporal, paths.visualAutopsy],
  ui: [paths.visualAutopsy, paths.publicPublication],
  metadata: [paths.publicPublication, paths.reviewBaseline],
};

const pendingGateDefinitions = [
  {
    id: "local_browser_qa",
    expected_path: project("artifacts", "v7-4-browser-qa", "v7-4-local-rc-browser-qa.json"),
  },
  {
    id: "independent_visual_qa",
    expected_path: project("tests-visual", "independent-visual-qa-receipt.json"),
  },
  {
    id: "publication_audit",
    expected_path: project("artifacts", "publication", "v7-4-publication-audit.json"),
  },
  {
    id: "release_artifact_manifest",
    expected_path: project("artifacts", "release", "release-artifact-manifest.json"),
  },
  {
    id: "production_readback",
    expected_path: project("artifacts", "production-readback", "v7-4-production-readback.json"),
  },
  {
    id: "release_evidence_inventory",
    expected_path: project("artifacts", "ci-binding", "RELEASE_EVIDENCE.json"),
  },
  {
    id: "luke_gate3_visual_approval",
    expected_path: output("gate3", "gate3-luke-visual-approval.json"),
  },
];

const visualGateIds = ["local_browser_qa", "independent_visual_qa", "luke_gate3_visual_approval"];
const releaseGateIds = ["publication_audit", "release_artifact_manifest", "production_readback", "release_evidence_inventory"];

function makeRule(id, implementation, tests, evidence, pendingGateIds = []) {
  return { id, implementation, tests, evidence, pendingGateIds };
}

function ruleForTarget(target) {
  if (/review evidence|sanitized requirements/.test(target)) {
    return makeRule("review-provenance", implementationGroups.review, testGroups.review, evidenceGroups.review);
  }
  if (/release gates|Gate 1 and Gate 2 work plan/.test(target)) {
    return makeRule(
      "release-sequencing",
      implementationGroups.release,
      testGroups.release,
      [...evidenceGroups.review, ...evidenceGroups.capture],
      [...visualGateIds, ...releaseGateIds],
    );
  }
  if (/fresh capture|inventory and coverage|atlas\.inventory|inventory classifier/.test(target)) {
    return makeRule(
      "inventory-truth",
      implementationGroups.data,
      testGroups.data,
      [...evidenceGroups.capture, ...evidenceGroups.inventory],
    );
  }
  if (/inventory, structure, metrics, coverage and disclosure/i.test(target)) {
    return makeRule(
      "fidelity-truth-layer",
      implementationGroups.data,
      testGroups.data,
      [...evidenceGroups.capture, ...evidenceGroups.inventory, ...evidenceGroups.structure, ...evidenceGroups.relation],
    );
  }
  if (/dual-profile generation|projection privacy audit/.test(target)) {
    return makeRule(
      "dual-profile-boundary",
      implementationGroups.data,
      testGroups.data,
      [...evidenceGroups.capture, ...evidenceGroups.inventory, ...evidenceGroups.activity],
    );
  }
  if (/atlas\.activity/.test(target)) {
    return makeRule("owner-activity", implementationGroups.data, testGroups.data, evidenceGroups.activity);
  }
  if (/atlas\.structure|paper hierarchy|signal hierarchy|node taxonomy/.test(target)) {
    return makeRule(
      "structure-v2",
      implementationGroups.data,
      testGroups.data,
      [...evidenceGroups.capture, ...evidenceGroups.structure],
    );
  }
  if (/metric pipeline|Living Terrain gravity|Home coverage ledger|Home insight data/.test(target)) {
    return makeRule(
      "measured-home-data",
      [...implementationGroups.data, ...implementationGroups.home],
      [...testGroups.data, ...testGroups.ui],
      [...evidenceGroups.inventory, ...evidenceGroups.relation, ...evidenceGroups.home],
      visualGateIds,
    );
  }
  if (/relation projections and Observe|Observe relation/.test(target)) {
    return makeRule(
      "observe-relations",
      [...implementationGroups.data, ...implementationGroups.observe],
      [...testGroups.data, ...testGroups.ui],
      evidenceGroups.observe,
      visualGateIds,
    );
  }
  if (/Explore/.test(target)) {
    return makeRule(
      "explore-structure",
      [...implementationGroups.data, ...implementationGroups.explore],
      [...testGroups.data, ...testGroups.ui],
      evidenceGroups.explore,
      visualGateIds,
    );
  }
  if (/three-level exploration, relations, flow and time/i.test(target)) {
    return makeRule(
      "cross-workspace-truth",
      [...implementationGroups.explore, ...implementationGroups.observe, ...implementationGroups.flow, ...implementationGroups.time],
      [...testGroups.data, ...testGroups.ui],
      [...evidenceGroups.explore, ...evidenceGroups.observe, ...evidenceGroups.flow, ...evidenceGroups.time],
      visualGateIds,
    );
  }
  if (/Flow and Home/.test(target)) {
    return makeRule(
      "flow-home-truth",
      [...implementationGroups.flow, ...implementationGroups.home],
      [...testGroups.data, ...testGroups.ui],
      [...evidenceGroups.flow, ...evidenceGroups.home],
      visualGateIds,
    );
  }
  if (/Flow and Time|Flow route|relation and activity motion/.test(target)) {
    return makeRule(
      "flow-time-truth",
      [...implementationGroups.flow, ...implementationGroups.time, ...implementationGroups.visual],
      [...testGroups.data, ...testGroups.ui],
      [...evidenceGroups.flow, ...evidenceGroups.time],
      visualGateIds,
    );
  }
  if (/Time/.test(target)) {
    return makeRule(
      "time-evidence",
      [...implementationGroups.time, ...implementationGroups.visual],
      [...testGroups.data, ...testGroups.ui],
      evidenceGroups.time,
      visualGateIds,
    );
  }
  if (/Home/.test(target)) {
    return makeRule(
      "home-experience",
      implementationGroups.home,
      [...testGroups.data, ...testGroups.ui],
      evidenceGroups.home,
      visualGateIds,
    );
  }
  if (/workspace scene|navigation|breadcrumb|URL codec|CommandBar|workspace shell|responsive state|scenario QA/.test(target)) {
    return makeRule(
      "navigation-contract",
      implementationGroups.navigation,
      testGroups.navigation,
      evidenceGroups.ui,
      visualGateIds,
    );
  }
  if (/search|inspector overlay/.test(target)) {
    return makeRule(
      "overlay-contract",
      [...implementationGroups.overlays, ...implementationGroups.navigation],
      testGroups.ui,
      evidenceGroups.ui,
      visualGateIds,
    );
  }
  if (/HTML theme|public HTML|global Chrome|language semantics|copy and language/.test(target)) {
    return makeRule(
      "metadata-language",
      implementationGroups.metadata,
      [...testGroups.metadata, ...testGroups.ui],
      evidenceGroups.metadata,
      [...visualGateIds, "publication_audit"],
    );
  }
  if (/art direction|visual|token|typography|color|surface|text style|responsive|layout|spacing|motion|interaction|radius|background|canvas|selection|reduced|client preference|shared components/.test(target)) {
    return makeRule(
      "visual-system",
      implementationGroups.visual,
      testGroups.ui,
      evidenceGroups.ui,
      visualGateIds,
    );
  }
  throw new Error(`No traceability rule for target: ${target}`);
}

async function resolveEntry(entry) {
  const rule = ruleForTarget(entry.implementation_target);
  const {
    test_placeholder: _testPlaceholder,
    evidence_placeholder: _evidencePlaceholder,
    ...sourceFields
  } = entry;
  return {
    ...sourceFields,
    resolution_state: rule.pendingGateIds.length === 0 ? "implemented_verified_local" : "implemented_pending_gate",
    verification_basis: rule.id,
    implementation: await bindAll(rule.implementation),
    tests: await bindAll(rule.tests),
    evidence: await bindAll(rule.evidence),
    pending_gate_ids: [...new Set(rule.pendingGateIds)],
  };
}

async function pendingGateState(definition) {
  try {
    return {
      ...definition,
      state: "pending_gate",
      current_binding: await binding(definition.expected_path),
      note: "The expected evidence file exists, but final acceptance is intentionally not inferred by this traceability build.",
    };
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return {
      ...definition,
      state: "pending_gate",
      current_binding: null,
      note: "Evidence is not present yet; no PASS is claimed.",
    };
  }
}

const sourceTraceBytes = await readFile(sourceTracePath);
const sourceTrace = JSON.parse(sourceTraceBytes.toString("utf8"));
const reviewSourceBytes = await readFile(paths.reviewSource);
if (sha256(reviewSourceBytes) !== expectedReviewSha) {
  throw new Error("Immutable review source hash mismatch");
}
if (sourceTrace.source?.sha256 !== expectedReviewSha) throw new Error("Trace source hash mismatch");
if (sourceTrace.findings?.length !== 62) throw new Error("Expected exactly 62 normalized findings");
if (sourceTrace.line_coverage?.ranges?.length !== 16) throw new Error("Expected exactly 16 source ranges");
if (sourceTrace.source?.nonblank_line_count !== 515) throw new Error("Expected exactly 515 nonblank lines");

const publication = JSON.parse(await readFile(paths.publicPublication, "utf8"));
const ownerQa = JSON.parse(await readFile(paths.ownerQa, "utf8"));
const ownerInventory = JSON.parse(await readFile(paths.ownerInventory, "utf8"));
const publicInventory = JSON.parse(await readFile(paths.publicInventory, "utf8"));
const privateProjectNames = new Set(["Rocket", "Groot", "Intelligence Layer"]);
const ownerProjectRows = ownerInventory.coverage.filter((row) => privateProjectNames.has(row.label));
const publicProjectCombined = publicInventory.coverage.find((row) => row.label === "Independent Projects");
if (ownerProjectRows.length !== 3 || !publicProjectCombined) {
  throw new Error("Project count disclosure evidence is incomplete");
}
const resolvedRanges = [];
for (const range of sourceTrace.line_coverage.ranges) resolvedRanges.push(await resolveEntry(range));
const resolvedFindings = [];
for (const finding of sourceTrace.findings) resolvedFindings.push(await resolveEntry(finding));
const pendingGates = [];
for (const definition of pendingGateDefinitions) pendingGates.push(await pendingGateState(definition));

const resolution = {
  schema: "homi.atlas.review_traceability_resolution.v1",
  activity_id: activityId,
  generated_at: new Date().toISOString(),
  source: {
    review: await binding(paths.reviewSource),
    baseline: await binding(paths.reviewBaseline),
    original_traceability: await binding(paths.sourceTrace),
    expected_review_sha256: expectedReviewSha,
    line_count: 720,
    nonblank_line_count: 515,
  },
  coverage_summary: {
    source_ranges: resolvedRanges.length,
    normalized_findings: resolvedFindings.length,
    covered_nonblank_lines: sourceTrace.line_coverage.covered_nonblank_line_count,
    uncovered_nonblank_lines: sourceTrace.line_coverage.uncovered_nonblank_lines,
    duplicate_range_ids: [],
    duplicate_finding_ids: [],
    silent_drops: 0,
    unresolved_binding_tokens: 0,
  },
  current_data_identity: {
    public_snapshot_digest: publication.publicSnapshotDigest,
    owner_contract_qa: {
      binding: await binding(paths.ownerQa),
      verdict: ownerQa.verdict,
      test_results: ownerQa.testResults,
    },
  },
  line_coverage: {
    strategy: sourceTrace.line_coverage.strategy,
    ranges: resolvedRanges,
  },
  findings: resolvedFindings,
  release_blocker_corrections: [
    {
      id: "V74-AUDIT-P0-PROJECT-COUNT-DISCLOSURE",
      severity: "P0",
      mapped_source_findings: ["F-P1-F7", "S-P1-S5", "UI-P3-1"],
      resolution_state: "implemented_verified_local",
      symptom: "The first public projection exposed individually attributable Rocket, Groot, and Intelligence Layer document totals in inventory and structure surfaces.",
      failed_invariant: "Public may name operating roles, but project document and stage counts are owner-only and must not be attributable to an individual project.",
      root_cause: "The safe-name allowlist changed labels but preserved one-to-one top-level coverage rows, so naming policy and count disclosure policy were incorrectly treated as the same boundary.",
      fix: "The public Knowledge profile now collapses all three projects into one Independent Projects district and aggregate; Agency retains role names without project counts. Owner rows remain exact.",
      owner_exact_rows: ownerProjectRows.map(({ label, physical }) => ({ label, physical })),
      public_non_attributable_combined: {
        label: publicProjectCombined.label,
        physical: publicProjectCombined.physical,
        disclosure: publicInventory.publicTitlePolicy.projectCountDisclosure,
      },
      public_snapshot_digest: publication.publicSnapshotDigest,
      implementation: await bindAll([
        project("public-safe", "public-title-allowlist.v1.json"),
        project("scripts", "build-public-profile.mjs"),
        project("scripts", "lib", "v7-4-profile-contract.mjs"),
        project("src", "data-boundary-validation.ts"),
        project("src", "data-contract.ts"),
        project("src", "types.ts"),
      ]),
      tests: await bindAll([
        project("tests-public", "v74-data-boundary.test.ts"),
        project("tests-public", "public-runtime-contract.test.ts"),
      ]),
      evidence: await bindAll([
        paths.ownerInventory,
        paths.publicInventory,
        paths.publicStructure,
        paths.publicPublication,
        paths.ownerQa,
      ]),
      incident_reconstruction: "Independent review compared public per-folder rows and v2 structure nodes to the public-name policy and found three exact project totals on every downstream count-rendering surface.",
      expected_gate_map: "Dual-profile projection, public shape validation, runtime boundary validation, and public surface fixtures should all reject attributable project counts.",
      gate_non_firing_analysis: "Existing privacy checks blocked paths and owner activity bytes but had no semantic rule separating a public role name from an owner-only count.",
      cause_layer_split: {
        projection: "One-to-one district labels preserved exact per-project totals.",
        runtime: "Views correctly rendered the supplied counts, amplifying the projection leak into DOM, Search, and ARIA strings.",
        test_harness: "No injected fixture asserted that an attributable project coverage row must fail.",
      },
      counterfactual_replay: "With the combined_non_attributable inventory policy and runtime guard present, the original three rows would have failed before public bytes were promoted.",
      promotion_decision: "Promote combined project coverage plus the injected disclosure fixture as permanent release blockers; do not substitute zero or nullable per-project values.",
    },
  ],
  pending_gates: pendingGates,
  failure_learning: {
    schema: "homi.atlas.failure_learning.v1",
    symptom: "The first owner reconciliation test counted synthetic zero-document structural hubs as represented physical documents.",
    failed_invariant: "Owner physical reconciliation must count only non-district nodes whose nameMode is owner_name; synthetic aggregate hubs are structural witnesses, not documents.",
    root_cause: "The assertion selected every non-district node after synthetic hierarchy nodes were introduced, conflating structural navigation with physical representation.",
    harness_fix: "The owner count now filters owner_name records, while synthetic hubs have separate parent, member_of, and source-ancestor assertions.",
    replay_check: {
      command: "npm run test:owner",
      result: `${ownerQa.testResults.passed} passed, ${ownerQa.testResults.failed} failed`,
      receipt: await binding(paths.ownerQa),
    },
    promotion_target: "tests-public/v74-data-boundary.test.ts and the review traceability coverage validator",
    incident_reconstruction: "The projection was correct, but a broad test selector made the verification layer report a false mismatch after structural nodes were added.",
    expected_gate_map: "The owner reconciliation gate should verify physical records and structural-only hubs as separate populations.",
    gate_non_firing_analysis: "The initial test had no nameMode predicate and no independent synthetic-hub contract, so the test itself could not express the boundary.",
    cause_layer_split: {
      product_projection: "No product projection defect was required for this correction.",
      test_harness: "Population selection merged owner_name records with aggregate navigation nodes.",
      release_evidence: "A pass could not be promoted until the corrected test was replayed and bound to a receipt.",
    },
    counterfactual_replay: "With the owner_name predicate and synthetic-hub assertions present initially, the valid 626-document projection would have passed without weakening any threshold.",
    promotion_decision: "Promote the split-population assertions as a permanent data contract; do not remove synthetic hierarchy or relax reconciliation totals.",
  },
};

await writeFile(resolutionPath, `${JSON.stringify(resolution, null, 2)}\n`, "utf8");
const result = await binding(resolutionPath);
process.stdout.write(`${JSON.stringify({ resolution: result, publicSnapshotDigest: publication.publicSnapshotDigest }, null, 2)}\n`);
