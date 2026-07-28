import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(projectDir, "src");
const styleDir = path.join(sourceDir, "styles");
const forbiddenRuntimeImports = [
  "@observablehq/plot",
  "d3",
  "d3-force",
  "gray-matter",
  "yaml",
  "zod",
];

async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(absolute));
    else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(absolute);
  }
  return files;
}

const findings = [];
const typedFiles = await sourceFiles(sourceDir);
let productionLines = 0;
for (const file of typedFiles) {
  const body = await readFile(file, "utf8");
  const relative = path.relative(projectDir, file).replaceAll("\\", "/");
  const lines = body.split(/\r?\n/).length;
  productionLines += lines;
  if (lines > 650) findings.push(`${relative}: ${lines} lines exceeds the 650-line module gate`);
  for (const name of forbiddenRuntimeImports) {
    if (body.includes(`from \"${name}\"`) || body.includes(`from '${name}'`)) {
      findings.push(`${relative}: forbidden runtime import ${name}`);
    }
  }
}

const cssFiles = (await readdir(styleDir, { recursive: true }))
  .filter((name) => name.endsWith(".css"))
  .map((name) => path.join(styleDir, name));
const selectorOwners = new Map();
let sourceCssBytes = 0;
for (const file of cssFiles) {
  const body = await readFile(file, "utf8");
  const relative = path.relative(projectDir, file).replaceAll("\\", "/");
  sourceCssBytes += Buffer.byteLength(body);
  productionLines += body.split(/\r?\n/).length;
  if (body.includes("!important")) findings.push(`${relative}: !important is forbidden`);
  if (/(?:^|[^a-z0-9])(?:home-)?v7\d/i.test(body)) findings.push(`${relative}: version-specific selector is forbidden`);
  if (/font-size\s*:\s*(?:[0-9]|1[01])px/.test(body)
    || /font\s*:\s*[^;]*\s(?:[0-9]|1[01])px\//.test(body)) {
    findings.push(`${relative}: required UI text below 12px`);
  }
  // Responsive and state layers intentionally override component selectors;
  // duplicate ownership is forbidden across the component-definition modules.
  if (!/(?:reset|responsive|states)\.css$/.test(relative)) {
    for (const match of body.matchAll(/(?:^|})\s*([^@{}][^{}]*)\{/gm)) {
      for (const selector of match[1].split(",").map((item) => item.trim()).filter(Boolean)) {
        const owners = selectorOwners.get(selector) ?? new Set();
        owners.add(relative);
        selectorOwners.set(selector, owners);
      }
    }
  }
}
for (const [selector, owners] of selectorOwners) {
  if (owners.size > 1) findings.push(`duplicate selector across modules ${selector}: ${[...owners].join(", ")}`);
}
if (sourceCssBytes > 56 * 1024) findings.push(`source CSS ${sourceCssBytes}B exceeds 56KiB`);
if (productionLines > 12_500) findings.push(`production TS/TSX/CSS ${productionLines} lines exceeds 12,500`);

if (findings.length) throw new Error(`Source contract lint failed:\n${findings.join("\n")}`);
console.log(JSON.stringify({
  pass: true,
  checked: typedFiles.length,
  productionLines,
  sourceCssBytes,
  duplicateSelectors: 0,
  forbiddenRuntimeImports,
}, null, 2));
