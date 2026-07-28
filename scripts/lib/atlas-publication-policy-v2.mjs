import path from "node:path";
import { scanOperatingExposure, scanPrivacyText } from "./privacy-scanner.mjs";
import { structureKindForDocument } from "./v7-4-profile-contract.mjs";

const compareText = (left, right) => String(left).localeCompare(String(right), "en");
const rawDateTitle = /^\d{4}(?:-\d{2}){1,2}(?:\b|[_ -])/;

function topLevel(relativePath) {
  return relativePath.split("/")[0] ?? "";
}

function matchesExcludedSegment(relativePath, policy) {
  const segments = relativePath.split("/");
  return policy.excludedPathSegments.some((segment) => segments.includes(segment));
}

function normalizeDisplayTitle(title, policy) {
  let display = String(title).normalize("NFC").trim();
  if (policy.display.stripLeadingStrategyCode) {
    let previous;
    do {
      previous = display;
      display = display
        .replace(/^(?:SI|SR)-\d+\s*[-—–:]\s*/i, "")
        .replace(/^(?:SI|SR)-\d+\s+/i, "");
    } while (display !== previous);
  }
  if (policy.display.stripLeadingBracketNumber) {
    display = display.replace(/^\[\d+\]\s*/, "");
  }
  return display.replace(/\s+/g, " ").trim();
}

function titleFindings(title) {
  return [
    ...scanPrivacyText(title, { path: "title" }),
    ...scanOperatingExposure(title, { path: "title" }),
  ];
}

function initialDisposition(record, profile, policy) {
  const root = topLevel(record.relativePath);
  const basename = path.posix.basename(record.relativePath, ".md");
  const kind = structureKindForDocument(record.relativePath, record.frontmatter);
  if (matchesExcludedSegment(record.relativePath, policy)) {
    return { disposition: "excluded", reason: "excluded_path", root, kind };
  }
  if (policy.excludedBasenames.includes(basename)) {
    return { disposition: "excluded", reason: "structural_scaffolding", root, kind };
  }
  if (rawDateTitle.test(basename)) {
    return { disposition: "excluded", reason: "dated_note", root, kind };
  }
  if (policy.excludedTitlePatterns.some((pattern) => new RegExp(pattern, "i").test(basename))) {
    return { disposition: "excluded", reason: "operating_surface", root, kind };
  }
  if (kind === "strategy_request") {
    return { disposition: "excluded", reason: "strategy_request", root, kind };
  }
  const allowedRoots = profile === "atlas-public"
    ? policy.publicRoots
    : [...policy.publicRoots, ...policy.ownerAdditionalRoots];
  if (allowedRoots.includes(root)) {
    return { disposition: "named", reason: null, root, kind };
  }
  if (root === "Strategy" && kind === "strategy_insight") {
    return { disposition: "conditional", reason: null, root, kind };
  }
  return { disposition: "excluded", reason: "unsupported_root", root, kind };
}

export function validatePublicationPolicyV2(policy) {
  const failures = [];
  if (policy?.schema !== "atlas.publication_policy.v2") failures.push("schema");
  if (policy?.mode !== "actual_safe_names") failures.push("mode");
  if (!Array.isArray(policy?.publicRoots) || policy.publicRoots.length !== 6) failures.push("public-roots");
  if (new Set(policy?.publicRoots ?? []).size !== policy?.publicRoots?.length) failures.push("public-root-duplicates");
  if (policy?.display?.fallbackAliases !== false) failures.push("fallback-aliases");
  if (policy?.reconciliation?.requireUnclassifiedZero !== true) failures.push("unclassified");
  return failures;
}

export function classifyRecordsWithPublicationPolicy(records, resolvedEdges, profile, policy) {
  if (!["atlas-public", "atlas-owner"].includes(profile)) {
    throw new TypeError(`Unsupported Atlas profile ${profile}.`);
  }
  const policyFailures = validatePublicationPolicyV2(policy);
  if (policyFailures.length) {
    throw new Error(`Publication policy v2 blocked: ${policyFailures.join(", ")}.`);
  }
  const preliminary = new Map(records.map((record) => [
    record.relativePath,
    initialDisposition(record, profile, policy),
  ]));
  const primaryNamed = new Set([...preliminary]
    .filter(([, value]) => value.disposition === "named")
    .map(([relativePath]) => relativePath));
  const connectedStrategy = new Set();
  for (const edge of resolvedEdges) {
    const source = preliminary.get(edge.sourcePath);
    const target = preliminary.get(edge.targetPath);
    if (source?.disposition === "conditional" && primaryNamed.has(edge.targetPath)) {
      connectedStrategy.add(edge.sourcePath);
    }
    if (target?.disposition === "conditional" && primaryNamed.has(edge.sourcePath)) {
      connectedStrategy.add(edge.targetPath);
    }
  }

  const classified = records.map((record) => {
    const initial = preliminary.get(record.relativePath);
    let disposition = initial.disposition;
    let reason = initial.reason;
    if (disposition === "conditional") {
      disposition = connectedStrategy.has(record.relativePath) ? "named" : "excluded";
      reason = disposition === "named" ? null : "disconnected_strategy_insight";
    }
    const displayTitle = normalizeDisplayTitle(record.title, policy);
    const findings = titleFindings(displayTitle);
    if (disposition === "named" && (!displayTitle || findings.length)) {
      disposition = "excluded";
      reason = !displayTitle ? "empty_display_title" : "sensitive_title";
    }
    return {
      ...record,
      domain: initial.root,
      kind: initial.kind,
      displayTitle,
      classification: {
        disposition,
        reason,
        titleFindings: findings.map((finding) => finding.id).sort(compareText),
      },
    };
  });

  const named = classified.filter((record) => record.classification.disposition === "named");
  const excluded = classified.filter((record) => record.classification.disposition === "excluded");
  const unclassified = classified.length - named.length - excluded.length;
  const byReason = {};
  for (const record of excluded) {
    const reason = record.classification.reason ?? "unknown";
    byReason[reason] = (byReason[reason] ?? 0) + 1;
  }
  const byDomain = {};
  for (const record of classified) {
    const current = byDomain[record.domain] ?? { physical: 0, named: 0, aggregate: 0, excluded: 0 };
    current.physical += 1;
    current[record.classification.disposition] += 1;
    byDomain[record.domain] = current;
  }
  const inventory = {
    schema: "atlas.inventory.v1",
    profile,
    generatedAt: null,
    physicalMarkdownCount: classified.length,
    namedCount: named.length,
    aggregateCount: 0,
    excludedCount: excluded.length,
    unclassifiedCount: unclassified,
    reconciliation: {
      classifiedTotal: named.length + excluded.length,
      pass: unclassified === 0 && named.length + excluded.length === classified.length,
    },
    coverage: Object.entries(byDomain)
      .map(([domain, counts]) => ({ domain, ...counts }))
      .sort((left, right) => compareText(left.domain, right.domain)),
    exclusions: {
      byReason: Object.fromEntries(Object.entries(byReason).sort(([left], [right]) => compareText(left, right))),
    },
    publicationPolicy: {
      schema: policy.schema,
      version: policy.version,
      mode: policy.mode,
      aggregateMode: policy.reconciliation.aggregateMode,
    },
  };
  if (!inventory.reconciliation.pass) {
    throw new Error(`Publication reconciliation blocked for ${profile}.`);
  }
  return { classified, named, excluded, inventory };
}
