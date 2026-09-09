import { readFile, readdir, lstat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { resolve, posix } from "node:path";
import { pathToFileURL } from "node:url";
import { validateSpatial } from "./validate-islands.mjs";
import { validateAssetManifest } from './asset-manifest.mjs';
import { validateAssets, BASIS_DECODER_CONTRACT } from "./validate-assets.mjs";
import { validateContent, validateStaticReader } from "./validate-content.mjs";

export const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
const fail = (message) => {
  throw new Error(message);
};
const SHA = /^[a-f\d]{64}$/u;
const COMMIT = /^[a-f\d]{40}$/u;
const VERSION = /^8\.\d+\.\d+(?:-[a-z\d][a-z\d.-]*)?$/iu;
const manifestName = "artifact-manifest.json";
// Explicit v8.1 public asset slots. Add a new reviewed asset by exact path.
const PUBLIC_ASSET_PATHS = new Set([
  "assets/asset-manifest.json",
  "assets/maps/loading-world.webp",
  "assets/shores/world.png",
  "assets/shores/rocket.png",
  "assets/shores/groot.png",
  "assets/shores/common.png",
  "assets/shores/atlas.png",
  "assets/atlas-v82-marine.glb",
  "assets/atlas-v82-rocket-landscape.glb",
  "assets/atlas-v82-groot-landscape.glb",
  "assets/atlas-v82-common-landscape.glb",
  "assets/atlas-v82-atlas-landscape.glb",
  "assets/atlas-v82-world.glb",
  "assets/atlas-v82-rocket.glb",
  "assets/atlas-v82-groot.glb",
  "assets/atlas-v82-common.glb",
  "assets/atlas-v82-atlas.glb",
  "assets/atlas-v81-world.glb",
  "assets/atlas-v81-rocket.glb",
  "assets/atlas-v81-groot.glb",
  "assets/atlas-v81-common.glb",
  "assets/atlas-v81-atlas.glb",
  "assets/collision/rocket.json",
  "assets/collision/groot.json",
  "assets/collision/common.json",
  "assets/collision/atlas.json",
  "assets/maps/world.webp",
  "assets/maps/rocket.webp",
  "assets/maps/groot.webp",
  "assets/maps/common.webp",
  "assets/maps/atlas.webp",
  "assets/textures/water-normal.webp",
  "assets/illustrations/groot-v82.webp",
  "assets/illustrations/rocket-v82.webp",
  "assets/illustrations/common-v82.webp",
  "assets/illustrations/atlas-v82.webp",
  "assets/rocket-lenses.webp",
  "assets/basis/basis_transcoder.js",
  "assets/basis/basis_transcoder.wasm"
]);

export function safePath(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !/[\\\x00-\x1f\x7f]/u.test(value) &&
    !value.startsWith("/") &&
    posix.normalize(value) === value &&
    !value
      .split("/")
      .some((segment) => segment === ".." || segment === "." || segment === "")
  );
}

export async function collectFiles(directory, prefix = "") {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (!safePath(relative)) fail("Artifact contains an unsafe path.");
    const absolute = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) fail("Artifact contains a symbolic link.");
    if (entry.isDirectory())
      files.push(...(await collectFiles(absolute, relative)));
    else if (entry.isFile())
      files.push({ path: relative, body: await readFile(absolute) });
    else fail("Artifact contains a non-regular entry.");
  }
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export function inventory(files) {
  return files.map(({ path, body }) => ({
    path,
    bytes: body.length,
    sha256: sha256(body),
  }));
}

function parseJSON(bytes, label) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    fail(`${label} is not valid JSON.`);
  }
}

function validateRows(rows) {
  if (!Array.isArray(rows) || !rows.length)
    fail("Artifact inventory is empty.");
  const seen = new Set();
  for (const row of rows) {
    if (
      !row ||
      !safePath(row.path) ||
      seen.has(row.path) ||
      !Number.isSafeInteger(row.bytes) ||
      row.bytes < 0 ||
      !SHA.test(row.sha256)
    )
      fail("Artifact inventory has an invalid entry.");
    seen.add(row.path);
  }
}

function assertExactInventory(expected, actual) {
  validateRows(expected);
  validateRows(actual);
  const sorted = (rows) =>
    [...rows].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const a = sorted(expected);
  const b = sorted(actual);
  if (
    a.length !== b.length ||
    a.some(
      (row, i) =>
        row.path !== b[i].path ||
        row.bytes !== b[i].bytes ||
        row.sha256 !== b[i].sha256,
    )
  )
    fail("Artifact byte inventory differs.");
}

