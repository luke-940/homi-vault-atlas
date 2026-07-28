import { defineConfig } from "@playwright/test";
import path from "node:path";

const artifactDir = path.resolve(process.env.ATLAS_QA_ARTIFACT_DIR ?? "artifacts/browser-qa");

export default defineConfig({
  testDir: "./tests-browser",
  outputDir: path.join(artifactDir, "test-results"),
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ["line"],
    ["json", { outputFile: path.join(artifactDir, "playwright-report.json") }],
  ],
  use: {
    baseURL: process.env.ATLAS_URL ?? "http://127.0.0.1:4173/",
    browserName: "chromium",
    headless: true,
    colorScheme: "dark",
    reducedMotion: "no-preference",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
    deviceScaleFactor: 1,
  },
});
