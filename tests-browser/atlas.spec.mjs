import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.resolve(process.env.ATLAS_QA_ARTIFACT_DIR ?? path.join(projectDir, "artifacts", "browser-qa"));
const requiredDomains = ["MOC", "Papers", "Signals", "Rocket", "Groot", "Intelligence Layer"];
const viewports = [
  [1440, 920],
  [1280, 720],
  [1180, 720],
  [1024, 768],
  [768, 1024],
  [390, 844],
  [320, 844],
  [844, 390],
];

test.beforeAll(async () => {
  await mkdir(path.join(artifactDir, "screenshots"), { recursive: true });
});

function pageFindings() {
  const visible = (element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none"
      && style.visibility !== "hidden"
      && Number(style.opacity) > 0
      && rect.width > 0
      && rect.height > 0;
  };
  const smallText = [...document.querySelectorAll("body *")]
    .filter((element) => visible(element) && element.childElementCount === 0 && element.textContent?.trim())
    .filter((element) => Number.parseFloat(getComputedStyle(element).fontSize) < 12)
    .map((element) => `${element.tagName}.${element.className}:${getComputedStyle(element).fontSize}`)
    .slice(0, 20);
  const labels = [...document.querySelectorAll(".cosmos-label:not([hidden])")]
    .filter(visible)
    .map((element) => ({ text: element.textContent?.trim(), rect: element.getBoundingClientRect() }));
  const labelCollisions = [];
  for (let left = 0; left < labels.length; left += 1) {
    for (let right = left + 1; right < labels.length; right += 1) {
      const a = labels[left].rect;
      const b = labels[right].rect;
      const overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2
        && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2;
      if (overlap) labelCollisions.push([labels[left].text, labels[right].text]);
    }
  }
  return {
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    smallText,
    labelCollisions,
  };
}

async function waitForAtlas(page, mobile) {
  await expect(page.getByRole("button", { name: "Homi Vault Atlas" })).toBeVisible();
  if (mobile) {
    await expect(page.locator(".mobile-cosmos-canvas")).toBeVisible();
  } else {
    await expect(page.locator('.cosmos-stage[data-webgl-ready="true"]')).toBeVisible();
  }
}

for (const [width, height] of viewports) {
  test(`Home geometry ${width}x${height}`, async ({ page }) => {
    const errors = [];
    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height });
    await page.goto(`/?qa=ci-${width}x${height}#home?scene=whole-vault`);
    const mobile = width <= 820;
    await waitForAtlas(page, mobile);
    for (const domain of requiredDomains) {
      await expect(page.getByText(domain, { exact: true }).first()).toBeAttached();
    }
    const findings = await page.evaluate(pageFindings);
    expect(findings.overflow).toBeLessThanOrEqual(0);
    expect(findings.smallText).toEqual([]);
    expect(findings.labelCollisions).toEqual([]);
    if (mobile) {
      expect(await page.locator('script[src*="semantic-space"]').count()).toBe(0);
      const undersized = await page.locator("button").evaluateAll((buttons) => buttons
        .filter((button) => {
          const rect = button.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44);
        })
        .map((button) => ({
          label: button.getAttribute("aria-label") || button.textContent?.trim(),
          rect: button.getBoundingClientRect().toJSON(),
        })));
      expect(undersized).toEqual([]);
    }
    expect(errors).toEqual([]);
    await page.screenshot({
      path: path.join(artifactDir, "screenshots", `home-${width}x${height}.png`),
      fullPage: false,
    });
  });
}

