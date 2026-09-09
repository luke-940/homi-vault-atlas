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
import { compilePrivatePatterns } from "../scripts/validate-content.mjs";
import { validateSpatial } from "../scripts/validate-islands.mjs";
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
const runtimeFiles = new Map(await Promise.all([
  "fonts/atlas-sans.woff2", "fonts/atlas-serif.woff2",
  "assets/basis/basis_transcoder.js", "assets/basis/basis_transcoder.wasm",
].map(async path => [path, await readFile(new URL("../public/" + path, import.meta.url))])));
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
    ["fonts/atlas-sans.woff2", runtimeFiles.get("fonts/atlas-sans.woff2")],
    ["fonts/atlas-serif.woff2", runtimeFiles.get("fonts/atlas-serif.woff2")],
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

const spatialBytes = await readFile(new URL('../public/data/islands.json', import.meta.url));
const mapBytes = await readFile(new URL('../public/data/map.json', import.meta.url));
const onePixelWebP = Buffer.from('UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAdQxuKVtv+BiOh/AAA=', 'base64');
function modelFixture(island, change = () => {}) {
  // Valid triangle geometry for format/identity tests; no visual-quality claim.
  const positions = Buffer.alloc(36); [0,0,0,1,0,0,0,1,0].forEach((n,i)=>positions.writeFloatLE(n,i*4));
  const uv = Buffer.alloc(24); [0,0,1,0,0,1].forEach((n,i)=>uv.writeFloatLE(n,i*4));
  const binary = Buffer.concat([positions,uv,Buffer.from([0,0,1,0,2,0,0,0])]);
  const places = island ? [...island.places,...island.subInteractions] : [];
  const leaves = places.flatMap((p,i)=>p.physicalPartIds.map((part,j)=>({name:`part_${i}_${j}`,mesh:0,extras:{atlasInstanceId:p.interactionAssetId,atlasPartId:part,interactionIds:[p.id]}})));
  if(!leaves.length)leaves.push({name:'overview_surface',mesh:0});
  const document = {asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{name:'island_root',children:leaves.map((_,i)=>i+1)},...leaves],meshes:[{primitives:[{attributes:{POSITION:0,TEXCOORD_0:1},indices:2,material:0}]}],materials:[{}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]},{bufferView:1,componentType:5126,count:3,type:'VEC2'},{bufferView:2,componentType:5123,count:3,type:'SCALAR'}],bufferViews:[{buffer:0,byteOffset:0,byteLength:36},{buffer:0,byteOffset:36,byteLength:24},{buffer:0,byteOffset:60,byteLength:6}],buffers:[{byteLength:binary.length}]};
  change(document);
  let body=Buffer.from(JSON.stringify(document));body=Buffer.concat([body,Buffer.alloc((4-body.length%4)%4,32)]);
  const header=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+body.length+binary.length,8);jh.writeUInt32LE(body.length);jh.writeUInt32LE(0x4e4f534a,4);bh.writeUInt32LE(binary.length);bh.writeUInt32LE(0x004e4942,4);return Buffer.concat([header,jh,body,bh,binary]);
}
function spatialFixture() {
  const map = fixture();
  for (const [path, body] of runtimeFiles) map.set(path, body);
  map.set('data/islands.json', spatialBytes); map.set('data/map.json', mapBytes);
  for (const island of JSON.parse(spatialBytes).islands) {
    const id=island.id;
    map.set(`assets/atlas-v81-${id}.glb`,modelFixture(island));
    map.set(`assets/collision/${id}.json`,json({schema:'atlas.collision.v1',islandId:id,units:'metres',up:'+Y',worldSpace:true,ground:{levelY:island.groundY,waterY:0,coast:island.coast},shapes:[{id:'fixture_wall',instanceId:`${id}-fixture`,partId:'wall',type:'box',center:[0,1,0],halfSize:[1,1,1],rotationY:0,bounds:{min:[-1,0,-1],max:[1,2,1]}}]}));
    map.set(`assets/maps/${id}.webp`,onePixelWebP);
  }
  map.set('assets/atlas-v81-world.glb',modelFixture());
  map.set('assets/maps/world.webp',onePixelWebP);
  map.set('assets/textures/water-normal.webp',onePixelWebP);
  const release=JSON.parse(map.get('release.json')); release.version='8.1.0';
  const snapshot=createHash('sha256');
  for(const name of ['content.json','evidence.json','islands.json','map.json'])snapshot.update(name+'\0').update(map.get('data/'+name)).update('\0');
  release.publicDataSnapshot=snapshot.digest('hex');map.set('release.json',json(release));return map;
}
const spatialExpected={...expected,expectedTag:'v8.1.0'};
test('v8.1 binds all four public datasets and requires each actual map, model and collision payload',()=>{
 const map=spatialFixture();assert.equal(verifyFiles(sealed(map),spatialExpected).release.version,'8.1.0');
 for(const path of ['data/map.json','assets/atlas-v81-groot.glb','assets/collision/common.json','assets/maps/rocket.webp','assets/maps/world.webp','assets/textures/water-normal.webp']){
   const changed=new Map(map);changed.delete(path);assert.throws(()=>verifyFiles(sealed(changed),spatialExpected),/required/i);
 }
 map.set('data/map.json',Buffer.concat([mapBytes,Buffer.from('\n')]));assert.throws(()=>verifyFiles(sealed(map),spatialExpected),/snapshot/i);
});
test('decoder and texture allowlists permit self-hosted runtime assets but no arbitrary script or map export',()=>{
 const map=spatialFixture();
 map.set('assets/basis/basis_transcoder.js',runtimeFiles.get('assets/basis/basis_transcoder.js'));
 map.set('assets/basis/basis_transcoder.wasm',runtimeFiles.get('assets/basis/basis_transcoder.wasm'));
 map.set('assets/textures/water-normal.webp',onePixelWebP);
 assert.equal(verifyFiles(sealed(map),spatialExpected).release.version,'8.1.0');
 const malformedTexture=new Map(map);malformedTexture.set('assets/textures/water-normal.webp',Buffer.from('INVALID_CONTAINER'));
 assert.throws(()=>verifyFiles(sealed(malformedTexture),spatialExpected),/asset contract/i);
 for(const path of ['assets/basis/custom-loader.js','assets/maps/source.json','assets/collision/extra.json','assets/textures/source.txt','assets/textures/surface-17.webp','assets/textures/surface-17.ktx2']){
  const changed=new Map(map);changed.set(path,Buffer.from('SENTINEL_47'));assert.throws(()=>verifyFiles(sealed(changed),spatialExpected),/non-public/i);
 }
});

