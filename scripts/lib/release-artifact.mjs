import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

const blockSize = 512;
const commitPattern = /^[0-9a-f]{40}$/;
const sha256Pattern = /^[0-9a-f]{64}$/;

export const releaseArtifactSchema = "atlas.release_artifact.v1";
export const releaseArtifactManifestName = "release-artifact-manifest.json";
export const releaseChecksumName = "SHA256SUMS";

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function assertReleaseSourceCommit(value) {
  if (!commitPattern.test(String(value))) {
    throw new Error("Release artifact blocked: ATLAS_SOURCE_COMMIT must be an exact 40-character lowercase Git commit SHA.");
  }
  return String(value);
}

function compareNames(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

async function walkFiles(root, current = root) {
  const rows = [];
  const entries = await readdir(current, { withFileTypes: true });
  entries.sort((left, right) => compareNames(left.name, right.name));
  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) {
      rows.push(...await walkFiles(root, absolute));
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(`Release artifact blocked: non-regular file ${path.relative(root, absolute)}.`);
    }
    const body = await readFile(absolute);
    const relative = path.relative(root, absolute).replaceAll("\\", "/");
    if (!relative || relative.startsWith("../") || relative.includes("\0") || relative.includes("\n")) {
      throw new Error(`Release artifact blocked: unsafe file path ${JSON.stringify(relative)}.`);
    }
    rows.push({ path: relative, bytes: body.length, sha256: sha256(body), body });
  }
  return rows;
}

export async function collectReleaseTree(root) {
  const rootStats = await stat(root);
  if (!rootStats.isDirectory()) throw new Error("Release artifact blocked: public output is not a directory.");
  const files = await walkFiles(root);
  if (!files.length) throw new Error("Release artifact blocked: public output is empty.");
  const inventory = files.map(({ body: _body, ...item }) => item);
  const treeProjection = inventory.map((item) => `${item.sha256}  ${item.bytes}  ${item.path}\n`).join("");
  return {
    files,
    inventory,
    bytes: inventory.reduce((sum, item) => sum + item.bytes, 0),
    sha256: sha256(Buffer.from(treeProjection, "utf8")),
  };
}

function splitTarPath(relative) {
  const encoded = Buffer.from(relative, "utf8");
  if (encoded.length <= 100) return { name: relative, prefix: "" };
  const segments = relative.split("/");
  for (let index = segments.length - 1; index > 0; index -= 1) {
    const prefix = segments.slice(0, index).join("/");
    const name = segments.slice(index).join("/");
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(name) <= 100) return { name, prefix };
  }
  throw new Error(`Release artifact blocked: path cannot be represented by ustar (${relative}).`);
}

function writeText(header, offset, length, value) {
  const encoded = Buffer.from(value, "utf8");
  if (encoded.length > length) throw new Error(`Release artifact blocked: tar field overflow (${value}).`);
  encoded.copy(header, offset);
}

function writeOctal(header, offset, length, value) {
  const encoded = value.toString(8).padStart(length - 1, "0");
  if (encoded.length > length - 1) throw new Error(`Release artifact blocked: tar numeric overflow (${value}).`);
  writeText(header, offset, length, `${encoded}\0`);
}

function tarHeader(item) {
  const header = Buffer.alloc(blockSize, 0);
  const { name, prefix } = splitTarPath(item.path);
  writeText(header, 0, 100, name);
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, item.body.length);
  writeOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  header[156] = 0x30;
  writeText(header, 257, 6, "ustar\0");
  writeText(header, 263, 2, "00");
  writeText(header, 345, 155, prefix);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  writeText(header, 148, 8, `${checksum.toString(8).padStart(6, "0")}\0 `);
  return header;
}

export function createNormalizedTarGzip(files) {
  const chunks = [];
  for (const item of files) {
    chunks.push(tarHeader(item), item.body);
    const remainder = item.body.length % blockSize;
    if (remainder) chunks.push(Buffer.alloc(blockSize - remainder, 0));
  }
  chunks.push(Buffer.alloc(blockSize * 2, 0));
  const archive = gzipSync(Buffer.concat(chunks), { level: 9 });
  archive.fill(0, 4, 8);
  archive[9] = 0xff;
  return archive;
}

function readTarText(header, offset, length) {
  const field = header.subarray(offset, offset + length);
  const terminator = field.indexOf(0);
  return field.subarray(0, terminator < 0 ? field.length : terminator).toString("utf8");
}

function readTarOctal(header, offset, length) {
  const value = readTarText(header, offset, length).trim();
  return value ? Number.parseInt(value, 8) : 0;
}

