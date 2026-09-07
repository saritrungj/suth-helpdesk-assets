// apps/api/src/shared/http-error.js
//
// ข้อผิดพลาดที่ "ตั้งใจให้เกิด" — ต่างจาก error ที่หลุดมาเพราะบั๊ก
//
// ปัญหาเดิม: ทุก route เขียน res.status(400).json({...}) เองตรงจุดที่เจอปัญหา
// ผลคือรูปร่างของคำตอบไม่เหมือนกันสักที่ — บางที่ { error }, บางที่ { message },
// บางที่ { message, error } ฝั่งเว็บจึงต้องเดาว่าจะอ่านช่องไหน และเขียนโค้ดอ่าน
// error ซ้ำกันคนละแบบทุกหน้า
//
// ที่แย่กว่านั้นคือ catch ท้าย route ส่ง err.message ของ MySQL กลับไปให้เบราว์เซอร์
// ตรงๆ ("Unknown column 'd.brand_i' in 'field list'") ซึ่งบอกชื่อตาราง ชื่อคอลัมน์
// และโครงสร้างฐานข้อมูลให้คนนอกฟรีๆ
//
// ตอนนี้ทุก error ไหลผ่าน error handler ตัวเดียวใน index.js แล้วออกไปในรูปแบบ
// Problem Details (RFC 9457) ซึ่งเป็นมาตรฐานกลางของ HTTP API:
//
//   {
//     "type": "about:blank",
//     "title": "ไม่พบข้อมูลที่ต้องการ",
//     "status": 404,
//     "detail": "ไม่พบเครื่องรหัส 42",
//     "code": "not_found"
//   }
//
// "title" คือข้อความที่เอาไปโชว์ผู้ใช้ได้เลย (ภาษาไทย) ส่วน "code" คือค่าคงที่
// ภาษาอังกฤษที่โค้ดฝั่งเว็บเอาไปเทียบได้โดยไม่ต้องอ่านข้อความ — ข้อความเปลี่ยนได้
// แต่ code ห้ามเปลี่ยน

/** ชนิดสื่อของ Problem Details ตาม RFC 9457 */
const PROBLEM_JSON = "application/problem+json";

/**
 * ข้อผิดพลาดที่รู้สาเหตุและตั้งใจตอบกลับผู้ใช้
 *
 * error ที่ *ไม่ใช่* ApiError ถือว่าเป็นบั๊กของเราเสมอ error handler จะบันทึก
 * stack trace ไว้ในล็อก แต่ตอบกลับผู้ใช้เพียง "เกิดข้อผิดพลาดในระบบ" ไม่ส่ง
 * รายละเอียดภายในออกไป
 */
class ApiError extends Error {
  /**
   * @param {number} status รหัส HTTP
   * @param {string} title ข้อความภาษาไทยที่แสดงให้ผู้ใช้เห็นได้ทันที
   * @param {{ code?: string, detail?: string, errors?: unknown }} [options]
   */
  constructor(status, title, options = {}) {
    super(title);
    this.name = "ApiError";
    this.status = status;
    this.title = title;
    this.code = options.code ?? "error";
    this.detail = options.detail;
    /** รายละเอียดรายช่องของฟอร์ม (ใช้กับ 400 จาก zod) */
    this.errors = options.errors;
    /** true = error นี้คาดไว้แล้ว ไม่ต้องบันทึก stack trace */
    this.expected = true;
  }

  /** แปลงเป็น body ตาม RFC 9457 — ตัดช่องที่ไม่มีค่าออก ไม่ส่ง null เปล่าๆ */
  toProblem() {
    const problem = {
      type: "about:blank",
      title: this.title,
      status: this.status,
      code: this.code,
    };

    if (this.detail) problem.detail = this.detail;
    if (this.errors) problem.errors = this.errors;

    return problem;
  }
}