test('a fresh manifest cannot republish retired artworks or the legacy world under old or invented paths',()=>{
 const map=spatialFixture();
 for(const path of ['assets/groot-harbor.webp','assets/groot-characters.webp','assets/groot-combat.webp','assets/groot-dialogue.webp','assets/atlas-world.glb','assets/renamed-art.webp']){
  const changed=new Map(map);changed.set(path,path.endsWith('.glb')?modelFixture():onePixelWebP);
  assert.throws(()=>verifyFiles(sealed(changed),spatialExpected),/non-public/i,path);
 }
});
test('hidden static-reader source is a publication surface even when visible articles and hashes match',()=>{
 const privatePatterns=compilePrivatePatterns({patterns:[{pattern:'SENTINEL_PRIVATE_61'}]});
 const html=reader().toString();
 const variants=[
  html.replace('</body>','<script type="application/json">SENTINEL_PRIVATE_61</script></body>'),
  html.replace('<body>','<body data-hidden="SENTINEL_PRIVATE_61">'),
  html.replace('</body>','<!-- SENTINEL_PRIVATE_61 --></body>'),
  html.replace('<body>','<body data-hidden="SENTINEL_&#80;RIVATE_61">'),
  html.replace('</body>','<script></script></body>'),
  html.replace('<body>','<body onload="void 0">'),
  html.replace('<body>','<body data-hidden="/Users/SENTINEL_PRIVATE_61">'),
 ];
 for(const source of variants){const map=fixture();map.set('reading.html',Buffer.from(source));assert.throws(()=>verifyFiles(sealed(map),{...expected,privatePatterns}),error=>/reader contract/i.test(error.message)&&!error.message.includes('SENTINEL_PRIVATE_61'));}
 assert.equal(verifyFiles(sealed(fixture()),{...expected,privatePatterns}).release.version,'8.0.0');
});
test('private publication rules reach unused GLB metadata through final artifact verification',()=>{
 const map=spatialFixture();map.set('assets/atlas-v81-world.glb',modelFixture(undefined,j=>j.nodes.push({name:'SENTINEL_PRIVATE_61'})));
 assert.equal(verifyFiles(sealed(map),spatialExpected).release.version,'8.1.0');
 const privatePatterns=compilePrivatePatterns({patterns:[{pattern:'SENTINEL_PRIVATE_61'}]});
 assert.throws(()=>verifyFiles(sealed(map),{...spatialExpected,privatePatterns}),error=>/asset contract/i.test(error.message)&&!error.message.includes('SENTINEL_PRIVATE_61'));
});


