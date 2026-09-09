import { build } from "esbuild";
import { capturePublicData } from "./build-data.mjs";
import { validateContent } from "./validate-content.mjs";
import { validateSpatial } from "./validate-islands.mjs";
import { cp, mkdir, rm, readFile, writeFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const packageInfo = JSON.parse(await readFile("package.json", "utf8"));
const publicData = await capturePublicData("public/data");
const [approvedContent, approvedEvidence, approvedIslands, approvedMap] =
  ["content", "evidence", "islands", "map"].map(name => publicData.data(`${name}.json`));
const approval = [validateContent(approvedContent, approvedEvidence), validateSpatial(approvedIslands, approvedMap, approvedContent, approvedEvidence)];
if (approval.some(result => !result.valid)) throw new Error("Public data validation failed before build.");
await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await cp("public", "dist", { recursive: true });
await publicData.writeTo("dist/data");
await cp("licenses", "dist/licenses", { recursive: true });
await cp("index.html", "dist/index.html");
await build({
  entryPoints: ["src/main.tsx"],
  plugins: [publicData.plugin()],
  bundle: true,
  format: "esm",
  splitting: true,
  outdir: "dist",
  entryNames: "app",
  chunkNames: "chunks/[name]-[hash]",
  minify: true,
  sourcemap: false,
  jsx: "automatic",
  target: ["es2022"],
  external: ["./fonts/*"],
  define: { "process.env.NODE_ENV": '"production"' },
  legalComments: "external",
});
const esc = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const content = approvedContent;
const evidence = approvedEvidence;
const prose = (s) =>
  esc(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
const reading = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Homi Atlas · 자료 읽기</title><style>@font-face{font-family:Atlas;src:url('./fonts/atlas-sans.woff2');font-weight:100 900;font-display:swap}body{max-width:760px;margin:40px auto;padding:24px;background:#f7f2e6;color:#183839;font:17px/1.85 Atlas,system-ui;word-break:keep-all;overflow-wrap:anywhere}article{border-top:1px solid #c6beaa;padding:32px 0}a{color:#075957}h1,h2{line-height:1.45}blockquote{margin:18px 0;padding:16px 24px;border-left:3px solid #967943;background:#ece6d8;white-space:pre-wrap}small{color:#566965;display:block}.record-note{font-size:13px;color:#566965}img{max-width:100%}</style></head><body><a href="./">세계로 돌아가기</a><h1>Homi Atlas · 자료 읽기</h1><p>${esc(content.introduction)}</p><nav aria-label="프로젝트">${content.nodes
  .filter((n) => ["project", "foundation"].includes(n.kind))
  .map(
    (n) => `<p><a href="#${n.id}">${esc(n.title)}</a> — ${esc(n.summary)}</p>`,
  )
  .join("")}</nav><main>${content.nodes
  .map(
    (n) =>
      `<article id="${n.id}"><small>${esc(n.eyebrow)} · ${esc(n.state)}</small><h2>${esc(n.title)}</h2><p>${esc(n.summary)}</p>${n.paragraphs.map((p) => `<p>${esc(p)}</p>`).join("")}<ul>${n.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul><nav aria-label="관련 이야기">${n.links.map((id) => `<p><a href="#${id}">${esc(content.nodes.find((n) => n.id === id).title)}</a></p>`).join("")}</nav>${evidence.records
        .filter((e) => e.nodeIds.includes(n.id))
        .map(
          (e) =>
            `<p><a href="#${e.id}">근거: ${esc(e.publicationTitle)}</a></p>`,
        )
        .join("")}</article>`,
  )
  .join(
    "",
  )}<h1>선별 원문 읽기</h1>${evidence.records.map((e) => `<article id="${e.id}"><small>${esc(e.evidenceType)} · ${esc(e.basisDate)} 기준</small><h2>${esc(e.publicationTitle)}</h2><p>${esc(e.claim)}</p><p class="record-note">${esc(e.basisNote)}</p><p class="record-note">${esc(e.titleNote)}</p>${e.excerptParagraphs.map((p, i) => `<section><small>${i + 1} / ${esc(p.label)} · 원문 발췌</small><blockquote>${prose(p.text)}</blockquote><small>${esc(p.omissions)}</small></section>`).join("")}${e.editorialExplanation ? `<section><h3>Atlas가 풀어 쓴 설명</h3><p>${esc(e.editorialExplanation.text)}</p><small>원문 인용과 구분한 편집 설명입니다.</small></section>` : ""}<h3>이 자료를 읽을 때 함께 볼 점</h3>${e.limitations.map((p) => `<p class="record-note">${esc(p)}</p>`).join("")}<nav aria-label="연결된 이야기">${e.nodeIds.map((id) => `<p><a href="#${id}">${esc(content.nodes.find((n) => n.id === id).title)}</a></p>`).join("")}</nav></article>`).join("")}</main><footer><a href="./">세계로 돌아가기</a> · Homi Atlas v${packageInfo.version}</footer></body></html>`;
await writeFile("dist/reading.html", reading);
let commit = "local-preview",
  sourceDirty = true;
try {
  commit = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  sourceDirty = Boolean(
    execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], {
      encoding: "utf8",
    }).trim(),
  );
} catch {}
const snapshot = publicData.contentSnapshot;
const publicDataHash = publicData.publicDataSnapshot;
await writeFile(
  "dist/release.json",
  JSON.stringify(
    {
      version: packageInfo.version,
      commit,
      sourceDirty,
      contentSnapshot: snapshot,
      contentBasis: "2026-09-08",
      publicDataSnapshot: publicDataHash,
      builtAt: new Date().toISOString(),
    },
    null,
    2,
  ) + "\n",
);
async function files(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    out.push(...(e.isDirectory() ? await files(p) : [p]));
  }
  return out;
}
await publicData.assertUnchanged();
const manifest = [];
for (const p of (await files("dist")).sort()) {
  const b = await readFile(p);
  manifest.push({
    path: p.slice(5),
    bytes: b.length,
    sha256: createHash("sha256").update(b).digest("hex"),
  });
}
await writeFile(
  "dist/artifact-manifest.json",
  JSON.stringify({ version: 1, files: manifest }, null, 2) + "\n",
);
console.log(
  `Built v${packageInfo.version}: ${manifest.length} files, ${manifest.reduce((s, f) => s + f.bytes, 0)} bytes.`,
);
