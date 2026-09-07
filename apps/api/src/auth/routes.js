// apps/api/src/auth/routes.js
//
// ล็อกอิน ออกจากระบบ และ "ตอนนี้ฉันเป็นใคร"
//
// token เก็บใน cookie แบบ httpOnly ไม่ใช่ localStorage (ADR-0006) — JavaScript
// ในหน้าอ่านค่าไม่ได้เลย และเราสั่งลบได้ทันทีตอนออกจากระบบ

const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const { z } = require("zod");

const router = express.Router();
const db = require("../shared/db");
const asyncHandler = require("../shared/async-handler");
const requireAuth = require("./require-auth");
const { validate } = require("../shared/validate");
const { unauthorized } = require("../shared/http-error");
const { noStore } = require("../shared/cache");
const { SESSION_COOKIE, sessionCookieOptions } = require("./session-cookie");
const { logger } = require("../shared/logger");

/**
 * กันการเดารหัสผ่าน — 10 ครั้ง/15 นาที ต่อ IP
 *
 * นับเฉพาะครั้งที่ล้มเหลว (skipSuccessfulRequests) เพราะคนที่ล็อกอินถูกไม่ควรถูก
 * ลงโทษจากการที่คนอื่นที่ใช้ IP เดียวกันพิมพ์ผิด
 *
 * ⚠️ ต้องตั้ง TRUST_PROXY_HOPS ใน environment ให้ตรงกับจำนวนชั้น proxy จริง
 * (ดู index.js) ไม่งั้นทุกคำขอจะมาจาก IP ของ proxy เหมือนกันหมด แล้วคนคนเดียว
 * ที่พิมพ์ผิดสิบครั้งจะล็อกทั้งโรงพยาบาลออกจากระบบ
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    res.status(429).json({
      type: "about:blank",
      title: "พยายามเข้าสู่ระบบบ่อยเกินไป",
      status: 429,
      code: "too_many_attempts",
      detail: "กรุณารอ 15 นาทีแล้วลองใหม่ หรือติดต่อผู้ดูแลระบบ",
    });
  },
});

const loginBody = z.object({
  username: z.string({ error: "กรุณากรอกชื่อผู้ใช้" }).trim().min(1, "กรุณากรอกชื่อผู้ใช้").max(50),
  password: z.string({ error: "กรุณากรอกรหัสผ่าน" }).min(1, "กรุณากรอกรหัสผ่าน").max(200),
});

// ============================================================
// POST /api/auth/login
// ============================================================
router.post(
  "/login",
  loginLimiter,
  validate({ body: loginBody }),
  asyncHandler(async (req, res) => {
    const { username, password } = req.body;

    const [users] = await db.query("SELECT id, username, password, role FROM users WHERE username = ?", [
      username,
    ]);

    const user = users[0];

    // เทียบรหัสผ่านเสมอ แม้จะไม่เจอชื่อผู้ใช้ — bcrypt.compare กับ hash ปลอมใช้เวลา
    // พอๆ กับของจริง ทำให้คนร้ายวัดจากเวลาตอบกลับไม่ได้ว่าชื่อผู้ใช้นี้มีอยู่จริงไหม
    // (ถ้า return ทันทีตอนไม่เจอชื่อ คำขอนั้นจะเร็วกว่าอย่างเห็นได้ชัด)
    const DUMMY_HASH = "$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv";
    const matches = await bcrypt.compare(password, user?.password ?? DUMMY_HASH);

    if (!user || !matches) {
      // ใช้ข้อความเดียวกันทั้งกรณีไม่มีชื่อผู้ใช้และรหัสผิด — ไม่บอกใบ้ว่าชื่อไหน
      // มีอยู่ในระบบ
      logger.warn("ล็อกอินไม่สำเร็จ", { request_id: req.id, username });
      throw unauthorized("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง", { code: "invalid_credentials" });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.cookie(SESSION_COOKIE, token, sessionCookieOptions());

    logger.info("ล็อกอินสำเร็จ", { request_id: req.id, user: user.username, role: user.role });

    noStore(res);
    res.json({
      message: "เข้าสู่ระบบสำเร็จ",
      user: { id: user.id, username: user.username, role: user.role },
    });
  })
);

// ============================================================
// GET /api/auth/me — ใครกำลังใช้งานอยู่
//
// จำเป็นเพราะ token อยู่ใน cookie แบบ httpOnly เว็บจึงอ่านเองไม่ได้ ตอนเปิดหน้าใหม่
// หรือรีเฟรช เว็บต้องถามเส้นนี้ว่ายังล็อกอินอยู่ไหมและเป็นใคร
// ============================================================
router.get("/me", requireAuth, (req, res) => {
  noStore(res);
  res.json({ user: { id: req.user.id, username: req.user.username, role: req.user.role } });
});

// ============================================================
// POST /api/auth/logout
//
// ไม่บังคับว่าต้องมี token ที่ใช้ได้ เพราะจุดประสงค์คือทำให้ session หายไป —
// ถ้าบังคับ คนที่ token หมดอายุแล้วจะออกจากระบบไม่ได้และ cookie จะค้างในเบราว์เซอร์
// ============================================================
router.post("/logout", (req, res) => {
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions({ maxAge: undefined }));
  noStore(res);
  res.json({ message: "ออกจากระบบแล้ว" });
});

module.exports = router;
