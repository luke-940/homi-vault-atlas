import { build } from "esbuild";
import { access, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.resolve(process.env.ATLAS_PUBLIC_OUTPUT_DIR ?? path.join(projectDir, "dist-public"));
const dataDir = path.resolve(process.env.ATLAS_PUBLIC_DATA_DIR ?? path.join(projectDir, "public-safe", "data"));
const packNames = ["bootstrap", "structure", "relation", "flow", "temporal", "entity", "health", "insight", "publication"];

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
await build({
  entryPoints: [path.join(projectDir, "src", "main.tsx")],
  bundle: true,
  format: "iife",
  target: ["es2022"],
  outfile: path.join(outputDir, "app.js"),
  minify: true,
  sourcemap: false,
  jsx: "automatic",
  legalComments: "external",
  loader: { ".svg": "dataurl" },
  define: { "process.env.NODE_ENV": '"production"' },
});
await cp(dataDir, path.join(outputDir, "data"), { recursive: true });
let legalRoot = path.join(projectDir, "publication-template");
try {
  await access(path.join(projectDir, "NOTICE"));
  legalRoot = projectDir;
} catch {
  // The internal builder uses publication-template; the public repository uses its root.
}
for (const name of ["NOTICE", "THIRD_PARTY_NOTICES.md"]) {
  if (name === "NOTICE") await cp(path.join(legalRoot, name), path.join(outputDir, name));
}
const sourcePackage = JSON.parse(await readFile(path.join(projectDir, "package.json"), "utf8"));
const runtimePackages = new Map();
const pendingPackages = Object.keys(sourcePackage.dependencies ?? {});
await mkdir(path.join(outputDir, "licenses"), { recursive: true });
while (pendingPackages.length) {
  const packageName = pendingPackages.shift();
  if (!packageName || runtimePackages.has(packageName)) continue;
  const packageDir = path.join(projectDir, "node_modules", packageName);
  const packageJson = JSON.parse(await readFile(path.join(packageDir, "package.json"), "utf8"));
  runtimePackages.set(packageName, packageJson);
  pendingPackages.push(...Object.keys(packageJson.dependencies ?? {}));
  const licenseName = (await readdir(packageDir)).find((name) => /^(?:licen[cs]e|copying)(?:\..*)?$/i.test(name));
  if (!licenseName) throw new Error(`Public build blocked: ${packageName} has no vendorable license file.`);
  await cp(
    path.join(packageDir, licenseName),
    path.join(outputDir, "licenses", `${packageName.replace(/^@/, "").replaceAll("/", "-")}-LICENSE.txt`),
  );
}
const thirdPartyTable = [...runtimePackages.entries()]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([name, manifest]) => `| ${name} | ${manifest.version} | ${manifest.license ?? "see license file"} | \`licenses/${name.replace(/^@/, "").replaceAll("/", "-")}-LICENSE.txt\` |`)
  .join("\n");
await writeFile(
  path.join(outputDir, "THIRD_PARTY_NOTICES.md"),
  `# Third-Party Notices\n\nThe public application bundles the following runtime packages and their transitive dependencies.\n\n| Package | Version | License | Text |\n| --- | --- | --- | --- |\n${thirdPartyTable}\n`,
  "utf8",
);
const scripts = packNames.map((name) => `    <script src="./data/${name}.js"></script>`).join("\n");
const html = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#f5f8f5" />
    <meta name="description" content="Homi Vault의 지식 구조와 흐름을 읽는 공개용 Living Insight Gateway" />
    <link rel="icon" href="data:," />
    <title>호미 볼트 아틀라스</title>
    <link rel="stylesheet" href="./app.css" />
  </head>
  <body>
    <div id="root"></div>
${scripts}
    <script src="./app.js"></script>
  </body>
</html>
`;
await writeFile(path.join(outputDir, "index.html"), html, "utf8");
const publication = JSON.parse(await readFile(path.join(dataDir, "publication.json"), "utf8"));
if (publication.profile !== "public" || publication.blockers.length) throw new Error("Public site build blocked by publication receipt.");
console.log(JSON.stringify({ outputDir, profile: publication.profile, snapshot: publication.publicSnapshotDigest, files: packNames.length + 5 + runtimePackages.size, legalRoot, runtimeLicenses: runtimePackages.size }, null, 2));
