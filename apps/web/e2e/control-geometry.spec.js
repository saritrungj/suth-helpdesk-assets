import { expect, test } from "@playwright/test";
import { prototypeFixture } from "./prototype-fixture.js";
import { assetFixture } from "./asset-fixture.js";
import { importReviewFixture } from "./import-review-fixture.js";

for (const theme of ["light", "dark"]) {
  test(`long import filename wraps inside its page header ${theme}`, async ({ page }) => {
    await page.addInitScript(theme => localStorage.setItem("suth-ui-mode", theme), theme);
    await page.setViewportSize({ width: 1280, height: 800 });
    const fileName = `${"monthlymeterreport".repeat(12)}.xlsx`;
    await importReviewFixture(page, { fileName });
    await page.goto("/admin/import/41");
    const heading = page.getByRole("heading", { level: 1, name: fileName });
    await expect(heading).toBeVisible();
    const box = await heading.boundingBox();
    expect(box.x + box.width).toBeLessThanOrEqual(1280);
    expect(box.height).toBeGreaterThan(60);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test(`expense toolbar buttons share one baseline above export description ${theme}`, async ({ page }) => {
    await page.addInitScript(theme => localStorage.setItem("suth-ui-mode", theme), theme);
    await prototypeFixture(page, "admin");
    await page.goto("/expense");
    const button = page.getByTestId("expense-export");
    await expect(button).toBeEnabled();
    const expand = await page.getByRole("button", { name: "กางทั้งหมด", exact: true }).boundingBox();
    const collapse = await page.getByRole("button", { name: "พับทั้งหมด", exact: true }).boundingBox();
    const exported = await button.boundingBox();
    expect(Math.abs(expand.y - exported.y)).toBeLessThan(1);
    expect(Math.abs(collapse.y - exported.y)).toBeLessThan(1);
    const id = await button.getAttribute("aria-describedby");
    const note = await page.locator(`[id="${id}"]`).boundingBox();
    expect(note.y).toBeGreaterThanOrEqual(exported.y + exported.height);
  });

  test(`dialog footer follows the outer corners ${theme}`, async ({ page }) => {
    await page.addInitScript(theme => localStorage.setItem("suth-ui-mode", theme), theme);
    await assetFixture(page, "admin");
    await page.goto("/admin/brands");
    await page.getByRole("button", { name: "เพิ่มยี่ห้อ", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const corners = await dialog.evaluate(el => ({ outer: getComputedStyle(el).borderBottomLeftRadius,
      footer: getComputedStyle(el.querySelector("footer")).borderBottomLeftRadius }));
    expect(corners.footer).toBe(corners.outer);
  });
}
