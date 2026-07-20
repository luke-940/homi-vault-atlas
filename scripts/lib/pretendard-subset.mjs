import { createHash } from "node:crypto";
import { readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const fontCssPath = "assets/fonts/pretendard/pretendardvariable-dynamic-subset.css";
const fontDirectoryPath = "assets/fonts/pretendard/woff2-dynamic-subset";
const blockPattern = /\/\*\s*\[(\d+)]\s*\*\/\s*@font-face\s*\{[\s\S]*?\}\s*/g;

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0;

export function collectRenderedCodePoints(texts) {
  const codePoints = new Set();
  for (const text of texts) {
    for (const character of String(text)) codePoints.add(character.codePointAt(0));
  }
  return [...codePoints].filter(Number.isInteger).sort((left, right) => left - right);
}

export function parseUnicodeRanges(value) {
  return String(value)
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => {
      const match = /^U\+([0-9a-f?]+)(?:-([0-9a-f]+))?$/i.exec(token);
      if (!match) throw new Error(`Pretendard subset blocked: unsupported unicode-range token ${JSON.stringify(token)}.`);
      const wildcard = match[1].includes("?");
      const start = Number.parseInt(wildcard ? match[1].replaceAll("?", "0") : match[1], 16);
      const end = Number.parseInt(
        match[2] ?? (wildcard ? match[1].replaceAll("?", "f") : match[1]),
        16,
      );
      return { start, end };
    });
}

export function selectPretendardSubset(cssText, codePoints) {
  const blocks = [...String(cssText).matchAll(blockPattern)].map((match) => {
    const unicodeRange = /unicode-range:\s*([^;]+);/i.exec(match[0])?.[1];
    const source = /url\((?:['"])?\.\/woff2-dynamic-subset\/([^)'"\s]+)(?:['"])?\)/i.exec(match[0])?.[1];
    if (!unicodeRange || !source) {
      throw new Error(`Pretendard subset blocked: malformed @font-face block ${match[1]}.`);
    }
    const ranges = parseUnicodeRanges(unicodeRange);
    const selected = codePoints.some((codePoint) => ranges.some(({ start, end }) => codePoint >= start && codePoint <= end));
    return { index: Number(match[1]), body: match[0].trim(), source, ranges, selected };
  });
  if (!blocks.length) throw new Error("Pretendard subset blocked: no dynamic subset blocks found.");
  const selected = blocks.filter((block) => block.selected);
  if (!selected.length) throw new Error("Pretendard subset blocked: rendered text selected no font assets.");
  const preamble = String(cssText).slice(0, String(cssText).search(blockPattern)).trimEnd();
  const css = `${preamble}\n\n${selected.map((block) => block.body).join("\n\n")}\n`;
  return {
    css,
    originalCount: blocks.length,
    selectedIndices: selected.map((block) => block.index),
    selectedFiles: selected.map((block) => block.source).sort(compareText),
  };
}

export async function subsetPretendardAssets({ rootDir, renderedTexts }) {
  const cssFile = path.join(rootDir, fontCssPath);
  const fontDirectory = path.join(rootDir, fontDirectoryPath);
  const sourceCss = await readFile(cssFile, "utf8");
  const codePoints = collectRenderedCodePoints(renderedTexts);
  const selection = selectPretendardSubset(sourceCss, codePoints);
  const selectedFiles = new Set(selection.selectedFiles);
  const existingFiles = (await readdir(fontDirectory)).filter((name) => name.endsWith(".woff2"));
  for (const file of existingFiles) {
    if (!selectedFiles.has(file)) await rm(path.join(fontDirectory, file));
  }
  await writeFile(cssFile, selection.css, "utf8");
  const remainingFiles = (await readdir(fontDirectory)).filter((name) => name.endsWith(".woff2")).sort(compareText);
  if (remainingFiles.length !== selection.selectedFiles.length
    || remainingFiles.some((file, index) => file !== selection.selectedFiles[index])) {
    throw new Error("Pretendard subset blocked: emitted CSS and font asset inventory disagree.");
  }
  const fontBytes = (await Promise.all(remainingFiles.map(async (file) => (await stat(path.join(fontDirectory, file))).size)))
    .reduce((sum, bytes) => sum + bytes, 0);
  return {
    schema: "atlas.pretendard_subset.v1",
    cssPath: fontCssPath,
    cssSha256: sha256(selection.css),
    renderedCodePoints: codePoints.length,
    originalAssets: selection.originalCount,
    selectedAssets: remainingFiles.length,
    selectedIndices: selection.selectedIndices,
    selectedFiles: remainingFiles,
    fontBytes,
  };
}
