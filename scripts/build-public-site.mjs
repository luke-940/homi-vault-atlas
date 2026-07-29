import { transform as transformCss } from "lightningcss";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import {
  access,
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSemanticSpaceEntrypoints } from "./lib/semantic-space-build.mjs";
import { stableJson } from "./lib/data-model.mjs";
import { verifyAtlasGraphV2 } from "./lib/atlas-graph-v2.mjs";
import { subsetPretendardAssets } from "./lib/pretendard-subset.mjs";
import {
  auditKnowledgeArtifacts,
  validateKnowledgeIndex,
  validatePublicationV3,
} from "./lib/knowledge-pack-contract.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildProfile = process.env.ATLAS_BUILD_PROFILE === "owner" ? "owner" : "public";
const gate1Slice = process.env.ATLAS_GATE1_SLICE === "true";
const reviewCandidate = process.env.ATLAS_REVIEW_CANDIDATE === "true";
const outputDir = path.resolve(process.env.ATLAS_PUBLIC_OUTPUT_DIR
  ?? path.join(projectDir, buildProfile === "owner" ? ".generated/owner-site" : "dist-public"));
const dataDir = path.resolve(process.env.ATLAS_PUBLIC_DATA_DIR
  ?? (buildProfile === "public" && process.env.GITHUB_ACTIONS === "true"
    ? path.join(projectDir, "public-safe", "data")
    : path.join(projectDir, ".generated", "profiles", buildProfile, "data")));
const stagingDir = path.join(path.dirname(outputDir), `.${path.basename(outputDir)}-staging-${process.pid}`);
const previousDir = path.join(path.dirname(outputDir), `.${path.basename(outputDir)}-previous-${process.pid}`);
const packNames = ["agency", "inventory", "graph", "meaning", "knowledge", "publication"];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

if (gate1Slice && (buildProfile !== "public" || path.basename(outputDir) !== "dist-gate1")) {
  throw new Error("Gate 1 vertical-slice build is non-release and may only write the public dist-gate1 directory.");
}
if (reviewCandidate
  && (gate1Slice || buildProfile !== "public" || path.basename(outputDir) !== "dist-gate2")) {
  throw new Error("Gate 2 review candidate may only write the public dist-gate2 directory.");
}

function validatePacks(packs, packBodies) {
  const failures = [];
  if (verifyAtlasGraphV2(packs.graph).length) failures.push("graph-v2");
  if (packs.graph.profile !== `atlas-${buildProfile}`) failures.push("graph-profile");
  if (packs.inventory?.schema !== "atlas.inventory.v1"
    || packs.inventory.profile !== `atlas-${buildProfile}`
    || packs.inventory.unclassifiedCount !== 0
    || packs.inventory.reconciliation?.pass !== true) failures.push("inventory");
  if (packs.agency?.schema !== "atlas.agency.v1") failures.push("agency");
  if (packs.meaning?.schema !== "atlas.meaning.v2"
    || packs.meaning.manifest?.graphProjectionDigest !== packs.graph.manifest.projectionDigest) {
    failures.push("meaning");
  }
  failures.push(...validateKnowledgeIndex(packs.knowledge, packs.graph, {
    gate1: gate1Slice,
    reviewCandidate,
  }).map((failure) => `knowledge-${failure}`));
  failures.push(...validatePublicationV3(packs.publication, packs, {
    gate1: gate1Slice,
    reviewCandidate,
  }).map((failure) => `publication-${failure}`));
  if (packs.publication?.profile !== buildProfile) failures.push("publication-profile");
  for (const name of ["agency", "inventory", "graph", "meaning", "knowledge"]) {
    if (packs.publication?.packDigests?.[name] !== sha256(packBodies[name])) {
      failures.push(`publication-pack-digest-${name}`);
    }
  }
  const expectedDigest = sha256(stableJson({
    agency: packs.agency,
    graph: packs.graph,
    inventory: packs.inventory,
    meaning: packs.meaning,
    knowledge: packs.knowledge,
  }));
  if (packs.publication.publicSnapshotDigest !== expectedDigest) failures.push("snapshot-digest");
  if (failures.length) throw new Error(`${buildProfile} build blocked: ${failures.join(", ")}.`);
  return {
    schema: "atlas.public_pack_shape_validation.v3",
    gate1Slice,
    reviewCandidate,
    releaseEligible: packs.publication.releaseEligible,
    failures: 0,
    pass: true,
  };
}

