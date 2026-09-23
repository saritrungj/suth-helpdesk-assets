// apps/web/src/components/import/templates.js — ไฟล์ตัวอย่างของหน้านำเข้า
//
// ไฟล์ของผู้ให้เช่าอัปโหลดได้ตรงๆ ไม่ต้องแปลง ไฟล์ตัวอย่างมีไว้สำหรับเครื่องที่ไม่มีไฟล์ของผู้ให้เช่า
// ต้นฉบับของเทมเพลตทะเบียนอยู่ที่นี่ที่เดียว (docs/reference/import-format.md อ้างถึง) — ย้ายมาจาก DeviceImportPanel.vue

import { currentMonth } from "@suth/domain";
import { recentMonths, templateCsv } from "../print-usage-import";

/** เทมเพลตทะเบียน — คอลัมน์ตรงกับช่องกรอกในฟอร์ม "เพิ่มทีละเครื่อง" */
export const TEMPLATE_CSV = [
  "serial_number,brand,model,status,building,floor,location,division,department,contract_no,price_override,meter_category",
  "SN-HP-001,HP,LaserJet M404dn,active,อาคารบริหาร,ชั้น 2,ห้อง 201,ฝ่ายบริหารทั่วไป,งานการเงินและบัญชี,สัญญาเช่า 001/2568,,a4-laser-bw",
  "SN-CN-002,Canon,imageCLASS LBP6030,active,อาคารบริหาร,ชั้น 3,ห้อง 305,ฝ่ายบริหารทั่วไป,งานทรัพยากรบุคคล,สัญญาเช่า 001/2568,,a4-laser-bw",
].join("\r\n");

/** เทมเพลตยอดรายเดือน — สามเดือนล่าสุด ผู้ใช้เปลี่ยนหัวคอลัมน์เป็นเดือนที่จะนำเข้าจริง */
export const readingsTemplateCsv = () => templateCsv(recentMonths(currentMonth(), 3));

export function downloadCsv(content, filename) {
  // BOM นำหน้า เพื่อให้ Excel รู้ว่าเป็น UTF-8 ไม่งั้นภาษาไทยกลายเป็นตัวอ่านไม่ออก
  const url = URL.createObjectURL(new Blob(["﻿" + content], { type: "text/csv;charset=utf-8;" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
