import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditPublicFieldContract } from "./public-field-contract.mjs";
import {
  assertPublicAuditBoundary,
  assertPublicAuditBoundaryPreflight,
  resolvePublicAuditBoundary,
} from "./lib/public-audit-boundary.mjs";
import {
  assertRepositorySourceManifestBinding,
  collectRepositorySourceManifest,
} from "./lib/repository-source-manifest.mjs";
import { auditPublicAgencyContract } from "./lib/agency-contract.mjs";
import { auditPublicPackBinding } from "./lib/public-data-wire.mjs";
import { auditPublicSnapshotDigest } from "./lib/public-snapshot-digest.mjs";
import { publicPrivacyPatternIds, scanPrivacyText } from "./lib/privacy-scanner.mjs";
import { V7_3_PUBLIC_BUDGETS } from "./lib/v7-3-budget-policy.mjs";
import { validatePublicPackShapes } from "./lib/public-shape-validation.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.resolve(process.env.ATLAS_PUBLIC_DATA_DIR ?? path.join(projectDir, "public-safe", "data"));
const distDir = path.resolve(process.env.ATLAS_PUBLIC_OUTPUT_DIR ?? path.join(projectDir, "dist-public"));
const auditBoundary = resolvePublicAuditBoundary({ projectDir });
const { artifactDir, auditReceiptName, context: auditContext } = auditBoundary;
const defaultPublicRepoDir = path.basename(projectDir) === "homi-vault-atlas"
  ? projectDir
  : path.join(projectDir, "..", "github", "homi-vault-atlas");
const publicRepoDir = path.resolve(process.env.ATLAS_PUBLIC_REPO_DIR ?? defaultPublicRepoDir);
const publicProfileReceiptPath = path.resolve(
  process.env.ATLAS_PUBLIC_PROFILE_RECEIPT
    ?? path.join(projectDir, "artifacts", "publication", "v7-3-public-profile-projection.json"),
);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const publicPackNames = ["agency", "bootstrap", "structure", "relation", "flow", "temporal", "entity", "health", "insight", "publication"];
const textExtensions = new Set([".css", ".html", ".js", ".json", ".md", ".mjs", ".svg", ".ts", ".tsx", ".txt", ".webmanifest"]);
const trackedTextExtensions = new Set([...textExtensions, ".yml", ".yaml", ".toml"]);

await assertPublicAuditBoundaryPreflight(auditBoundary);
await mkdir(artifactDir, { recursive: true });
await assertPublicAuditBoundary(auditBoundary);

async function filesUnder(root) {
  const output = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) output.push(...await filesUnder(absolute));
    else if (entry.isFile()) output.push(absolute);
  }
  return output;
}

