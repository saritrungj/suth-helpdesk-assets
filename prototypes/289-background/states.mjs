import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { assetFixture } from "../../apps/web/e2e/asset-fixture.js";
import { comparisonFixture } from "../../apps/web/e2e/comparison-fixture.js";
import { variantCss } from "./variants.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const out = path.join(root, "output/playwright/289-background");
const browser = await chromium.launch();
const evidence = [];
try {
  for (const [name, route, endpoints] of [
    ["Overview", "/dashboard", /\/api\/dashboard\/(overview|monthly-kpi)\b/],
    ["Registry", "/assets", /\/api\/devices(?:\?|$)/],
    ["Print Entry", "/print-transactions", /\/api\/print-transactions\b/],
  ]) {
    for (const state of ["empty", "error", "pending", "dark"]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
      const page = await context.newPage();
      await page.addInitScript(mode => localStorage.setItem("suth-ui-mode", mode), state === "dark" ? "dark" : "light");
      const fixture = await comparisonFixture(page, { role: "staff", ...(state === "empty" ? { rows: [] } : {}) });
      let release;
      const held = new Promise(resolve => { release = resolve; });
      if (["error", "pending"].includes(state)) await page.route(endpoints, async route => {
        if (state === "pending") await held;
        await route.fulfill({ status: 503, json: { status: 503, title: "ไม่สามารถโหลดข้อมูลตัวอย่างได้" } });
      });
      if (state === "empty" && name === "Registry") await page.route(endpoints, route => route.fulfill({ json: [] }));
      await page.goto("http://127.0.0.1:5289" + route);
      await page.getByRole("main").waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(700);
      const before = state === "dark" ? await page.screenshot({ animations: "disabled" }) : null;
      await page.addStyleTag({ content: variantCss("B") });
      const file = `${name.replaceAll(" ", "-")}-1440-${state}.png`;
      const after = await page.screenshot({ path: path.join(out, file), animations: "disabled" });
      evidence.push({ name, state, file, ...(before ? { darkImageBytesUnchanged: before.equals(after) } : {}) });
      release();
      await context.close();
    }
  }
  for (const state of ["error", "pending"]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.addInitScript(() => localStorage.setItem("suth-ui-mode", "light"));
    const fixture = await assetFixture(page); fixture.user = null;
    let release; const held = new Promise(resolve => { release = resolve; });
    await page.route(/\/api\/auth\/login$/, async route => {
      if (state === "pending") await held;
      await route.fulfill({ status: 401, json: { title: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" } });
    });
    await page.goto("http://127.0.0.1:5289/login");
    await page.getByLabel("ชื่อผู้ใช้", { exact: true }).fill("synthetic-preview");
    await page.getByLabel("รหัสผ่าน", { exact: true }).fill("synthetic-only");
    await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
    await page.waitForTimeout(350);
    const file = `Login-${state}.png`;
    await page.screenshot({ path: path.join(out, file), animations: "disabled" });
    evidence.push({ name: "Login", state, file }); release(); await context.close();
  }
} finally { await browser.close(); }
fs.writeFileSync(path.join(out, "states.json"), JSON.stringify(evidence, null, 2));
console.log(evidence);
