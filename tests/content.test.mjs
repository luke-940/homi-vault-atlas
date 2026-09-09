import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import rawContent from "../public/data/content.json" with { type: "json" };
import rawEvidence from "../public/data/evidence.json" with { type: "json" };
import {
  nodes,
  projects,
  nodeById,
  projectFor,
  searchNodes,
  evidenceFor,
  artworkFor,
} from "../src/content.ts";
import {
  validateContent,
  compilePrivatePatterns,
  verifyPrivateEvidence,
} from "../scripts/validate-content.mjs";

const copy = () => ({
  content: structuredClone(rawContent),
  evidence: structuredClone(rawEvidence),
});

test("the reviewed public corpus is structurally valid and every node opens readable evidence", () => {
  assert.deepEqual(validateContent(rawContent, rawEvidence), {
    valid: true,
    issues: [],
  });
  assert.equal(nodes.length, 38);
  assert.equal(rawEvidence.records.flatMap(record => record.excerptParagraphs).length, 51);
  for (const node of nodes)
    assert.ok(
      evidenceFor(node.id).some(
        (record) => record.excerptParagraphs.length > 0,
      ),
      node.id,
    );
  assert.deepEqual(
    projects.map((node) => node.id),
    ["rocket", "groot", "knowledge-library", "atlas"],
  );
  assert.equal(projects.filter((node) => node.kind === "project").length, 3);
});

test("project routing keeps shared research foundations distinct from independent projects", () => {
  assert.equal(projectFor("horizon-base"), "rocket");
  assert.equal(projectFor("desk-science"), "rocket");
  assert.equal(projectFor("groot-judgment-roots"), "groot");
  assert.throws(() => projectFor("groot-unregistered-17"), RangeError);
  for (const id of [
    "common",
    "knowledge-library",
    "concept-agent",
    "research-cycle",
    "daily-lens",
    "weekly-lens",
    "papers-lens",
  ])
    assert.equal(projectFor(id), "common");
  assert.equal(projectFor("atlas"), "atlas");
  assert.throws(() => projectFor("unregistered-17"), RangeError);
});

test("search handles compatibility width, case, spacing, and Korean initial consonants", () => {
  assert.equal(searchNodes("  ＲＯＣＫＥＴ　 ")[0].id, "rocket");
  assert.equal(searchNodes("ㄱㄹㅌ")[0].id, "groot");
  assert.equal(searchNodes("ㅁㄹㅇㅈㅇ")[0].id, "groot-judgment-context");
  assert.deepEqual(searchNodes("ㅁㅋ"), []);
  assert.ok(
    searchNodes("맥락의정원").some((node) => node.id === "groot-judgment-context"),
  );
  assert.ok(
    searchNodes("맥락의\n  정원").some((node) => node.id === "groot-judgment-context"),
  );
  assert.deepEqual(searchNodes("  "), nodes);
});

test("search requires every term and applies a project filter before ranking", () => {
  assert.ok(
    searchNodes("생각 근거", "groot").some((node) => node.id === "groot-judgment-update"),
  );
  assert.deepEqual(searchNodes("맥락의 정원", "rocket"), []);
  assert.deepEqual(searchNodes("맥락의 TOKEN_NO_MATCH_83"), []);
  assert.ok(
    searchNodes("", "common").every((node) => projectFor(node.id) === "common"),
  );
});

test("reading evidence does not expose the internal index array and artwork is explicit", () => {
  const first = evidenceFor("rocket");
  first.pop();
  assert.ok(evidenceFor("rocket").length > 0);
  assert.deepEqual(evidenceFor("unknown-19"), []);
  assert.equal(artworkFor("groot"), "assets/illustrations/groot-v82.webp");
  assert.equal(artworkFor("groot-transfer"), undefined);
  assert.equal(artworkFor("rocket-desks"), "assets/rocket-lenses.webp");
  assert.equal(artworkFor("groot-moko"), undefined);
  assert.equal(artworkFor("toString"), undefined);
  assert.equal(nodeById.get("groot-judgment-roots")?.kind, "research-story");
});

