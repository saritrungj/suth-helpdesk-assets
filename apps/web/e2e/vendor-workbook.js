// apps/web/e2e/vendor-workbook.js — รายงานมิเตอร์สังเคราะห์ รูปแบบเดียวกับไฟล์จริงของผู้ให้เช่า (#180)
//
// ไฟล์จริงเก็บนอก repo (repo เป็น public และไฟล์มีเลขเครื่องและชื่อหน่วยงานจริง) ตัวสร้างนี้เลียนโครงสร้างที่ตัวนำเข้า
// ต้องรับมือจริง: หัวรายงานแถวแรกพร้อมวันที่ พ.ศ. เลขที่สัญญาและเลขงวด, หัวตารางแถวที่สอง, เครื่องสีสองแถว
// (ขาวดำแล้วสี), แถวเครื่องสำรองที่ไม่มีเลขสิ้นงวด, แถวสรุปท้ายแผ่น และยอด "รวมค่าพิมพ์" ที่ไม่ได้ปัด
// เลขเครื่องเป็นรูป TX9-… เท่านั้น

import * as XLSX from "xlsx";

const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-08" → { start: 24 ก.ค., end: 23 ส.ค. } งวดแบบ 24–23 นับเป็นเดือนที่งวดสิ้นสุด */
function period(month) {
  const [y, m] = month.split("-").map(Number);
  const prev = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
  const be = (year) => year + 543;
  return {
    start: `${EN_MONTHS[prev.m - 1]} 24, ${be(prev.y)}`,
    end: `${EN_MONTHS[m - 1]} 23, ${be(y)}`,
  };
}

const HEADER = [
  "No.", "Model", "SN.", "Printer Name", "Division", "Department", "Department2", "Building", "Fool.",
  "Meter Start (B&W)", "Meter End (B&W)", "Total Meter (B&W) Before Discount 2%", "Discount 2% ",
  "Net Total Meter (B&W) After Discount ", "B&W Cost/Click (THB)", "Total Cost B&W (THB)",
];

/**
 * @param {object} spec
 * @param {string} spec.contractNo
 * @param {string[]} spec.months งวดเรียงจากเก่าไปใหม่ "YYYY-MM" — งวดแรกคืองวดที่ 1 ของสัญญา
 * @param {Array<{ serial: string, model: string, place: string, division: string, department: string, building: string, floor: string,
 *   price: number, pages: number[], color?: { price: number, pages: number[] }, spare?: boolean }>} spec.devices
 *   pages[i] = จำนวนหน้าของงวด i (spare = เครื่องสำรอง ไม่มีเลขสิ้นงวดทุกงวด)
 * @returns {{ buffer: Buffer, expected: { pagesByMonth: Record<string, number>, costByMonth: Record<string, number> } }}
 */
export function meterReportWorkbook({ contractNo, months, devices }) {
  const workbook = XLSX.utils.book_new();
  const pagesByMonth = {};
  const costByMonth = {};

  months.forEach((month, index) => {
    const { start, end } = period(month);
    const rows = [
      [`Meter Reading Report from Installation Date; ${start}  to ${end} : Contract No. ${contractNo}    งวดที่ ${index + 1}/36`],
      HEADER,
    ];
    const netByPrice = new Map();
    let no = 0;
    for (const device of devices) {
      no += 1;
      const meters = [{ price: device.price, pages: device.pages }, ...(device.color ? [device.color] : [])];
      for (const meter of meters) {
        const base = [String(no), device.model, device.serial, device.place, device.division, device.department, "", device.building, device.floor];
        if (device.spare) {
          rows.push([...base, "", "", "", "", "", meter.price, ""]);
          continue;
        }
        const startMeter = meter.pages.slice(0, index).reduce((sum, p) => sum + p, 1000);
        const pages = meter.pages[index];
        const net = pages * 0.98;
        rows.push([...base, startMeter, startMeter + pages, pages, pages * 0.02, net, meter.price, net * meter.price]);
        netByPrice.set(meter.price, (netByPrice.get(meter.price) ?? 0) + net);
        pagesByMonth[month] = (pagesByMonth[month] ?? 0) + pages;
      }
    }
    // ยอดท้ายแผ่นแบบผู้ให้เช่า: รวมก่อนปัด — ระบบปัดทีละรายการราคา (ADR-0022) จึงต่างได้ไม่เกิน 1 สตางค์
    const fileTotal = [...netByPrice].reduce((sum, [price, net]) => sum + price * net, 0);
    costByMonth[month] = [...netByPrice].reduce((sum, [price, net]) => sum + Math.round(price * net * 100), 0) / 100;
    rows.push([], ["รวมค่าพิมพ์/บาท", fileTotal], [fileTotal]);
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), `${index + 1}-TEST-${month}`);
  });

  return {
    buffer: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }),
    expected: { pagesByMonth, costByMonth },
  };
}

/** สองงวดล่าสุดที่จบแล้ว เทียบกับวันนี้ — ไฟล์รายงวดจริงมาหลังงวดจบ */
export function lastCompletedMonths(count = 2, today = new Date()) {
  const months = [];
  for (let back = count; back >= 1; back -= 1) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - back, 1));
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}