function allZero(value) {
  return value.every((byte) => byte === 0);
}

export function inspectNormalizedTarGzip(archive) {
  const tar = gunzipSync(archive);
  const files = [];
  let offset = 0;
  while (offset + blockSize <= tar.length) {
    const header = tar.subarray(offset, offset + blockSize);
    if (allZero(header)) break;
    const checksum = readTarOctal(header, 148, 8);
    const normalizedHeader = Buffer.from(header);
    normalizedHeader.fill(0x20, 148, 156);
    const computedChecksum = normalizedHeader.reduce((sum, byte) => sum + byte, 0);
    if (checksum !== computedChecksum) throw new Error("Release artifact verification failed: tar header checksum mismatch.");
    const name = readTarText(header, 0, 100);
    const prefix = readTarText(header, 345, 155);
    const relative = prefix ? `${prefix}/${name}` : name;
    const size = readTarOctal(header, 124, 12);
    const mode = readTarOctal(header, 100, 8);
    const uid = readTarOctal(header, 108, 8);
    const gid = readTarOctal(header, 116, 8);
    const mtime = readTarOctal(header, 136, 12);
    const type = header[156];
    if (mode !== 0o644 || uid !== 0 || gid !== 0 || mtime !== 0 || type !== 0x30) {
      throw new Error(`Release artifact verification failed: ${relative} has non-normalized metadata.`);
    }
    if (readTarText(header, 257, 6) !== "ustar" || readTarText(header, 263, 2) !== "00") {
      throw new Error(`Release artifact verification failed: ${relative} is not normalized ustar.`);
    }
    const bodyOffset = offset + blockSize;
    const body = tar.subarray(bodyOffset, bodyOffset + size);
    if (body.length !== size) throw new Error(`Release artifact verification failed: truncated file ${relative}.`);
    files.push({ path: relative, bytes: size, sha256: sha256(body), body: Buffer.from(body) });
    offset = bodyOffset + Math.ceil(size / blockSize) * blockSize;
  }
  const paths = files.map((item) => item.path);
  const sortedPaths = [...paths].sort(compareNames);
  if (new Set(paths).size !== paths.length || paths.some((value, index) => value !== sortedPaths[index])) {
    throw new Error("Release artifact verification failed: tar paths are duplicated or not deterministically sorted.");
  }
  return files;
}

function exactInventory(items) {
  return items.map(({ body: _body, ...item }) => item);
}