const findings = [];
const manifests = [];
for (const root of [dataDir, distDir]) {
  for (const file of await filesUnder(root)) {
    const body = await readFile(file);
    const relative = path.relative(projectDir, file).replaceAll("\\", "/");
    manifests.push({ path: relative, bytes: body.length, sha256: sha256(body) });
    const extension = path.extname(relative);
    const authoritativeDataJson = extension === ".json"
      && /(?:^|\/)(?:public-safe|dist-public)\/data\//.test(relative);
    const staticReaderText = relative === "dist-public/index.html"
      || relative.endsWith("/assets/brand/site.webmanifest")
      || relative.endsWith("/assets/brand/homi-mark-amber.svg");
    if (authoritativeDataJson || staticReaderText) {
      const text = body.toString("utf8");
      const legalText = relative.includes("/licenses/") || /(?:\.LEGAL\.txt|THIRD_PARTY_NOTICES\.md)$/.test(relative);
      findings.push(...scanPrivacyText(text, { path: relative, legalText }));
    }
  }
}
const repositorySource = await collectRepositorySourceManifest(publicRepoDir);
if (auditContext === "public-ci"
  && repositorySource.sourceManifest.entries.some((entry) => entry.path === "artifacts" || entry.path.startsWith("artifacts/"))) {
  throw new Error("Public audit blocked: public-ci artifacts are included in the Git source manifest.");
}
for (const sourceEntry of repositorySource.sourceManifest.entries) {
    const relativePath = sourceEntry.path;
    const sourceBody = await readFile(path.join(publicRepoDir, relativePath));
    if (sourceBody.length !== sourceEntry.bytes || sha256(sourceBody) !== sourceEntry.sha256) {
      throw new Error(`Public audit blocked: repository source changed while scanning (${relativePath}).`);
    }
    const sourceBasename = path.basename(relativePath);
    const sourceExtension = path.extname(relativePath);
    const trackedText = trackedTextExtensions.has(sourceExtension) || sourceBasename === ".gitignore";
    if (!trackedText || relativePath === "scripts/lib/privacy-scanner.mjs") continue;
    const text = sourceBody.toString("utf8");
    const legalText = relativePath.includes("licenses/") || /(?:\.LEGAL\.txt|THIRD_PARTY_NOTICES\.md)$/.test(relativePath);
    const toolingText = /^(?:\.github|scripts|tests|tests-public)\//.test(relativePath);
    for (const privacyFinding of scanPrivacyText(text, { path: `github/homi-vault-atlas/${relativePath}`, legalText, toolingText })) {
      findings.push({ ...privacyFinding, id: `tracked-${privacyFinding.id}` });
    }
}
const publication = JSON.parse(await readFile(path.join(dataDir, "publication.json"), "utf8"));
const entities = JSON.parse(await readFile(path.join(dataDir, "entity.json"), "utf8"));
const publicPacks = Object.fromEntries(await Promise.all(
  publicPackNames
    .map(async (name) => [name, JSON.parse(await readFile(path.join(dataDir, `${name}.json`), "utf8"))]),
));
const shapeValidation = await validatePublicPackShapes({
  projectDir,
  packs: publicPacks,
  boundary: "audit",
});
findings.push(...auditPublicFieldContract(publicPacks));
findings.push(...auditPublicAgencyContract(publicPacks.agency, {
  knowledgeEntityIds: entities.entities.map((entity) => entity.id),
}));
const snapshotBinding = auditPublicSnapshotDigest(publicPacks);
findings.push(...snapshotBinding.findings);
const dataBindings = [];
for (const name of publicPackNames) {
  const sourceJson = await readFile(path.join(dataDir, `${name}.json`), "utf8");
  const sourceJavaScript = await readFile(path.join(dataDir, `${name}.js`), "utf8");
  const distJson = await readFile(path.join(distDir, "data", `${name}.json`), "utf8");
  const distJavaScript = await readFile(path.join(distDir, "data", `${name}.js`), "utf8");
  const binding = auditPublicPackBinding({ name, jsonText: sourceJson, jsText: sourceJavaScript });
  const distBinding = auditPublicPackBinding({ name, jsonText: distJson, jsText: distJavaScript });
  const sourceDistExact = sourceJson === distJson && sourceJavaScript === distJavaScript;
  dataBindings.push({
    name,
    jsonSha256: binding.jsonSha256,
    jsSha256: binding.jsSha256,
    exactJsonBytesEmbedded: binding.exactJsonBytesEmbedded,
    deepEqual: binding.deepEqual,
    distJsonSha256: distBinding.jsonSha256,
    distJsSha256: distBinding.jsSha256,
    sourceDistExact,
    pass: binding.pass && distBinding.pass && sourceDistExact,
  });
  findings.push(...binding.findings, ...distBinding.findings.map((item) => ({ ...item, path: `dist-public/${item.path}` })));
  if (!sourceDistExact) findings.push({ id: "public-data-dist-stale", path: `dist-public/data/${name}` });
}
let profileProjectionBinding = { required: auditContext === "internal-release", checked: false, pass: auditContext !== "internal-release" };
if (auditContext === "internal-release") {
  try {
    const profileProjection = JSON.parse(await readFile(publicProfileReceiptPath, "utf8"));
    const outputBindingsPass = dataBindings.every((binding) => {
      const expected = profileProjection.outputBindings?.[binding.name];
      return expected?.jsonSha256 === binding.jsonSha256
        && expected?.javascriptSha256 === binding.jsSha256;
    });
    const profilePass = profileProjection.schema === "atlas.public_profile_projection.v1"
      && profileProjection.pass === true
      && profileProjection.publicSnapshotDigest === publication.publicSnapshotDigest
      && profileProjection.publicEntityCount === entities.entities.length
      && JSON.stringify(profileProjection.redactionCounts) === JSON.stringify(publication.redactionCounts)
      && profileProjection.redactionCountsSha256 === sha256(JSON.stringify(publication.redactionCounts))
      && outputBindingsPass;
    profileProjectionBinding = {
      required: true,
      checked: true,
      schema: profileProjection.schema ?? null,
      publicSnapshotDigest: profileProjection.publicSnapshotDigest ?? null,
      publicEntityCount: profileProjection.publicEntityCount ?? null,
      redactionCountsSha256: profileProjection.redactionCountsSha256 ?? null,
      outputBindingsPass,
      pass: profilePass,
    };
    if (!profilePass) findings.push({ id: "public-profile-projection-binding-mismatch", path: "private-profile-projection-receipt" });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    findings.push({ id: "public-profile-projection-receipt-missing", path: "private-profile-projection-receipt" });
  }
}
if (publication.profile !== "public") findings.push({ id: "wrong-profile", path: "public-safe/data/publication.json" });
if (publication.blockers.length) findings.push({ id: "publication-blocker", path: "public-safe/data/publication.json" });
if (entities.entities.length !== 6) findings.push({ id: "public-entity-count-not-six", path: "public-safe/data/entity.json", actual: entities.entities.length });
if (publication.redactionCounts?.publicEntities !== entities.entities.length) {
  findings.push({
    id: "public-entity-redaction-count-mismatch",
    path: "public-safe/data/publication.json",
    expected: entities.entities.length,
    actual: publication.redactionCounts?.publicEntities ?? null,
  });
}
const redactionCountEntries = Object.entries(publication.redactionCounts ?? {});
const redactionCountsValid = redactionCountEntries.length > 0
  && redactionCountEntries.every(([, value]) => Number.isInteger(value) && value >= 0);
