import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import * as XLSX from "xlsx";
import { COMPARISON_ROWS, comparisonFixture } from "./comparison-fixture.js";
const deductionCopy = /หัก\s*2\s*%|2\s*%\s*deduction|หลังหักเหลือ/i;

for (const mode of ["light", "dark"]) {
  for (const width of [1440, 1280]) {
    test(`deduction fields are hidden without changing totals ${mode} ${width}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 800 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.addInitScript((value) => localStorage.setItem("suth-ui-mode", value), mode);
      await comparisonFixture(page);
      const violations = [];
      for (const path of ["/dashboard", "/compare", "/expense"]) {
        await page.goto(path);
        const main = page.locator("#main-content");
        await expect(main.getByText("ค่าพิมพ์รวม", { exact: true })).toBeVisible();
        const isComparison = path === "/dashboard" || path === "/compare";
        await expect(main).toContainText(isComparison ? "2,632.77" : "360.00");
        if (deductionCopy.test(await main.innerText())) violations.push(path);
        await page.screenshot({ path: testInfo.outputPath(`${path.slice(1)}.png`) });
        if (isComparison) {
          await expect(main).toContainText("5,970");
          await expect(main).not.toContainText(/5,850\.6(?:0)?\b/);
          await page.getByRole("button", { name: "ดูรายละเอียด", exact: true }).click();
          const drawer = page.getByRole("dialog");
          await expect(drawer).toBeVisible();
          await expect(drawer).toContainText("2,632.77");
          await expect(drawer).toContainText("5,970");
          await expect(drawer).not.toContainText(/5,850\.6(?:0)?\b/);
          await expect(drawer.getByRole("columnheader")).toHaveCount(3);
          if (deductionCopy.test(await drawer.innerText())) violations.push(`${path} details`);
          await page.screenshot({ path: testInfo.outputPath(`${path.slice(1)}-details.png`) });
          await page.keyboard.press("Escape");
        }
      }
      expect(violations, "UI must hide deduction copy and net-page fields").toEqual([]);
    });
  }
}

test("Excel and CSV keep fractional net pages, cost and deduction notes", async ({ page }) => {
  await comparisonFixture(page, { rows: [{ ...COMPARISON_ROWS[0], pages_printed: 101, net_pages: "98.98", price_per_page: "0.3650", total_cost: "36.13" }] });
  await page.goto("/dashboard");
  await expect(page.getByRole("region", { name: "สรุปตัวเลขสำคัญ" })).toContainText("36.13");
  await page.getByRole("button", { name: "ส่งออก", exact: true }).click();
  const excelPending = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: /^Excel/ }).click();
  const excel = await excelPending;
  const workbook = XLSX.read(await readFile(await excel.path()), { type: "buffer" });
  const [header, row] = XLSX.utils.sheet_to_json(workbook.Sheets["ข้อมูลรายละเอียด"], { header: 1 });
  expect(row[header.indexOf("จำนวนพิมพ์")]).toBe(101);
  expect(row[header.indexOf("จำนวนพิมพ์หลังหัก 2%")]).toBe(98.98);
  expect(row[header.indexOf("ค่าพิมพ์ (บาท)")]).toBe(36.13);
  const notes = XLSX.utils.sheet_to_json(workbook.Sheets["เงื่อนไขรายงาน"], { header: 1 });
  expect(notes.flat().join(" ")).toContain("จำนวนพิมพ์ × 0.98");
  await page.getByRole("button", { name: "ส่งออก", exact: true }).click();
  const csvPending = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: /^CSV/ }).click();
  const csv = await csvPending;
  const text = await readFile(await csv.path(), "utf8");
  expect(text).toContain("จำนวนพิมพ์หลังหัก 2%");
  expect(text).toContain("98.98");
  expect(text).toContain("36.13");
});

test("English financial screens hide deduction copy", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("suth-language", "en"));
  await comparisonFixture(page);
  for (const path of ["/dashboard", "/compare", "/expense"]) {
    await page.goto(path);
    await expect(page.locator("#main-content").getByText("Total print cost", { exact: true })).toBeVisible();
    await expect(page.locator("#main-content")).not.toContainText(deductionCopy);
  }
});