export function verifyFiles(files, { expectedCommit, expectedTag, privatePatterns = [] } = {}) {
  const map = new Map(files.map((file) => [file.path, file.body]));
  if (map.size !== files.length) fail("Artifact contains duplicate paths.");
  for (const required of [
    manifestName,
    "release.json",
    "index.html",
    "reading.html",
    "app.js",
    "app.css",
    "fonts/atlas-sans.woff2",
    "fonts/atlas-serif.woff2",
    "data/content.json",
    "data/evidence.json",
  ]) {
    if (!map.has(required)) fail("A required public artifact file is missing.");
  }
  const rootFiles = new Set([
    manifestName,
    "release.json",
    "index.html",
    "reading.html",
    "app.js",
    "app.css",
    "app.js.LEGAL.txt",
    "data/content.json",
    "data/evidence.json",
    "data/islands.json",
    "data/map.json",
  ]);
  for (const file of files) {
    const allowed =
      rootFiles.has(file.path) ||
      /^chunks\/[a-zA-Z0-9_-]+\.js(?:\.LEGAL\.txt)?$/u.test(file.path) ||
      PUBLIC_ASSET_PATHS.has(file.path) ||
      /^assets\/shared\/[a-f0-9]{24}\.ktx2$/u.test(file.path) ||
      /^fonts\/[a-zA-Z0-9_-]+\.woff2$/u.test(file.path) ||
      /^licenses\/[a-zA-Z0-9_.-]+\.(?:txt|md)$/u.test(file.path);
    if (
      !safePath(file.path) ||
      !allowed ||
      file.path.split("/").some((part) => part.startsWith("."))
    )
      fail("Artifact includes a non-public source or recovery surface.");
  }
  const manifest = parseJSON(map.get(manifestName), "Artifact manifest");
  if (manifest.version !== 1) fail("Unsupported artifact manifest version.");
  if (manifest.files?.some((file) => file.path === manifestName))
    fail("Artifact manifest must not list its own bytes.");
  assertExactInventory(
    manifest.files,
    inventory(files.filter((file) => file.path !== manifestName)),
  );
  const release = parseJSON(map.get("release.json"), "Release identity");
  if (
    !VERSION.test(release.version) ||
    !COMMIT.test(release.commit) ||
    !SHA.test(release.contentSnapshot)
  )
    fail("Release identity must describe a commit-bound version 8 artifact.");
  if (release.sourceDirty !== false)
    fail("Release must be built from clean committed source.");
  if (expectedCommit && release.commit !== expectedCommit)
    fail("Artifact source commit differs from the reviewed commit.");
  if (expectedTag && expectedTag !== `v${release.version}`)
    fail("Release tag differs from the artifact version.");
  const snapshot = createHash("sha256")
    .update(map.get("data/content.json"))
    .update(map.get("data/evidence.json"))
    .digest("hex");
  if (snapshot !== release.contentSnapshot)
    fail("Public content snapshot binding differs.");
  if (Number(release.version.split(".")[1]) >= 1) {
    if(Number(release.version.split(".")[1])>=2){
      validateAssetManifest(files,parseJSON(map.get("data/islands.json"),"Public islands"));
      if(files.some(f=>/^assets\/atlas-v81-/.test(f.path)))fail("Legacy scene files are not a v8.2 publication surface.");
    }
    const scenePrefix=Number(release.version.split(".")[1])>=2?"atlas-v82":"atlas-v81";
    for (const required of [...Object.keys(BASIS_DECODER_CONTRACT), "data/islands.json", "data/map.json", `assets/${scenePrefix}-world.glb`, "assets/maps/world.webp", "assets/textures/water-normal.webp", ...["rocket","groot","common","atlas"].flatMap(id => [`assets/${scenePrefix}-${id}.glb`, `assets/collision/${id}.json`, `assets/maps/${id}.webp`])]) {
      if (!map.has(required)) fail("A required v8.1 public spatial asset is missing.");
    }
    if (!SHA.test(release.publicDataSnapshot)) fail("Public spatial data snapshot is missing.");
    const dataSnapshot = createHash("sha256");
    for (const name of ["content.json", "evidence.json", "islands.json", "map.json"]) dataSnapshot.update(name + "\0").update(map.get("data/" + name)).update("\0");
    if (dataSnapshot.digest("hex") !== release.publicDataSnapshot) fail("Public spatial data snapshot differs.");
    const spatial = validateSpatial(parseJSON(map.get("data/islands.json"), "Public islands"), parseJSON(map.get("data/map.json"), "Public map"), parseJSON(map.get("data/content.json"), "Public content"), parseJSON(map.get("data/evidence.json"), "Public evidence"), { privatePatterns });
    if (!spatial.valid) fail("Public spatial data validation failed.");
    const assets = validateAssets(files, { spatial: parseJSON(map.get("data/islands.json"), "Public islands"), privatePatterns });
    if (!assets.valid) fail(`Public asset contract failed with ${assets.issues.length} issue(s).`);
  }
  const validation = validateContent(
    parseJSON(map.get("data/content.json"), "Public content"),
    parseJSON(map.get("data/evidence.json"), "Public evidence"),
    { privatePatterns },
  );
  if (!validation.valid)
    fail(
      `Public content contract failed with ${validation.issues.length} issue(s).`,
    );
  const reader = validateStaticReader(
    map.get("reading.html").toString("utf8"),
    parseJSON(map.get("data/content.json"), "Public content"),
    parseJSON(map.get("data/evidence.json"), "Public evidence"),
    { privatePatterns },
  );
  if (!reader.valid)
    fail(
      `Static reader contract failed with ${reader.issues.length} issue(s).`,
    );
  const allFiles = inventory(files);
  return {
    release,
    files: allFiles,
    artifactTreeSha256: sha256(Buffer.from(JSON.stringify(allFiles))),
    manifestSha256: sha256(map.get(manifestName)),
  };
}

