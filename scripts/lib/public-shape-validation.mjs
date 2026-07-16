import { build } from "esbuild";
import path from "node:path";
let validatorPromise = null;

async function loadValidator(projectDir) {
  if (!validatorPromise) {
    validatorPromise = (async () => {
      const result = await build({
        stdin: {
          contents: `
            import { validateAtlasPacksAtBoundary } from "./src/data-boundary-validation.ts";
            export function collectPublicPackFailures(candidate) {
              try {
                validateAtlasPacksAtBoundary(candidate);
                return [];
              } catch (error) {
                return [{ path: "atlas", message: error instanceof Error ? error.message : String(error) }];
              }
            }
          `,
          resolveDir: projectDir,
          sourcefile: "atlas-public-validation-entry.ts",
          loader: "ts",
        },
        bundle: true,
        write: false,
        platform: "node",
        format: "esm",
        target: ["node22"],
        treeShaking: true,
        legalComments: "none",
      });
      const source = result.outputFiles?.[0]?.text;
      if (!source) throw new Error("Public shape validation blocked: validator bundle is empty.");
      const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
      const loaded = await import(moduleUrl);
      if (typeof loaded.collectPublicPackFailures !== "function") {
        throw new Error("Public shape validation blocked: aggregate validator export is missing.");
      }
      return loaded.collectPublicPackFailures;
    })();
  }
  return validatorPromise;
}

export async function validatePublicPackShapes({ projectDir, packs, boundary }) {
  const collectPublicPackFailures = await loadValidator(projectDir);
  const failures = collectPublicPackFailures(packs);
  if (failures.length > 0) {
    const preview = failures.slice(0, 12).map((failure) => `${failure.path}: ${failure.message}`).join(" | ");
    throw new Error(`Public ${boundary} blocked: aggregate pack shape contract failed (${preview}).`);
  }
  return {
    schema: "atlas.public_pack_shape_validation.v1",
    boundary,
    failures: 0,
    pass: true,
  };
}
