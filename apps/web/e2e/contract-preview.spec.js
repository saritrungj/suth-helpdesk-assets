// apps/web/e2e/contract-preview.spec.js
//
// ดูผลกระทบก่อนบันทึกสัญญาต้องนับยอดตามใบแจ้งหนี้ ไม่ใช่แค่ค่าพิมพ์ (#156)
//
// เดิมเทียบเฉพาะค่าพิมพ์ (v_monthly_kpi) เพิ่มค่าเช่าคงที่และ VAT ให้สัญญาที่มียอดทั้งปีราว 655,000 บาท
// แล้วหน้าดูผลกระทบบอก "ยอดเงินทุกงวดไม่เปลี่ยน" ทั้งที่ใบแจ้งหนี้เพิ่มขึ้นหลายหมื่นบาท
// ผลกระทบต้องมาจาก v_contract_invoice ตัวเดียวกับหน้าค่าใช้จ่าย จึงต้องทดสอบกับฐานข้อมูลจริง

import { expect, test } from "@playwright/test";
import { activeFiscalYear, apiFetch, reasonToSkip, writesAllowed } from "./fixtures.js";

test.beforeAll(async () => {
  const skip = await reasonToSkip();
  test.skip(Boolean(skip), `ต้องมี API + ฐานข้อมูลทำงานอยู่ — ${skip}`);
  test.skip(!writesAllowed(), "เทสนี้สร้างและลบสัญญาหนึ่งฉบับในฐานทดสอบแยก");
});

test("เพิ่มค่าเช่าคงที่และ VAT แล้วดูผลกระทบเห็นยอดตามใบแจ้งหนี้ของทุกงวดที่เปลี่ยน", async () => {
  const [fy, categories] = await Promise.all([activeFiscalYear(), apiFetch("/contracts/meter-categories")]);
  const monochrome = categories.find((category) => category.code === "bw");
  const [endYear, endMonth] = fy.end_month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(endYear, endMonth, 0)).toISOString().slice(0, 10);
  const base = {
    contract_no: `E2E-INVOICE-PREVIEW-${Date.now()}`,
    effective_from: `${fy.start_month}-01`,
    effective_to: lastDay,
    price_lines: [{ category_id: monochrome.id, price_per_page: "0.4" }],
  };
  let contractId = null;

  try {
    const contract = await apiFetch("/contracts", { method: "POST", body: JSON.stringify(base) });
    contractId = contract.id;

    const preview = await apiFetch(`/contracts/${contractId}`, {
      method: "PUT",
      body: JSON.stringify({ ...base, monthly_rental: "1000", vat_rate: "7", preview: true }),
    });

    // ไม่มียอดพิมพ์เลย — ทุกงวดในอายุสัญญาเปลี่ยนจากไม่มีใบแจ้งหนี้เป็นค่าเช่า 1,000 + VAT 70
    expect(preview.preview).toBe(true);
    expect(preview.impact).toHaveLength(12);
    for (const row of preview.impact) {
      expect(Number(row.after), row.month).toBe(1070);
      expect(row.before, row.month).toBeNull();
    }

    // ดูผลกระทบย้อนกลับเสมอ — สัญญาในฐานยังไม่มีค่าเช่า
    const stored = await apiFetch(`/contracts/${contractId}`);
    expect(stored.monthly_rental).toBeNull();
  } finally {
    if (contractId) await apiFetch(`/contracts/${contractId}`, { method: "DELETE" });
  }
});
