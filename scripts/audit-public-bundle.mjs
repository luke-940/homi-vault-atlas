import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { auditPublicFieldContract } from "./public-field-contract.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.resolve(process.env.ATLAS_PUBLIC_DATA_DIR ?? path.join(projectDir, "public-safe", "data"));
const distDir = path.resolve(process.env.ATLAS_PUBLIC_OUTPUT_DIR ?? path.join(projectDir, "dist-public"));
const artifactDir = path.resolve(process.env.ATLAS_PUBLIC_AUDIT_DIR ?? path.join(projectDir, "artifacts", "publication"));
const publicRepoDir = path.resolve(process.env.ATLAS_PUBLIC_REPO_DIR ?? path.join(projectDir, "..", "github", "homi-vault-atlas"));
const execFileAsync = promisify(execFile);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const hardPatterns = [
  ["absolute-user-path", /\/Users\/[^/]+\//i],
  ["absolute-home-path", /\/home\/[^/]+\//i],
  ["documents-path", /Documents\/[A-Za-z0-9 _.-]+\//i],
  ["file-url", /file:\/\//i],
  ["personal-email", /[\w.+-]+@(?:gmail|naver|kakao|hanmail)\.[\w.-]+/i],
];

async function filesUnder(root) {
  const output = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) output.push(...await filesUnder(absolute));
    else if (entry.isFile()) output.push(absolute);
  }
  return output;
}

const findings = [];
const manifests = [];
for (const root of [dataDir, distDir]) {
  for (const file of await filesUnder(root)) {
    const body = await readFile(file);
    const relative = path.relative(projectDir, file).replaceAll("\\", "/");
    manifests.push({ path: relative, bytes: body.length, sha256: sha256(body) });
    const text = body.toString("utf8");
    const legalText = relative.includes("/licenses/") || /(?:\.LEGAL\.txt|THIRD_PARTY_NOTICES\.md)$/.test(relative);
    const patterns = legalText
        ? hardPatterns.filter(([id]) => id !== "personal-email" && id !== "file-url")
        : hardPatterns;
    for (const [id, pattern] of patterns) if (pattern.test(text)) findings.push({ id, path: relative });
  }
}
let trackedSourceFiles = 0;
try {
  const { stdout } = await execFileAsync(
    "git",
    ["-C", publicRepoDir, "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { encoding: "utf8" },
  );
  const tracked = stdout.split("\0").filter(Boolean);
  trackedSourceFiles = tracked.length;
  for (const relativePath of tracked) {
    const text = (await readFile(path.join(publicRepoDir, relativePath))).toString("utf8");
    const legalText = relativePath.includes("licenses/") || /(?:\.LEGAL\.txt|THIRD_PARTY_NOTICES\.md)$/.test(relativePath);
    const patterns = legalText
      ? hardPatterns.filter(([id]) => id !== "personal-email" && id !== "file-url")
      : hardPatterns;
    for (const [id, pattern] of patterns) {
      if (pattern.test(text)) findings.push({ id: `tracked-${id}`, path: `github/homi-vault-atlas/${relativePath}` });
    }
  }
} catch (error) {
  findings.push({ id: "tracked-repository-scan-unavailable", path: publicRepoDir, detail: String(error) });
}
const publication = JSON.parse(await readFile(path.join(dataDir, "publication.json"), "utf8"));
const entities = JSON.parse(await readFile(path.join(dataDir, "entity.json"), "utf8"));
const publicPacks = Object.fromEntries(await Promise.all(
  ["bootstrap", "structure", "relation", "flow", "temporal", "entity", "health", "insight", "publication"]
    .map(async (name) => [name, JSON.parse(await readFile(path.join(dataDir, `${name}.json`), "utf8"))]),
));
findings.push(...auditPublicFieldContract(publicPacks));
if (publication.profile !== "public") findings.push({ id: "wrong-profile", path: "public-safe/data/publication.json" });
if (publication.blockers.length) findings.push({ id: "publication-blocker", path: "public-safe/data/publication.json" });
for (const entity of entities.entities) {
  if (!/^doc:pub:[a-f0-9]{18}$/.test(entity.id)) findings.push({ id: "unstable-public-id", path: entity.id });
  if (Object.keys(entity.frontmatter ?? {}).length) findings.push({ id: "frontmatter-not-empty", path: entity.id });
  if (entity.aliases?.length || entity.tags?.length) findings.push({ id: "metadata-not-redacted", path: entity.id });
  if (!["public_aggregate", "public_snapshot_boundary"].includes(entity.sourceRole)) findings.push({ id: "document-level-entity", path: entity.id });
  if (entity.wordCount !== 0) findings.push({ id: "public-word-count-must-be-zero", path: entity.id });
  if (!Number.isInteger(entity.documentCount) || entity.documentCount < 0) findings.push({ id: "public-document-count-invalid", path: entity.id });
  if (entity.ageDays !== null) findings.push({ id: "public-age-days-must-be-null", path: entity.id });
}
const relation = JSON.parse(await readFile(path.join(dataDir, "relation.json"), "utf8"));
if (Object.keys(relation.neighborhoods ?? {}).length) findings.push({ id: "document-level-relation", path: "public-safe/data/relation.json" });
const flow = JSON.parse(await readFile(path.join(dataDir, "flow.json"), "utf8"));
for (const route of flow.routes ?? []) {
  if ((route.sourceRefs ?? []).length) findings.push({ id: "source-reference-not-redacted", path: route.id });
  for (const station of route.stations ?? []) {
    if (station.entityId && !/^doc:pub:[a-f0-9]{18}$/.test(station.entityId)) {
      findings.push({ id: "internal-station-reference", path: station.id });
    }
  }
}
const receipt = {
  schema: "atlas.publication_audit.v1",
  generatedAt: new Date().toISOString(),
  profile: publication.profile,
  snapshot: publication.publicSnapshotDigest,
  files: manifests.sort((a, b) => a.path.localeCompare(b.path)),
  trackedSourceFiles,
  redactionCounts: publication.redactionCounts,
  findings,
  pass: findings.length === 0,
};
await mkdir(artifactDir, { recursive: true });
await writeFile(path.join(artifactDir, "v7-1-publication-audit.json"), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
if (findings.length) throw new Error(`Public bundle audit failed: ${findings.slice(0, 10).map((item) => `${item.id}:${item.path}`).join(", ")}`);
console.log(JSON.stringify({ pass: true, files: manifests.length, entities: entities.entities.length, snapshot: publication.publicSnapshotDigest }, null, 2));
