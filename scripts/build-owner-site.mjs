import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.ATLAS_BUILD_PROFILE = "owner";
process.env.ATLAS_PUBLIC_DATA_DIR = path.join(projectDir, ".generated", "profiles", "owner", "data");
process.env.ATLAS_PUBLIC_OUTPUT_DIR = path.join(projectDir, ".generated", "owner-site");

await import("./build-public-site.mjs");
