import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(projectDir, "src");
const ratchet = JSON.parse(await readFile(
  path.join(projectDir, "docs", "architecture-debt-ratchet.json"),
  "utf8",
));

async function filesUnder(directory, matcher) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(absolute, matcher));
    else if (matcher(entry.name)) files.push(absolute);
  }
  return files;
}

function eraseCommentsAndLiterals(source) {
  let output = "";
  let mode = "code";
  for (let index = 0; index < source.length; index += 1) {
    const current = source[index];
    const next = source[index + 1];
    if (mode === "code") {
      if (current === "/" && next === "/") {
        mode = "line-comment";
        output += "  ";
        index += 1;
      } else if (current === "/" && next === "*") {
        mode = "block-comment";
        output += "  ";
        index += 1;
      } else if (current === "'" || current === "\"" || current === "`") {
        mode = current;
        output += " ";
      } else {
        output += current;
      }
    } else if (mode === "line-comment") {
      if (current === "\n") {
        mode = "code";
        output += "\n";
      } else output += " ";
    } else if (mode === "block-comment") {
      if (current === "*" && next === "/") {
        mode = "code";
        output += "  ";
        index += 1;
      } else output += current === "\n" ? "\n" : " ";
    } else if (current === "\\") {
      output += "  ";
      index += 1;
    } else if (current === mode) {
      mode = "code";
      output += " ";
    } else {
      output += current === "\n" ? "\n" : " ";
    }
  }
  return output;
}

function matchingBrace(source, openIndex) {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function functionStarts(source) {
  const patterns = [
    /\bfunction\s*[A-Za-z0-9_$]*\s*\([^)]*\)\s*\{/g,
    /\b(?:const|let|var)\s+[A-Za-z0-9_$]+\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z0-9_$]+)\s*=>\s*\{/g,
    /^\s*(?!if\b|for\b|while\b|switch\b|catch\b)(?:async\s+)?[A-Za-z_$][A-Za-z0-9_$]*\s*\([^)]*\)\s*\{/gm,
  ];
  const starts = new Set();
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const brace = source.indexOf("{", match.index);
      if (brace >= 0) starts.add(brace);
    }
  }
  return [...starts].sort((left, right) => left - right);
}

function complexityOf(source, openIndex, closeIndex, starts) {
  const body = source.slice(openIndex + 1, closeIndex).split("");
  for (const nestedStart of starts) {
    if (nestedStart <= openIndex || nestedStart >= closeIndex) continue;
    const nestedEnd = matchingBrace(source, nestedStart);
    if (nestedEnd < 0 || nestedEnd > closeIndex) continue;
    for (let index = nestedStart - openIndex - 1; index <= nestedEnd - openIndex - 1; index += 1) {
      body[index] = body[index] === "\n" ? "\n" : " ";
    }
  }
  const ownBody = body.join("");
  const controls = ownBody.match(/\b(?:if|for|while|case|catch)\b/g)?.length ?? 0;
  const logic = ownBody.match(/&&|\|\|/g)?.length ?? 0;
  const ternaries = ownBody.match(/\?(?![?.])/g)?.length ?? 0;
  return 1 + controls + logic + ternaries;
}

function lineAt(source, index) {
  return source.slice(0, index).split("\n").length;
}

const typedFiles = await filesUnder(sourceDir, (name) => /\.(?:ts|tsx)$/.test(name));
const findings = [];
const functionRows = [];
let productionLines = 0;

for (const file of typedFiles) {
  const raw = await readFile(file, "utf8");
  const source = eraseCommentsAndLiterals(raw);
  const relative = path.relative(projectDir, file).replaceAll("\\", "/");
  const lines = raw.split(/\r?\n/).length;
  productionLines += lines;
  if (lines > 650) findings.push(`${relative}: ${lines} lines exceeds 650`);
  const starts = functionStarts(source);
  for (const start of starts) {
    const end = matchingBrace(source, start);
    if (end < 0) continue;
    const complexity = complexityOf(source, start, end, starts);
    const row = { relative, line: lineAt(source, start), complexity };
    functionRows.push(row);
      const debtCeiling = ratchet.ceilings[relative]?.maxFunctionComplexity ?? 18;
      if (complexity > debtCeiling) {
        findings.push(`${relative}:${row.line} complexity ${complexity} exceeds ratchet ${debtCeiling}`);
      } else if (complexity > 18 && !ratchet.ceilings[relative]) {
        findings.push(`${relative}:${row.line} complexity ${complexity} exceeds 18`);
      }
  }
}

if (productionLines > 12_500) {
  findings.push(`production TS/TSX ${productionLines} lines exceeds 12500`);
}

const complexityMass = functionRows.reduce((sum, row) => sum + row.complexity, 0);
const highComplexityMass = functionRows
  .filter((row) => row.complexity >= 10)
  .reduce((sum, row) => sum + row.complexity, 0);
const erosionRatio = complexityMass ? highComplexityMass / complexityMass : 0;
if (erosionRatio > 0.35) {
  findings.push(`high-complexity mass ${(erosionRatio * 100).toFixed(1)}% exceeds 35%`);
}

const homePath = path.join(sourceDir, "app", "Home.tsx");
const homeLines = (await readFile(homePath, "utf8")).split(/\r?\n/).length;
if (homeLines > 120) findings.push(`src/app/Home.tsx: ${homeLines} lines exceeds composition budget 120`);

const analysisPath = path.join(sourceDir, "app", "AnalysisViews.tsx");
const analysisBody = await readFile(analysisPath, "utf8");
if (/\bObserve\b|observe-workbench|ObserveModeSwitch/.test(analysisBody)) {
  findings.push("src/app/AnalysisViews.tsx regained Observe responsibilities");
}

const styleDir = path.join(sourceDir, "styles");
const styleFiles = await filesUnder(styleDir, (name) => name.endsWith(".css"));
for (const file of styleFiles) {
  const body = await readFile(file, "utf8");
  const name = path.basename(file);
  if (name !== "home.css" && /\.(?:home-layout|editorial-rail|map-console|lens-rail|coverage-ledger)\b/.test(body)) {
    findings.push(`${name}: Home selector is owned by home.css`);
  }
  if (name !== "observe.css" && /\.(?:observe-|matrix-panel|pair-lens|relation-workbench|evidence-workbench)\b/.test(body)) {
    findings.push(`${name}: Observe selector is owned by observe.css`);
  }
}

const report = {
  schema: "atlas.architecture_health.v1",
  pass: findings.length === 0,
  productionLines,
  functions: functionRows.length,
  complexityMass,
  highComplexityMass,
  erosionRatio: Number(erosionRatio.toFixed(4)),
  maxComplexity: Math.max(0, ...functionRows.map((row) => row.complexity)),
  debtRatchets: ratchet.ceilings,
  findings,
};

if (findings.length) throw new Error(`Architecture contract failed:\n${findings.join("\n")}`);
console.log(JSON.stringify(report, null, 2));
