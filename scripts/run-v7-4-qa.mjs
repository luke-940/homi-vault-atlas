import AxeBuilder from "@axe-core/playwright";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { scanOperatingExposure, scanPrivacyText } from "./lib/privacy-scanner.mjs";

const execFileAsync = promisify(execFile);
const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const V74_QA_SCHEMA = "homi.atlas_v7_4.resource_safe_browser_qa.v1";
export const PNG_SIGNATURE_HEX = "89504e470d0a1a0a";

export const QA_PERFORMANCE_BUDGETS = Object.freeze({
  readinessMedianMs: 1000,
  readinessP95Ms: 1500,
  interactionMedianMs: 500,
  interactionP95Ms: 750,
  longTaskThresholdMs: 50,
  maximumLongTaskCountPerResult: 3,
  maximumLongTaskTotalMsPerResult: 250,
  maximumSingleLongTaskMs: 300,
});

export const LOCAL_RESOURCE_POLICY = Object.freeze({
  maximumDurationMs: 12 * 60 * 1000,
  maximumOwnedRssBytes: Math.floor(1.5 * 1024 * 1024 * 1024),
  minimumFreeMemoryBytes: 2 * 1024 * 1024 * 1024,
  maximumOwnedCpuPercent: 250,
  maximumOwnedCpuConsecutiveSeconds: 10,
  sampleIntervalMs: 1000,
  pressureProbeIntervalMs: 10_000,
});

const GEOMETRY_GROUPS = Object.freeze({
  home: [
    ".living-terrain",
    ".home-v74-copy .eyebrow",
    ".home-v74-copy h1",
    ".home-v74-copy > p",
    ".home-v74-actions > button",
    ".home-v74-proof > div",
    ".home-v74-proof dt",
    ".home-v74-proof dd",
    ".home-v74-proof small",
    ".v74-scene-rail > button",
    ".v74-scene-rail strong",
    ".terrain-intro > div",
    ".terrain-district",
    ".terrain-district > span",
    ".terrain-hub",
    ".terrain-hub > span",
    ".terrain-relation-readout",
    ".terrain-honest-empty",
    ".coverage-ledger > header",
    ".coverage-ledger-grid > div",
    ".provenance-owner",
    ".provenance-groups > div",
    ".provenance-groups > div > span",
    ".provenance-groups button",
    ".home-workspace-launcher > button",
    ".home-workspace-launcher > button strong",
    ".home-v74-snapshot",
  ],
  agency: [
    ".agency-intro .eyebrow",
    ".agency-intro h1",
    ".agency-intro > p",
    ".agency-scene-rail > button",
    ".agency-group .agency-actor-row",
    ".agency-mobile-role-picker .agency-actor-row",
    ".agency-role-detail dl > div",
    ".agency-evolution-before",
    ".agency-evolution-current .agency-actor-row",
    ".agency-evolution-independent .agency-actor-row",
    ".agency-knowledge-context > div > span",
  ],
  explore: [
    ".explore-level-browser > header",
    ".explore-level-columns > section > h2",
    ".explore-level-columns > section.is-active .explore-node-list > div > button",
    ".explore-level-columns > section.is-active .explore-level-empty",
    "[data-testid='city-map'] .city-block.depth-2 > text",
    "[data-testid='city-map'] .city-district-anchor > text",
    ".city-accessible-index > button",
    ".mobile-ranked-list > button",
    ".mobile-district-map button",
  ],
  observe: [
    ".workspace-scene-switch > button",
    "[data-testid='relation-matrix'] .matrix-cell[role='button']",
    ".hub-relations-surface > header",
    ".hub-relations-grid .hub-ego-node",
    ".hub-relations-grid li > button",
    ".hub-relations-surface .workspace-honest-empty",
    ".mobile-ranked-list > button",
    ".mobile-layer-switch > button",
  ],
  flow: [
    ".flow-honest-empty",
    "[data-testid='vault-metro'] .metro-route.is-active .metro-station[role='button']",
    ".mobile-stepper > li",
    ".mobile-route-switch > button",
  ],
  time: [
    ".time-honest-empty",
    "[data-testid='era-small-multiples'] .era-strata-mark",
    ".era-rail > button",
    ".mobile-era-scrubber > button",
    ".mobile-ranked-list .mobile-era-row",
  ],
  search: [
    ".search-input-row > input",
    ".search-input-row > button",
    ".search-context",
    ".search-section-label",
    ".search-result",
  ],
  dataOverlay: [
    ".data-tray .tray-heading > .eyebrow",
    ".data-tray .tray-heading > h2",
    ".data-tray .tray-heading > p",
    ".data-tray .evidence-ledger > div",
    ".data-tray .boundary-note",
    ".data-tray .mobile-tray-close",
  ],
});

const REQUIRED_GEOMETRY_SELECTORS = Object.freeze({
  home: [
    ".home-v74-copy h1",
    ".living-terrain",
    ".v74-scene-rail > button",
    ".coverage-ledger > header",
    ".provenance-owner",
    ".provenance-groups > div",
    ".home-workspace-launcher > button",
  ],
  agencySystem: [
    ".agency-intro h1",
    ".agency-scene-rail > button",
    ".agency-group .agency-actor-row",
  ],
  agencyRoles: [
    ".agency-intro h1",
    ".agency-scene-rail > button",
    ".agency-role-detail dl > div",
  ],
  agencyEvolution: [
    ".agency-intro h1",
    ".agency-scene-rail > button",
    ".agency-evolution-before",
    ".agency-evolution-current .agency-actor-row",
    ".agency-evolution-independent .agency-actor-row",
  ],
  explore: [
    ".explore-level-browser > header",
    ".explore-level-columns > section > h2",
    ".explore-level-columns > section.is-active .explore-node-list > div > button, .explore-level-columns > section.is-active .explore-level-empty",
  ],
  observeGlobal: [
    ".workspace-scene-switch > button",
    "[data-testid='relation-matrix'] .matrix-cell[role='button']",
  ],
  observeMobile: [
    ".mobile-observe",
    ".mobile-layer-switch > button, .mobile-layer-static",
    ".mobile-relation-preview",
    ".mobile-ranked-list > button",
  ],
  observeHub: [
    ".workspace-scene-switch > button",
    ".hub-relations-surface > header",
    ".hub-relations-grid .hub-ego-node, .hub-relations-surface .workspace-honest-empty",
  ],
  flow: [
    ".flow-honest-empty, [data-testid='vault-metro'] .metro-route.is-active .metro-station[role='button'], .mobile-stepper > li",
  ],
  time: [".time-honest-empty"],
  search: [
    ".search-input-row > input",
    ".search-input-row > button",
    ".search-context",
  ],
  dataOverlay: [
    ".data-tray .tray-heading > h2",
    ".data-tray .evidence-ledger > div",
    ".data-tray .boundary-note",
  ],
});

function geometryRequirementsFor(definition) {
  const mobileSibling = definition.viewport.width <= 820
    || (definition.viewport.width <= 900 && definition.viewport.height <= 520);
  if (definition.journey === "data-overlay") return REQUIRED_GEOMETRY_SELECTORS.dataOverlay;
  if (definition.workspace === "home" || definition.journey === "search-escape-focus" || definition.journey === "back-forward") {
    return REQUIRED_GEOMETRY_SELECTORS.home;
  }
  if (definition.workspace === "search") return REQUIRED_GEOMETRY_SELECTORS.search;
  if (definition.workspace === "agency") {
    if (definition.journey === "agency-scene" && definition.targetScene === "evolution") return REQUIRED_GEOMETRY_SELECTORS.agencyEvolution;
    if (["agency-actor", "agency-actor-cycle"].includes(definition.journey)) return REQUIRED_GEOMETRY_SELECTORS.agencyRoles;
    return REQUIRED_GEOMETRY_SELECTORS.agencySystem;
  }
  if (definition.workspace === "explore") return REQUIRED_GEOMETRY_SELECTORS.explore;
  if (definition.workspace === "observe") {
    if (mobileSibling) return REQUIRED_GEOMETRY_SELECTORS.observeMobile;
    return definition.journey === "hub-relations" ? REQUIRED_GEOMETRY_SELECTORS.observeHub : REQUIRED_GEOMETRY_SELECTORS.observeGlobal;
  }
  if (definition.workspace === "flow") return REQUIRED_GEOMETRY_SELECTORS.flow;
  if (definition.workspace === "time") return REQUIRED_GEOMETRY_SELECTORS.time;
  throw new Error(`Missing geometry requirement contract for ${definition.key ?? definition.workspace}`);
}

/**
 * @typedef {object} QaRouteCase
 * @property {string} key
 * @property {string} [id]
 * @property {string} workspace
 * @property {string} hash
 * @property {string} readySelector
 * @property {string} [finalReadySelector]
 * @property {readonly string[]} geometryGroups
 * @property {readonly string[]} [geometryRequiredSelectors]
 * @property {{width: number, height: number}} viewport
 * @property {boolean} [reducedMotion]
 * @property {boolean} [firstEntry]
 * @property {boolean} [touch]
 * @property {string} journey
 * @property {string} [targetScene]
 * @property {string} [actorId]
 * @property {readonly string[]} [actorIds]
 * @property {"chromium" | "webkit"} [browserName]
 * @property {boolean} [longTaskRequired]
 */

/** @param {QaRouteCase} route @returns {Readonly<Required<Pick<QaRouteCase, "key" | "workspace" | "hash" | "readySelector" | "geometryGroups" | "viewport" | "journey">> & QaRouteCase & {id: string, reducedMotion: boolean, firstEntry: boolean, touch: boolean}>} */
function qaCase({ key, id = key, reducedMotion = false, firstEntry = false, touch = false, ...definition }) {
  const geometryRequiredSelectors = definition.geometryRequiredSelectors ?? geometryRequirementsFor({ key, ...definition });
  return Object.freeze({ key, id, reducedMotion, firstEntry, touch, browserName: "chromium", ...definition, geometryRequiredSelectors });
}

