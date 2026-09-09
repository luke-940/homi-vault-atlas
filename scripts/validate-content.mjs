import { validateSpatial } from "./validate-islands.mjs";
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
  "concept-agent",
  "groot-judgment-roots",
  "groot-thinking-play",
  "groot-judgment-context",
  "groot-appropriate-reliance",
  "groot-transfer",
  "groot-judgment-update"
]);
const APPROVED_EVIDENCE = Object.freeze([
  {
    "id": "ev_6d3799f3fa4a",
    "nodeIds": [
      "rocket"
    ],
    "excerptSha256": [
      "23ec1c059d6bb44f8bcda4fc5ff6f92263d0a493f59d0c97e339932d84eb3dba",
      "16c7b88516cffa7314a9f1ca51d03c750a3b0ed00ced832b4a1d4c2226ab4cad"
    ]
  },
  {
    "id": "ev_5a50e42fa6ae",
    "nodeIds": [
      "rocket-desks",
      "desk-frontier",
      "desk-compute",
      "desk-physical",
      "desk-science",
      "desk-markets",
      "desk-society",
      "desk-governance"
    ],
    "excerptSha256": [
      "2dafc65480f1c52837324315ef8505634529c7b9789bad5c66aaad69120b74af",
      "f3212d7a8bc9caa05cd4a0a78a2fb891373b5776c5e36da1aeeff346d3c2b89d",
      "ee93d27a5e9df9a9b665e71a9417381b6e95f6c210289e8fb8db9b45ddb57435",
      "a6dd16398134f7576633f0bf0c675a76501973b25768abec7f26d468bc83a9a4",
      "ca2e64e4b1d3355f7a29af649f5a9d8eabd7499906556fb1552b9621d0a062db",
      "b2c0531ba4e43345a1e87207a69102c7ac1c76d17fafa04ff6e3ce223b14d610",
      "21857bf8f281919716d99eb2a5f1bce6316c89434a20585a3b89c02060d6c701"
    ]
  },
  {
    "id": "ev_021e376c6fb3",
    "nodeIds": [
      "rocket-clocks"
    ],
    "excerptSha256": [
      "e457798d551f321082f2c300dd3e80569b55d19b32ba53965a621a3dd8a56549"
    ]
  },
  {
    "id": "ev_a4311d8e432a",
    "nodeIds": [
      "rocket-horizon",
      "horizon-base",
      "horizon-acceleration",
      "horizon-constraints",
      "horizon-fragmentation"
    ],
    "excerptSha256": [
      "5622e38f682a771139ddcd90239c9eea23782e0c98917e9f4f28164deb6650fc",
      "16a0f901d2a68206cdfac8ac70f1afba8bd6d47be31475cb0941f1c6de828a50"
    ]
  },
  {
    "id": "ev_51aaa52883ca",
    "nodeIds": [
      "rocket-delegation"
    ],
    "excerptSha256": [
      "abdda9501bb1c0f525961caf75652001bb259e1e5411e6db1e01931e3ac50ecd"
    ]
  },
  {
    "id": "ev_8e8f52dfcfa9",
    "nodeIds": [
      "rocket-feedback"
    ],
    "excerptSha256": [
      "381b6dcf79903ac3b7c8edb6e18d04f45fa5d64d982114bc626314bff3f90a3d",
      "d59d25a6a1f539cf50479a2ae1bb143fb406cd8f238d9746eee230acaaebc69c"
    ]
  },
  {
    "id": "ev_76037ae33609",
    "nodeIds": [
      "knowledge-library",
      "concept-reuse"
    ],
    "excerptSha256": [
      "21fb527fbacf8ba7e02341ec958038473815027070944230f1ac2ecf18ecb696",
      "310bec49f1bbb2ecc746ade031b61da84ff98a9fa651cea0953674ef8c96ef39"
    ]
  },
  {
    "id": "ev_1f18a275ea79",
    "nodeIds": [
      "research-cycle",
      "daily-lens",
      "weekly-lens",
      "papers-lens"
    ],
    "excerptSha256": [
      "8fd874de075ab7b9d923962c8f1cb7264ef38ecc98d2b41f2050578eaa401c00",
      "c38a49bd9889aa0f8730283e97f261e2e0034f3210d396b4dd81aac331571762",
      "e1156f572cf39dd21ad442396c1ebd68608eb7b47d0b9ed33b0e017a6691af63"
    ]
  },
  {
    "id": "ev_c2689a9ddbae",
    "nodeIds": [
      "concept-memory"
    ],
    "excerptSha256": [
      "4543e887366693ed85a869b4e096f4becbc0af75c787247afa02c9be4d2f1cf0"
    ]
  },
  {
    "id": "ev_d2e09fce25de",
    "nodeIds": [
      "concept-evidence"
    ],
    "excerptSha256": [
      "38d91ef57ad9f31a69bc1d0bfe1b6d845a8bd7add3156df156cd6bf6183b54d0",
      "08bdfff79dbc6a7311930bdd8627313172ba9c673deb95aa52b0dd4b0de2a7cd"
    ]
  },
  {
    "id": "ev_433e6970cdbf",
    "nodeIds": [
      "concept-graphs"
    ],
    "excerptSha256": [
      "9063f700e2b62d52eea33ba216d28995cf99884477bb60b37280f2c5c9eb5749",
      "37a52f681e14362e9a307f036fcad176edf45f2e987e76609e023890253f60c0",
      "6691519065e535f9f5449d0e93eb9ff4d86a4372257ebe7114c1e4979892af06"
    ]
  },
  {
    "id": "ev_8341193205b0",
    "nodeIds": [
      "concept-world-model"
    ],
    "excerptSha256": [
      "310f2612daf90a7df3acf012c1c6ff8530229ecaee7c36b435eded1dae21996b"
    ]
  },
  {
    "id": "ev_9fac734984f9",
    "nodeIds": [
      "concept-trust"
    ],
    "excerptSha256": [
      "1c828b05209033c0da9a6233b3aa1d5c7ae65fa6d3c062d44d5a09a287d3f017",
      "a7e6756ca21a55c443964ebf7190ad4e5e0755eef577f6871ab4964318c6a54c"
    ]
  },
  {
    "id": "ev_fb116cbb9579",
    "nodeIds": [
      "concept-agent"
    ],
    "excerptSha256": [
      "6db7d480c97604244514f31e0d4bc4ab0a41270cd3c948c32daf83b216449ebd",
      "b918aaa937bcabd807943cb6b7cba3cdcbe0ccef7e261b0035589ee2f2aaf210"
    ]
  },
  {
    "id": "ev_3b1ee5490c4c",
    "nodeIds": [
      "atlas"
    ],
    "excerptSha256": [
      "fba0db6b908f562ddee821388e89c61841e75609ae687d250d215219f78f23c2"
    ]
  },
  {
    "id": "ev_60b6cc180178",
    "nodeIds": [
      "knowledge-upkeep"
    ],
    "excerptSha256": [
      "38e06835fb3bc462d4b0dd88d73685458dabe73c52687db1a602e8c7e64c8732",
      "6691519065e535f9f5449d0e93eb9ff4d86a4372257ebe7114c1e4979892af06"
    ]
  },
  {
    "id": "ev_6bd9aef81ea2",
    "nodeIds": [
      "groot"
    ],
    "excerptSha256": [
      "2fce5ba2b11b2ee4838e0839dcb0462e1c626be489eccc374425ed536d3b64d7",
      "698b08ead0b25048a282d3d2c2b4283658319e0698feacc4441febd073f785ce",
      "9fe22a763fa71f91a7287ca16a060c7706ec424ae21f6c3f8c7e0840f132fbc4",
      "1cd1a0c7454513621ff6e36b1b03cb7dfcbf28311f7733ca147004aa875fc7f9"
    ]
  },
  {
    "id": "ev_91d127624ba3",
    "nodeIds": [
      "groot-judgment-roots"
    ],
    "excerptSha256": [
      "f1db4652eaae7ac8b8b5071ec95ff92cff8e5d08c2e4abc57a027e6e14f5837f",
      "14706eb073ca45f5b699654c14c04ec02bfaa06adce57ec4c608aae63a10b281"
    ]
  },
  {
    "id": "ev_953f4651f03c",
    "nodeIds": [
      "groot-thinking-play"
    ],
    "excerptSha256": [
      "24b4737f1cd55865c8c6573eb34c8b2d556c1c47944d6eb73fbc421ebc00ab0a",
      "49751c53c679e848829e10a0e3edba391e1762abed65b367bf823a4f25937fa1",
      "c7966c81e909c8ad0b8339cc093b95e9d3b62d49e186f9a97ab62e8b1898bc3d"
    ]
  },
  {
    "id": "ev_1414d3c65f54",
    "nodeIds": [
      "groot-judgment-context"
    ],
    "excerptSha256": [
      "8d87d12ac5f04d187e00859a2d14cbf5c0cfba8a12b4236d363bf73fa525dd82",
      "72e7532380863429520ce80927ebdc0048ee497877fb39dba8409aa30319f11b"
    ]
  },
  {
    "id": "ev_f8dfc6b27083",
    "nodeIds": [
      "groot-appropriate-reliance"
    ],
    "excerptSha256": [
      "e201441746f8f3dc930447f7607b93bb9d2d2c48d132f136504676c6d05d7c7d",
      "aeefad981fb09e9776b892b54e1d6085a1f69fa5bf356a1a511df409a3903828"
    ]
  },
  {
    "id": "ev_1be0527494fc",
    "nodeIds": [
      "groot-transfer"
    ],
    "excerptSha256": [
      "d5fd3eb675d8c472615d24c2f9b0257e8f98c387b035ef240b38e13b24205e78",
      "6cb64ca59ec75ad2e19c14ed6f8cf145622a3bcde2276246eb686a8c16cfade6"
    ]
  },
  {
    "id": "ev_5170fab763e6",
    "nodeIds": [
      "groot-judgment-update"
    ],
    "excerptSha256": [
      "508925784e01304ae2f98daa1551a92ffdce119aae3a376c0bf4150454bba233",
      "e201441746f8f3dc930447f7607b93bb9d2d2c48d132f136504676c6d05d7c7d"
    ]
  }
]);
const APPROVED_ROUTE_IDS = Object.freeze([
  "route-first-impression",
  "route-future",
  "route-groot-research",
  "route-knowledge",
  "route-how-to-trust",
  "route-memory",
  "route-atlas"
]);
const APPROVED_NODE_KINDS = Object.freeze({
  "rocket": "project",
  "groot": "project",
  "atlas": "project",
  "knowledge-library": "foundation",
  "research-cycle": "foundation",
  "knowledge-upkeep": "foundation",
  "rocket-desks": "research-map",
  "desk-frontier": "research-desk",
  "desk-compute": "research-desk",
  "desk-physical": "research-desk",
  "desk-science": "research-desk",
  "desk-markets": "research-desk",
  "desk-society": "research-desk",
  "desk-governance": "research-desk",
  "rocket-clocks": "research-story",
  "rocket-horizon": "research-story",
  "horizon-base": "scenario",
  "horizon-acceleration": "scenario",
  "horizon-constraints": "scenario",
  "horizon-fragmentation": "scenario",
  "concept-evidence": "knowledge-concept",
  "concept-memory": "knowledge-concept",
  "concept-graphs": "knowledge-concept",
  "concept-world-model": "knowledge-concept",
  "concept-trust": "knowledge-concept",
  "concept-reuse": "knowledge-concept",
  "daily-lens": "research-practice",
  "weekly-lens": "research-practice",
  "papers-lens": "research-practice",
  "rocket-delegation": "research-story",
  "rocket-feedback": "research-story",
  "concept-agent": "knowledge-concept",
  "groot-judgment-roots": "research-story",
  "groot-thinking-play": "research-story",
  "groot-judgment-context": "research-story",
  "groot-appropriate-reliance": "research-story",
  "groot-transfer": "research-story",
  "groot-judgment-update": "research-story"
});

