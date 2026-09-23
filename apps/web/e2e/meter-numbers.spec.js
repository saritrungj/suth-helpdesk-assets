// apps/web/e2e/meter-numbers.spec.js
//
// เลขมิเตอร์ต้นงวด/สิ้นงวดจากไฟล์ผู้ให้เช่าต้องอยู่รอดการบันทึกที่ไม่ได้เปลี่ยนจำนวนหน้า (#143)
//
// หน้าต่างกรอกทั้งปีส่งครบทุกเดือนเสมอ (ต้องส่งเดือนที่ลบจนว่างด้วย) เดิมการเขียนทุกครั้ง
// ล้างเลขมิเตอร์ แก้เดือนเดียวเลขมิเตอร์ของทุกเดือนที่นำเข้าจากไฟล์จึงหายหมด ใช้เทียบใบแจ้งหนี้
// และตรวจความต่อเนื่องของเลขต่องวดไม่ได้อีก
//
// เทสนี้สร้างสัญญาและเครื่องของตัวเอง นำเข้าไฟล์ผ่านเส้นทางจริง แล้วลบทิ้งเมื่อจบ

import { expect, test } from "@playwright/test";
import * as XLSX from "xlsx";
import { activeFiscalYear, apiFetch, issueToken, reasonToSkip, writesAllowed } from "./fixtures.js";

const API_URL = process.env.SUTH_API_URL || "http://localhost:3000/api";
const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

test.beforeAll(async () => {
  const skip = await reasonToSkip();
  test.skip(Boolean(skip), `ต้องมี API + ฐานข้อมูลทำงานอยู่ — ${skip}`);
  test.skip(!writesAllowed(), "เทสนี้สร้างและลบสัญญาหนึ่งฉบับกับเครื่องหนึ่งเครื่องในฐานทดสอบแยก");
});

/** รายงานมิเตอร์ของผู้ให้เช่าหนึ่งงวด (งวดเดือนปฏิทิน) หนึ่งเครื่อง — รูปเดียวกับไฟล์จริงของ SUTH 86 */
function vendorFile({ month, contractNo, serial, start, end, price }) {
  const [year, m] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const name = EN_MONTHS[m - 1];
  const rows = [
    [`Meter Reading Report ${name} 1, ${year} to ${name} ${lastDay}, ${year} : Contract No. ${contractNo}`],
    ["No.", "SN.", "Model", "Printer Name", "Meter Start (B&W)", "Meter End (B&W)", "Cost/Click"],
    [1, serial, "Office 400", "E2E", start, end, price],
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

async function importMeters(buffer, mode, previewToken) {
  const form = new FormData();
  form.append("mode", mode);
  if (previewToken) form.append("preview_token", previewToken);
  form.append("file", new Blob([buffer]), "meters.xlsx");
  const res = await fetch(`${API_URL}/print-transactions/import`, {
    method: "POST",
    headers: { Cookie: `suth_session=${issueToken()}` },
    body: form,
  });
  const body = await res.json();
  expect(res.status, JSON.stringify(body)).toBe(200);
  return body;
}

async function reading(month, serial) {
  const rows = await apiFetch(`/dashboard/monthly-kpi?month=${month}`);
  return rows.find((row) => row.serial_number === serial);
}

test("บันทึกทั้งปีที่ไม่เปลี่ยนจำนวนหน้าของเดือนหนึ่ง ต้องไม่ล้างเลขมิเตอร์ของเดือนนั้น", async () => {
  const [fy, categories, devices] = await Promise.all([
    activeFiscalYear(),
    apiFetch("/contracts/meter-categories"),
    apiFetch("/devices"),
  ]);
  const monochrome = categories.find((category) => category.code === "bw");
  const template = devices.find((row) => row.brand_id);
  const [endYear, endMonth] = fy.end_month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(endYear, endMonth, 0)).toISOString().slice(0, 10);
  const [importedMonth, editedMonth] = [fy.start_month, (() => {
    const [y, m] = fy.start_month.split("-").map(Number);
    return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  })()];
  const stamp = Date.now();
  // รูปเดียวกับเลขที่สัญญาจริง ("SUTH 86/2567") — ตัวอ่านหัวแผ่นรับเฉพาะ ตัวอักษร เลข / ปี
  const contractNo = `TESTMN ${String(stamp).slice(-6)}/2569`;
  const serial = `E2E-MN-${stamp}`;
  let contractId = null;
  let deviceId = null;

  try {
    const contract = await apiFetch("/contracts", {
      method: "POST",
      body: JSON.stringify({
        contract_no: contractNo,
        effective_from: `${fy.start_month}-01`,
        effective_to: lastDay,
        price_lines: [{ category_id: monochrome.id, price_per_page: "0.4" }],
      }),
    });
    contractId = contract.id;

    const device = await apiFetch("/devices", {
      method: "POST",
      body: JSON.stringify({
        serial_number: serial,
        brand_id: template.brand_id,
        contract_id: contractId,
        meter_category_id: monochrome.id,
        status: "active",
        installation_status: "installed",
        installed_on: `${fy.start_month}-01`,
      }),
    });
    deviceId = device.id;

    const file = vendorFile({ month: importedMonth, contractNo, serial, start: 1000, end: 1300, price: 0.4 });
    const preview = await importMeters(file, "preview");
    expect(preview.errors).toEqual([]);
    await importMeters(file, "commit", preview.preview_token);

    const imported = await reading(importedMonth, serial);
    expect([imported.pages_printed, imported.meter_start, imported.meter_end]).toEqual([300, 1000, 1300]);

    // หน้าต่างกรอกทั้งปี: ส่งเดือนที่นำเข้าด้วยจำนวนหน้าเดิม และแก้อีกเดือนหนึ่ง
    await apiFetch("/print-transactions/bulk-device", {
      method: "POST",
      body: JSON.stringify({
        device_id: deviceId,
        items: [
          { month: importedMonth, pages: 300 },
          { month: editedMonth, pages: 50 },
        ],
      }),
    });
    const untouched = await reading(importedMonth, serial);
    expect([untouched.pages_printed, untouched.meter_start, untouched.meter_end]).toEqual([300, 1000, 1300]);

    // แก้จำนวนหน้าของเดือนที่นำเข้าจริง = ยอดไม่ได้มาจากเลขมิเตอร์แล้ว ต้องล้างทิ้ง
    await apiFetch("/print-transactions/bulk-device", {
      method: "POST",
      body: JSON.stringify({ device_id: deviceId, items: [{ month: importedMonth, pages: 310 }] }),
    });
    const edited = await reading(importedMonth, serial);
    expect([edited.pages_printed, edited.meter_start, edited.meter_end]).toEqual([310, null, null]);
  } finally {
    if (deviceId) {
      await apiFetch("/print-transactions/bulk-device", {
        method: "POST",
        body: JSON.stringify({
          device_id: deviceId,
          items: [
            { month: importedMonth, pages: null },
            { month: editedMonth, pages: null },
          ],
        }),
      });
      await apiFetch(`/devices/${deviceId}`, { method: "DELETE" });
    }
    if (contractId) await apiFetch(`/contracts/${contractId}`, { method: "DELETE" });
  }
});
