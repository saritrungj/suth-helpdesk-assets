// apps/web/e2e/billing-shapes.spec.js
//
// ข้อมูลรูปเดียวกับสัญญาจริงใน seed_ci.sql (#140) คิดเงินถูกตั้งแต่วันนี้ — เทสชุดนี้อ่านอย่างเดียว
//
// สัญญา SUTH-CI-24TH-* เริ่มวันที่ 24 มีค่าเช่าคงที่ 1,500 บาทกับ VAT 7% และเครื่อง CI-SN-033
// มีมิเตอร์ขาวดำ A3 กับมิเตอร์สี A3 ที่มีเลขมิเตอร์จากไฟล์ผู้ให้เช่า เทสที่นี่ยืนยันพฤติกรรม
// ที่ถูกอยู่แล้ว เพื่อให้การแก้บั๊กรอบถัดไปบนข้อมูลรูปนี้มีตาข่ายรับ
//
// ตัวเลขที่คาดไว้คำนวณจากกฎของ ADR-0022/0023 ในเทสนี้เอง ไม่ได้อ่านจาก view แล้วเทียบกับตัวมันเอง

import { expect, test } from "@playwright/test";
import { toSatang } from "@suth/domain";
import { activeFiscalYear, apiFetch, reasonToSkip } from "./fixtures.js";

const SERIAL = "CI-SN-033";

test.beforeAll(async () => {
  const skip = await reasonToSkip();
  test.skip(Boolean(skip), `ต้องมี API + ฐานข้อมูลทำงานอยู่ — ${skip}`);
});

/** เครื่องและสัญญารูปจริงจาก seed — ไม่มี = seed ที่รันไม่ใช่รุ่นนี้ */
async function seededShape() {
  const [contracts, rows] = await Promise.all([apiFetch("/contracts"), apiFetch("/dashboard/monthly-kpi")]);
  const contract = contracts.find((row) => row.contract_no.startsWith("SUTH-CI-24TH-"));
  const readings = rows.filter((row) => row.serial_number === SERIAL);
  expect(contract, "seed_ci.sql ต้องมีสัญญาที่เริ่มวันที่ 24").toBeTruthy();
  expect(readings.length, "seed_ci.sql ต้องมียอดของเครื่องมิเตอร์สี").toBeGreaterThan(0);
  return { contract, readings };
}

/** ยอดเงินของหนึ่งแถวตาม ADR-0022 เมื่อแถวนั้นอยู่คนเดียวในรายการราคา — ปัดครั้งเดียวเป็นสตางค์ */
const lineSatang = (pages, price) => Math.round(pages * 0.98 * Number(price) * 100);

test("เครื่องมิเตอร์สีคิดเงินแต่ละมิเตอร์ด้วยรายการราคาของหมวดตัวเอง", async () => {
  const { contract, readings } = await seededShape();
  const priceOf = (code) => contract.price_lines.find((line) => line.category_code === code).price_per_page;

  // สามงวด × สองมิเตอร์ ทุกแถวหาราคาได้ (สัญญาเริ่มคิดเงินเดือนถัดจากเดือนที่เริ่มสัญญา)
  expect(readings).toHaveLength(6);
  for (const row of readings) {
    const price = row.is_color ? priceOf("a3-color") : priceOf("a3-bw");
    expect(Number(row.price_per_page), `${row.month} ${row.meter_category}`).toBe(Number(price));
    expect(toSatang(row.total_cost), `${row.month} ${row.meter_category}`).toBe(lineSatang(row.pages_printed, price));
    expect(row.billing_contract_id).toBe(contract.id);
  }
});

test("ใบแจ้งหนี้ของสัญญากลางเดือนบวกค่าเช่าและ VAT ครั้งเดียวต่องวด ตั้งแต่งวดแรกที่คิดเงิน", async () => {
  const { contract, readings } = await seededShape();
  const fy = await activeFiscalYear();
  const months = [...new Set(readings.map((row) => row.month))].filter((m) => m >= fy.start_month && m <= fy.end_month);
  test.skip(!months.length, "งวดของเครื่องมิเตอร์สีไม่อยู่ในปีงบปัจจุบัน (รันช่วงต้นปีงบ)");

  for (const month of months) {
    const expense = await apiFetch(`/expense/${fy.id}?month=${month}`);
    const invoice = expense.contracts.find((row) => row.id === contract.id);
    const printSatang = readings
      .filter((row) => row.month === month)
      .reduce((sum, row) => sum + toSatang(row.total_cost), 0);
    const rentalSatang = toSatang(contract.monthly_rental);
    const vatSatang = Math.round(((printSatang + rentalSatang) * Number(contract.vat_rate)) / 100);

    expect(toSatang(invoice.rental), month).toBe(rentalSatang);
    expect(toSatang(invoice.vat), month).toBe(vatSatang);
    expect(toSatang(invoice.invoice_total), month).toBe(printSatang + rentalSatang + vatSatang);
  }

  // เดือนที่สัญญาเริ่ม (วันที่ 24) ยังไม่ใช่งวดแรก — ไม่มีค่าเช่าเรียกเก็บ (ADR-0023)
  const startMonth = contract.effective_from.slice(0, 7);
  if (startMonth >= fy.start_month && startMonth <= fy.end_month) {
    const expense = await apiFetch(`/expense/${fy.id}?month=${startMonth}`);
    const invoice = expense.contracts.find((row) => row.id === contract.id);
    expect(toSatang(invoice?.rental ?? "0"), startMonth).toBe(0);
  }
});