if (!redactionCountsValid) {
  findings.push({ id: "public-redaction-counts-invalid", path: "public-safe/data/publication.json" });
}
const allowedPublicHashPaths = new Set(["agency.projectionDigest", "publication.publicSnapshotDigest"]);
const visitPublicHashes = (value, currentPath) => {
  if (typeof value === "string" && /^[a-f0-9]{64}$/.test(value) && !allowedPublicHashPaths.has(currentPath)) {
    findings.push({ id: "public-data-hash-not-allowed", path: currentPath });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((child, index) => visitPublicHashes(child, `${currentPath}[${index}]`));
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) visitPublicHashes(child, currentPath ? `${currentPath}.${key}` : key);
  }
};
for (const [packName, pack] of Object.entries(publicPacks)) visitPublicHashes(pack, packName);
for (const entity of entities.entities) {
  if (!/^doc:pub:[a-f0-9]{18}$/.test(entity.id)) findings.push({ id: "unstable-public-id", path: entity.id });
  if (Object.keys(entity.frontmatter ?? {}).length) findings.push({ id: "frontmatter-not-empty", path: entity.id });
  if (entity.aliases?.length || entity.tags?.length) findings.push({ id: "metadata-not-redacted", path: entity.id });
  if (!["public_aggregate", "public_snapshot_boundary"].includes(entity.sourceRole)) findings.push({ id: "document-level-entity", path: entity.id });
  if (entity.wordCount !== 0) findings.push({ id: "public-word-count-must-be-zero", path: entity.id });
  if (!Number.isInteger(entity.documentCount) || entity.documentCount < 0) findings.push({ id: "public-document-count-invalid", path: entity.id });
  if (entity.ageDays !== null) findings.push({ id: "public-age-days-must-be-null", path: entity.id });
  if (Object.hasOwn(entity, "sha256")) findings.push({ id: "public-entity-hash-not-allowed", path: entity.id });
}
const relation = JSON.parse(await readFile(path.join(dataDir, "relation.json"), "utf8"));
if (Object.keys(relation.neighborhoods ?? {}).length) findings.push({ id: "document-level-relation", path: "public-safe/data/relation.json" });
const flow = JSON.parse(await readFile(path.join(dataDir, "flow.json"), "utf8"));
for (const route of flow.routes ?? []) {
  if ((route.sourceRefs ?? []).length) findings.push({ id: "source-reference-not-redacted", path: route.id });
  for (const station of route.stations ?? []) {
    if (station.entityId && !/^doc:pub:[a-f0-9]{18}$/.test(station.entityId)) {
      findings.push({ id: "internal-station-reference", path: station.id });
    }
  }
}
const assetManifest = JSON.parse(await readFile(path.join(distDir, "asset-manifest.json"), "utf8"));
const appJavaScript = assetManifest.entrypoints?.javascript;
const appStylesheet = assetManifest.entrypoints?.stylesheet;
const javascriptPattern = /^app\.[a-f0-9]{16}\.js$/;
const stylesheetPattern = /^app\.[a-f0-9]{16}\.css$/;
if (!javascriptPattern.test(appJavaScript?.path ?? "")) findings.push({ id: "application-javascript-not-content-hashed", path: appJavaScript?.path ?? "missing" });
if (!stylesheetPattern.test(appStylesheet?.path ?? "")) findings.push({ id: "application-css-not-content-hashed", path: appStylesheet?.path ?? "missing" });
const appJavaScriptBody = appJavaScript?.path ? await readFile(path.join(distDir, appJavaScript.path)) : Buffer.alloc(0);
const appStylesheetBody = appStylesheet?.path ? await readFile(path.join(distDir, appStylesheet.path)) : Buffer.alloc(0);
const appJavaScriptSha256 = sha256(appJavaScriptBody);
const appStylesheetSha256 = sha256(appStylesheetBody);
if (appJavaScript?.bytes !== appJavaScriptBody.length || appJavaScript?.sha256 !== appJavaScriptSha256) {
  findings.push({ id: "application-javascript-manifest-binding-mismatch", path: appJavaScript?.path ?? "missing" });
}
if (appStylesheet?.bytes !== appStylesheetBody.length || appStylesheet?.sha256 !== appStylesheetSha256) {
  findings.push({ id: "application-css-manifest-binding-mismatch", path: appStylesheet?.path ?? "missing" });
}
if (appJavaScript?.path !== `app.${appJavaScriptSha256.slice(0, 16)}.js`) {
  findings.push({ id: "application-javascript-filename-hash-mismatch", path: appJavaScript?.path ?? "missing" });
}
if (appStylesheet?.path !== `app.${appStylesheetSha256.slice(0, 16)}.css`) {
  findings.push({ id: "application-css-filename-hash-mismatch", path: appStylesheet?.path ?? "missing" });
}
if (assetManifest.publicSnapshotDigest !== publication.publicSnapshotDigest) {
  findings.push({ id: "asset-manifest-snapshot-digest-mismatch", path: "dist-public/asset-manifest.json" });
}
if ((assetManifest.unhashedJavaScriptOrCss ?? []).length !== 0) {
  findings.push({ id: "asset-manifest-unhashed-javascript-or-css", path: "dist-public/asset-manifest.json" });
}
const appJavaScriptGzipBytes = gzipSync(appJavaScriptBody, { level: 9 }).length;
if (appJavaScriptBody.length > V7_3_PUBLIC_BUDGETS.applicationJavaScriptRawBytes) findings.push({ id: "application-javascript-raw-budget", path: appJavaScript?.path ?? "missing", actual: appJavaScriptBody.length });
if (appJavaScriptGzipBytes > V7_3_PUBLIC_BUDGETS.applicationJavaScriptGzipBytes) findings.push({ id: "application-javascript-gzip-budget", path: appJavaScript?.path ?? "missing", actual: appJavaScriptGzipBytes });
if (appStylesheetBody.length > V7_3_PUBLIC_BUDGETS.applicationCssRawBytes) findings.push({ id: "application-css-raw-budget", path: appStylesheet?.path ?? "missing", actual: appStylesheetBody.length });
const rootAssets = (await readdir(distDir)).filter((name) => /\.(?:js|css)$/.test(name));
for (const name of rootAssets) {
  if (!javascriptPattern.test(name) && !stylesheetPattern.test(name)) findings.push({ id: "unhashed-root-javascript-or-css", path: `dist-public/${name}` });
}
const declaredRootAssets = [appJavaScript?.path, appStylesheet?.path].filter(Boolean).sort(compareText);
if (JSON.stringify([...rootAssets].sort(compareText)) !== JSON.stringify(declaredRootAssets)) {
  findings.push({ id: "undeclared-root-javascript-or-css", path: "dist-public" });
}
const fontSubset = assetManifest.fontSubset;
const fontCssRelative = fontSubset?.cssPath ?? "assets/fonts/pretendard/pretendardvariable-dynamic-subset.css";
const fontCssBody = await readFile(path.join(distDir, fontCssRelative), "utf8");
const referencedFontFiles = [...fontCssBody.matchAll(/url\((?:['"])?\.\/woff2-dynamic-subset\/([^)'"\s]+)(?:['"])?\)/g)]
  .map((match) => match[1])
  .sort(compareText);
