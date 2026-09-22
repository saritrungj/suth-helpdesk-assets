// apps/api/src/import/row-rules.js
//
// กฎตรวจแถวของไฟล์นำเข้าทะเบียนเครื่อง ที่ตรวจได้โดยไม่ต้องถามฐานข้อมูล
//
// แยกออกมาจาก controller.js เพราะกฎพวกนี้เป็นฟังก์ชันบริสุทธิ์ — ป้อนแถวเข้าไป
// ได้รายการเหตุผลออกมา ไม่ต้องมี MySQL ไม่ต้องมีไฟล์ ไม่ต้องมี HTTP จึงเขียนเทส
// ครอบได้ทุกกรณีขอบ ซึ่งเป็นสิ่งที่ทำไม่ได้ตอนมันฝังอยู่กลางลูปยาวใน controller
//
// ส่วนที่ต้องถามฐานข้อมูล (ยี่ห้อ อาคาร ชั้น ฝ่าย แผนก สัญญา มีจริงไหม) ยังอยู่ใน
// controller ตามเดิม เพราะมันต้องใช้ master data ที่โหลดมาแล้ว

const { MAX_LENGTH, formulaStarter, ZERO_WIDTH_CHARS } = require("@suth/domain");

/** ชุดอักขระขีดกลางทุกรูปแบบ (Hyphen/Dash) และช่องว่าง */
const DASH_AND_SPACE_PATTERN = "-–—\\s";

/** ตรวจว่าซีเรียลเป็นขีดกลางล้วน ช่องว่าง หรืออักขระล่องหน (Zero-width) ล้วนหรือไม่ */
const DASH_OR_EMPTY_SERIAL_REGEX = new RegExp(`^[${DASH_AND_SPACE_PATTERN}${ZERO_WIDTH_CHARS}]+$`);

/**
 * รูปแบบข้อความตัวแทน "ไม่มีข้อมูล" ในภาษาไทย เช่น -, --, --- หรือ -ไม่มี-
 * ซึ่งไม่ใช่สูตรคำนวณและปลอดภัยที่จะใช้ในฟิลด์เสริมอย่างชื่อรุ่นหรือตำแหน่ง
 *
 * ⚠️ ต้อง anchor ทั้งหัวและท้าย (^...$) เสมอเพื่อป้องกัน payload ซ่อนท้าย เช่น "-ไม่มี=1+1"
 */
const THAI_PLACEHOLDER_REGEX = new RegExp(
  `^[${DASH_AND_SPACE_PATTERN}]+$|^-\\s*(ไม่มี|ไม่ระบุ|ว่าง)\\s*[-–—]?$`
);

/**
 * ตรวจสอบตัวเริ่มสูตรโดยคำนึงถึง placeholder สำหรับฟิลด์เสริม
 *
 * @param {unknown} value
 * @param {{ allowPlaceholder?: boolean }} [options]
 * @returns {string|null}
 */
function checkFormulaStarter(value, { allowPlaceholder = false } = {}) {
  const raw = String(value ?? "");
  if (allowPlaceholder && THAI_PLACEHOLDER_REGEX.test(raw.trim())) {
    return null;
  }
  return formulaStarter(raw);
}

/** ข้อความปฏิเสธแถวที่ขึ้นต้นด้วยอักขระสูตรคำนวณ */
function formulaProblem(fieldLabel, starter) {
  return `${fieldLabel}ขึ้นต้นด้วยอักขระสูตรคำนวณ ("${starter}") ซึ่งไม่อนุญาตเพื่อความปลอดภัย`;
}

/**
 * ความยาวเกินขนาดคอลัมน์จริงหรือไม่ — คืนเพดานเมื่อเกิน คืน null เมื่อไม่เกิน
 *
 * MySQL ของเครื่องที่ระบบนี้รันอยู่ไม่ได้เปิด STRICT_TRANS_TABLES ข้อความที่ยาวเกิน
 * จึงถูก **ตัดทิ้งเงียบๆ** ไม่ใช่ถูกปฏิเสธ ผู้ใช้จะได้ผลว่า "นำเข้าสำเร็จ" แล้วค่อยไป
 * เจอทีหลังว่าค่าที่บันทึกสั้นกว่าในไฟล์ (#85)
 */
