import { expect, test } from "@playwright/test";
import { COMPARISON_ROWS, comparisonFixture } from "./comparison-fixture.js";

for (const theme of ["light", "dark"]) for (const width of [1280, 1440]) {
  test(`pinned total follows scope, not watchlist, ${theme} ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 1280 ? 800 : 900 });
    await page.addInitScript((theme) => localStorage.setItem("suth-ui-mode", theme), theme);
    await comparisonFixture(page);
    await page.goto("/compare?by=division&measure=pages&months=2025-10,2025-11,2025-12");
    const card = page.getByRole("region", { name: "พื้นที่เปรียบเทียบ" });
    await expect(card.getByText("รวมทุกกลุ่มในตัวกรอง", { exact: true })).toBeVisible();
    await card.getByRole("radio", { name: "ตาราง", exact: true }).click();
    const values = card.getByRole("table", { name: "ค่าตัวเลขของกราฟด้านบน" });
    await expect(values.getByRole("columnheader", { name: "รวมทุกกลุ่มในตัวกรอง", exact: true })).toBeVisible();
    await expect(values.getByRole("row", { name: /ตุลาคม 2568/ }).getByRole("cell").first()).toHaveText("1,800");
    const details = page.getByRole("table", { name: "ตารางรายละเอียดของการเปรียบเทียบ" });
    while (await details.getByRole("checkbox", { checked: true }).count()) await details.getByRole("checkbox", { checked: true }).first().uncheck();
    await expect(values.getByRole("columnheader")).toHaveCount(2);
    await expect(values.getByRole("row", { name: /ตุลาคม 2568/ }).getByRole("cell")).toHaveText("1,800");
    await page.screenshot({ path: testInfo.outputPath("total-table.png"), fullPage: true });
    await card.getByRole("radio", { name: "กราฟ", exact: true }).click();
    await expect(page.getByTestId("compare-chart").getByRole("figure")).toBeVisible();
    await expect(card.getByText("รวมทุกกลุ่มในตัวกรอง", { exact: true })).toBeVisible();
    const figure = page.getByTestId("compare-chart").getByRole("figure");
    const box = await figure.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByTestId("stock-chart-tip")).toContainText("รวมทุกกลุ่มในตัวกรอง");
    await card.screenshot({ path: testInfo.outputPath("total-chart.png") });
    await page.goto("/compare?by=division&measure=pages&division=1&months=2025-10,2025-11,2025-12");
    await card.getByRole("radio", { name: "ตาราง", exact: true }).click();
    await expect(values.getByRole("row", { name: /ตุลาคม 2568/ }).getByRole("cell").first()).toHaveText("1,500");
  });

  test(`legacy price gaps are explicit next to monthly and group costs, ${theme} ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 1280 ? 800 : 900 });
    await page.addInitScript((theme) => localStorage.setItem("suth-ui-mode", theme), theme);
    const rows = COMPARISON_ROWS.filter((row) => ["2025-10", "2025-11"].includes(row.month)).map((row) => ({
      ...row, total_cost: row.month === "2025-11" || row.device_id === 3 ? null : row.total_cost,
    }));
    await comparisonFixture(page, { rows });
    await page.goto("/compare?by=division&months=2025-10,2025-11&measure=cost");
    const card = page.getByRole("region", { name: "พื้นที่เปรียบเทียบ" });
    await expect(page.getByTestId("compare-cost-note")).toContainText("เฉพาะรายการที่มีราคา");
    await card.getByRole("radio", { name: "ตาราง", exact: true }).click();
    const values = card.getByRole("table", { name: "ค่าตัวเลขของกราฟด้านบน" });
    const october = values.getByRole("row", { name: /ตุลาคม 2568/ });
    await expect(october.getByRole("cell").first()).toHaveText("661.50");
    await expect(october).toContainText("ไม่มีราคา 1 รายการ");
    const november = values.getByRole("row", { name: /พฤศจิกายน 2568/ });
    await expect(november.getByRole("cell").first()).toHaveText("—");
    await expect(november).toContainText("ยังคำนวณไม่ได้");
    await expect(page.getByRole("table", { name: "ตารางรายละเอียดของการเปรียบเทียบ" })).toContainText("เฉพาะรายการที่มีราคา");
    await page.screenshot({ path: testInfo.outputPath("partial-cost.png"), fullPage: true });
    await card.getByRole("radio", { name: "จำนวนพิมพ์", exact: true }).click();
    await expect(page.getByTestId("compare-cost-note")).toHaveCount(0);
    await expect(values.getByRole("row", { name: /พฤศจิกายน 2568/ }).getByRole("cell").first()).toHaveText("2,150");
  });
}

test("all-unpriced has an honest empty state and fiscal years have no cross-year total", async ({ page }) => {
  await comparisonFixture(page, { rows: COMPARISON_ROWS.map((row) => ({ ...row, total_cost: null })) });
  await page.goto("/compare?by=division&months=2025-10,2025-11&measure=cost");
  const card = page.getByRole("region", { name: "พื้นที่เปรียบเทียบ" });
  await expect(card.getByText("ค่าพิมพ์ยังคำนวณไม่ได้", { exact: true })).toBeVisible();
  await page.goto("/compare?by=fiscalYear&years=2568,2569&measure=pages");
  await expect(page.getByTestId("compare-chart")).toBeVisible();
  await expect(card.getByText("รวมทุกกลุ่มในตัวกรอง", { exact: true })).toHaveCount(0);
  await card.getByRole("radio", { name: "ตาราง", exact: true }).click();
  await expect(card.getByRole("table").getByRole("columnheader")).toHaveCount(3);
});
