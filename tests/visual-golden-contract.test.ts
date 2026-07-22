import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { CI_ROUTE_CASES } from "../scripts/run-v7-4-qa.mjs";
import {
  V74_INDEPENDENT_VISUAL_QA_APPROVED_STATUS,
  V74_INDEPENDENT_VISUAL_QA_RECEIPT_PATH,
  V74_INDEPENDENT_VISUAL_QA_SCHEMA,
  V74_VISUAL_GOLDEN_APPROVED_STATUS,
  V74_VISUAL_GOLDEN_ROUTE_IDS,
  V74_VISUAL_GOLDEN_SCHEMA,
  hasVisualGoldenPngMagic,
  independentVisualQaEvidencePath,
  resolveVisualGoldenCases,
  validateIndependentVisualQaReceipt,
  validateVisualGoldenManifest,
} from "../scripts/lib/v7-4-visual-golden.mjs";

const goldenCases = resolveVisualGoldenCases(CI_ROUTE_CASES);
const sha = (digit: string) => digit.repeat(64);

function approvedFixture() {
  const independentEvidence = goldenCases.map((entry, index) => {
    const body = Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.from(`case-${index}`)]);
    return {
      path: independentVisualQaEvidencePath(entry),
      bytes: body.length,
      sha256: createHash("sha256").update(body).digest("hex"),
      pngMagic: true,
    };
  });
  const reviewCases = goldenCases.map((entry, index) => ({
    id: entry.id,
    viewport: entry.viewport,
    evidence: {
      path: independentEvidence[index].path,
      bytes: independentEvidence[index].bytes,
      sha256: independentEvidence[index].sha256,
    },
    checks: {
      labelNodeCollisions: 0,
      clippedLabels: 0,
      requiredTextUnder12Px: 0,
      horizontalOverflowPx: 0,
      mobileInteractiveUnder44Px: 0,
      visualParity: "pass",
      accessibilityEncoding: "pass",
    },
    verdict: "approved_independent_visual_qa",
  }));
  const independentReceipt = {
    schema: V74_INDEPENDENT_VISUAL_QA_SCHEMA,
    status: V74_INDEPENDENT_VISUAL_QA_APPROVED_STATUS,
    releaseVersion: "7.4.0",
    reviewerSeparation: {
      identityMode: "domain_separated_sha256_fingerprint",
      implementer: { role: "atlas_builder", sessionFingerprint: sha("1") },
      reviewer: { role: "independent_visual_qa", sessionFingerprint: sha("2") },
      differentRole: true,
      differentSession: true,
    },
    scope: {
      profile: "atlas-public",
      surface: "in_app_browser",
      caseCount: 16,
      geometryChecklistRequired: true,
      ubuntuBaselineComparisonRequired: true,
    },
    cases: reviewCases,
    completedAt: "2026-07-20T12:00:00.000Z",
  };
  const receiptBody = Buffer.from(`${JSON.stringify(independentReceipt, null, 2)}\n`);
  const cases = goldenCases.map((entry, index) => ({
    id: entry.id,
    viewport: entry.viewport,
    baselinePath: entry.baselinePath,
    baselineSha256: sha(String((index % 9) + 1)),
    iabEvidenceSha256: reviewCases[index].evidence.sha256,
    verdict: "approved_visual_parity",
  }));
  return {
    manifest: {
      schema: V74_VISUAL_GOLDEN_SCHEMA,
      status: V74_VISUAL_GOLDEN_APPROVED_STATUS,
      environment: { runner: "ubuntu-24.04", project: "chromium", platform: "linux", workers: 1 },
      reviewEvidencePath: V74_INDEPENDENT_VISUAL_QA_RECEIPT_PATH,
      reviewEvidenceDigest: createHash("sha256").update(receiptBody).digest("hex"),
      cases,
    },
    evidence: cases.map((entry) => ({
      path: entry.baselinePath,
      bytes: 1024,
      sha256: entry.baselineSha256,
      pngMagic: true,
    })),
    independentReview: { receiptBody, evidence: independentEvidence },
  };
}

