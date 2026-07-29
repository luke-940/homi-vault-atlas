import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  auditKnowledgeArtifacts,
  expandKnowledgeIndex,
} from "../scripts/lib/knowledge-pack-contract.mjs";
import { parseKnowledgeShardWrapper } from "../scripts/lib/knowledge-publication.mjs";

const dataRoot = path.resolve(process.env.ATLAS_TEST_DATA_DIR ?? "public-safe/data");
const knowledgeBody = readFileSync(path.join(dataRoot, "knowledge.json"), "utf8");
const knowledge = JSON.parse(knowledgeBody);
const expandedKnowledge = expandKnowledgeIndex(knowledge);
const graph = JSON.parse(readFileSync(path.join(dataRoot, "graph.json"), "utf8"));
const forbiddenKeys = new Set([
  "rawMarkdown",
  "frontmatter",
  "sourcePath",
  "relativePath",
  "sourceHash",
  "sourceSha256",
]);

function objectKeys(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(objectKeys);
  return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, child]) => [key, ...objectKeys(child)]);
}

describe("lazy knowledge shard boundary", () => {
  test("binds every dossier and Reader shard plus the search index to exact hashed bytes", async () => {
    const result = await auditKnowledgeArtifacts(dataRoot, knowledge, { graph });
    expect(result.findings).toEqual([]);
    expect(result.shardPairs).toHaveLength(knowledge.manifest.dossierCount);
    expect(result.searchPairs).toHaveLength(1);
    for (const artifact of [...result.shardPairs, ...result.searchPairs]) {
      expect(artifact.jsonPath).toMatch(
        artifact.kind === "search"
          ? /^search\.[a-f0-9]{16,64}\.json$/
          : /^knowledge-shards\/[a-f0-9]{16,64}\.json$/,
      );
      expect(artifact.javascriptPath).toBe(artifact.jsonPath.replace(/\.json$/, ".js"));
      expect(artifact.jsonSha256.startsWith(
        path.basename(artifact.jsonPath, ".json").replace(/^search\./, ""),
      )).toBe(true);
      expect(artifact.registryKey).toBe(
        artifact.kind === "search"
          ? "knowledge-search"
          : artifact.value.nodeId,
      );
    }
  });

  test("keeps the initial index compact and all dossier bodies outside it", () => {
    expect(Buffer.byteLength(knowledgeBody)).toBeLessThanOrEqual(220 * 1024);
    expect(knowledgeBody).not.toMatch(/publishedBlocks|sourceReaderBlocks|readerBlocks/);
    expect(expandedKnowledge.shards).toHaveLength(knowledge.manifest.dossierCount);
    for (const shard of expandedKnowledge.shards) {
      const jsonPath = shard.path.replace(/^\.\//, "").replace(/^data\//, "");
      expect(statSync(path.join(dataRoot, jsonPath)).size).toBeLessThanOrEqual(180 * 1024);
      const body = parseKnowledgeShardWrapper(readFileSync(
        path.join(dataRoot, jsonPath.replace(/\.json$/, ".js")),
        "utf8",
      )).value;
      expect(body).toMatchObject({
        schema: "atlas.knowledge_shard.v1",
        nodeId: shard.nodeId,
        dossier: { nodeId: shard.nodeId },
        document: { nodeId: shard.nodeId },
      });
      expect(objectKeys(body).filter((key) => forbiddenKeys.has(key))).toEqual([]);
      const relationBody = JSON.stringify(body.dossier.relationExplanations);
      expect(relationBody).not.toMatch(/비공개 대상/);
      expect(relationBody).not.toMatch(/\b(?:SI|SR)[-–—_ ]?\d+\b/i);
    }
  });
});