export const CORE_ROUTE_CASES = Object.freeze([
  qaCase({
    key: "home-default", workspace: "home", hash: "#home?scene=living-terrain",
    readySelector: ".home-view-v74[data-scene='living-terrain']",
    finalReadySelector: ".home-view-v74[data-scene='living-terrain']", geometryGroups: GEOMETRY_GROUPS.home,
    viewport: { width: 1440, height: 920 }, firstEntry: true, journey: "home-scene", targetScene: "living-terrain",
  }),
  qaCase({
    key: "home-selected", workspace: "home", hash: "#home?scene=living-terrain",
    readySelector: ".home-view-v74[data-scene='living-terrain']",
    finalReadySelector: ".home-view-v74[data-scene='knowledge-gravity']", geometryGroups: GEOMETRY_GROUPS.home,
    viewport: { width: 1180, height: 720 }, journey: "home-scene", targetScene: "knowledge-gravity",
  }),
  qaCase({
    key: "agency-default", workspace: "agency", hash: "#agency?scene=system",
    readySelector: ".agency-view[data-scene='system']", finalReadySelector: ".agency-view[data-scene='system']",
    geometryGroups: GEOMETRY_GROUPS.agency, viewport: { width: 1280, height: 720 }, journey: "agency-system-roundtrip",
  }),
  qaCase({
    key: "agency-actor", workspace: "agency", hash: "#agency?scene=roles&actor=actor%3Acontrol-plane",
    readySelector: ".agency-view[data-scene='roles'] .agency-role-detail",
    finalReadySelector: ".agency-view[data-scene='roles'] .agency-role-detail", geometryGroups: GEOMETRY_GROUPS.agency,
    viewport: { width: 390, height: 844 }, touch: true, journey: "agency-actor", actorId: "actor:atlas-builder",
  }),
  qaCase({
    key: "explore", workspace: "explore", hash: "#explore?scene=districts",
    readySelector: ".explore-view, .mobile-explore", finalReadySelector: ".explore-view, .mobile-explore",
    geometryGroups: GEOMETRY_GROUPS.explore, viewport: { width: 320, height: 844 }, touch: true, journey: "explore-three-level",
  }),
  qaCase({
    key: "observe", workspace: "observe", hash: "#observe?scene=global-relations&layer=wikilink",
    readySelector: ".observe-view, .mobile-observe", finalReadySelector: ".observe-view, .mobile-observe",
    geometryGroups: GEOMETRY_GROUPS.observe, viewport: { width: 844, height: 390 }, touch: true, journey: "observe-relation",
  }),
  qaCase({
    key: "flow", workspace: "flow", hash: "#flow?scene=routes",
    readySelector: ".flow-view", finalReadySelector: ".flow-view",
    geometryGroups: GEOMETRY_GROUPS.flow, viewport: { width: 390, height: 844 }, touch: true, journey: "flow-verified-or-empty",
  }),
  qaCase({
    key: "time", workspace: "time", hash: "#time?scene=chronology",
    readySelector: ".time-view .time-honest-empty", finalReadySelector: ".time-view .time-honest-empty",
    geometryGroups: GEOMETRY_GROUPS.time, viewport: { width: 320, height: 844 }, touch: true, journey: "time-empty-public",
  }),
]);

const CI_ONLY_ROUTE_CASES = Object.freeze([
  qaCase({
    key: "home-activity", workspace: "home", hash: "#home?scene=living-terrain",
    readySelector: ".home-view-v74[data-scene='living-terrain']",
    finalReadySelector: ".home-view-v74[data-scene='verified-activity']", geometryGroups: GEOMETRY_GROUPS.home,
    viewport: { width: 1024, height: 768 }, reducedMotion: true, journey: "home-scene", targetScene: "verified-activity",
  }),
  qaCase({
    key: "home-coverage", workspace: "home", hash: "#home?scene=living-terrain",
    readySelector: ".home-view-v74[data-scene='living-terrain']",
    finalReadySelector: ".home-view-v74[data-scene='coverage-boundary']", geometryGroups: GEOMETRY_GROUPS.home,
    viewport: { width: 390, height: 844 }, touch: true, journey: "home-scene", targetScene: "coverage-boundary",
  }),
  qaCase({
    key: "agency-control-plane", workspace: "agency", hash: "#agency?scene=roles&actor=actor%3Aatlas-builder",
    readySelector: ".agency-view[data-scene='roles'] .agency-role-detail", finalReadySelector: ".agency-role-detail",
    geometryGroups: GEOMETRY_GROUPS.agency, viewport: { width: 1440, height: 920 }, journey: "agency-actor", actorId: "actor:control-plane",
  }),
  qaCase({
    key: "agency-evolution", workspace: "agency", hash: "#agency?scene=system",
    readySelector: ".agency-view[data-scene='system']", finalReadySelector: ".agency-view[data-scene='evolution'] .agency-evolution",
    geometryGroups: GEOMETRY_GROUPS.agency, viewport: { width: 768, height: 1024 }, reducedMotion: true,
    journey: "agency-scene", targetScene: "evolution",
  }),
  qaCase({
    key: "explore-hubs", workspace: "explore", hash: "#explore?scene=districts",
    readySelector: ".explore-level-columns[data-level='districts']", finalReadySelector: ".explore-level-columns[data-level='hubs']",
    geometryGroups: GEOMETRY_GROUPS.explore, viewport: { width: 1280, height: 720 }, journey: "explore-hubs",
  }),
  qaCase({
    key: "explore-sources", workspace: "explore", hash: "#explore?scene=districts",
    readySelector: ".explore-level-columns[data-level='districts']", finalReadySelector: ".explore-level-columns[data-level='sources']",
    geometryGroups: GEOMETRY_GROUPS.explore, viewport: { width: 768, height: 1024 }, journey: "explore-three-level",
  }),
  qaCase({
    key: "observe-hub", workspace: "observe", hash: "#observe?scene=hub-relations",
    readySelector: ".hub-relations-surface", finalReadySelector: ".hub-relations-surface",
    geometryGroups: GEOMETRY_GROUPS.observe, viewport: { width: 1180, height: 720 }, journey: "hub-relations",
  }),
  qaCase({
    key: "search-overlay", workspace: "search", hash: "#home?scene=living-terrain",
    readySelector: ".home-view-v74", finalReadySelector: ".search-dialog", geometryGroups: GEOMETRY_GROUPS.search,
    viewport: { width: 1440, height: 920 }, journey: "search-overlay",
  }),
  qaCase({
    key: "search-escape-focus", workspace: "home", hash: "#home?scene=living-terrain",
    readySelector: ".home-view-v74", finalReadySelector: ".home-view-v74", geometryGroups: GEOMETRY_GROUPS.home,
    viewport: { width: 390, height: 844 }, touch: true, journey: "search-escape-focus",
  }),
  qaCase({
    key: "data-overlay", workspace: "explore", hash: "#explore?scene=districts",
    readySelector: ".explore-view, .mobile-explore", finalReadySelector: ".data-tray", geometryGroups: GEOMETRY_GROUPS.dataOverlay,
    viewport: { width: 390, height: 844 }, touch: true, journey: "data-overlay",
  }),
  qaCase({
    key: "malformed-url", workspace: "observe", hash: "#observe?scene=bogus&focus=doc%3Amissing&pair=bogus&panel=bogus",
    readySelector: ".observe-view", finalReadySelector: ".global-journey-fallback",
    geometryGroups: GEOMETRY_GROUPS.observe, viewport: { width: 1280, height: 720 }, journey: "malformed-recovery",
  }),
  qaCase({
    key: "deep-link-reload", workspace: "explore", hash: "#explore?scene=districts",
    readySelector: ".explore-view, .mobile-explore", finalReadySelector: ".explore-view, .mobile-explore",
    geometryGroups: GEOMETRY_GROUPS.explore, viewport: { width: 390, height: 844 }, touch: true, journey: "focus-reload",
  }),
  qaCase({
    key: "history-back-forward", workspace: "home", hash: "#home?scene=living-terrain",
    readySelector: ".home-view-v74[data-scene='living-terrain']", finalReadySelector: ".home-view-v74[data-scene='knowledge-gravity']",
    geometryGroups: GEOMETRY_GROUPS.home, viewport: { width: 1440, height: 920 }, journey: "back-forward",
  }),
  qaCase({
    key: "keyboard-navigation", workspace: "observe", hash: "#explore?scene=districts",
    readySelector: ".explore-view, .mobile-explore", finalReadySelector: ".observe-view, .mobile-observe",
    geometryGroups: GEOMETRY_GROUPS.observe, viewport: { width: 1024, height: 768 }, journey: "keyboard-workspace",
  }),
  qaCase({
    key: "webkit-svg-focus", workspace: "explore", hash: "#explore?scene=districts",
    readySelector: "[data-testid='city-map']", finalReadySelector: "[data-testid='city-map']", geometryGroups: GEOMETRY_GROUPS.explore,
    viewport: { width: 1024, height: 768 }, browserName: "webkit", longTaskRequired: false, journey: "webkit-svg-focus",
  }),
  qaCase({
    key: "agency-all-actors", workspace: "agency", hash: "#agency?scene=roles&actor=actor%3Acontrol-plane",
    readySelector: ".agency-view[data-scene='roles'] .agency-role-detail", finalReadySelector: ".agency-role-detail",
    geometryGroups: GEOMETRY_GROUPS.agency, viewport: { width: 1440, height: 920 }, journey: "agency-actor-cycle",
    actorIds: ["actor:control-plane", "actor:daily-runner", "actor:atlas-builder", "actor:rocket-manager", "actor:groot-manager", "actor:intelligence-layer-manager"],
  }),
]);

export const CI_ROUTE_CASES = Object.freeze([...CORE_ROUTE_CASES, ...CI_ONLY_ROUTE_CASES]);