describe("Atlas v7.4 CI-only visual golden contract", () => {
  test("selects the exact 16 commercial release states without replacing 24-route geometry QA", () => {
    expect(goldenCases.map((entry) => entry.id)).toEqual([...V74_VISUAL_GOLDEN_ROUTE_IDS]);
    expect(goldenCases).toHaveLength(16);
    expect(new Set(goldenCases.map((entry) => `${entry.viewport.width}x${entry.viewport.height}`))).toEqual(new Set([
      "1440x920",
      "1280x720",
      "1180x720",
      "1024x768",
      "768x1024",
      "390x844",
      "320x844",
      "844x390",
    ]));
    expect(goldenCases.filter((entry) => entry.workspace === "home").map((entry) => entry.targetScene)).toEqual([
      "living-terrain",
      "knowledge-gravity",
      "verified-activity",
      "coverage-boundary",
    ]);
    expect(goldenCases.map((entry) => entry.journey)).toEqual(expect.arrayContaining([
      "agency-system-roundtrip",
      "agency-actor",
      "agency-scene",
      "search-overlay",
      "data-overlay",
    ]));
  });

  test("uses a distinct platform-bound filename for every expected PNG", () => {
    const paths = goldenCases.map((entry) => entry.baselinePath);
    expect(new Set(paths).size).toBe(16);
    for (const baselinePath of paths) {
      expect(baselinePath).toMatch(/^tests-visual\/__screenshots__\/v7-4-golden\.spec\.mjs\/.+-chromium-linux\.png$/);
    }
  });

  test("keeps the checked-in manifest pending until review, then validates the approved PNG inventory", () => {
    const manifest = JSON.parse(readFileSync(path.resolve("tests-visual", "approved-baselines.json"), "utf8"));
    const receiptBody = readFileSync(path.resolve(V74_INDEPENDENT_VISUAL_QA_RECEIPT_PATH));
    if (manifest.status === "incomplete_pending_iab_and_ubuntu_review") {
      const result = validateVisualGoldenManifest({
        manifest,
        expectedCases: goldenCases,
        baselineEvidence: [],
        independentReview: { receiptBody, evidence: [] },
      });
      expect(manifest.reviewEvidencePath).toBe(V74_INDEPENDENT_VISUAL_QA_RECEIPT_PATH);
      expect(manifest.reviewEvidenceDigest).toBeNull();
      expect(result.pass).toBe(false);
      expect(result.failures).toEqual(expect.arrayContaining([
        "manifest-not-approved",
        "manifest-review-evidence-digest",
        "independent-receipt-not-approved",
        "independent-review-evidence-inventory",
        "baseline-file-inventory",
        "case-verdict:home-default",
        "case-iab-sha256:home-default",
        "case-baseline-sha256:home-default",
      ]));
      return;
    }

    expect(manifest.status).toBe(V74_VISUAL_GOLDEN_APPROVED_STATUS);
    const evidence = goldenCases.map((entry) => {
      const absolutePath = path.resolve(entry.baselinePath);
      expect(existsSync(absolutePath), entry.baselinePath).toBe(true);
      const body = readFileSync(absolutePath);
      return {
        path: entry.baselinePath,
        bytes: body.length,
        sha256: createHash("sha256").update(body).digest("hex"),
        pngMagic: hasVisualGoldenPngMagic(body),
      };
    });
    const receipt = JSON.parse(receiptBody.toString("utf8"));
    const independentEvidence = receipt.cases.map((entry: { evidence: { path: string } }) => {
      const body = readFileSync(path.resolve(entry.evidence.path));
      return {
        path: entry.evidence.path,
        bytes: body.length,
        sha256: createHash("sha256").update(body).digest("hex"),
        pngMagic: hasVisualGoldenPngMagic(body),
      };
    });
    expect(validateVisualGoldenManifest({
      manifest,
      expectedCases: goldenCases,
      baselineEvidence: evidence,
      independentReview: { receiptBody, evidence: independentEvidence },
    })).toEqual({ pass: true, failures: [] });
  });

  test("requires exact approval, IAB binding, PNG inventory, and Ubuntu hash parity", () => {
    const fixture = approvedFixture();
    expect(validateVisualGoldenManifest({
      manifest: fixture.manifest,
      expectedCases: goldenCases,
      baselineEvidence: fixture.evidence,
      independentReview: fixture.independentReview,
    })).toEqual({ pass: true, failures: [] });

    const driftedManifest = structuredClone(fixture.manifest);
    driftedManifest.cases[0].baselineSha256 = sha("f");
    expect(validateVisualGoldenManifest({
      manifest: driftedManifest,
      expectedCases: goldenCases,
      baselineEvidence: fixture.evidence,
      independentReview: fixture.independentReview,
    }).failures).toContain(`case-baseline-hash:${goldenCases[0].id}`);

    const extraEvidence = [...fixture.evidence, {
      path: "tests-visual/__screenshots__/v7-4-golden.spec.mjs/unapproved-chromium-linux.png",
      bytes: 1024,
      sha256: sha("e"),
      pngMagic: true,
    }];
    expect(validateVisualGoldenManifest({
      manifest: fixture.manifest,
      expectedCases: goldenCases,
      baselineEvidence: extraEvidence,
      independentReview: fixture.independentReview,
    }).failures).toContain("baseline-file-inventory");
  });

  test("binds exact independent receipt bytes, distinct sessions, 16 PNGs, and zero-finding geometry checklists", () => {
    const fixture = approvedFixture();
    const approved = validateIndependentVisualQaReceipt({
      receiptBody: fixture.independentReview.receiptBody,
      expectedCases: goldenCases,
      reviewEvidence: fixture.independentReview.evidence,
    });
    expect(approved).toMatchObject({ pass: true, failures: [] });

    const sameSession = JSON.parse(fixture.independentReview.receiptBody.toString("utf8"));
    sameSession.reviewerSeparation.reviewer.sessionFingerprint = sameSession.reviewerSeparation.implementer.sessionFingerprint;
    expect(validateIndependentVisualQaReceipt({
      receiptBody: Buffer.from(`${JSON.stringify(sameSession)}\n`),
      expectedCases: goldenCases,
      reviewEvidence: fixture.independentReview.evidence,
    }).failures).toContain("independent-reviewer-session-not-separated");

    const missedClipping = JSON.parse(fixture.independentReview.receiptBody.toString("utf8"));
    missedClipping.cases[0].checks.clippedLabels = 1;
    expect(validateIndependentVisualQaReceipt({
      receiptBody: Buffer.from(`${JSON.stringify(missedClipping)}\n`),
      expectedCases: goldenCases,
      reviewEvidence: fixture.independentReview.evidence,
    }).failures).toContain(`independent-case-checklist:${goldenCases[0].id}`);

    const changedBytes = Buffer.concat([fixture.independentReview.receiptBody, Buffer.from(" ")]);
    expect(validateVisualGoldenManifest({
      manifest: fixture.manifest,
      expectedCases: goldenCases,
      baselineEvidence: fixture.evidence,
      independentReview: { ...fixture.independentReview, receiptBody: changedBytes },
    }).failures).toContain("manifest-review-evidence-digest");
  });

  test("ships a strict public-safe JSON schema for the independent receipt", () => {
    const schema = JSON.parse(readFileSync(path.resolve("tests-visual", "independent-visual-qa-receipt.v1.schema.json"), "utf8"));
    expect(schema.$id).toBe(V74_INDEPENDENT_VISUAL_QA_SCHEMA);
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.cases.minItems).toBe(16);
    expect(schema.properties.cases.maxItems).toBe(16);
    expect(schema.$defs.case.additionalProperties).toBe(false);
  });

  test("accepts only real PNG magic bytes", () => {
    expect(hasVisualGoldenPngMagic(Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"))).toBe(true);
    expect(hasVisualGoldenPngMagic(Buffer.from("ffd8ffe000104a464946", "hex"))).toBe(false);
  });
});
