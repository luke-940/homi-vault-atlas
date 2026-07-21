import { build } from "esbuild";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { subsetPretendardAssets } from "./lib/pretendard-subset.mjs";
import { validatePublicPackShapes } from "./lib/public-shape-validation.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatedRoot = path.join(projectDir, ".generated");
const dataDir = path.join(generatedRoot, "owner", "data");
const outputDir = path.join(generatedRoot, "owner-site");
const stagingDir = path.join(generatedRoot, `.owner-site-staging-${process.pid}`);
const packNames = [
  "agency", "bootstrap", "inventory", "structure", "relation", "flow",
  "temporal", "entity", "health", "insight", "publication", "activity",
];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function assertExactLocalBoundary(candidate, expected, label) {
  if (path.resolve(candidate) !== path.resolve(expected)
    || !path.resolve(candidate).startsWith(`${generatedRoot}${path.sep}`)) {
    throw new Error(`Owner site build blocked: ${label} escaped the local-only .generated boundary.`);
  }
}

assertExactLocalBoundary(dataDir, path.join(projectDir, ".generated", "owner", "data"), "data input");
assertExactLocalBoundary(outputDir, path.join(projectDir, ".generated", "owner-site"), "site output");
assertExactLocalBoundary(stagingDir, path.join(projectDir, ".generated", `.owner-site-staging-${process.pid}`), "staging output");

const packs = Object.fromEntries(await Promise.all(packNames.map(async (name) => [
  name,
  JSON.parse(await readFile(path.join(dataDir, `${name}.json`), "utf8")),
])));
if (packs.publication.profile !== "owner" || packs.activity.schema !== "atlas.activity.v1") {
  throw new Error("Owner site build blocked: owner publication/activity contract is missing.");
}
await validatePublicPackShapes({ projectDir, packs, boundary: "owner-local-build" });

await rm(stagingDir, { recursive: true, force: true });
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

const scripts = packNames.map((name) => `    <script src="./data/${name}.js"></script>`).join("\n");
const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#f4f3ed" />
    <meta name="robots" content="noindex,nofollow,noarchive" />
    <link rel="icon" type="image/svg+xml" href="./assets/brand/homi-favicon.svg" />
    <link rel="stylesheet" href="./assets/fonts/space-grotesk/space-grotesk.css" />
    <link rel="stylesheet" href="./assets/fonts/pretendard/pretendardvariable-dynamic-subset.css" />
    <link rel="stylesheet" href="./${cssName}" />
    <title>Homi Vault Atlas · Owner</title>
  </head>
  <body>
    <div id="root"></div>
${scripts}
    <script src="./${jsName}"></script>
  </body>
</html>
`;
await writeFile(path.join(stagingDir, "index.html"), html, "utf8");
const renderedDataTexts = await Promise.all(packNames.map((name) => readFile(path.join(dataDir, `${name}.json`), "utf8")));
const fontSubset = await subsetPretendardAssets({
  rootDir: stagingDir,
  renderedTexts: [html, jsBody.toString("utf8"), ...renderedDataTexts],
});
const receipt = {
  schema: "atlas.owner_local_build.v1",
  profile: "owner",
  localOnly: true,
  inputRoot: dataDir,
  outputRoot: outputDir,
  entrypoints: {
    javascript: { path: jsName, bytes: jsBody.length, sha256: sha256(jsBody) },
    stylesheet: { path: cssName, bytes: cssBody.length, sha256: sha256(cssBody) },
  },
  dataPacks: packNames,
  activityAggregates: packs.activity.aggregates.length,
  structureNodes: packs.structure.nodes.length,
  verifiedFlowRoutes: packs.flow.routes.length,
  fontSubset,
  esbuildInputs: Object.keys(buildResult.metafile.inputs).length,
};
await writeFile(path.join(stagingDir, "owner-build-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
await rm(outputDir, { recursive: true, force: true });
await rename(stagingDir, outputDir);
console.log(JSON.stringify(receipt, null, 2));