function packageNameFromInput(inputPath) {
  const normalized = inputPath.replaceAll("\\", "/");
  const marker = "/node_modules/";
  const index = normalized.lastIndexOf(marker);
  const packagePath = index >= 0
    ? normalized.slice(index + marker.length)
    : normalized.startsWith("node_modules/")
      ? normalized.slice("node_modules/".length)
      : null;
  if (!packagePath) return null;
  const segments = packagePath.split("/");
  return segments[0]?.startsWith("@") ? `${segments[0]}/${segments[1]}` : segments[0];
}

async function licenseFile(packageDir) {
  for (const directory of [packageDir, path.join(packageDir, "dist")]) {
    try {
      const name = (await readdir(directory)).find((entry) => /^(?:licen[cs]e|copying)(?:\..*)?$/i.test(entry));
      if (name) return path.join(directory, name);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return null;
}

async function installRuntimeNotices(packageNames) {
  const rows = [];
  const licenseRoot = path.join(stagingDir, "licenses");
  await mkdir(licenseRoot, { recursive: true });
  for (const packageName of [...packageNames].sort()) {
    const packageDir = path.join(projectDir, "node_modules", packageName);
    const manifest = JSON.parse(await readFile(path.join(packageDir, "package.json"), "utf8"));
    const licenseName = await licenseFile(packageDir);
    if (!licenseName) throw new Error(`${buildProfile} build blocked: ${packageName} license is unavailable.`);
    const targetName = `${packageName.replace(/^@/, "").replaceAll("/", "-")}-LICENSE.txt`;
    await cp(licenseName, path.join(licenseRoot, targetName));
    rows.push(`| ${packageName} | ${manifest.version} | ${manifest.license ?? "see file"} | \`licenses/${targetName}\` |`);
  }
  await cp(
    path.join(projectDir, "public", "assets", "fonts", "space-grotesk", "OFL.txt"),
    path.join(licenseRoot, "space-grotesk-OFL.txt"),
  );
  rows.push("| Space Grotesk | 2.0 | OFL-1.1 | `licenses/space-grotesk-OFL.txt` |");
  await writeFile(
    path.join(stagingDir, "THIRD_PARTY_NOTICES.md"),
    `# Third-Party Notices\n\nOnly deployed runtime packages and fonts are listed.\n\n| Package | Version | License | Text |\n| --- | --- | --- | --- |\n${rows.join("\n")}\n`,
  );
  return rows.length;
}

async function treeManifest(root, current = root) {
  const rows = [];
  for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) rows.push(...await treeManifest(root, absolute));
    else if (entry.isFile()) {
      const body = await readFile(absolute);
      rows.push({
        path: path.relative(root, absolute).replaceAll("\\", "/"),
        bytes: body.length,
        sha256: sha256(body),
      });
    }
  }
  return rows;
}

async function jsonTextsUnder(root, current = root) {
  const rows = [];
  for (const entry of (await readdir(current, { withFileTypes: true }))
    .sort((left, right) => left.name.localeCompare(right.name, "en"))) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) rows.push(...await jsonTextsUnder(root, absolute));
    else if (entry.isFile() && entry.name.endsWith(".json")) rows.push(await readFile(absolute, "utf8"));
  }
  return rows;
}

const packBodies = Object.fromEntries(await Promise.all(packNames.map(async (name) => [
  name,
  await readFile(path.join(dataDir, `${name}.json`), "utf8"),
])));
const packs = Object.fromEntries(packNames.map((name) => [name, JSON.parse(packBodies[name])]));
const shapeValidation = validatePacks(packs, packBodies);
const knowledgeArtifactAudit = await auditKnowledgeArtifacts(dataDir, packs.knowledge, {
  scanPublic: buildProfile === "public",
  graph: packs.graph,
});
if (!knowledgeArtifactAudit.pass) {
  throw new Error(`${buildProfile} build blocked: knowledge artifacts ${
    knowledgeArtifactAudit.findings.map((item) => `${item.id}:${item.path}`).join(", ")
  }.`);
}
if (Buffer.byteLength(packBodies.knowledge) > 220 * 1024) {
  throw new Error(`${buildProfile} build blocked: knowledge index exceeds 220KiB.`);
}
for (const name of packNames) {
  await access(path.join(dataDir, `${name}.json`));
  await access(path.join(dataDir, `${name}.js`));
}

await rm(stagingDir, { recursive: true, force: true });
await rm(previousDir, { recursive: true, force: true });
await mkdir(stagingDir, { recursive: true });