test('required screen files and exact vendored decoder bytes cannot be omitted or substituted',()=>{
 const map=spatialFixture();assert.equal(verifyFiles(sealed(map),spatialExpected).release.version,'8.1.0');
 for(const path of ['app.css',...runtimeFiles.keys()]){
  const missing=new Map(map);missing.delete(path);assert.throws(()=>verifyFiles(sealed(missing),spatialExpected),/required/i,path);
 }
 for(const path of ['assets/basis/basis_transcoder.js','assets/basis/basis_transcoder.wasm']){
  const replaced=new Map(map);const bytes=Buffer.from(map.get(path));bytes[bytes.length-1]^=1;replaced.set(path,bytes);
  assert.throws(()=>verifyFiles(sealed(replaced),spatialExpected),/asset contract/i,path);
 }
});

test('asset provenance fields and collision metadata cannot hide unreviewed source prose',()=>{
 const map=spatialFixture();const island=JSON.parse(spatialBytes).islands.find(i=>i.id==='common');
 for(const field of ['raw_source','source_path','snapshot_path','canonical_path','source_sha256','char_start','char_end']){
  const glb=new Map(map);glb.set('assets/atlas-v81-common.glb',modelFixture(island,d=>{d.asset[field]='SYNTHETIC_UNREVIEWED_BODY_61';}));
  assert.throws(()=>verifyFiles(sealed(glb),spatialExpected),/asset contract/i,field);
  const collision=new Map(map),data=JSON.parse(collision.get('assets/collision/common.json'));data[field]='SYNTHETIC_UNREVIEWED_BODY_61';collision.set('assets/collision/common.json',json(data));
  assert.throws(()=>verifyFiles(sealed(collision),spatialExpected),/asset contract/i,field);
 }
 for(const pick of [d=>d,d=>d.ground,d=>d.shapes[0],d=>d.shapes[0].bounds]){
  const changed=new Map(map),data=JSON.parse(changed.get('assets/collision/common.json'));pick(data).unreviewedNote='SYNTHETIC_UNREVIEWED_BODY_61';changed.set('assets/collision/common.json',json(data));
  assert.throws(()=>verifyFiles(sealed(changed),spatialExpected),/asset contract/i);
 }
 assert.equal(verifyFiles(sealed(map),spatialExpected).release.version,'8.1.0');
});


test('map cameras retain the reviewed crop independently of terrain extent',()=>{
 const spatial=JSON.parse(spatialBytes),atlasMap=JSON.parse(mapBytes);
 assert.equal(validateSpatial(spatial,atlasMap,content,evidence).valid,true);
 for(const island of spatial.islands){
  const previousCrop=structuredClone(spatial),changed=previousCrop.islands.find(i=>i.id===island.id);
  changed.mapBounds={minX:-changed.extent,maxX:changed.extent,minZ:-changed.extent,maxZ:changed.extent};
  const result=validateSpatial(previousCrop,atlasMap,content,evidence);
  assert.ok(result.issues.some(i=>i.path.endsWith('.mapBounds')),island.id+' must reject the clipped former crop');
 }
});


test('fixed reader head is HTML syntax while private names in every other surface still fail',()=>{
 const privatePatterns=compilePrivatePatterns({patterns:[{pattern:'\\bmeta\\b',flags:'iu'}]});
 const fixedHead='<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">';
 const source=reader().toString().replace('<!doctype html><html lang="ko"><body>',fixedHead+'<style>.record-note{color:#566965}</style></head><body>');
 const check=html=>{const files=fixture();files.set('reading.html',Buffer.from(html));return verifyFiles(sealed(files),{...expected,privatePatterns});};
 assert.equal(check(source).release.version,'8.0.0');
 const variants=[
  source.replace('</body>','<p>Meta</p></body>'),
  source.replace('</body>','<!-- Meta --></body>'),
  source.replace('<body>','<body data-hidden="Meta">'),
  source.replace('<body>','<body data-hidden="M&#101;ta">'),
  source.replace('<body>','<body data-hidden="%4Deta">'),
  source.replace('</style>','.other{content:"Meta"}</style>'),
  source.replace('</head>','<meta name="description" content="Meta"></head>'),
  source.replace('content="width=device-width,initial-scale=1"','content="Meta"'),
  source.replace('</body>',`<div data-hidden='${fixedHead}'>record</div></body>`),
 ];
 for(const html of variants)assert.throws(()=>check(html),/reader contract/i);
});
