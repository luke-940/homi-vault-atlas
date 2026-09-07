import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  readFile,
  writeFile,
  mkdir,
  mkdtemp,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { createArchive, packageRelease } from "../scripts/package-release.mjs";
import {
  verifyFiles,
  verifyDist,
  verifyPackage,
  verifyProduction,
  unpackArchive,
} from "../scripts/verify-artifact.mjs";

const COMMIT = "a".repeat(40);
const TREE = "b".repeat(40);
const TAG = "v8.0.0";
const BASE = "https://luke-940.github.io/homi-vault-atlas/";
const contentBytes = await readFile(
  new URL("../public/data/content.json", import.meta.url),
);
const evidenceBytes = await readFile(
  new URL("../public/data/evidence.json", import.meta.url),
);
const content = JSON.parse(contentBytes);
const evidence = JSON.parse(evidenceBytes);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (value) => Buffer.from(JSON.stringify(value));
const escape = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const paragraph = (value) => `<p>${escape(value)}</p>`;

// A deliberately unstyled reader fixture: the contract is visible meaning and
// quote boundaries, independently of the product's layout and HTML generator.
function reader() {
  const nodes = content.nodes.map(
    (node) => `<article id="${node.id}">
    ${[node.title, node.state, node.summary, ...node.paragraphs, ...node.points].map(paragraph).join("")}
    ${evidence.records
      .filter((record) => record.nodeIds.includes(node.id))
      .map((record) => `<a href="#${record.id}">근거</a>`)
      .join("")}
  </article>`,
  );
  const records = evidence.records.map(
    (record) => `<article id="${record.id}">
    ${[record.publicationTitle, record.claim, record.evidenceType, record.basisDate, record.basisNote, record.titleNote, ...record.limitations].map(paragraph).join("")}
    ${record.excerptParagraphs.map((excerpt) => `${paragraph(excerpt.label)}<blockquote>${escape(excerpt.text.replace(/\*\*([^*]+)\*\*/gu, "$1").replace(/`([^`]+)`/gu, "$1"))}</blockquote>${paragraph(excerpt.omissions)}`).join("")}
    ${record.editorialExplanation ? `${paragraph(record.editorialExplanation.text)}<p>풀어 쓴 설명 · 원문 인용과 구분</p>` : ""}
  </article>`,
  );
  return Buffer.from(
    `<!doctype html><html lang="ko"><body>${nodes.join("")}${records.join("")}</body></html>`,
  );
}

function fixture() {
  return new Map([
    [
      "index.html",
      Buffer.from(
        '<!doctype html><html lang="ko"><body>Homi Atlas</body></html>',
      ),
    ],
    ["reading.html", reader()],
    ["app.js", Buffer.from("export const ready = true;")],
    ["app.css", Buffer.from("body{color:#183839}")],
    ["data/content.json", Buffer.from(contentBytes)],
    ["data/evidence.json", Buffer.from(evidenceBytes)],
    [
      "release.json",
      json({
        version: "8.0.0",
        commit: COMMIT,
        sourceDirty: false,
        contentSnapshot: createHash("sha256")
          .update(contentBytes)
          .update(evidenceBytes)
          .digest("hex"),
        contentBasis: "2026-09-07",
      }),
    ],
    [
      "licenses/fonts-NOTICE.md",
      Buffer.from("# Font attribution\nRequired legal notice.\n"),
    ],
    [
      "licenses/fixture-LICENSE.txt",
      Buffer.from("Copyright notice retained.\n"),
    ],
    ["chunks/fixture-123.js", Buffer.from("export const fixture = 1;")],
    [
      "chunks/fixture-123.js.LEGAL.txt",
      Buffer.from("Required bundled legal comment.\n"),
    ],
  ]);
}

function sealed(map) {
  const files = [...map]
    .filter(([path]) => path !== "artifact-manifest.json")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([path, body]) => ({ path, body }));
  const manifest = {
    version: 1,
    files: files.map(({ path, body }) => ({
      path,
      bytes: body.length,
      sha256: hash(body),
    })),
  };
  files.push({ path: "artifact-manifest.json", body: json(manifest) });
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

const expected = {
  expectedCommit: COMMIT,
  expectedTag: TAG,
  expectedTree: TREE,
};

async function temporary(t) {
  const directory = await mkdtemp(join(tmpdir(), "atlas-artifact-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function writeFixture(directory, files) {
  for (const file of files) {
    const path = join(directory, file.path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, file.body);
  }
}

test("a complete reviewed corpus packages its real reader and preserves legal Markdown separately", () => {
  const files = sealed(fixture());
  const result = verifyFiles(files, expected);
  assert.equal(result.release.commit, COMMIT);
  assert.equal(result.release.sourceDirty, false);
  assert.equal(result.files.length, files.length);
  assert.ok(
    result.files.some((file) => file.path === "licenses/fonts-NOTICE.md"),
  );
  assert.equal(
    result.manifestSha256,
    hash(files.find((file) => file.path === "artifact-manifest.json").body),
  );
});

test("dirty-at-build and absent build identity cannot be rehabilitated by a later clean checkout", () => {
  for (const value of [true, undefined, "false"]) {
    const map = fixture();
    const release = JSON.parse(map.get("release.json"));
    if (value === undefined) delete release.sourceDirty;
    else release.sourceDirty = value;
    map.set("release.json", json(release));
    assert.throws(
      () => verifyFiles(sealed(map), expected),
      `sourceDirty=${value}`,
    );
  }
});

test("a self-consistent manifest cannot authorize hidden files, logs, extra data, or source documents", () => {
  for (const path of [
    ".env",
    "assets/.hidden.webp",
    "assets/session.log",
    "data/export.json",
    "notes.md",
    "assets/model.blend",
    "fonts/source.ttf",
  ]) {
    const map = fixture();
    map.set(path, Buffer.from("SENTINEL_61"));
    assert.throws(() => verifyFiles(sealed(map), expected), path);
  }
});

test("required reader loss and duplicate file identities fail even when other bytes remain valid", () => {
  const map = fixture();
  map.delete("reading.html");
  assert.throws(() => verifyFiles(sealed(map), expected), /required/i);
  const files = sealed(fixture());
  assert.throws(
    () => verifyFiles([...files, files[0]], expected),
    /duplicate/i,
  );
});

test("one-byte changes cannot hide behind equal byte counts or an unchanged manifest", () => {
  const files = sealed(fixture());
  const script = files.find((file) => file.path === "app.js");
  script.body = Buffer.from(script.body);
  script.body[0] ^= 1;
  assert.throws(() => verifyFiles(files, expected), /inventory/i);
});

test("data bytes stay bound to the content snapshot even after the manifest is regenerated", () => {
  const map = fixture();
  map.set(
    "data/content.json",
    Buffer.concat([contentBytes, Buffer.from("\n")]),
  );
  assert.throws(() => verifyFiles(sealed(map), expected), /snapshot/i);
});

test("reviewed commit and release version cannot be replaced by self-consistent local metadata", () => {
  const files = sealed(fixture());
  assert.throws(
    () => verifyFiles(files, { ...expected, expectedCommit: "c".repeat(40) }),
    /commit/i,
  );
  assert.throws(
    () => verifyFiles(files, { ...expected, expectedTag: "v8.0.1" }),
    /tag/i,
  );
});

test("reader publication basis must survive rendering even when JSON and all file hashes are valid", () => {
  const map = fixture();
  const record = evidence.records[0];
  const html = map.get("reading.html").toString();
  const start = html.indexOf(`<article id="${record.id}">`);
  const end = html.indexOf("</article>", start);
  const article = html
    .slice(start, end)
    .replace(paragraph(record.basisNote), "");
  map.set(
    "reading.html",
    Buffer.from(html.slice(0, start) + article + html.slice(end)),
  );
  assert.throws(() => verifyFiles(sealed(map), expected), /reader/i);
});

test("an exact quote cannot silently become a different claim inside a freshly hashed reader", () => {
  const map = fixture();
  map.set(
    "reading.html",
    Buffer.from(
      map
        .get("reading.html")
        .toString()
        .replace(
          /<blockquote>[\s\S]*?<\/blockquote>/u,
          "<blockquote>SENTINEL_73</blockquote>",
        ),
    ),
  );
  assert.throws(() => verifyFiles(sealed(map), expected), /reader/i);
});

test("filesystem collection refuses a linked artifact root and linked payload bytes", async (t) => {
  const directory = await temporary(t);
  const dist = join(directory, "dist");
  await writeFixture(dist, sealed(fixture()));
  await symlink(dist, join(directory, "linked-root"));
  await assert.rejects(
    verifyDist(join(directory, "linked-root"), expected),
    /real directory/i,
  );
  await symlink(join(dist, "app.js"), join(dist, "linked.js"));
  await assert.rejects(verifyDist(dist, expected), /symbolic link/i);
});

test("the deterministic archive preserves each filename and byte without current machine metadata", () => {
  const files = sealed(fixture());
  const first = createArchive(files);
  const second = createArchive(
    files.map((file) => ({ ...file, body: Buffer.from(file.body) })),
  );
  assert.deepEqual(first, second);
  assert.deepEqual(unpackArchive(first), files);
  const tar = gunzipSync(first);
  assert.equal(tar.subarray(136, 147).toString(), "00000000000");
});

function changeTar(archive, mutate) {
  const tar = gunzipSync(archive);
  mutate(tar);
  tar.fill(32, 148, 156);
  const checksum = tar.subarray(0, 512).reduce((sum, byte) => sum + byte, 0);
  tar.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
  return gzipSync(tar);
}

test("archive type and traversal checks reject correctly checksummed hostile headers", () => {
  const archive = createArchive(sealed(fixture()));
  assert.throws(
    () =>
      unpackArchive(
        changeTar(archive, (tar) => {
          tar[156] = 50;
        }),
      ),
    /entry type/i,
  );
  assert.throws(
    () =>
      unpackArchive(
        changeTar(archive, (tar) => {
          tar.fill(0, 0, 100);
          tar.write("../escape.txt", 0);
        }),
      ),
    /unsafe/i,
  );
});

test("archive corruption and a missing terminator cannot masquerade as a valid release", () => {
  const tar = gunzipSync(createArchive(sealed(fixture())));
  const damaged = Buffer.from(tar);
  damaged[0] ^= 1;
  assert.throws(() => unpackArchive(gzipSync(damaged)), /checksum/i);
  assert.throws(
    () => unpackArchive(gzipSync(tar.subarray(0, tar.length - 1024))),
    /end marker/i,
  );
});

test("the four-file release package binds source tree and rejects later attachments or archive tampering", async (t) => {
  const directory = await temporary(t);
  const dist = join(directory, "dist");
  const out = join(directory, "package");
  await writeFixture(dist, sealed(fixture()));
  const binding = await packageRelease({
    dist,
    out,
    commit: COMMIT,
    tree: TREE,
    tag: TAG,
  });
  assert.equal(
    (await verifyPackage(out, expected)).binding.archive.sha256,
    binding.archive.sha256,
  );
  await assert.rejects(
    verifyPackage(out, { ...expected, expectedTree: "d".repeat(40) }),
    /tree/i,
  );
  await writeFile(join(out, "unreviewed.txt"), "SENTINEL_79");
  await assert.rejects(verifyPackage(out, expected), /unexpected/i);
  await rm(join(out, "unreviewed.txt"));
  const archivePath = join(out, binding.archive.file);
  const bytes = await readFile(archivePath);
  bytes[bytes.length - 1] ^= 1;
  await writeFile(archivePath, bytes);
  await assert.rejects(verifyPackage(out, expected), /digest/i);
});

function mockProduction(t, files, alter = () => undefined) {
  const calls = [];
  const map = new Map(files.map((file) => [file.path, file.body]));
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = new URL(input);
    calls.push(url.href);
    const path = decodeURIComponent(
      url.pathname.slice(new URL(BASE).pathname.length),
    );
    const bytes = map.get(path || "index.html");
    const changed = alter({ url, path, bytes });
    return new Response(changed ?? bytes, { status: bytes ? 200 : 404 });
  });
  return calls;
}

test("production readback checks all files at bare and commit URLs plus the actual home address", async (t) => {
  const files = sealed(fixture());
  const verified = verifyFiles(files, expected);
  const calls = mockProduction(t, files);
  const result = await verifyProduction(BASE, verified, {
    attempts: 1,
    delayMs: 0,
  });
  assert.equal(result.status, "pass");
  for (const { path } of files) {
    const bare = new URL(path, BASE);
    assert.ok(calls.includes(bare.href), path);
    bare.searchParams.set("atlas_commit", COMMIT);
    assert.ok(calls.includes(bare.href), `${path} identified`);
  }
  assert.ok(calls.includes(BASE));
  assert.equal(calls.length, files.length * 2 + 1);
});

for (const variant of ["bare", "commit-query", "root-home"]) {
  test(`production cannot pass when only the ${variant} response is stale`, async (t) => {
    const files = sealed(fixture());
    mockProduction(t, files, ({ url, path }) => {
      const stale =
        variant === "root-home"
          ? path === ""
          : path === "index.html" &&
            (variant === "bare" ? !url.search : !!url.search);
      return stale ? Buffer.from("STALE_ARTIFACT_83") : undefined;
    });
    await assert.rejects(
      verifyProduction(BASE, verifyFiles(files, expected), {
        attempts: 1,
        delayMs: 0,
      }),
      /Production .*differs?/i,
    );
  });
}

test("an unregistered production address is rejected before any fetch is attempted", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Unexpected network request");
  });
  await assert.rejects(
    verifyProduction(
      "https://example.invalid/",
      verifyFiles(sealed(fixture()), expected),
      { attempts: 1 },
    ),
    /registered/i,
  );
  assert.equal(fetch.mock.callCount(), 0);
});
