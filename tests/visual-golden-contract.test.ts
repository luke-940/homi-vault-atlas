import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { CI_ROUTE_CASES } from "../scripts/run-v7-3-qa.mjs";
import {
  V73_VISUAL_GOLDEN_APPROVED_STATUS,
  V73_VISUAL_GOLDEN_ROUTE_IDS,
  V73_VISUAL_GOLDEN_SCHEMA,
  hasVisualGoldenPngMagic,
  resolveVisualGoldenCases,
  validateVisualGoldenManifest,
} from "../scripts/lib/v7-3-visual-golden.mjs";

const goldenCases = resolveVisualGoldenCases(CI_ROUTE_CASES);
const sha = (digit: string) => digit.repeat(64);

function approvedFixture() {
  const cases = goldenCases.map((entry, index) => ({
    id: entry.id,
    viewport: entry.viewport,
    baselinePath: entry.baselinePath,
    baselineSha256: sha(String((index % 9) + 1)),
    iabEvidenceSha256: sha(String(((index + 1) % 9) + 1)),
    verdict: "approved_visual_parity",
  }));
  return {
    manifest: {
      schema: V73_VISUAL_GOLDEN_SCHEMA,
      status: V73_VISUAL_GOLDEN_APPROVED_STATUS,
      environment: { runner: "ubuntu-24.04", project: "chromium", platform: "linux", workers: 1 },
      reviewEvidenceDigest: sha("a"),
      cases,
    },
    evidence: cases.map((entry) => ({
      path: entry.baselinePath,
      bytes: 1024,
      sha256: entry.baselineSha256,
      pngMagic: true,
    })),
  };
}

describe("Atlas v7.3 CI-only visual golden contract", () => {
  test("selects the exact 13 commercial release states without replacing 24-route geometry QA", () => {
    expect(goldenCases.map((entry) => entry.id)).toEqual([...V73_VISUAL_GOLDEN_ROUTE_IDS]);
    expect(goldenCases).toHaveLength(13);
    expect(new Set(goldenCases.map((entry) => `${entry.viewport.width}x${entry.viewport.height}`))).toEqual(new Set([
      "1440x920",
      "1280x720",
      "768x1024",
      "390x844",
      "320x844",
      "844x390",
    ]));
    expect(goldenCases.filter((entry) => entry.workspace === "home").map((entry) => entry.targetScene)).toEqual([
      "system-overview",
      "responsibility-partition",
      "independent-ownership",
      "knowledge-return",
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
    expect(new Set(paths).size).toBe(13);
    for (const baselinePath of paths) {
      expect(baselinePath).toMatch(/^tests-visual\/__screenshots__\/v7-3-golden\.spec\.mjs\/.+-chromium-linux\.png$/);
    }
  });

  test("keeps the checked-in manifest pending until review, then validates the approved PNG inventory", () => {
    const manifest = JSON.parse(readFileSync(path.resolve("tests-visual", "approved-baselines.json"), "utf8"));
    if (manifest.status === "incomplete_pending_iab_and_ubuntu_review") {
      const result = validateVisualGoldenManifest({ manifest, expectedCases: goldenCases, baselineEvidence: [] });
      expect(manifest.reviewEvidenceDigest).toBeNull();
      expect(result.pass).toBe(false);
      expect(result.failures).toEqual(expect.arrayContaining([
        "manifest-not-approved",
        "manifest-review-evidence-digest",
        "baseline-file-inventory",
        "case-verdict:home-default",
        "case-iab-sha256:home-default",
        "case-baseline-sha256:home-default",
      ]));
      return;
    }

    expect(manifest.status).toBe(V73_VISUAL_GOLDEN_APPROVED_STATUS);
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
    expect(validateVisualGoldenManifest({
      manifest,
      expectedCases: goldenCases,
      baselineEvidence: evidence,
    })).toEqual({ pass: true, failures: [] });
  });

  test("requires exact approval, IAB binding, PNG inventory, and Ubuntu hash parity", () => {
    const fixture = approvedFixture();
    expect(validateVisualGoldenManifest({
      manifest: fixture.manifest,
      expectedCases: goldenCases,
      baselineEvidence: fixture.evidence,
    })).toEqual({ pass: true, failures: [] });

    const driftedManifest = structuredClone(fixture.manifest);
    driftedManifest.cases[0].baselineSha256 = sha("f");
    expect(validateVisualGoldenManifest({
      manifest: driftedManifest,
      expectedCases: goldenCases,
      baselineEvidence: fixture.evidence,
    }).failures).toContain(`case-baseline-hash:${goldenCases[0].id}`);

    const extraEvidence = [...fixture.evidence, {
      path: "tests-visual/__screenshots__/v7-3-golden.spec.mjs/unapproved-chromium-linux.png",
      bytes: 1024,
      sha256: sha("e"),
      pngMagic: true,
    }];
    expect(validateVisualGoldenManifest({
      manifest: fixture.manifest,
      expectedCases: goldenCases,
      baselineEvidence: extraEvidence,
    }).failures).toContain("baseline-file-inventory");
  });

  test("accepts only real PNG magic bytes", () => {
    expect(hasVisualGoldenPngMagic(Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"))).toBe(true);
    expect(hasVisualGoldenPngMagic(Buffer.from("ffd8ffe000104a464946", "hex"))).toBe(false);
  });
});