const {
  applicationBuild,
  semanticBuild,
  semanticBody,
  semanticEntrypoint,
} = await buildSemanticSpaceEntrypoints({ projectDir, stagingDir });
const rawJs = await readFile(path.join(stagingDir, "app.js"));
const cssSource = await readFile(path.join(stagingDir, "app.css"));
const css = Buffer.from(transformCss({
  filename: "app.css",
  code: cssSource,
  minify: true,
  sourceMap: false,
}).code);
if (css.length > 48 * 1024) {
  throw new Error(`${buildProfile} build blocked: CSS ${css.length}B exceeds the 48KiB hard gate.`);
}
const shellGzip = gzipSync(rawJs, { level: 9 }).length;
const semanticGzip = gzipSync(semanticBody, { level: 9 }).length;
if (shellGzip > 180 * 1024) throw new Error(`${buildProfile} build blocked: shell ${shellGzip}B gzip exceeds 180KiB.`);
if (semanticGzip > 240 * 1024) throw new Error(`${buildProfile} build blocked: semantic space ${semanticGzip}B gzip exceeds 240KiB.`);
if (shellGzip + semanticGzip > 400 * 1024) {
  throw new Error(`${buildProfile} build blocked: executable JS ${shellGzip + semanticGzip}B gzip exceeds 400KiB.`);
}
await writeFile(path.join(stagingDir, "app.js"), rawJs);
await writeFile(path.join(stagingDir, "app.css"), css);
const jsName = `app.${sha256(rawJs).slice(0, 16)}.js`;
const cssName = `app.${sha256(css).slice(0, 16)}.css`;
await rename(path.join(stagingDir, "app.js"), path.join(stagingDir, jsName));
await rename(path.join(stagingDir, "app.css"), path.join(stagingDir, cssName));

await cp(dataDir, path.join(stagingDir, "data"), { recursive: true });
await cp(path.join(projectDir, "public", "assets"), path.join(stagingDir, "assets"), { recursive: true });
await cp(path.join(projectDir, "NOTICE"), path.join(stagingDir, "NOTICE"));

const runtimePackages = new Set(
  [...Object.keys(applicationBuild.metafile.inputs), ...Object.keys(semanticBuild.metafile.inputs)]
    .map(packageNameFromInput)
    .filter(Boolean),
);
runtimePackages.add("pretendard");
const runtimeLicenseCount = await installRuntimeNotices(runtimePackages);
const scripts = packNames.map((name) => `    <script src="./data/${name}.js"></script>`).join("\n");
const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#0b090d" />
    <meta name="description" content="MOC·Papers·Signals·Rocket·Groot·Intelligence Layer가 실제 방향 관계로 이어지는 Homi Vault의 지식 지형입니다." />
    ${buildProfile === "owner" ? '<meta name="robots" content="noindex,nofollow,noarchive" />' : ""}
    <meta property="og:title" content="Homi Vault Atlas" />
    <meta property="og:description" content="실제 이름과 방향 관계로 탐색하는 Homi의 Open Knowledge Cosmos" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://luke-940.github.io/homi-vault-atlas/" />
    <meta property="og:image" content="https://luke-940.github.io/homi-vault-atlas/assets/brand/og-card.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Homi Vault Atlas" />
    <meta name="twitter:description" content="실제 방향 관계로 탐색하는 공개 안전 지식 지형" />
    <link rel="icon" type="image/svg+xml" href="./assets/brand/homi-favicon.svg" />
    <link rel="apple-touch-icon" sizes="180x180" href="./assets/brand/homi-mark-amber-180.png" />
    <link rel="manifest" href="./assets/brand/site.webmanifest" />
    <link rel="stylesheet" href="./assets/fonts/space-grotesk/space-grotesk.css" />
    <link rel="stylesheet" href="./assets/fonts/pretendard/pretendardvariable-dynamic-subset.css" />
    <link rel="stylesheet" href="./${cssName}" />
    <title>Homi Vault Atlas${buildProfile === "owner" ? " · Owner" : ""}</title>
  </head>
  <body>
    <div id="root"></div>
${scripts}
    <script src="./${jsName}"></script>
  </body>
