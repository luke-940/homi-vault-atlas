import { createHash } from "node:crypto";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import {
  containsInternalKnowledgeMarker,
  hintedSectionDispositionV3,
  sanitizePublicKnowledgeText,
  validatePublicationPolicyV3,
  validateSectionReviewV3,
} from "./atlas-publication-policy-v3.mjs";
import { scanOperatingExposure, scanPrivacyText } from "./privacy-scanner.mjs";
import {
  parseFrontmatterScalarMap,
  privacySafeDigestToken,
  stableJson,
} from "./profile-contract.mjs";

const compareText = (left, right) => String(left).localeCompare(String(right), "en");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const wikilinkPattern = /(!?)\[\[([^\]]+)\]\]/g;
const markdownImagePattern = /!\[[^\]]*]\([^)]+\)/;
const rawHtmlPattern = /<\/?[A-Za-z][^>]*>/;

function compactJson(value) {
  return `${JSON.stringify(value)}\n`;
}

function cleanInlineMarkup(value) {
  return String(value)
    .replace(/!\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_, target, alias) => alias ?? target)
    .replace(/!\[([^\]]*)]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)]\((?:https?:\/\/|mailto:)[^)]+\)/g, "$1")
    .replace(/[*_~]{1,3}/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function frontmatterBoundary(markdown) {
  if (!markdown.startsWith("---\n")) return 0;
  const closing = markdown.indexOf("\n---\n", 4);
  return closing < 0 ? 0 : closing + 5;
}

function lineOffsets(markdown) {
  const output = [];
  let cursor = 0;
  for (const line of markdown.split("\n")) {
    output.push(cursor);
    cursor += Buffer.byteLength(`${line}\n`);
  }
  return output;
}

function stableSectionId(nodeId, headingPath, ordinal) {
  return `section:${privacySafeDigestToken(`${nodeId}\0${headingPath.join("\0")}\0${ordinal}`, 18)}`;
}

function stableBlockId(nodeId, sectionId, ordinal) {
  return `block:${privacySafeDigestToken(`${nodeId}\0${sectionId}\0${ordinal}`, 18)}`;
}

function stableEvidenceId(nodeId, blockId) {
  return `evidence:${privacySafeDigestToken(`${nodeId}\0${blockId}`, 18)}`;
}

function stableClaimId(nodeId, role, ordinal) {
  return `claim:${privacySafeDigestToken(`${nodeId}\0${role}\0${ordinal}`, 18)}`;
}

function blockStart(line, nextLine = "") {
  return /^```/.test(line)
    || /^\s*(?:[-*+]|\d+\.)\s+/.test(line)
    || /^\s*>\s?/.test(line)
    || rawHtmlPattern.test(line)
    || (line.includes("|") && /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(nextLine));
}

function parseSectionBlocks(lines, startLine, nodeId, sectionId, offsets) {
  const blocks = [];
  let cursor = 0;
  const push = (type, rawLines, extra = {}) => {
    const ordinal = blocks.length;
    blocks.push({
      id: stableBlockId(nodeId, sectionId, ordinal),
      type,
      raw: rawLines.join("\n").trim(),
      startLine: startLine + cursor + 1,
      sourceOffset: offsets[startLine + cursor] ?? 0,
      ...extra,
    });
  };
  while (cursor < lines.length) {
    if (!lines[cursor].trim()) {
      cursor += 1;
      continue;
    }
    const line = lines[cursor];
    if (/^```/.test(line)) {
      const language = line.slice(3).trim();
      const body = [];
      const origin = cursor;
      cursor += 1;
      while (cursor < lines.length && !/^```/.test(lines[cursor])) {
        body.push(lines[cursor]);
        cursor += 1;
      }
      if (cursor < lines.length) cursor += 1;
      const saved = cursor;
      cursor = origin;
      push("code", body, { language });
      cursor = saved;
      continue;
    }
    if (line.includes("|")
      && /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(lines[cursor + 1] ?? "")) {
      const origin = cursor;
      const rows = [line];
      cursor += 2;
      while (cursor < lines.length && lines[cursor].includes("|") && lines[cursor].trim()) {
        rows.push(lines[cursor]);
        cursor += 1;
      }
      const saved = cursor;
      cursor = origin;
      push("table", rows);
      cursor = saved;
      continue;
    }
    if (/^\s*(?:[-*+]|\d+\.)\s+/.test(line)) {
      const origin = cursor;
      const rows = [];
      const ordered = /^\s*\d+\.\s+/.test(line);
      while (cursor < lines.length && /^\s*(?:[-*+]|\d+\.)\s+/.test(lines[cursor])) {
        rows.push(lines[cursor].replace(/^\s*(?:[-*+]|\d+\.)\s+/, ""));
        cursor += 1;
      }
      const saved = cursor;
      cursor = origin;
      push("list", rows, { ordered });
      cursor = saved;
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      const origin = cursor;
      const rows = [];
      while (cursor < lines.length && /^\s*>\s?/.test(lines[cursor])) {
        rows.push(lines[cursor].replace(/^\s*>\s?/, ""));
        cursor += 1;
      }
      const first = rows[0] ?? "";
      const callout = /^\[!([A-Za-z-]+)\]\s*(.*)$/.exec(first);
      if (callout) rows[0] = callout[2];
      const saved = cursor;
      cursor = origin;
      push(callout ? "callout" : "blockquote", rows, {
        calloutType: callout?.[1]?.toLowerCase() ?? null,
      });
      cursor = saved;
      continue;
    }
    if (rawHtmlPattern.test(line)) {
      push("raw_html", [line]);
      cursor += 1;
      continue;
    }
    const origin = cursor;
    const rows = [line];
    cursor += 1;
    while (cursor < lines.length
      && lines[cursor].trim()
      && !blockStart(lines[cursor], lines[cursor + 1] ?? "")) {
      rows.push(lines[cursor]);
      cursor += 1;
    }
    const saved = cursor;
    cursor = origin;
    push("paragraph", rows);
    cursor = saved;
  }
  return blocks;
}

export function parseKnowledgeSections({ nodeId, markdown }) {
  const boundary = frontmatterBoundary(markdown);
  const body = markdown.slice(boundary);
  const baseLine = markdown.slice(0, boundary).split("\n").length - 1;
  const lines = body.split("\n");
  const offsets = lineOffsets(markdown);
  const headings = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(lines[index]);
    if (match) headings.push({
      line: index,
      depth: match[1].length,
      heading: cleanInlineMarkup(match[2]),
    });
  }
  const sections = [];
  const stack = [];
  const headingOrdinals = new Map();
  const addSection = ({ heading, depth, contentStart, contentEnd, headingLine }) => {
    const content = lines.slice(contentStart, contentEnd);
    if (!heading && !content.some((line) => line.trim())) return;
    while (stack.length >= depth) stack.pop();
    if (heading) stack.push(heading);
    const headingPath = heading ? [...stack] : ["Overview"];
    const ordinalKey = headingPath.join("\0");
    const ordinal = headingOrdinals.get(ordinalKey) ?? 0;
    headingOrdinals.set(ordinalKey, ordinal + 1);
    const sectionId = stableSectionId(nodeId, headingPath, ordinal);
    sections.push({
      sectionId,
      heading: heading || "Overview",
      headingPath,
      depth,
      sourceHeadingLine: headingLine === null ? null : baseLine + headingLine + 1,
      blocks: parseSectionBlocks(
        content,
        baseLine + contentStart,
        nodeId,
        sectionId,
        offsets,
      ),
    });
  };
  if (!headings.length) {
    addSection({ heading: "", depth: 1, contentStart: 0, contentEnd: lines.length, headingLine: null });
  } else {
    addSection({
      heading: "",
      depth: 1,
      contentStart: 0,
      contentEnd: headings[0].line,
      headingLine: null,
    });
    for (let index = 0; index < headings.length; index += 1) {
      const current = headings[index];
      addSection({
        heading: current.heading,
        depth: current.depth,
        contentStart: current.line + 1,
        contentEnd: headings[index + 1]?.line ?? lines.length,
        headingLine: current.line,
      });
    }
  }
  return {
    frontmatter: parseFrontmatterScalarMap(markdown),
    sections,
  };
}

function parseWikilink(raw, embed) {
  const [targetPart, aliasPart] = raw.split("|", 2);
  const [target, heading] = targetPart.split("#", 2);
  return {
    target: target.trim().replaceAll("\\", "/"),
    heading: heading?.trim() || null,
    alias: aliasPart?.trim() || null,
    embed,
  };
}

function inlineTokens(raw) {
  const tokens = [];
  let cursor = 0;
  wikilinkPattern.lastIndex = 0;
  let match;
  while ((match = wikilinkPattern.exec(raw))) {
    if (match.index > cursor) tokens.push({ type: "text", text: cleanInlineMarkup(raw.slice(cursor, match.index)) });
    const parsed = parseWikilink(match[2], match[1] === "!");
    tokens.push({ type: "wikilink", ...parsed });
    cursor = match.index + match[0].length;
  }
  if (cursor < raw.length) tokens.push({ type: "text", text: cleanInlineMarkup(raw.slice(cursor)) });
  return tokens.filter((token) => token.type !== "text" || token.text);
}

function plainInlineText(tokens) {
  return tokens.map((token) => token.type === "text"
    ? token.text
    : token.label
      ?? token.alias
      ?? (token.target ? path.posix.basename(token.target) : ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function publicRelationContext(tokens) {
  return sanitizePublicKnowledgeText(plainInlineText(tokens)
    .replaceAll("비공개 대상", "")
    .slice(0, 420));
}

function safeBlockCandidate(rawBlock, sectionDisposition, policy) {
  if (sectionDisposition !== "knowledge") {
    return { safe: false, reason: sectionDisposition, block: null, occurrences: [] };
  }
  if (rawBlock.type === "raw_html") {
    return { safe: false, reason: "raw_html", block: null, occurrences: [] };
  }
  const maintenanceBlockPatterns = (policy.sectionHints?.maintenanceBlockPatterns ?? [])
    .map((pattern) => new RegExp(pattern, "i"));
  const isMaintenanceText = (value) => maintenanceBlockPatterns
    .some((pattern) => pattern.test(String(value)));
  let safeRaw = rawBlock.raw;
  let omittedRowCount = 0;
  if (rawBlock.type === "table" || rawBlock.type === "list") {
    const rows = rawBlock.raw.split("\n");
    const safeRows = rows.filter((row) => {
      const unsafe = markdownImagePattern.test(row)
        || rawHtmlPattern.test(row)
        || isMaintenanceText(row)
        || scanPrivacyText(row, { path: "knowledge-block-row" }).length
        || scanOperatingExposure(row, { path: "knowledge-block-row" }).length;
      if (unsafe) omittedRowCount += 1;
      return !unsafe;
    });
    safeRaw = safeRows.join("\n");
  }
  if (!safeRaw || markdownImagePattern.test(safeRaw)) {
    return { safe: false, reason: "image_not_allowlisted", block: null, occurrences: [] };
  }
  if (isMaintenanceText(safeRaw)) {
    return { safe: false, reason: "maintenance", block: null, occurrences: [] };
  }
  const privacy = scanPrivacyText(safeRaw, { path: "knowledge-block" });
  const operating = scanOperatingExposure(safeRaw, { path: "knowledge-block" });
  if (privacy.length || operating.length) {
    return {
      safe: false,
      reason: privacy[0]?.id ?? operating[0]?.id ?? "safety_finding",
      block: null,
      occurrences: [],
    };
  }
  const rows = rawBlock.type === "table" || rawBlock.type === "list"
    ? safeRaw.split("\n")
    : [safeRaw];
  const parsedRows = rows.map((row) => inlineTokens(row));
  const parsedTableRows = rawBlock.type === "table"
    ? rows.map((row) => row
      .replace(/^\s*\|/, "")
      .replace(/\|\s*$/, "")
      .split("|")
      .map((cell) => inlineTokens(cell.trim())))
    : [];
  const occurrences = [];
  if (rawBlock.type === "table") {
    for (const row of parsedTableRows) {
      const contextTokens = row.flatMap((cell, index) => (
        index ? [{ type: "text", text: " · " }, ...cell] : cell
      ));
      for (const tokens of row) {
        for (const token of tokens) {
          if (token.type === "wikilink") occurrences.push({ ...token, contextTokens });
        }
      }
    }
  } else {
    for (const tokens of parsedRows) {
      for (const token of tokens) {
        if (token.type === "wikilink") occurrences.push({ ...token, contextTokens: tokens });
      }
    }
  }
  const common = { id: rawBlock.id, type: rawBlock.type };
  let block;
  if (rawBlock.type === "table") {
    block = { ...common, rows: parsedTableRows };
  } else if (rawBlock.type === "list") {
    block = { ...common, ordered: rawBlock.ordered, items: parsedRows };
  } else if (rawBlock.type === "code") {
      block = { ...common, language: rawBlock.language || null, text: safeRaw };
  } else if (rawBlock.type === "callout") {
    const allowed = policy.reader.allowedCalloutTypes.includes(rawBlock.calloutType);
    block = {
      ...common,
      type: allowed ? "callout" : "blockquote",
      calloutType: allowed ? rawBlock.calloutType : null,
      inlines: parsedRows[0],
    };
  } else {
    block = { ...common, inlines: parsedRows[0] };
  }
  if (omittedRowCount) block.omittedRowCount = omittedRowCount;
  return { safe: true, reason: null, block, occurrences };
}

function decisionMapForSections(parsed, review, policy) {
  const explicit = [];
  const used = new Set();
  for (const decision of review.sectionDecisions ?? []) {
    const matches = decision.sourceSectionId
      ? parsed.sections.filter((section) => section.sectionId === decision.sourceSectionId)
      : parsed.sections.filter((section) => section.heading === decision.sectionHeading);
    const target = matches[decision.occurrence ?? 0];
    if (!target) {
      throw new Error(`Knowledge review blocked: missing section selector for ${review.nodeId}.`);
    }
    if (used.has(target.sectionId)) throw new Error(`Knowledge review blocked: duplicate section ${target.sectionId}.`);
    used.add(target.sectionId);
    explicit.push({ ...decision, sectionId: target.sectionId });
  }
  const byId = new Map(explicit.map((item) => [item.sectionId, item]));
  const resolved = parsed.sections.map((section) => ({
    sectionId: section.sectionId,
    disposition: byId.get(section.sectionId)?.disposition
      ?? review.defaultDisposition
      ?? hintedSectionDispositionV3(section.heading, policy),
    rationale: byId.get(section.sectionId)?.rationale ?? "review-default",
    publicHeading: byId.get(section.sectionId)?.publicHeading ?? null,
  }));
  const reviewForValidation = { ...review, sectionDecisions: resolved };
  const failures = validateSectionReviewV3(
    reviewForValidation,
    parsed.sections.map((section) => section.sectionId),
    policy,
  );
  if (failures.length) throw new Error(`Knowledge review blocked: ${failures.join(", ")}.`);
  return new Map(resolved.map((item) => [item.sectionId, item]));
}

function targetKeys(record) {
  const relativeWithoutExtension = record.relativePath.replace(/\.md$/i, "");
  return new Set([
    record.title,
    path.posix.basename(relativeWithoutExtension),
    relativeWithoutExtension,
    ...(record.aliases ?? []),
  ].map((value) => String(value).normalize("NFC").toLowerCase()));
}

function targetIndex(records) {
  const output = new Map();
  for (const record of records) {
    for (const key of targetKeys(record)) {
      const candidates = output.get(key) ?? [];
      candidates.push(record);
      output.set(key, candidates);
    }
  }
  return output;
}

function decodeGraph(graph) {
  const nodes = graph.nodes.map((node, index) => ({
    index,
    id: graph.strings[node[0]],
    title: graph.strings[node[1]],
    kind: graph.kinds[node[2]],
    domain: graph.strings[graph.domains[node[3]][1]],
  }));
  const edges = graph.edges.map((edge) => ({
    id: graph.strings[edge[0]],
    sourceId: nodes[edge[1]].id,
    targetId: nodes[edge[2]].id,
    occurrences: edge[3],
  }));
  return {
    nodes,
    nodeById: new Map(nodes.map((node) => [node.id, node])),
    edges,
    edgeByPair: new Map(edges.map((edge) => [`${edge.sourceId}\0${edge.targetId}`, edge])),
  };
}

function resolveInlineTokens(tokens, sourceRecord, index, publicNodeIds, sectionByHeading) {
  return tokens.map((token) => {
    if (token.type !== "wikilink") {
      return token.type === "text"
        ? { ...token, text: sanitizePublicKnowledgeText(token.text) }
        : token;
    }
    if (!token.target && token.heading) {
      const sectionId = sectionByHeading.get(token.heading) ?? null;
      return sectionId
        ? {
            type: "section_link",
            sectionId,
            label: sanitizePublicKnowledgeText(token.alias ?? token.heading),
          }
        : { type: "text", text: sanitizePublicKnowledgeText(token.alias ?? token.heading) };
    }
    const candidates = index.get(token.target.normalize("NFC").toLowerCase()) ?? [];
    const target = candidates.length === 1 ? candidates[0] : null;
    if (!target || token.embed || !publicNodeIds.has(target.nodeId)) {
      return { type: "private_target", label: "비공개 대상" };
    }
    return {
      type: "atlas_link",
      nodeId: target.nodeId,
      sectionId: token.heading ? null : null,
      label: sanitizePublicKnowledgeText(token.alias ?? target.displayTitle ?? target.title),
    };
  }).filter((token) => token.type !== "text" || token.text);
}

function resolveBlock(block, sourceRecord, index, publicNodeIds, sectionByHeading) {
  if ("rows" in block) {
    return {
      ...block,
      rows: block.rows.map((row) => row.map((cell) => resolveInlineTokens(
        cell,
        sourceRecord,
        index,
        publicNodeIds,
        sectionByHeading,
      ))),
    };
  }
  if ("items" in block) {
    return {
      ...block,
      items: block.items.map((item) => resolveInlineTokens(
        item,
        sourceRecord,
        index,
        publicNodeIds,
        sectionByHeading,
      )),
    };
  }
  if ("inlines" in block) {
    return {
      ...block,
      inlines: resolveInlineTokens(block.inlines, sourceRecord, index, publicNodeIds, sectionByHeading),
    };
  }
  if ("text" in block) return { ...block, text: sanitizePublicKnowledgeText(block.text) };
  return block;
}

function restrictLocalSectionLinks(block, publishedSectionIds) {
  const restrict = (inlines) => inlines.map((inline) => (
    inline.type === "section_link" && !publishedSectionIds.has(inline.sectionId)
      ? { type: "text", text: inline.label }
      : inline
  ));
  if ("rows" in block) {
    return {
      ...block,
      rows: block.rows.map((row) => row.map((cell) => restrict(cell))),
    };
  }
  if ("items" in block) {
    return {
      ...block,
      items: block.items.map((item) => restrict(item)),
    };
  }
  if ("inlines" in block) return { ...block, inlines: restrict(block.inlines) };
  return block;
}

function blockText(block) {
  if ("text" in block) return block.text;
  if ("inlines" in block) return plainInlineText(block.inlines);
  if ("items" in block) return block.items.map(plainInlineText).join(" ");
  if ("rows" in block) {
    return block.rows.flatMap((row) => row.map(plainInlineText)).join(" ");
  }
  return "";
}

function clippedClaimText(value, maxLength = 420) {
  const compact = String(value).replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  const candidate = compact.slice(0, maxLength + 1);
  const boundary = Math.max(
    candidate.lastIndexOf(". "),
    candidate.lastIndexOf("? "),
    candidate.lastIndexOf("! "),
    candidate.lastIndexOf("다. "),
  );
  return `${candidate.slice(0, boundary >= 96 ? boundary + 1 : maxLength).trim()}…`;
}

function sectionOccurrence(parsed, target) {
  return parsed.sections
    .filter((section) => section.heading === target.heading)
    .findIndex((section) => section.sectionId === target.sectionId);
}

function reviewCandidateScore(section, block, text) {
  const heading = section.heading.toLowerCase();
  const semanticHeading = /(요약|개요|핵심|의미|배경|문제|관점|해석|결론|범위|질문|summary|overview|abstract|finding|insight|implication|context|why)/i;
  const caveatHeading = /(제약|한계|주의|아직|위험|caveat|limit|risk|not to conclude)/i;
  const questionHeading = /(질문|향후|다음|미해결|open question|next question|future)/i;
  const sentenceSignals = (text.match(/[.!?。]|다(?:\.|$)/g) ?? []).length;
  const linkCount = (block.raw.match(/\[\[/g) ?? []).length;
  const externalLinkCount = (block.raw.match(/https?:\/\//g) ?? []).length;
  const metadataLike = /(발간일|메인 도메인|확인 수준|중복 확인|owner boundary|source\s*->|수집 범위|hf paper|arxiv|receipt|batch|routine|read route|operating log)/i;
  const proseCharacters = (text.match(/[A-Za-z가-힣]/g) ?? []).length;
  const lengthFit = Math.min(text.length, 520) - Math.max(0, text.length - 900);
  const linkPenalty = linkCount > 3 && sentenceSignals === 0 ? linkCount * 80 : 0;
  return lengthFit
    + Math.min(proseCharacters, 240)
    + sentenceSignals * 22
    + (semanticHeading.test(heading) ? 140 : 0)
    + (caveatHeading.test(heading) ? 30 : 0)
    + (questionHeading.test(heading) ? 20 : 0)
    + (block.type === "paragraph" || block.type === "blockquote" || block.type === "callout" ? 80 : 0)
    - linkPenalty
    - externalLinkCount * 90
    - (metadataLike.test(`${heading} ${text.slice(0, 260)}`) ? 420 : 0)
    - (block.type === "table" || block.type === "list" ? 90 : 0);
}

/**
 * Creates an evidence-bound review seed from one complete Markdown source.
 * The seed never invents a claim: every sentence is either an exact safe
 * source excerpt or a bounded reading instruction linked to that excerpt.
 */
export function createKnowledgeReviewSeed({
  nodeId,
  title,
  domain,
  kind,
  markdown,
  policy,
}) {
  const parsed = parseKnowledgeSections({ nodeId, markdown });
  const candidates = [];
  const headingCounts = new Map();
  for (const section of parsed.sections) {
    const occurrence = headingCounts.get(section.heading) ?? 0;
    headingCounts.set(section.heading, occurrence + 1);
    const disposition = hintedSectionDispositionV3(section.heading, policy);
    if (disposition !== "knowledge") continue;
    if (scanPrivacyText(section.heading, { path: "knowledge-section-heading" }).length
      || scanOperatingExposure(section.heading, { path: "knowledge-section-heading" }).length) {
      continue;
    }
    for (const block of section.blocks) {
      const candidate = safeBlockCandidate(block, disposition, policy);
      if (!candidate.safe || !candidate.block) continue;
      const text = blockText(candidate.block);
      if (text.length < 36 || !/[A-Za-z가-힣]/.test(text)) continue;
      const contains = text.slice(0, Math.min(48, text.length)).trim();
      candidates.push({
        sectionHeading: section.heading,
        sectionOccurrence: sectionOccurrence(parsed, section),
        blockId: block.id,
        blockType: block.type,
        text,
        contains,
        score: reviewCandidateScore(section, block, text),
      });
    }
  }
  const safeSectionKeys = new Set(candidates.map((candidate) => (
    `${candidate.sectionHeading}\0${candidate.sectionOccurrence}`
  )));
  const sectionDecisions = [...safeSectionKeys]
    .sort(compareText)
    .map((key) => {
      const [sectionHeading, occurrenceText] = key.split("\0");
      const occurrence = Number(occurrenceText);
      return {
        sectionHeading,
        ...(occurrence ? { occurrence } : {}),
        disposition: "knowledge",
        rationale: "atlas-builder-reviewed-safe-knowledge",
      };
    });
  candidates.sort((left, right) => right.score - left.score
    || compareText(left.sectionHeading, right.sectionHeading)
    || compareText(left.blockId, right.blockId));
  const primary = candidates[0] ?? null;
  if (!primary) {
    return {
      review: null,
      audit: {
        nodeId,
        title,
        domain,
        kind,
        parsedSectionCount: parsed.sections.length,
        safeCandidateCount: 0,
        status: "excluded_no_safe_knowledge",
      },
    };
  }
  const distinctCandidates = [];
  const seenSections = new Set();
  for (const candidate of candidates) {
    if (seenSections.has(candidate.sectionHeading)) continue;
    seenSections.add(candidate.sectionHeading);
    distinctCandidates.push(candidate);
    if (distinctCandidates.length >= 5) break;
  }
  const insightCandidates = distinctCandidates.filter((item) => item.blockId !== primary.blockId).slice(0, 2);
  if (!insightCandidates.length) insightCandidates.push(primary);
  const caveatCandidates = candidates.filter((item) => (
    /(제약|한계|주의|아직|위험|caveat|limit|risk|not to conclude)/i.test(item.sectionHeading)
  )).slice(0, 2);
  const questionCandidates = candidates.filter((item) => (
    /(질문|향후|다음|미해결|open question|next question|future)/i.test(item.sectionHeading)
    || /\?$/.test(item.text.trim())
  )).slice(0, 2);
  const selector = (candidate) => ({
    sectionHeading: candidate.sectionHeading,
    ...(candidate.sectionOccurrence ? { sectionOccurrence: candidate.sectionOccurrence } : {}),
    blockId: candidate.blockId,
    contains: candidate.contains,
  });
  const claimFrom = (candidate, interpretation = "source_explicit") => ({
    text: clippedClaimText(candidate.text),
    interpretation,
    evidenceSelectors: [selector(candidate)],
  });
  return {
    review: {
      nodeId,
      status: "reviewed",
      reviewMode: "atlas_builder_evidence_extract",
      defaultDisposition: "maintenance",
      sectionDecisions,
      readerSummary: claimFrom(primary),
      keyInsights: insightCandidates.map((candidate) => claimFrom(candidate)),
      whyItMatters: {
        text: `${title}을 읽을 때 팀이 확인할 핵심 근거는 다음과 같습니다. ${clippedClaimText(primary.text, 320)}`,
        interpretation: "atlas_builder_bounded",
        evidenceSelectors: [selector(primary)],
      },
      caveats: caveatCandidates.map((candidate) => claimFrom(candidate)),
      openQuestions: questionCandidates.map((candidate) => claimFrom(candidate)),
    },
    audit: {
      nodeId,
      title,
      domain,
      kind,
      parsedSectionCount: parsed.sections.length,
      safeCandidateCount: candidates.length,
      selectedEvidenceBlocks: [...new Set([
        primary.blockId,
        ...insightCandidates.map((item) => item.blockId),
        ...caveatCandidates.map((item) => item.blockId),
        ...questionCandidates.map((item) => item.blockId),
      ])],
      summary: clippedClaimText(primary.text),
      status: "review_seed_ready",
    },
  };
}

function resolveEvidenceSelector(parsedDocument, selector) {
  if (selector.blockId) {
    for (const section of parsedDocument.sections) {
      const block = section.blocks.find((item) => item.id === selector.blockId);
      if (block) return block;
    }
    return null;
  }
  const publicSectionHeading = sanitizePublicKnowledgeText(selector.sectionHeading);
  const candidates = parsedDocument.sections
    .filter((section) => section.heading === publicSectionHeading);
  const section = candidates[selector.sectionOccurrence ?? 0];
  if (!section) return null;
  return section.blocks.find((block) => (
    !selector.contains || blockText(block).includes(selector.contains)
  )) ?? null;
}

function compileClaim(nodeId, role, ordinal, spec, parsedDocument, evidenceById) {
  const evidenceIds = [];
  for (const selector of spec.evidenceSelectors ?? []) {
    const block = resolveEvidenceSelector(parsedDocument, selector);
    if (!block) {
      const matchingSections = parsedDocument.sections
        .filter((section) => section.heading === selector.sectionHeading)
        .map((section) => ({
          heading: section.heading,
          blockIds: section.blocks.map((item) => item.id),
        }));
      throw new Error(
        `Knowledge claim blocked: ${nodeId} ${role} evidence selector did not resolve `
        + `${JSON.stringify({ selector, matchingSections })}.`,
      );
    }
    const evidenceId = stableEvidenceId(parsedDocument.nodeId, block.id);
    evidenceIds.push(evidenceId);
    if (!evidenceById.has(evidenceId)) {
      evidenceById.set(evidenceId, {
        id: evidenceId,
        nodeId: parsedDocument.nodeId,
        sectionId: block.sectionId,
        blockId: block.id,
        excerpt: blockText(block).slice(0, 900),
      });
    }
  }
  if (!evidenceIds.length) throw new Error(`Knowledge claim blocked: ${nodeId} ${role} has no evidence.`);
  return {
    id: stableClaimId(nodeId, role, ordinal),
    text: sanitizePublicKnowledgeText(spec.text),
    evidenceIds: [...new Set(evidenceIds)],
    interpretation: spec.interpretation,
  };
}

function publicOccurrenceLedger(parsedDocuments, records, graphModel) {
  const index = targetIndex(records);
  const occurrences = [];
  for (const document of parsedDocuments.values()) {
    for (const section of document.parsedSections) {
      for (const block of section.blocks) {
        for (let ordinal = 0; ordinal < block.sourceOccurrences.length; ordinal += 1) {
          const sourceOccurrence = block.sourceOccurrences[ordinal];
          const candidates = index.get(sourceOccurrence.target.normalize("NFC").toLowerCase()) ?? [];
          const target = candidates.length === 1 ? candidates[0] : null;
          const edge = target
            ? graphModel.edgeByPair.get(`${document.nodeId}\0${target.nodeId}`)
            : null;
          const context = block.publicEligible ? sourceOccurrence.context : null;
          const targetTitle = target?.displayTitle ?? target?.title ?? null;
          const explanatoryText = String(context ?? "")
            .replaceAll("비공개 대상", "")
            .replaceAll(targetTitle || "\u0000", "")
            .replace(/[·|()[\]{}:;,./_-]+/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          occurrences.push({
            id: `occurrence:${privacySafeDigestToken(
              `${document.nodeId}\0${block.id}\0${ordinal}\0${sourceOccurrence.target}`,
              18,
            )}`,
            sourceNodeId: document.nodeId,
            targetNodeId: target?.nodeId ?? null,
            edgeId: edge?.id ?? null,
            sectionId: section.sectionId,
            blockId: block.id,
            direction: "outgoing",
            publicEligible: Boolean(
              edge
              && block.publicEligible
              && !sourceOccurrence.embed
              && target
              && graphModel.nodeById.has(target.nodeId)
              && explanatoryText.length >= 18
            ),
            context,
            resolution: target ? (edge ? "resolved_graph_edge" : "resolved_non_graph_target") : (
              candidates.length > 1 ? "ambiguous" : "unresolved"
            ),
          });
        }
      }
    }
  }
  return occurrences.sort((left, right) => compareText(left.id, right.id));
}

function relationExplanationsForNode(nodeId, graphModel, occurrences, evidenceById) {
  const incoming = graphModel.edges
    .filter((edge) => edge.targetId === nodeId)
    .sort((left, right) => right.occurrences - left.occurrences || compareText(left.id, right.id))
    .slice(0, 6);
  const outgoing = graphModel.edges
    .filter((edge) => edge.sourceId === nodeId)
    .sort((left, right) => right.occurrences - left.occurrences || compareText(left.id, right.id))
    .slice(0, 6);
  return [...incoming.map((edge) => ({ edge, direction: "incoming" })),
    ...outgoing.map((edge) => ({ edge, direction: "outgoing" }))].map(({ edge, direction }) => {
    const occurrence = occurrences.find((item) => (
      item.edgeId === edge.id
      && item.publicEligible
      && item.sourceNodeId === edge.sourceId
    ));
    const evidenceIds = [];
    if (occurrence?.context) {
      const evidenceId = stableEvidenceId(occurrence.sourceNodeId, occurrence.blockId);
      evidenceIds.push(evidenceId);
      if (!evidenceById.has(evidenceId)) {
        evidenceById.set(evidenceId, {
          id: evidenceId,
          nodeId: occurrence.sourceNodeId,
          sourceTitle: graphModel.nodeById.get(occurrence.sourceNodeId)?.title,
          sectionId: occurrence.sectionId,
          blockId: occurrence.blockId,
          excerpt: occurrence.context,
        });
      }
    }
    return {
      id: `relation:${privacySafeDigestToken(`${nodeId}\0${edge.id}\0${direction}`, 18)}`,
      edgeId: edge.id,
      sourceNodeId: edge.sourceId,
      targetNodeId: edge.targetId,
      direction,
      kind: occurrence ? "direct_context" : "evidence_gap",
      explanation: occurrence?.context ?? "실제 방향 edge는 있으나 공개 가능한 직접 문맥은 아직 검수되지 않았습니다.",
      evidenceIds,
      occurrences: edge.occurrences,
    };
  });
}

function compressedWireEnvelope(kind, registryKey, value) {
  const innerJsonText = compactJson(value);
  const innerJsonSha256 = sha256(innerJsonText);
  const payload = gzipSync(innerJsonText, { level: 9 }).toString("base64");
  return {
    schema: "atlas.knowledge_wire.v1",
    kind,
    registryKey,
    encoding: "gzip_base64_v1",
    innerJsonSha256,
    innerBytes: Buffer.byteLength(innerJsonText),
    payload,
  };
}

function makeShardWire(nodeId, value) {
  const jsonText = compactJson(compressedWireEnvelope("shard", nodeId, value));
  const jsonSha256 = sha256(jsonText);
  const jsText = `/* homi-atlas-knowledge-shard:${jsonSha256} */\n`
    + "window.__HOMI_ATLAS_KNOWLEDGE_SHARDS__ = window.__HOMI_ATLAS_KNOWLEDGE_SHARDS__ || {};\n"
    + `window.__HOMI_ATLAS_KNOWLEDGE_SHARDS__[${JSON.stringify(nodeId)}] = {`
    + `jsonText:${JSON.stringify(jsonText)},jsonSha256:${JSON.stringify(jsonSha256)}};\n`;
  return {
    jsonText,
    jsText,
    jsonSha256,
    javascriptSha256: sha256(jsText),
  };
}

function makeSearchWire(value) {
  const jsonText = compactJson(compressedWireEnvelope("search", "knowledge-search", value));
  const jsonSha256 = sha256(jsonText);
  const jsText = `/* homi-atlas-knowledge-search:${jsonSha256} */\n`
    + `window.__HOMI_ATLAS_KNOWLEDGE_SEARCH__ = {jsonText:${JSON.stringify(jsonText)},`
    + `jsonSha256:${JSON.stringify(jsonSha256)}};\n`;
  return {
    jsonText,
    jsText,
    jsonSha256,
    javascriptSha256: sha256(jsText),
  };
}

const searchStopWords = new Set([
  "그리고",
  "그러나",
  "또한",
  "대한",
  "있는",
  "있다",
  "통해",
  "위해",
  "한다",
  "했다",
  "하는",
  "것을",
  "것이",
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "into",
  "are",
  "was",
  "were",
]);

function searchTerms(value) {
  return [...new Set(String(value)
    .normalize("NFKC")
    .toLocaleLowerCase("ko")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter((term) => (
      term.length >= 2
      && term.length <= 48
      && !searchStopWords.has(term)
    )))];
}

function compactSearchIndex(entries, generatedAt) {
  const strings = [];
  const stringIndexes = new Map();
  const stringIndex = (value) => {
    const normalized = value ?? "";
    if (!stringIndexes.has(normalized)) {
      stringIndexes.set(normalized, strings.length);
      strings.push(normalized);
    }
    return stringIndexes.get(normalized);
  };
  const tokenSets = entries.map((entry) => searchTerms(entry.searchText));
  const documentFrequency = new Map();
  for (const terms of tokenSets) {
    for (const term of terms) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }
  const rows = entries.map((entry) => [
    stringIndex(entry.kind),
    stringIndex(entry.nodeId),
    stringIndex(entry.sectionId),
    stringIndex(entry.label),
    stringIndex(entry.detail),
    stringIndex(entry.fromNodeId),
    stringIndex(entry.toNodeId),
  ]);
  const postings = new Map();
  tokenSets.forEach((terms, entryIndex) => {
    const forced = searchTerms(entries[entryIndex].label).slice(0, 4);
    const budget = entries[entryIndex].kind === "source_section"
      ? 9
      : entries[entryIndex].kind === "relationship"
        ? 6
        : 10;
    const ranked = [...terms].sort((left, right) => {
      const leftScore = Math.log((entries.length + 1) / ((documentFrequency.get(left) ?? 0) + 1))
        * Math.min(12, left.length);
      const rightScore = Math.log((entries.length + 1) / ((documentFrequency.get(right) ?? 0) + 1))
        * Math.min(12, right.length);
      return rightScore - leftScore || compareText(left, right);
    });
    for (const term of [...new Set([...forced, ...ranked.slice(0, budget)])]) {
      const current = postings.get(term) ?? [];
      current.push(entryIndex);
      postings.set(term, current);
    }
  });
  const terms = [...postings.entries()]
    .sort((left, right) => compareText(left[0], right[0]))
    .map(([term, entryIndexes]) => {
      let previous = 0;
      return [
        stringIndex(term),
        entryIndexes.map((entryIndex, index) => {
          const delta = index ? entryIndex - previous : entryIndex;
          previous = entryIndex;
          return delta;
        }),
      ];
    });
  const value = {
    schema: "atlas.knowledge_search.v2",
    encoding: "string_table_delta_postings_v1",
    generatedAt,
    strings,
    entries: rows,
    terms,
    manifest: {
      entryCount: rows.length,
      termCount: terms.length,
      projectionDigest: null,
    },
  };
  value.manifest.projectionDigest = sha256(stableJson({
    ...value,
    manifest: { ...value.manifest, projectionDigest: undefined },
  }));
  return value;
}

function compactKnowledgeIndex({
  generatedAt,
  graphProjectionDigest,
  releaseEligible,
  dossiers,
  documents,
  shards,
  search,
  manifest,
}) {
  const strings = [];
  const stringIndexes = new Map();
  const stringIndex = (value) => {
    const normalized = value ?? "";
    if (!stringIndexes.has(normalized)) {
      stringIndexes.set(normalized, strings.length);
      strings.push(normalized);
    }
    return stringIndexes.get(normalized);
  };
  const documentsByNode = new Map(documents.map((item) => [item.nodeId, item]));
  const shardsByNode = new Map(shards.map((item) => [item.nodeId, item]));
  const rows = dossiers.map((item) => {
    const document = documentsByNode.get(item.nodeId);
    const shard = shardsByNode.get(item.nodeId);
    if (!document || !shard) {
      throw new Error(`Knowledge compact index blocked: incomplete ${item.nodeId} binding.`);
    }
    return [
      stringIndex(item.nodeId),
      stringIndex(item.title),
      stringIndex(item.domain),
      stringIndex(item.kind),
      stringIndex(item.readerSummary.slice(0, 140)),
      stringIndex(shard.jsonSha256),
      stringIndex(shard.javascriptSha256),
      shard.bytes,
      document.publishedSectionIds.length,
      document.omittedSectionCount,
    ];
  });
  const value = {
    schema: "atlas.knowledge.v1",
    encoding: "string_table_v1",
    generatedAt,
    graphProjectionDigest,
    releaseEligible,
    strings,
    dossiers: rows,
    search: {
      token: search.jsonSha256.slice(0, 20),
      jsonSha256: search.jsonSha256,
      javascriptSha256: search.javascriptSha256,
      bytes: search.bytes,
    },
    manifest: {
      ...manifest,
      projectionDigest: null,
    },
  };
  value.manifest.projectionDigest = sha256(stableJson({
    ...value,
    manifest: { ...value.manifest, projectionDigest: undefined },
  }));
  return value;
}

function parseKnowledgeWirePayload(jsText, {
  markerPrefix,
  assignmentPrefix,
  assignmentSuffix,
}) {
  if (typeof jsText !== "string") {
    throw new Error("Knowledge wire parse blocked: wrapper must be text.");
  }
  const markerEnd = jsText.indexOf("\n");
  const marker = markerEnd < 0 ? "" : jsText.slice(0, markerEnd);
  if (!marker.startsWith(markerPrefix) || !marker.endsWith(" */")) {
    throw new Error("Knowledge wire parse blocked: marker is invalid.");
  }
  const markerDigest = marker.slice(markerPrefix.length, -3);
  if (!/^[a-f0-9]{64}$/.test(markerDigest)) {
    throw new Error("Knowledge wire parse blocked: marker digest is invalid.");
  }
  const assignmentStart = jsText.indexOf(assignmentPrefix, markerEnd + 1);
  if (assignmentStart < 0 || !jsText.endsWith(assignmentSuffix)) {
    throw new Error("Knowledge wire parse blocked: assignment is invalid.");
  }
  const payloadStart = assignmentStart + assignmentPrefix.length;
  const payloadEnd = jsText.length - assignmentSuffix.length;
  const payloadText = jsText.slice(payloadStart, payloadEnd);
  if (!payloadText.startsWith('"')) {
    throw new Error("Knowledge wire parse blocked: payload is invalid.");
  }
  let stringEnd = 1;
  let escaped = false;
  for (; stringEnd < payloadText.length; stringEnd += 1) {
    const character = payloadText[stringEnd];
    if (escaped) {
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === '"') {
      stringEnd += 1;
      break;
    }
  }
  const jsonText = JSON.parse(payloadText.slice(0, stringEnd));
  const digestPrefix = ",jsonSha256:";
  if (!payloadText.startsWith(digestPrefix, stringEnd)) {
    throw new Error("Knowledge wire parse blocked: digest field is invalid.");
  }
  const jsonSha256 = JSON.parse(payloadText.slice(stringEnd + digestPrefix.length));
  if (typeof jsonText !== "string" || typeof jsonSha256 !== "string") {
    throw new Error("Knowledge wire parse blocked: payload is invalid.");
  }
  if (jsonSha256 !== markerDigest || sha256(jsonText) !== jsonSha256) {
    throw new Error("Knowledge wire parse blocked: embedded JSON digest mismatch.");
  }
  const wireValue = JSON.parse(jsonText);
  if (wireValue?.schema !== "atlas.knowledge_wire.v1"
    || wireValue?.encoding !== "gzip_base64_v1"
    || !["shard", "search"].includes(wireValue?.kind)
    || typeof wireValue?.registryKey !== "string"
    || typeof wireValue?.payload !== "string"
    || !/^[a-f0-9]{64}$/.test(String(wireValue?.innerJsonSha256 ?? ""))
    || !Number.isInteger(wireValue?.innerBytes)
    || wireValue.innerBytes < 1) {
    throw new Error("Knowledge wire parse blocked: compressed envelope is invalid.");
  }
  const innerJsonText = gunzipSync(Buffer.from(wireValue.payload, "base64")).toString("utf8");
  if (Buffer.byteLength(innerJsonText) !== wireValue.innerBytes
    || sha256(innerJsonText) !== wireValue.innerJsonSha256) {
    throw new Error("Knowledge wire parse blocked: compressed payload digest mismatch.");
  }
  return {
    jsonText,
    jsonSha256,
    javascriptSha256: sha256(jsText),
    innerJsonText,
    wireValue,
    value: JSON.parse(innerJsonText),
  };
}

export function parseKnowledgeShardWrapper(jsText) {
  const registryPrefix = "window.__HOMI_ATLAS_KNOWLEDGE_SHARDS__[";
  const registryStart = jsText.indexOf(registryPrefix);
  const registryEnd = registryStart < 0
    ? -1
    : jsText.indexOf("] = {jsonText:", registryStart + registryPrefix.length);
  if (registryStart < 0 || registryEnd < 0) {
    throw new Error("Knowledge shard parse blocked: registry key is missing.");
  }
  const nodeId = JSON.parse(jsText.slice(
    registryStart + registryPrefix.length,
    registryEnd,
  ));
  if (typeof nodeId !== "string" || !nodeId) {
    throw new Error("Knowledge shard parse blocked: node key is invalid.");
  }
  const parsed = parseKnowledgeWirePayload(jsText, {
    markerPrefix: "/* homi-atlas-knowledge-shard:",
    assignmentPrefix: `${registryPrefix}${JSON.stringify(nodeId)}] = {jsonText:`,
    assignmentSuffix: "};\n",
  });
  if (parsed.value?.schema !== "atlas.knowledge_shard.v1"
    || parsed.value?.nodeId !== nodeId
    || parsed.wireValue?.kind !== "shard"
    || parsed.wireValue?.registryKey !== nodeId) {
    throw new Error("Knowledge shard parse blocked: schema or node binding mismatch.");
  }
  return { ...parsed, nodeId };
}

export function parseKnowledgeSearchWrapper(jsText) {
  const parsed = parseKnowledgeWirePayload(jsText, {
    markerPrefix: "/* homi-atlas-knowledge-search:",
    assignmentPrefix: "window.__HOMI_ATLAS_KNOWLEDGE_SEARCH__ = {jsonText:",
    assignmentSuffix: "};\n",
  });
  if (parsed.value?.schema !== "atlas.knowledge_search.v2") {
    throw new Error("Knowledge search parse blocked: schema mismatch.");
  }
  if (parsed.wireValue?.kind !== "search"
    || parsed.wireValue?.registryKey !== "knowledge-search") {
    throw new Error("Knowledge search parse blocked: registry binding mismatch.");
  }
  return parsed;
}

export function compileKnowledgePublicationV1({
  graph,
  records,
  reviewedDossiers,
  policy,
  generatedAt,
  releaseEligible = false,
}) {
  const policyFailures = validatePublicationPolicyV3(policy);
  if (policyFailures.length) throw new Error(`Knowledge projection blocked: ${policyFailures.join(", ")}.`);
  if (reviewedDossiers?.schema !== "atlas.reviewed_dossiers.v1") {
    throw new Error("Knowledge projection blocked: reviewed dossier source is invalid.");
  }
  const graphModel = decodeGraph(graph);
  const reviewByNodeId = new Map(reviewedDossiers.dossiers.map((review) => [review.nodeId, review]));
  const reviewedNodeIds = new Set(reviewByNodeId.keys());
  if (reviewByNodeId.size !== reviewedDossiers.dossiers.length) {
    throw new Error("Knowledge projection blocked: duplicate dossier review node.");
  }
  const recordsWithAliases = records.map((record) => ({
    ...record,
    aliases: Array.isArray(record.aliases)
      ? record.aliases
      : String(record.frontmatter?.aliases ?? "")
        .replace(/^\[|\]$/g, "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
  }));
  const targetLookup = targetIndex(recordsWithAliases);
  const parsedDocuments = new Map();
  const privateLedger = [];
  for (const record of recordsWithAliases) {
    const review = reviewByNodeId.get(record.nodeId);
    if (!review) continue;
    const parsed = parseKnowledgeSections({ nodeId: record.nodeId, markdown: record.markdown });
    const decisions = decisionMapForSections(parsed, review, policy);
    const sectionByHeading = new Map(parsed.sections.map((section) => [section.heading, section.sectionId]));
    const sections = [];
    let omittedSectionCount = 0;
    let omittedBlockCount = 0;
    for (const section of parsed.sections) {
      const decision = decisions.get(section.sectionId);
      const publicHeading = sanitizePublicKnowledgeText(decision.publicHeading ?? section.heading);
      const headingFindings = [
        ...scanPrivacyText(publicHeading, { path: "knowledge-section-heading" }),
        ...scanOperatingExposure(publicHeading, { path: "knowledge-section-heading" }),
      ];
      if (decision.disposition === "knowledge"
        && (!publicHeading || headingFindings.length)) {
        throw new Error(`Knowledge section blocked: unsafe public heading for ${record.nodeId}.`);
      }
      const blocks = [];
      for (const rawBlock of section.blocks) {
        const candidate = safeBlockCandidate(rawBlock, decision.disposition, policy);
        const publicBlock = candidate.block
          ? resolveBlock(candidate.block, record, targetLookup, reviewedNodeIds, sectionByHeading)
          : null;
        const sourceOccurrences = candidate.occurrences.map((occurrence) => {
          const safeContextTokens = resolveInlineTokens(
            occurrence.contextTokens,
            record,
            targetLookup,
            reviewedNodeIds,
            sectionByHeading,
          );
          const { contextTokens, ...identity } = occurrence;
          return {
            ...identity,
            context: publicRelationContext(safeContextTokens),
          };
        });
        if (!candidate.safe) omittedBlockCount += 1;
        blocks.push({
          ...(publicBlock ?? {
            id: rawBlock.id,
            type: "omitted",
            reason: candidate.reason,
          }),
          sectionId: section.sectionId,
          publicEligible: candidate.safe,
          sourceOccurrences,
        });
      }
      const visible = decision.disposition === "knowledge"
        ? blocks.filter((block) => block.publicEligible)
        : [];
      if (!visible.length) {
        omittedSectionCount += 1;
      } else {
        sections.push({
          id: section.sectionId,
          heading: publicHeading,
          depth: section.depth,
          blocks: visible.map(({ publicEligible, sourceOccurrences, sectionId, ...block }) => block),
        });
      }
      privateLedger.push({
        nodeId: record.nodeId,
        relativePath: record.relativePath,
        sectionId: section.sectionId,
        sourceHeadingLine: section.sourceHeadingLine,
        disposition: decision.disposition,
        omittedBlocks: blocks.filter((block) => !block.publicEligible).length,
      });
      section.blocks = blocks;
    }
    const publishedSectionIds = new Set(sections.map((section) => section.id));
    const safeSections = sections.map((section) => ({
      ...section,
      blocks: section.blocks.map((block) => restrictLocalSectionLinks(block, publishedSectionIds)),
    }));
    const metadata = {};
    for (const key of policy.metadata.allowedKeys) {
      const value = parsed.frontmatter[key];
      if (value && !scanPrivacyText(value).length && !scanOperatingExposure(value).length) {
        metadata[key] = sanitizePublicKnowledgeText(value);
      }
    }
    parsedDocuments.set(record.nodeId, {
      nodeId: record.nodeId,
      title: record.displayTitle ?? record.title,
      domain: record.domain,
      kind: record.kind,
      metadata,
      sections: safeSections,
      parsedSections: parsed.sections,
      omittedSectionCount,
      omittedBlockCount,
    });
  }

  const occurrenceLedger = publicOccurrenceLedger(parsedDocuments, recordsWithAliases, graphModel);
  const dossierValues = [];
  const shardValues = [];
  for (const review of [...reviewedDossiers.dossiers].sort((left, right) => compareText(left.nodeId, right.nodeId))) {
    const parsed = parsedDocuments.get(review.nodeId);
    const graphNode = graphModel.nodeById.get(review.nodeId);
    if (!parsed || !graphNode) throw new Error(`Knowledge projection blocked: reviewed node ${review.nodeId} is absent.`);
    const claimDocument = {
      nodeId: review.nodeId,
      sections: parsed.sections.map((section) => ({
        heading: section.heading,
        blocks: section.blocks.map((block) => ({
          ...block,
          sectionId: section.id,
        })),
      })),
    };
    const evidenceById = new Map();
    const readerSummary = compileClaim(
      review.nodeId,
      "reader-summary",
      0,
      review.readerSummary,
      claimDocument,
      evidenceById,
    );
    const keyInsights = (review.keyInsights ?? []).slice(0, 5).map((claim, index) => compileClaim(
      review.nodeId,
      "key-insight",
      index,
      claim,
      claimDocument,
      evidenceById,
    ));
    const whyItMatters = compileClaim(
      review.nodeId,
      "why-it-matters",
      0,
      review.whyItMatters,
      claimDocument,
      evidenceById,
    );
    const caveats = (review.caveats ?? []).slice(0, 4).map((claim, index) => compileClaim(
      review.nodeId,
      "caveat",
      index,
      claim,
      claimDocument,
      evidenceById,
    ));
    const openQuestions = (review.openQuestions ?? []).slice(0, 4).map((claim, index) => compileClaim(
      review.nodeId,
      "open-question",
      index,
      claim,
      claimDocument,
      evidenceById,
    ));
    const relationExplanations = relationExplanationsForNode(
      review.nodeId,
      graphModel,
      occurrenceLedger,
      evidenceById,
    );
    const evidence = [...evidenceById.values()].slice(0, 12);
    const allowedEvidenceIds = new Set(evidence.map((item) => item.id));
    const relations = relationExplanations.map((relation) => ({
      ...relation,
      evidenceIds: relation.evidenceIds.filter((id) => allowedEvidenceIds.has(id)),
      ...(relation.evidenceIds.some((id) => !allowedEvidenceIds.has(id))
        ? {
            kind: "evidence_gap",
            explanation: "실제 방향 edge는 있으나 이 dossier의 공개 evidence 예산 안에서 직접 문맥을 제공하지 못했습니다.",
          }
        : {}),
    }));
    const dossier = {
      nodeId: review.nodeId,
      title: parsed.title,
      domain: graphNode.domain,
      kind: graphNode.kind,
      readerSummary,
      keyInsights,
      whyItMatters,
      relationExplanations: relations,
      caveats,
      openQuestions,
      evidence,
      sourceReader: {
        documentId: `document:${review.nodeId}`,
        publishedSectionIds: parsed.sections.map((section) => section.id),
        omittedSectionCount: parsed.omittedSectionCount,
      },
    };
    const document = {
      id: `document:${review.nodeId}`,
      nodeId: review.nodeId,
      title: parsed.title,
      metadata: parsed.metadata,
      sections: parsed.sections,
      omittedSectionCount: parsed.omittedSectionCount,
      omittedBlockCount: parsed.omittedBlockCount,
      notice: "운영·민감 section을 제외한 공개 안전 원문",
    };
    const shard = {
      schema: "atlas.knowledge_shard.v1",
      nodeId: review.nodeId,
      dossier,
      document,
      manifest: {
        claimCount: 2 + keyInsights.length + caveats.length + openQuestions.length,
        evidenceCount: evidence.length,
        relationExplanationCount: relations.length,
        publishedSectionCount: document.sections.length,
        omittedSectionCount: document.omittedSectionCount,
        projectionDigest: null,
      },
    };
    shard.manifest.projectionDigest = sha256(stableJson({
      ...shard,
      manifest: { ...shard.manifest, projectionDigest: undefined },
    }));
    const wire = makeShardWire(review.nodeId, shard);
    const contentToken = wire.jsonSha256.slice(0, 20);
    const entry = {
      nodeId: review.nodeId,
      path: `data/knowledge-shards/${contentToken}.json`,
      jsonSha256: wire.jsonSha256,
      javascriptPath: `data/knowledge-shards/${contentToken}.js`,
      javascriptSha256: wire.javascriptSha256,
      bytes: Buffer.byteLength(wire.jsonText),
    };
    if (entry.bytes > policy.reader.maxShardBytes) {
      throw new Error(`Knowledge shard ${review.nodeId} ${entry.bytes}B exceeds policy budget.`);
    }
    dossierValues.push({
      nodeId: review.nodeId,
      title: parsed.title,
      domain: graphNode.domain,
      kind: graphNode.kind,
      readerSummary: readerSummary.text,
      shardPath: entry.javascriptPath,
      shardJsonSha256: entry.jsonSha256,
    });
    shardValues.push({ entry, value: shard, ...wire });
  }

  const searchEntries = [];
  for (const shard of shardValues) {
    const { dossier, document } = shard.value;
    searchEntries.push({
      id: `search:knowledge:${dossier.nodeId}`,
      kind: "knowledge",
      nodeId: dossier.nodeId,
      label: dossier.title,
      detail: dossier.readerSummary.text.slice(0, 96),
      searchText: [
        dossier.title,
        dossier.domain,
        dossier.readerSummary.text,
        ...dossier.keyInsights.map((claim) => claim.text),
        dossier.whyItMatters.text,
        ...dossier.caveats.map((claim) => claim.text),
        ...dossier.openQuestions.map((claim) => claim.text),
      ].join(" "),
    });
    for (const claim of [
      ...dossier.keyInsights,
      dossier.whyItMatters,
      ...dossier.caveats,
      ...dossier.openQuestions,
    ]) {
      searchEntries.push({
        id: `search:insight:${claim.id}`,
        kind: "insight",
        nodeId: dossier.nodeId,
        label: claim.text,
        detail: dossier.title,
        searchText: `${dossier.title} ${dossier.domain} ${claim.text}`,
      });
    }
    for (const section of document.sections) {
      const sectionText = section.blocks.map(blockText).join(" ");
      searchEntries.push({
        id: `search:section:${section.id}`,
        kind: "source_section",
        nodeId: dossier.nodeId,
        sectionId: section.id,
        label: section.heading,
        detail: dossier.title,
        searchText: `${dossier.title} ${section.heading} ${sectionText}`,
      });
    }
  }
  const indexedRelationEdges = new Set();
  for (const shard of shardValues) {
    const { dossier } = shard.value;
    for (const relation of dossier.relationExplanations) {
      if (relation.kind !== "direct_context" || indexedRelationEdges.has(relation.edgeId)) continue;
      indexedRelationEdges.add(relation.edgeId);
      const source = graphModel.nodeById.get(relation.sourceNodeId);
      const target = graphModel.nodeById.get(relation.targetNodeId);
      searchEntries.push({
        id: `search:relation:${relation.id}`,
        kind: "relationship",
        nodeId: dossier.nodeId,
        fromNodeId: relation.sourceNodeId,
        toNodeId: relation.targetNodeId,
        label: `${source?.title ?? "공개 node"} → ${target?.title ?? "공개 node"}`,
        detail: "실제 방향 관계",
        searchText: [
          source?.title,
          target?.title,
          source?.domain,
          target?.domain,
          relation.explanation,
        ].filter(Boolean).join(" "),
      });
    }
  }
  searchEntries.sort((left, right) => compareText(left.id, right.id));
  const searchValue = compactSearchIndex(searchEntries, generatedAt);
  const searchWire = makeSearchWire(searchValue);
  const searchToken = searchWire.jsonSha256.slice(0, 20);

  const graphCoverage = {
    reviewed: dossierValues.length,
    total: graphModel.nodes.length,
    complete: dossierValues.length === graphModel.nodes.length,
  };
  if (releaseEligible && !graphCoverage.complete) {
    throw new Error(`Knowledge release blocked: ${graphCoverage.reviewed}/${graphCoverage.total} graph nodes reviewed.`);
  }
  const documents = shardValues.map(({ value, entry }) => ({
    documentId: value.document.id,
    nodeId: value.nodeId,
    publishedSectionIds: value.document.sections.map((section) => section.id),
    omittedSectionCount: value.document.omittedSectionCount,
    shardPath: entry.javascriptPath,
  }));
  const manifest = {
    dossierCount: dossierValues.length,
    documentCount: documents.length,
    claimCount: shardValues.reduce((sum, item) => sum + item.value.manifest.claimCount, 0),
    evidenceCount: shardValues.reduce((sum, item) => sum + item.value.manifest.evidenceCount, 0),
    relationExplanationCount: shardValues.reduce(
      (sum, item) => sum + item.value.manifest.relationExplanationCount,
      0,
    ),
    publishedSectionCount: shardValues.reduce(
      (sum, item) => sum + item.value.manifest.publishedSectionCount,
      0,
    ),
    omittedSectionCount: shardValues.reduce(
      (sum, item) => sum + item.value.manifest.omittedSectionCount,
      0,
    ),
    unclassifiedSectionCount: 0,
    reviewedGraphCoverage: graphCoverage,
    projectionDigest: null,
  };
  const indexValue = compactKnowledgeIndex({
    generatedAt,
    graphProjectionDigest: graph.manifest.projectionDigest,
    releaseEligible: Boolean(releaseEligible && graphCoverage.complete),
    dossiers: dossierValues,
    documents,
    shards: shardValues.map((item) => item.entry),
    search: {
      token: searchToken,
      jsonSha256: searchWire.jsonSha256,
      javascriptSha256: searchWire.javascriptSha256,
      bytes: Buffer.byteLength(searchWire.jsonText),
    },
    manifest,
  });

  return {
    index: indexValue,
    shards: shardValues,
    search: { value: searchValue, ...searchWire },
    privateOccurrenceLedger: occurrenceLedger,
    privateSectionLedger: privateLedger,
  };
}

export function verifyKnowledgeProjectionV1({ graph, index, shards, search }) {
  const failures = [];
  if (index?.schema !== "atlas.knowledge.v1"
    || index?.encoding !== "string_table_v1"
    || !Array.isArray(index?.strings)) failures.push("index-schema");
  if (index?.graphProjectionDigest !== graph?.manifest?.projectionDigest) failures.push("graph-binding");
  if (index?.manifest?.dossierCount !== index?.dossiers?.length) failures.push("dossier-count");
  if (index?.manifest?.documentCount !== index?.dossiers?.length) failures.push("document-count");
  if (index?.manifest?.unclassifiedSectionCount !== 0) failures.push("unclassified-section");
  const indexedNodeIds = index?.dossiers?.map((item) => index.strings?.[item?.[0]]) ?? [];
  if (new Set(indexedNodeIds).size !== index?.dossiers?.length) {
    failures.push("dossier-duplicate");
  }
  const shardByNode = new Map(shards.map((item) => [item.value.nodeId, item]));
  for (const row of index?.dossiers ?? []) {
    const entry = {
      nodeId: index.strings?.[row?.[0]],
      jsonSha256: index.strings?.[row?.[5]],
      javascriptSha256: index.strings?.[row?.[6]],
    };
    const shard = shardByNode.get(entry.nodeId);
    if (!shard || shard.jsonSha256 !== entry.jsonSha256
      || shard.javascriptSha256 !== entry.javascriptSha256) failures.push(`shard-binding:${entry.nodeId}`);
    const dossier = shard?.value?.dossier;
    if (dossier) {
      const evidenceIds = new Set(dossier.evidence.map((item) => item.id));
      const claims = [
        dossier.readerSummary,
        ...dossier.keyInsights,
        dossier.whyItMatters,
        ...dossier.caveats,
        ...dossier.openQuestions,
      ];
      if (claims.some((claim) => !claim.evidenceIds.length
        || claim.evidenceIds.some((id) => !evidenceIds.has(id)))) {
        failures.push(`claim-evidence:${entry.nodeId}`);
      }
      if (dossier.relationExplanations.some((relation) => (
        relation.kind !== "evidence_gap"
        && (!relation.evidenceIds.length
          || relation.evidenceIds.some((id) => !evidenceIds.has(id)))
      ))) failures.push(`relation-evidence:${entry.nodeId}`);
    }
  }
  if (search?.value?.schema !== "atlas.knowledge_search.v2"
    || search?.value?.encoding !== "string_table_delta_postings_v1"
    || search?.value?.manifest?.entryCount !== search?.value?.entries?.length
    || search?.jsonSha256 !== index?.search?.jsonSha256
    || search?.javascriptSha256 !== index?.search?.javascriptSha256) failures.push("search-binding");
  if (shards.some((item) => containsInternalKnowledgeMarker(item.value))) {
    failures.push("internal-numbering-shard");
  }
  if (containsInternalKnowledgeMarker(search?.value ?? null)) {
    failures.push("internal-numbering-search");
  }
  const projectionDigest = sha256(stableJson({
    ...index,
    manifest: { ...index.manifest, projectionDigest: undefined },
  }));
  if (projectionDigest !== index?.manifest?.projectionDigest) failures.push("projection-digest");
  return [...new Set(failures)];
}