export function resolveQaPlan(environment = process.env) {
  const forbiddenOverrides = ["ATLAS_QA_ITERATIONS", "ATLAS_QA_WORKERS", "ATLAS_QA_ROUTES"]
    .filter((name) => environment[name] !== undefined);
  if (forbiddenOverrides.length > 0) {
    throw new Error(`QA policy overrides are forbidden: ${forbiddenOverrides.join(", ")}`);
  }

  const mode = environment.ATLAS_QA_MODE?.trim() || "dev";
  if (mode === "dev" || mode === "local-rc") return { mode, routes: CORE_ROUTE_CASES, iterations: 1, workers: 1, local: true };
  if (mode === "file-smoke") return { mode, routes: Object.freeze([CORE_ROUTE_CASES[0]]), iterations: 1, workers: 1, local: true };
  if (mode === "ci") {
    if (environment.GITHUB_ACTIONS !== "true") {
      throw new Error("ATLAS_QA_MODE=ci is permitted only when GITHUB_ACTIONS=true");
    }
    return { mode, routes: CI_ROUTE_CASES, iterations: 1, workers: 1, local: false };
  }
  throw new Error(`Unsupported ATLAS_QA_MODE: ${mode}`);
}

export function requiredAtlasUrl(environment = process.env, { allowFile = false } = {}) {
  const raw = environment.ATLAS_URL?.trim();
  if (!raw) throw new Error("ATLAS_URL is required; v7.4 QA never starts or discovers a web server");
  const parsed = new URL(raw);
  if (parsed.protocol === "file:" && allowFile) {
    if (parsed.username || parsed.password) throw new Error("ATLAS_URL must not contain credentials");
    parsed.hash = "";
    parsed.search = "";
    return parsed.href;
  }
  if (!new Set(["http:", "https:"]).has(parsed.protocol)) {
    throw new Error(`ATLAS_URL must use http or https${allowFile ? " or an explicit file-smoke URL" : ""}, received ${parsed.protocol}`);
  }
  if (parsed.username || parsed.password) throw new Error("ATLAS_URL must not contain credentials");
  parsed.hash = "";
  parsed.search = "";
  if (!parsed.pathname.endsWith("/")) parsed.pathname += "/";
  return parsed.href;
}

export function hasPngMagic(body) {
  return Buffer.isBuffer(body)
    && body.length >= 8
    && body.subarray(0, 8).toString("hex") === PNG_SIGNATURE_HEX;
}

export function evaluateGeometrySnapshot(snapshot) {
  const failures = [];
  if (snapshot.comparisonScope !== "global-cross-selector") failures.push("geometry-not-global-cross-selector");
  if (!Number.isInteger(snapshot.requiredTargetCount) || snapshot.requiredTargetCount < 1) failures.push("required-targets-empty");
  if (!Array.isArray(snapshot.selectorCoverage) || snapshot.selectorCoverage.length === 0) {
    failures.push("selector-coverage-missing");
  } else {
    const requiredCoverage = snapshot.selectorCoverage.filter((entry) => entry.applicability === "required");
    if (requiredCoverage.length === 0) failures.push("required-selector-contract-empty");
    for (const entry of requiredCoverage) {
      if (!Number.isInteger(entry.matchedCount) || !Number.isInteger(entry.renderedCount)) {
        failures.push(`required-selector-count-invalid:${entry.selector}`);
      } else if (entry.matchedCount < 1 || entry.renderedCount < 1) {
        failures.push(`required-selector-unmatched:${entry.selector}`);
      }
    }
  }
  if ((snapshot.overlaps ?? []).length !== 0) failures.push("required-target-overlap");
  if ((snapshot.clipped ?? []).length !== 0) failures.push("required-target-clipped");
  if ((snapshot.undersizedText ?? []).length !== 0) failures.push("required-ui-under-12px");
  if (snapshot.horizontalOverflow !== 0) failures.push("page-horizontal-overflow");
  if (snapshot.homeHeadline?.applicable && !snapshot.homeHeadline.present) failures.push("desktop-home-headline-missing");
  if (snapshot.homeHeadline?.applicable && snapshot.homeHeadline.lineCount > 3) failures.push("desktop-home-headline-over-three-lines");
  if (snapshot.mobileHome?.applicable && !snapshot.mobileHome.terrainPresent) failures.push("mobile-home-terrain-missing");
  if (snapshot.mobileHome?.applicable && !snapshot.mobileHome.terrainBeginsInFirstViewport) failures.push("mobile-home-terrain-below-first-viewport");
  if (snapshot.mobileNavigation?.applicable && !snapshot.mobileNavigation.visible) failures.push("mobile-navigation-not-visible");
  if (snapshot.mobileNavigation?.applicable && !snapshot.mobileNavigation.reachable) failures.push("mobile-navigation-not-reachable");
  if (snapshot.mobileNavigation?.applicable && snapshot.mobileNavigation.buttonCount !== 5) failures.push("mobile-navigation-item-count");
  if (snapshot.mobileNavigation?.applicable && snapshot.mobileNavigation.minimumTargetSize < 44) failures.push("mobile-navigation-target-under-44px");
  if (snapshot.mobileSibling?.applicable && !snapshot.mobileSibling.visible) failures.push("mobile-sibling-not-visible");
  if (snapshot.mobileSibling?.applicable && !snapshot.mobileSibling.reachable) failures.push("mobile-sibling-not-reachable");
  if (snapshot.mobileInteractive?.applicable && snapshot.mobileInteractive.checkedCount < 1) failures.push("mobile-interactive-contract-empty");
  if (snapshot.mobileInteractive?.applicable && (snapshot.mobileInteractive.undersized ?? []).length > 0) {
    failures.push("mobile-interactive-target-under-44px");
  }
  return { pass: failures.length === 0, failures };
}

export function evaluateAccessibilitySnapshot(snapshot) {
  const failures = [];
  if ((snapshot.violations ?? []).length !== 0) failures.push("axe-wcag-violation");
  if ((snapshot.bodyPrivacyFindings ?? []).length !== 0) failures.push("rendered-body-privacy-exposure");
  if ((snapshot.bodyOperatingFindings ?? []).length !== 0) failures.push("rendered-body-operating-exposure");
  if ((snapshot.domPrivacyFindings ?? []).length !== 0) failures.push("rendered-dom-privacy-exposure");
  if ((snapshot.domOperatingFindings ?? []).length !== 0) failures.push("rendered-dom-operating-exposure");
  if ((snapshot.ariaPrivacyFindings ?? []).length !== 0) failures.push("aria-snapshot-privacy-exposure");
  if ((snapshot.ariaOperatingFindings ?? []).length !== 0) failures.push("aria-snapshot-operating-exposure");
  const language = snapshot.languageContract;
  if (!language) failures.push("language-contract-missing");
  else {
    if (language.htmlLang !== "en") failures.push("document-language-not-en");
    if (language.commandBarLang !== "en") failures.push("product-chrome-language-not-en");
    if (language.workspaceMainLang !== "ko") failures.push("workspace-content-language-not-ko");
    if ((language.overlayLanguages ?? []).some((entry) => entry.lang !== "ko")) failures.push("overlay-content-language-not-ko");
    if ((language.chromeControls ?? []).some((entry) => !entry.found || !entry.labelConsistent)) {
      failures.push("english-chrome-label-aria-mismatch");
    }
  }
  return { pass: failures.length === 0, failures };
}

function nearestRank(values, percentile) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * percentile) - 1)];
}

function metricSummary(values) {
  const usable = values.filter(Number.isFinite);
  return {
    samples: usable.length,
    median: nearestRank(usable, 0.5),
    p95: nearestRank(usable, 0.95),
    maximum: usable.length > 0 ? Math.max(...usable) : null,
  };
}

export function evaluatePerformanceResults(results) {
  const readiness = metricSummary(results.map((result) => result.performance?.readinessMs));
  const interaction = metricSummary(results.map((result) => result.performance?.interactionMs));
  const longTaskRequiredResults = results.filter((result) => result.longTaskRequired !== false);
  const longTaskSamples = longTaskRequiredResults.map((result) => result.performance?.longTasks).filter((item) => item?.supported);
  const longTaskCount = longTaskSamples.reduce((sum, item) => sum + item.count, 0);
  const longTaskTotalMs = longTaskSamples.reduce((sum, item) => sum + item.totalMs, 0);
  const longTaskMaximumMs = longTaskSamples.length > 0 ? Math.max(0, ...longTaskSamples.map((item) => item.maximumMs)) : 0;
  const divisor = Math.max(1, longTaskSamples.length);
  const rows = [
    { id: "readiness-median", actual: readiness.median, limit: QA_PERFORMANCE_BUDGETS.readinessMedianMs, pass: readiness.median !== null && readiness.median <= QA_PERFORMANCE_BUDGETS.readinessMedianMs },
    { id: "readiness-p95", actual: readiness.p95, limit: QA_PERFORMANCE_BUDGETS.readinessP95Ms, pass: readiness.p95 !== null && readiness.p95 <= QA_PERFORMANCE_BUDGETS.readinessP95Ms },
    { id: "interaction-median", actual: interaction.median, limit: QA_PERFORMANCE_BUDGETS.interactionMedianMs, pass: interaction.median !== null && interaction.median <= QA_PERFORMANCE_BUDGETS.interactionMedianMs },
    { id: "interaction-p95", actual: interaction.p95, limit: QA_PERFORMANCE_BUDGETS.interactionP95Ms, pass: interaction.p95 !== null && interaction.p95 <= QA_PERFORMANCE_BUDGETS.interactionP95Ms },
    { id: "long-task-observer-coverage", actual: longTaskSamples.length, limit: longTaskRequiredResults.length, pass: longTaskRequiredResults.length > 0 && longTaskSamples.length === longTaskRequiredResults.length },
    { id: "long-task-count-per-result", actual: longTaskCount / divisor, limit: QA_PERFORMANCE_BUDGETS.maximumLongTaskCountPerResult, pass: longTaskCount / divisor <= QA_PERFORMANCE_BUDGETS.maximumLongTaskCountPerResult },
    { id: "long-task-total-ms-per-result", actual: longTaskTotalMs / divisor, limit: QA_PERFORMANCE_BUDGETS.maximumLongTaskTotalMsPerResult, pass: longTaskTotalMs / divisor <= QA_PERFORMANCE_BUDGETS.maximumLongTaskTotalMsPerResult },
    { id: "long-task-maximum-ms", actual: longTaskMaximumMs, limit: QA_PERFORMANCE_BUDGETS.maximumSingleLongTaskMs, pass: longTaskMaximumMs <= QA_PERFORMANCE_BUDGETS.maximumSingleLongTaskMs },
  ];
  return {
    pass: rows.every((row) => row.pass),
    budgets: QA_PERFORMANCE_BUDGETS,
    readiness,
    interaction,
    longTasks: {
      observerSupportedResults: longTaskSamples.length,
      count: longTaskCount,
      totalMs: longTaskTotalMs,
      maximumMs: longTaskMaximumMs,
      countPerResult: longTaskCount / divisor,
      totalMsPerResult: longTaskTotalMs / divisor,
    },
    rows,
  };
}

