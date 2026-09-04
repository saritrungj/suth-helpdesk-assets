const jwt = require("jsonwebtoken");
const { SESSION_COOKIE } = require("./session-cookie");

/**
 * อ่าน token จาก request
 *
 * ลำดับ: cookie ก่อน แล้วค่อย Authorization header
 *
 * เว็บใช้ cookie แบบ httpOnly (ดู ./session-cookie.js) ส่วน header ยังรับอยู่สำหรับ
 * เครื่องมือที่ไม่ใช่เบราว์เซอร์ — script, curl, การทดสอบ — ซึ่งไม่มีที่เก็บ cookie
 * และไม่ได้เพิ่มความเสี่ยง XSS เพราะความเสี่ยงจริงอยู่ที่ "เว็บเก็บ token ไว้ที่ไหน"
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
    return res.status(401).json({
      message: "No token provided",
      error: "No token provided",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;
    next();
  } catch (err) {
    console.error("JWT verification failed:", err.message);

    return res.status(401).json({
      message: "Invalid token",
      error: err.message,
    });
  }
};

module.exports.readToken = readToken;
