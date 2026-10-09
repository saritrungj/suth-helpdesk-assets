// Runnable browser preview, not a test suite. All HTTP data is synthetic.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { comparisonFixture } from "../../apps/web/e2e/comparison-fixture.js";
import { assetFixture } from "../../apps/web/e2e/asset-fixture.js";
import { createContrastTools } from "../../apps/web/e2e/contrast-helper.js";
import { variants, variantCss } from "./variants.mjs";
import { execFileSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const output = path.join(root, "output/playwright/289-background");
fs.mkdirSync(output, { recursive: true });
const origin = "http://127.0.0.1:5289";
const browser = await chromium.launch();
const captures = [];
const baselineTokens = execFileSync("git", ["show", "595399f1cbd4d783f8f57018d8979edd4a807303:apps/web/src/design/tokens.css"], { cwd: root, encoding: "utf8" });
const baselineCanvas = baselineTokens.match(/^  --canvas: ([^;]+);/m)[1];
const baselineWash = baselineTokens.match(/^  --canvas-wash:\s*([\s\S]*?);/m)[1];
const baselineWorst = baselineTokens.match(/^  --canvas-wash-worst: ([^;]+);/m)[1];
const baselineCss = `html[data-mode="light"]:not(:has(.auth-stage)){--canvas:${baselineCanvas};--canvas-wash:${baselineWash};--canvas-wash-worst:${baselineWorst};--canvas-wash-glass-worst:initial;--canvas-wash-glass-saturation-limit:initial}`;
try {
  for (const width of [1440, 1280]) {
    const height = width === 1440 ? 900 : 800;
    for (const [name, route] of [["Overview", "/dashboard"], ["Registry", "/assets"], ["Print Entry", "/print-transactions"]]) {
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
      const page = await context.newPage();
      await page.addInitScript(() => { localStorage.setItem("suth-ui-mode", "light"); localStorage.setItem("suth-locale", "th"); });
      await comparisonFixture(page, { role: "staff" });
      await page.goto(origin + route);
      await page.getByRole("main").waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(700);
      for (const key of Object.keys(variants)) {
        await page.locator("#background-preview").evaluateAll((els) => els.forEach(el => el.remove()));
        await page.addStyleTag({ content: key === "before" ? baselineCss : variantCss(key) }).then(handle => handle.evaluate(el => el.id = "background-preview"));
        const file = `${name.replaceAll(" ", "-")}-${width}-${key}.png`;
        await page.screenshot({ path: path.join(output, file), animations: "disabled" });
        const contrast = await page.evaluate(`(${createContrastTools.toString()})().auditText()`);
        captures.push({ name, width, height, key, file, contrast });
        console.log(`${name} ${width} ${key}: captured; contrast failures ${contrast.failures.length}, unsupported ${contrast.unsupported.length}`);
      }
      // Representative chrome hover/focus with the recommended candidate.
      await page.locator("#background-preview").evaluateAll(els => els.forEach(el => el.remove()));
      await page.addStyleTag({ content: variantCss("B") });
      const link = page.locator("a[href='/assets']").first();
      if (await link.count()) { await link.hover(); await link.focus(); }
      const stateFile = `${name.replaceAll(" ", "-")}-${width}-focus.png`;
      await page.screenshot({ path: path.join(output, stateFile), animations: "disabled" });
      captures.push({ name, width, height, key: "focus", file: stateFile });
      await context.close();
    }
  }
  for (const mode of ["light", "dark"]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.addInitScript(mode => localStorage.setItem("suth-ui-mode", mode), mode);
    const assets = await assetFixture(page);
    assets.user = null;
    await page.goto(origin + "/login");
    await page.getByRole("heading", { level: 1 }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    const file = `Login-${mode}.png`;
    await page.screenshot({ path: path.join(output, file), animations: "disabled" });
    captures.push({ name: "Login", width: 1440, height: 900, key: mode, file });
    await context.close();
  }
} finally { await browser.close(); }
fs.writeFileSync(path.join(output, "captures.json"), JSON.stringify(captures, null, 2));
fs.copyFileSync(path.join(root, "prototypes/289-background/gallery.html"), path.join(output, "index.html"));
console.log(`Gallery: ${path.join(output, "index.html")}`);
