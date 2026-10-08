import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { comparisonFixture } from "./comparison-fixture.js";
import { importReviewFixture } from "./import-review-fixture.js";

for (const theme of ["light", "dark"]) {
  test(`new export explanation and import summary pass automated accessibility checks in ${theme}`, async ({ page }) => {
    await page.addInitScript(theme => localStorage.setItem("suth-ui-mode", theme), theme);
    const state = await comparisonFixture(page);
    state.fail = true;
    await page.goto("/compare");
    await expect(page.getByText("โหลดข้อมูลไม่สำเร็จ — ลองใหม่ก่อนส่งออก", { exact: true }).first()).toBeVisible();
    const description = await page.getByRole("button", { name: "ส่งออก", exact: true }).first().getAttribute("aria-describedby");
    const exportResults = await new AxeBuilder({ page }).include(`[id="${description}"]`).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(exportResults.violations).toEqual([]);
    await importReviewFixture(page);
    await page.goto("/admin/import/41");
    await expect(page.getByTestId("import-commit")).toBeEnabled();
    const importResults = await new AxeBuilder({ page }).include('[data-testid="import-review-summary"]').withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(importResults.violations).toEqual([]);
  });
}
