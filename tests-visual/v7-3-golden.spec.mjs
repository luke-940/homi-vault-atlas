import { expect, test } from "@playwright/test";
import {
  CI_ROUTE_CASES,
  executeJourney,
  requiredAtlasUrl,
  settleRenderedPage,
} from "../scripts/run-v7-3-qa.mjs";
import { resolveVisualGoldenCases } from "../scripts/lib/v7-3-visual-golden.mjs";

const baseUrl = requiredAtlasUrl(process.env);
const goldenCases = resolveVisualGoldenCases(CI_ROUTE_CASES);

for (const route of goldenCases) {
  test(`${route.id} ${route.viewport.width}x${route.viewport.height}`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: route.viewport,
      colorScheme: "light",
      deviceScaleFactor: 1,
      hasTouch: route.touch,
      locale: "ko-KR",
      reducedMotion: "reduce",
      serviceWorkers: "block",
      timezoneId: "Asia/Seoul",
    });
    try {
      await context.addInitScript(() => {
        try { window.sessionStorage.setItem("homi-atlas-v7-3-home-entry-seen", "1"); } catch { /* optional */ }
        try { window.localStorage.setItem("homi-atlas-v7-1-guide-seen", "1"); } catch { /* optional */ }
      });
      const page = await context.newPage();
      page.setDefaultTimeout(20_000);
      const targetUrl = new URL(route.hash, baseUrl).href;
      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.locator(".atlas-app").waitFor({ state: "visible" });
      await page.locator(route.readySelector).first().waitFor({ state: "visible" });
      await settleRenderedPage(page);
      await executeJourney(page, { ...route, reducedMotion: true });
      await expect(page).toHaveScreenshot(
        `${route.id}-${route.viewport.width}x${route.viewport.height}.png`,
        { animations: "disabled", caret: "hide", fullPage: false },
      );
    } finally {
      await context.close();
    }
  });
}
