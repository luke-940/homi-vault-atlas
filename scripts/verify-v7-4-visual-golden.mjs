import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CI_ROUTE_CASES } from "./run-v7-4-qa.mjs";
import {
  V74_INDEPENDENT_VISUAL_QA_EVIDENCE_ROOT,
  V74_INDEPENDENT_VISUAL_QA_RECEIPT_PATH,
  hasVisualGoldenPngMagic,
  resolveVisualGoldenCases,
  validateVisualGoldenManifest,
} from "./lib/v7-4-visual-golden.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(projectDir, "tests-visual", "approved-baselines.json");
const screenshotRoot = path.join(projectDir, "tests-visual", "__screenshots__", "v7-4-golden.spec.mjs");
const independentReceiptPath = path.join(projectDir, V74_INDEPENDENT_VISUAL_QA_RECEIPT_PATH);
const independentEvidenceRoot = path.join(projectDir, V74_INDEPENDENT_VISUAL_QA_EVIDENCE_ROOT);

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
const [pngFiles, independentPngFiles, independentReceiptBody] = await Promise.all([
  listPngFiles(screenshotRoot),
  listPngFiles(independentEvidenceRoot),
  readFile(independentReceiptPath).catch((error) => error?.code === "ENOENT" ? Buffer.alloc(0) : Promise.reject(error)),
]);
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
const independentEvidence = [];
for (const absolute of independentPngFiles) {
  const body = await readFile(absolute);
  independentEvidence.push({
    path: path.relative(projectDir, absolute).replaceAll(path.sep, "/"),
    bytes: body.length,
    sha256: sha256(body),
    pngMagic: hasVisualGoldenPngMagic(body),
  });
}
independentEvidence.sort((left, right) => left.path.localeCompare(right.path));

const result = validateVisualGoldenManifest({
  manifest,
  expectedCases,
  baselineEvidence,
  independentReview: { receiptBody: independentReceiptBody, evidence: independentEvidence },
});
if (!result.pass) {
  throw new Error(`Visual golden verification blocked before browser start: ${result.failures.join(", ")}`);
}
process.stdout.write(`${JSON.stringify({ result: "pass", cases: expectedCases.length }, null, 2)}\n`);