export async function verifyDist(directory = "dist", options = {}) {
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    fail("Artifact root must be a real directory.");
  return verifyFiles(await collectFiles(directory), options);
}

/** Parse only the deterministic regular-file USTAR format produced by our packager. */
export function unpackArchive(bytes) {
  const tar = gunzipSync(bytes, { maxOutputLength: 512 * 1024 * 1024 });
  if (tar.length % 512 !== 0)
    fail("Release archive has an invalid block size.");
  const files = [];
  const string = (block, offset, count) =>
    block
      .subarray(offset, offset + count)
      .toString("utf8")
      .replace(/\0.*$/su, "");
  let position = 0;
  for (; position + 512 <= tar.length; ) {
    const header = tar.subarray(position, position + 512);
    if (header.every((value) => value === 0)) {
      if (!tar.subarray(position).every((value) => value === 0))
        fail("Release archive has trailing entries.");
      break;
    }
    let checksum = 0;
    for (let i = 0; i < 512; i++)
      checksum += i >= 148 && i < 156 ? 32 : header[i];
    if (checksum !== Number.parseInt(string(header, 148, 8).trim(), 8))
      fail("Release archive header checksum differs.");
    if (string(header, 257, 5) !== "ustar" || ![0, 48].includes(header[156]))
      fail("Release archive contains an unsupported entry type.");
    const prefix = string(header, 345, 155);
    const name = `${prefix ? `${prefix}/` : ""}${string(header, 0, 100)}`;
    const sizeText = string(header, 124, 12).trim();
    if (!/^[0-7]+$/u.test(sizeText))
      fail("Release archive entry size is invalid.");
    const size = Number.parseInt(sizeText, 8);
    if (
      !safePath(name) ||
      !Number.isSafeInteger(size) ||
      position + 512 + size > tar.length
    )
      fail("Release archive has an unsafe or truncated entry.");
    files.push({
      path: name,
      body: tar.subarray(position + 512, position + 512 + size),
    });
    position += 512 + Math.ceil(size / 512) * 512;
  }
  if (!files.length || tar.length - position < 1024)
    fail("Release archive end marker is missing.");
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export async function verifyPackage(directory, options = {}) {
  const entries = await collectFiles(directory);
  const map = new Map(entries.map((entry) => [entry.path, entry.body]));
  if (
    !map.has("release-binding.json") ||
    !map.has("SHA256SUMS") ||
    !map.has(manifestName)
  )
    fail("Release package is incomplete.");
  const binding = parseJSON(map.get("release-binding.json"), "Release binding");
  if (
    binding.schema !== "atlas.release_binding.v1" ||
    !COMMIT.test(binding.sourceCommit) ||
    !COMMIT.test(binding.sourceTree) ||
    !VERSION.test(binding.version) ||
    binding.tag !== `v${binding.version}` ||
    !safePath(binding.archive?.file)
  )
    fail("Release binding is invalid.");
  if (options.expectedTree && binding.sourceTree !== options.expectedTree)
    fail("Release source tree differs from the reviewed tree.");
  const expectedNames = [
    "SHA256SUMS",
    manifestName,
    "release-binding.json",
    binding.archive.file,
  ].sort();
  if (JSON.stringify([...map.keys()].sort()) !== JSON.stringify(expectedNames))
    fail("Release package includes unexpected files.");
  const archive = map.get(binding.archive.file);
  if (
    archive.length !== binding.archive.bytes ||
    sha256(archive) !== binding.archive.sha256
  )
    fail("Release archive digest differs.");
  const sums = map.get("SHA256SUMS").toString("utf8").trimEnd().split("\n");
  const sumRows = sums.map((line) => {
    const match = /^([a-f\d]{64})  (.+)$/u.exec(line);
    if (!match || !map.has(match[2]) || match[2] === "SHA256SUMS")
      fail("Release checksums have an invalid entry.");
    return {
      path: match[2],
      bytes: map.get(match[2]).length,
      sha256: match[1],
    };
  });
  assertExactInventory(
    sumRows,
    inventory(entries.filter((entry) => entry.path !== "SHA256SUMS")),
  );
  const files = unpackArchive(archive);
  const verified = verifyFiles(files, {
    expectedCommit: options.expectedCommit ?? binding.sourceCommit,
    expectedTag: options.expectedTag ?? binding.tag,
    privatePatterns: options.privatePatterns ?? [],
  });
  if (
    verified.release.commit !== binding.sourceCommit ||
    verified.release.version !== binding.version ||
    verified.release.contentSnapshot !== binding.contentSnapshot ||
    verified.artifactTreeSha256 !== binding.artifactTreeSha256 ||
    verified.manifestSha256 !== binding.artifactManifestSha256 ||
    sha256(map.get(manifestName)) !== verified.manifestSha256
  )
    fail("Release-to-site binding differs.");
  return { ...verified, binding, archiveFiles: files };
}

export async function verifyProduction(
  baseURL,
  verified,
  { attempts = 6, delayMs = 5000 } = {},
) {
  const base = new URL(baseURL);
  if (
    base.protocol !== "https:" ||
    base.origin !== "https://luke-940.github.io" ||
    base.pathname !== "/homi-vault-atlas/"
  )
    fail("Production readback must use the registered HTTPS Pages URL.");
  let lastIssue = "Production bytes did not match.";
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const rows = verified.files;
      for (const identified of [false, true]) {
        for (let offset = 0; offset < rows.length; offset += 4) {
          await Promise.all(
            rows.slice(offset, offset + 4).map(async (row) => {
              const url = new URL(
                row.path.split("/").map(encodeURIComponent).join("/"),
                base,
              );
              if (identified)
                url.searchParams.set("atlas_commit", verified.release.commit);
              const response = await fetch(url, {
                signal: AbortSignal.timeout(20000),
                cache: "no-store",
                redirect: "error",
              });
              if (!response.ok) fail("Production file is unavailable.");
              const bytes = Buffer.from(await response.arrayBuffer());
              if (bytes.length !== row.bytes || sha256(bytes) !== row.sha256)
                fail("Production file bytes differ.");
            }),
          );
        }
      }
      const home = await fetch(base, {
        signal: AbortSignal.timeout(20000),
        cache: "no-store",
        redirect: "error",
      });
      if (!home.ok) fail("Production home is unavailable.");
      const homeBytes = Buffer.from(await home.arrayBuffer());
      const indexRow = rows.find((row) => row.path === "index.html");
      if (
        homeBytes.length !== indexRow.bytes ||
        sha256(homeBytes) !== indexRow.sha256
      )
        fail("Production home differs from the reviewed index.");
      return {
        schema: "atlas.production_readback.v1",
        status: "pass",
        commit: verified.release.commit,
        version: verified.release.version,
        artifactTreeSha256: verified.artifactTreeSha256,
        filesVerified: verified.files.length,
        variants: ["bare", "commit-query", "root-home"],
        attempt,
        url: base.href,
        checkedAt: new Date().toISOString(),
      };
    } catch (error) {
      lastIssue = error.message;
    }
    if (attempt < attempts)
      await new Promise((done) => setTimeout(done, delayMs));
  }
  fail(`Production readback failed: ${lastIssue}`);
}

async function main() {
  const values = {};
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 2) {
    if (
      !["--dist", "--package", "--commit", "--tag", "--tree", "--url"].includes(
        args[i],
      ) ||
      !args[i + 1]
    )
      fail("Invalid artifact verification arguments.");
    values[args[i]] = args[i + 1];
  }
  if (values["--dist"] && values["--package"])
    fail("Choose either a dist or package input.");
  const options = {
    expectedCommit: values["--commit"],
    expectedTag: values["--tag"],
    expectedTree: values["--tree"],
  };
  const result = values["--package"]
    ? await verifyPackage(values["--package"], options)
    : await verifyDist(values["--dist"] ?? "dist", options);
  const output = values["--url"]
    ? await verifyProduction(values["--url"], result)
    : {
        status: "pass",
        commit: result.release.commit,
        version: result.release.version,
        fileCount: result.files.length,
        artifactTreeSha256: result.artifactTreeSha256,
      };
  console.log(JSON.stringify(output, null, 2));
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
