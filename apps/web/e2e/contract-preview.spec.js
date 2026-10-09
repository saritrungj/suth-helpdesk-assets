// apps/web/e2e/contract-preview.spec.js
//
// ดูผลกระทบก่อนบันทึกสัญญาต้องนับยอดตามใบแจ้งหนี้ ไม่ใช่แค่ค่าพิมพ์ (#156)
//
// เดิมเทียบเฉพาะค่าพิมพ์ (v_monthly_kpi) เพิ่มค่าเช่าคงที่และ VAT ให้สัญญาที่มียอดทั้งปีราว 655,000 บาท
// แล้วหน้าดูผลกระทบบอก "เงินทุกงวดไม่เปลี่ยน" ทั้งที่ใบแจ้งหนี้เพิ่มขึ้นหลายหมื่นบาท
// ผลกระทบต้องมาจาก v_contract_invoice ตัวเดียวกับหน้าค่าใช้จ่าย จึงต้องทดสอบกับฐานข้อมูลจริง

import { expect, test } from "@playwright/test";
import { activeFiscalYear, apiFetch, reasonToSkip, restoreMonth, writesAllowed } from "./fixtures.js";

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

test("แก้ราคาของสัญญาที่มียอดแล้ว — ยอดย้อนหลังหลังบันทึกเท่ากับที่ดูผลกระทบบอกไว้ (#309)", async () => {
  const [fy, categories, devices] = await Promise.all([
    activeFiscalYear(),
    apiFetch("/contracts/meter-categories"),
    apiFetch("/devices"),
  ]);
  const monochrome = categories.find((category) => category.code === "bw");
  const template = devices.find((row) => row.brand_id);
  test.skip(!monochrome || !template, "ต้องมีหมวดมิเตอร์ขาวดำและเครื่องต้นแบบในฐานทดสอบ");

  const [endYear, endMonth] = fy.end_month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(endYear, endMonth, 0)).toISOString().slice(0, 10);
  const month = fy.start_month;
  const stamp = Date.now();
  const base = {
    contract_no: `E2E-PRICE-IMPACT-${stamp}`,
    effective_from: `${fy.start_month}-01`,
    effective_to: lastDay,
    price_lines: [{ category_id: monochrome.id, price_per_page: "0.4" }],
  };
  const repriced = { ...base, price_lines: [{ category_id: monochrome.id, price_per_page: "0.45" }] };
  let contractId = null;
  let deviceId = null;

  const costInSystem = async () => {
    const rows = await apiFetch(`/dashboard/monthly-kpi?month=${month}`);
    return Number(rows.find((row) => row.device_id === deviceId).total_cost);
  };

  try {
    contractId = (await apiFetch("/contracts", { method: "POST", body: JSON.stringify(base) })).id;
    deviceId = (await apiFetch("/devices", {
      method: "POST",
      body: JSON.stringify({
        serial_number: `E2E-PRICE-IMPACT-${stamp}`,
        brand_id: template.brand_id,
        contract_id: contractId,
        meter_category_id: monochrome.id,
        price_override: null,
        status: "active",
        installation_status: "installed",
        installed_on: `${fy.start_month}-01`,
      }),
    })).id;

    // 1,000 หน้า หลังหัก 2% เหลือ 980 หน้า — 392.00 บาทที่ 0.40 และ 441.00 บาทที่ 0.45
    await apiFetch("/print-transactions/bulk", {
      method: "POST",
      body: JSON.stringify({ month, items: [{ device_id: deviceId, pages: 1000 }] }),
    });
    expect(await costInSystem()).toBe(392);

    const preview = await apiFetch(`/contracts/${contractId}`, {
      method: "PUT",
      body: JSON.stringify({ ...repriced, preview: true }),
    });
    expect(preview.preview).toBe(true);
    const told = preview.impact.find((row) => row.month === month);
    expect(Number(told.before)).toBe(392);
    expect(Number(told.after)).toBe(441);
    // ดูผลกระทบไม่เขียนอะไร — ยอดในระบบยังเป็นราคาเดิม
    expect(await costInSystem()).toBe(392);

    const saved = await apiFetch(`/contracts/${contractId}`, { method: "PUT", body: JSON.stringify(repriced) });
    expect(Number(saved.impact.find((row) => row.month === month).after)).toBe(441);
    expect(await costInSystem()).toBe(Number(told.after));
  } finally {
    if (deviceId) {
      await restoreMonth(month, [{ device_id: deviceId, pages: null }]);
      await apiFetch(`/devices/${deviceId}`, { method: "DELETE" });
    }
    if (contractId) await apiFetch(`/contracts/${contractId}`, { method: "DELETE" });
  }
});
