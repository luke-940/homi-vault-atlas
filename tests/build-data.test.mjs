import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import { capturePublicData, PUBLIC_DATA_NAMES } from "../scripts/build-data.mjs";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "atlas-data-snapshot-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, "data"); await mkdir(directory);
  const original = new Map(PUBLIC_DATA_NAMES.map(name => [name, Buffer.from(JSON.stringify({ value: "REVIEWED_17", file: name }) + "\n")]));
  for (const [name, bytes] of original) await writeFile(join(directory, name), bytes);
  return { root, directory, original, snapshot: await capturePublicData(directory) };
}
async function bundle(root, plugins = []) {
  const result = await build({
    absWorkingDir: root, stdin: { contents: 'export {default as data} from "./data/content.json";', resolveDir: root },
    bundle: true, format: "esm", write: false, plugins, logLevel: "silent",
  });
  return import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].text).toString("base64"));
}

test("a transient source replacement cannot mix a different JSON into the bundle", async t => {
  const f = await fixture(t);
  await writeFile(join(f.directory, "content.json"), JSON.stringify({ value: "TRANSIENT_29" }));
  // Reproduce the old independent-read behavior, then exercise the real bundler plugin.
  assert.equal((await bundle(f.root)).data.value, "TRANSIENT_29");
  assert.equal((await bundle(f.root, [f.snapshot.plugin()])).data.value, "REVIEWED_17");
  await writeFile(join(f.directory, "content.json"), f.original.get("content.json"));
  await f.snapshot.assertUnchanged();
  const out = join(f.root, "output"); await f.snapshot.writeTo(out);
  for (const [name, bytes] of f.original) assert.deepEqual(await readFile(join(out, name)), bytes);
  assert.equal(f.snapshot.data("content.json").value, "REVIEWED_17");
  const hash = createHash("sha256");
  for (const name of PUBLIC_DATA_NAMES) hash.update(name + "\0").update(f.original.get(name)).update("\0");
  assert.equal(f.snapshot.publicDataSnapshot, hash.digest("hex"));
});

test("a changed source at completion fails without replacing the frozen selection", async t => {
  const f = await fixture(t); await writeFile(join(f.directory, "map.json"), '{}');
  await assert.rejects(f.snapshot.assertUnchanged(), /changed during build/);
  assert.deepEqual(f.snapshot.bytes("map.json"), f.original.get("map.json"));
});

test("consumer mutations and unreviewed fifth datasets cannot alter or extend the captured publication", async t => {
  const f = await fixture(t); const bytes = f.snapshot.bytes("content.json"); bytes.fill(0);
  const object = f.snapshot.data("content.json"); object.value = "CHANGED_31";
  assert.equal(f.snapshot.data("content.json").value, "REVIEWED_17");
  assert.throws(() => f.snapshot.data("extra.json"), /Unreviewed/);
  await writeFile(join(f.directory, "extra.json"), '{}');
  await assert.rejects(build({ absWorkingDir: f.root, stdin: { contents: 'export {default} from "./data/extra.json";', resolveDir: f.root }, bundle: true, write: false, plugins: [f.snapshot.plugin()], logLevel: "silent" }), /unreviewed public dataset/);
});