</html>
`;
await writeFile(path.join(stagingDir, "index.html"), html);
const renderedDataTexts = await Promise.all(packNames.map((name) => (
  readFile(path.join(dataDir, `${name}.json`), "utf8")
)));
const renderedKnowledgeTexts = await jsonTextsUnder(dataDir);
const fontSubset = await subsetPretendardAssets({
  rootDir: stagingDir,
  renderedTexts: [
    html,
    rawJs.toString("utf8"),
    semanticBody.toString("utf8"),
    ...renderedDataTexts,
    ...renderedKnowledgeTexts,
  ],
});

const assetManifest = {
  schema: `atlas.${buildProfile}_assets.v3`,
  profile: buildProfile,
  publicSnapshotDigest: packs.publication.publicSnapshotDigest,
  entrypoints: {
    javascript: {
      path: jsName,
      bytes: rawJs.length,
      gzipBytes: shellGzip,
      sha256: sha256(rawJs),
    },
    semanticSpace: {
      ...semanticEntrypoint,
      gzipBytes: semanticGzip,
    },
    stylesheet: {
      path: cssName,
      bytes: css.length,
      gzipBytes: gzipSync(css, { level: 9 }).length,
      sha256: sha256(css),
    },
  },
  runtimeClassAliases: 0,
  unhashedJavaScriptOrCss: [],
  knowledge: {
    index: {
      path: "data/knowledge.json",
      bytes: Buffer.byteLength(packBodies.knowledge),
      sha256: sha256(packBodies.knowledge),
    },
    shards: knowledgeArtifactAudit.shardPairs.map((item) => ({
      jsonPath: `data/${item.jsonPath}`,
      javascriptPath: `data/${item.javascriptPath}`,
      jsonBytes: item.jsonBytes,
      jsonSha256: item.jsonSha256,
      javascriptSha256: item.javascriptSha256,
    })),
    search: knowledgeArtifactAudit.searchPairs.map((item) => ({
      jsonPath: `data/${item.jsonPath}`,
      javascriptPath: `data/${item.javascriptPath}`,
      jsonBytes: item.jsonBytes,
      jsonSha256: item.jsonSha256,
      javascriptSha256: item.javascriptSha256,
    }))[0] ?? null,
    initialBodies: 0,
  },
};
await writeFile(path.join(stagingDir, "asset-manifest.json"), `${JSON.stringify(assetManifest, null, 2)}\n`);
const manifest = await treeManifest(stagingDir);
const artifactBytesBeforeReceipt = manifest.reduce((sum, item) => sum + item.bytes, 0);
if (artifactBytesBeforeReceipt > 15 * 1024 * 1024) {
  throw new Error(`${buildProfile} build blocked: public artifact ${artifactBytesBeforeReceipt}B exceeds 15MiB.`);
}
const initialRaw = rawJs.length + css.length + Buffer.byteLength(html)
  + (await Promise.all(packNames.map((name) => stat(path.join(dataDir, `${name}.js`))))).reduce((sum, item) => sum + item.size, 0);
if (initialRaw > 3 * 1024 * 1024) {
  throw new Error(`${buildProfile} build blocked: initial transfer ${initialRaw}B exceeds 3MiB.`);
}
const outputReceipt = {
  schema: `atlas.${buildProfile}_build.v3`,
  profile: buildProfile,
  publicSnapshotDigest: packs.publication.publicSnapshotDigest,
  files: manifest.length,
  bytes: manifest.reduce((sum, item) => sum + item.bytes, 0),
  initialRawBytes: initialRaw,
  javascript: assetManifest.entrypoints.javascript,
  semanticSpace: assetManifest.entrypoints.semanticSpace,
  stylesheet: assetManifest.entrypoints.stylesheet,
  runtimePackages: [...runtimePackages].sort(),
  runtimeLicenseCount,
  fontSubset,
  shapeValidation,
  knowledge: {
    dossierCount: packs.knowledge.manifest.dossierCount,
    documentCount: packs.knowledge.manifest.documentCount,
    shardCount: knowledgeArtifactAudit.shardPairs.length,
    searchIndexCount: knowledgeArtifactAudit.searchPairs.length,
    releaseEligible: packs.knowledge.releaseEligible,
    initialBodies: 0,
    artifactBytesBeforeReceipt,
  },
  gate1Slice,
  reviewCandidate,
  residualRisks: gate1Slice
    ? ["knowledge-workbench chunk split pending Gate 2"]
    : reviewCandidate
      ? ["Gate 2 domain-review candidate is not release eligible."]
      : [],
};
await writeFile(path.join(stagingDir, "build-receipt.json"), `${JSON.stringify(outputReceipt, null, 2)}\n`);
const finalArtifact = await treeManifest(stagingDir);
const finalArtifactBytes = finalArtifact.reduce((sum, item) => sum + item.bytes, 0);
if (finalArtifactBytes > 15 * 1024 * 1024) {
  throw new Error(`${buildProfile} build blocked: final public artifact ${finalArtifactBytes}B exceeds 15MiB.`);
}

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
console.log(JSON.stringify({ outputDir, ...outputReceipt }, null, 2));
