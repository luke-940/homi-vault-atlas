import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runProductionReadback } from "./lib/production-readback.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseVersionFromSource = (value) => {
  if (!/^\d+\.\d+\.\d+$/.test(String(value))) {
    throw new Error(`Production readback blocked: invalid package version ${JSON.stringify(value)}.`);
  }
  return String(value);
};

export async function productionReadbackCommand({
  productionUrl = process.env.ATLAS_PRODUCTION_URL,
  distDir = path.resolve(process.env.ATLAS_PUBLIC_OUTPUT_DIR ?? path.join(projectDir, "dist-public")),
  releaseArtifactDir = path.resolve(process.env.ATLAS_RELEASE_ARTIFACT_DIR ?? path.join(projectDir, "artifacts", "release")),
  receiptPath = path.resolve(process.env.ATLAS_READBACK_RECEIPT
    ?? path.join(projectDir, "artifacts", "production-readback", "production-readback.json")),
  sourceCommit = process.env.ATLAS_SOURCE_COMMIT,
  attempts = Number.parseInt(process.env.ATLAS_READBACK_ATTEMPTS ?? "12", 10),
  retryDelayMs = Number.parseInt(process.env.ATLAS_READBACK_RETRY_MS ?? "5000", 10),
  packagePath = path.join(projectDir, "package.json"),
} = {}) {
  if (!productionUrl) throw new Error("Production readback blocked: ATLAS_PRODUCTION_URL is required.");
  const packageManifest = JSON.parse(await readFile(packagePath, "utf8"));
  return runProductionReadback({
    productionUrl,
    distDir,
    releaseArtifactDir,
    receiptPath,
    releaseVersion: releaseVersionFromSource(packageManifest.version),
    sourceCommit,
    attempts,
    retryDelayMs,
  });
}

const isDirectInvocation = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectInvocation) {
  const result = await productionReadbackCommand();
  console.log(JSON.stringify(result, null, 2));
}
