import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const APPROVED_NODE_IDS = Object.freeze([
  "rocket",
  "groot",
  "atlas",
  "knowledge-library",
  "research-cycle",
  "knowledge-upkeep",
  "rocket-desks",
  "desk-frontier",
  "desk-compute",
  "desk-physical",
  "desk-science",
  "desk-markets",
  "desk-society",
  "desk-governance",
  "rocket-clocks",
  "rocket-horizon",
  "horizon-base",
  "horizon-acceleration",
  "horizon-constraints",
  "horizon-fragmentation",
  "groot-adventure",
  "groot-living",
  "groot-relationships",
  "groot-moko",
  "groot-rin",
  "groot-hana",
  "groot-art-explore",
  "groot-art-characters",
  "groot-art-combat",
  "groot-art-dialogue",
  "concept-evidence",
  "concept-memory",
  "concept-graphs",
  "concept-world-model",
  "concept-trust",
  "concept-reuse",
  "daily-lens",
  "weekly-lens",
  "papers-lens",
  "rocket-delegation",
  "rocket-feedback",
  "groot-choices",
  "concept-agent",
]);

const NODE_KINDS = new Set([
  "project",
  "foundation",
  "research-map",
  "research-desk",
  "research-story",
  "scenario",
  "game-design",
  "fictional-character",
  "goal-art",
  "knowledge-concept",
  "research-practice",
]);
const RELATIONS = new Set([
  "organizes",
  "synthesizes_into",
  "explains",
  "part_of",
  "curates_into",
  "maintains",
  "designed_for",
  "design_input",
  "presents",
]);
const EXCERPT_FORMS = new Set([
  "paragraph",
  "sentence",
  "sentence_sequence",
  "list_item",
]);
const PUBLIC_KEYS = new Set([
  "schema_version",
  "schemaVersion",
  "language",
  "title",
  "introduction",
  "nodes",
  "routes",
  "relations",
  "id",
  "kind",
  "eyebrow",
  "summary",
  "paragraphs",
  "points",
  "state",
  "links",
  "description",
  "steps",
  "source",
  "target",
  "relation",
  "label",
  "recordCount",
  "readingNote",
  "records",
  "publicationTitle",
  "titleEdited",
  "titleNote",
  "evidenceType",
  "basisDate",
  "basisNote",
  "nodeIds",
  "claim",
  "limitations",
  "excerptParagraphs",
  "editorialExplanation",
  "form",
  "text",
  "omissions",
]);
const HASH = /^[a-f\d]{64}$/u;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value) => typeof value === "string" && value.trim().length > 0;

/** Private dictionaries are read at verification time and never bundled with the site. */
export function compilePrivatePatterns(document) {
  if (!object(document) || !Array.isArray(document.patterns))
    throw new Error("Private pattern input must contain a patterns array.");
  return document.patterns.map((entry, index) => {
    if (!object(entry) || !text(entry.pattern))
      throw new Error(`Invalid private pattern ${index}.`);
    const flags = entry.flags ?? "iu";
    if (typeof flags !== "string" || /[^imsu]/u.test(flags))
      throw new Error(`Invalid private pattern flags ${index}.`);
    return {
      id: `policy-${index + 1}`,
      expression: new RegExp(entry.pattern, flags),
    };
  });
}

