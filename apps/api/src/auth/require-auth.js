// apps/api/src/auth/require-auth.js
//
// ด่านแรก: คำขอนี้มาจากใคร
//
// ส่ง error ต่อไปที่ next() แทนการตอบกลับเอง เพื่อให้ทุกคำตอบที่เป็นข้อผิดพลาด
// ในระบบมีรูปแบบเดียวกัน (RFC 9457) ที่ error handler กลางใน index.js — เดิม
// middleware ตัวนี้ตอบ { message, error } ส่วน route อื่นตอบ { error } เฉยๆ
// ฝั่งเว็บจึงต้องเขียนโค้ดอ่านข้อความ error สองแบบ

const jwt = require("jsonwebtoken");
const { SESSION_COOKIE } = require("./session-cookie");
const { unauthorized } = require("../shared/http-error");
const { currentUser } = require("./current-user");

/**
 * อ่าน token จากคำขอ
 *
 * ลำดับ: cookie ก่อน แล้วค่อย Authorization header
 *
 * เว็บใช้ cookie แบบ httpOnly (ADR-0006) ส่วน header ยังรับอยู่สำหรับเครื่องมือ
 * ที่ไม่ใช่เบราว์เซอร์ — สคริปต์และการทดสอบ ซึ่งไม่มีที่เก็บ cookie การรับ header
 * ไม่ได้เพิ่มความเสี่ยง XSS เพราะความเสี่ยงจริงอยู่ที่ "เว็บเก็บ token ไว้ที่ไหน"
 * ไม่ใช่ที่ API ยอมรับ header
 *
 * @param {import("express").Request} req
 * @returns {string|null}
 */
function readToken(req) {
  const fromCookie = req.cookies && req.cookies[SESSION_COOKIE];
  if (fromCookie) return fromCookie;

  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  const [scheme, value] = authHeader.split(" ");
  if (!value || scheme.toLowerCase() !== "bearer") return null;

  return value;
}

module.exports = (req, res, next) => {
  const token = readToken(req);

  if (!token) {
    return next(
      unauthorized("กรุณาเข้าสู่ระบบก่อนใช้งาน", {
        code: "no_token",
        detail: "ไม่พบข้อมูลการเข้าสู่ระบบในคำขอนี้",
      })
    );
  }

  let claims;
  try {
    claims = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    // แยกเหตุผลออกจากกันเพราะฝั่งเว็บทำสองอย่างต่างกัน — token หมดอายุคือเรื่อง
    // ปกติของคนที่เปิดหน้าทิ้งไว้ข้ามวัน ควรพากลับไปล็อกอินเงียบๆ ส่วน token ที่
    // ผิดรูปหรือเซ็นด้วยกุญแจอื่นคือสัญญาณของการปลอมแปลง ควรถูกบันทึกไว้
    const expired = err.name === "TokenExpiredError";

    return next(
      unauthorized(expired ? "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" : "ข้อมูลการเข้าสู่ระบบไม่ถูกต้อง", {
        code: expired ? "token_expired" : "invalid_token",
      })
    );
  }

  // บทบาทและสถานะบัญชีปัจจุบันจากฐาน — ลดสิทธิ์/ลบบัญชี/เปลี่ยนรหัสผ่านมีผลทันที (#208, current-user.js)
  // then สองอาร์กิวเมนต์: error ที่โยนจาก route ถัดไปต้องไม่ย้อนมาเรียก next ซ้ำ
  currentUser(claims).then((user) => {
    if (user.revoked) {
      return next(unauthorized("บัญชีนี้ถูกเปลี่ยนแปลง กรุณาเข้าสู่ระบบใหม่", { code: user.revoked }));
    }
    req.user = { ...claims, ...user };
    return next();
  }, next);
};

module.exports.readToken = readToken;