test("a new project identity, duplicate evidence, and dangling navigation are rejected", () => {
  const { content, evidence } = copy();
  content.nodes[0].id = "unregistered-17";
  content.routes[0].steps.push("unregistered-29");
  content.relations[0].target = "unregistered-31";
  evidence.records[1].id = evidence.records[0].id;
  const result = validateContent(content, evidence);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.message.includes("allowlist")));
  assert.ok(result.issues.some((issue) => issue.message.includes("Duplicate")));
  assert.ok(
    result.issues.some((issue) => issue.message.includes("Dangling route")),
  );
  assert.ok(
    result.issues.some((issue) => issue.message.includes("Dangling relation")),
  );
});

test("a visible node cannot lose its evidence while total record counts still match", () => {
  const { content, evidence } = copy();
  evidence.records.forEach((record) => {
    record.nodeIds = record.nodeIds.filter((id) => id !== "concept-memory");
  });
  const result = validateContent(content, evidence);
  assert.equal(evidence.records.length, 23);
  assert.ok(
    result.issues.some(
      (issue) =>
        issue.message === "No readable evidence for node: concept-memory.",
    ),
  );
});

test("unknown nested payload fields and source-provenance text cannot hide in a public record", () => {
  const { content, evidence } = copy();
  evidence.records[0].excerptParagraphs[0].extraData = "ITEM_17";
  content.nodes[0].summary = "source_path: ITEM_23";
  const result = validateContent(content, evidence);
  assert.ok(
    result.issues.some((issue) =>
      issue.message.includes("outside the public schema"),
    ),
  );
  assert.ok(
    result.issues.some((issue) => issue.message.includes("Private provenance")),
  );
});

test("editorial explanation cannot masquerade as a quote, and quote selection is explicit", () => {
  const { content, evidence } = copy();
  evidence.records[0].editorialExplanation = {
    kind: "exact_excerpt",
    text: "ITEM_17",
  };
  evidence.records[0].excerptParagraphs[0].form = "editorial";
  evidence.records[0].excerptParagraphs[0].omissions = "";
  const result = validateContent(content, evidence);
  assert.ok(
    result.issues.some((issue) => issue.message.includes("Editorial prose")),
  );
  assert.ok(
    result.issues.some((issue) => issue.message.includes("selection form")),
  );
  assert.ok(result.issues.some((issue) => issue.path.endsWith(".omissions")));
});

test("encoded external URLs and impossible dates are rejected", () => {
  const { content, evidence } = copy();
  content.nodes[0].paragraphs.push("https%3A%2F%2Fexample.invalid%2Fitem");
  evidence.records[0].basisDate = "2026-02-30";
  const result = validateContent(content, evidence);
  assert.ok(
    result.issues.some((issue) => issue.message.includes("External URL")),
  );
  assert.ok(result.issues.some((issue) => issue.path.endsWith(".basisDate")));
});

test("private exclusion patterns run on normalized text without shipping a sensitive dictionary", () => {
  const { content, evidence } = copy();
  content.nodes[0].summary = "ＳＥＮＴＩＮＥＬ＿４７";
  const privatePatterns = compilePrivatePatterns({
    patterns: [{ pattern: "sentinel_47", flags: "iu" }],
  });
  const result = validateContent(content, evidence, { privatePatterns });
  assert.ok(
    result.issues.some(
      (issue) =>
        issue.message === "Private publication rule matched (policy-1).",
    ),
  );
  assert.throws(() =>
    compilePrivatePatterns({ patterns: [{ pattern: "ITEM", flags: "g" }] }),
  );
});

test("validation diagnostics do not echo unapproved values or field names", () => {
  const { content, evidence } = copy();
  content.nodes[0].id = "SENTINEL_47";
  content.nodes[0].SENTINEL_47 = "SENTINEL_47";
  const privatePatterns = compilePrivatePatterns({
    patterns: [{ pattern: "SENTINEL_47" }],
  });
  const result = validateContent(content, evidence, { privatePatterns });
  assert.equal(result.valid, false);
  assert.equal(JSON.stringify(result).includes("SENTINEL_47"), false);
});

