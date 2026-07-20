import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createReleaseArtifact, verifyReleaseArtifact } from "./lib/release-artifact.mjs";
import { releaseVersionFromSource } from "./lib/public-package.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function releaseArtifactCommand({
  mode = "create",
  distDir = path.resolve(process.env.ATLAS_PUBLIC_OUTPUT_DIR ?? path.join(projectDir, "dist-public")),
  outputDir = path.resolve(process.env.ATLAS_RELEASE_ARTIFACT_DIR ?? path.join(projectDir, "artifacts", "release")),
  sourceCommit = process.env.ATLAS_SOURCE_COMMIT,
  packagePath = path.join(projectDir, "package.json"),
} = {}) {
  const packageManifest = JSON.parse(await readFile(packagePath, "utf8"));
  const releaseVersion = releaseVersionFromSource(packageManifest.version);
  const input = { distDir, outputDir, releaseVersion, sourceCommit };
  if (mode === "verify") return verifyReleaseArtifact(input);
  if (mode !== "create") throw new Error(`Unknown release artifact mode ${JSON.stringify(mode)}.`);
  return createReleaseArtifact(input);
}

const isDirectInvocation = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectInvocation) {
  const result = await releaseArtifactCommand({ mode: process.argv.includes("--verify") ? "verify" : "create" });
  console.log(JSON.stringify(result, null, 2));
}
