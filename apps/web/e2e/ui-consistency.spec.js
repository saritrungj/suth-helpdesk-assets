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
      { device_id: 2, month: "2026-09", pages_printed: 50, net_pages: 49, total_cost: null,
        contract_id: 3, contract_no: "CURRENT", billing_contract_id: 3, billing_contract_no: "UNPRICED-C" },
    ] }));
    await page.goto("/compare?type=contract&metric=totalPages");
    await expect(page.locator("html")).toHaveAttribute("data-mode", theme);
    const table = page.getByRole("region", { name: "ตารางเปรียบเทียบ", exact: true });
    await expect(table.getByRole("row", { name: /OLD-A/ })).toContainText("100");
    await expect(table.getByRole("row", { name: /NEW-B/ })).toContainText("200");
    await expect(table).not.toContainText("CURRENT");
    const color = () => page.locator("li").filter({ hasText: /^OLD-A$/ }).locator("span[aria-hidden]")
      .evaluate((element) => getComputedStyle(element).backgroundColor);
    const original = await color();
    // ชื่อของปุ่มคือ "ป้ายที่เห็น + ค่าที่เลือกอยู่" จึงเทียบแบบขึ้นต้น ไม่ใช่ทั้งสตริง
    await page.getByLabel("สัญญาที่จะนำมาเทียบ").click();
    await page.getByRole("option", { name: "OLD-A", exact: true }).click();
    await page.getByRole("option", { name: "UNPRICED-C", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(table.getByRole("row", { name: /NEW-B/ })).toHaveCount(0);
    expect(await color()).toBe(original);
    await page.getByRole("radio", { name: "ค่าใช้จ่าย", exact: true }).click();
    await expect(table.getByRole("row", { name: /UNPRICED-C/ })).toContainText("ราคายังไม่ครบ");
    await page.screenshot({ path: testInfo.outputPath(`compare-${theme}.png`), fullPage: true });
    await page.setViewportSize({ width: 320, height: 740 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
    await page.screenshot({ path: testInfo.outputPath(`compare-mobile-${theme}.png`), fullPage: true });
  });
}

test("department comparison has one period selector and one metric control", async ({ page }, testInfo) => {
  await comparisonFixture(page);
  await page.goto("/compare?type=department&items=1,2");
  // ช่วงเวลา ตัวชี้วัด และ "เทียบระหว่าง" มีชุดเดียวในแถบเดียว — ไม่มีตัวเลือกช่วงที่แสดงซ้อนของกราฟเดิม
  await expect(page.getByLabel(/^ช่วงเวลา/)).toHaveCount(1);
  await expect(page.getByRole("radio", { name: "ค่าใช้จ่าย", exact: true })).toHaveCount(1);
  await expect(page.getByRole("radiogroup", { name: "เทียบระหว่าง" })).toHaveCount(1);
  await expect(page.getByLabel("เดือนเริ่มต้นของช่วงที่แสดง")).toHaveCount(0);
  await expect(page.getByLabel("เดือนสิ้นสุดของช่วงที่แสดง")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "ค่าใช้จ่ายที่ยืนยันแล้วของฝ่ายที่เลือก เทียบกับฐาน", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("compare-department.png"), fullPage: true });
});

test("comparison explains when a selected boundary month has no data", async ({ page }) => {
  await prototypeFixture(page);
  await page.route("**/api/dashboard/monthly-kpi**", (route) => route.fulfill({ json: [
    { device_id: 1, month: "2025-10", pages_printed: 100, net_pages: 98, total_cost: 49 },
  ] }));

  await page.goto("/compare?months=2025-10,2025-11");

  await expect(page.getByText("ยังสรุปช่วงนี้ไม่ได้ เพราะเดือนแรกหรือเดือนสุดท้ายที่เลือกยังไม่มีข้อมูล", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "ตารางเปรียบเทียบ", exact: true }))
    .toContainText("พฤศจิกายน 2568");
});

