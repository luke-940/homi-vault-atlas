import { build } from "esbuild";
import { createHash } from "node:crypto";
import { access, cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { subsetPretendardAssets } from "./lib/pretendard-subset.mjs";
import { validatePublicPackShapes } from "./lib/public-shape-validation.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.resolve(process.env.ATLAS_PUBLIC_OUTPUT_DIR ?? path.join(projectDir, "dist-public"));
const defaultDataDir = process.env.GITHUB_ACTIONS === "true"
  ? path.join(projectDir, "public-safe", "data")
  : path.join(projectDir, ".generated", "public", "data");
const dataDir = path.resolve(process.env.ATLAS_PUBLIC_DATA_DIR ?? defaultDataDir);
const stagingDir = path.join(path.dirname(outputDir), `.${path.basename(outputDir)}-staging-${process.pid}`);
const previousDir = path.join(path.dirname(outputDir), `.${path.basename(outputDir)}-previous-${process.pid}`);
const packNames = ["agency", "bootstrap", "inventory", "structure", "relation", "flow", "temporal", "entity", "health", "insight", "publication"];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

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
  await mkdir(path.join(stagingDir, "licenses"), { recursive: true });
  for (const packageName of [...packageNames].sort()) {
    const packageDir = path.join(projectDir, "node_modules", packageName);
    const manifest = JSON.parse(await readFile(path.join(packageDir, "package.json"), "utf8"));
    const licenseName = await licenseFile(packageDir);
    if (!licenseName) throw new Error(`Public build blocked: ${packageName} has no vendorable license file.`);
    const targetName = `${packageName.replace(/^@/, "").replaceAll("/", "-")}-LICENSE.txt`;
    await cp(licenseName, path.join(stagingDir, "licenses", targetName));
    rows.push(`| ${packageName} | ${manifest.version} | ${manifest.license ?? "see license file"} | \`licenses/${targetName}\` |`);
  }
  const spaceGroteskLicense = "space-grotesk-OFL.txt";
  await cp(
    path.join(projectDir, "public", "assets", "fonts", "space-grotesk", "OFL.txt"),
    path.join(stagingDir, "licenses", spaceGroteskLicense),
  );
  rows.push(`| Space Grotesk | 2.0 | OFL-1.1 | \`licenses/${spaceGroteskLicense}\` |`);
  await writeFile(
    path.join(stagingDir, "THIRD_PARTY_NOTICES.md"),
    `# Third-Party Notices\n\nOnly packages present in the deployed browser bundle or deployed font assets are listed.\n\n| Package | Version | License | Text |\n| --- | --- | --- | --- |\n${rows.join("\n")}\n`,
    "utf8",
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

const publication = JSON.parse(await readFile(path.join(dataDir, "publication.json"), "utf8"));
if (publication.profile !== "public" || publication.blockers.length) {
  throw new Error("Public site build blocked by publication receipt.");
}
for (const name of packNames) {
  await access(path.join(dataDir, `${name}.json`));
  await access(path.join(dataDir, `${name}.js`));
}
const publicPacks = Object.fromEntries(await Promise.all(
  packNames.map(async (name) => [name, JSON.parse(await readFile(path.join(dataDir, `${name}.json`), "utf8"))]),
));
const shapeValidation = await validatePublicPackShapes({
  projectDir,
  packs: publicPacks,
  boundary: "build",
});

await rm(stagingDir, { recursive: true, force: true });
await rm(previousDir, { recursive: true, force: true });
await mkdir(stagingDir, { recursive: true });

const buildResult = await build({
  entryPoints: [path.join(projectDir, "src", "main.tsx")],
  bundle: true,
  format: "iife",
  target: ["es2022"],
  outfile: path.join(stagingDir, "app.js"),
  minify: true,
  sourcemap: false,
  metafile: true,
  jsx: "automatic",
  legalComments: "none",
  loader: { ".svg": "dataurl" },
  define: { "process.env.NODE_ENV": '"production"' },
});

const jsBody = await readFile(path.join(stagingDir, "app.js"));
const cssBody = await readFile(path.join(stagingDir, "app.css"));
const jsName = `app.${sha256(jsBody).slice(0, 16)}.js`;
const cssName = `app.${sha256(cssBody).slice(0, 16)}.css`;
await rename(path.join(stagingDir, "app.js"), path.join(stagingDir, jsName));
await rename(path.join(stagingDir, "app.css"), path.join(stagingDir, cssName));

await cp(dataDir, path.join(stagingDir, "data"), { recursive: true });
await cp(path.join(projectDir, "public", "assets"), path.join(stagingDir, "assets"), { recursive: true });

let legalRoot = path.join(projectDir, "publication-template");
try {
  await access(path.join(projectDir, "NOTICE"));
  legalRoot = projectDir;
} catch {
  // The internal production workspace uses the immutable publication template.
}
await cp(path.join(legalRoot, "NOTICE"), path.join(stagingDir, "NOTICE"));

const runtimePackages = new Set(
  Object.keys(buildResult.metafile.inputs)
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
    <meta name="theme-color" content="#f4f3ed" />
    <meta name="description" content="Luke와 전문 에이전트가 함께 축적한 공개 안전 지식 구조, 관계, 흐름, 시간과 책임 경계를 탐색합니다." />
    <meta property="og:title" content="Homi Vault Atlas" />
    <meta property="og:description" content="한 사람의 방향과 전문 에이전트의 책임이 지식 지형으로 이어지는 검증된 버전 스냅샷" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://luke-940.github.io/homi-vault-atlas/" />
    <meta property="og:image" content="https://luke-940.github.io/homi-vault-atlas/assets/brand/og-card.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Homi Vault Atlas" />
    <meta name="twitter:description" content="검증된 지식 지형과 공개 커버리지 경계를 탐색합니다." />
    <meta name="twitter:image" content="https://luke-940.github.io/homi-vault-atlas/assets/brand/og-card.png" />
    <link rel="icon" type="image/svg+xml" sizes="any" href="./assets/brand/homi-favicon.svg" />
    <link rel="icon" type="image/png" sizes="32x32" href="./assets/brand/homi-mark-amber-32.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="./assets/brand/homi-mark-amber-180.png" />
    <link rel="manifest" href="./assets/brand/site.webmanifest" />
    <link rel="stylesheet" href="./assets/fonts/space-grotesk/space-grotesk.css" />
    <link rel="stylesheet" href="./assets/fonts/pretendard/pretendardvariable-dynamic-subset.css" />
    <link rel="stylesheet" href="./${cssName}" />
    <title>Homi Vault Atlas</title>
  </head>
  <body>
    <div id="root"></div>
${scripts}
    <script src="./${jsName}"></script>
  </body>
</html>
`;
await writeFile(path.join(stagingDir, "index.html"), html, "utf8");

const renderedDataTexts = await Promise.all(
  packNames.map((name) => readFile(path.join(dataDir, `${name}.json`), "utf8")),
);
const fontSubset = await subsetPretendardAssets({
  rootDir: stagingDir,
  renderedTexts: [html, jsBody.toString("utf8"), ...renderedDataTexts],
});

const assetManifest = {
  schema: "atlas.public_assets.v1",
  publicSnapshotDigest: publication.publicSnapshotDigest,
  entrypoints: {
    javascript: { path: jsName, bytes: jsBody.length, sha256: sha256(jsBody) },
    stylesheet: { path: cssName, bytes: cssBody.length, sha256: sha256(cssBody) },
  },
  fontSubset,
  unhashedJavaScriptOrCss: [],
};
await writeFile(path.join(stagingDir, "asset-manifest.json"), `${JSON.stringify(assetManifest, null, 2)}\n`, "utf8");

const manifest = await treeManifest(stagingDir);
const outputReceipt = {
  schema: "atlas.public_build.v1",
  publicSnapshotDigest: publication.publicSnapshotDigest,
  files: manifest.length,
  bytes: manifest.reduce((sum, item) => sum + item.bytes, 0),
  javascript: assetManifest.entrypoints.javascript,
  stylesheet: assetManifest.entrypoints.stylesheet,
  fontSubset,
  runtimePackages: [...runtimePackages].sort(),
  runtimeLicenseCount,
  shapeValidation,
};
await writeFile(path.join(stagingDir, "build-receipt.json"), `${JSON.stringify(outputReceipt, null, 2)}\n`, "utf8");

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

const outputStats = await stat(outputDir);
if (!outputStats.isDirectory()) throw new Error("Public site build did not produce a directory.");
console.log(JSON.stringify({ outputDir, ...outputReceipt }, null, 2));
