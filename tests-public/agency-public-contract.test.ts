import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { auditPublicAgencyContract } from "../scripts/lib/agency-contract.mjs";
import { auditPublicPackBinding } from "../scripts/lib/public-data-wire.mjs";
import { auditPublicFieldContract } from "../scripts/public-field-contract.mjs";

const jsonText = readFileSync(path.resolve("public-safe/data/agency.json"), "utf8");
const jsText = readFileSync(path.resolve("public-safe/data/agency.js"), "utf8");
const agency = JSON.parse(jsonText);

describe("public Agency development fixture", () => {
  test("matches the UI-compatible atlas.agency.v1 shape", () => {
    expect(auditPublicAgencyContract(agency)).toEqual([]);
    expect(auditPublicFieldContract({ agency })).toEqual([]);
    expect(agency).toMatchObject({
      schema: "atlas.agency.v1",
      principal: { id: "agency:principal:luke", label: "Luke", kind: "human_principal" },
      snapshot: {
        status: "current_at_release_capture",
        live: false,
        caveat: "검증된 버전 스냅샷이며 실시간 작업 상태가 아닙니다.",
      },
      transition: {
        id: "agency:transition:role-specialization",
        kind: "responsibility_specialization",
        fromModel: "single_coordination",
        evidenceStatus: "verified_operating_model",
      },
    });
    expect(Number.isNaN(Date.parse(agency.generatedAt))).toBe(false);
    expect(agency.snapshot.asOfDate).toBe(agency.generatedAt.slice(0, 10));
    const capturePath = path.resolve(".cache/agency-release-capture.json");
    if (existsSync(capturePath)) {
      const capture = JSON.parse(readFileSync(capturePath, "utf8"));
      expect({ generatedAt: agency.generatedAt, asOfDate: agency.snapshot.asOfDate })
        .toEqual(capture.publicCapture);
    }
    expect(agency.groups).toHaveLength(2);
    expect(agency.actors).toHaveLength(6);
    expect(agency.surfaces).toHaveLength(6);
    expect(new Set(agency.surfaces.map((surface: { label: string }) => surface.label)).size).toBe(6);
    expect(agency.links.every((link: { kind: string }) => [
      "sets_direction",
      "coordinates_boundary",
      "owns_surface",
      "returns_result",
      "returns_evidence",
    ].includes(link.kind))).toBe(true);
    expect(agency.links.filter((link: { kind: string }) => link.kind === "coordinates_boundary")).toHaveLength(1);
    expect(agency.links.filter((link: { kind: string }) => link.kind === "returns_evidence")).toHaveLength(5);
  });

  test("binds the JavaScript wrapper to the exact authoritative JSON bytes", () => {
    expect(auditPublicPackBinding({ name: "agency", jsonText, jsText })).toMatchObject({
      pass: true,
      exactJsonBytesEmbedded: true,
      deepEqual: true,
    });
  });
});