export function evaluateLifecycleGates(lifecycle) {
  const failures = [];
  if (lifecycle.browsersOpened !== lifecycle.browsersClosed) failures.push("browser-open-close-parity");
  if (lifecycle.contextsOpened !== lifecycle.contextsClosed) failures.push("context-open-close-parity");
  if (lifecycle.pagesOpened !== lifecycle.pagesClosed) failures.push("page-open-close-parity");
  if (lifecycle.monitorsStarted !== lifecycle.monitorsStopped) failures.push("monitor-open-close-parity");
  if ((lifecycle.residualPids ?? []).length !== 0) failures.push("residual-owned-pid");
  return { pass: failures.length === 0, failures };
}

export function parseThermalPressure(output) {
  const text = String(output ?? "");
  const values = [...text.matchAll(/(?:CPU_Speed_Limit|CPU_Scheduler_Limit)\s*=\s*(\d+)/g)]
    .map((match) => Number(match[1]));
  const thermalLevel = Number(text.match(/Thermal_Level\s*=\s*(\d+)/)?.[1] ?? 0);
  const warningText = /thermal[^\n]*(?:warning|critical|urgent)/i.test(text)
    && !/no thermal warning/i.test(text);
  return {
    warning: warningText || thermalLevel > 0 || values.some((value) => value < 100),
    limits: values,
    thermalLevel,
  };
}

export function parseMemoryPressure(output) {
  const text = String(output ?? "");
  const freePercentage = Number(text.match(/System-wide memory free percentage:\s*(\d+)%/i)?.[1] ?? Number.NaN);
  const warningText = /(?:critical|urgent|warning)\s+(?:memory\s+)?pressure/i.test(text)
    && !/no\s+(?:memory\s+)?pressure/i.test(text);
  return {
    warning: warningText || (Number.isFinite(freePercentage) && freePercentage <= 5),
    freePercentage: Number.isFinite(freePercentage) ? freePercentage : null,
  };
}

function sha256(body) {
  return createHash("sha256").update(body).digest("hex");
}

function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function ownerQaBindingForPlan(plan, environment) {
  if (plan.mode !== "local-rc") return null;
  const expectedPath = path.join(projectDir, "artifacts", "v7-4-owner-qa", "owner-contract-qa.json");
  const supplied = environment.ATLAS_OWNER_QA_RECEIPT?.trim();
  if (!supplied || path.resolve(supplied) !== expectedPath) {
    throw new Error("Local RC requires the exact owner-local QA receipt before browser work.");
  }
  const body = await readFile(expectedPath);
  const receipt = JSON.parse(body.toString("utf8"));
  if (receipt.schema !== "homi.atlas_v7_4.owner_contract_qa.v1"
    || receipt.profile !== "owner-local"
    || receipt.verdict !== "pass"
    || receipt.ownerBytesEnteredCi !== false
    || receipt.testResults?.failed !== 0
    || receipt.testResults?.pending !== 0
    || receipt.testResults?.passed !== receipt.testResults?.total) {
    throw new Error("Local RC owner-local QA receipt is incomplete or not PASS.");
  }
  const reportPath = path.resolve(projectDir, receipt.report?.path ?? "");
  const expectedReportRoot = path.join(projectDir, "artifacts", "v7-4-owner-qa");
  if (!reportPath.startsWith(`${expectedReportRoot}${path.sep}`)) {
    throw new Error("Local RC owner QA report path escaped its evidence boundary.");
  }
  const reportBody = await readFile(reportPath);
  if (receipt.report.bytes !== reportBody.length || receipt.report.sha256 !== sha256(reportBody)) {
    throw new Error("Local RC owner QA report bytes differ from the bound receipt.");
  }
  return {
    schema: receipt.schema,
    verdict: receipt.verdict,
    receiptPath: path.relative(projectDir, expectedPath).replaceAll(path.sep, "/"),
    receiptBytes: body.length,
    receiptSha256: sha256(body),
    report: receipt.report,
    testResults: receipt.testResults,
  };
}

function safeName(value) {
  return value.replace(/[^a-z0-9-]/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}

function isProbeProcess(command) {
  return /(?:^|\/)ps(?:\s|$)|(?:^|\/)pmset(?:\s|$)|memory_pressure(?:\s|$)/.test(command);
}

async function processTable() {
  const { stdout } = await execFileAsync("ps", ["-axo", "pid=,ppid=,rss=,%cpu=,command="], {
    maxBuffer: 8 * 1024 * 1024,
  });
  return String(stdout).split("\n").flatMap((line) => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)\s+(.+)$/);
    if (!match) return [];
    return [{
      pid: Number(match[1]),
      ppid: Number(match[2]),
      rssBytes: Number(match[3]) * 1024,
      cpuPercent: Number(match[4]),
      command: match[5],
    }];
  });
}

function descendantsOf(rows, rootPid) {
  const byParent = new Map();
  for (const row of rows) {
    const siblings = byParent.get(row.ppid) ?? [];
    siblings.push(row);
    byParent.set(row.ppid, siblings);
  }
  const selected = [];
  const pending = [rootPid];
  const seen = new Set();
  while (pending.length > 0) {
    const parent = pending.shift();
    if (seen.has(parent)) continue;
    seen.add(parent);
    const own = rows.find((row) => row.pid === parent);
    if (own) selected.push(own);
    for (const child of byParent.get(parent) ?? []) pending.push(child.pid);
  }
  return selected;
}

async function macPressureProbe() {
  if (process.platform !== "darwin") return { supported: false, memory: null, thermal: null };
  const [thermal, memory] = await Promise.all([
    execFileAsync("/usr/bin/pmset", ["-g", "therm"]).then(({ stdout }) => parseThermalPressure(stdout)).catch(() => ({ warning: false, unavailable: true })),
    execFileAsync("/usr/bin/memory_pressure", ["-Q"]).then(({ stdout }) => parseMemoryPressure(stdout)).catch(() => ({ warning: false, unavailable: true })),
  ]);
  return { supported: true, memory, thermal };
}

async function createResourceMonitor({ local, startedAtMs, baselinePids, startedProcesses, onStop }) {
  let timer = null;
  let inFlight = null;
  let stopped = false;
  let stopReason = null;
  let highCpuSeconds = 0;
  let lastPressureProbe = 0;
  const samples = [];
  let peakOwnedRssBytes = 0;
  let peakOwnedCpuPercent = 0;
  let minimumFreeMemoryBytes = Number.POSITIVE_INFINITY;
  let latestPressure = { supported: process.platform === "darwin", memory: null, thermal: null };

  async function tick() {
    if (stopped || inFlight) return;
    inFlight = (async () => {
      const rows = await processTable();
      const owned = descendantsOf(rows, process.pid).filter((row) => !isProbeProcess(row.command));
      for (const row of owned) {
        if (row.pid !== process.pid && !baselinePids.has(row.pid)) startedProcesses.set(row.pid, row.command);
      }
      const ownedRssBytes = owned.reduce((sum, row) => sum + row.rssBytes, 0);
      const ownedCpuPercent = owned.reduce((sum, row) => sum + row.cpuPercent, 0);
      const freeMemoryBytes = os.freemem();
      const elapsedMs = Date.now() - startedAtMs;
      peakOwnedRssBytes = Math.max(peakOwnedRssBytes, ownedRssBytes);
      peakOwnedCpuPercent = Math.max(peakOwnedCpuPercent, ownedCpuPercent);
      minimumFreeMemoryBytes = Math.min(minimumFreeMemoryBytes, freeMemoryBytes);
      highCpuSeconds = ownedCpuPercent > LOCAL_RESOURCE_POLICY.maximumOwnedCpuPercent ? highCpuSeconds + 1 : 0;

      if (local && Date.now() - lastPressureProbe >= LOCAL_RESOURCE_POLICY.pressureProbeIntervalMs) {
        lastPressureProbe = Date.now();
        latestPressure = await macPressureProbe();
      }

      const sample = {
        at: new Date().toISOString(),
        elapsedMs,
        ownedRssBytes,
        ownedCpuPercent,
        freeMemoryBytes,
        ownedPidCount: owned.length,
        highCpuSeconds,
        memoryPressureWarning: Boolean(latestPressure.memory?.warning),
        thermalWarning: Boolean(latestPressure.thermal?.warning),
      };
      samples.push(sample);
      if (samples.length > 900) samples.shift();

      if (!local || stopReason) return;
      if (elapsedMs > LOCAL_RESOURCE_POLICY.maximumDurationMs) stopReason = "local-duration-over-12-minutes";
      else if (ownedRssBytes > LOCAL_RESOURCE_POLICY.maximumOwnedRssBytes) stopReason = "owned-rss-over-1.5-gib";
      else if (freeMemoryBytes < LOCAL_RESOURCE_POLICY.minimumFreeMemoryBytes) stopReason = "free-memory-under-2-gib";
      else if (highCpuSeconds >= LOCAL_RESOURCE_POLICY.maximumOwnedCpuConsecutiveSeconds) stopReason = "owned-cpu-over-250-percent-for-10-seconds";
      else if (latestPressure.memory?.warning) stopReason = "memory-pressure-warning";
      else if (latestPressure.thermal?.warning) stopReason = "thermal-warning";
      if (stopReason) await onStop(stopReason);
    })().finally(() => { inFlight = null; });
    await inFlight;
  }

  await tick();
  timer = setInterval(() => { void tick(); }, LOCAL_RESOURCE_POLICY.sampleIntervalMs);
  return {
    get stopReason() { return stopReason; },
    throwIfStopped() {
      if (stopReason) throw new Error(`Resource-safe QA stopped: ${stopReason}`);
    },
    async stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      if (inFlight) await inFlight;
    },
    report() {
      return {
        policy: local ? LOCAL_RESOURCE_POLICY : { localThresholdsApplied: false },
        samples,
        peakOwnedRssBytes,
        peakOwnedCpuPercent,
        minimumFreeMemoryBytes: Number.isFinite(minimumFreeMemoryBytes) ? minimumFreeMemoryBytes : null,
        stopReason,
        latestPressure,
      };
    },
  };
}

