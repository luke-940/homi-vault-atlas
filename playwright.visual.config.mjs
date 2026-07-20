import { defineConfig } from "@playwright/test";

if (process.env.GITHUB_ACTIONS !== "true") {
  throw new Error("Atlas visual golden Playwright is CI-only and requires GITHUB_ACTIONS=true");
}

const mode = process.env.ATLAS_VISUAL_BASELINE_MODE;
if (!new Set(["verify", "candidate"]).has(mode)) {
  throw new Error("ATLAS_VISUAL_BASELINE_MODE must be verify or candidate");
}

export default defineConfig({
  testDir: "./tests-visual",
  testMatch: "v7-3-golden.spec.mjs",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: {
    timeout: 20_000,
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.0005,
      threshold: 0.2,
    },
  },
  updateSnapshots: mode === "candidate" ? "all" : "none",
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}-{platform}{ext}",
  outputDir: "artifacts/v7-3-visual-golden/test-results",
  reporter: [
    ["line"],
    ["html", { outputFolder: "artifacts/v7-3-visual-golden/report", open: "never" }],
  ],
  projects: [{
    name: "chromium",
    use: {
      browserName: "chromium",
      colorScheme: "light",
      deviceScaleFactor: 1,
      locale: "ko-KR",
      reducedMotion: "reduce",
      serviceWorkers: "block",
      timezoneId: "Asia/Seoul",
      launchOptions: { args: ["--disable-gpu"] },
    },
  }],
});
