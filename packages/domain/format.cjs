// packages/domain/format.cjs
//
// การจัดรูปแบบวันที่/เดือนเป็นภาษาไทยสำหรับแสดงผล
//
// เดิมฟังก์ชันเหล่านี้ถูก copy ไว้ในหน้าเว็บ 8 ที่ (CostChart, MonthlyChart, MonthPicker,
// ByDepartment, Compare, Expense, PrintTransactions, Report) ด้วยโค้ดชุดเดียวกันเป๊ะ
// `${monthsTH[m-1]} ${y+543}` ผลคือถ้าจะเปลี่ยนรูปแบบการแสดงผลต้องไล่แก้ทีละไฟล์
// และมีที่หนึ่งที่เขียนต่างจากที่อื่นอยู่แล้ว (Report ตัดปีเหลือสองหลัก)
//
// ระบบเก็บเดือนเป็น ค.ศ. เสมอ (ดู month.cjs) การบวก 543 จึงเป็นเรื่องของ "ชั้นแสดงผล"
// ล้วนๆ และควรอยู่ที่เดียว

const { BE_OFFSET, normalizeMonth } = require("./month.cjs");

/** ชื่อเดือนภาษาไทยแบบย่อ เรียงตามเลขเดือน 1-12 */
const MONTHS_TH = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

/** ชื่อเดือนภาษาไทยแบบเต็ม — บางหน้าใช้แบบเต็ม (หน้าเปรียบเทียบและหน้าค่าใช้จ่าย) */
const MONTHS_TH_FULL = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

/**
 * แปลงปี ค.ศ. เป็น พ.ศ. สำหรับแสดงผล
 * @param {number|string} ceYear
 * @returns {number}
 */
function toBuddhistYear(ceYear) {
  return Number(ceYear) + BE_OFFSET;
}

/**
 * เดือน "YYYY-MM" (รับ พ.ศ. หรือ ค.ศ.) เป็นข้อความไทย เช่น "ต.ค. 2568"
 * @param {string} month
 * @param {{ shortYear?: boolean, long?: boolean }} [options]
 *        shortYear = true จะได้ "ต.ค. 68" · long = true จะได้ "ตุลาคม 2568"
 * @returns {string} คืนค่าเดิมถ้ารูปแบบไม่ถูกต้อง เพื่อไม่ให้หน้าจอว่างเปล่าโดยไม่มีเบาะแส
 */
function formatMonthTH(month, options) {
  const normalized = normalizeMonth(month);
  if (!normalized) return month == null ? "" : String(month);

  const [year, monthNumber] = normalized.split("-");
  const beYear = toBuddhistYear(year);
  const names = options && options.long ? MONTHS_TH_FULL : MONTHS_TH;
  const name = names[Number(monthNumber) - 1];

  return options && options.shortYear
    ? `${name} ${String(beYear).slice(-2)}`
    : `${name} ${beYear}`;
}

/**
 * วันที่เป็นข้อความไทย เช่น "1 ต.ค. 2568"
 * @param {string|Date} value วันที่รูปแบบ "YYYY-MM-DD" หรือ Date
 * @returns {string} คืนค่าว่างถ้าแปลงไม่ได้
 */
function formatDateTH(value) {
  if (!value) return "";

  const text =
    value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);

  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(value);

  const [, year, monthNumber, day] = match;
  return `${Number(day)} ${MONTHS_TH[Number(monthNumber) - 1] || monthNumber} ${toBuddhistYear(year)}`;
}

/**
 * เลขปีงบ พ.ศ. จากช่วงเดือนของปีงบ — ปีงบตั้งชื่อตามปีที่มันสิ้นสุด (ก.ย.)
 * @param {{ startMonth: string, endMonth: string }|null} range
 * @returns {string} "-" ถ้ายังไม่มีปีงบที่เลือก
 */
function fiscalYearLabel(range) {
  if (!range || !range.endMonth) return "-";

  const normalized = normalizeMonth(range.endMonth);
  if (!normalized) return "-";

  return String(toBuddhistYear(normalized.split("-")[0]));
}

module.exports = {
  MONTHS_TH,
  MONTHS_TH_FULL,
  toBuddhistYear,
  formatMonthTH,
  formatDateTH,
  fiscalYearLabel,
};
