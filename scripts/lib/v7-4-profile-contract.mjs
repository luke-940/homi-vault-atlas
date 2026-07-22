import { createHash } from "node:crypto";
import path from "node:path";

export const INVENTORY_EXCLUSION_PRIORITY = Object.freeze([
  "archive",
  "scaffolding",
  "control_internal",
  "raw_daily",
  "explicit_policy",
  "public_name_not_approved",
]);

export const STRUCTURE_NODE_KINDS = Object.freeze([
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
]);

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const dailyPathPattern = /(?:^|\/)Research\/Daily\/\d{4}-\d{2}\/(\d{4}-\d{2}-\d{2})\.md$/;
const weeklyDatePattern = /(?:^|\/)Research\/Weekly\/(?:[^/]+\/)*(\d{4}-\d{2}-\d{2})(?:[^/]*)\.md$/;

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort(compareText)
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function stableDigest(value) {
  return sha256(stableJson(value));
}

export async function cacheVerifiedWitnessBytes(witnesses, readBytes) {
  const cache = new Map();
  for (const witness of witnesses) {
    const body = await readBytes(witness.sourcePath);
    if (body.length !== witness.bytes || sha256(body) !== witness.secondSha256) {
      throw new Error(`Captured witness drift at ${path.basename(witness.sourcePath)}.`);
    }
    cache.set(witness.sourcePath, body);
  }
  return cache;
}

export function privacySafeDigestToken(value, length = 18) {
  const alphabet = "abcdefghijklmnop";
  return stableDigest(value)
    .slice(0, length)
    .replace(/[0-9a-f]/g, (character) => alphabet[Number.parseInt(character, 16)]);
}

