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

/**
 * อ่าน token จากคำขอ
 *
 * ลำดับ: cookie ก่อน แล้วค่อย Authorization header
 *
 * เว็บใช้ cookie แบบ httpOnly (ADR-0006) ส่วน header ยังรับอยู่สำหรับเครื่องมือ
 * ที่ไม่ใช่เบราว์เซอร์ — สคริปต์ การทดสอบ และเซิร์ฟเวอร์ MCP ใน apps/mcp ซึ่ง
 * ไม่มีที่เก็บ cookie การรับ header ไม่ได้เพิ่มความเสี่ยง XSS เพราะความเสี่ยงจริง
 * อยู่ที่ "เว็บเก็บ token ไว้ที่ไหน" ไม่ใช่ที่ API ยอมรับ header
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

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    // แยกเหตุผลออกจากกันเพราะฝั่งเว็บทำสองอย่างต่างกัน — token หมดอายุคือเรื่อง
    // ปกติของคนที่เปิดหน้าทิ้งไว้ข้ามวัน ควรพากลับไปล็อกอินเงียบๆ ส่วน token ที่
    // ผิดรูปหรือเซ็นด้วยกุญแจอื่นคือสัญญาณของการปลอมแปลง ควรถูกบันทึกไว้
    const expired = err.name === "TokenExpiredError";

    next(
      unauthorized(expired ? "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" : "ข้อมูลการเข้าสู่ระบบไม่ถูกต้อง", {
        code: expired ? "token_expired" : "invalid_token",
      })
    );
  }
};

module.exports.readToken = readToken;
