import { afterEach, describe, expect, test } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createReleaseArtifact,
  releaseArtifactManifestName,
  verifyReleaseArtifact,
} from "../scripts/lib/release-artifact.mjs";
import { runProductionReadback } from "../scripts/lib/production-readback.mjs";
import { assertNoOwnerPayloadInPublicArtifact } from "../scripts/lib/v7-4-public-artifact-exclusion.mjs";

const releaseVersion = "7.4.0";
const sourceCommit = "1".repeat(40);
const publicSnapshotDigest = "a".repeat(64);
const temporaryRoots: string[] = [];

async function fixtureRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), "atlas-release-contract-"));
  temporaryRoots.push(root);
  const distDir = path.join(root, "dist-public");
  await mkdir(path.join(distDir, "data"), { recursive: true });
  await Promise.all([
    writeFile(path.join(distDir, "index.html"), "<!doctype html><title>Homi Vault Atlas</title>\n"),
    writeFile(path.join(distDir, "app.1234567890abcdef.js"), "globalThis.__ATLAS__ = true;\n"),
    writeFile(path.join(distDir, "data", "agency.json"), "{\"schema\":\"atlas.agency.v1\"}\n"),
    writeFile(path.join(distDir, "data", "agency.js"), "window.__HOMI_ATLAS_V7_PACKS__ = { agency: true };\n"),
    writeFile(path.join(distDir, "data", "publication.json"), `${JSON.stringify({
      schema: "atlas.publication.v1",
      publicSnapshotDigest,
    })}\n`),
    writeFile(path.join(distDir, "asset-manifest.json"), `${JSON.stringify({
      schema: "atlas.public_assets.v1",
      publicSnapshotDigest,
    })}\n`),
    writeFile(path.join(distDir, "build-receipt.json"), `${JSON.stringify({
      schema: "atlas.public_build.v1",
      publicSnapshotDigest,
    })}\n`),
  ]);
  return { root, distDir };
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("release delivery contract", () => {
  test("the static release archive is deterministic, normalized, commit-bound, and self-verifying", async () => {
    const { root, distDir } = await fixtureRoot();
    const firstOutput = path.join(root, "release-a");
    const secondOutput = path.join(root, "release-b");
    const first = await createReleaseArtifact({ distDir, outputDir: firstOutput, releaseVersion, sourceCommit });
    const second = await createReleaseArtifact({ distDir, outputDir: secondOutput, releaseVersion, sourceCommit });

    const firstArchive = await readFile(path.join(firstOutput, first.manifest.archive.path));
    const secondArchive = await readFile(path.join(secondOutput, second.manifest.archive.path));
    expect(firstArchive.equals(secondArchive)).toBe(true);
    expect(first.manifest).toMatchObject({
      schema: "atlas.release_artifact.v1",
      releaseVersion,
      sourceCommit,
      publicSnapshotDigest,
      archive: {
        normalization: { format: "ustar+gzip", fileMode: "0644", uid: 0, gid: 0, mtime: 0 },
      },
    });
    await expect(verifyReleaseArtifact({
      distDir,
      outputDir: firstOutput,
      releaseVersion,
      sourceCommit,
    })).resolves.toMatchObject({ verdict: "pass" });
    expect(await readFile(path.join(firstOutput, "SHA256SUMS"), "utf8")).toContain(releaseArtifactManifestName);

    await writeFile(path.join(distDir, "data", "agency.json"), "{\"tampered\":true}\n");
    await expect(verifyReleaseArtifact({
      distDir,
      outputDir: firstOutput,
      releaseVersion,
      sourceCommit,
    })).rejects.toThrow(/dist-to-manifest inventory differs/);
  });

  test("production readback compares every JSON and JS byte and records the Agency route boundary", async () => {
    const { root, distDir } = await fixtureRoot();
    const releaseArtifactDir = path.join(root, "release");
    const receiptPath = path.join(root, "readback", "receipt.json");
    await createReleaseArtifact({ distDir, outputDir: releaseArtifactDir, releaseVersion, sourceCommit });
    const productionUrl = "https://luke-940.github.io/homi-vault-atlas/";
    const fetchImpl = async (input: string | URL | Request) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
      const relative = decodeURIComponent(url.pathname.slice("/homi-vault-atlas/".length)) || "index.html";
      try {
        return new Response(await readFile(path.join(distDir, relative)), { status: 200 });
      } catch {
        return new Response("missing", { status: 404 });
      }
    };

    const result = await runProductionReadback({
      productionUrl,
      distDir,
      releaseArtifactDir,
      receiptPath,
      releaseVersion,
      sourceCommit,
      fetchImpl,
      attempts: 1,
      retryDelayMs: 0,
    });
    expect(result.receipt).toMatchObject({
      verdict: "pass",
      sourceCommit,
      publicSnapshotDigest,
      agencyRoute: { url: `${productionUrl}#agency?scene=system` },
    });
    expect(result.receipt.exactByteBoundary.files.map((item: { path: string }) => item.path)).toEqual(expect.arrayContaining([
      "app.1234567890abcdef.js",
      "asset-manifest.json",
      "build-receipt.json",
      "data/agency.js",
      "data/agency.json",
      "data/publication.json",
    ]));

    const failedReceiptPath = path.join(root, "readback", "failed.json");
    const tamperedFetch = async (input: string | URL | Request) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
      if (url.pathname.endsWith("/data/agency.js")) return new Response("tampered", { status: 200 });
      return fetchImpl(input);
    };
    await expect(runProductionReadback({
      productionUrl,
      distDir,
      releaseArtifactDir,
      receiptPath: failedReceiptPath,
      releaseVersion,
      sourceCommit,
      fetchImpl: tamperedFetch,
      attempts: 1,
      retryDelayMs: 0,
    })).rejects.toThrow(/Production readback failed/);
    expect(JSON.parse(await readFile(failedReceiptPath, "utf8"))).toMatchObject({ verdict: "fail", sourceCommit });
  });

  test("the web manifest resolves launch and scope to the GitHub Pages repository root", async () => {
    const manifest = JSON.parse(await readFile(path.resolve("public/assets/brand/site.webmanifest"), "utf8"));
    const manifestUrl = new URL("https://luke-940.github.io/homi-vault-atlas/assets/brand/site.webmanifest");
    expect(new URL(manifest.start_url, manifestUrl).toString()).toBe("https://luke-940.github.io/homi-vault-atlas/#home");
    expect(new URL(manifest.scope, manifestUrl).toString()).toBe("https://luke-940.github.io/homi-vault-atlas/");
  });

  test("allows shared reader capability literals while blocking actual owner data payloads", async () => {
    const { distDir } = await fixtureRoot();
    await writeFile(
      path.join(distDir, "app.shared.js"),
      'const supportedProfiles = ["atlas-public", "atlas-owner"]; const optionalSchema = "atlas.activity.v1";\n',
    );
    await expect(assertNoOwnerPayloadInPublicArtifact({ distDir })).resolves.toMatchObject({ pass: true, findings: [] });

    await writeFile(path.join(distDir, "data", "activity.json"), '{"schema":"atlas.activity.v1","profile":"atlas-owner"}\n');
    await expect(assertNoOwnerPayloadInPublicArtifact({ distDir })).rejects.toThrow(/owner-activity-file/);
    await rm(path.join(distDir, "data", "activity.json"));

    await writeFile(path.join(distDir, "data", "leak.js"), 'window.DATA={"profile":"owner","nameMode":"owner_name"};\n');
    await expect(assertNoOwnerPayloadInPublicArtifact({ distDir })).rejects.toThrow(/owner-profile/);
  });
});
