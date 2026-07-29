import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  validateKnowledgeIndex,
  validatePublicationV3,
} from "../scripts/lib/knowledge-pack-contract.mjs";
import { scanOperatingExposure, scanPrivacyText } from "../scripts/lib/privacy-scanner.mjs";

const dataRoot = path.resolve(process.env.ATLAS_TEST_DATA_DIR ?? "public-safe/data");
const reviewCandidate = process.env.ATLAS_REVIEW_CANDIDATE === "true";
const pack = (name: string) => JSON.parse(readFileSync(path.join(dataRoot, `${name}.json`), "utf8"));
const graph = pack("graph");
const knowledge = pack("knowledge");
const publication = pack("publication");
const packs = {
  agency: pack("agency"),
  graph,
  inventory: pack("inventory"),
  meaning: pack("meaning"),
  knowledge,
};

describe("knowledge release audit boundary", () => {
  test("does not let a five-node preview satisfy the release contract", () => {
    const candidate = structuredClone(knowledge);
    candidate.releaseEligible = false;
    candidate.dossiers = candidate.dossiers.slice(0, 5);
    candidate.manifest.dossierCount = candidate.dossiers.length;
    candidate.manifest.documentCount = candidate.dossiers.length;
    expect(validateKnowledgeIndex(candidate, graph, { gate1: false })).toEqual(
      expect.arrayContaining(["release-eligible", "release-dossier-graph-cardinality"]),
    );
  });

  test("allows only the explicit non-release Gate 1 blocker", () => {
    if (process.env.ATLAS_GATE1_SLICE === "true") {
      expect(validateKnowledgeIndex(knowledge, graph, { gate1: true })).toEqual([]);
      expect(validatePublicationV3(publication, packs, { gate1: true })).toEqual([]);
      expect(publication.blockers).toEqual(["gate1_vertical_slice_not_full_coverage"]);
      return;
    }
    expect(validateKnowledgeIndex(knowledge, graph, {
      gate1: false,
      reviewCandidate,
    })).toEqual([]);
    expect(validatePublicationV3(publication, packs, {
      gate1: false,
      reviewCandidate,
    })).toEqual([]);
  });

  test("treats source paths, secrets, and operating records as publication blockers", () => {
    const fixture = [
      "/Users/example/private/vault.md",
      "owner@example.com",
      "Bearer abcdefghijklmnopqrstuvwxyz",
      "derived/contact-sheets/P3-overview.png",
      "work order: WO-123",
      "receipt: internal",
    ].join("\n");
    expect(scanPrivacyText(fixture, { path: "fixture" }).map((item) => item.id)).toEqual(
      expect.arrayContaining([
        "absolute-user-path",
        "email-address",
        "bearer-token",
        "relative-project-file-path",
      ]),
    );
    expect(scanOperatingExposure(fixture, { path: "fixture" }).map((item) => item.id)).toEqual(
      expect.arrayContaining(["operating-control-identifier", "operating-receipt-reference"]),
    );
  });
});
