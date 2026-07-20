import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { stableDigest } from "./lib/v7-4-profile-contract.mjs";

function requiredPathEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Capture blocked: ${name} is required.`);
  return path.resolve(value);
}

const outputDir = requiredPathEnvironment("ATLAS_V7_4_CAPTURE_DIR");
const vaultRoot = requiredPathEnvironment("ATLAS_VAULT_ROOT");
const memoryDatabase = requiredPathEnvironment("ATLAS_MEMORY_DATABASE");
const controlPlaneRoot = requiredPathEnvironment("ATLAS_CONTROL_PLANE_ROOT");
const configuredOutputRoot = process.env.ATLAS_BUILDER_OUTPUT_ROOT
  ? path.resolve(process.env.ATLAS_BUILDER_OUTPUT_ROOT)
  : outputDir;
const ledgerSources = [
  path.join(controlPlaneRoot, "indexes", "activity-events.v1.jsonl"),
  path.join(controlPlaneRoot, "indexes", "activity-state.v1.json"),
];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0;

function insideOrEqual(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

if (!insideOrEqual(configuredOutputRoot, outputDir)) {
  throw new Error("Capture blocked: ATLAS_V7_4_CAPTURE_DIR must remain under ATLAS_BUILDER_OUTPUT_ROOT.");
}

async function markdownPaths(root, current = root) {
  const output = [];
  for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) => compareText(a.name, b.name))) {
    if (current === root && (entry.name.startsWith(".") || entry.name === "vault-backups")) continue;
    const absolute = path.join(current, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Capture blocked: source tree contains symlink ${absolute}.`);
    if (entry.isDirectory()) output.push(...await markdownPaths(root, absolute));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) output.push(absolute);
  }
  return output;
}

async function vaultSnapshot() {
  const files = [];
  for (const absolute of await markdownPaths(vaultRoot)) {
    const body = await readFile(absolute);
    files.push({
      relativePath: path.relative(vaultRoot, absolute).replaceAll("\\", "/").normalize("NFC"),
      bytes: body.length,
      sha256: sha256(body),
    });
  }
  files.sort((left, right) => compareText(left.relativePath, right.relativePath));
  return {
    files,
    markdownCount: files.length,
    treeDigest: stableDigest(files),
  };
}

async function stableBinaryWitness(sourcePath) {
  const first = await readFile(sourcePath);
  const second = await readFile(sourcePath);
  const firstSha256 = sha256(first);
  const secondSha256 = sha256(second);
  return {
    sourcePath,
    bytes: second.length,
    firstSha256,
    secondSha256,
    stable: first.length === second.length && firstSha256 === secondSha256,
  };
}

const firstVault = await vaultSnapshot();
const secondVault = await vaultSnapshot();
const vaultStable = firstVault.markdownCount === secondVault.markdownCount
  && firstVault.treeDigest === secondVault.treeDigest;
const memoryWitness = await stableBinaryWitness(memoryDatabase);
const ledgerWitnesses = await Promise.all(ledgerSources.map(stableBinaryWitness));
const pass = vaultStable && memoryWitness.stable && ledgerWitnesses.every((witness) => witness.stable);
const capturedAt = new Date().toISOString();
const manifest = {
  schema: "atlas.canonical_capture.v1",
  profileTarget: ["atlas-owner", "atlas-public"],
  capturedAt,
  sourceBoundary: {
    vaultRoot,
    excludes: ["dot-directories", "vault-backups"],
    memoryDatabase,
    controlPlaneLedger: ledgerSources,
    readOnly: true,
  },
  vault: {
    markdownCount: secondVault.markdownCount,
    treeDigest: secondVault.treeDigest,
    files: secondVault.files,
  },
  memoryEngine: memoryWitness,
  controlPlaneLedger: ledgerWitnesses,
  doubleRead: {
    vaultFirstDigest: firstVault.treeDigest,
    vaultSecondDigest: secondVault.treeDigest,
    vaultStable,
    memoryStable: memoryWitness.stable,
    ledgerStable: ledgerWitnesses.every((witness) => witness.stable),
  },
  tornRead: !pass,
  pass,
};
if (!pass) {
  throw new Error(`Canonical capture blocked: torn read detected (${JSON.stringify(manifest.doubleRead)}).`);
}
await mkdir(outputDir, { recursive: true });
const manifestBody = `${JSON.stringify(manifest, null, 2)}\n`;
await writeFile(path.join(outputDir, "canonical-capture-manifest.json"), manifestBody, "utf8");
const verdict = {
  schema: "atlas.capture_torn_read_verdict.v1",
  capturedAt,
  manifestSha256: sha256(manifestBody),
  markdownCount: secondVault.markdownCount,
  vaultTreeDigest: secondVault.treeDigest,
  memoryEngineSha256: memoryWitness.secondSha256,
  controlPlaneLedgerSha256: Object.fromEntries(
    ledgerWitnesses.map((witness) => [path.basename(witness.sourcePath), witness.secondSha256]),
  ),
  tornRead: false,
  pass: true,
};
await writeFile(path.join(outputDir, "torn-read-verdict.json"), `${JSON.stringify(verdict, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outputDir, ...verdict }, null, 2));
