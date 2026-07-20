import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CI_ROUTE_CASES } from "./run-v7-4-qa.mjs";
import {
  V74_INDEPENDENT_VISUAL_QA_RECEIPT_PATH,
  V74_INDEPENDENT_VISUAL_QA_SCHEMA_PATH,
  independentVisualQaEvidencePath,
  resolveVisualGoldenCases,
} from "./lib/v7-4-visual-golden.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(projectDir, "artifacts", "ci-binding");
const outputPath = path.join(outputDir, "RELEASE_EVIDENCE.json");
const checksumPath = path.join(outputDir, "RELEASE_EVIDENCE_SHA256SUMS");
const sha256 = (body) => createHash("sha256").update(body).digest("hex");
const sourceCommit = process.env.ATLAS_SOURCE_COMMIT?.trim();
if (!/^[0-9a-f]{40}$/.test(sourceCommit ?? "")) {
  throw new Error("Release evidence inventory requires the exact tested ATLAS_SOURCE_COMMIT.");
}

const goldenCases = resolveVisualGoldenCases(CI_ROUTE_CASES);
const fixedEvidence = [
  ["publication_audit", "artifacts/publication/v7-4-publication-audit.json"],
  ["release_manifest", "artifacts/release/release-artifact-manifest.json"],
  ["release_checksums", "artifacts/release/SHA256SUMS"],
  ["browser_qa", "artifacts/v7-4-browser-qa/v7-4-ci-browser-qa.json"],
  ["server_shutdown", "artifacts/v7-4-browser-qa/server-shutdown.json"],
  ["visual_manifest", "tests-visual/approved-baselines.json"],
  ["independent_visual_qa_receipt", V74_INDEPENDENT_VISUAL_QA_RECEIPT_PATH],
  ["independent_visual_qa_schema", V74_INDEPENDENT_VISUAL_QA_SCHEMA_PATH],
];
const caseEvidence = goldenCases.flatMap((entry) => [
  ["ubuntu_visual_baseline", entry.baselinePath],
  ["in_app_browser_visual_evidence", independentVisualQaEvidencePath(entry)],
]);

const files = [];
for (const [role, relative] of [...fixedEvidence, ...caseEvidence]) {
  const body = await readFile(path.join(projectDir, relative));
  files.push({ role, path: relative, bytes: body.length, sha256: sha256(body) });
}
const byPath = new Map(files.map((entry) => [entry.path, entry]));
const [visualManifest, independentReceipt, browserQa, shutdown, releaseManifest] = await Promise.all([
  readFile(path.join(projectDir, "tests-visual", "approved-baselines.json"), "utf8").then(JSON.parse),
  readFile(path.join(projectDir, V74_INDEPENDENT_VISUAL_QA_RECEIPT_PATH), "utf8").then(JSON.parse),
  readFile(path.join(projectDir, "artifacts", "v7-4-browser-qa", "v7-4-ci-browser-qa.json"), "utf8").then(JSON.parse),
  readFile(path.join(projectDir, "artifacts", "v7-4-browser-qa", "server-shutdown.json"), "utf8").then(JSON.parse),
  readFile(path.join(projectDir, "artifacts", "release", "release-artifact-manifest.json"), "utf8").then(JSON.parse),
]);
if (visualManifest.reviewEvidenceDigest !== byPath.get(V74_INDEPENDENT_VISUAL_QA_RECEIPT_PATH)?.sha256
  || independentReceipt.status !== "approved_independent_visual_qa"
  || browserQa.pass !== true
  || shutdown.pass !== true
  || releaseManifest.sourceCommit !== sourceCommit) {
  throw new Error("Release evidence inventory blocked by an unbound or non-PASS prerequisite.");
}

const inventory = {
  schema: "homi.atlas_v7_4.release_evidence_inventory.v1",
  sourceCommit,
  evidenceFiles: files,
  independentVisualQaReceiptSha256: byPath.get(V74_INDEPENDENT_VISUAL_QA_RECEIPT_PATH).sha256,
  createdAt: new Date().toISOString(),
};
const body = Buffer.from(`${JSON.stringify(inventory, null, 2)}\n`, "utf8");
await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, body);
await writeFile(checksumPath, `${sha256(body)}  RELEASE_EVIDENCE.json\n`, "utf8");
process.stdout.write(`${JSON.stringify({ outputPath, sha256: sha256(body), files: files.length }, null, 2)}\n`);
