import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  compileKnowledgePublicationV1,
  parseKnowledgeSections,
  parseKnowledgeSearchWrapper,
  parseKnowledgeShardWrapper,
  verifyKnowledgeProjectionV1,
} from "../scripts/lib/knowledge-publication.mjs";
import { containsInternalKnowledgeMarker } from "../scripts/lib/atlas-publication-policy-v3.mjs";

const policy = JSON.parse(readFileSync("public-safe/atlas-publication-policy.v3.json", "utf8"));
const graph = {
  schema: "atlas.graph.v2",
  strings: ["n:a", "Alpha", "d:a", "MOC", "n:b", "Beta", "d:b", "Papers", "e:ab"],
  kinds: ["moc_hub", "paper_gateway"],
  domains: [[2, 3], [6, 7]],
  nodes: [[0, 1, 0, 0], [4, 5, 1, 1]],
  edges: [[8, 0, 1, 2]],
  manifest: { projectionDigest: "graph-fixture-digest" },
};
const records = [
  {
    nodeId: "n:a",
    title: "Alpha",
    displayTitle: "Alpha",
    domain: "MOC",
    kind: "moc_hub",
    relativePath: "MOC/Alpha.md",
    frontmatter: {},
    markdown: [
      "# Alpha",
      "",
      "## Insight",
      "",
      "Alpha는 [[Beta]]를 실제 근거로 참조한다. SI-07 · SR-03 [1]",
      "",
      "Retrieval trace: [[Beta]] -> recall via this delta; no Rocket write.",
      "",
      "<script>blocked()</script>",
      "",
    ].join("\n"),
  },
  {
    nodeId: "n:b",
    title: "Beta",
    displayTitle: "Beta",
    domain: "Papers",
    kind: "paper_gateway",
    relativePath: "Papers/Beta.md",
    frontmatter: {},
    markdown: "# Beta\n\n## Insight\n\nBeta는 검수 가능한 논문 근거를 제공한다.\n",
  },
];
const claim = (text: string, contains: string) => ({
  text,
  interpretation: "source_explicit",
  evidenceSelectors: [{ sectionHeading: "Insight", contains }],
});
const alphaInsightSectionId = parseKnowledgeSections({
  nodeId: "n:a",
  markdown: records[0].markdown,
}).sections.find((section: any) => section.heading === "Insight").sectionId;
const reviewedDossiers = {
  schema: "atlas.reviewed_dossiers.v1",
  dossiers: [
    {
      nodeId: "n:a",
      status: "reviewed",
      defaultDisposition: "maintenance",
      sectionDecisions: [{
        sourceSectionId: alphaInsightSectionId,
        publicHeading: "Insight",
        disposition: "knowledge",
      }],
      readerSummary: claim("Alpha summary", "실제 근거"),
      keyInsights: [claim("Alpha insight", "실제 근거")],
      whyItMatters: claim("Alpha matters", "실제 근거"),
      caveats: [],
      openQuestions: [],
    },
    {
      nodeId: "n:b",
      status: "reviewed",
      defaultDisposition: "maintenance",
      sectionDecisions: [{ sectionHeading: "Insight", disposition: "knowledge" }],
      readerSummary: claim("Beta summary", "논문 근거"),
      keyInsights: [claim("Beta insight", "논문 근거")],
      whyItMatters: claim("Beta matters", "논문 근거"),
      caveats: [],
      openQuestions: [],
    },
  ],
};

describe("atlas.knowledge.v1 Gate 1 projection", () => {
  it("binds every claim and direct relation to safe source evidence", () => {
    const output = compileKnowledgePublicationV1({
      graph,
      records,
      reviewedDossiers,
      policy,
      generatedAt: "2026-07-29T00:00:00Z",
      releaseEligible: false,
    });
    expect(output.index.releaseEligible).toBe(false);
    expect(output.index.manifest).toMatchObject({
      dossierCount: 2,
      documentCount: 2,
      unclassifiedSectionCount: 0,
    });
    expect(verifyKnowledgeProjectionV1({
      graph,
      index: output.index,
      shards: output.shards,
      search: output.search,
    })).toEqual([]);
    const alpha = output.shards.find((item: any) => item.value.nodeId === "n:a");
    expect(alpha.value.dossier.relationExplanations).toContainEqual(expect.objectContaining({
      edgeId: "e:ab",
      kind: "direct_context",
      evidenceIds: [expect.stringMatching(/^evidence:/)],
    }));
    expect(JSON.stringify(alpha.value.document)).not.toContain("<script>");
    expect(JSON.stringify(alpha.value.document)).not.toContain("Retrieval trace");
    expect(JSON.stringify(alpha.value.document)).not.toContain("no Rocket write");
    expect(containsInternalKnowledgeMarker(alpha.value)).toBe(false);
    expect(parseKnowledgeShardWrapper(alpha.jsText)).toMatchObject({
      nodeId: "n:a",
      jsonText: alpha.jsonText,
      jsonSha256: alpha.jsonSha256,
    });
    expect(parseKnowledgeSearchWrapper(output.search.jsText).jsonText).toBe(output.search.jsonText);
    const decodeSearchRow = (row: number[]) => ({
      kind: output.search.value.strings[row[0]],
      nodeId: output.search.value.strings[row[1]],
      sectionId: output.search.value.strings[row[2]],
      label: output.search.value.strings[row[3]],
      fromNodeId: output.search.value.strings[row[5]],
      toNodeId: output.search.value.strings[row[6]],
    });
    const searchRows = output.search.value.entries.map(decodeSearchRow);
    expect(containsInternalKnowledgeMarker(output.search.value)).toBe(false);
    expect(searchRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "source_section",
        label: "Insight",
        nodeId: "n:a",
      }),
      expect.objectContaining({
        kind: "relationship",
        fromNodeId: "n:a",
        toNodeId: "n:b",
      }),
    ]));
  });

  it("is byte-deterministic and blocks a release claim without complete review", () => {
    const options = {
      graph,
      records,
      reviewedDossiers,
      policy,
      generatedAt: "2026-07-29T00:00:00Z",
      releaseEligible: false,
    };
    const first = compileKnowledgePublicationV1(options);
    const second = compileKnowledgePublicationV1(options);
    expect(first.index.manifest.projectionDigest).toBe(second.index.manifest.projectionDigest);
    expect(first.shards.map((item: any) => item.jsonText))
      .toEqual(second.shards.map((item: any) => item.jsonText));
    expect(() => compileKnowledgePublicationV1({
      ...options,
      reviewedDossiers: {
        ...reviewedDossiers,
        dossiers: reviewedDossiers.dossiers.slice(0, 1),
      },
      releaseEligible: true,
    })).toThrow(/graph nodes reviewed/);
  });
});