async function measureGeometry(page, groupSelectors, route) {
  return page.evaluate(({ selectors, requiredSelectors, workspace, mobileNavigationRequired, mobileSiblingRequired }) => {
    const isRendered = (node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0
        && rect.width > 0 && rect.height > 0 && !node.closest(".sr-only,[aria-hidden='true']");
    };
    const label = (node) => node.getAttribute("aria-label") || node.textContent?.trim().replace(/\s+/g, " ").slice(0, 120) || node.tagName;
    const rectOf = (node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    const selectorMembership = new Map();
    const selectorCoverage = [];
    const selectorsToMeasure = [...new Set([...selectors, ...requiredSelectors])];
    const requiredSelectorSet = new Set(requiredSelectors);
    for (const selector of selectorsToMeasure) {
      const matched = [...document.querySelectorAll(selector)];
      const nodes = matched.filter(isRendered);
      selectorCoverage.push({
        selector,
        applicability: requiredSelectorSet.has(selector) ? "required" : "contextual",
        matchedCount: matched.length,
        renderedCount: nodes.length,
      });
      for (const node of nodes) {
        const memberships = selectorMembership.get(node) ?? [];
        memberships.push(selector);
        selectorMembership.set(node, memberships);
      }
    }
    const required = [...selectorMembership.keys()];
    const overlaps = [];
    for (let left = 0; left < required.length; left += 1) {
      for (let right = left + 1; right < required.length; right += 1) {
        const aNode = required[left];
        const bNode = required[right];
        if (aNode.contains(bNode) || bNode.contains(aNode)) continue;
        const a = aNode.getBoundingClientRect();
        const b = bNode.getBoundingClientRect();
        const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (width > 0.5 && height > 0.5) {
          overlaps.push({
            a: label(aNode),
            b: label(bNode),
            aSelectors: selectorMembership.get(aNode),
            bSelectors: selectorMembership.get(bNode),
            crossSelector: !(selectorMembership.get(aNode) ?? []).some((value) => (selectorMembership.get(bNode) ?? []).includes(value)),
            width,
            height,
          });
        }
      }
    }

    const clipped = [];
    for (const node of required) {
      const rect = node.getBoundingClientRect();
      const ownStyle = getComputedStyle(node);
      const ownClipX = ownStyle.overflowX === "hidden" || ownStyle.overflowX === "clip";
      const ownClipY = ownStyle.overflowY === "hidden" || ownStyle.overflowY === "clip";
      const ownText = node.textContent?.trim();
      if (ownText && ((ownClipX && node.scrollWidth > node.clientWidth + 0.5)
        || (ownClipY && node.scrollHeight > node.clientHeight + 0.5))) {
        clipped.push({ target: label(node), ancestor: "self", rect: rectOf(node), boundary: rectOf(node) });
        continue;
      }
      let ancestor = node.parentElement;
      while (ancestor && ancestor !== document.body) {
        const style = getComputedStyle(ancestor);
        const clipX = style.overflowX === "hidden" || style.overflowX === "clip";
        const clipY = style.overflowY === "hidden" || style.overflowY === "clip";
        if (clipX || clipY) {
          const boundary = ancestor.getBoundingClientRect();
          if ((clipX && (rect.left < boundary.left - 0.5 || rect.right > boundary.right + 0.5))
            || (clipY && (rect.top < boundary.top - 0.5 || rect.bottom > boundary.bottom + 0.5))) {
            clipped.push({ target: label(node), ancestor: label(ancestor), rect: rectOf(node), boundary: rectOf(ancestor) });
            break;
          }
        }
        ancestor = ancestor.parentElement;
      }
    }

    const textSelector = [
      ".atlas-app button", ".atlas-app a", ".atlas-app label", ".atlas-app input",
      ".atlas-app h1", ".atlas-app h2", ".atlas-app h3", ".atlas-app h4",
      ".atlas-app p", ".atlas-app dt", ".atlas-app dd", ".atlas-app li",
      ".atlas-app small", ".atlas-app span", ".atlas-app [role='button']", ".atlas-app svg text",
    ].join(",");
    const undersizedText = [...document.querySelectorAll(textSelector)]
      .filter(isRendered)
      .filter((node) => (node.textContent?.trim() || node.getAttribute("aria-label") || node.getAttribute("placeholder")))
      .flatMap((node) => {
        const size = Number.parseFloat(getComputedStyle(node).fontSize);
        return size < 12 ? [{ target: label(node), fontSize: size }] : [];
      });
    const bodyWidth = document.body.scrollWidth;
    const rootWidth = document.documentElement.scrollWidth;
    const mobileSibling = matchMedia("(max-width: 820px), (max-width: 900px) and (max-height: 520px)").matches;
    const headline = document.querySelector(".home-v74-copy h1");
    const lineCount = (() => {
      if (!headline || !isRendered(headline)) return 0;
      const tops = [];
      const walker = document.createTreeWalker(headline, NodeFilter.SHOW_TEXT);
      let textNode = walker.nextNode();
      while (textNode) {
        for (let index = 0; index < (textNode.textContent?.length ?? 0); index += 1) {
          const range = document.createRange();
          range.setStart(textNode, index);
          range.setEnd(textNode, index + 1);
          for (const rect of range.getClientRects()) {
            if (rect.width > 0 && rect.height > 0 && !tops.some((top) => Math.abs(top - rect.top) < 1)) tops.push(rect.top);
          }
        }
        textNode = walker.nextNode();
      }
      return tops.length;
    })();
    const terrain = document.querySelector(".living-terrain");
    const terrainRect = terrain?.getBoundingClientRect();
    const navigation = document.querySelector(".mobile-navigation");
    const navigationRect = navigation?.getBoundingClientRect();
    const navigationButtons = navigation ? [...navigation.querySelectorAll("button")].filter(isRendered) : [];
    const navigationMinimumTarget = navigationButtons.length > 0
      ? Math.min(...navigationButtons.map((node) => Math.min(node.getBoundingClientRect().width, node.getBoundingClientRect().height)))
      : 0;
    const sibling = document.querySelector(".mobile-sibling");
    const siblingRect = sibling?.getBoundingClientRect();
    const mobileInteractiveNodes = mobileSibling
      ? [...document.querySelectorAll(".atlas-app button:not([disabled]), .atlas-app a[href], .atlas-app input:not([disabled]), .atlas-app select:not([disabled]), .atlas-app textarea:not([disabled]), .atlas-app [role='button']:not([aria-disabled='true'])")]
        .filter(isRendered)
      : [];
    const undersizedInteractive = mobileInteractiveNodes.flatMap((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width < 44 || rect.height < 44
        ? [{ target: label(node), width: rect.width, height: rect.height }]
        : [];
    });
    return {
      comparisonScope: "global-cross-selector",
      requiredTargetCount: required.length,
      selectorCoverage,
      overlaps,
      clipped,
      undersizedText,
      viewportWidth: innerWidth,
      bodyScrollWidth: bodyWidth,
      documentScrollWidth: rootWidth,
      horizontalOverflow: Math.max(0, bodyWidth - innerWidth, rootWidth - innerWidth),
      homeHeadline: {
        applicable: workspace === "home" && !mobileSibling,
        present: Boolean(headline && isRendered(headline)),
        lineCount,
      },
      mobileHome: {
        applicable: workspace === "home" && mobileSibling,
        terrainPresent: Boolean(terrain && terrainRect && isRendered(terrain)),
        terrainTop: terrainRect?.top ?? null,
        terrainBeginsInFirstViewport: Boolean(terrainRect && terrainRect.top >= -0.5 && terrainRect.top < innerHeight),
      },
      mobileNavigation: {
        applicable: mobileSibling && mobileNavigationRequired,
        visible: Boolean(navigation && navigationRect && isRendered(navigation)),
        reachable: Boolean(navigationRect && navigationRect.top >= -0.5 && navigationRect.bottom <= innerHeight + 0.5),
        buttonCount: navigationButtons.length,
        minimumTargetSize: navigationMinimumTarget,
      },
      mobileSibling: {
        applicable: mobileSibling && mobileSiblingRequired,
        visible: Boolean(sibling && siblingRect && isRendered(sibling)),
        reachable: Boolean(siblingRect && siblingRect.top < innerHeight && siblingRect.bottom > 0),
        top: siblingRect?.top ?? null,
      },
      mobileInteractive: {
        applicable: mobileSibling,
        checkedCount: mobileInteractiveNodes.length,
        undersized: undersizedInteractive,
      },
    };
  }, {
    selectors: groupSelectors,
    requiredSelectors: route.geometryRequiredSelectors,
    workspace: route.workspace,
    mobileNavigationRequired: route.workspace !== "search" && route.journey !== "data-overlay",
    mobileSiblingRequired: ["explore", "observe", "flow", "time"].includes(route.workspace) && route.journey !== "data-overlay",
  });
}

export async function settleRenderedPage(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function activateLocator(page, locator, touch) {
  const target = locator.first();
  await target.waitFor({ state: "visible" });
  await target.scrollIntoViewIfNeeded();
  if (!touch) {
    await target.click();
    return;
  }
  const box = await target.boundingBox();
  if (!box) throw new Error("Touch target has no rendered bounding box");
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}

function actorLabel(actorId) {
  return ({
    "actor:control-plane": "Control Plane",
    "actor:daily-runner": "Daily Runner",
    "actor:atlas-builder": "Atlas Builder",
    "actor:rocket-manager": "Rocket Manager",
    "actor:groot-manager": "Groot Manager",
    "actor:intelligence-layer-manager": "Intelligence Layer Manager",
  })[actorId];
}

export async function executeJourney(page, route) {
  const startedAt = Date.now();
  const details = { journey: route.journey };
  const homeSceneIndex = {
    "living-terrain": 0,
    "knowledge-gravity": 1,
    "verified-activity": 2,
    "coverage-boundary": 3,
  };
  const agencySceneIndex = { system: 0, roles: 1, evolution: 2 };

  if (route.journey === "home-scene") {
    await activateLocator(page, page.locator(".v74-scene-rail > button").nth(homeSceneIndex[route.targetScene]), route.touch);
    await page.locator(`.home-view-v74[data-scene='${route.targetScene}']`).waitFor({ state: "visible" });
    details.scene = route.targetScene;
  } else if (route.journey === "agency-system-roundtrip") {
    await activateLocator(page, page.locator(".agency-scene-rail > button").nth(agencySceneIndex.roles), false);
    await page.locator(".agency-view[data-scene='roles']").waitFor({ state: "visible" });
    await activateLocator(page, page.locator(".agency-scene-rail > button").nth(agencySceneIndex.system), false);
    await page.locator(".agency-view[data-scene='system']").waitFor({ state: "visible" });
    details.sceneSequence = ["roles", "system"];
  } else if (route.journey === "agency-scene") {
    await activateLocator(page, page.locator(".agency-scene-rail > button").nth(agencySceneIndex[route.targetScene]), route.touch);
    await page.locator(`.agency-view[data-scene='${route.targetScene}']`).waitFor({ state: "visible" });
    details.scene = route.targetScene;
  } else if (route.journey === "agency-actor") {
    const label = actorLabel(route.actorId);
    if (!label) throw new Error(`Unknown actor journey target: ${route.actorId}`);
    await activateLocator(page, page.locator(".agency-actor-row:visible").filter({ hasText: label }), route.touch);
    await page.waitForFunction((expectedActor) => new URLSearchParams(location.hash.split("?")[1] ?? "").get("actor") === expectedActor, route.actorId);
    const roleTitle = page.locator("#agency-role-detail-title");
    await roleTitle.waitFor({ state: "visible" });
    if ((await roleTitle.innerText()).trim() !== label) throw new Error(`Agency actor selection did not resolve ${label}`);
    details.actorId = route.actorId;
  } else if (route.journey === "agency-actor-cycle") {
    const actorIds = route.actorIds ?? [];
    if (actorIds.length !== 6) throw new Error("Agency actor cycle must bind all six public roles");
    const visited = [];
    for (const actorId of actorIds) {
      const label = actorLabel(actorId);
      if (!label) throw new Error(`Unknown actor journey target: ${actorId}`);
      await activateLocator(page, page.locator(".agency-actor-row:visible").filter({ hasText: label }), false);
      await page.waitForFunction((expectedActor) => new URLSearchParams(location.hash.split("?")[1] ?? "").get("actor") === expectedActor, actorId);
      const roleTitle = page.locator("#agency-role-detail-title");
      await roleTitle.waitFor({ state: "visible" });
      if ((await roleTitle.innerText()).trim() !== label) throw new Error(`Agency actor selection did not resolve ${label}`);
      visited.push(actorId);
    }
    details.actorIds = visited;
  } else if (route.journey === "explore-hubs" || route.journey === "explore-three-level") {
    const district = page.locator(".explore-level-columns > section:nth-of-type(1) .explore-node-list button:visible");
    await activateLocator(page, district, route.touch);
    await page.locator(".explore-level-columns[data-level='hubs']").waitFor({ state: "visible" });
    details.levels = ["districts", "hubs"];
    if (route.journey === "explore-three-level") {
      const hub = page.locator(".explore-level-columns > section:nth-of-type(2) .explore-node-list button:visible");
      await activateLocator(page, hub, route.touch);
      await page.locator(".explore-level-columns[data-level='sources']").waitFor({ state: "visible" });
      details.levels.push("sources");
      details.sources = await page.locator(".explore-level-columns > section:nth-of-type(3) .explore-node-list button:visible").count();
      details.honestEmpty = await page.locator(".explore-level-columns > section:nth-of-type(3) .explore-level-empty:visible").count() === 1;
      if (details.sources === 0 && !details.honestEmpty) throw new Error("Explore Sources exposed neither approved sources nor its honest boundary state");
    }
  } else if (route.journey === "explore-focus") {
    const target = page.locator(".mobile-district-map button:visible, .city-district-anchor[role='button']:visible");
    await activateLocator(page, target, route.touch);
    await page.waitForFunction(() => Boolean(new URLSearchParams(location.hash.split("?")[1] ?? "").get("focus")));
    details.focus = await page.evaluate(() => new URLSearchParams(location.hash.split("?")[1] ?? "").get("focus"));
  } else if (route.journey === "observe-relation" || route.journey === "touch-observe-relation") {
    const target = page.locator(".mobile-ranked-list > button:visible, [data-testid='relation-matrix'] .matrix-cell[role='button']:visible");
    await activateLocator(page, target, route.touch || route.journey === "touch-observe-relation");
    await page.waitForFunction(() => Boolean(new URLSearchParams(location.hash.split("?")[1] ?? "").get("pair")));
    details.pair = await page.evaluate(() => new URLSearchParams(location.hash.split("?")[1] ?? "").get("pair"));
  } else if (route.journey === "flow-verified-or-empty") {
    const emptyCount = await page.locator(".flow-honest-empty:visible").count();
    const routeCount = await page.locator(".route-rail > button:visible").count();
    const metroCount = await page.locator("[data-testid='vault-metro']:visible").count();
    if (emptyCount === 1) {
      if (routeCount !== 0 || metroCount !== 0) throw new Error("Flow empty state retained clickable or drawn zero-member routes");
      details.mode = "honest-empty";
    } else {
      if (routeCount < 1 || metroCount !== 1) throw new Error("Flow must render only verified member-bearing routes");
      const target = page.locator(".mobile-route-switch > button:not(.is-active):visible, .route-rail > button:not(.is-active):visible");
      if (await target.count()) {
        await activateLocator(page, target, route.touch);
        await page.waitForFunction(() => Boolean(new URLSearchParams(location.hash.split("?")[1] ?? "").get("route")));
      }
      details.mode = "verified-routes";
      details.routeCount = routeCount;
    }
    const flowText = await page.locator(".flow-view").innerText();
    if (/역할 경계\s*\d+|새로 생김 집계|미확정 변화/.test(flowText)) throw new Error("Flow rendered a prohibited generated placeholder");
  } else if (route.journey === "time-empty-public") {
    const empty = page.locator(".time-honest-empty:visible");
    if (await empty.count() !== 1) throw new Error("Public Time must render the honest chronology boundary");
    if (await page.locator(".era-rail:visible, [data-testid='era-small-multiples']:visible").count() !== 0) {
      throw new Error("Public Time empty state retained fabricated lifecycle controls");
    }
    const timeText = await page.locator(".time-view").innerText();
    if (/새로 생김 집계\s*\d+|미확정 변화\s*\d+|소멸 집계\s*\d+/.test(timeText)) throw new Error("Time rendered a prohibited generated placeholder");
    details.mode = "honest-empty-not-zero";
  } else if (route.journey === "time-era") {
    const before = await page.evaluate(() => new URLSearchParams(location.hash.split("?")[1] ?? "").get("era"));
    const target = page.locator(".mobile-era-scrubber > button:not(.is-active):visible, .era-rail > button:not(.is-active):visible");
    await activateLocator(page, target, route.touch);
    await page.waitForFunction((previous) => {
      const current = new URLSearchParams(location.hash.split("?")[1] ?? "").get("era");
      return Boolean(current && current !== previous);
    }, before);
    details.era = await page.evaluate(() => new URLSearchParams(location.hash.split("?")[1] ?? "").get("era"));
  } else if (route.journey === "search-overlay") {
    await page.locator(".search-trigger").focus();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
    await page.locator(".search-dialog").waitFor({ state: "visible" });
    await page.waitForFunction(() => document.activeElement?.id === "atlas-search-input");
    await page.locator("#atlas-search-input").fill("Atlas");
    details.overlay = "search";
  } else if (route.journey === "search-escape-focus") {
    const trigger = page.locator(".search-trigger");
    await trigger.focus();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
    await page.locator(".search-dialog").waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    await page.locator(".search-dialog").waitFor({ state: "detached" });
    await page.waitForFunction(() => document.activeElement?.classList.contains("search-trigger"));
    details.focusRestored = true;
  } else if (route.journey === "data-overlay") {
    await activateLocator(page, page.locator(".mobile-data-trigger:visible, #data-trigger:visible"), route.touch);
    await page.locator(".data-tray").waitFor({ state: "visible" });
    details.overlay = "data";
  } else if (route.journey === "malformed-recovery") {
    await page.locator(".global-journey-fallback").waitFor({ state: "visible" });
    await page.locator(".brand-lockup").focus();
    await page.keyboard.press("Tab");
    details.safeWorkspace = await page.locator(".atlas-app").getAttribute("data-workspace");
    if (details.safeWorkspace !== route.workspace) throw new Error(`Malformed URL did not recover to ${route.workspace}`);
  } else if (route.journey === "focus-reload") {
    const target = page.locator(".mobile-district-map button:visible, .city-district-anchor[role='button']:visible");
    await activateLocator(page, target, route.touch);
    await page.waitForFunction(() => Boolean(new URLSearchParams(location.hash.split("?")[1] ?? "").get("focus")));
    const focusBefore = await page.evaluate(() => new URLSearchParams(location.hash.split("?")[1] ?? "").get("focus"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator(".explore-view, .mobile-explore").first().waitFor({ state: "visible" });
    const focusAfter = await page.evaluate(() => new URLSearchParams(location.hash.split("?")[1] ?? "").get("focus"));
    if (!focusBefore || focusBefore !== focusAfter) throw new Error("Focus deep link did not survive reload");
    details.focus = focusAfter;
  } else if (route.journey === "back-forward") {
    await activateLocator(page, page.locator(".v74-scene-rail > button").nth(1), false);
    await page.locator(".home-view-v74[data-scene='knowledge-gravity']").waitFor({ state: "visible" });
    await page.goBack({ waitUntil: "domcontentloaded" });
    await page.locator(".home-view-v74[data-scene='living-terrain']").waitFor({ state: "visible" });
    await page.goForward({ waitUntil: "domcontentloaded" });
    await page.locator(".home-view-v74[data-scene='knowledge-gravity']").waitFor({ state: "visible" });
    details.history = ["knowledge-gravity", "living-terrain", "knowledge-gravity"];
  } else if (route.journey === "keyboard-workspace") {
    const exploreTab = page.locator("#workspace-tab-explore");
    await exploreTab.focus();
    await page.keyboard.press("ArrowRight");
    await page.locator(".observe-view, .mobile-observe").first().waitFor({ state: "visible" });
    await page.waitForFunction(() => document.activeElement?.id === "workspace-tab-observe");
    details.keyboardDestination = "observe";
  } else if (route.journey === "hub-relations") {
    const surface = page.locator(".hub-relations-surface");
    await surface.waitFor({ state: "visible" });
    const neighborCount = await surface.locator(".hub-relations-grid li > button:visible").count();
    const honestEmpty = await surface.locator(".workspace-honest-empty:visible").count();
    if (neighborCount === 0 && honestEmpty !== 1) throw new Error("Hub Relations exposed neither verified neighbors nor an honest empty state");
    details.neighborCount = neighborCount;
    details.honestEmpty = honestEmpty === 1;
  } else if (route.journey === "webkit-svg-focus") {
    const target = page.locator("[data-testid='city-map'] .city-district-anchor[role='button']:visible").first();
    await target.focus();
    if (!await target.evaluate((node) => node === document.activeElement)) throw new Error("WebKit SVG district anchor did not receive keyboard focus");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => Boolean(new URLSearchParams(location.hash.split("?")[1] ?? "").get("focus")));
    details.focus = await page.evaluate(() => new URLSearchParams(location.hash.split("?")[1] ?? "").get("focus"));
  } else {
    throw new Error(`Unsupported QA journey: ${route.journey}`);
  }

  await page.locator(route.finalReadySelector ?? route.readySelector).first().waitFor({ state: "visible" });
  await settleRenderedPage(page);
  return { pass: true, durationMs: Date.now() - startedAt, details };
}

async function collectAccessibilityAndExposure(page, route) {
  const axeResult = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const bodyText = await page.locator("body").innerText();
  const bodyHtml = await page.locator("body").evaluate((node) => node.outerHTML);
  const ariaSnapshot = await page.locator("body").ariaSnapshot();
  const languageContract = await page.evaluate(() => {
    const normalized = (value) => value?.trim().replace(/\s+/g, " ") ?? "";
    const control = (selector, expected) => {
      const node = document.querySelector(selector);
      const visibleLabel = normalized(node?.textContent);
      const accessibleLabel = normalized(node?.getAttribute("aria-label") || node?.textContent);
      return {
        selector,
        expected,
        found: Boolean(node),
        visibleLabel,
        accessibleLabel,
        labelConsistent: Boolean(node)
          && visibleLabel.toLocaleLowerCase("en").includes(expected.toLocaleLowerCase("en"))
          && accessibleLabel.toLocaleLowerCase("en").startsWith(expected.toLocaleLowerCase("en")),
      };
    };
    const overlayLanguages = [...document.querySelectorAll(".search-dialog, .navigator-tray, .inspector-tray, .data-tray")]
      .filter((node) => {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      })
      .map((node) => ({ selector: `.${[...node.classList].join(".")}`, lang: node.getAttribute("lang") }));
    return {
      htmlLang: document.documentElement.lang,
      commandBarLang: document.querySelector(".command-bar")?.getAttribute("lang") ?? null,
      workspaceMainLang: document.querySelector(".workspace-main")?.getAttribute("lang") ?? null,
      overlayLanguages,
      chromeControls: [
        control("#workspace-tab-home", "Homi Vault Atlas"),
        control("#workspace-tab-explore", "Explore"),
        control("#workspace-tab-observe", "Observe"),
        control("#workspace-tab-flow", "Flow"),
        control("#workspace-tab-time", "Time"),
        control("#workspace-tab-agency", "Agency"),
        control(".search-trigger", "Search"),
      ],
    };
  });
  const snapshot = {
    violations: axeResult.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      description: violation.description,
      nodes: violation.nodes.map((node) => ({ target: node.target, failureSummary: node.failureSummary })),
    })),
    bodyPrivacyFindings: scanPrivacyText(bodyText, { path: `${route.id}:rendered-body` }),
    bodyOperatingFindings: scanOperatingExposure(bodyText, { path: `${route.id}:rendered-body` }),
    domPrivacyFindings: scanPrivacyText(bodyHtml, { path: `${route.id}:rendered-dom` }),
    domOperatingFindings: scanOperatingExposure(bodyHtml, { path: `${route.id}:rendered-dom` }),
    ariaPrivacyFindings: scanPrivacyText(ariaSnapshot, { path: `${route.id}:aria-snapshot` }),
    ariaOperatingFindings: scanOperatingExposure(ariaSnapshot, { path: `${route.id}:aria-snapshot` }),
    languageContract,
    evidence: {
      bodyBytes: Buffer.byteLength(bodyText),
      bodySha256: sha256(bodyText),
      domBytes: Buffer.byteLength(bodyHtml),
      domSha256: sha256(bodyHtml),
      ariaSnapshotBytes: Buffer.byteLength(ariaSnapshot),
      ariaSnapshotSha256: sha256(ariaSnapshot),
    },
  };
  return { ...snapshot, gate: evaluateAccessibilitySnapshot(snapshot) };
}

