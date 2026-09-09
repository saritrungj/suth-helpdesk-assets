import { test, expect } from "@playwright/test";
import { sumSatang, toSatang } from "@suth/domain";
import { signIn, reasonToSkip, apiFetch } from "./fixtures.js";

test.beforeEach(async ({ context }) => {
  test.skip(await reasonToSkip());
  await signIn(context);
});

for (const language of ["th", "en"]) {
  test(`reports render and tables expand (${language})`, async ({ page }, testInfo) => {
    await page.addInitScript((value) => localStorage.setItem("suth-language", value), language);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (response.url().includes("/api/") && response.status() >= 500) errors.push(`API ${response.status()}: ${response.url()}`);
    });
    await page.goto("/dashboard");
    await expect(page.locator("h1")).toContainText(language === "en" ? "Printer and expense overview" : "ภาพรวมเครื่องพิมพ์");
    await expect(page.getByText(language === "en" ? "Full-year entry completion" : "กรอกยอดพิมพ์ครบทั้งปีงบ")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`dashboard-${language}.png`), fullPage: true });
    await page.goto("/compare");
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.getByText(language === "en" ? "Comparison table" : "ตารางเปรียบเทียบ", { exact: true })).toBeVisible();
    await page.goto("/assets");
    const search = page.getByRole("textbox", { name: language === "en" ? "Search serial, model, location…" : "ค้นหา Serial, รุ่น, ตำแหน่ง…" });
    await expect(search).toBeVisible();
    await search.fill("HP");
    await page.getByRole("button", { name: language === "en" ? "Expand table" : "ขยายตาราง", exact: true }).click();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
    await expect(search).toHaveValue("HP");
    await page.getByRole("button", { name: language === "en" ? "Columns" : "คอลัมน์" }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await expect.poll(() => page.getByRole("menu").evaluate((el) => document.fullscreenElement.contains(el))).toBe(true);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: language === "en" ? "Exit full screen" : "ย่อตาราง", exact: true }).click();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
    await expect(search).toHaveValue("HP");
    for (const route of ["/expense", "/expense?tab=department", "/report", "/print-transactions", "/admin/users"]) {
      await page.goto(route);
      await expect(page.locator("h1")).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
}

test("overview exposes annual and overdue coverage separately", async () => {
  const years = await apiFetch("/fiscal-years");
  test.skip(!years.length, "No fiscal year available");
  const overview = await apiFetch(`/dashboard/overview?fiscal_year_id=${years[0].id}`);
  expect(overview.coverage.total_months).toBe(12);
  expect(overview.coverage.months).toHaveLength(12);
  expect(overview.coverage.annual_complete_months).toBeLessThanOrEqual(12);
  if (overview.coverage.applicable) {
    expect(overview.coverage.annual_complete_months + overview.coverage.incomplete_months + overview.coverage.not_due_months).toBe(12);
  }
});

test("graph selection retains annual context and overdue links retain their scope", async ({ page }) => {
  await page.goto("/dashboard");
  const trend = page.locator("section").filter({ has: page.getByRole("heading", { name: "ยอดพิมพ์รายเดือน", exact: true }) });
  await trend.getByRole("radio", { name: "ตาราง", exact: true }).click();
  const months = trend.locator("tbody button");
  await expect(months).toHaveCount(12);
  await months.first().click();
  await expect(page).toHaveURL(/months=\d{4}-10/);
  await expect(months).toHaveCount(12);
  await expect(months.first()).toHaveAttribute("aria-pressed", "true");
  const selectedUrl = page.url();
  await page.reload();
  await expect(page.locator("h1")).toBeVisible();
  await expect(page).toHaveURL(selectedUrl);
  const overdue = page.getByRole("link", { name: "ไปกรอกยอดพิมพ์", exact: true });
  if (await overdue.count()) {
    await overdue.click();
    await expect(page).toHaveURL(/fill=empty/);
    await expect(page.getByRole("heading", { name: "บันทึกยอดพิมพ์รายเดือน" })).toBeVisible();
  }
});

