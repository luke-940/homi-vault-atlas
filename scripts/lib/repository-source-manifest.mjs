import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const normalizePath = (value) => value.replaceAll("\\", "/");
const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => compareText(left, right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
};
const stableJson = (value) => JSON.stringify(stableValue(value));

async function git(repoDir, args) {
  const { stdout } = await execFileAsync("git", args, {
    cwd: repoDir,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

async function gitBoundary(repoDir) {
  const [head, tree, status, sourceList] = await Promise.all([
    git(repoDir, ["rev-parse", "HEAD"]),
    git(repoDir, ["rev-parse", "HEAD^{tree}"]),
    git(repoDir, ["status", "--porcelain=v1", "--untracked-files=all"]),
    git(repoDir, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"]),
  ]);
  return {
    head: head.trim(),
    tree: tree.trim(),
    status: status.trim(),
    paths: sourceList.split("\0").filter(Boolean).map(normalizePath).sort(compareText),
  };
}

function sameStat(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs;
}

export async function collectRepositorySourceManifest(repoDir) {
  const realRepoDir = await realpath(repoDir);
  const before = await gitBoundary(realRepoDir);
  if (!/^[a-f0-9]{40}$/.test(before.head)
    || !/^[a-f0-9]{40}$/.test(before.tree)
    || before.status !== "") {
    throw new Error(`Repository source manifest blocked: repository is not a clean commit (${before.status || "invalid git identity"}).`);
  }
  if (new Set(before.paths).size !== before.paths.length) {
    throw new Error("Repository source manifest blocked: duplicate Git source paths.");
  }

  const entries = [];
  let bytes = 0;
  for (const relative of before.paths) {
    if (!relative || path.isAbsolute(relative) || relative.split("/").includes("..")) {
      throw new Error(`Repository source manifest blocked: invalid source path ${relative}.`);
    }
    const absolute = path.join(realRepoDir, relative);
    const beforeStat = await lstat(absolute, { bigint: true });
    if (!beforeStat.isFile() || beforeStat.isSymbolicLink()) {
      throw new Error(`Repository source manifest blocked: source entry is not a regular file (${relative}).`);
    }
    const resolved = await realpath(absolute);
    const resolvedRelative = path.relative(realRepoDir, resolved);
    if (resolvedRelative === ""
      || resolvedRelative.startsWith(`..${path.sep}`)
      || resolvedRelative === ".."
      || path.isAbsolute(resolvedRelative)) {
      throw new Error(`Repository source manifest blocked: source entry escapes repository (${relative}).`);
    }
    const body = await readFile(resolved);
    const afterStat = await lstat(absolute, { bigint: true });
    if (!sameStat(beforeStat, afterStat) || Number(afterStat.size) !== body.length) {
      throw new Error(`Repository source manifest blocked: source entry changed while hashing (${relative}).`);
    }
    const entry = { path: relative, bytes: body.length, sha256: sha256(body) };
    entries.push(entry);
    bytes += body.length;
  }

  const after = await gitBoundary(realRepoDir);
  if (before.head !== after.head
    || before.tree !== after.tree
    || after.status !== ""
    || JSON.stringify(before.paths) !== JSON.stringify(after.paths)) {
    throw new Error("Repository source manifest blocked: Git identity or source inventory changed while hashing.");
  }
  const aggregate = createHash("sha256");
  for (const entry of entries) aggregate.update(`${entry.path}\0${entry.bytes}\0${entry.sha256}\n`);
  return {
    path: realRepoDir,
    head: before.head,
    tree: before.tree,
    clean: true,
    sourceManifest: {
      files: entries.length,
      bytes,
      sha256: aggregate.digest("hex"),
      entries,
    },
  };
}

export function assertRepositorySourceManifestBinding(
  receiptRepository,
  currentRepository,
  target = "luke-940/homi-vault-atlas",
) {
  if (receiptRepository?.target !== target
    || receiptRepository?.head !== currentRepository?.head
    || receiptRepository?.tree !== currentRepository?.tree
    || receiptRepository?.clean !== true
    || currentRepository?.clean !== true
    || stableJson(receiptRepository?.sourceManifest) !== stableJson(currentRepository?.sourceManifest)) {
    throw new Error("Repository source manifest blocked: receipt does not bind the exact clean Git source tree.");
  }
  return true;
}