test("desktop hover, focus, orbit, URL and idle contract", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 920 });
  await page.goto("/?qa=ci-interaction#explore?scene=graph&panel=none");
  await waitForAtlas(page, false);
  const host = page.locator(".cosmos-stage__webgl");
  const canvas = page.locator(".cosmos-stage__webgl canvas");
  const before = await host.evaluate((element) => ({ ...element.dataset }));
  const beforeUrl = page.url();
  const label = page.locator(".cosmos-label:not([hidden])").first();
  const box = await label.boundingBox();
  expect(box).not.toBeNull();
  for (let index = 0; index < 300; index += 1) {
    await page.mouse.move(box.x + 12 + (index % 8), box.y + 12 + (index % 4));
  }
  const afterHover = await host.evaluate((element) => ({ ...element.dataset }));
  expect(afterHover.sceneBuilds).toBe(before.sceneBuilds);
  expect(afterHover.cameraMoves).toBe(before.cameraMoves);
  expect(Number(afterHover.previewCommits) - Number(before.previewCommits)).toBeLessThanOrEqual(1);
  expect(page.url()).toBe(beforeUrl);

  await label.click();
  await expect(page).toHaveURL(/focus=n%3A/);
  const committedUrl = page.url();
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  await page.mouse.move(canvasBox.x + canvasBox.width * 0.72, canvasBox.y + canvasBox.height * 0.72);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + canvasBox.width * 0.77, canvasBox.y + canvasBox.height * 0.67, { steps: 8 });
  await page.mouse.up();
  expect(page.url()).toBe(committedUrl);
  const afterOrbit = await host.evaluate((element) => ({ ...element.dataset }));
  expect(Number(afterOrbit.cameraMoves)).toBeGreaterThan(Number(afterHover.cameraMoves));
  await expect(host).toHaveAttribute("data-idle", "true", { timeout: 4_000 });
  const framesAtIdle = Number(await host.getAttribute("data-frames"));
  await page.waitForTimeout(300);
  const idle = await host.evaluate((element) => ({ ...element.dataset }));
  expect(idle.idle).toBe("true");
  expect(Number(idle.frames)).toBe(framesAtIdle);

  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/focus=/);
  await page.goBack();
  await page.goForward();
  await expect(page.getByRole("heading", { name: "실제 이름과 방향 관계를 탐색한다." })).toBeVisible();
});

test("analysis workspaces and search share committed navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 920 });
  for (const [hash, heading] of [
    ["#observe", "구역 사이의 방향 관계를 비교한다."],
    ["#flow", "실제 영역 경계를 건너는 경로를 읽는다."],
    ["#time", "검증된 버전 변화만 시간으로 읽는다."],
    ["#agency", "방향, 소유, 순환과 번역의 책임을 읽는다."],
  ]) {
    await page.goto(`/?qa=ci-analysis${hash}`);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    const findings = await page.evaluate(pageFindings);
    expect(findings.overflow).toBeLessThanOrEqual(0);
    expect(findings.smallText).toEqual([]);
  }
  await page.getByRole("button", { name: "Search Atlas" }).click();
  const search = page.getByPlaceholder(/Search \d+ safe knowledge nodes/);
  await search.fill("Rocket");
  await expect(page.getByRole("dialog", { name: "Search Atlas" })).toContainText("Rocket");
  await search.press("Enter");
  await expect(page).toHaveURL(/#explore\?focus=/);
});

test("WebGL failure and reduced motion preserve semantic state", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: "reduce" });
  await context.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(type, ...args) {
      if (type === "webgl" || type === "webgl2" || type === "experimental-webgl") return null;
      return original.call(this, type, ...args);
    };
  });
  const page = await context.newPage();
  await page.goto(`${test.info().project.use.baseURL}?qa=ci-fallback#home?scene=whole-vault`);
  await expect(page.locator(".mobile-cosmos-canvas")).toBeVisible();
  await expect(page.locator('.cosmos-stage[data-webgl-ready="false"]')).toBeVisible();
  expect(await page.locator('script[src*="semantic-space"]').count()).toBe(0);
  await context.close();
});

test("file URL loads the same public graph without module fetches", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fileUrl = new URL(`file://${path.join(projectDir, "dist-public", "index.html")}`);
  fileUrl.hash = "home?scene=whole-vault";
  await page.goto(fileUrl.toString());
  await expect(page.getByRole("heading", { name: "살아 있는 지식의 전체 지형을 본다." })).toBeVisible();
  await expect(page.locator(".mobile-cosmos-canvas")).toBeVisible();
  expect(await page.locator('script[src*="semantic-space"]').count()).toBe(0);
});
