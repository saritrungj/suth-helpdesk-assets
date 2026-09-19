import { toBuddhistYear } from "@suth/domain";
export { recentMonths } from "@suth/domain";
import { toCsv } from "../lib/export-csv";
import { t } from "../lib/locale";

/**
 * print-usage-import.js — ตัวช่วยของหน้าตรวจไฟล์นำเข้ายอดพิมพ์ (#106)
 */

/**
 * หัวคอลัมน์มิเตอร์ของเดือนหนึ่ง — รูปแบบเดียวกับที่ API อ่าน ("meter M/YY" ปี พ.ศ. 2 หลัก
 * ดู parseMeterMonthHeader ใน apps/api/src/import/controller.js)
 *
 * @param {string} month "YYYY-MM" (ค.ศ.)
 */
export function meterHeader(month) {
  const [year, value] = String(month).split("-");
  return `meter ${Number(value)}/${String(toBuddhistYear(Number(year))).slice(-2)}`;
}

/**
 * ไฟล์ตัวอย่าง — ใช้เดือนล่าสุด ไม่ตรึงเดือนเก่า เดิมไฟล์ตัวอย่างเขียน 10/67–12/67
 * ตายตัว คนที่ดาวน์โหลดมากรอกต่อจึงนำเข้ายอดของปีปัจจุบันไปไว้ใต้เดือนของปี 2567
 */
export function templateCsv(months) {
  return [
    ["SN.", ...months.map(meterHeader)].join(","),
    ["SN-HP-001", 1200, 1350, 1420].slice(0, months.length + 1).join(","),
    ["SN-CN-002", 800, "", 950].slice(0, months.length + 1).join(","),
  ].join("\r\n");
}

/** รายการที่จะเขียนทับทั้งหมดเป็น CSV — ค่าในไฟล์มาจากไฟล์ผู้ใช้ จึงผ่าน toCsv เสมอ (#87) */
export function overwriteCsv(rows) {
  return toCsv([
    ["Serial", t("เดือน"), t("ค่าเดิม"), t("ค่าใหม่")],
    ...(rows ?? []).map((row) => [row.serial_number, row.month, row.previous_pages, row.pages]),
  ]);
}