function proofFixture() {
  const body = "🜁\nITEM_17.\n";
  const quote = "ITEM_17.";
  const bytes = Buffer.from(body);
  const hash = (value) => createHash("sha256").update(value).digest("hex");
  return {
    evidence: {
      records: [
        { id: "ev_000000000001", excerptParagraphs: [{ text: quote }] },
      ],
    },
    mapping: {
      evidence: [
        {
          evidence_id: "ev_000000000001",
          excerpt_mappings: [
            {
              snapshot_path: "opaque-input-17",
              source_bytes: bytes.length,
              source_sha256: hash(bytes),
              excerpt_sha256: hash(quote),
              char_start: 2,
              char_end: 10,
              line_start: 2,
              line_end: 2,
            },
          ],
        },
      ],
    },
    read: async () => bytes,
  };
}

test("frozen proof uses Unicode code points and checks exact bytes rather than normalized prose", async () => {
  const f = proofFixture();
  assert.deepEqual(
    await verifyPrivateEvidence(f.evidence, f.mapping, { read: f.read }),
    { valid: true, issues: [] },
  );
  f.evidence.records[0].excerptParagraphs[0].text = "ITEM_18.";
  const changed = await verifyPrivateEvidence(f.evidence, f.mapping, {
    read: f.read,
  });
  assert.ok(
    changed.issues.some((issue) =>
      issue.message.includes("Exact excerpt differs"),
    ),
  );
});

test("changed source bytes and missing private mappings cannot produce exact-source proof", async () => {
  const f = proofFixture();
  const changed = await verifyPrivateEvidence(f.evidence, f.mapping, {
    read: async () => Buffer.from("ITEM_29"),
  });
  assert.ok(
    changed.issues.some((issue) => issue.message.includes("byte identity")),
  );
  const missing = await verifyPrivateEvidence(
    f.evidence,
    { evidence: [] },
    { read: f.read },
  );
  assert.ok(
    missing.issues.some(
      (issue) => issue.message === "Private mapping is missing.",
    ),
  );
});

const retiredIds = ["groot-adventure", "groot-living", "groot-relationships", "groot-moko", "groot-rin", "groot-hana", "groot-art-explore", "groot-art-characters", "groot-art-combat", "groot-art-dialogue", "groot-choices"];
test("retired game identities cannot return through search, evidence, artwork or prefix routing", () => {
  for (const id of retiredIds) {
    assert.equal(nodeById.has(id), false, id);
    assert.deepEqual(searchNodes(id), [], id);
    assert.deepEqual(evidenceFor(id), [], id);
    assert.equal(artworkFor(id), undefined, id);
    assert.throws(() => projectFor(id), RangeError, id);
    const {content,evidence}=copy(); content.nodes.at(-1).id=id;
    assert.equal(validateContent(content,evidence).valid,false,id);
  }
});
test("equal counts cannot replace evidence identities, exact quote bytes or review order", () => {
  for (const mutate of [
    e => {e.records.at(-1).id="ev_000000000017";},
    e => {e.records.at(-1).excerptParagraphs[0].text+=" ";},
    e => {const r=e.records.find(r=>r.excerptParagraphs.length>1);[r.excerptParagraphs[0],r.excerptParagraphs[1]]=[r.excerptParagraphs[1],r.excerptParagraphs[0]];},
    e => {e.records.at(-1).nodeIds=["groot"];},
  ]) {
    const {content,evidence}=copy(); mutate(evidence);
    assert.equal(evidence.records.length,23);
    assert.equal(evidence.records.flatMap(r=>r.excerptParagraphs).length,51);
    assert.equal(validateContent(content,evidence).valid,false);
  }
});
test("registered research IDs cannot acquire abandoned kinds or retired tour identities", () => {
  const {content,evidence}=copy();content.nodes.at(-1).kind="game-design";
  assert.equal(validateContent(content,evidence).valid,false);
  const fresh=copy();fresh.content.routes[0].id="route-game-life";
  assert.equal(validateContent(fresh.content,fresh.evidence).valid,false);
});
