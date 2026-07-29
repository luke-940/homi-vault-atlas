import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  classifyDocumentCandidateV3,
  normalizePublicDisplayTitle,
  sanitizePublicKnowledgeText,
  validatePublicationPolicyV3,
} from "../scripts/lib/atlas-publication-policy-v3.mjs";

const policy = JSON.parse(readFileSync("public-safe/atlas-publication-policy.v3.json", "utf8"));

describe("atlas.publication_policy.v3", () => {
  it("keeps the six approved roots and the section review invariants", () => {
    expect(validatePublicationPolicyV3(policy)).toEqual([]);
    expect(policy.publicRoots).toEqual([
      "MOC",
      "Papers",
      "Signals",
      "Rocket",
      "Groot",
      "Intelligence Layer",
    ]);
    expect(policy.reconciliation).toMatchObject({
      requireSectionUnclassifiedZero: true,
      requireClaimEvidenceCoverage: true,
      requireGraphDossierReaderOneToOne: true,
    });
  });

  it("strips internal strategy numbering and rejects operating surfaces", () => {
    expect(normalizePublicDisplayTitle(
      "SI-17 - Workflow-Native AX Opportunity Formula",
      policy,
    )).toBe("Workflow-Native AX Opportunity Formula");
    expect(sanitizePublicKnowledgeText(
      "AI 신뢰성 · SI-07 : provenance · SR-03 [1] lesson",
    )).toBe("AI 신뢰성 · provenance · lesson");
    expect(sanitizePublicKnowledgeText(
      "현행 결정은 Intellible Current Decisions Registry를 우선합니다.",
    )).toBe("현행 결정은 비공개 운영 문서를 우선합니다.");
    expect(sanitizePublicKnowledgeText(
      "overview: derived/contact-sheets/P3-overview.png manifest: manifests/assets.tsv",
    )).toBe("overview: 내부 파일 경로 제외 manifest: 내부 파일 경로 제외");
    expect(classifyDocumentCandidateV3({
      relativePath: "Strategy/Requests/SR-04 - Internal Request.md",
      title: "SR-04 - Internal Request",
      frontmatter: {},
    }, policy)).toMatchObject({
      disposition: "excluded",
      reason: "strategy_request",
    });
    expect(classifyDocumentCandidateV3({
      relativePath: "Rocket/QA and Receipts/Release Receipt.md",
      title: "Release Receipt",
      frontmatter: {},
    }, policy).disposition).toBe("excluded");
    expect(classifyDocumentCandidateV3({
      relativePath: "Rocket/05 - Decisions and Changelog/01 - Durable Decisions/Project Rocket Decision Log.md",
      title: "Project Rocket Decision Log",
      frontmatter: {},
    }, policy)).toMatchObject({
      disposition: "excluded",
      reason: "excluded_path",
    });
    expect(classifyDocumentCandidateV3({
      relativePath: "Groot/06 - Decisions and Changelog/2026-07-29 - Runtime Rebuild.md",
      title: "2026-07-29 - Runtime Rebuild",
      frontmatter: {},
    }, policy)).toMatchObject({
      disposition: "excluded",
      reason: "excluded_path",
    });
    for (const title of [
      "Intellible Current Decisions Registry",
      "Intellible Creative Game Director Subagent Contract",
    ]) {
      expect(classifyDocumentCandidateV3({
        relativePath: `Groot/05 - Product Strategy and Design/${title}.md`,
        title,
        frontmatter: {},
      }, policy).disposition).toBe("excluded");
    }
    expect(classifyDocumentCandidateV3({
      relativePath: "Groot/05 - Product Strategy and Design/Intellible Direction and Decision Ledger.md",
      title: "Intellible Direction and Decision Ledger",
      frontmatter: {},
    }, policy).disposition).toBe("excluded");
  });
});
