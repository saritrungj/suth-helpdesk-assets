// apps/api/src/auth/session-cookie.js
//
// ตั้งค่า cookie ที่เก็บ token ของ session
//
// เดิม token ถูกส่งกลับไปให้เว็บเก็บใน localStorage ซึ่งอ่านได้ด้วย JavaScript ทุกตัว
// ในหน้า ถ้ามีช่องโหว่ XSS สักจุด (เช่นจากข้อมูลที่ import เข้ามา) ผู้โจมตีอ่าน token
// ออกไปใช้ต่อได้ทันที และเราสั่งยกเลิกไม่ได้จนกว่ามันจะหมดอายุเอง 8 ชั่วโมง
//
// cookie ที่ตั้ง httpOnly อ่านด้วย JavaScript ไม่ได้เลย เบราว์เซอร์แนบไปให้เอง
// ทุก request และเราสั่งลบได้ทันทีตอน logout

const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

/** ชื่อ cookie ที่เก็บ token — ต้องตรงกันระหว่างตอนตั้งและตอนอ่าน */
const SESSION_COOKIE = "suth_session";

/**
 * ตัวเลือกของ cookie
 *
 * sameSite ปรับผ่าน environment ได้ เพราะขึ้นกับว่าเว็บกับ API อยู่โดเมนเดียวกันหรือไม่
 * - เว็บกับ API อยู่โดเมนเดียวกัน (ต่างพอร์ต/ต่าง subdomain ก็ยังนับว่าเดียวกัน) ใช้ "lax" ได้
 * - ถ้าอยู่คนละโดเมนจริงๆ ต้องใช้ "none" ซึ่งเบราว์เซอร์บังคับว่าต้องมาคู่กับ secure
 *
 * @param {{ maxAge?: number }} [overrides]
 * @returns {import("express").CookieOptions}
 */
function sessionCookieOptions(overrides = {}) {
  const sameSite = (process.env.COOKIE_SAMESITE || "lax").toLowerCase();
  const isProduction = process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    sameSite,
    // sameSite=none ใช้ได้เฉพาะกับ cookie ที่ secure เท่านั้น ไม่งั้นเบราว์เซอร์ทิ้งทันที
    secure: isProduction || sameSite === "none",
    path: "/",
    maxAge: EIGHT_HOURS_MS,
    ...overrides,
  };
}

module.exports = { SESSION_COOKIE, EIGHT_HOURS_MS, sessionCookieOptions };
