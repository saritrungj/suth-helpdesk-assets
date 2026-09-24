// apps/web/e2e/expense-scope.spec.js — ขอบเขตของตัวเลขบนหน้าค่าใช้จ่าย (#208)
//
// พบกับข้อมูลจริง: ค้นหาเครื่องแล้วยอดเงินด้านบนยังเป็นยอดทั้งสัญญาโดยไม่มีอะไรบอก และเดือนที่มีค่าเช่าแต่ไม่มีการพิมพ์
// เลือกไม่ได้ ยอดตามใบแจ้งหนี้ของช่วงที่เลือกได้จึงขาดค่าเช่าของเดือนเหล่านั้น

import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import * as XLSX from "xlsx";
import { prototypeFixture } from "./prototype-fixture.js";

const device = (id, serial, cost) => ({
  id, serial_number: serial, brand_name: "Brother", model: "HL-L5210DN", effective_prices: [0.365], price_override: null,
  total_cost: cost, total_pages: 1000, monthly: [{ month: "2026-09", pages: 1000, cost }],
});

async function expenseWithTwoDevices(page) {
  await prototypeFixture(page, "admin");
  await page.route(/\/api\/expense\/\d+/, (route) => route.fulfill({ json: {
    total_cost: "720.00",
    invoice_total: "2060.40",
    contracts: [{
      id: 1, contract_no: "SUTH-2569", effective_from: "2025-10-01", effective_to: "2028-09-30", monthly_rental: "1200.00", vat_rate: "7",
      total_cost: "720.00", total_cost_satang: 72000, rental: "1200.00", vat: "140.40", invoice_total: "2060.40",
      devices: [device(1, "TEST-A-001", 360), device(2, "TEST-B-002", 360)],
    }],
  } }));
}

test("ค้นหาเครื่อง: บอกว่าพบกี่จากกี่เครื่อง ยอดด้านบนยังเป็นยอดทั้งสัญญา และ Excel ส่งออกเฉพาะผลค้นหา", async ({ page }) => {
  await expenseWithTwoDevices(page);
  await page.goto("/expense");
  await expect(page.getByTestId("invoice-parts")).toContainText("ตามใบแจ้งหนี้ = ค่าพิมพ์ 720.00 + ค่าเช่าคงที่ 1,200.00 + VAT 140.40 = 2,060.40 บาท");

  await page.getByRole("textbox", { name: "ค้นหาสัญญาหรือเครื่อง", exact: true }).fill("TEST-A");
  const scope = page.getByTestId("expense-search-scope");
  await expect(scope).toContainText("พบ 1 จาก 2 เครื่อง");
  await expect(scope).toContainText("เป็นยอดทั้งสัญญา");
  const exportButton = page.getByTestId("expense-export");
  await expect(exportButton).toHaveText(/Excel เฉพาะผลค้นหา \(1 เครื่อง\)/);

  const pending = page.waitForEvent("download");
  await exportButton.click();
  const workbook = XLSX.read(await readFile(await (await pending).path()), { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: null });
  const serials = rows.flat().filter((cell) => typeof cell === "string" && cell.startsWith("TEST-"));
  expect(serials).toEqual(["TEST-A-001"]);

  await page.getByRole("textbox", { name: "ค้นหาสัญญาหรือเครื่อง", exact: true }).fill("");
  await expect(scope).toHaveCount(0);
  await expect(exportButton).toHaveText("Excel");
});

test("เลือกเดือนที่มีค่าเช่าแต่ไม่มีการพิมพ์ได้ และบอกว่าไม่มีข้อมูลพิมพ์", async ({ page }) => {
  const requests = [];
  await expenseWithTwoDevices(page);
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (/\/api\/expense\/\d+$/.test(url.pathname)) requests.push(url.searchParams.get("month"));
  });
  await page.goto("/expense");
  await page.getByLabel(/^เดือน/).click();
  // ปีงบของ fixture มีข้อมูลพิมพ์เฉพาะ ก.ย. 2569 — ต.ค. ต้องเลือกได้และบอกว่าไม่มีข้อมูลพิมพ์
  const october = page.getByRole("button", { name: /ต\.ค\..*ไม่มีข้อมูลพิมพ์/ });
  await expect(october).toBeEnabled();
  await october.click();
  await october.click();
  await page.keyboard.press("Escape");
  await expect.poll(() => requests.at(-1)).toMatch(/^\d{4}-10$/);
});
