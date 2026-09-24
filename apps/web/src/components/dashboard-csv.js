import { fiscalYearOfMonth } from "@suth/domain";
import { t } from "../lib/locale";
import { toCsv } from "../lib/export-csv";

/**
 * dashboard-csv.js — ไฟล์ CSV ของหน้าภาพรวมการพิมพ์
 *
 * CSV คือ **ข้อมูลดิบแบนแผ่นเดียว** สำหรับเอาไปคำนวณต่อ ไม่ใช่รายงาน — หนึ่งแถว
 * ต่อหนึ่งเครื่องต่อหนึ่งเดือน ไม่มีการรวมยอด ไม่มีกราฟ ส่วนรายงานที่มีสรุป กราฟ
 * และอันดับเป็นงานของไฟล์ Excel (comparison-export.js) สองอย่างนี้จึงไม่ซ้ำกัน
 *
 * ทุกแถวที่บันทึกได้มีราคาแล้วตาม ADR-0021
 */
export function dashboardCsv(rows) {
  const header = [
    t("เดือน"), t("ปีงบประมาณ"), t("Serial"), t("ฝ่าย"), t("แผนก"), t("สัญญาที่คิดเงิน"), t("อาคาร"), t("ชั้น"),
    t("ยอดพิมพ์"), t("ยอดพิมพ์หลังหัก 2%"), t("ค่าใช้จ่าย (บาท)"),
  ];
  const body = (rows ?? []).map((row) => {
    const month = row.calendar_month ?? row.month;
    return [
      month,
      fiscalYearOfMonth(month) ?? "",
      row.serial_number,
      row.division_name,
      row.department_name,
      row.billing_contract_no,
      row.building_name,
      row.floor_name,
      row.pages_printed,
      row.net_pages,
      row.total_cost ?? "",
    ];
  });
  return toCsv([header, ...body]);
}

/**
 * ส่งไฟล์ CSV ให้เบราว์เซอร์บันทึก
 *
 * BOM นำหน้าเสมอ ไม่งั้น Excel บน Windows อ่านภาษาไทยเป็นอักษรเพี้ยน และ URL ของ
 * blob ถูกคืนทิ้งหลังกดแล้ว ไม่ปล่อยค้างไว้ในหน่วยความจำของแท็บ
 */
export function downloadCsv(filename, content) {
  const url = URL.createObjectURL(new Blob(["﻿", content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
