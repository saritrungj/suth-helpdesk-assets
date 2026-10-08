import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PAGES, FIXTURE_PAGES } from "./pages.js";
import { accessibilityPageFixture } from "./accessibility-page-fixture.js";

test("accessibility inventory includes current Compare, import and audit routes with representative states", () => {
  for (const url of ["/compare", "/admin/import", "/admin/import/:session", "/admin/audit-log"]) {
    const target = PAGES.find((item) => item.url === url);
    expect(target, `missing full-page accessibility target: ${url}`).toBeDefined();
    expect(target.roles).toEqual(url === "/compare" ? ["admin", "staff", "viewer"] : ["admin"]);
    expect(target.states).toEqual(url.includes(":session") ? ["data", "missing", "loading", "error"] : ["data", "empty", "loading", "error"]);
  }
});

for (const target of FIXTURE_PAGES) {
  for (const state of target.states) {
    for (const theme of ["light", "dark"]) {
      for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
        const role = target.fixture === "compare" ? "viewer" : "admin";
        test(`full-page axe: ${target.fixture} / ${role} / ${state} / ${theme} / ${viewport.width}`, async ({ page }, info) => {
          await page.setViewportSize(viewport);
          await page.emulateMedia({ reducedMotion: "reduce" });
          await page.addInitScript((mode) => localStorage.setItem("suth-ui-mode", mode), theme);
          const fixture = await accessibilityPageFixture(page, target, state, role);
          try {
            await expect(page.locator("html")).toHaveAttribute("data-mode", theme);
            await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toHaveCount(1);
            const results = await new AxeBuilder({ page }).analyze();
            await info.attach("axe-full-page", { body: JSON.stringify(results, null, 2), contentType: "application/json" });
            await page.screenshot({ path: info.outputPath("page.png"), fullPage: true });
            // New targets have no whitelist; keep all axe rules enabled.
            expect(results.violations).toEqual([]);
          } finally {
            fixture.release();
          }
        });
      }
    }
  }
}

for (const role of ["admin", "staff"]) {
  test(`Compare full-page axe with ${role} permissions`, async ({ page }) => {
    const target = FIXTURE_PAGES.find((item) => item.fixture === "compare");
    const fixture = await accessibilityPageFixture(page, target, "data", role);
    try {
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    } finally { fixture.release(); }
  });
}
