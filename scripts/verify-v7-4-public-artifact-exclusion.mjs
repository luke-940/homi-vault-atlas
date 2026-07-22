import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertNoOwnerPayloadInPublicArtifact } from "./lib/v7-4-public-artifact-exclusion.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.resolve(process.env.ATLAS_PUBLIC_OUTPUT_DIR ?? path.join(projectDir, "dist-public"));
const result = await assertNoOwnerPayloadInPublicArtifact({ distDir });
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