test("unavailable comparison month explains missing data", async ({ page }) => {
  await page.route("**/api/dashboard/monthly-kpi?**", (route) => route.fulfill({ json: [] }));
  await page.goto("/compare?months=2026-09");
  await expect(page.getByText("ยังไม่มีข้อมูลในช่วงที่เลือก", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/months=2026-09/);
});

test("cancel language change retains unsaved device form", async ({ page }) => {
  await page.goto("/admin/add-asset");
  const serial = page.getByRole("textbox", { name: /^หมายเลข Serial/ });
  await serial.fill("UNSAVED-LANGUAGE-CHECK");
  await page.getByRole("button", { name: /บัญชีของ/ }).click();
  await page.getByRole("radio", { name: "English", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "กลับไปทำงานต่อ", exact: true }).click();
  await page.keyboard.press("Escape"); // Close the account menu after cancelling its dialog.
  await expect(serial).toHaveValue("UNSAVED-LANGUAGE-CHECK");
  await expect(page.locator("html")).toHaveAttribute("lang", "th");
});


test("language preference survives a reload", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: /บัญชีของ/ }).click();
  await page.getByRole("radio", { name: "English", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "เปลี่ยนภาษา", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("h1")).toContainText("Printer and expense overview");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});


test("report APIs return locations without breaking totals", async () => {
  const years = await apiFetch("/fiscal-years");
  test.skip(!years.length, "No fiscal year available");
  const highlights = await apiFetch(`/dashboard/highlights?fiscal_year_id=${years[0].id}`);
  for (const device of highlights.top_devices) {
    expect(Array.isArray(device.locations)).toBe(true);
    expect(device.locations.length).toBeGreaterThan(0);
    expect(device.locations[0]).toHaveProperty("building_name");
    expect(device.locations[0]).toHaveProperty("location");
  }
  await apiFetch(`/dashboard/by-department?fiscal_year_id=${years[0].id}`);
  const expense = await apiFetch(`/expense/${years[0].id}`);
  expect(Number.isFinite(Number(expense.total_cost_satang))).toBe(true);
  await apiFetch("/expense/unassigned-devices");
});

test("historical report views preserve row counts and financial totals", async () => {
  const [monthly, comparison, buildings, stats] = await Promise.all([
    apiFetch("/dashboard/monthly-kpi"),
    apiFetch("/dashboard/compare"),
    apiFetch("/dashboard/summary-by-building"),
    apiFetch("/dashboard/stats"),
  ]);

  expect(comparison).toHaveLength(monthly.length);
  expect(sumSatang(monthly.map((row) => toSatang(row.total_cost)))).toBe(
    sumSatang(comparison.map((row) => toSatang(row.total_cost)))
  );
  expect(sumSatang(monthly.map((row) => toSatang(row.total_cost)))).toBe(
    sumSatang(buildings.map((row) => toSatang(row.total_building_cost)))
  );
  expect(Number(stats.total_transactions)).toBe(monthly.length);
});

test("report device rows link to the complete asset detail", async ({ page }) => {
  await page.goto("/report");
  const detailLink = page.locator('a[href^="/assets/"]').first();
  test.skip(!(await detailLink.count()), "No devices available in the selected fiscal year");
  await expect(detailLink).toHaveAttribute("href", /^\/assets\/\d+$/);
});


test("filtered Excel export carries the search context", async ({ page }) => {
  await page.goto("/assets");
  await page.getByRole("textbox", { name: "ค้นหา Serial, รุ่น, ตำแหน่ง…" }).fill("HP");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Excel/ }).click();
  const download = await downloadPromise;
  const { readFile } = await import("node:fs/promises");
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await readFile(await download.path()), { type: "buffer" });
  const context = XLSX.utils.sheet_to_json(workbook.Sheets["บริบทรายงาน"], { header: 1 });
  expect(context).toContainEqual(["ค้นหา", "HP"]);
  expect(context).toContainEqual(["สกุลเงิน", "THB"]);
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 }).slice(1);
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.every((row) => row.some((value) => String(value).toUpperCase().includes("HP")))).toBe(true);
});