test("comparison controls follow the URL when the current page link clears its query", async ({ page }) => {
  await prototypeFixture(page);
  await page.route("**/api/dashboard/monthly-kpi**", (route) => route.fulfill({ json: [
    { device_id: 1, month: "2025-10", pages_printed: 100, net_pages: 98, total_cost: 49,
      billing_contract_id: 1, billing_contract_no: "OLD-A" },
  ] }));

  await page.goto("/compare?type=contract&metric=totalPages");
  await expect(page.getByRole("radio", { name: "สัญญา", exact: true })).toBeChecked();
  await expect(page.getByRole("radio", { name: "หน้าดิบ", exact: true })).toBeChecked();

  await page.getByRole("link", { name: "เปรียบเทียบ", exact: true }).click();
  await expect(page).toHaveURL(/\/compare$/);
  await expect(page.getByRole("radio", { name: "เดือน", exact: true })).toBeChecked();
  await expect(page.getByRole("radio", { name: "ค่าใช้จ่าย", exact: true })).toBeChecked();

  await page.goBack();
  await expect(page).toHaveURL(/type=contract/);
  await expect(page.getByRole("radio", { name: "สัญญา", exact: true })).toBeChecked();
  await expect(page.getByRole("radio", { name: "หน้าดิบ", exact: true })).toBeChecked();
});

test("comparison rejects inherited object properties as metric query values", async ({ page }) => {
  await prototypeFixture(page);
  await page.route("**/api/dashboard/monthly-kpi**", (route) => route.fulfill({ json: [
    { device_id: 1, month: "2025-10", pages_printed: 100, net_pages: 98, total_cost: 49,
      billing_contract_id: 1, billing_contract_no: "OLD-A" },
  ] }));

  await page.goto("/compare?type=contract&metric=constructor");

  await expect(page.getByRole("radio", { name: "ค่าใช้จ่าย", exact: true })).toBeChecked();
  await expect(page.getByRole("heading", { name: "ค่าใช้จ่ายสุทธิ แยกตามสัญญา", exact: true })).toBeVisible();
});

/**
 * หน้าที่เหลือของงานนี้ (รายละเอียดเครื่อง, ยืนยันช่วงสัญญา, อันดับรายเครื่อง) ต้องอ่านได้
 * ทั้งโหมดมืดและบนจอ 320px — หัวข้อ ป้ายสถานะ และคอลัมน์ที่เพิ่มเข้ามาในงานนี้อยู่บนหน้าเหล่านี้
 * ทั้งหมด และไม่มีเทสอื่นเปิดดูมันในสองสภาพนี้เลย
 */
const NARROW = { width: 320, height: 740 };
const KEY_PAGES = [
  { name: "asset-detail", url: "/assets/1", heading: "SUTH-001" },
  { name: "contract-price-review", url: "/admin/contract-prices", heading: "ยืนยันช่วงที่สัญญามีผล" },
  { name: "device-ranking", url: "/expense?tab=department", heading: "ค่าใช้จ่าย" },
];

for (const target of KEY_PAGES) {
  test(`${target.name} reads in dark mode and at 320px`, async ({ page }, testInfo) => {
    await prototypeFixture(page, "admin");
    await page.addInitScript(() => localStorage.setItem("suth-ui-mode", "dark"));
    await page.route("**/api/contracts/price-review**", (route) => route.fulfill({ json: { contracts: [
      { id: 1, contract_no: "CT-001/2569", fiscal_year: 2569, price_per_page: 0.4275, device_count: 3,
        effective_from: "2025-10-01", effective_to: null, price_confirmed: true, unpriced_readings: 0,
        outside_term_readings: 2, price_verified_at: "2026-09-17" },
    ] } }));

    await page.goto(target.url);
    await expect(page.locator("#main-content h1")).toHaveText(target.heading);
    await page.screenshot({ path: testInfo.outputPath(`${target.name}-dark.png`), fullPage: true });

    await page.setViewportSize(NARROW);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
    await page.screenshot({ path: testInfo.outputPath(`${target.name}-narrow.png`), fullPage: true });
  });
}
