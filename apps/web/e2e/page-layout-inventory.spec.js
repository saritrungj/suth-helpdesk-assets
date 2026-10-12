import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { comparisonFixture } from "./comparison-fixture.js";
import { importSessionFixture } from "./import-session-fixture.js";
import { importReviewFixture } from "./import-review-fixture.js";

// Every rendered route, including detail screens and pages hidden from navigation.
const routes = [
  "/login", "/dashboard", "/compare", "/assets", "/assets/:id", "/expense", "/report", "/print-transactions",
  "/admin/brands", "/admin/buildings", "/admin/floors", "/admin/divisions", "/admin/departments",
  "/admin/fiscal-years", "/admin/contracts", "/admin/add-asset", "/admin/users", "/admin/audit-log",
  "/admin/installation-review", "/admin/import", "/admin/import/:id",
];

test.describe.configure({ mode: "parallel" });
test("visual inventory includes every rendered route", () => {
  const source = readFileSync(new URL("../src/router/index.js", import.meta.url), "utf8");
  expect(source.match(/\bcomponent:/g)).toHaveLength(routes.length);
  for (const route of routes) expect(source).toContain(`path: "${route}"`);
});

for (const theme of ["light", "dark"]) {
  for (const width of [1440, 1280, 640, 320]) {
    for (const route of routes) {
      test(`${route} layout ${width} ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width, height: width === 1280 ? 800 : 900 });
        await page.addInitScript(theme => localStorage.setItem("suth-ui-mode", theme), theme);
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        await comparisonFixture(page, { role: "admin" });
        if (route === "/login") {
          await page.route(/\/api\/auth\/me$/, r => r.fulfill({ status: 401, json: { title: "Unauthenticated" } }));
        }
        if (route === "/admin/import") await importSessionFixture(page);
        if (route === "/admin/import/:id") await importReviewFixture(page);
        if (route === "/admin/audit-log") await page.route(/\/api\/audit-log\b/, r => r.fulfill({ json: { rows: [], total: 0 } }));
        if (route === "/assets/:id") await page.route(/\/api\/audit-log\b/, r => r.fulfill({ json: { rows: [], total: 0 } }));
        const url = route.replace("/assets/:id", "/assets/1").replace("/admin/import/:id", "/admin/import/41");
        await page.goto(url);
        await expect(page).toHaveURL(new RegExp(`${url}(?:\\?|$)`));
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        const heading = page.getByRole("heading", { level: 1 });
        if (route !== "/login") {
          await expect(heading).toHaveCSS("font-size", width >= 640 ? "30px" : "24px");
          await expect(heading).toHaveCSS("font-weight", "600");
          const typography = await heading.evaluate(el => ({
            font: getComputedStyle(el).fontFamily,
            margin: getComputedStyle(el.closest("header")).marginBottom,
            padding: getComputedStyle(el.closest("header")).paddingLeft,
          }));
          expect(typography.font).toContain(route === "/assets/:id" ? "IBM Plex Mono" : "Anuphan");
          expect(typography.margin).toBe("16px");
          expect(typography.padding).toBe("0px");
        }
        await expect(page.locator(".skeleton")).toHaveCount(0);
        expect(errors).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const header = page.locator("header").filter({ has: page.getByRole("heading", { level: 1 }) });
        const bounds = await header.locator("button, a, h1").evaluateAll(nodes => nodes.map(el => {
          const r = el.getBoundingClientRect();
          return { text: el.textContent?.trim(), left: r.left, right: r.right, width: r.width };
        }));
        for (const bound of bounds.filter(bound => bound.width > 0)) {
          expect(bound.left, bound.text).toBeGreaterThanOrEqual(0);
          expect(bound.right, bound.text).toBeLessThanOrEqual(width);
        }
        const name = route.replaceAll("/", "-").replace(":id", "detail").slice(1);
        await page.screenshot({ path: `output/playwright/pages/${theme}-${width}-${name}.png`, fullPage: true, animations: "disabled" });
      });
    }
  }
}