function assertExactInventory(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Release artifact verification failed: ${label} inventory differs.`);
  }
}

async function publicSnapshotIdentity(distDir) {
  const [publication, assetManifest, buildReceipt] = await Promise.all([
    readFile(path.join(distDir, "data", "publication.json"), "utf8").then(JSON.parse),
    readFile(path.join(distDir, "asset-manifest.json"), "utf8").then(JSON.parse),
    readFile(path.join(distDir, "build-receipt.json"), "utf8").then(JSON.parse),
  ]);
  const values = [publication.publicSnapshotDigest, assetManifest.publicSnapshotDigest, buildReceipt.publicSnapshotDigest];
  if (!values.every((value) => sha256Pattern.test(String(value))) || new Set(values).size !== 1) {
    throw new Error("Release artifact blocked: public snapshot digest is missing or inconsistent across build evidence.");
  }
  return values[0];
}

function archiveNameForVersion(releaseVersion) {
  if (!/^\d+\.\d+\.\d+$/.test(String(releaseVersion))) {
    throw new Error(`Release artifact blocked: invalid release version ${JSON.stringify(releaseVersion)}.`);
  }
  return `homi-vault-atlas-v${releaseVersion}-static.tar.gz`;
}

async function replaceDirectory(stagingDir, outputDir) {
  const previousDir = `${outputDir}-previous-${process.pid}`;
  await rm(previousDir, { recursive: true, force: true });
  let hadPrevious = false;
  try {
    await access(outputDir);
    await rename(outputDir, previousDir);
    hadPrevious = true;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  try {
    await rename(stagingDir, outputDir);
    await rm(previousDir, { recursive: true, force: true });
  } catch (error) {
    if (hadPrevious) await rename(previousDir, outputDir);
    await rm(stagingDir, { recursive: true, force: true });
    throw error;
  }
}

export async function createReleaseArtifact({ distDir, outputDir, releaseVersion, sourceCommit }) {
  const commit = assertReleaseSourceCommit(sourceCommit);
  const [tree, publicSnapshotDigest] = await Promise.all([
    collectReleaseTree(distDir),
    publicSnapshotIdentity(distDir),
  ]);
  const archiveName = archiveNameForVersion(releaseVersion);
  const archive = createNormalizedTarGzip(tree.files);
  const archiveDigest = sha256(archive);
  const manifest = {
    schema: releaseArtifactSchema,
    releaseVersion,
    sourceCommit: commit,
    publicSnapshotDigest,
    tree: { files: tree.inventory.length, bytes: tree.bytes, sha256: tree.sha256 },
    archive: {
      path: archiveName,
      mediaType: "application/gzip",
      bytes: archive.length,
      sha256: archiveDigest,
      normalization: {
        format: "ustar+gzip",
        pathOrder: "bytewise-ascending",
        fileMode: "0644",
        uid: 0,
        gid: 0,
        mtime: 0,
      },
    },
    files: tree.inventory,
  };
  const manifestBody = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const sumsBody = Buffer.from(
    `${archiveDigest}  ${archiveName}\n${sha256(manifestBody)}  ${releaseArtifactManifestName}\n`,
    "utf8",
  );
  const stagingDir = `${outputDir}-staging-${process.pid}`;
  await rm(stagingDir, { recursive: true, force: true });
  await mkdir(stagingDir, { recursive: true });
  try {
    await Promise.all([
      writeFile(path.join(stagingDir, archiveName), archive),
      writeFile(path.join(stagingDir, releaseArtifactManifestName), manifestBody),
      writeFile(path.join(stagingDir, releaseChecksumName), sumsBody),
    ]);
    await replaceDirectory(stagingDir, outputDir);
  } catch (error) {
    await rm(stagingDir, { recursive: true, force: true });
    throw error;
  }
  return { outputDir, manifest, manifestSha256: sha256(manifestBody), checksumSha256: sha256(sumsBody) };
}

function parseChecksums(body) {
  const rows = body.trimEnd().split("\n");
  const parsed = new Map();
  for (const row of rows) {
    const match = /^([0-9a-f]{64})  ([^/\n]+)$/.exec(row);
    if (!match || parsed.has(match[2])) throw new Error("Release artifact verification failed: malformed SHA256SUMS.");
    parsed.set(match[2], match[1]);
  }
  return parsed;
}

export async function verifyReleaseArtifact({ distDir, outputDir, releaseVersion, sourceCommit }) {
  const commit = assertReleaseSourceCommit(sourceCommit);
  const manifestPath = path.join(outputDir, releaseArtifactManifestName);
  const [manifestBody, sumsBody] = await Promise.all([
    readFile(manifestPath),
    readFile(path.join(outputDir, releaseChecksumName)),
  ]);
  const manifest = JSON.parse(manifestBody.toString("utf8"));
  if (manifest.schema !== releaseArtifactSchema || manifest.releaseVersion !== releaseVersion || manifest.sourceCommit !== commit) {
    throw new Error("Release artifact verification failed: schema, version, or source commit binding differs.");
  }
  const expectedArchiveName = archiveNameForVersion(releaseVersion);
  if (manifest.archive?.path !== expectedArchiveName) {
    throw new Error("Release artifact verification failed: archive path differs from the release version.");
  }
  const checksums = parseChecksums(sumsBody.toString("utf8"));
  if (checksums.size !== 2
    || checksums.get(expectedArchiveName) !== manifest.archive.sha256
    || checksums.get(releaseArtifactManifestName) !== sha256(manifestBody)) {
    throw new Error("Release artifact verification failed: SHA256SUMS does not bind the archive and manifest.");
  }
  const archive = await readFile(path.join(outputDir, expectedArchiveName));
  if (archive.length !== manifest.archive.bytes || sha256(archive) !== manifest.archive.sha256) {
    throw new Error("Release artifact verification failed: archive bytes or digest differ.");
  }
  const archivedFiles = inspectNormalizedTarGzip(archive);
  const currentTree = await collectReleaseTree(distDir);
  assertExactInventory(exactInventory(archivedFiles), manifest.files, "archive-to-manifest");
  assertExactInventory(currentTree.inventory, manifest.files, "dist-to-manifest");
  if (currentTree.inventory.length !== manifest.tree.files
    || currentTree.bytes !== manifest.tree.bytes
    || currentTree.sha256 !== manifest.tree.sha256) {
    throw new Error("Release artifact verification failed: tree totals differ.");
  }
  const publicSnapshotDigest = await publicSnapshotIdentity(distDir);
  if (publicSnapshotDigest !== manifest.publicSnapshotDigest) {
    throw new Error("Release artifact verification failed: public snapshot digest differs.");
  }
  return {
    verdict: "pass",
    manifestPath,
    manifest,
    manifestSha256: sha256(manifestBody),
    checksumSha256: sha256(sumsBody),
  };
}