export function validateContent(
  content,
  evidence,
  { privatePatterns = [] } = {},
) {
  const issues = [];
  const issue = (path, message) => issues.push({ path, message });
  const shape = (value, fields, required, path) => {
    if (!object(value)) {
      issue(path, "Expected an object.");
      return false;
    }
    for (const key of Object.keys(value))
      if (!fields.includes(key))
        issue(
          `${path}.[unapproved-field]`,
          "Field is outside the public schema.",
        );
    for (const key of required)
      if (!(key in value))
        issue(`${path}.${key}`, "Required public field is missing.");
    return true;
  };
  const strings = (values, path, min = 0) => {
    if (!Array.isArray(values)) {
      issue(path, "Expected a text array.");
      return [];
    }
    if (values.length < min) issue(path, `Expected at least ${min} item(s).`);
    values.forEach((v, i) => {
      if (!text(v)) issue(`${path}[${i}]`, "Expected non-empty text.");
    });
    return values.filter(text);
  };
  const unique = (values, path) => {
    const seen = new Set();
    for (const value of values) {
      if (seen.has(value)) issue(path, "Duplicate identity or reference.");
      seen.add(value);
    }
    return seen;
  };
  const nonemptyFields = (value, fields, path) =>
    fields.forEach((key) => {
      if (!text(value[key]))
        issue(`${path}.${key}`, "Expected non-empty text.");
    });
  const scan = (value, path) => {
    if (typeof value === "string") {
      let normalized = value.normalize("NFKC");
      try {
        normalized += `\n${decodeURIComponent(value)}`;
      } catch {
        /* Literal percent signs are valid prose. */
      }
      if (
        /(?:[a-z][a-z\d+.-]*:\/\/|\bmailto:|\bdata:|\/Users\/|\/home\/|\/private\/|[a-z]:\\|\[\[)/iu.test(
          normalized,
        )
      )
        issue(
          path,
          "External URL, local path, embedded data, or raw knowledge link is not public content.",
        );
      if (
        /\b(?:source_path|snapshot_path|canonical_path|raw_source|source_sha256|char_start|char_end)\b/iu.test(
          normalized,
        )
      )
        issue(path, "Private provenance text is not public content.");
      if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/u.test(normalized))
        issue(path, "Credential material is not public content.");
      for (const pattern of privatePatterns)
        if (pattern.expression.test(normalized))
          issue(path, `Private publication rule matched (${pattern.id}).`);
    } else if (Array.isArray(value))
      value.forEach((v, i) => scan(v, `${path}[${i}]`));
    else if (object(value))
      Object.entries(value).forEach(([key, v]) =>
        scan(v, `${path}.${PUBLIC_KEYS.has(key) ? key : "[unapproved-field]"}`),
      );
  };

  const cf = [
    "schema_version",
    "language",
    "title",
    "introduction",
    "nodes",
    "routes",
    "relations",
  ];
  const ef = [
    "schemaVersion",
    "language",
    "recordCount",
    "readingNote",
    "records",
  ];
  if (
    !shape(content, cf, cf, "content") ||
    !shape(evidence, ef, ef, "evidence")
  )
    return { valid: false, issues };
  if (
    content.schema_version !== "atlas-content-curation-1" ||
    evidence.schemaVersion !== "atlas-public-evidence-1"
  )
    issue("schema", "Unexpected public schema version.");
  if (content.language !== "ko" || evidence.language !== "ko")
    issue("language", "This release contains Korean content.");
  if (content.title !== "Homi Atlas")
    issue("content.title", "Title is outside the approved first-party scope.");
  nonemptyFields(content, ["introduction"], "content");
  nonemptyFields(evidence, ["readingNote"], "evidence");
  const nodes = Array.isArray(content.nodes) ? content.nodes : [];
  const records = Array.isArray(evidence.records) ? evidence.records : [];
  if (nodes.length !== 43)
    issue("content.nodes", "Expected 43 reviewed content nodes.");
  if (records.length !== 23 || evidence.recordCount !== records.length)
    issue(
      "evidence.records",
      "Expected 23 reviewed evidence records and a matching count.",
    );
  const ids = unique(
    nodes.map((n) => n?.id),
    "content.nodes",
  );
  const approved = new Set(APPROVED_NODE_IDS);
  for (const id of ids)
    if (!approved.has(id))
      issue(
        "content.nodes",
        "Node is outside the approved first-party allowlist.",
      );
  for (const id of approved)
    if (!ids.has(id)) issue("content.nodes", `Missing approved node: ${id}.`);
  const nodeFields = [
    "id",
    "kind",
    "title",
    "eyebrow",
    "summary",
    "paragraphs",
    "points",
    "state",
    "links",
  ];
  nodes.forEach((node, i) => {
    const p = `content.nodes[${i}]`;
    if (!shape(node, nodeFields, nodeFields, p)) return;
    nonemptyFields(
      node,
      ["id", "kind", "title", "eyebrow", "summary", "state"],
      p,
    );
    if (!NODE_KINDS.has(node.kind)) issue(`${p}.kind`, "Unknown content kind.");
    if (
      ["rocket", "groot", "atlas"].includes(node.id) !==
      (node.kind === "project")
    )
      issue(`${p}.kind`, "Independent project scope changed.");
    strings(node.paragraphs, `${p}.paragraphs`);
    strings(node.points, `${p}.points`, 1);
    for (const id of unique(strings(node.links, `${p}.links`), `${p}.links`))
      if (!ids.has(id)) issue(`${p}.links`, "Dangling content link.");
  });

  if (!Array.isArray(content.routes))
    issue("content.routes", "Expected routes.");
  else {
    unique(
      content.routes.map((r) => r?.id),
      "content.routes",
    );
    content.routes.forEach((route, i) => {
      const p = `content.routes[${i}]`;
      const fields = ["id", "title", "description", "steps"];
      if (!shape(route, fields, fields, p)) return;
      nonemptyFields(route, ["id", "title", "description"], p);
      for (const id of unique(
        strings(route.steps, `${p}.steps`, 1),
        `${p}.steps`,
      ))
        if (!ids.has(id)) issue(`${p}.steps`, "Dangling route step.");
    });
  }
  if (!Array.isArray(content.relations))
    issue("content.relations", "Expected relations.");
  else {
    const relationIds = [];
    content.relations.forEach((relation, i) => {
      const p = `content.relations[${i}]`;
      const fields = ["source", "target", "relation", "label"];
      if (!shape(relation, fields, fields, p)) return;
      nonemptyFields(relation, fields, p);
      if (!ids.has(relation.source) || !ids.has(relation.target))
        issue(p, "Dangling relation endpoint.");
      if (relation.source === relation.target)
        issue(p, "A self relation is not part of the reviewed graph.");
      if (!RELATIONS.has(relation.relation))
        issue(`${p}.relation`, "Unknown relationship meaning.");
      relationIds.push(
        JSON.stringify([relation.source, relation.target, relation.relation]),
      );
    });
    unique(relationIds, "content.relations");
  }

  unique(
    records.map((r) => r?.id),
    "evidence.records",
  );
  const covered = new Set();
  const recordFields = [
    "id",
    "publicationTitle",
    "titleEdited",
    "titleNote",
    "evidenceType",
    "basisDate",
    "basisNote",
    "nodeIds",
    "claim",
    "limitations",
    "excerptParagraphs",
    "editorialExplanation",
  ];
  const requiredRecordFields = recordFields.filter(
    (f) => f !== "editorialExplanation",
  );
  records.forEach((record, i) => {
    const p = `evidence.records[${i}]`;
    if (!shape(record, recordFields, requiredRecordFields, p)) return;
    nonemptyFields(
      record,
      [
        "id",
        "publicationTitle",
        "titleNote",
        "evidenceType",
        "basisDate",
        "basisNote",
        "claim",
      ],
      p,
    );
    if (!/^ev_[a-f\d]{12}$/u.test(record.id ?? ""))
      issue(`${p}.id`, "Evidence identity must be opaque.");
    if (record.titleEdited !== true)
      issue(`${p}.titleEdited`, "Edited publication titles must be explicit.");
    const dateValue = Date.parse(`${record.basisDate}T00:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/u.test(record.basisDate ?? "") ||
      Number.isNaN(dateValue) ||
      new Date(dateValue).toISOString().slice(0, 10) !== record.basisDate
    )
      issue(`${p}.basisDate`, "Expected a valid basis date.");
    strings(record.limitations, `${p}.limitations`, 1);
    for (const id of unique(
      strings(record.nodeIds, `${p}.nodeIds`, 1),
      `${p}.nodeIds`,
    )) {
      if (!ids.has(id)) issue(`${p}.nodeIds`, "Dangling evidence reference.");
      covered.add(id);
    }
    if (
      !Array.isArray(record.excerptParagraphs) ||
      record.excerptParagraphs.length === 0
    )
      issue(
        `${p}.excerptParagraphs`,
        "Every evidence record needs an actual excerpt.",
      );
    else
      record.excerptParagraphs.forEach((excerpt, j) => {
        const q = `${p}.excerptParagraphs[${j}]`;
        const fields = ["label", "kind", "form", "text", "omissions"];
        if (!shape(excerpt, fields, fields, q)) return;
        if (typeof excerpt.label !== "string")
          issue(`${q}.label`, "Expected a text label.");
        nonemptyFields(excerpt, ["text", "omissions"], q);
        if (
          excerpt.kind !== "exact_excerpt" ||
          !EXCERPT_FORMS.has(excerpt.form)
        )
          issue(
            q,
            "An excerpt must retain its exact-quote kind and selection form.",
          );
      });
    if (record.editorialExplanation !== undefined) {
      const explanation = record.editorialExplanation;
      const q = `${p}.editorialExplanation`;
      if (shape(explanation, ["kind", "text"], ["kind", "text"], q)) {
        if (explanation.kind !== "editorial_rewrite_not_quote")
          issue(
            `${q}.kind`,
            "Editorial prose must never be marked as an exact quotation.",
          );
        nonemptyFields(explanation, ["text"], q);
      }
    }
  });
  for (const id of ids)
    if (approved.has(id) && !covered.has(id))
      issue("evidence.records", `No readable evidence for node: ${id}.`);
  scan(content, "content");
  scan(evidence, "evidence");
  return { valid: issues.length === 0, issues };
}

/** Optional local release check; no private paths or bytes are copied into output. */
export async function verifyPrivateEvidence(
  evidence,
  mapping,
  { read = readFile } = {},
) {
  const issues = [];
  const records = new Map(
    (evidence.records ?? []).map((record) => [record.id, record]),
  );
  const entries = Array.isArray(mapping?.evidence) ? mapping.evidence : [];
  const seen = new Set();
  const cache = new Map();
  const fail = (id, index, message) =>
    issues.push({
      path: `evidence:${/^ev_[a-f\d]{12}$/u.test(id ?? "") ? id : "invalid-identity"}:excerpt:${index}`,
      message,
    });
  for (const entry of entries) {
    const id = entry.evidence_id;
    const record = records.get(id);
    if (!record || seen.has(id)) {
      fail(id, 0, "Unknown or repeated private evidence mapping.");
      continue;
    }
    seen.add(id);
    if (
      !Array.isArray(entry.excerpt_mappings) ||
      entry.excerpt_mappings.length !== record.excerptParagraphs.length
    ) {
      fail(id, 0, "Private excerpt count differs.");
      continue;
    }
    for (const [index, source] of entry.excerpt_mappings.entries()) {
      const quote = record.excerptParagraphs[index].text;
      if (
        !text(source.snapshot_path) ||
        !HASH.test(source.source_sha256 ?? "") ||
        !HASH.test(source.excerpt_sha256 ?? "")
      ) {
        fail(id, index, "Invalid private proof identity.");
        continue;
      }
      try {
        if (!cache.has(source.snapshot_path))
          cache.set(
            source.snapshot_path,
            Buffer.from(await read(source.snapshot_path)),
          );
        const bytes = cache.get(source.snapshot_path);
        const body = bytes.toString("utf8");
        // The research map records Unicode code-point positions, not UTF-16 offsets.
        const characters = [...body];
        if (
          bytes.length !== source.source_bytes ||
          sha256(bytes) !== source.source_sha256
        )
          fail(id, index, "Frozen source byte identity differs.");
        if (
          !Number.isInteger(source.char_start) ||
          !Number.isInteger(source.char_end) ||
          source.char_start < 0 ||
          source.char_end <= source.char_start ||
          characters.slice(source.char_start, source.char_end).join("") !==
            quote ||
          sha256(quote) !== source.excerpt_sha256
        )
          fail(id, index, "Exact excerpt differs from its frozen source.");
        if (
          characters.slice(0, source.char_start).filter((c) => c === "\n")
            .length +
            1 !==
            source.line_start ||
          characters.slice(0, source.char_end).filter((c) => c === "\n")
            .length +
            1 !==
            source.line_end
        )
          fail(id, index, "Excerpt line identity differs.");
      } catch {
        fail(id, index, "Private source could not be read.");
      }
    }
  }
  for (const id of records.keys())
    if (!seen.has(id)) fail(id, 0, "Private mapping is missing.");
  return { valid: issues.length === 0, issues };
}

/** Read-only check of the actual no-JavaScript reader emitted by the build. */
export function validateStaticReader(
  html,
  content,
  evidence,
  { privatePatterns = [] } = {},
) {
  const issues = [];
  const issue = (path, message) => issues.push({ path, message });
  const decode = (value) =>
    value.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/giu, (entity) => {
      const names = {
        "&amp;": "&",
        "&lt;": "<",
        "&gt;": ">",
        "&quot;": '"',
        "&apos;": "'",
      };
      if (names[entity.toLowerCase()]) return names[entity.toLowerCase()];
      const numeric = entity.slice(2, -1);
      const code =
        numeric[0]?.toLowerCase() === "x"
          ? Number.parseInt(numeric.slice(1), 16)
          : Number.parseInt(numeric, 10);
      return code >= 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : "\ufffd";
    });
  const plain = (value) =>
    decode(
      value
        .replace(
          /<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>/giu,
          " ",
        )
        .replace(/<\/?(?:strong|code|em|b|i|span)\b[^>]*>/giu, "")
        .replace(/<[^>]*>/gu, " "),
    )
      .replace(/\s+/gu, " ")
      .trim();
  const normalize = (value) => String(value).replace(/\s+/gu, " ").trim();
  const displayQuote = (value) =>
    normalize(
      value.replace(/\*\*([^*]+)\*\*/gu, "$1").replace(/`([^`]+)`/gu, "$1"),
    );
  const articles = new Map();
  for (const match of html.matchAll(
    /<article\b[^>]*\bid\s*=\s*(["'])([^"']+)\1[^>]*>([\s\S]*?)<\/article>/giu,
  )) {
    if (articles.has(match[2]))
      issue("reading.articles", "Duplicate reader article.");
    articles.set(match[2], match[3]);
  }
  if (articles.size !== content.nodes.length + evidence.records.length)
    issue(
      "reading.articles",
      "Reader article count differs from reviewed content and evidence.",
    );
  const needs = (body, values, path) => {
    const rendered = plain(body);
    values.forEach((value, index) => {
      if (value && !rendered.includes(normalize(value)))
        issue(`${path}[${index}]`, "Reviewed reader context is missing.");
    });
  };
  content.nodes.forEach((node, index) => {
    const path = `reading.nodes[${index}]`;
    const body = articles.get(node.id);
    if (!body) {
      issue(path, "Content article is missing.");
      return;
    }
    needs(
      body,
      [
        node.title,
        node.state,
        node.summary,
        ...node.paragraphs,
        ...node.points,
      ],
      path,
    );
    for (const record of evidence.records.filter((record) =>
      record.nodeIds.includes(node.id),
    )) {
      if (!new RegExp(`href=["']#${record.id}["']`, "u").test(body))
        issue(path, "Readable evidence link is missing.");
    }
  });
  evidence.records.forEach((record, index) => {
    const path = `reading.evidence[${index}]`;
    const body = articles.get(record.id);
    if (!body) {
      issue(path, "Evidence article is missing.");
      return;
    }
    needs(
      body,
      [
        record.publicationTitle,
        record.claim,
        record.evidenceType,
        record.basisDate,
        record.basisNote,
        record.titleNote,
        ...record.limitations,
      ],
      `${path}.context`,
    );
    const quotes = [
      ...body.matchAll(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/giu),
    ].map((match) => plain(match[1]));
    if (quotes.length !== record.excerptParagraphs.length)
      issue(`${path}.quotes`, "Exact excerpt count differs.");
    record.excerptParagraphs.forEach((excerpt, quoteIndex) => {
      if (quotes[quoteIndex] !== displayQuote(excerpt.text))
        issue(
          `${path}.quotes[${quoteIndex}]`,
          "Rendered excerpt differs from reviewed text.",
        );
      needs(
        body,
        [excerpt.label, excerpt.omissions],
        `${path}.selection[${quoteIndex}]`,
      );
    });
    if (record.editorialExplanation) {
      needs(
        body,
        [record.editorialExplanation.text, "풀어 쓴 설명", "원문 인용과 구분"],
        `${path}.editorial`,
      );
      if (
        quotes.some((quote) =>
          quote.includes(normalize(record.editorialExplanation.text)),
        )
      )
        issue(
          `${path}.editorial`,
          "Editorial prose is rendered as a quotation.",
        );
    }
  });
  let surface = plain(html).normalize("NFKC");
  try {
    surface += `\n${decodeURIComponent(surface)}`;
  } catch {
    /* Prose may contain a literal percent sign. */
  }
  if (
    /(?:[a-z][a-z\d+.-]*:\/\/|\bmailto:|\bdata:|\/Users\/|\/home\/|\/private\/|[a-z]:\\|\[\[)/iu.test(
      surface,
    )
  )
    issue(
      "reading.surface",
      "Reader prose contains a URL, local path, embedded data, or raw knowledge link.",
    );
  if (
    /\b(?:source_path|snapshot_path|canonical_path|raw_source|source_sha256|char_start|char_end)\b/iu.test(
      surface,
    )
  )
    issue("reading.surface", "Reader prose contains private provenance.");
  for (const pattern of privatePatterns)
    if (pattern.expression.test(surface))
      issue(
        "reading.surface",
        `Private publication rule matched (${pattern.id}).`,
      );
  for (const match of html.matchAll(/\b(?:href|src)\s*=\s*(["'])(.*?)\1/giu)) {
    const target = decode(match[2]).trim();
    if (!target.startsWith("#") && !/^\.\/(?!\/)/u.test(target))
      issue(
        "reading.links",
        "Reader link leaves the relative public artifact.",
      );
  }
  return { valid: issues.length === 0, issues };
}

/** Built data must be the reviewed input bytes, not a separate stale export. */
export async function validateDist(
  directory,
  content,
  evidence,
  { privatePatterns = [], dataDirectory } = {},
) {
  const issues = [];
  for (const name of ["content.json", "evidence.json"]) {
    try {
      const built = await readFile(resolve(directory, "data", name));
      if (
        dataDirectory &&
        !built.equals(await readFile(resolve(dataDirectory, name)))
      ) {
        issues.push({
          path: `dist.data.${name}`,
          message: "Built public data differs from the reviewed input bytes.",
        });
      }
    } catch {
      issues.push({
        path: `dist.data.${name}`,
        message: "Built public data could not be read.",
      });
    }
  }
  try {
    const reader = validateStaticReader(
      await readFile(resolve(directory, "reading.html"), "utf8"),
      content,
      evidence,
      { privatePatterns },
    );
    issues.push(...reader.issues);
  } catch {
    issues.push({
      path: "dist.reading",
      message: "Built reader could not be read.",
    });
  }
  // Legal notices and binary/vendor metadata need their own attribution review.
  // They are deliberately outside the scope of a publication-prose dictionary.
  return { valid: issues.length === 0, issues };
}

async function main() {
  const args = process.argv.slice(2);
  const options = {};
  const allowed = new Set([
    "--data-dir",
    "--dist",
    "--private-patterns",
    "--private-evidence-map",
  ]);
  for (let i = 0; i < args.length; i += 2) {
    if (!allowed.has(args[i]) || !args[i + 1] || args[i + 1].startsWith("--"))
      throw new Error(
        "Use --data-dir, --dist, --private-patterns, or --private-evidence-map followed by a path.",
      );
    options[args[i]] = args[i + 1];
  }
  const dataDirectory =
    options["--data-dir"] ??
    fileURLToPath(new URL("../public/data/", import.meta.url));
  const patternPath =
    options["--private-patterns"] ?? process.env.ATLAS_PRIVATE_PATTERNS;
  const mapPath =
    options["--private-evidence-map"] ?? process.env.ATLAS_PRIVATE_EVIDENCE_MAP;
  const [content, evidence] = await Promise.all(
    ["content.json", "evidence.json"].map(async (name) =>
      JSON.parse(await readFile(resolve(dataDirectory, name), "utf8")),
    ),
  );
  const privatePatterns = patternPath
    ? compilePrivatePatterns(JSON.parse(await readFile(patternPath, "utf8")))
    : [];
  const result = validateContent(content, evidence, { privatePatterns });
  if (mapPath) {
    const exact = await verifyPrivateEvidence(
      evidence,
      JSON.parse(await readFile(mapPath, "utf8")),
    );
    result.issues.push(...exact.issues);
    result.valid &&= exact.valid;
  }
  if (options["--dist"]) {
    const built = await validateDist(options["--dist"], content, evidence, {
      privatePatterns,
      dataDirectory,
    });
    result.issues.push(...built.issues);
    result.valid &&= built.valid;
  }
  console.log(
    JSON.stringify(
      {
        ...result,
        nodes: content.nodes?.length,
        evidenceRecords: evidence.records?.length,
        distReader: options["--dist"] ? "checked" : "not_run",
        privateDictionary: patternPath ? "checked" : "not_provided",
        exactSourceProof: mapPath ? "checked" : "not_run",
      },
      null,
      2,
    ),
  );
  if (!result.valid) process.exitCode = 1;
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  main().catch(() => {
    console.error("Content validation could not load or parse an input.");
    process.exitCode = 1;
  });
}
