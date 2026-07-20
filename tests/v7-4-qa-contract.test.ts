import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CI_ROUTE_CASES,
  CORE_ROUTE_CASES,
  LOCAL_RESOURCE_POLICY,
  QA_PERFORMANCE_BUDGETS,
  evaluateAccessibilitySnapshot,
  evaluateGeometrySnapshot,
  evaluateLifecycleGates,
  evaluatePerformanceResults,
  hasPngMagic,
  parseMemoryPressure,
  parseThermalPressure,
  requiredAtlasUrl,
  resolveQaPlan,
} from "../scripts/run-v7-4-qa.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("Atlas v7.4 resource-safe browser QA contract", () => {
  it("uses the exact eight representative routes once in default dev mode", () => {
    const plan = resolveQaPlan({});

    expect(plan.mode).toBe("dev");
    expect(plan.iterations).toBe(1);
    expect(plan.workers).toBe(1);
    expect(plan.routes).toHaveLength(8);
    expect(plan.routes.map((route) => route.key)).toEqual([
      "home-default",
      "home-selected",
      "agency-default",
      "agency-actor",
      "explore",
      "observe",
      "flow",
      "time",
    ]);
  });

  it("runs the same eight routes once in explicit local RC mode", () => {
    const plan = resolveQaPlan({ ATLAS_QA_MODE: "local-rc" });

    expect(plan.mode).toBe("local-rc");
    expect(plan.routes).toBe(CORE_ROUTE_CASES);
    expect(plan.routes).toHaveLength(8);
    expect(plan.iterations).toBe(1);
    expect(plan.workers).toBe(1);
    expect(plan.local).toBe(true);
  });

  it("permits the single 24-route release matrix only on GitHub Actions", () => {
    expect(() => resolveQaPlan({ ATLAS_QA_MODE: "ci" })).toThrow(/GITHUB_ACTIONS=true/);

    const plan = resolveQaPlan({ ATLAS_QA_MODE: "ci", GITHUB_ACTIONS: "true" });
    expect(plan.routes).toBe(CI_ROUTE_CASES);
    expect(plan.routes).toHaveLength(24);
    expect(new Set(plan.routes.map((route) => route.id)).size).toBe(24);
    expect(plan.iterations).toBe(1);
    expect(plan.workers).toBe(1);
    expect(plan.local).toBe(false);
    expect(plan.routes.length * plan.iterations).toBe(24);
  });

  it("uses 24 distinct semantic CI cases instead of repeating the local eight", () => {
    expect(CI_ROUTE_CASES.map((route) => route.id)).toEqual([
      "home-default",
      "home-selected",
      "agency-default",
      "agency-actor",
      "explore",
      "observe",
      "flow",
      "time",
      "home-activity",
      "home-coverage",
      "agency-control-plane",
      "agency-evolution",
      "explore-hubs",
      "explore-sources",
      "observe-hub",
      "search-overlay",
      "search-escape-focus",
      "data-overlay",
      "malformed-url",
      "deep-link-reload",
      "history-back-forward",
      "keyboard-navigation",
      "webkit-svg-focus",
      "agency-all-actors",
    ]);
    expect(new Set(CI_ROUTE_CASES.map((route) => route.hash)).size).toBeGreaterThanOrEqual(10);
    expect(new Set(CI_ROUTE_CASES.map((route) => `${route.id}:${route.journey}`)).size).toBe(24);
  });

  it("covers all Home scenes, Agency scenes, six actors, and required interaction modes", () => {
    const homeScenes = new Set(CI_ROUTE_CASES
      .filter((route) => route.journey === "home-scene")
      .map((route) => route.targetScene));
    const actorIds = new Set(CI_ROUTE_CASES.flatMap((route) => [
      ...(route.actorId ? [route.actorId] : []),
      ...(route.actorIds ?? []),
    ]));
    const journeys = new Set(CI_ROUTE_CASES.map((route) => route.journey));

    expect(homeScenes).toEqual(new Set([
      "living-terrain",
      "knowledge-gravity",
      "verified-activity",
      "coverage-boundary",
    ]));
    expect(actorIds).toEqual(new Set([
      "actor:control-plane",
      "actor:daily-runner",
      "actor:atlas-builder",
      "actor:rocket-manager",
      "actor:groot-manager",
      "actor:intelligence-layer-manager",
    ]));
    for (const journey of [
      "agency-system-roundtrip",
      "agency-scene",
      "search-overlay",
      "search-escape-focus",
      "data-overlay",
      "malformed-recovery",
      "focus-reload",
      "back-forward",
      "keyboard-workspace",
      "explore-three-level",
      "hub-relations",
      "flow-verified-or-empty",
      "time-empty-public",
      "webkit-svg-focus",
      "agency-actor-cycle",
    ]) expect(journeys.has(journey)).toBe(true);
    expect(CI_ROUTE_CASES.some((route) => route.firstEntry)).toBe(true);
    expect(CI_ROUTE_CASES.some((route) => route.reducedMotion)).toBe(true);
    expect(CI_ROUTE_CASES.some((route) => route.touch)).toBe(true);
  });

  it("covers all eight release viewports without increasing the eight local route count", () => {
    const viewportKeys = new Set(CI_ROUTE_CASES.map((route) => `${route.viewport.width}x${route.viewport.height}`));

    expect(viewportKeys).toEqual(new Set([
      "1440x920",
      "1280x720",
      "1180x720",
      "1024x768",
      "768x1024",
      "390x844",
      "320x844",
      "844x390",
    ]));
    expect(CORE_ROUTE_CASES).toHaveLength(8);
  });

  it("binds every route to explicit rendered-selector applicability instead of a non-empty aggregate", () => {
    for (const route of CI_ROUTE_CASES) {
      expect(route.geometryRequiredSelectors.length, route.id).toBeGreaterThan(0);
    }
    expect(CORE_ROUTE_CASES[0].geometryRequiredSelectors).toContain(".home-v74-copy h1");
    expect(CORE_ROUTE_CASES[0].geometryRequiredSelectors).toContain(".living-terrain");
    expect(CORE_ROUTE_CASES[0].geometryRequiredSelectors).toContain(".provenance-groups > div");
    expect(CORE_ROUTE_CASES.find((route) => route.id === "observe")?.geometryRequiredSelectors)
      .toContain(".mobile-relation-preview");
  });

  it("rejects caller attempts to weaken route, worker, or iteration policy", () => {
    expect(() => resolveQaPlan({ ATLAS_QA_ITERATIONS: "1" })).toThrow(/overrides are forbidden/);
    expect(() => resolveQaPlan({ ATLAS_QA_WORKERS: "8" })).toThrow(/overrides are forbidden/);
    expect(() => resolveQaPlan({ ATLAS_QA_ROUTES: "home" })).toThrow(/overrides are forbidden/);
    expect(() => resolveQaPlan({ ATLAS_QA_MODE: "quick" })).toThrow(/Unsupported/);
  });

  it("requires an externally supplied HTTP(S) Atlas URL and has no implicit target", () => {
    expect(() => requiredAtlasUrl({})).toThrow(/ATLAS_URL is required/);
    expect(() => requiredAtlasUrl({ ATLAS_URL: "file:///tmp/index.html" })).toThrow(/http or https/);
    expect(() => requiredAtlasUrl({ ATLAS_URL: "http://user:pass@127.0.0.1:8793/" })).toThrow(/credentials/);
    expect(requiredAtlasUrl({ ATLAS_URL: "http://127.0.0.1:8793/atlas?stale=1#home" }))
      .toBe("http://127.0.0.1:8793/atlas/");
  });

  it("permits one explicit file URL smoke without widening the local eight-route plan", () => {
    const plan = resolveQaPlan({ ATLAS_QA_MODE: "file-smoke" });
    expect(plan.routes).toHaveLength(1);
    expect(plan.routes[0].id).toBe("home-default");
    expect(plan.iterations).toBe(1);
    expect(plan.workers).toBe(1);
    expect(requiredAtlasUrl({ ATLAS_URL: "file:///tmp/atlas/index.html#stale" }, { allowFile: true }))
      .toBe("file:///tmp/atlas/index.html");
  });

  it("pins local stop thresholds to the approved Mac-safe limits", () => {
    expect(LOCAL_RESOURCE_POLICY.maximumDurationMs).toBe(720_000);
    expect(LOCAL_RESOURCE_POLICY.maximumOwnedRssBytes).toBe(1_610_612_736);
    expect(LOCAL_RESOURCE_POLICY.minimumFreeMemoryBytes).toBe(2_147_483_648);
    expect(LOCAL_RESOURCE_POLICY.maximumOwnedCpuPercent).toBe(250);
    expect(LOCAL_RESOURCE_POLICY.maximumOwnedCpuConsecutiveSeconds).toBe(10);
    expect(LOCAL_RESOURCE_POLICY.sampleIntervalMs).toBe(1000);
  });

  it("treats every geometry, typography, and page-overflow finding as blocking", () => {
    const clean = {
      comparisonScope: "global-cross-selector",
      requiredTargetCount: 8,
      selectorCoverage: [{ selector: ".required", applicability: "required", matchedCount: 1, renderedCount: 1 }],
      overlaps: [],
      clipped: [],
      undersizedText: [],
      horizontalOverflow: 0,
      homeHeadline: { applicable: false, present: false, lineCount: 0 },
      mobileHome: { applicable: false, terrainPresent: false, terrainBeginsInFirstViewport: false },
      mobileNavigation: { applicable: false, visible: false, reachable: false, buttonCount: 0, minimumTargetSize: 0 },
      mobileSibling: { applicable: false, visible: false, reachable: false },
      mobileInteractive: { applicable: false, checkedCount: 0, undersized: [] },
    };
    expect(evaluateGeometrySnapshot(clean)).toEqual({ pass: true, failures: [] });
    expect(evaluateGeometrySnapshot({ ...clean, overlaps: [{ a: "A", b: "B" }] }).pass).toBe(false);
    expect(evaluateGeometrySnapshot({ ...clean, clipped: [{ target: "A" }] }).pass).toBe(false);
    expect(evaluateGeometrySnapshot({ ...clean, undersizedText: [{ target: "A", fontSize: 11.99 }] }).pass).toBe(false);
    expect(evaluateGeometrySnapshot({ ...clean, horizontalOverflow: 1 }).pass).toBe(false);
    expect(evaluateGeometrySnapshot({ ...clean, requiredTargetCount: 0 }).pass).toBe(false);
    expect(evaluateGeometrySnapshot({ ...clean, comparisonScope: "within-selector" }).pass).toBe(false);
    expect(evaluateGeometrySnapshot({ ...clean, selectorCoverage: [] }).pass).toBe(false);
    expect(evaluateGeometrySnapshot({
      ...clean,
      selectorCoverage: [{ selector: ".required", applicability: "required", matchedCount: 1, renderedCount: 0 }],
    }).pass).toBe(false);
    expect(evaluateGeometrySnapshot({ ...clean, homeHeadline: { applicable: true, present: false, lineCount: 0 } }).pass).toBe(false);
    expect(evaluateGeometrySnapshot({ ...clean, homeHeadline: { applicable: true, present: true, lineCount: 4 } }).pass).toBe(false);
    expect(evaluateGeometrySnapshot({ ...clean, mobileHome: { applicable: true, terrainPresent: true, terrainBeginsInFirstViewport: false } }).pass).toBe(false);
    expect(evaluateGeometrySnapshot({
      ...clean,
      mobileNavigation: { applicable: true, visible: true, reachable: true, buttonCount: 5, minimumTargetSize: 43.99 },
    }).pass).toBe(false);
    expect(evaluateGeometrySnapshot({ ...clean, mobileSibling: { applicable: true, visible: true, reachable: false } }).pass).toBe(false);
    expect(evaluateGeometrySnapshot({
      ...clean,
      mobileInteractive: { applicable: true, checkedCount: 2, undersized: [{ target: "role", width: 43, height: 44 }] },
    }).pass).toBe(false);
  });

  it("blocks Axe, rendered-body, and accessibility-tree exposure independently", () => {
    const clean = {
      violations: [],
      bodyPrivacyFindings: [],
      bodyOperatingFindings: [],
      domPrivacyFindings: [],
      domOperatingFindings: [],
      ariaPrivacyFindings: [],
      ariaOperatingFindings: [],
      languageContract: {
        htmlLang: "en",
        commandBarLang: "en",
        workspaceMainLang: "ko",
        overlayLanguages: [{ selector: ".search-dialog", lang: "ko" }],
        chromeControls: [{ selector: "#workspace-tab-explore", found: true, labelConsistent: true }],
      },
    };
    expect(evaluateAccessibilitySnapshot(clean)).toEqual({ pass: true, failures: [] });
    expect(evaluateAccessibilitySnapshot({ ...clean, violations: [{ id: "button-name" }] }).pass).toBe(false);
    expect(evaluateAccessibilitySnapshot({ ...clean, bodyPrivacyFindings: [{ id: "email-address" }] }).pass).toBe(false);
    expect(evaluateAccessibilitySnapshot({ ...clean, domOperatingFindings: [{ id: "operating-event-identifier" }] }).pass).toBe(false);
    expect(evaluateAccessibilitySnapshot({ ...clean, ariaOperatingFindings: [{ id: "operating-control-identifier" }] }).pass).toBe(false);
    expect(evaluateAccessibilitySnapshot({ ...clean, languageContract: { ...clean.languageContract, htmlLang: "ko" } }).pass).toBe(false);
    expect(evaluateAccessibilitySnapshot({
      ...clean,
      languageContract: {
        ...clean.languageContract,
        chromeControls: [{ selector: "#workspace-tab-explore", found: true, labelConsistent: false }],
      },
    }).pass).toBe(false);
  });

  it("binds readiness, interaction, and long-task evidence to explicit budgets", () => {
    expect(QA_PERFORMANCE_BUDGETS).toEqual({
      readinessMedianMs: 1000,
      readinessP95Ms: 1500,
      interactionMedianMs: 500,
      interactionP95Ms: 750,
      longTaskThresholdMs: 50,
      maximumLongTaskCountPerResult: 3,
      maximumLongTaskTotalMsPerResult: 250,
      maximumSingleLongTaskMs: 300,
    });
    const passing = Array.from({ length: 3 }, (_, index) => ({
      performance: {
        readinessMs: 800 + index * 50,
        interactionMs: 320 + index * 20,
        longTasks: { supported: true, count: 1, totalMs: 60, maximumMs: 60 },
      },
    }));
    expect(evaluatePerformanceResults(passing).pass).toBe(true);
    const failing = passing.map((result, index) => index === 2
      ? { performance: { ...result.performance, readinessMs: 1600, interactionMs: 800, longTasks: { supported: true, count: 4, totalMs: 400, maximumMs: 350 } } }
      : result);
    expect(evaluatePerformanceResults(failing).pass).toBe(false);
    expect(evaluatePerformanceResults(failing).rows.filter((row) => !row.pass).map((row) => row.id)).toContain("readiness-p95");
  });

  it("accepts screenshots only when their bytes begin with the PNG signature", () => {
    const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
    const jpeg = Buffer.from("ffd8ffe000104a4649460001", "hex");

    expect(hasPngMagic(png)).toBe(true);
    expect(hasPngMagic(jpeg)).toBe(false);
    expect(hasPngMagic(Buffer.alloc(0))).toBe(false);
  });

  it("blocks any open-close mismatch or residual owned PID", () => {
    const clean = {
      browsersOpened: 1,
      browsersClosed: 1,
      contextsOpened: 8,
      contextsClosed: 8,
      pagesOpened: 8,
      pagesClosed: 8,
      monitorsStarted: 1,
      monitorsStopped: 1,
      residualPids: [],
    };
    expect(evaluateLifecycleGates(clean)).toEqual({ pass: true, failures: [] });
    expect(evaluateLifecycleGates({ ...clean, pagesClosed: 7 }).pass).toBe(false);
    expect(evaluateLifecycleGates({ ...clean, residualPids: [91234] }).pass).toBe(false);
  });

  it("promotes actual thermal and memory-pressure signals to stop conditions", () => {
    expect(parseThermalPressure("CPU_Speed_Limit = 100\nCPU_Scheduler_Limit = 100\n").warning).toBe(false);
    expect(parseThermalPressure("CPU_Speed_Limit = 80\nCPU_Scheduler_Limit = 100\n").warning).toBe(true);
    expect(parseMemoryPressure("System-wide memory free percentage: 22%\n").warning).toBe(false);
    expect(parseMemoryPressure("System-wide memory free percentage: 4%\n").warning).toBe(true);
  });

  it("keeps the resource harness server-free and delegates pixel goldens to the CI-only Playwright suite", async () => {
    const source = await readFile(path.join(projectDir, "scripts", "run-v7-4-qa.mjs"), "utf8");
    const visualSpec = await readFile(path.join(projectDir, "tests-visual", "v7-4-golden.spec.mjs"), "utf8");
    const visualConfig = await readFile(path.join(projectDir, "playwright.visual.config.mjs"), "utf8");
    const visualVerifier = await readFile(path.join(projectDir, "scripts", "verify-v7-4-visual-golden.mjs"), "utf8");
    const packageJson = JSON.parse(await readFile(path.join(projectDir, "package.json"), "utf8"));

    expect(source).not.toMatch(/createServer\s*\(/);
    expect(source).not.toMatch(/\.listen\s*\(/);
    expect(source).not.toMatch(/python\s+-m\s+http\.server/);
    expect(source).not.toMatch(/vite\s+--host/);
    expect(source).not.toMatch(/\b(?:pkill|killall)\b/);
    expect(source).not.toMatch(/ATLAS_URL\s*(?:\?\?|\|\|)/);
    expect(source).toContain("serverStartedByHarness: false");
    expect(source).toContain("callerMustVerifyEconnrefusedAfterExternalServerShutdown:");
    expect(source).toContain('status: baseUrl.startsWith("file:") ? "not-applicable-file-url" : "pending-external-server-cleanup-proof"');
    expect(source).toMatch(/finally\s*\{[\s\S]*page\.close\(\)[\s\S]*context\.close\(\)/);
    expect(source).toContain("await monitor.stop()");
    expect(source).toContain("await browser.close()");
    expect(source).toContain("cleanupStartedProcesses(startedProcesses)");
    expect(source).toContain("new AxeBuilder({ page })");
    expect(source).toContain("scanOperatingExposure(bodyText");
    expect(source).toContain('workspaceMainLang: document.querySelector(".workspace-main")?.getAttribute("lang")');
    expect(source).toContain('control("#workspace-tab-agency", "Agency")');
    expect(source).toContain('comparisonScope: "global-cross-selector"');
    expect(source).toContain('applicability: requiredSelectorSet.has(selector) ? "required" : "contextual"');
    expect(source).toContain('document.querySelector(".home-v74-copy h1")');
    expect(source).toContain('document.querySelector(".living-terrain")');
    expect(source).not.toContain('.provenance-groups > section');
    expect(source).toContain('".atlas-app small", ".atlas-app span"');
    expect(source).toContain("mobile-interactive-target-under-44px");
    expect(source).toContain('comparison: "evidence-only-no-golden-baseline"');
    expect(source).not.toMatch(/toHaveScreenshot\s*\(/);
    expect(visualSpec).toMatch(/toHaveScreenshot\s*\(/);
    expect(visualSpec).toContain("resolveVisualGoldenCases(CI_ROUTE_CASES)");
    expect(visualConfig).toContain('process.env.GITHUB_ACTIONS !== "true"');
    expect(visualConfig).toContain('workers: 1');
    expect(visualConfig).toContain('updateSnapshots: mode === "candidate" ? "all" : "none"');
    expect(visualConfig).toContain('maxDiffPixelRatio: 0.0005');
    expect(visualConfig).not.toMatch(/mask\s*:/);
    expect(visualVerifier).toContain("blocked before browser start");
    expect(visualVerifier).toContain("V74_INDEPENDENT_VISUAL_QA_RECEIPT_PATH");
    expect(source).toContain('journey: "flow-verified-or-empty"');
    expect(source).toContain('journey: "time-empty-public"');
    expect(source).toContain('browserName: "webkit"');
    expect(packageJson.scripts.test).toBe("npm run test:public");
    expect(packageJson.scripts["test:public"]).toContain("ATLAS_TEST_PROFILE=public-ci");
    expect(packageJson.scripts["test:owner"]).toContain("ATLAS_TEST_PROFILE=owner-local");
    expect(packageJson.scripts["qa:local"]).toContain("ATLAS_OWNER_QA_RECEIPT=artifacts/v7-4-owner-qa/owner-contract-qa.json");
    expect(packageJson.scripts["qa:ci"]).toBe("ATLAS_QA_MODE=ci node scripts/run-v7-4-qa.mjs");
    expect(packageJson.scripts["qa:visual:ci"]).toContain("npm run qa:visual:manifest &&");
    expect(packageJson.scripts["qa:visual:ci"]).toContain("ATLAS_VISUAL_BASELINE_MODE=verify");
    expect(packageJson.scripts["qa:visual:candidate:ci"]).toContain("ATLAS_VISUAL_BASELINE_MODE=candidate");
  });

  it("runs PR QA once and deploys the exact successful artifact without rebuilding or retesting", async () => {
    const ci = await readFile(path.join(projectDir, ".github", "workflows", "ci.yml"), "utf8");
    const pages = await readFile(path.join(projectDir, ".github", "workflows", "pages.yml"), "utf8");

    expect(ci.match(/npm run qa:ci/g)).toHaveLength(1);
    expect(ci).toContain("playwright install --with-deps chromium webkit");
    expect(ci).toContain("ECONNREFUSED");
    expect(ci).toContain("server-shutdown.json");
    expect(ci).toContain("actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a");
    expect(ci).toContain("atlas-v7-4-public-${{ github.event.pull_request.head.sha }}");
    expect(ci).toContain("npm run release:evidence");
    expect(ci).toContain("tests-visual/independent-visual-qa-receipt.json");

    expect(pages).toContain("actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c");
    expect(pages).toContain("artifact_digest");
    expect(pages).toContain('main_tree="$(git rev-parse "${GITHUB_SHA}^{tree}")"');
    expect(pages).toContain('head_tree="$(git rev-parse "${head_sha}^{tree}")"');
    expect(pages).toContain("sha256sum --check");
    expect(pages).toContain("validated-artifact/dist-public");
    expect(pages).toContain("verify-v7-4-public-artifact-exclusion.mjs");
    expect(pages).toContain("ATLAS_PUBLIC_OUTPUT_DIR=validated-artifact/dist-public");
    expect(pages).not.toMatch(/rg -a -n [^\n]+ validated-artifact\/dist-public/);
    expect(pages).not.toMatch(/npm ci|npm run (?:lint|typecheck|test|build|qa:ci|qa:visual)/);
    expect(pages).toContain("RELEASE_EVIDENCE.json");
    expect(pages).toContain("independent-visual-qa-receipt.json");
    expect(pages).toContain("without rebuilding or retesting");
  });
});
