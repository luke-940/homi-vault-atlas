import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const ownerPayloadPatterns = [
  { id: "owner-generated-path", pattern: /\.generated\/owner/i },
  { id: "owner-activity-schema", pattern: /"schema"\s*:\s*"atlas\.activity\.v1"/ },
  { id: "owner-profile", pattern: /"profile"\s*:\s*"(?:owner|atlas-owner)"/ },
  { id: "owner-name-mode", pattern: /"nameMode"\s*:\s*"owner_name"/ },
];

async function dataFiles(root) {
  const rows = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) rows.push(...await dataFiles(absolute));
    else if (entry.isFile()) rows.push(absolute);
  }
  return rows;
}

export async function assertNoOwnerPayloadInPublicArtifact({ distDir }) {
  const root = path.resolve(distDir);
  const dataRoot = path.join(root, "data");
  if (!(await stat(dataRoot)).isDirectory()) throw new Error("Public artifact exclusion blocked: data root is missing.");
  const findings = [];
  for (const absolute of await dataFiles(dataRoot)) {
    const relative = path.relative(root, absolute).replaceAll(path.sep, "/");
    if (/^data\/activity(?:\.|$)/i.test(relative)) findings.push({ id: "owner-activity-file", path: relative });
    const body = await readFile(absolute, "utf8");
    for (const rule of ownerPayloadPatterns) {
      if (rule.pattern.test(body)) findings.push({ id: rule.id, path: relative });
    }
  }
  if (findings.length > 0) {
    throw new Error(`Public artifact exclusion blocked: owner payload crossed the data boundary (${findings.map((item) => `${item.id}:${item.path}`).join(", ")}).`);
  }
  return { pass: true, dataRoot: path.relative(root, dataRoot), findings: [] };
}
