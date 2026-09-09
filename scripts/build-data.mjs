/** One immutable public-data read feeds the bundle, reader and release hashes. */
import { readFile, writeFile, mkdir, realpath } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";

export const PUBLIC_DATA_NAMES = Object.freeze([
  "content.json", "evidence.json", "islands.json", "map.json",
]);

export async function capturePublicData(directory, { read = readFile } = {}) {
  // esbuild resolves symlinks, including macOS /var -> /private/var.
  const dataDirectory = await realpath(resolve(directory));
  const rows = await Promise.all(PUBLIC_DATA_NAMES.map(async name => [
    name, Buffer.from(await read(resolve(dataDirectory, name))),
  ]));
  const bytes = new Map(rows);
  // Parse every input immediately; malformed data cannot wait until bundling.
  for (const value of bytes.values()) JSON.parse(value.toString("utf8"));
  const known = name => {
    if (!bytes.has(name)) throw new Error("Unreviewed public dataset requested.");
    return bytes.get(name);
  };
  return Object.freeze({
    data: name => JSON.parse(known(name).toString("utf8")),
    bytes: name => Buffer.from(known(name)),
    contentSnapshot: createHash("sha256")
      .update(known("content.json")).update(known("evidence.json")).digest("hex"),
    publicDataSnapshot: (() => {
      const hash = createHash("sha256");
      for (const name of PUBLIC_DATA_NAMES) hash.update(name + "\0").update(known(name)).update("\0");
      return hash.digest("hex");
    })(),
    async writeTo(destination) {
      await mkdir(destination, { recursive: true });
      await Promise.all(PUBLIC_DATA_NAMES.map(name => writeFile(resolve(destination, name), known(name))));
    },
    async assertUnchanged() {
      const current = await Promise.all(PUBLIC_DATA_NAMES.map(name => read(resolve(dataDirectory, name))));
      if (current.some((body, index) => !Buffer.from(body).equals(known(PUBLIC_DATA_NAMES[index]))))
        throw new Error("Public data changed during build; discard this mixed-time attempt.");
    },
    plugin() {
      return {
        name: "atlas-reviewed-public-data",
        setup(build) {
          build.onLoad({ filter: /\.json$/ }, args => {
            const path = resolve(args.path);
            if (dirname(path) !== dataDirectory) return;
            const name = PUBLIC_DATA_NAMES.find(name => path === resolve(dataDirectory, name));
            if (!name) throw new Error("Build imported an unreviewed public dataset.");
            return { contents: known(name).toString("utf8"), loader: "json" };
          });
        },
      };
    },
  });
}
