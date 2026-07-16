import path from "node:path";
import { lstat, realpath } from "node:fs/promises";

export const CANONICAL_REGENERATION_CONFIRMATION = "READ_LUKE_VAULT_UNDER_MANAGER_WORK_ORDER";
export const LUKE_RELEASE_AUTHORITY = "REL-ATLAS";
export const LUKE_RELEASE_REGENERATION_CONFIRMATION = "READ_LUKE_VAULT_UNDER_LUKE_REL_ATLAS_APPROVAL";

const canonicalScriptNames = Object.freeze([
  "canonical:baseline:capture",
  "canonical:candidate:capture",
  "canonical:agency:capture",
  "canonical:agency:verify",
  "canonical:data:regenerate",
]);

export const defaultCanonicalForbiddenRoots = Object.freeze([
  "/Users/gangjaeseong/Documents/Luke Vault",
  "/Users/gangjaeseong/Documents/Codex/homi-obsidian-memory-engine",
  "/Users/gangjaeseong/Documents/Codex/2026-07-07/homi-obsidian-manager-7-homi-obsidian/atlas-v7",
  "/Users/gangjaeseong/Documents/Codex/2026-07-07/homi-obsidian-manager-7-homi-obsidian/artifacts/batch590-atlas-v7-1",
  "/Users/gangjaeseong/Documents/Codex/2026-07-07/homi-obsidian-manager-7-homi-obsidian/outputs/homi-vault-history-atlas-v7-1",
]);

const insideOrEqual = (root, candidate) => {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
};

