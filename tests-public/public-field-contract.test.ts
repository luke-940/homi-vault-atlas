import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { auditPublicFieldContract } from "../scripts/public-field-contract.mjs";

const names = ["bootstrap", "inventory", "graph", "relation", "flow", "temporal", "entity", "health", "insight", "publication"];
const loadPacks = () => Object.fromEntries(names.map((name) => [
  name,
  JSON.parse(readFileSync(path.resolve("public-safe", "data", `${name}.json`), "utf8")),
]));

describe("public field allowlist", () => {
  test("accepts the generated public packs", () => {
    expect(auditPublicFieldContract(loadPacks())).toEqual([]);
  });

  test.each(["documentBody", "rawDaily", "ownerLease", "proofReceipt", "notionPageId", "slackChannelId"])(
    "blocks injected entity field %s",
    (field) => {
      const packs = loadPacks();
      packs.entity.entities[0][field] = "private";
      expect(auditPublicFieldContract(packs)).toContainEqual({ id: "public-field-not-allowed", path: `entity.entities[].${field}` });
    },
  );

  test("blocks injected graph node fields", () => {
    const packs = loadPacks();
    packs.graph.nodes[0].documentBody = "private body";
    expect(auditPublicFieldContract(packs)).toContainEqual({ id: "public-field-not-allowed", path: "graph.nodes[].documentBody" });
  });
});