function tooLong(value, field) {
  const limit = MAX_LENGTH[field];
  return limit && String(value ?? "").length > limit ? limit : null;
}

/**
 * เหตุผลที่แถวนี้นำเข้าไม่ได้ โดยดูจากตัวแถวเองเท่านั้น
 *
 * `seenSerials` คือซีเรียลที่เจอไปแล้วในไฟล์เดียวกัน — ฟังก์ชันนี้ **ไม่** เพิ่มค่าลงไปเอง
 * ผู้เรียกเป็นคนตัดสินว่าจะนับแถวนี้เข้าไปหรือไม่ เพราะแถวที่ถูกข้ามด้วยเหตุผลอื่น
 * ไม่ควรไปกันซีเรียลเดียวกันของแถวถัดไปที่อาจจะถูกต้อง
 *
 * @param {{ serial_number?: string, model?: string, location?: string }} row
 * @param {Set<string>} [seenSerials]
 * @returns {string[]} เหตุผลภาษาไทยที่แสดงให้ผู้ใช้ได้ตรงๆ (ว่าง = แถวนี้ผ่าน)
 */
function rowFieldProblems(row, seenSerials = new Set()) {
  const problems = [];
  const serial = String(row.serial_number ?? "").trim();

  /*
   * เลขซีเรียลคือกุญแจที่ใช้จับคู่เครื่องกับยอดพิมพ์ (คอลัมน์ `SN.` ในไฟล์มิเตอร์)
   * ถ้ามันว่างหรือถูกตัดสั้น เครื่องนั้นจะไม่มีวันถูกจับคู่กับยอดได้อีกเลย — เครื่อง
   * จะค้างอยู่ในทะเบียนในฐานะเครื่องที่ "ไม่มียอดพิมพ์" ตลอดไป
   *
   * หากค่าเป็นขีดกลางล้วน (เช่น "-", "--") หรืออักขระล่องหน (Zero-width) ให้ถือว่าไม่มีเลขซีเรียล
   */
  if (!serial || DASH_OR_EMPTY_SERIAL_REGEX.test(serial)) {
    problems.push("ไม่มีเลขซีเรียล");
  } else if (tooLong(serial, "serial_number")) {
    problems.push(`เลขซีเรียลยาว ${serial.length} ตัวอักษร เกิน ${MAX_LENGTH.serial_number} ที่ระบบเก็บได้`);
  } else if (seenSerials.has(serial)) {
    // รายงานเป็นเหตุผลรายแถว ไม่ปล่อยให้ไปชน UNIQUE KEY ตอน INSERT แล้วทั้งไฟล์ล้ม
    // ด้วยข้อความที่ชี้ไปผิดแถว — ตัวนำเข้ายอดพิมพ์ดักแบบนี้อยู่แล้ว
    problems.push("เลขซีเรียลนี้ซ้ำกับแถวก่อนหน้าในไฟล์เดียวกัน");
  } else {
    const starter = checkFormulaStarter(serial);
    if (starter) {
      problems.push(formulaProblem("เลขซีเรียล", starter));
    }
  }

  const model = String(row.model ?? "").trim();
  if (tooLong(model, "model")) {
    problems.push(`ชื่อรุ่นยาว ${model.length} ตัวอักษร เกิน ${MAX_LENGTH.model} ที่ระบบเก็บได้`);
  }
  const modelStarter = checkFormulaStarter(model, { allowPlaceholder: true });
  if (modelStarter) {
    problems.push(formulaProblem("ชื่อรุ่น", modelStarter));
  }

  const location = String(row.location ?? "").trim();
  if (tooLong(location, "location")) {
    problems.push(`ตำแหน่งยาว ${location.length} ตัวอักษร เกิน ${MAX_LENGTH.location} ที่ระบบเก็บได้`);
  }
  const locationStarter = checkFormulaStarter(location, { allowPlaceholder: true });
  if (locationStarter) {
    problems.push(formulaProblem("ตำแหน่ง", locationStarter));
  }

  return problems;
}

module.exports = { tooLong, rowFieldProblems };
