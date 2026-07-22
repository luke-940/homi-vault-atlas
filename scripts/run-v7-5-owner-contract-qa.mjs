import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(projectDir, "artifacts", "v7-5-owner-qa");
const reportPath = path.join(artifactDir, "vitest-report.json");
const receiptPath = path.join(artifactDir, "owner-contract-qa.json");
const ownerProjectionPath = path.join(projectDir, ".generated", "owner", "atlas-owner.json");
const sha256 = (body) => createHash("sha256").update(body).digest("hex");

await mkdir(artifactDir, { recursive: true });
await readFile(ownerProjectionPath);

await execFileAsync(process.execPath, [
  path.join(projectDir, "node_modules", "vitest", "vitest.mjs"),
  "run",
  "tests-public/v75-data-boundary.test.ts",
  "--maxWorkers=1",
  "--reporter=json",
  `--outputFile=${reportPath}`,
], {
  cwd: projectDir,
  env: { ...process.env, ATLAS_TEST_PROFILE: "owner-local" },
  maxBuffer: 16 * 1024 * 1024,
});

const reportBody = await readFile(reportPath);
const report = JSON.parse(reportBody.toString("utf8"));
const receipt = {
  schema: "homi.atlas_v7_5.owner_contract_qa.v1",
  profile: "owner-local",
  verdict: report.success === true ? "pass" : "fail",
  ownerBytesEnteredCi: false,
  testFile: "tests-public/v75-data-boundary.test.ts",
  testResults: {
    total: report.numTotalTests,
    passed: report.numPassedTests,
    failed: report.numFailedTests,
    pending: report.numPendingTests,
  },
  report: {
    path: "artifacts/v7-5-owner-qa/vitest-report.json",
    bytes: reportBody.length,
    sha256: sha256(reportBody),
  },
  completedAt: new Date().toISOString(),
};
if (receipt.verdict !== "pass" || receipt.testResults.failed !== 0 || receipt.testResults.pending !== 0) {
  throw new Error("Owner-local v7.5 contract QA did not produce a complete PASS result.");
}
const receiptBody = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8");
await writeFile(receiptPath, receiptBody);
process.stdout.write(`${JSON.stringify({ receiptPath, sha256: sha256(receiptBody), tests: receipt.testResults }, null, 2)}\n`);
