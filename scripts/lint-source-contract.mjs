import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(projectDir, "src");
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
for (const file of await sourceFiles(sourceDir)) {
  const body = await readFile(file, "utf8");
  const relative = path.relative(projectDir, file).replaceAll("\\", "/");
  for (const name of forbiddenRuntimeImports) {
    if (body.includes(`from \"${name}\"`) || body.includes(`from '${name}'`)) {
      findings.push(`${relative}: forbidden runtime import ${name}`);
    }
  }
  if (/font-size\s*:\s*(?:[0-9]|1[01])px/.test(body)) {
    findings.push(`${relative}: required UI text below 12px`);
  }
}

if (findings.length) throw new Error(`Source contract lint failed:\n${findings.join("\n")}`);
console.log(JSON.stringify({ pass: true, checked: (await sourceFiles(sourceDir)).length, forbiddenRuntimeImports }, null, 2));
