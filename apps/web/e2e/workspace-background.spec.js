import { expect, test } from "@playwright/test";
import { comparisonFixture } from "./comparison-fixture.js";
import { CONTRAST_HELPERS } from "./contrast-helper.js";
import { readFileSync } from "node:fs";
import { assetFixture } from "./asset-fixture.js";

// Compare rendered colors: production CSS minifies equivalent color spellings.
async function renderedColor(page, color) {
  return page.evaluate(`${CONTRAST_HELPERS} contrast.rgba(${JSON.stringify(color)});`);
}

test("approved cream/peach/mint canvas includes a conservative glass contrast bound", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("suth-ui-mode", "light"));
  await comparisonFixture(page, { role: "staff" });
  await page.goto("/assets");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const styles = await page.locator(".canvas-wash").evaluate(el => {
    const s = getComputedStyle(el);
    return { canvas: s.backgroundColor, wash: s.backgroundImage,
      bound: s.getPropertyValue("--canvas-wash-glass-worst").trim() };
  });
  expect(styles.canvas).toBe("rgb(255, 250, 245)");
  expect(styles.wash).toContain("255, 227, 204");
  expect(styles.wash).toContain("211, 239, 238");
  expect(await renderedColor(page, styles.bound)).toEqual([191, 222, 177, 1]);
  const report = await page.evaluate(`${CONTRAST_HELPERS} contrast.auditText();`);
  expect(report.measured).toBeGreaterThan(0);
  await test.info().attach("workspace-text-contrast", { body: JSON.stringify(report, null, 2), contentType: "application/json" });
  if (report.unsupported.length) test.info().annotations.push({ type: "unmeasured", description: `${report.unsupported.length} existing samples require separate measurement` });
  expect(report.failures).toEqual([]);
});

test("glass measurement includes the declared bound of saturated backdrop", async ({ page }) => {
  await page.setContent(`<body style="background:white"><div class="canvas-wash"
    style="--canvas-wash-worst:rgb(211 227 204);--canvas-wash-glass-worst:rgb(191 222 177);--canvas-wash-glass-saturation-limit:1.56;background:linear-gradient(#FFE3CC,#D3EFEE)">
    <div class="chrome-glass" style="backdrop-filter:blur(14px) saturate(1.2)">
      <p id="text" style="color:black">Backdrop text</p></div></div></body>`);
  const result = await page.evaluate(`${CONTRAST_HELPERS} contrast.measureText(document.querySelector('#text'));`);
  expect(result.background).toEqual([191, 222, 177]);
});

test("measurement refuses glass saturation outside its proven bound", async ({ page }) => {
  await page.setContent(`<div class="canvas-wash" style="--canvas-wash-worst:white;--canvas-wash-glass-worst:rgb(191 222 177);--canvas-wash-glass-saturation-limit:1.56;background:linear-gradient(white,pink)">
    <div class="chrome-glass" style="backdrop-filter:blur(14px) saturate(2)"><p id="text">Text</p></div></div>`);
  const result = await page.evaluate(`${CONTRAST_HELPERS} contrast.measureText(document.querySelector('#text'));`);
  expect(result.unsupported).toContain("exceeds the declared bound");
});