export function parseFrontmatterScalarMap(markdown) {
  if (typeof markdown !== "string" || !markdown.startsWith("---\n")) return {};
  const closing = markdown.indexOf("\n---\n", 4);
  if (closing < 0) return {};
  const output = {};
  for (const line of markdown.slice(4, closing).split("\n")) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    const [, key, raw] = match;
    output[key] = raw.replace(/^['"]|['"]$/g, "");
  }
  return output;
}

export function semanticDateForDocument(relativePath, frontmatter) {
  for (const key of [
    "last_reviewed",
    "moc_last_reviewed",
    "last_updated",
    "updated",
    "published",
    "date",
    "created",
  ]) {
    const candidate = String(frontmatter?.[key] ?? "").slice(0, 10);
    if (datePattern.test(candidate)) return candidate;
  }
  return dailyPathPattern.exec(relativePath)?.[1]
    ?? weeklyDatePattern.exec(relativePath)?.[1]
    ?? null;
}

export function extractWikilinkTargets(markdown) {
  const targets = [];
  for (const match of markdown.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const target = match[1].split("|")[0].split("#")[0].trim();
    if (target) targets.push(target.replaceAll("\\", "/"));
  }
  return targets;
}

export function structureKindForDocument(relativePath, frontmatter) {
  const basename = path.posix.basename(relativePath, ".md");
  if (relativePath.startsWith("MOC/")) return "moc_hub";
  if (relativePath.startsWith("Papers/")
    && (relativePath.includes("/Paper Atlas/")
      || /(?:^|[\s,_-])(?:paper[\s_-]*atlas|paper[\s_-]*gateway)(?:$|[\s,_-])/i.test(basename)
      || /(?:^|[\s,[{])PaperAtlas(?:$|[\s,\]}])/i.test(String(frontmatter?.tags ?? ""))
      || /paper_gateway/i.test(String(frontmatter?.surface_role ?? "")))) return "paper_gateway";
  if (relativePath.startsWith("Papers/")) return "source_document";
  if (relativePath.startsWith("Strategy/") && /^SI-\d+\b/i.test(basename)) return "strategy_insight";
  if (relativePath.startsWith("Strategy/") && /^SR-\d+\b/i.test(basename)) return "strategy_request";
  if (/^(?:Rocket|Groot|Intelligence Layer)\//.test(relativePath)) {
    const parts = relativePath.split("/");
    const role = String(frontmatter?.surface_role ?? "").toLowerCase();
    const explicitStage = String(frontmatter?.project_stage ?? frontmatter?.stage ?? "").trim();
    const isControlTower = /(?:^|[\s,_-])control[\s_-]*tower(?:$|[\s,_-])/i.test(basename);
    const isTopLevelIndex = parts.length === 2 && basename === "_Index";
    const isCatalogIndex = parts.length > 2 && basename === "_Index";
    if (isControlTower || isTopLevelIndex || role.includes("project_root")) return "project";
    if (explicitStage || role.includes("project_stage") || isCatalogIndex) return "project_stage";
    return "source_document";
  }
  if (relativePath.startsWith("Signals/Storylines/")
    || (relativePath.startsWith("Signals/") && /(?:story|chron|timeline)/i.test(basename))) {
    return "signal_storyline";
  }
  if (relativePath.startsWith("Signals/")) return "signal_domain";
  return "source_document";
}

export function explicitExclusionReason(relativePath, frontmatter) {
  if (relativePath.includes("/Archive/") || relativePath.startsWith("Archive/")) return "archive";
  if (relativePath.startsWith("Console/Templates/")) return "scaffolding";
  if (relativePath.startsWith("Console/Agent/")) return "control_internal";
  if (dailyPathPattern.test(relativePath)) return "raw_daily";
  const publicPolicy = String(frontmatter?.atlas_public ?? frontmatter?.public_surface ?? "").toLowerCase();
  if (["false", "no", "excluded", "private"].includes(publicPolicy)) return "explicit_policy";
  return null;
}

export function classifyDocument({ relativePath, title, frontmatter }, profile, allowlist) {
  const reason = explicitExclusionReason(relativePath, frontmatter);
  if (reason) return { disposition: "excluded", reason };
  if (profile === "atlas-owner") return { disposition: "named", reason: null };
  if (profile !== "atlas-public") throw new TypeError(`Unsupported Atlas profile ${profile}.`);
  if (allowlist.titles.includes(title)) return { disposition: "named", reason: null };
  return { disposition: "aggregate", reason: null };
}

export function reconcileInventory(records, profile, allowlist, { generatedAt, labels = {} }) {
  const classified = records.map((record) => ({
    ...record,
    classification: classifyDocument(record, profile, allowlist),
  }));
  const coverageMap = new Map();
  const exclusionCounts = Object.fromEntries(INVENTORY_EXCLUSION_PRIORITY.map((reason) => [reason, 0]));
  for (const record of classified) {
    const topLevel = record.relativePath.split("/")[0];
    const coverageLabel = labels[topLevel] ?? topLevel;
    const coverageKey = profile === "atlas-public" ? coverageLabel : topLevel;
    const coverage = coverageMap.get(coverageKey) ?? {
      id: `coverage:${profile === "atlas-public"
        ? privacySafeDigestToken(coverageKey, 16)
        : stableDigest(topLevel).slice(0, 16)}`,
      label: coverageLabel,
      physical: 0,
      named: 0,
      aggregate: 0,
      excluded: 0,
    };
    coverage.physical += 1;
    coverage[record.classification.disposition] += 1;
    coverageMap.set(coverageKey, coverage);
    if (record.classification.reason) exclusionCounts[record.classification.reason] += 1;
  }
  const namedCount = classified.filter((record) => record.classification.disposition === "named").length;
  const aggregateCount = classified.filter((record) => record.classification.disposition === "aggregate").length;
  const excludedCount = classified.filter((record) => record.classification.disposition === "excluded").length;
  const classifiedTotal = namedCount + aggregateCount + excludedCount;
  const physicalMarkdownCount = records.length;
  if (classifiedTotal !== physicalMarkdownCount) {
    throw new Error(`Inventory reconciliation blocked: ${classifiedTotal} classified != ${physicalMarkdownCount} physical.`);
  }
  const coverage = [...coverageMap.values()].sort((left, right) => compareText(left.label, right.label));
  const inventory = {
    schema: "atlas.inventory.v1",
    profile,
    generatedAt,
    asOfDate: generatedAt.slice(0, 10),
    physicalMarkdownCount,
    namedCount,
    aggregateCount,
    excludedCount,
    unclassifiedCount: 0,
    reconciliation: { classifiedTotal, pass: true },
    coverage,
    exclusions: {
      priority: [...INVENTORY_EXCLUSION_PRIORITY],
      byReason: exclusionCounts,
    },
    publicTitlePolicy: {
      schema: "public-title-allowlist.v1",
      mode: "safe_hybrid",
      fallback: "alias_or_aggregate",
      projectCountDisclosure: profile === "atlas-public" ? "combined_non_attributable" : "owner_exact",
    },
  };
  return { classified, inventory };
}

export function buildLinkAnalysis(records) {
  const byNormalizedTarget = new Map();
  for (const record of records) {
    const relativeWithoutExtension = record.relativePath.replace(/\.md$/i, "");
    const keys = new Set([
      record.title,
      path.posix.basename(relativeWithoutExtension),
      relativeWithoutExtension,
    ]);
    for (const key of keys) {
      const normalized = key.normalize("NFC").toLowerCase();
      const candidates = byNormalizedTarget.get(normalized) ?? [];
      candidates.push(record.relativePath);
      byNormalizedTarget.set(normalized, candidates);
    }
  }
  const inbound = new Map(records.map((record) => [record.relativePath, {
    sourceDocuments: new Set(),
    occurrences: 0,
  }]));
  for (const source of records) {
    for (const target of source.wikilinks) {
      const candidates = byNormalizedTarget.get(target.normalize("NFC").toLowerCase()) ?? [];
      if (candidates.length !== 1) continue;
      const metric = inbound.get(candidates[0]);
      if (!metric) continue;
      metric.sourceDocuments.add(source.relativePath);
      metric.occurrences += 1;
    }
  }
  return new Map([...inbound].map(([key, value]) => [key, {
    uniqueInboundDocuments: value.sourceDocuments.size,
    inboundLinkOccurrences: value.occurrences,
    sourceDocumentPaths: [...value.sourceDocuments].sort(compareText),
  }]));
}

export function buildResolvedLinkEdges(records) {
  const byNormalizedTarget = new Map();
  for (const record of records) {
    const relativeWithoutExtension = record.relativePath.replace(/\.md$/i, "");
    for (const key of new Set([
      record.title,
      path.posix.basename(relativeWithoutExtension),
      relativeWithoutExtension,
    ])) {
      const normalized = key.normalize("NFC").toLowerCase();
      const candidates = byNormalizedTarget.get(normalized) ?? [];
      candidates.push(record.relativePath);
      byNormalizedTarget.set(normalized, candidates);
    }
  }
  const occurrenceByPair = new Map();
  for (const source of records) {
    for (const target of source.wikilinks) {
      const candidates = byNormalizedTarget.get(target.normalize("NFC").toLowerCase()) ?? [];
      if (candidates.length !== 1 || candidates[0] === source.relativePath) continue;
      const key = JSON.stringify([source.relativePath, candidates[0]]);
      occurrenceByPair.set(key, (occurrenceByPair.get(key) ?? 0) + 1);
    }
  }
  return [...occurrenceByPair]
    .map(([key, occurrences]) => {
      const [sourcePath, targetPath] = JSON.parse(key);
      return { sourcePath, targetPath, occurrences };
    })
    .sort((left, right) => compareText(left.sourcePath, right.sourcePath)
      || compareText(left.targetPath, right.targetPath));
}

export function aggregateLinkMetrics(memberPaths, linkAnalysis) {
  const sourceDocuments = new Set();
  let inboundLinkOccurrences = 0;
  for (const memberPath of memberPaths) {
    const metric = linkAnalysis.get(memberPath);
    if (!metric) continue;
    metric.sourceDocumentPaths.forEach((source) => sourceDocuments.add(source));
    inboundLinkOccurrences += metric.inboundLinkOccurrences;
  }
  return {
    uniqueInboundDocuments: sourceDocuments.size,
    inboundLinkOccurrences,
  };
}

export function assertNoMtimeFreshness(value, location = "projection") {
  const findings = [];
  const visit = (candidate, currentPath) => {
    if (Array.isArray(candidate)) candidate.forEach((child, index) => visit(child, `${currentPath}[${index}]`));
    else if (candidate && typeof candidate === "object") {
      for (const [key, child] of Object.entries(candidate)) {
        if (/mtime/i.test(key)) findings.push(`${currentPath}.${key}`);
        visit(child, `${currentPath}.${key}`);
      }
    }
  };
  visit(value, location);
  if (findings.length) throw new Error(`Semantic freshness blocked by mtime fields: ${findings.join(", ")}.`);
}

export function assertPublicProjectionBoundary(publicProjection) {
  const body = JSON.stringify(publicProjection);
  const forbidden = [
    /\/(?:Users|home)\//i,
    /(?:^|["'])[A-Za-z]:\\/,
    /file:\/\//i,
    /(?:activity|event|release|run|batch|cursor|lease)[-_ ]?id/i,
    /(?:receipt|source)[-_ ]?(?:path|hash)/i,
  ];
  const finding = forbidden.find((pattern) => pattern.test(body));
  if (finding) throw new Error(`Public projection blocked by forbidden pattern ${finding}.`);
  if (Object.hasOwn(publicProjection, "activity")) {
    throw new Error("Public projection blocked: atlas.activity.v1 is owner-only.");
  }
  assertNoMtimeFreshness(publicProjection, "publicProjection");
}

export function assertOwnerPublicSeparation({ ownerRoot, publicRoot, trackedFiles = [] }) {
  const owner = path.resolve(ownerRoot);
  const publicPath = path.resolve(publicRoot);
  if (owner === publicPath || publicPath.startsWith(`${owner}${path.sep}`) || owner.startsWith(`${publicPath}${path.sep}`)) {
    throw new Error("Owner/public projection roots must be physically disjoint.");
  }
  const leaked = trackedFiles.filter((file) => path.resolve(file).startsWith(`${owner}${path.sep}`));
  if (leaked.length) throw new Error(`Owner projection is tracked: ${leaked.join(", ")}.`);
}
