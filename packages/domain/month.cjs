// packages/domain/month.cjs
//
// จุดเดียวของระบบที่ตัดสินว่า "เดือน" หน้าตาเป็นยังไง
//
// ปัญหาเดิม: ระบบตกลงกันไว้ว่า print_transactions.month เก็บเป็น "YYYY-MM" แบบ ค.ศ.
// (ดู fiscal-year.cjs ที่แปลงปีงบ พ.ศ. เป็นช่วงเดือน ค.ศ. และ importController.js
// ที่แปลงหัวคอลัมน์ "meter 9/67" เป็น ค.ศ. ให้แล้ว) แต่ข้อมูลที่ถูกยัดเข้าฐานข้อมูลตรงๆ
// (phpMyAdmin / SQL มือ) เป็น พ.ศ. เช่น "2568-10" พอ query ด้วยช่วงปีงบจริง
// ("2025-10" ถึง "2026-09") จึงไม่เจอสักแถว — หน้าค่าใช้จ่ายและยอดพิมพ์รายเดือน
// ว่างเปล่าทั้งที่มีข้อมูลอยู่
//
// ข้อตกลงที่ใช้ต่อจากนี้:
//   - รับเข้า  : รับได้ทั้ง พ.ศ. และ ค.ศ. (ผู้ใช้/ไฟล์นำเข้า/API พิมพ์มาแบบไหนก็ได้)
//   - เก็บ     : ค.ศ. "YYYY-MM" อย่างเดียวเสมอ
//   - แสดงผล  : พ.ศ. (ฝั่ง frontend บวก 543 เองอยู่แล้วทุกหน้า)
//
// เหตุผลที่ไม่เก็บทั้งสองแบบปนกันในคอลัมน์เดียว: "2568-10" กับ "2025-10" คือเดือนเดียวกัน
// แต่เป็นคนละ string ทำให้ UNIQUE KEY (device_id, month) กันข้อมูลซ้ำไม่ได้ ยอดพิมพ์เดือน
// เดียวกันจะถูกนับสองรอบและค่าใช้จ่ายบานโดยไม่มีอะไรเตือน — จึงต้อง normalize ตั้งแต่ขาเข้า

const BE_OFFSET = 543;

// เส้นแบ่งว่าเลขปีที่รับมาเป็น พ.ศ. หรือ ค.ศ.
// ปี >= 2400 ถือเป็น พ.ศ. (2400 พ.ศ. = 1857 ค.ศ.) — ระบบนี้ไม่มีทางมีข้อมูลปี ค.ศ. 2400
// และไม่มีทางมีข้อมูลปี พ.ศ. ที่ต่ำกว่า 2400 เส้นนี้จึงไม่กำกวมตลอดอายุการใช้งานระบบ
const BE_YEAR_THRESHOLD = 2400;

// ช่วงปี ค.ศ. ที่ยอมรับหลังแปลงแล้ว — กันค่าพิมพ์ผิดแบบ "0025-10" หรือ "9999-01"
const CE_YEAR_MIN = 1900;
const CE_YEAR_MAX = BE_YEAR_THRESHOLD - 1;

/**
 * เลขปีนี้เป็น พ.ศ. หรือไม่
 * @param {number} year
 * @returns {boolean}
 */
function isBuddhistYear(year) {
  return Number(year) >= BE_YEAR_THRESHOLD;
}

/**
 * แยกส่วน "ปี" กับ "เดือน" ออกจากข้อความที่ผู้ใช้/ไฟล์ส่งมา
 * รองรับรูปแบบที่เจอจริงในระบบนี้:
 *   "2025-10", "2568-10"   ปี-เดือน (คั่นด้วย - หรือ /)
 *   "2568-1"               เดือนหลักเดียว ไม่เติม 0
 *   "10/2568"              เดือน/ปี (แบบที่คนไทยพิมพ์บ่อย)
 * @param {string} text
 * @returns {{ year: number, month: number } | null}
 */
function splitYearMonth(text) {
  const parts = text.split(/[-/]/);
  if (parts.length !== 2) return null;

  const [left, right] = parts;
  if (!/^\d+$/.test(left) || !/^\d+$/.test(right)) return null;

  // ฝั่งไหนยาว 4 หลัก ฝั่งนั้นคือปี — ถ้ายาว 4 หลักทั้งคู่ ถือว่ากำกวม ไม่เดา
  if (left.length === 4 && right.length === 4) return null;
  if (left.length === 4) return { year: Number(left), month: Number(right) };
  if (right.length === 4) return { year: Number(right), month: Number(left) };

  return null;
}

/**
 * แปลงเดือนที่รับเข้ามา (พ.ศ. หรือ ค.ศ. ก็ได้) ให้เป็น "YYYY-MM" แบบ ค.ศ. สำหรับเก็บลงฐานข้อมูล
 *
 * @param {string|number|Date|null|undefined} value
 * @returns {string|null} "YYYY-MM" (ค.ศ.) หรือ null ถ้ารูปแบบไม่ถูกต้อง
 */
function normalizeMonth(value) {
  if (value === null || value === undefined) return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const y = value.getFullYear();
    const m = value.getMonth() + 1;
    if (y < CE_YEAR_MIN || y > CE_YEAR_MAX) return null;
    return `${y}-${String(m).padStart(2, "0")}`;
  }

  const text = String(value).trim();
  if (!text) return null;

  const parsed = splitYearMonth(text);
  if (!parsed) return null;

  const { month } = parsed;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;

  const year = isBuddhistYear(parsed.year) ? parsed.year - BE_OFFSET : parsed.year;
  if (year < CE_YEAR_MIN || year > CE_YEAR_MAX) return null;

  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * แปลงเดือน ค.ศ. ที่เก็บไว้ กลับเป็น พ.ศ. สำหรับแสดงผล/ส่งออกไฟล์
 * @param {string} ceMonth "YYYY-MM" (ค.ศ.)
 * @returns {string|null} "YYYY-MM" (พ.ศ.)
 */
function toBuddhistMonth(ceMonth) {
  const normalized = normalizeMonth(ceMonth);
  if (!normalized) return null;

  const [year, month] = normalized.split("-");
  return `${Number(year) + BE_OFFSET}-${month}`;
}

/**
 * อ่านค่า query string ของเดือน — เดือนเดียว "YYYY-MM" หรือหลายเดือนคั่นด้วย comma
 * (MonthPicker ส่งมาแบบหลายเดือนตอนกดเลือกด่วน "ไตรมาส"/"ครึ่งปี")
 *
 * normalize ทุกตัวเป็น ค.ศ. และตัดตัวที่รูปแบบผิดทิ้ง — คืน array เสมอ
 * ใช้คู่กับ "col IN (?)" ผ่าน mysql2 ได้ตรงๆ
 *
 * @param {string|undefined} raw
 * @returns {string[]}
 */
function parseMonths(raw) {
  if (!raw) return [];

  const months = String(raw)
    .split(",")
    .map((m) => normalizeMonth(m))
    .filter(Boolean);

  // ตัดเดือนซ้ำออก เผื่อผู้ใช้ส่ง "2568-10,2025-10" ซึ่งคือเดือนเดียวกันหลังแปลงแล้ว
  return [...new Set(months)];
}

module.exports = {
  BE_OFFSET,
  BE_YEAR_THRESHOLD,
  CE_YEAR_MIN,
  CE_YEAR_MAX,
  isBuddhistYear,
  normalizeMonth,
  toBuddhistMonth,
  parseMonths,
};
