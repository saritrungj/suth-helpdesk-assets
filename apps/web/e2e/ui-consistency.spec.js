import { expect, test } from "@playwright/test";
import { prototypeFixture } from "./prototype-fixture.js";
import { comparisonFixture } from "./comparison-fixture.js";

for (const theme of ["light", "dark"]) {
  test(`comparison uses billing contracts and keeps selected colors (${theme})`, async ({ page }, testInfo) => {
    await prototypeFixture(page);
    await page.addInitScript((value) => localStorage.setItem("suth-ui-mode", value), theme);
    await page.route("**/api/dashboard/monthly-kpi**", (route) => route.fulfill({ json: [
      { device_id: 1, month: "2025-10", pages_printed: 100, net_pages: 98, total_cost: 49,
        contract_id: 3, contract_no: "CURRENT", billing_contract_id: 1, billing_contract_no: "OLD-A" },
      { device_id: 1, month: "2026-09", pages_printed: 200, net_pages: 196, total_cost: 98,
        contract_id: 3, contract_no: "CURRENT", billing_contract_id: 2, billing_contract_no: "NEW-B" },
      { device_id: 2, month: "2026-09", pages_printed: 50, net_pages: 49, total_cost: 24.5,
        contract_id: 3, contract_no: "CURRENT", billing_contract_id: 3, billing_contract_no: "THIRD-C" },
    ] }));
    // ตัวเลือกของตัวกรองสัญญามาจากข้อมูลอ้างอิง ส่วนตัวเลขในตารางมาจากสัญญาที่คิดเงิน
    // ของเดือนนั้น — ตั้งให้เลขสัญญาตรงกันทั้งสองทาง เหมือนของจริง
    await page.route(/\/api\/contracts$/, (route) => route.fulfill({ json: [
      { id: 1, contract_no: "OLD-A", fiscal_year: 2568 },
      { id: 2, contract_no: "NEW-B", fiscal_year: 2569 },
      { id: 3, contract_no: "THIRD-C", fiscal_year: 2569 },
    ] }));
    await page.goto("/dashboard?by=contract&measure=pages");
    await expect(page.locator("html")).toHaveAttribute("data-mode", theme);
    const table = page.getByRole("table", { name: "ตารางรายละเอียดของการเปรียบเทียบ" });
    await expect(table.getByRole("row", { name: /OLD-A/ })).toContainText("100");
    await expect(table.getByRole("row", { name: /NEW-B/ })).toContainText("200");
    await expect(table).not.toContainText("CURRENT");
    const color = () => page.locator("li").filter({ hasText: /^OLD-A$/ }).locator("span[aria-hidden]")
      .evaluate((element) => getComputedStyle(element).backgroundColor);
    const original = await color();
    // ชื่อของปุ่มคือ "ป้ายที่เห็น + ค่าที่เลือกอยู่" จึงเทียบแบบขึ้นต้น ไม่ใช่ทั้งสตริง
    const filters = page.getByRole("region", { name: "ตัวกรองข้อมูล" });
    await filters.getByRole("button", { name: /^ตัวกรองเพิ่มเติม/ }).click();
    await filters.getByRole("button", { name: /^สัญญา / }).click();
    await page.getByRole("option", { name: "OLD-A" }).first().click();
    await page.getByRole("option", { name: "THIRD-C" }).first().click();
    await page.keyboard.press("Escape");
    await expect(table.getByRole("row", { name: /NEW-B/ })).toHaveCount(0);
    expect(await color()).toBe(original);
    await page.getByRole("radio", { name: "ค่าใช้จ่าย", exact: true }).click();
    await expect(table.getByRole("row", { name: /THIRD-C/ })).toContainText("24.50");
    await page.screenshot({ path: testInfo.outputPath(`dashboard-${theme}.png`), fullPage: true });
    await page.setViewportSize({ width: 320, height: 740 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
    await page.screenshot({ path: testInfo.outputPath(`dashboard-mobile-${theme}.png`), fullPage: true });
  });
}

test("comparison rejects inherited object properties as metric query values", async ({ page }) => {
  await prototypeFixture(page);
  await page.route("**/api/dashboard/monthly-kpi**", (route) => route.fulfill({ json: [
    { device_id: 1, month: "2025-10", pages_printed: 100, net_pages: 98, total_cost: 49,
      billing_contract_id: 1, billing_contract_no: "OLD-A" },
  ] }));

  await page.goto("/dashboard?by=constructor&measure=toString");

  await expect(page.getByRole("radio", { name: "ค่าใช้จ่าย", exact: true })).toBeChecked();
  await expect(page.getByRole("radio", { name: "ภาพรวม", exact: true })).toBeChecked();
  await expect(page.getByRole("heading", { name: "ค่าใช้จ่ายรายเดือน", exact: true })).toBeVisible();
});

/**
 * หน้าที่เหลือของงานนี้ (รายละเอียดเครื่องและอันดับรายเครื่อง) ต้องอ่านได้
 * ทั้งโหมดมืดและบนจอ 320px — หัวข้อ ป้ายสถานะ และคอลัมน์ที่เพิ่มเข้ามาในงานนี้อยู่บนหน้าเหล่านี้
 * ทั้งหมด และไม่มีเทสอื่นเปิดดูมันในสองสภาพนี้เลย
 */
const NARROW = { width: 320, height: 740 };
const KEY_PAGES = [
  { name: "asset-detail", url: "/assets/1", heading: "SUTH-001" },
  { name: "device-ranking", url: "/dashboard?by=device", heading: "ภาพรวมการพิมพ์" },
];

for (const target of KEY_PAGES) {
  test(`${target.name} reads in dark mode and at 320px`, async ({ page }, testInfo) => {
    await prototypeFixture(page, "admin");
    await page.addInitScript(() => localStorage.setItem("suth-ui-mode", "dark"));
    await page.goto(target.url);
    await expect(page.locator("#main-content h1")).toHaveText(target.heading);
    await page.screenshot({ path: testInfo.outputPath(`${target.name}-dark.png`), fullPage: true });

    await page.setViewportSize(NARROW);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
    await page.screenshot({ path: testInfo.outputPath(`${target.name}-narrow.png`), fullPage: true });
  });
}