const emittedFontFiles = (await readdir(path.join(distDir, "assets/fonts/pretendard/woff2-dynamic-subset")))
  .filter((name) => name.endsWith(".woff2"))
  .sort(compareText);
if (fontSubset?.schema !== "atlas.pretendard_subset.v1") {
  findings.push({ id: "pretendard-subset-receipt-missing", path: "dist-public/asset-manifest.json" });
} else {
  if (fontSubset.cssSha256 !== sha256(fontCssBody)) findings.push({ id: "pretendard-subset-css-hash-mismatch", path: fontCssRelative });
  if (!Number.isInteger(fontSubset.renderedCodePoints) || fontSubset.renderedCodePoints <= 0) findings.push({ id: "pretendard-subset-codepoints-invalid", path: fontCssRelative });
  if (!Number.isInteger(fontSubset.selectedAssets) || fontSubset.selectedAssets <= 0) findings.push({ id: "pretendard-subset-empty", path: fontCssRelative });
  if (fontSubset.originalAssets !== 92 || fontSubset.selectedAssets >= fontSubset.originalAssets) findings.push({ id: "pretendard-subset-not-reduced", path: fontCssRelative });
  if (JSON.stringify(fontSubset.selectedFiles) !== JSON.stringify(referencedFontFiles)) findings.push({ id: "pretendard-subset-css-inventory-mismatch", path: fontCssRelative });
}
if (JSON.stringify(referencedFontFiles) !== JSON.stringify(emittedFontFiles)) {
  findings.push({ id: "pretendard-subset-emitted-inventory-mismatch", path: "dist-public/assets/fonts/pretendard/woff2-dynamic-subset" });
}
const indexHtml = await readFile(path.join(distDir, "index.html"), "utf8");
if (!indexHtml.includes(`src="./${appJavaScript?.path}"`)) {
  findings.push({ id: "index-javascript-entrypoint-mismatch", path: "dist-public/index.html" });
}
if (!indexHtml.includes(`href="./${appStylesheet?.path}"`)) {
  findings.push({ id: "index-css-entrypoint-mismatch", path: "dist-public/index.html" });
}
for (const brandAsset of [
  "assets/brand/homi-mark-amber.svg",
  "assets/brand/homi-mark-amber-32.png",
  "assets/brand/homi-mark-amber-180.png",
  "assets/brand/homi-mark-amber-192.png",
  "assets/brand/homi-mark-amber-512.png",
]) {
  try {
    await readFile(path.join(distDir, brandAsset));
  } catch (error) {
    if (error?.code === "ENOENT") findings.push({ id: "brand-asset-missing", path: `dist-public/${brandAsset}` });
    else throw error;
  }
}
if (!indexHtml.includes("homi-mark-amber.svg")
  || !indexHtml.includes("homi-mark-amber-32.png")
  || !indexHtml.includes("homi-mark-amber-180.png")) {
  findings.push({ id: "brand-head-contract-mismatch", path: "dist-public/index.html" });
}
const distFiles = await filesUnder(distDir);
const distEntries = await Promise.all(distFiles.map(async (file) => {
  const body = await readFile(file);
  return {
    path: path.relative(distDir, file).replaceAll("\\", "/"),
    bytes: body.length,
    sha256: sha256(body),
  };
}));
distEntries.sort((left, right) => compareText(left.path, right.path));
const distTreeBytes = distEntries.reduce((sum, entry) => sum + entry.bytes, 0);
if (distTreeBytes > V7_3_PUBLIC_BUDGETS.initialTransferBytes) {
  findings.push({ id: "initial-static-transfer-upper-bound-over-3-mib", path: "dist-public", actual: distTreeBytes });
}
const publicBuildReceipt = JSON.parse(await readFile(path.join(distDir, "build-receipt.json"), "utf8"));
const buildInputEntries = distEntries.filter((entry) => entry.path !== "build-receipt.json");
const buildInputBytes = buildInputEntries.reduce((sum, entry) => sum + entry.bytes, 0);
if (publicBuildReceipt.schema !== "atlas.public_build.v1"
  || publicBuildReceipt.publicSnapshotDigest !== publication.publicSnapshotDigest
  || publicBuildReceipt.files !== buildInputEntries.length
  || publicBuildReceipt.bytes !== buildInputBytes
  || JSON.stringify(publicBuildReceipt.javascript) !== JSON.stringify(appJavaScript)
  || JSON.stringify(publicBuildReceipt.stylesheet) !== JSON.stringify(appStylesheet)
  || JSON.stringify(publicBuildReceipt.fontSubset) !== JSON.stringify(fontSubset)) {
  findings.push({ id: "public-build-receipt-binding-mismatch", path: "dist-public/build-receipt.json" });
}
const receipt = {
  schema: "atlas.publication_audit.v1",
  auditContext,
  generatedAt: new Date().toISOString(),
  profile: publication.profile,
  snapshot: publication.publicSnapshotDigest,
  files: manifests.sort((a, b) => compareText(a.path, b.path)),
  trackedSourceFiles: repositorySource.sourceManifest.files,
  repository: {
    target: "luke-940/homi-vault-atlas",
    head: repositorySource.head,
    tree: repositorySource.tree,
    clean: repositorySource.clean,
    sourceManifest: repositorySource.sourceManifest,
  },
  redactionCounts: publication.redactionCounts,
  redactionCountBinding: {
    fields: redactionCountEntries.length,
    sha256: sha256(JSON.stringify(publication.redactionCounts ?? {})),
    allNonNegativeIntegers: redactionCountsValid,
    publicEntitiesMatchesActual: publication.redactionCounts?.publicEntities === entities.entities.length,
  },
  profileProjectionBinding,
  publicEntityBinding: {
    expectedCount: 6,
    actualCount: entities.entities.length,
    perEntityHashesExposed: entities.entities.some((entity) => Object.hasOwn(entity, "sha256")),
  },
  agencyBinding: {
    schema: publicPacks.agency.schema,
    generatedAt: publicPacks.agency.generatedAt ?? null,
    snapshot: publicPacks.agency.snapshot ?? null,
    principal: publicPacks.agency.principal?.id ?? null,
    groups: publicPacks.agency.groups?.length ?? 0,
    actors: publicPacks.agency.actors?.length ?? 0,
    ownershipSurfaces: publicPacks.agency.surfaces?.length ?? 0,
    directionEdges: publicPacks.agency.links?.filter((link) => link.kind === "sets_direction").length ?? 0,
    resultEdges: publicPacks.agency.links?.filter((link) => link.kind === "returns_result").length ?? 0,
    evidenceEdges: publicPacks.agency.links?.filter((link) => link.kind === "returns_evidence").length ?? 0,
    boundaryEdges: publicPacks.agency.links?.filter((link) => link.kind === "coordinates_boundary").length ?? 0,
    transition: publicPacks.agency.transition?.id ?? null,
    projectionDigest: publicPacks.agency.projectionDigest ?? null,
  },
  snapshotBinding,
  shapeValidation,
  assetBinding: {
    javascript: { ...appJavaScript, gzipBytes: appJavaScriptGzipBytes },
    stylesheet: appStylesheet,
    fontSubset,
    emittedFontFiles,
    rootAssets,
    declaredRootAssets,
    distTree: {
      files: distEntries.length,
      bytes: distTreeBytes,
      budgetBytes: V7_3_PUBLIC_BUDGETS.initialTransferBytes,
      manifestSha256: sha256(distEntries.map((entry) => `${entry.path}\0${entry.sha256}\n`).join("")),
    },
  },
  dataBindings,
  privacyPatternIds: publicPrivacyPatternIds,
  findings,
  pass: findings.length === 0,
};
await writeFile(path.join(artifactDir, auditReceiptName), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
const repositoryAfterReceipt = await collectRepositorySourceManifest(publicRepoDir);
assertRepositorySourceManifestBinding(receipt.repository, repositoryAfterReceipt);
if (findings.length) throw new Error(`Public bundle audit failed: ${findings.slice(0, 10).map((item) => `${item.id}:${item.path}`).join(", ")}`);
console.log(JSON.stringify({ pass: true, files: manifests.length, entities: entities.entities.length, snapshot: publication.publicSnapshotDigest }, null, 2));