async function collectLongTasks(page) {
  return page.evaluate(() => {
    const state = (/** @type {any} */ (window)).__atlasV74QaLongTasks;
    if (!state?.supported) return { supported: false, thresholdMs: 50, count: 0, totalMs: 0, maximumMs: 0, entries: [] };
    const entries = state.entries.map((entry) => ({ startTime: entry.startTime, duration: entry.duration }));
    return {
      supported: true,
      thresholdMs: state.thresholdMs,
      count: entries.length,
      totalMs: entries.reduce((sum, entry) => sum + entry.duration, 0),
      maximumMs: entries.length > 0 ? Math.max(...entries.map((entry) => entry.duration)) : 0,
      entries,
    };
  });
}

async function residualStartedProcesses(startedProcesses) {
  const rows = await processTable();
  const byPid = new Map(rows.map((row) => [row.pid, row]));
  return [...startedProcesses.entries()].flatMap(([pid, command]) => {
    const row = byPid.get(pid);
    return row && row.command === command ? [{ pid, command }] : [];
  });
}

async function cleanupStartedProcesses(startedProcesses) {
  const attempted = [];
  let residual = await residualStartedProcesses(startedProcesses);
  for (const item of residual) {
    attempted.push(item.pid);
    try { process.kill(item.pid, "SIGTERM"); } catch { /* already exited */ }
  }
  if (attempted.length > 0) await new Promise((resolve) => setTimeout(resolve, 300));
  residual = await residualStartedProcesses(startedProcesses);
  for (const item of residual) {
    if (!attempted.includes(item.pid)) attempted.push(item.pid);
    try { process.kill(item.pid, "SIGKILL"); } catch { /* already exited */ }
  }
  if (residual.length > 0) await new Promise((resolve) => setTimeout(resolve, 150));
  return { attempted, residual: await residualStartedProcesses(startedProcesses) };
}

