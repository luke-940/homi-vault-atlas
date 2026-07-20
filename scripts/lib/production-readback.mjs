import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  assertReleaseSourceCommit,
  collectReleaseTree,
  releaseArtifactManifestName,
  sha256,
  verifyReleaseArtifact,
} from "./release-artifact.mjs";

export const productionReadbackSchema = "atlas.production_readback.v1";

function normalizedBaseUrl(value, allowHttp) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("Production readback blocked: the base URL must not contain credentials, a query, or a fragment.");
  }
  if (url.protocol !== "https:" && !(allowHttp && url.protocol === "http:")) {
    throw new Error("Production readback blocked: the production base URL must use HTTPS.");
  }
  if (!url.pathname.endsWith("/")) url.pathname = `${url.pathname}/`;
  return url;
}

function requestUrlFor(baseUrl, relative, sourceCommit) {
  const encodedPath = relative.split("/").map(encodeURIComponent).join("/");
  const url = new URL(encodedPath, baseUrl);
  url.searchParams.set("atlas_readback", sourceCommit);
  return url;
}

async function fetchExact(fetchImpl, url, expected, relative) {
  const response = await fetchImpl(url, {
    cache: "no-store",
    redirect: "follow",
    headers: { "cache-control": "no-cache", pragma: "no-cache" },
  });
  if (!response.ok) throw new Error(`Production readback failed: ${relative} returned HTTP ${response.status}.`);
  const body = Buffer.from(await response.arrayBuffer());
  const actualDigest = sha256(body);
  const expectedDigest = sha256(expected);
  if (!body.equals(expected)) {
    throw new Error(`Production readback failed: ${relative} bytes differ (${actualDigest} != ${expectedDigest}).`);
  }
  return {
    path: relative,
    bytes: body.length,
    sha256: actualDigest,
    requestUrl: url.toString(),
  };
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function writeReceipt(receiptPath, receipt) {
  await mkdir(path.dirname(receiptPath), { recursive: true });
  const body = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  await writeFile(receiptPath, body);
  return { receiptPath, receiptSha256: sha256(body) };
}

async function performReadback({ baseUrl, distDir, sourceCommit, fetchImpl }) {
  const tree = await collectReleaseTree(distDir);
  const exactFiles = tree.files.filter((item) => item.path.endsWith(".json") || item.path.endsWith(".js"));
  for (const required of ["data/agency.json", "data/agency.js", "data/publication.json", "asset-manifest.json", "build-receipt.json"]) {
    if (!exactFiles.some((item) => item.path === required)) {
      throw new Error(`Production readback failed: required exact-byte target ${required} is missing.`);
    }
  }
  const liveFiles = [];
  for (const item of exactFiles) {
    liveFiles.push(await fetchExact(
      fetchImpl,
      requestUrlFor(baseUrl, item.path, sourceCommit),
      item.body,
      item.path,
    ));
  }
  const localIndex = await readFile(path.join(distDir, "index.html"));
  const agencyUrl = new URL(baseUrl);
  agencyUrl.hash = "agency?scene=system";
  const agencyRequestUrl = requestUrlFor(baseUrl, "index.html", sourceCommit);
  const agencyShell = await fetchExact(fetchImpl, agencyRequestUrl, localIndex, "#agency?scene=system shell");
  const livePublicationBody = await readFile(path.join(distDir, "data", "publication.json"));
  const livePublication = JSON.parse(livePublicationBody.toString("utf8"));
  return {
    exactFiles: liveFiles,
    publicSnapshotDigest: livePublication.publicSnapshotDigest,
    agencyRoute: {
      url: agencyUrl.toString(),
      requestUrl: agencyRequestUrl.toString(),
      fragmentBoundary: "Client-side fragment; exact deployed index shell plus agency JSON and JS bytes verified.",
      indexBytes: agencyShell.bytes,
      indexSha256: agencyShell.sha256,
    },
  };
}

export async function runProductionReadback({
  productionUrl,
  distDir,
  releaseArtifactDir,
  receiptPath,
  releaseVersion,
  sourceCommit,
  fetchImpl = globalThis.fetch,
  attempts = 12,
  retryDelayMs = 5_000,
  allowHttp = false,
}) {
  if (typeof fetchImpl !== "function") throw new Error("Production readback blocked: Fetch is unavailable.");
  const commit = assertReleaseSourceCommit(sourceCommit);
  const baseUrl = normalizedBaseUrl(productionUrl, allowHttp);
  if (attempts < 1 || !Number.isInteger(attempts)) throw new Error("Production readback blocked: attempts must be a positive integer.");
  let verifiedArtifact;
  try {
    verifiedArtifact = await verifyReleaseArtifact({
      distDir,
      outputDir: releaseArtifactDir,
      releaseVersion,
      sourceCommit: commit,
    });
  } catch (error) {
    const failedReceipt = {
      schema: productionReadbackSchema,
      verdict: "fail",
      releaseVersion,
      sourceCommit: commit,
      productionUrl: baseUrl.toString(),
      publicSnapshotDigest: null,
      releaseArtifactManifest: {
        path: releaseArtifactManifestName,
        verified: false,
      },
      exactByteBoundary: { extensions: [".json", ".js"], files: [] },
      agencyRoute: { url: new URL("#agency?scene=system", baseUrl).toString() },
      attemptsUsed: 0,
      findings: [error instanceof Error ? error.message : String(error)],
      changedSurfaces: [],
      completedAt: new Date().toISOString(),
    };
    const receiptIdentity = await writeReceipt(receiptPath, failedReceipt);
    throw new Error(`Production readback failed before HTTP comparison; receipt ${receiptIdentity.receiptPath} (${receiptIdentity.receiptSha256}).`);
  }
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const evidence = await performReadback({ baseUrl, distDir, sourceCommit: commit, fetchImpl });
      if (evidence.publicSnapshotDigest !== verifiedArtifact.manifest.publicSnapshotDigest) {
        throw new Error("Production readback failed: public snapshot digest differs from the release artifact manifest.");
      }
      const receipt = {
        schema: productionReadbackSchema,
        verdict: "pass",
        releaseVersion,
        sourceCommit: commit,
        productionUrl: baseUrl.toString(),
        publicSnapshotDigest: evidence.publicSnapshotDigest,
        releaseArtifactManifest: {
          path: releaseArtifactManifestName,
          sha256: verifiedArtifact.manifestSha256,
          treeSha256: verifiedArtifact.manifest.tree.sha256,
          archiveSha256: verifiedArtifact.manifest.archive.sha256,
        },
        exactByteBoundary: {
          extensions: [".json", ".js"],
          files: evidence.exactFiles,
        },
        agencyRoute: evidence.agencyRoute,
        attemptsUsed: attempt,
        findings: [],
        changedSurfaces: [],
        completedAt: new Date().toISOString(),
      };
      const receiptIdentity = await writeReceipt(receiptPath, receipt);
      return { ...receiptIdentity, receipt };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(retryDelayMs);
    }
  }
  const failedReceipt = {
    schema: productionReadbackSchema,
    verdict: "fail",
    releaseVersion,
    sourceCommit: commit,
    productionUrl: baseUrl.toString(),
    publicSnapshotDigest: verifiedArtifact.manifest.publicSnapshotDigest,
    releaseArtifactManifest: {
      path: releaseArtifactManifestName,
      sha256: verifiedArtifact.manifestSha256,
      treeSha256: verifiedArtifact.manifest.tree.sha256,
      archiveSha256: verifiedArtifact.manifest.archive.sha256,
    },
    exactByteBoundary: { extensions: [".json", ".js"], files: [] },
    agencyRoute: { url: new URL("#agency?scene=system", baseUrl).toString() },
    attemptsUsed: attempts,
    findings: [lastError instanceof Error ? lastError.message : String(lastError)],
    changedSurfaces: [],
    completedAt: new Date().toISOString(),
  };
  const receiptIdentity = await writeReceipt(receiptPath, failedReceipt);
  throw new Error(`Production readback failed; receipt ${receiptIdentity.receiptPath} (${receiptIdentity.receiptSha256}).`);
}