test("native gradient pixels and stacked saturation stay above declared RGB bounds", async ({ page }) => {
  await page.setContent('<div class="canvas-wash" id="sample">Background sample</div>');
  await page.addStyleTag({ content: readFileSync(new URL("../src/design/tokens.css", import.meta.url), "utf8") });
  await page.evaluate(() => document.documentElement.dataset.mode = "light");
  const samples = await page.evaluate(async () => {
    const s = getComputedStyle(document.querySelector("#sample"));
    const rasterize = async (filter) => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><foreignObject width="320" height="240"><div xmlns="http://www.w3.org/1999/xhtml" style="width:320px;height:240px;background-color:${s.getPropertyValue("--canvas")};background-image:${s.getPropertyValue("--canvas-wash")};filter:${filter}"></div></foreignObject></svg>`;
      const image = new Image();
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      await image.decode();
      const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 240;
      const context = canvas.getContext("2d"); context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, 320, 240).data;
      const minima = [255, 255, 255];
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] !== 255) throw new Error("Rasterization must cover an opaque background");
        for (let channel = 0; channel < 3; channel++) minima[channel] = Math.min(minima[channel], pixels[i + channel]);
      }
      return minima;
    };
    return { plain: await rasterize("none"), glass: await rasterize("saturate(1.2) saturate(1.3)") };
  });
  for (let channel = 0; channel < 3; channel++) {
    expect(samples.plain[channel]).toBeGreaterThanOrEqual([211, 227, 204][channel]);
    expect(samples.glass[channel]).toBeGreaterThanOrEqual([191, 222, 177][channel]);
  }
});

test("Login keeps its original root canvas and does not inherit workspace glass evidence", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("suth-ui-mode", "light"));
  const fixture = await assetFixture(page); fixture.user = null;
  await page.goto("/login");
  await expect(page.locator(".auth-stage")).toBeVisible();
  const rootTokens = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return { canvas: style.getPropertyValue("--canvas").trim(), glass: style.getPropertyValue("--canvas-wash-glass-worst").trim() };
  });
  // Root derivatives (including the theme button's backdrop) must stay as before.
  expect(await renderedColor(page, rootTokens.canvas)).toEqual(await renderedColor(page, "oklch(0.985 0.004 205)"));
  expect(rootTokens.glass).toBe("");
});

test("nested translucent glass samples stay above the measured contrast background", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 240 });
  await page.setContent(`<style>body{margin:0}.canvas-wash{width:320px;height:240px;background:var(--canvas);background-image:var(--canvas-wash)}
    .chrome-glass{position:absolute;inset:16px;background:color-mix(in oklch,var(--canvas) 72%,transparent);backdrop-filter:blur(14px) saturate(1.2)}
    .btn-glass{position:absolute;inset:16px;background:color-mix(in oklab,var(--surface) 82%,transparent);backdrop-filter:blur(8px) saturate(1.3)}
    p{height:30px;margin:0;color:black}</style><div class="canvas-wash"><div class="chrome-glass"><div class="btn-glass"><p id="text">Glass text</p></div></div></div>`);
  await page.addStyleTag({ content: readFileSync(new URL("../src/design/tokens.css", import.meta.url), "utf8") });
  await page.evaluate(() => document.documentElement.dataset.mode = "light");
  const measured = await page.evaluate(`${CONTRAST_HELPERS} contrast.measureText(document.querySelector('#text'));`);
  expect(measured.unsupported).toBeUndefined();
  // Keep the box, remove glyphs so screenshot samples contain background only.
  await page.locator("#text").evaluate(el => el.textContent = "");
  const screenshot = await page.screenshot({ animations: "disabled" });
  const minima = await page.evaluate(async (encoded) => {
    const image = new Image(); image.src = `data:image/png;base64,${encoded}`; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 240;
    const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(48, 48, 224, 144).data;
    const minima = [255, 255, 255];
    for (let i = 0; i < pixels.length; i += 4) for (let c = 0; c < 3; c++) minima[c] = Math.min(minima[c], pixels[i + c]);
    return minima;
  }, screenshot.toString("base64"));
  for (let c = 0; c < 3; c++) expect(minima[c]).toBeGreaterThanOrEqual(Math.floor(measured.background[c]));
});

for (const medium of ["print", "forced-colors"]) {
  test(`${medium} keeps the original canvas and removes wash`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("suth-ui-mode", "light"));
    await comparisonFixture(page, { role: "staff" });
    await page.goto("/assets");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.emulateMedia(medium === "print" ? { media: "print" } : { forcedColors: "active" });
    const style = await page.locator(".canvas-wash").evaluate(el => {
      const s = getComputedStyle(el);
      return { canvas: s.getPropertyValue("--canvas").trim(), image: s.backgroundImage };
    });
    expect(await renderedColor(page, style.canvas)).toEqual(await renderedColor(page, "oklch(0.985 0.004 205)"));
    expect(style.image).toBe("none");
  });
}
