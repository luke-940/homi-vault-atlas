const releaseVersionPattern = /^(\d+\.\d+\.\d+)(?:-[0-9A-Za-z.-]+)?$/;

export function releaseVersionFromSource(sourceVersion) {
  const match = releaseVersionPattern.exec(String(sourceVersion));
  if (!match) {
    throw new Error(`Public package blocked: unsupported source version ${JSON.stringify(sourceVersion)}.`);
  }
  return match[1];
}

export function createPublicPackageManifest(sourcePackage) {
  return {
    name: "homi-vault-atlas",
    version: releaseVersionFromSource(sourcePackage.version),
    private: true,
    type: "module",
    engines: { ...sourcePackage.engines },
    scripts: {
      lint: "node scripts/lint-source-contract.mjs",
      typecheck: "tsc --noEmit -p tsconfig.app.json && tsc --noEmit -p tsconfig.tests.json && tsc --noEmit -p tsconfig.scripts.json",
      test: "vitest run tests-public tests/v7-3-qa-contract.test.ts tests/visual-golden-contract.test.ts --maxWorkers=1",
      build: "node scripts/build-public-site.mjs && node scripts/audit-public-bundle.mjs",
      audit: "node scripts/audit-public-bundle.mjs",
      "release:package": "node scripts/package-release-artifact.mjs",
      "release:verify": "node scripts/package-release-artifact.mjs --verify",
      "release:readback": "node scripts/readback-production.mjs",
      "qa:ci": "ATLAS_QA_MODE=ci node scripts/run-v7-3-qa.mjs",
      "qa:visual:manifest": "node scripts/verify-v7-3-visual-golden.mjs",
      "qa:visual:ci": "npm run qa:visual:manifest && ATLAS_VISUAL_BASELINE_MODE=verify npx --no-install playwright test --config=playwright.visual.config.mjs",
      "qa:visual:candidate:ci": "ATLAS_VISUAL_BASELINE_MODE=candidate npx --no-install playwright test --config=playwright.visual.config.mjs",
    },
    dependencies: { ...sourcePackage.dependencies },
    devDependencies: { ...sourcePackage.devDependencies },
  };
}

export function bindPublicLockfile(lockfile, publicPackage) {
  const bound = structuredClone(lockfile);
  const rootPackage = bound.packages?.[""];
  if (!rootPackage) {
    throw new Error("Public package blocked: package-lock.json has no root package entry.");
  }
  bound.name = publicPackage.name;
  bound.version = publicPackage.version;
  rootPackage.name = publicPackage.name;
  rootPackage.version = publicPackage.version;
  rootPackage.engines = { ...publicPackage.engines };
  rootPackage.dependencies = { ...publicPackage.dependencies };
  rootPackage.devDependencies = { ...publicPackage.devDependencies };
  return bound;
}
