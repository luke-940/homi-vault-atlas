import { build } from "esbuild";
import { createHash } from "node:crypto";
import { readFile, rename } from "node:fs/promises";
import path from "node:path";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export async function buildSemanticSpaceEntrypoints({
  projectDir,
  stagingDir,
  appOutfile = "app.js",
  semanticOutfile = "semantic-space.js",
}) {
  /** @type {import("esbuild").BuildOptions} */
  const common = {
    bundle: true,
    format: "iife",
    target: ["es2022"],
    minify: true,
    sourcemap: false,
    metafile: true,
    legalComments: "none",
    loader: { ".svg": "dataurl" },
    define: { "process.env.NODE_ENV": '"production"' },
  };
  const semanticBuild = await build({
    ...common,
    entryPoints: [path.join(projectDir, "src", "semantic-space-entry.ts")],
    outfile: path.join(stagingDir, semanticOutfile),
  });
  const semanticBody = await readFile(path.join(stagingDir, semanticOutfile));
  const semanticName = `semantic-space.${sha256(semanticBody).slice(0, 16)}.js`;
  await rename(path.join(stagingDir, semanticOutfile), path.join(stagingDir, semanticName));

  const applicationBuild = await build({
    ...common,
    entryPoints: [path.join(projectDir, "src", "main.tsx")],
    outfile: path.join(stagingDir, appOutfile),
    jsx: "automatic",
    define: {
      ...common.define,
      __ATLAS_SEMANTIC_SPACE_ASSET__: JSON.stringify(`./${semanticName}`),
    },
  });
  return {
    applicationBuild,
    semanticBuild,
    semanticBody,
    semanticName,
    semanticEntrypoint: {
      path: semanticName,
      bytes: semanticBody.length,
      sha256: sha256(semanticBody),
    },
  };
}
