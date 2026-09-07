import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  collectFiles,
  sha256,
  verifyFiles,
  verifyPackage,
  safePath,
} from "./verify-artifact.mjs";

const json = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

function headerFor(name, size) {
  if (!safePath(name)) throw new Error("Cannot package an unsafe path.");
  const header = Buffer.alloc(512);
  let prefix = "";
  let leaf = name;
  if (Buffer.byteLength(leaf) > 100) {
    const splits = [...name.matchAll(/\//gu)]
      .map((match) => match.index)
      .reverse();
    const split = splits.find(
      (at) =>
        Buffer.byteLength(name.slice(0, at)) <= 155 &&
        Buffer.byteLength(name.slice(at + 1)) <= 100,
    );
    if (split === undefined)
      throw new Error("Artifact path exceeds the portable archive limit.");
    prefix = name.slice(0, split);
    leaf = name.slice(split + 1);
  }
  const field = (value, offset, length) => {
    if (Buffer.byteLength(value) > length)
      throw new Error("Archive header field exceeds its limit.");
    header.write(value, offset, length, "utf8");
  };
  const octal = (value, length) =>
    `${value.toString(8).padStart(length - 1, "0")}\0`;
  field(leaf, 0, 100);
  field(octal(0o644, 8), 100, 8);
  field(octal(0, 8), 108, 8);
  field(octal(0, 8), 116, 8);
  field(octal(size, 12), 124, 12);
  field(octal(0, 12), 136, 12);
  header.fill(32, 148, 156);
  header[156] = 48;
  field("ustar\0", 257, 6);
  field("00", 263, 2);
  field(prefix, 345, 155);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  field(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8);
  return header;
}

export function createArchive(files) {
  const blocks = [];
  for (const file of files) {
    blocks.push(headerFor(file.path, file.body.length), file.body);
    const padding = (512 - (file.body.length % 512)) % 512;
    if (padding) blocks.push(Buffer.alloc(padding));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks), { level: 9 });
}

export async function packageRelease({
  dist = "dist",
  out = "release-artifact",
  commit,
  tree,
  tag,
} = {}) {
  if (!/^[a-f\d]{40}$/u.test(commit ?? ""))
    throw new Error("A full reviewed source commit is required.");
  if (!tree)
    tree = execFileSync("git", ["rev-parse", "--verify", `${commit}^{tree}`], {
      encoding: "utf8",
    }).trim();
  if (!/^[a-f\d]{40}$/u.test(tree))
    throw new Error("A full source tree identity is required.");
  const files = await collectFiles(dist);
  const verified = verifyFiles(files, {
    expectedCommit: commit,
    expectedTag: tag,
  });
  tag ??= `v${verified.release.version}`;
  await mkdir(out, { recursive: true });
  if ((await readdir(out)).length)
    throw new Error(
      "Release output must be empty; preserve earlier packages separately.",
    );
  const archive = createArchive(files);
  const archiveName = `homi-atlas-${verified.release.version}-static.tar.gz`;
  const binding = {
    schema: "atlas.release_binding.v1",
    tag,
    version: verified.release.version,
    sourceCommit: commit,
    sourceTree: tree,
    contentSnapshot: verified.release.contentSnapshot,
    artifactTreeSha256: verified.artifactTreeSha256,
    artifactManifestSha256: verified.manifestSha256,
    archive: {
      file: archiveName,
      bytes: archive.length,
      sha256: sha256(archive),
    },
    policy: "one-build-same-bytes-release-and-pages",
  };
  const packageFiles = new Map([
    [archiveName, archive],
    [
      "artifact-manifest.json",
      await readFile(resolve(dist, "artifact-manifest.json")),
    ],
    ["release-binding.json", json(binding)],
  ]);
  for (const [name, body] of packageFiles)
    await writeFile(resolve(out, name), body, { flag: "wx" });
  const sums =
    [...packageFiles]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([name, body]) => `${sha256(body)}  ${name}`)
      .join("\n") + "\n";
  await writeFile(resolve(out, "SHA256SUMS"), sums, { flag: "wx" });
  await verifyPackage(out, { expectedCommit: commit, expectedTag: tag });
  return binding;
}

async function main() {
  const values = {};
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 2) {
    if (
      !["--dist", "--out", "--commit", "--tag"].includes(args[i]) ||
      !args[i + 1]
    )
      throw new Error("Invalid release packaging arguments.");
    values[args[i]] = args[i + 1];
  }
  const dirty = execFileSync(
    "git",
    ["status", "--porcelain", "--untracked-files=normal"],
    { encoding: "utf8" },
  ).trim();
  if (dirty)
    throw new Error("Commit the reviewed source before packaging a release.");
  const current = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  if (values["--commit"] !== current)
    throw new Error("Package the current reviewed checkout only.");
  const result = await packageRelease({
    dist: values["--dist"],
    out: values["--out"],
    commit: values["--commit"],
    tag: values["--tag"],
  });
  console.log(
    JSON.stringify(
      {
        status: "pass",
        tag: result.tag,
        commit: result.sourceCommit,
        artifactTreeSha256: result.artifactTreeSha256,
        archiveSha256: result.archive.sha256,
      },
      null,
      2,
    ),
  );
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
