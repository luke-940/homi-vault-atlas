import { realpath } from "node:fs/promises";
import path from "node:path";
import { resolvePathThroughExistingAncestor } from "./build-boundary.mjs";

function isOutsideProject(projectDir, candidate) {
  const relative = path.relative(projectDir, candidate);
  return relative !== ""
    && (relative.startsWith(`..${path.sep}`) || relative === "..")
    && !path.isAbsolute(relative);
}

export function resolvePublicAuditBoundary({ projectDir, environment = process.env }) {
  const resolvedProjectDir = path.resolve(projectDir);
  const context = environment.ATLAS_PUBLIC_AUDIT_CONTEXT?.trim();
  if (!new Set(["internal-release", "public-ci"]).has(context)) {
    throw new Error("Public audit blocked: ATLAS_PUBLIC_AUDIT_CONTEXT must be internal-release or public-ci.");
  }
  let artifactRoot;
  let requiredAuditDir;
  if (context === "internal-release") {
    const artifactRootValue = environment.ATLAS_ARTIFACT_DIR?.trim()
      || environment.HOMI_ATLAS_V7_ARTIFACT_ROOT?.trim();
    if (!artifactRootValue) {
      throw new Error("Public audit blocked: internal-release requires ATLAS_ARTIFACT_DIR (or HOMI_ATLAS_V7_ARTIFACT_ROOT). ");
    }
    artifactRoot = path.resolve(artifactRootValue);
    requiredAuditDir = path.join(artifactRoot, "publication");
  } else {
    artifactRoot = path.join(resolvedProjectDir, "artifacts");
    requiredAuditDir = path.join(artifactRoot, "publication");
  }
  const artifactDir = path.resolve(environment.ATLAS_PUBLIC_AUDIT_DIR?.trim() || requiredAuditDir);
  if (artifactDir !== requiredAuditDir) {
    throw new Error(`Public audit blocked: ATLAS_PUBLIC_AUDIT_DIR must equal ${requiredAuditDir}.`);
  }
  const auditReceiptName = environment.ATLAS_PUBLIC_AUDIT_RECEIPT?.trim()
    || "v7-2-publication-audit.json";
  if (auditReceiptName !== "v7-2-publication-audit.json") {
    throw new Error("Public audit blocked: receipt name must be v7-2-publication-audit.json.");
  }
  if (context === "internal-release" && !isOutsideProject(resolvedProjectDir, artifactDir)) {
    throw new Error("Public audit blocked: internal-release evidence must be lexically outside the source project.");
  }
  return {
    context,
    projectDir: resolvedProjectDir,
    artifactRoot,
    artifactDir,
    auditReceiptName,
  };
}

export async function assertPublicAuditBoundaryPreflight({ context, projectDir, artifactDir }) {
  const [realProjectDir, resolvedArtifactDir] = await Promise.all([
    realpath(projectDir),
    resolvePathThroughExistingAncestor(artifactDir),
  ]);
  const relative = path.relative(realProjectDir, resolvedArtifactDir);
  if (context === "internal-release" && !isOutsideProject(realProjectDir, resolvedArtifactDir)) {
    throw new Error("Public audit blocked: internal-release evidence resolves inside the source project.");
  }
  if (context === "public-ci" && normalizeRelative(relative) !== "artifacts/publication") {
    throw new Error("Public audit blocked: public-ci evidence must resolve to ignored artifacts/publication.");
  }
  return { realProjectDir, resolvedArtifactDir };
}

export async function assertPublicAuditBoundary({ context, projectDir, artifactDir }) {
  const [realProjectDir, realArtifactDir] = await Promise.all([
    realpath(projectDir),
    realpath(artifactDir),
  ]);
  const relative = path.relative(realProjectDir, realArtifactDir);
  const isOutside = isOutsideProject(realProjectDir, realArtifactDir);
  if (context === "internal-release" && !isOutside) {
    throw new Error("Public audit blocked: internal-release evidence must be outside the source project.");
  }
  if (context === "public-ci" && normalizeRelative(relative) !== "artifacts/publication") {
    throw new Error("Public audit blocked: public-ci evidence must resolve to ignored artifacts/publication.");
  }
  return { realProjectDir, realArtifactDir };
}

function normalizeRelative(value) {
  return value.replaceAll("\\", "/");
}