const NODE_KINDS = new Set([
  "project",
  "foundation",
  "research-map",
  "research-desk",
  "research-story",
  "scenario",
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
  if (nodes.length !== 38)
    issue("content.nodes", "Expected 38 reviewed content nodes.");
  if (records.reduce((count, record) => count + (Array.isArray(record.excerptParagraphs) ? record.excerptParagraphs.length : 0), 0) !== 51)
    issue("evidence.records", "Expected 51 reviewed exact excerpts.");
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
    if (!NODE_KINDS.has(node.kind) || APPROVED_NODE_KINDS[node.id] !== node.kind) issue(`${p}.kind`, "Content kind differs from its reviewed identity.");
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
    const routeIds = new Set(content.routes.map(route => route?.id));
    if (routeIds.size !== APPROVED_ROUTE_IDS.length || APPROVED_ROUTE_IDS.some(id => !routeIds.has(id)))
      issue("content.routes", "Routes differ from the reviewed identity allowlist.");
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
    const reviewed = APPROVED_EVIDENCE.find(entry => entry.id === record.id);
    if (!reviewed) issue(`${p}.id`, "Evidence is outside the reviewed identity allowlist.");
    else {
      if (JSON.stringify(record.nodeIds) !== JSON.stringify(reviewed.nodeIds))
        issue(`${p}.nodeIds`, "Evidence-to-story binding differs from the reviewed selection.");
      const quoteHashes = (Array.isArray(record.excerptParagraphs) ? record.excerptParagraphs : []).map(excerpt => typeof excerpt?.text === "string" ? sha256(excerpt.text) : null);
      if (JSON.stringify(quoteHashes) !== JSON.stringify(reviewed.excerptSha256))
        issue(`${p}.excerptParagraphs`, "Exact excerpt bytes or order differ from the reviewed selection.");
    }
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
  // The static reader is also a downloadable publication surface. Hidden
  // scripts, attributes and comments must not evade the visible-prose scan.
  if (/<(?:script|iframe|object|embed)\b/iu.test(html) || /<[a-z][^>]*\s+on[a-z]+\s*=/iu.test(html))
    issue("reading.active", "The static reader must not contain executable or embedded content.");
  let completeSurface = decode(html).normalize("NFKC");
  try { completeSurface += `\n${decodeURIComponent(completeSurface)}`; } catch { /* Literal percent signs. */ }
  if (/(?:[a-z][a-z\d+.-]*:\/\/|\bmailto:|\bdata:|\/Users\/|\/home\/|\/private\/|[a-z]:\\|\[\[|\b(?:source_path|snapshot_path|canonical_path|raw_source|source_sha256|char_start|char_end)\b)/iu.test(completeSurface))
    issue("reading.hidden", "Reader source contains an unapproved publication surface.");
  // The deterministic reader has two fixed, reviewed HTML declarations at
  // byte zero. Their reserved tag name is syntax, not a company reference.
  // Exempt only this exact prefix from the private-name scan; changed metadata,
  // attributes, comments, CSS and all visible text remain in the scan. The
  // path/credential scan above still checks the complete original source.
  const fixedHead = '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">';
  const publicationSource = html.startsWith(fixedHead) ? html.slice(fixedHead.length) : html;
  let privateSurface = decode(publicationSource).normalize("NFKC");
  try { privateSurface += `\n${decodeURIComponent(privateSurface)}`; } catch { /* Literal percent signs. */ }
  for (const pattern of privatePatterns)
    if (pattern.expression.test(privateSurface))
      issue("reading.hidden", `Private publication rule matched (${pattern.id}).`);
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
  for (const name of ["content.json", "evidence.json", "islands.json", "map.json"]) {
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
  const [spatial, atlasMap] = await Promise.all(["islands.json", "map.json"].map(async name => JSON.parse(await readFile(resolve(dataDirectory, name), "utf8"))));
  const space = validateSpatial(spatial, atlasMap, content, evidence, { privatePatterns });
  result.issues.push(...space.issues);
  result.valid &&= space.valid;
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
        exactExcerpts: evidence.records?.reduce((n, record) => n + record.excerptParagraphs.length, 0),
        spatialObjects: spatial.islands?.reduce((n, island) => n + island.places.length + island.subInteractions.length, 0),
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
