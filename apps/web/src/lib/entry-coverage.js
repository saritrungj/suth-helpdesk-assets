// entry-coverage.js — อ่าน "ความครบถ้วน" จากคำตอบของ API แทนที่จะคิดใหม่เอง
//
// ฝั่งเว็บเคยคิดเองว่าเครื่องหนึ่งกรอกครบหรือยัง โดยเทียบกับ 12 เดือนตายตัว
// ระหว่างปีงบที่ยังไม่จบจึงไม่มีเครื่องไหนนับเป็น "ครบ" ได้เลย หัวหน้าขึ้นว่า
// "กรอกครบแล้ว 0 จาก 46 เครื่อง" ทั้งที่ทุกช่องในตารางบนหน้าจอเดียวกันมีตัวเลข
// อยู่ครบ (#89) — เป็นอาการเดียวกับ #79 คนละหน้า
//
// กฎว่าเดือนไหนถึงกำหนดแล้ว และเครื่องไหนต้องบันทึกยอด อยู่ที่ API ที่เดียว
// (packages/domain/coverage.cjs + ADR-0018) ที่นี่แค่อ่านคำตอบ

/**
 * จำนวนเดือนที่ถึงกำหนดบันทึกแล้วในปีงบ
 *
 * เดือนปัจจุบันยังอ่านมิเตอร์ไม่ได้ API จึงกำกับว่า "not_due" ไม่ใช่งานค้าง
 *
 * @param {{status?: string}[]|undefined} coverageMonths รายการเดือนจาก /print-transactions/coverage
 * @param {number} fallback ใช้เมื่อยังโหลด coverage ไม่ได้ — ปกติคือจำนวนเดือนทั้งปีงบ
 */
export function dueMonthCount(coverageMonths, fallback) {
  if (!Array.isArray(coverageMonths) || !coverageMonths.length) return fallback;
  return coverageMonths.filter((month) => month?.status !== "not_due").length || fallback;
}

/**
 * จำนวนเครื่องที่ต้องบันทึกยอด ตามที่ API นับ
 *
 * ต่างจากจำนวนแถวในตาราง ซึ่งแสดงทุกเครื่องในทะเบียนรวมเครื่องที่ไม่ได้อยู่ในช่วง
 * ต้องบันทึกยอด การใช้คนละตัวระหว่างหัวหน้ากับตารางทำให้หน้าเดียวมีตัวส่วนสองแบบ
 *
 * ใช้ค่าสูงสุดของทุกเดือน เพราะจำนวนเครื่องที่ต้องบันทึกเปลี่ยนได้ระหว่างปี
 * (เครื่องเข้าใหม่กลางปี) และตัวเลขบนหัวหน้าพูดถึงทั้งปีงบ ไม่ใช่เดือนใดเดือนหนึ่ง
 *
 * @param {{total?: number|string}[]|undefined} coverageMonths
 * @param {number} fallback
 */
export function requiredDeviceCount(coverageMonths, fallback) {
  if (!Array.isArray(coverageMonths) || !coverageMonths.length) return fallback;
  const totals = coverageMonths.map((month) => Number(month?.total) || 0);
  return Math.max(0, ...totals) || fallback;
}