export async function runQa(environment = process.env) {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const plan = resolveQaPlan(environment);
  const ownerContractQa = await ownerQaBindingForPlan(plan, environment);
  const baseUrl = requiredAtlasUrl(environment, { allowFile: plan.mode === "file-smoke" });
  const artifactDir = path.resolve(environment.ATLAS_QA_ARTIFACT_DIR?.trim() || path.join(projectDir, "artifacts", "v7-4-browser-qa"));
  const screenshotDir = path.join(artifactDir, "screenshots");
  const receiptPath = path.join(artifactDir, `v7-4-${plan.mode}-browser-qa.json`);
  await mkdir(screenshotDir, { recursive: true });

  const baselineRows = await processTable();
  const baselinePids = new Set(descendantsOf(baselineRows, process.pid).map((row) => row.pid));
  const startedProcesses = new Map();
  const lifecycle = {
    browsersOpened: 0,
    browsersClosed: 0,
    contextsOpened: 0,
    contextsClosed: 0,
    pagesOpened: 0,
    pagesClosed: 0,
    monitorsStarted: 0,
    monitorsStopped: 0,
    startedPids: [],
    cleanupAttemptedPids: [],
    residualPids: [],
  };
  const results = [];
  let runnerFailure = null;
  const browsers = new Map();
  let monitor = null;
  let emergencyClose = null;

  try {
    const playwright = await import("playwright");
    for (const browserName of new Set(plan.routes.map((route) => route.browserName))) {
      if (browserName !== "chromium" && browserName !== "webkit") throw new Error(`Unsupported QA browser: ${browserName}`);
      const browser = await playwright[browserName].launch({ headless: true, args: browserName === "chromium" ? ["--disable-gpu"] : [] });
      browsers.set(browserName, browser);
      lifecycle.browsersOpened += 1;
      browser.once("disconnected", () => { lifecycle.browsersClosed += 1; });
    }
    monitor = await createResourceMonitor({
      local: plan.local,
      startedAtMs,
      baselinePids,
      startedProcesses,
      onStop: async () => {
        if (!emergencyClose) emergencyClose = Promise.all([...browsers.values()].map((browser) => browser.close().catch(() => {})));
        await emergencyClose;
      },
    });
    lifecycle.monitorsStarted += 1;

    for (let iteration = 1; iteration <= plan.iterations; iteration += 1) {
      for (const route of plan.routes) {
        monitor.throwIfStopped();
        const consoleFindings = [];
        let context = null;
        let page = null;
        const caseStartedAt = Date.now();
        try {
          const browser = browsers.get(route.browserName);
          if (!browser) throw new Error(`QA browser was not launched: ${route.browserName}`);
          context = await browser.newContext({
            viewport: route.viewport,
            reducedMotion: route.reducedMotion ? "reduce" : "no-preference",
            locale: "ko-KR",
            hasTouch: route.touch,
          });
          lifecycle.contextsOpened += 1;
          context.once("close", () => { lifecycle.contextsClosed += 1; });
          if (!route.firstEntry) {
            await context.addInitScript(() => {
              try { window.sessionStorage.setItem("homi-atlas-v7-4-opening-seen", "1"); } catch { /* optional */ }
              try { window.localStorage.setItem("homi-atlas-v7-1-guide-seen", "1"); } catch { /* optional */ }
            });
          }
          await context.addInitScript(({ thresholdMs }) => {
            const qaLongTasks = {
              supported: false,
              thresholdMs,
              entries: [],
              observer: null,
            };
            (/** @type {any} */ (window)).__atlasV74QaLongTasks = qaLongTasks;
            if (!globalThis.PerformanceObserver?.supportedEntryTypes?.includes("longtask")) return;
            qaLongTasks.supported = true;
            qaLongTasks.observer = new PerformanceObserver((list) => {
              for (const entry of list.getEntries()) {
                if (entry.duration >= thresholdMs) {
                  qaLongTasks.entries.push({ startTime: entry.startTime, duration: entry.duration });
                }
              }
            });
            qaLongTasks.observer.observe({ type: "longtask", buffered: true });
          }, { thresholdMs: QA_PERFORMANCE_BUDGETS.longTaskThresholdMs });
          page = await context.newPage();
          lifecycle.pagesOpened += 1;
          page.once("close", () => { lifecycle.pagesClosed += 1; });
          page.setDefaultTimeout(20_000);
          page.on("console", (message) => {
            if (message.type() === "warning" || message.type() === "error") {
              consoleFindings.push({ type: message.type(), text: message.text() });
            }
          });
          page.on("pageerror", (error) => consoleFindings.push({ type: "pageerror", text: error.message }));

          const targetUrl = new URL(route.hash, baseUrl).href;
          const navigationStartedAt = Date.now();
          await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
          await page.locator(".atlas-app").waitFor({ state: "visible" });
          await page.locator(route.readySelector).first().waitFor({ state: "visible" });
          await settleRenderedPage(page);
          const readinessMs = Date.now() - navigationStartedAt;
          let openingEvidence = null;
          if (route.firstEntry && !route.reducedMotion) {
            const initial = await page.locator(".home-view-v74").getAttribute("data-opening");
            await page.waitForTimeout(850);
            const settled = await page.locator(".home-view-v74").getAttribute("data-opening");
            await page.reload({ waitUntil: "domcontentloaded" });
            await page.locator(route.readySelector).first().waitFor({ state: "visible" });
            await settleRenderedPage(page);
            const revisit = await page.locator(".home-view-v74").getAttribute("data-opening");
            openingEvidence = {
              initial,
              settled,
              revisit,
              pass: initial === "true" && settled === "false" && revisit === "false",
            };
          }
          monitor.throwIfStopped();

          const journey = await executeJourney(page, route);
          monitor.throwIfStopped();
          const geometry = await measureGeometry(page, route.geometryGroups, route);
          const geometryGate = evaluateGeometrySnapshot(geometry);
          const accessibility = await collectAccessibilityAndExposure(page, route);
          const longTasks = await collectLongTasks(page);
          const screenshotBody = await page.screenshot({ fullPage: false, animations: "disabled", caret: "hide", type: "png" });
          const pngMagic = hasPngMagic(screenshotBody);
          const screenshotName = `${String(iteration).padStart(2, "0")}-${safeName(route.id)}-${route.viewport.width}x${route.viewport.height}.png`;
          const screenshotPath = path.join(screenshotDir, screenshotName);
          if (pngMagic) await writeFile(screenshotPath, screenshotBody);
          const pass = journey.pass
            && geometryGate.pass
            && accessibility.gate.pass
            && (openingEvidence?.pass ?? true)
            && consoleFindings.length === 0
            && pngMagic;
          results.push({
            id: route.id,
            workspace: route.workspace,
            iteration,
            viewport: route.viewport,
            reducedMotion: route.reducedMotion,
            firstEntry: route.firstEntry,
            touch: route.touch,
            browserName: route.browserName,
            longTaskRequired: route.longTaskRequired !== false,
            url: page.url(),
            durationMs: Date.now() - caseStartedAt,
            journey,
            openingEvidence,
            performance: {
              readinessSignal: route.readySelector,
              interactionSignal: route.journey,
              readinessMs,
              interactionMs: journey.durationMs,
              longTasks,
            },
            geometry,
            geometryGate,
            accessibility,
            consoleFindings,
            screenshot: {
              path: path.relative(projectDir, screenshotPath),
              bytes: screenshotBody.length,
              sha256: sha256(screenshotBody),
              pngMagic,
              comparison: "evidence-only-no-golden-baseline",
            },
            pass,
          });
          if (!pass && plan.local) throw new Error(`QA gate failed for ${route.id} iteration ${iteration}`);
        } finally {
          if (page && !page.isClosed()) await page.close().catch(() => {});
          if (context) await context.close().catch(() => {});
        }
      }
    }
  } catch (error) {
    runnerFailure = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack ?? null } : { message: String(error) };
  } finally {
    if (monitor) {
      await monitor.stop();
      lifecycle.monitorsStopped += 1;
    }
    if (emergencyClose) await emergencyClose;
    for (const browser of browsers.values()) {
      if (browser.isConnected()) await browser.close().catch(() => {});
    }
    const cleanup = await cleanupStartedProcesses(startedProcesses);
    lifecycle.startedPids = [...startedProcesses.keys()].sort((left, right) => left - right);
    lifecycle.cleanupAttemptedPids = cleanup.attempted;
    lifecycle.residualPids = cleanup.residual.map((item) => item.pid);
  }

  const lifecycleGate = evaluateLifecycleGates(lifecycle);
  const performanceGate = evaluatePerformanceResults(results);
  const expectedResults = plan.routes.length * plan.iterations;
  const pass = !runnerFailure
    && results.length === expectedResults
    && results.every((result) => result.pass)
    && performanceGate.pass
    && lifecycleGate.pass
    && !monitor?.stopReason;
  const receipt = {
    schema: V74_QA_SCHEMA,
    startedAt,
    completedAt: new Date().toISOString(),
    mode: plan.mode,
    executionBoundary: {
      atlasUrlSource: "ATLAS_URL environment variable",
      serverOwnership: baseUrl.startsWith("file:") ? "not-applicable-file-url" : "external",
      serverStartedByHarness: false,
      serverStoppedByHarness: false,
      serverFilesWrittenByHarness: false,
      portShutdownProof: {
        status: baseUrl.startsWith("file:") ? "not-applicable-file-url" : "pending-external-server-cleanup-proof",
        callerMustVerifyEconnrefusedAfterExternalServerShutdown: !baseUrl.startsWith("file:"),
      },
    },
    plan: {
      routes: plan.routes.length,
      iterations: plan.iterations,
      expectedResults,
      workers: 1,
      execution: "strictly-sequential",
      routeIds: plan.routes.map((route) => route.id),
      routeCases: plan.routes.map((route) => ({
        id: route.id,
        workspace: route.workspace,
        hash: route.hash,
        viewport: route.viewport,
        reducedMotion: route.reducedMotion,
        firstEntry: route.firstEntry,
        touch: route.touch,
        journey: route.journey,
        targetScene: route.targetScene ?? null,
        actorId: route.actorId ?? null,
        actorIds: route.actorIds ?? null,
        browserName: route.browserName,
        longTaskRequired: route.longTaskRequired !== false,
      })),
    },
    inputs: { baseUrl, artifactDir, ownerContractQa },
    visualComparison: {
      mode: "evidence-only",
      goldenBaselineApplied: false,
      rationale: "This harness enforces deterministic PNG evidence, global geometry, and accessibility gates without claiming pixel-baseline comparison.",
    },
    resourceSafety: monitor?.report() ?? null,
    lifecycle: { ...lifecycle, gate: lifecycleGate },
    performance: performanceGate,
    results,
    summary: {
      expectedResults,
      completedResults: results.length,
      passedResults: results.filter((result) => result.pass).length,
      failedResults: results.filter((result) => !result.pass).length,
      consoleWarningOrErrorCount: results.reduce((sum, result) => sum + result.consoleFindings.length, 0),
      overlapCount: results.reduce((sum, result) => sum + result.geometry.overlaps.length, 0),
      crossSelectorOverlapCount: results.reduce((sum, result) => sum
        + result.geometry.overlaps.filter((overlap) => overlap.crossSelector).length, 0),
      clippedCount: results.reduce((sum, result) => sum + result.geometry.clipped.length, 0),
      under12PxCount: results.reduce((sum, result) => sum + result.geometry.undersizedText.length, 0),
      horizontalOverflowCount: results.filter((result) => result.geometry.horizontalOverflow !== 0).length,
      axeViolationCount: results.reduce((sum, result) => sum + result.accessibility.violations.length, 0),
      renderedPrivacyFindingCount: results.reduce((sum, result) => sum
        + result.accessibility.bodyPrivacyFindings.length
        + result.accessibility.domPrivacyFindings.length
        + result.accessibility.ariaPrivacyFindings.length, 0),
      renderedOperatingFindingCount: results.reduce((sum, result) => sum
        + result.accessibility.bodyOperatingFindings.length
        + result.accessibility.domOperatingFindings.length
        + result.accessibility.ariaOperatingFindings.length, 0),
      performanceBudgetRowsFailed: performanceGate.rows.filter((row) => !row.pass).map((row) => row.id),
    },
    runnerFailure,
    result: pass ? "pass" : monitor?.stopReason ? "stopped_resource_safety" : "fail",
    pass,
  };
  await writeFile(receiptPath, jsonText(receipt));
  return { receiptPath, receipt };
}

async function main() {
  const { receiptPath, receipt } = await runQa(process.env);
  process.stdout.write(`${jsonText({ receiptPath, result: receipt.result, pass: receipt.pass })}`);
  if (!receipt.pass) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
