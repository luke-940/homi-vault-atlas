import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const builderRoot = path.resolve(projectDir, "../..");
const activityId = "REL-ATLAS-V7-9-20260729-01";
const gateRoot = path.join(builderRoot, "outputs", activityId, "gate-1");
const captureDir = path.resolve(
  process.env.ATLAS_GATE1_CAPTURE_DIR
    ?? path.join(gateRoot, "canonical-capture-rc2"),
);
const generatedRoot = path.join(projectDir, ".generated", "profiles");

function run(script, extraEnvironment = {}) {
  const result = spawnSync(process.execPath, [path.join(projectDir, "scripts", script)], {
    cwd: projectDir,
    env: {
      ...process.env,
      ATLAS_GENERATED_ROOT: generatedRoot,
      ATLAS_GATE_OUTPUT: gateRoot,
      ...extraEnvironment,
    },
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Gate 1 projection blocked: ${script} exited ${result.status}.`);
  }
}

run("build-graph-profiles.mjs", {
  ATLAS_CAPTURE_DIR: captureDir,
});
run("build-knowledge.mjs", {
  ATLAS_CAPTURE_MANIFEST: path.join(captureDir, "canonical-capture-manifest.json"),
  ATLAS_REVIEW_SOURCE: path.join(projectDir, "public-safe", "reviewed-dossiers.v1.json"),
  ATLAS_RELEASE_ELIGIBLE: "false",
  ATLAS_GATE_LABEL: "gate_1_five_node_vertical_slice",
});
run("build-profiles.mjs", {
  ATLAS_GATE1_SLICE: "true",
  ATLAS_PROFILE_ROOT: generatedRoot,
});