export async function resolvePathThroughExistingAncestor(value) {
  let cursor = path.resolve(value);
  const suffix = [];
  while (true) {
    let exists = false;
    try {
      await lstat(cursor);
      exists = true;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    if (exists) {
      const resolved = await realpath(cursor);
      return path.join(resolved, ...suffix);
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) throw new Error(`Canonical capture blocked: no existing ancestor for ${value}.`);
    suffix.unshift(path.basename(cursor));
    cursor = parent;
  }
}

export async function resolveCanonicalCapturePaths({
  workspaceDir,
  projectDir,
  environment = process.env,
  forbiddenRoots = defaultCanonicalForbiddenRoots,
}) {
  const resolveOverride = (value, fallback) => (
    typeof value === "string" && value.trim() ? value.trim() : fallback
  );
  const workspaceActual = await resolvePathThroughExistingAncestor(workspaceDir);
  const projectActual = await resolvePathThroughExistingAncestor(projectDir);
  if (!insideOrEqual(workspaceActual, projectActual) || workspaceActual === projectActual) {
    throw new Error("Canonical capture blocked: project must be a distinct real path inside the isolated workspace.");
  }
  const allowedArtifactRoot = await resolvePathThroughExistingAncestor(
    path.join(workspaceActual, "artifacts", "atlas-v7-3-rc"),
  );
  const allowedCacheRoot = await resolvePathThroughExistingAncestor(path.join(projectActual, ".cache"));
  if (!insideOrEqual(workspaceActual, allowedArtifactRoot)) {
    throw new Error("Canonical capture blocked: v7.3 evidence root escapes the real workspace through a symlink.");
  }
  if (!insideOrEqual(projectActual, allowedCacheRoot)) {
    throw new Error("Canonical capture blocked: cache root escapes the real project through a symlink.");
  }

  const artifactRoot = await resolvePathThroughExistingAncestor(resolveOverride(
    environment.HOMI_ATLAS_V7_ARTIFACT_ROOT,
    path.join(workspaceActual, "artifacts", "atlas-v7-3-rc"),
  ));
  const indexPath = await resolvePathThroughExistingAncestor(resolveOverride(
    environment.HOMI_ATLAS_V7_INDEX_PATH,
    path.join(projectActual, ".cache", "vault_index_v2.sqlite"),
  ));
  const candidateInputPath = await resolvePathThroughExistingAncestor(resolveOverride(
    environment.HOMI_ATLAS_V7_CANDIDATE_INPUT_PATH,
    path.join(projectActual, ".cache", "candidate-input.json"),
  ));
  if (artifactRoot !== allowedArtifactRoot) {
    throw new Error("Canonical capture blocked: artifact root must be the exact real v7.3 RC evidence directory.");
  }
  for (const [label, candidate] of [["index", indexPath], ["candidate input", candidateInputPath]]) {
    if (!insideOrEqual(allowedCacheRoot, candidate) || candidate === allowedCacheRoot) {
      throw new Error(`Canonical capture blocked: ${label} must remain inside the real project .cache directory.`);
    }
  }
  if (indexPath === candidateInputPath) {
    throw new Error("Canonical capture blocked: index and candidate input paths must be distinct.");
  }
  const actualForbiddenRoots = await Promise.all(
    forbiddenRoots.map((root) => resolvePathThroughExistingAncestor(root)),
  );
  for (const candidate of [workspaceActual, projectActual, artifactRoot, allowedCacheRoot, indexPath, candidateInputPath]) {
    if (actualForbiddenRoots.some((root) => insideOrEqual(root, candidate) || insideOrEqual(candidate, root))) {
      throw new Error("Canonical capture blocked: isolated paths overlap Vault, engine, source, or frozen surfaces.");
    }
  }
  return {
    workspaceDir: workspaceActual,
    projectDir: projectActual,
    artifactRoot,
    cacheRoot: allowedCacheRoot,
    indexPath,
    candidateInputPath,
  };
}

export function assertCanonicalRegenerationAuthority(environment = process.env) {
  const confirmation = environment.HOMI_ATLAS_CANONICAL_REGENERATION_CONFIRMATION?.trim();
  const workOrder = environment.HOMI_ATLAS_MANAGER_WORK_ORDER?.trim();
  const lukeReleaseAuthority = environment.HOMI_ATLAS_LUKE_RELEASE_AUTHORITY?.trim();
  if (workOrder && confirmation === CANONICAL_REGENERATION_CONFIRMATION) {
    return { confirmation, workOrder };
  }
  if (
    lukeReleaseAuthority === LUKE_RELEASE_AUTHORITY
    && confirmation === LUKE_RELEASE_REGENERATION_CONFIRMATION
  ) {
    return { confirmation, lukeReleaseAuthority };
  }
  throw new Error(
    "Canonical regeneration blocked: exact Manager work-order authority or Luke REL-ATLAS authority plus its matching read-only Luke Vault confirmation is required.",
  );
}

export function assertCanonicalPublicRootBoundary(environment = process.env) {
  if (environment.HOMI_ATLAS_V7_PUBLIC_ROOT !== undefined) {
    throw new Error("Canonical data regeneration forbids overriding the isolated project public root.");
  }
  return { publicRootOverrideAllowed: false };
}

export function assertStaticSnapshotPackageScripts(scripts) {
  const ordinaryScripts = ["dev", "build"];
  const forbiddenOrdinaryTokens = [
    "build-data",
    "capture-baseline",
    "capture-candidate-input",
    "canonical:",
    "npm run data",
  ];

  for (const name of ordinaryScripts) {
    const command = scripts?.[name];
    if (typeof command !== "string" || !command.trim()) {
      throw new Error(`Static snapshot boundary requires an explicit ${name} command.`);
    }
    const forbidden = forbiddenOrdinaryTokens.find((token) => command.includes(token));
    if (forbidden) {
      throw new Error(`Static snapshot boundary blocked ${name}: command contains ${forbidden}.`);
    }
  }

  if (Object.hasOwn(scripts ?? {}, "data")) {
    throw new Error("Static snapshot boundary forbids the ambiguous npm script name data.");
  }
  for (const name of canonicalScriptNames) {
    const command = scripts?.[name];
    if (typeof command !== "string" || !command.trim()) {
      throw new Error(`Static snapshot boundary requires the explicit ${name} command.`);
    }
  }
  return {
    ordinaryScripts,
    canonicalScripts: [...canonicalScriptNames],
    mode: "fixed-release-snapshot",
  };
}
