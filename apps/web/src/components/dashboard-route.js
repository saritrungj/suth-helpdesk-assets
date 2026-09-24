import { DIMENSIONS } from "./dimensions";

/**
 * dashboard-route.js — ส่วนของสถานะหน้าภาพรวม/เปรียบเทียบที่ router ต้องใช้ตอนตัดสินเส้นทาง
 *
 * แยกจาก dashboard-view.js เพราะ router ถูกโหลดตั้งแต่หน้าแรก ไฟล์นี้จึงห้าม import อะไรที่หนัก
 * (comparison.js ลาก @suth/domain และข้อความทั้งหน้าเข้ามาในก้อนแรกที่ทุกหน้าต้องโหลด — มีงบขนาดคุมอยู่)
 */

export const ID_PATTERN = /^(\d+|unassigned)$/;
/**
 * ปีงบเป็น พ.ศ. สี่หลักในช่วงที่เป็นไปได้จริง
 *
 * `\d{4}` เฉยๆ ยอมให้ `?years=0000` ผ่าน แล้วช่วงเดือนที่คำนวณได้จะกลายเป็นปี ค.ศ.
 * ติดลบ ซึ่งถูกส่งไปให้ API แล้วเด้งกลับเป็น 400 โดยหน้าจอบอกได้แค่ "โหลดไม่สำเร็จ"
 */
export const YEAR_PATTERN = /^2[3-9]\d{2}$/;

export const first = (value) => String(Array.isArray(value) ? value[0] ?? "" : value ?? "");
export const listFrom = (value, pattern) => [...new Set(first(value).split(",").map((item) => item.trim()).filter((item) => pattern.test(item)))];

/** มิติที่หน้าภาพรวมไม่มี — ลิงก์ที่มีค่าเหล่านี้คือการเปรียบเทียบ ต้องไปเปิดที่หน้าเปรียบเทียบ */
const COMPARE_ONLY_QUERY = ["division", "department", "building", "device"];

/**
 * ลิงก์ของหน้าภาพรวมนี้ต้องย้ายไปหน้าเปรียบเทียบไหม — คืน query ของหน้าเปรียบเทียบ หรือ null
 *
 * `/dashboard?by=fiscalYear` บุ๊กมาร์กเดิม, `?years=` หลายปี และตัวกรองฝ่าย/แผนก/อาคาร/เครื่อง
 * เป็นสิ่งที่หน้าภาพรวมตัดออกไปแล้ว ถ้าเปิดบนหน้าภาพรวมเงียบๆ ตัวเลขจะเป็นคนละชุดกับที่ลิงก์หมายถึง
 */
export function comparePageQuery(query = {}) {
  const by = first(query.by);
  const years = listFrom(query.years, YEAR_PATTERN);
  const wantsCompare = (DIMENSIONS.includes(by) && by !== "overall")
    || years.length > 1
    || COMPARE_ONLY_QUERY.some((key) => listFrom(query[key], ID_PATTERN).length)
    || query.items !== undefined || query.scope !== undefined;
  if (!wantsCompare) return null;
  // หลายปีงบโดยไม่ระบุมิติ = เทียบปีงบ ไม่ใช่เทียบฝ่ายข้ามหลายปีรวมกัน
  const nextBy = DIMENSIONS.includes(by) && by !== "overall" ? by : years.length > 1 ? "fiscalYear" : undefined;
  return { ...query, by: nextBy };
}
