import { createHash } from "node:crypto";
import path from "node:path";

// Shared Owner/Public projection primitives. Keep this module versionless.
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0;

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
