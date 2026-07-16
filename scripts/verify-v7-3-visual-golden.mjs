import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CI_ROUTE_CASES } from "./run-v7-3-qa.mjs";
import {
  hasVisualGoldenPngMagic,
  resolveVisualGoldenCases,
  validateVisualGoldenManifest,
} from "./lib/v7-3-visual-golden.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(projectDir, "tests-visual", "approved-baselines.json");
const screenshotRoot = path.join(projectDir, "tests-visual", "__screenshots__");

function sha256(body) {
  return createHash("sha256").update(body).digest("hex");
}

async function listPngFiles(root, directory = root) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listPngFiles(root, absolute));
    else if (entry.isFile() && entry.name.endsWith(".png")) files.push(absolute);
  }
  return files;
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const expectedCases = resolveVisualGoldenCases(CI_ROUTE_CASES);
const pngFiles = await listPngFiles(screenshotRoot);
const baselineEvidence = [];
for (const absolute of pngFiles) {
  const body = await readFile(absolute);
  baselineEvidence.push({
    path: path.relative(projectDir, absolute).replaceAll(path.sep, "/"),
    bytes: body.length,
    sha256: sha256(body),
    pngMagic: hasVisualGoldenPngMagic(body),
  });
}
baselineEvidence.sort((left, right) => left.path.localeCompare(right.path));

const result = validateVisualGoldenManifest({ manifest, expectedCases, baselineEvidence });
if (!result.pass) {
  throw new Error(`Visual golden verification blocked before browser start: ${result.failures.join(", ")}`);
}
process.stdout.write(`${JSON.stringify({ result: "pass", cases: expectedCases.length }, null, 2)}\n`);
