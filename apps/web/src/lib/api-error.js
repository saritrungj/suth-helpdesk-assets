import { t, locale } from "./locale";
/**
 * api-error.js — อ่านข้อผิดพลาดจาก API ให้ได้ข้อความที่เอาไปโชว์ผู้ใช้ได้ทันที
 *
 * ## ปัญหาที่แก้
 *
 * เดิมทุกหน้าเขียนโค้ดอ่าน error เองคนละแบบ เพราะ API ตอบมาสามรูปแบบปนกัน
 * (`{ error }`, `{ message }`, `{ message, error }`) หน้าที่เขียนทีหลังจึงเขียน
 * แบบนี้กันหมด
 *
 *     err.response?.data?.error || err.response?.data?.message || err.message
 *
 * แล้วบางหน้าก็ลืมช่องใดช่องหนึ่ง ผลคือผู้ใช้เห็นข้อความอังกฤษดิบๆ ของ axios
 * ("Request failed with status code 409") แทนที่จะเห็นว่า "ชื่อนี้มีอยู่แล้ว"
 *
 * ตอนนี้ API ตอบตามมาตรฐาน Problem Details (RFC 9457) เหมือนกันทุกเส้นทาง
 * ไฟล์นี้คือที่เดียวที่รู้เรื่องรูปแบบนั้น
 *
 * ## รูปแบบที่ API ส่งมา
 *
 *     {
 *       "title":  "มีข้อมูลนี้อยู่ในระบบแล้ว",   // ข้อความสำหรับคน
 *       "status": 409,
 *       "code":   "conflict",                    // ค่าคงที่สำหรับโค้ดเทียบ
 *       "detail": "ค่าที่กรอกซ้ำกับรายการที่มีอยู่",
 *       "errors": [{ "field": "name", "message": "..." }]   // เฉพาะ 400
 *     }
 */

/**
 * ข้อความหลักที่เอาไปโชว์ผู้ใช้
 *
 * เรียงลำดับตามความมีประโยชน์: title จาก API (ภาษาไทย เขียนไว้ให้คนอ่าน) มาก่อน
 * เสมอ แล้วค่อยตกลงไปหาข้อความของ axios ซึ่งเป็นอังกฤษและไม่บอกอะไรนอกจากรหัส
 *
 * @param {unknown} error error จาก axios
 * @param {string} [fallback] ข้อความสำรองที่เจาะจงกับงานตรงนั้น
 * @returns {string}
 */
export function errorMessage(error, fallback = t("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง")) {
  const data = error?.response?.data;

  if (locale.value === "en" && error?.response) {
    const messages = {
      unauthorized: t("กรุณาเข้าสู่ระบบอีกครั้ง"),
      forbidden: t("บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้"),
      not_found: t("ไม่พบข้อมูลที่ต้องการ"),
      conflict: t("ข้อมูลนี้มีอยู่แล้วหรือขัดแย้งกับข้อมูลเดิม"),
      still_referenced: t("ยังมีข้อมูลอื่นอ้างถึงรายการนี้อยู่"),
      bad_request: t("ตรวจสอบข้อมูลที่กรอกแล้วลองใหม่"),
      validation_error: t("ตรวจสอบช่องที่ระบุแล้วลองใหม่"),
    };
    return messages[data?.code] ?? fallback;
  }
  if (data?.title) return data.title;

  // เผื่อ endpoint ที่ยังไม่ได้ย้ายมาใช้รูปแบบใหม่ (การนำเข้าไฟล์บางส่วน)
  if (data?.error) return data.error;
  if (data?.message) return data.message;

  // ไม่มีคำตอบจากเซิร์ฟเวอร์เลย = ต่อไม่ติด ซึ่งเป็นคนละปัญหากับ "ทำรายการไม่สำเร็จ"
  // และมีวิธีแก้คนละแบบ (เช็คเน็ต/VPN ไม่ใช่แก้ข้อมูลที่กรอก)
  if (error?.code === "ERR_NETWORK") return t("ติดต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบการเชื่อมต่อเครือข่าย");

  return fallback;
}

/**
 * คำอธิบายเพิ่มเติม — วางเป็นบรรทัดรองใต้ข้อความหลัก
 * มักเป็นวิธีแก้ เช่น "ย้ายข้อมูลที่อ้างถึงรายการนี้ออกก่อน"
 *
 * @param {unknown} error
 * @returns {string}
 */
export function errorDetail(error) {
  const data = error?.response?.data;
  if (locale.value === "en") return "";
  // ไม่ซ้ำกับข้อความหลัก — บางกรณี API ส่ง detail เท่ากับ title
  return data?.detail && data.detail !== data.title ? data.detail : "";
}

/**
 * ข้อผิดพลาดรายช่องของฟอร์ม — คืนเป็น object ที่ค้นด้วยชื่อช่องได้ตรงๆ
 *
 * ทำให้ฟอร์มวางข้อความไว้ "ใต้ช่องที่ผิด" ได้ แทนที่จะโยนทุกอย่างขึ้น toast
 * ก้อนเดียวแล้วให้ผู้ใช้ไล่หาเองว่าช่องไหน — ซึ่งเป็นสาเหตุอันดับหนึ่งที่คนกรอก
 * ฟอร์มยาวๆ แล้วยอมแพ้
 *
 * @param {unknown} error
 * @returns {Record<string, string>}
 */
export function fieldErrors(error) {
  const errors = error?.response?.data?.errors;
  if (!Array.isArray(errors)) return {};

  return Object.fromEntries(errors.map((entry) => [entry.field, locale.value === "en" ? t("กรอกข้อมูลที่ถูกต้องในช่องนี้") : entry.message]));
}

/**
 * รหัสข้อผิดพลาดที่โค้ดเอาไปเทียบได้ โดยไม่ต้องอ่านข้อความ
 *
 * ใช้ตอนที่ต้องทำอะไรต่างกันจริงๆ ตามชนิดของปัญหา เช่น "still_referenced"
 * ควรเสนอให้ผู้ใช้ไปดูว่าอะไรอ้างถึงอยู่ ส่วน "conflict" ควรโฟกัสกลับไปที่ช่องที่ซ้ำ
 *
 * @param {unknown} error
 * @returns {string|null}
 */
export function errorCode(error) {
  return error?.response?.data?.code ?? null;
}

/**
 * รหัสอ้างอิงของคำขอ — มีเฉพาะตอนเกิดข้อผิดพลาดระดับระบบ (500)
 *
 * โชว์ให้ผู้ใช้เห็นเพื่อให้แจ้งผู้ดูแลได้ตรงตัว แทนที่จะบอกว่า "กดแล้วมันขึ้น error"
 * แล้วไม่มีใครหาบรรทัดในล็อกเจอ
 *
 * @param {unknown} error
 * @returns {string|null}
 */
export function errorReference(error) {
  return error?.response?.data?.request_id ?? error?.response?.headers?.["x-request-id"] ?? null;
}
