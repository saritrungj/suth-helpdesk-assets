import { test, expect } from "@playwright/test";
import { prototypeFixture } from "./prototype-fixture.js";

const LONG_LOCATION = "จุดบริการผู้ป่วยนอกและประสานการรักษาต่อเนื่อง ".repeat(5).trim();

async function entryFixture(page) {
  const state = await prototypeFixture(page);
  const rows = Array.from({ length: 25 }, (_, i) => ({
    id: i + 1, serial_number: `ENTRY-${String(i + 1).padStart(2, "0")}`,
    status: "active", building_id: 1, building_name: "อาคารผู้ป่วยนอก",
    floor_id: 1, floor_name: "ชั้น 2", division_id: 1, division_name: "ฝ่ายการพยาบาล",
    department_id: 1, department_name: "หน่วยบริการผู้ป่วยนอกและประสานงานการรักษาต่อเนื่อง",
    location: i === 0 ? LONG_LOCATION : `จุดบริการ ${i + 1}`,
  }));
  Object.assign(rows[1], { building_name: null, floor_name: null, division_name: null, department_name: null, location: null });
  await page.route(/\/api\/devices$/, route => route.fulfill({ json: rows }));
  return state;
}

for (const width of [1280, 1440]) {
  for (const theme of ["light", "dark"]) {
    test(`entry location context remains readable at ${width} ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 1280 ? 800 : 900 });
      await page.addInitScript(value => localStorage.setItem("suth-ui-mode", value), theme);
      await entryFixture(page);
      await page.goto("/print-transactions?month=2026-08");
      const table = page.getByRole("table", { name: "บันทึกจำนวนพิมพ์รายเดือน", exact: true });
      await expect(table.getByRole("link", { name: "ENTRY-01", exact: true })).toBeVisible();
      await page.screenshot({ path: `output/desktop-tables/entry-${process.env.SUTH_DESKTOP_SNAPSHOT_STAGE || "after"}-${width}-${theme}.png`, fullPage: true });
      await expect(table.getByRole("columnheader", { name: "ตึก/ชั้น" })).toBeVisible();
      await expect(table.getByRole("columnheader", { name: "ฝ่าย/แผนก" })).toBeVisible();
      await expect(table.getByRole("columnheader", { name: "รายละเอียดตำแหน่ง" })).toBeVisible();
      const first = table.getByRole("row").filter({ has: page.getByRole("link", { name: "ENTRY-01", exact: true }) });
      await expect(first.getByTitle(LONG_LOCATION, { exact: true })).toHaveText(LONG_LOCATION);
      expect((await first.getByTitle(LONG_LOCATION, { exact: true }).boundingBox()).height).toBeLessThanOrEqual(50);
      const blank = table.getByRole("row").filter({ has: page.getByRole("link", { name: "ENTRY-02", exact: true }) });
      await expect(blank.getByRole("cell").nth(1)).toHaveText("—");
      await expect(blank.getByRole("cell").nth(2)).toHaveText("—");
      await expect(blank.getByRole("cell").nth(3)).toHaveText("—");
      const link = await first.getByRole("link").boundingBox();
      const input = await first.getByRole("textbox").boundingBox();
      expect(link.x).toBeGreaterThanOrEqual(0);
      expect(input.x + input.width).toBeLessThanOrEqual(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
}

test("entry paste preserves device identity through sort, page, hidden columns and restored view", async ({ page }) => {
  const state = await entryFixture(page);
  await page.goto("/print-transactions?month=2026-08");
  const table = page.getByRole("table", { name: "บันทึกจำนวนพิมพ์รายเดือน", exact: true });
  await table.getByRole("button", { name: "Serial", exact: true }).click();
  await table.getByRole("button", { name: "Serial", exact: true }).click();
  await page.getByRole("button", { name: "คอลัมน์", exact: true }).click();
  await page.getByRole("checkbox", { name: "ฝ่าย/แผนก", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "หน้าถัดไป", exact: true }).click();
  await page.reload();
  await expect(table.getByRole("columnheader", { name: "Serial" })).toHaveAttribute("aria-sort", "descending");
  await expect(table.getByRole("columnheader", { name: "ฝ่าย/แผนก" })).toHaveCount(0);
  const first = table.locator("tbody tr").first();
  await expect(first.getByRole("link", { name: "ENTRY-05", exact: true })).toBeVisible();
  await first.getByRole("textbox").evaluate(element => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text", "501\n401");
    element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, clipboardData }));
  });
  const preview = page.getByRole("dialog", { name: "ตัวอย่างก่อนวางตัวเลข" });
  await expect(preview).toContainText("ENTRY-05");
  await expect(preview).toContainText("ENTRY-04");
  await expect(first.getByRole("textbox")).not.toHaveValue("501");
  await preview.getByRole("button", { name: "ยืนยันการวาง", exact: true }).click();
  await expect(first.getByRole("textbox")).toHaveValue("501");
  await expect(table.locator("tbody tr").nth(1).getByRole("textbox")).toHaveValue("401");
  await page.getByRole("button", { name: /บันทึก.*รายการ/ }).click();
  await expect.poll(() => state.writes.length).toBe(1);
  expect(state.writes[0]).toMatchObject({ month: "2026-08", items: [
    { device_id: 5, pages: 501 }, { device_id: 4, pages: 401 },
  ] });
});