/**
 * ผู้ใช้ส่งข้อมูลมาไม่ถูกต้อง — แก้ได้ด้วยการกรอกใหม่
 * @param {string} title
 * @param {{ code?: string, detail?: string, errors?: unknown }} [options]
 */
const badRequest = (title, options) => new ApiError(400, title, { code: "bad_request", ...options });

/** ยังไม่ได้ล็อกอิน หรือ token ใช้ไม่ได้แล้ว */
const unauthorized = (title = "กรุณาเข้าสู่ระบบใหม่", options) =>
  new ApiError(401, title, { code: "unauthorized", ...options });

/** ล็อกอินแล้วแต่สิทธิ์ไม่พอ — คนละเรื่องกับ 401 */
const forbidden = (title = "บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้", options) =>
  new ApiError(403, title, { code: "forbidden", ...options });

/** ไม่มีข้อมูลชิ้นที่ขอ */
const notFound = (title = "ไม่พบข้อมูลที่ต้องการ", options) =>
  new ApiError(404, title, { code: "not_found", ...options });

/** ชนกับข้อมูลที่มีอยู่แล้ว เช่น serial ซ้ำ */
const conflict = (title, options) => new ApiError(409, title, { code: "conflict", ...options });

/**
 * แปลง error ของ mysql2 ที่รู้จักให้เป็น ApiError ที่อ่านรู้เรื่อง
 *
 * เรียกจาก error handler กลาง ไม่ต้อง try/catch ดักเองทุก route อีก — เดิมทุก
 * route เขียน if (err.code === 'ER_DUP_ENTRY') ซ้ำกันเองคนละแบบ บางที่ลืมเขียน
 * แล้วผู้ใช้เห็น 500 ทั้งที่แค่กรอกชื่อซ้ำ
 *
 * @param {any} err
 * @returns {ApiError|null} null = ไม่ใช่ error ของฐานข้อมูลที่รู้จัก
 */
function fromDatabaseError(err) {
  switch (err?.code) {
    case "ER_DUP_ENTRY":
      return conflict("มีข้อมูลนี้อยู่ในระบบแล้ว", {
        detail: "ค่าที่กรอกซ้ำกับรายการที่มีอยู่ กรุณาตรวจสอบแล้วกรอกใหม่",
      });

    // ลบแถวที่ยังมีของอื่นอ้างถึงอยู่ เช่น ลบอาคารที่ยังมีเครื่องตั้งอยู่
    case "ER_ROW_IS_REFERENCED":
    case "ER_ROW_IS_REFERENCED_2":
      return conflict("ลบไม่ได้เพราะยังมีข้อมูลอื่นอ้างถึงอยู่", {
        code: "still_referenced",
        detail: "ย้ายหรือลบข้อมูลที่อ้างถึงรายการนี้ออกก่อน แล้วจึงลบรายการนี้ได้",
      });

    // ชี้ไปยัง id ที่ไม่มีอยู่จริง เช่น เลือกแผนกที่เพิ่งถูกลบไปพร้อมกันคนละหน้าต่าง
    case "ER_NO_REFERENCED_ROW":
    case "ER_NO_REFERENCED_ROW_2":
      return badRequest("ข้อมูลที่เลือกไม่มีอยู่ในระบบแล้ว", {
        code: "invalid_reference",
        detail: "อาจถูกลบไปหลังจากที่เปิดหน้านี้ กรุณารีเฟรชแล้วเลือกใหม่",
      });

    // CHECK constraint ของเดือน (ดู database/schema.sql) — กันข้อมูล พ.ศ. หลุดเข้าไป
    case "ER_CHECK_CONSTRAINT_VIOLATED":
      return badRequest("ข้อมูลไม่ผ่านเงื่อนไขของฐานข้อมูล", {
        code: "check_violation",
        detail: "ตรวจรูปแบบเดือน (ต้องเป็น YYYY-MM) และช่วงปีที่กรอก",
      });

    default:
      return null;
  }
}

module.exports = {
  ApiError,
  PROBLEM_JSON,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  fromDatabaseError,
};
