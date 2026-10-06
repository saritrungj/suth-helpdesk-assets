// apps/api/src/auth/routes.js
//
// ล็อกอิน ออกจากระบบ และ "ตอนนี้ฉันเป็นใคร"
//
// token เก็บใน cookie แบบ httpOnly ไม่ใช่ localStorage (ADR-0006) — JavaScript
// ในหน้าอ่านค่าไม่ได้เลย และเราสั่งลบได้ทันทีตอนออกจากระบบ

const crypto = require("crypto");
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const { z } = require("zod");

const router = express.Router();
const db = require("../shared/db");
const asyncHandler = require("../shared/async-handler");
const requireAuth = require("./require-auth");
const { readToken } = requireAuth;
const revokedSessions = require("./revoked-sessions");
const { passwordVersion } = require("./current-user");
const { passwordField } = require("./password-policy");
const { actorOf, recordAudit } = require("../shared/audit");
const { validate } = require("../shared/validate");
const { badRequest, unauthorized, tooManyRequests } = require("../shared/http-error");
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
  handler: (req, res, next) => {
    next(
      tooManyRequests("พยายามเข้าสู่ระบบบ่อยเกินไป", {
        code: "too_many_attempts",
        detail: "กรุณารอ 15 นาทีแล้วลองใหม่ หรือติดต่อผู้ดูแลระบบ",
      })
    );
  },
});

/**
 * ออก token ใหม่ให้บัญชีนี้และตั้ง cookie ของ session — ใช้ทั้งตอนล็อกอินและหลังเปลี่ยนรหัสผ่านของตัวเอง
 * @param {{ id: number, username: string, role: string, password: string }} user แถวผู้ใช้จากฐาน (password = hash)
 */
function issueSession(res, user) {
  const token = jwt.sign(
    // pwv = ลายนิ้วมือของรหัสผ่าน — เปลี่ยนรหัสผ่านแล้ว token นี้ใช้ไม่ได้ (#208, current-user.js)
    // jti = เลขประจำ token: ล็อกอินสองครั้งในวินาทีเดียวกันต้องไม่ได้ token เดียวกัน ไม่งั้นออกจากระบบแล้ว
    // ล็อกอินใหม่ทันทีจะได้ token ที่เพิ่งถูกเพิกถอนกลับมา (#240)
    { id: user.id, username: user.username, role: user.role, pwv: passwordVersion(user.password), jti: crypto.randomUUID() },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
}

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

    issueSession(res, user);

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
// PUT /api/auth/password — ผู้ใช้เปลี่ยนรหัสผ่านของตัวเอง
//
// เดิมมีแต่ผู้ดูแลตั้งรหัสให้ผ่านหน้าผู้ใช้ รหัสที่ผู้ดูแลรู้จึงเป็นรหัสถาวรของทุกคน และผู้ใช้ที่สงสัยว่ารหัส
// หลุดทำอะไรเองไม่ได้ ต้องยืนยันรหัสปัจจุบันเสมอ — session ที่เปิดค้างบนเครื่องใช้ร่วมกันต้องเปลี่ยนรหัสของ
// เจ้าของบัญชีไม่ได้ และจำกัดจำนวนครั้งที่ลองผิดเหมือนหน้าล็อกอิน
//
// เปลี่ยนแล้ว token เดิมทุกใบของบัญชีนี้ใช้ไม่ได้ทันที (pwv ใน current-user.js) จึงออกใบใหม่ให้ session นี้
// เครื่องอื่นที่ล็อกอินค้างไว้ต้องล็อกอินใหม่ด้วยรหัสใหม่
// ============================================================
const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  // นับต่อบัญชี ไม่ใช่ต่อ IP: โรงพยาบาลออกเน็ตผ่าน IP เดียวกัน คนหนึ่งลองผิดต้องไม่ล็อกทุกคน และ session ที่
  // ถูกคัดลอกไปต้องเดารหัสได้จำกัดต่อบัญชี ไม่ใช่ได้โควตาใหม่ทุก IP — ด่านนี้จึงอยู่หลัง requireAuth
  keyGenerator: (req) => `password:${req.user.id}`,
  handler: (req, res, next) => {
    next(
      tooManyRequests("ลองเปลี่ยนรหัสผ่านบ่อยเกินไป", {
        code: "too_many_attempts",
        detail: "กรุณารอ 15 นาทีแล้วลองใหม่ หรือติดต่อผู้ดูแลระบบ",
      })
    );
  },
});

const changePasswordBody = z.object({
  current_password: z.string({ error: "กรุณากรอกรหัสผ่านปัจจุบัน" }).min(1, "กรุณากรอกรหัสผ่านปัจจุบัน").max(200),
  new_password: passwordField,
});

router.put(
  "/password",
  requireAuth,
  passwordLimiter,
  validate({ body: changePasswordBody }),
  asyncHandler(async (req, res) => {
    const { current_password: current, new_password: next } = req.body;
    const [rows] = await db.query("SELECT id, username, role, password FROM users WHERE id = ?", [req.user.id]);
    const user = rows[0];
    if (!user) throw unauthorized("บัญชีนี้ถูกเปลี่ยนแปลง กรุณาเข้าสู่ระบบใหม่", { code: "account_removed" });

    if (!(await bcrypt.compare(current, user.password))) {
      logger.warn("เปลี่ยนรหัสผ่านไม่สำเร็จ: รหัสปัจจุบันไม่ถูกต้อง", { request_id: req.id, user: user.username });
      throw badRequest("รหัสผ่านปัจจุบันไม่ถูกต้อง", {
        code: "wrong_current_password",
        errors: [{ field: "current_password", message: "รหัสผ่านปัจจุบันไม่ถูกต้อง" }],
      });
    }
    if (current === next) {
      throw badRequest("รหัสผ่านใหม่ต้องต่างจากรหัสผ่านปัจจุบัน", {
        code: "same_password",
        errors: [{ field: "new_password", message: "รหัสผ่านใหม่ต้องต่างจากรหัสผ่านปัจจุบัน" }],
      });
    }

    const hash = await bcrypt.hash(next, 10);
    // transaction เดียว: ถ้ารหัสเปลี่ยนแล้วแต่บันทึกประวัติล้ม ผู้ใช้จะเห็นว่า "ไม่สำเร็จ" ทั้งที่รหัสเดิมใช้ไม่ได้แล้ว
    // และ token ที่ถืออยู่ก็ตายไปด้วย (pwv) — ต้องสำเร็จทั้งคู่หรือไม่เปลี่ยนเลย
    await db.withTransaction(async (conn) => {
      await conn.query("UPDATE users SET password = ? WHERE id = ?", [hash, user.id]);
      // ไม่เก็บรหัสผ่านหรือ hash ในประวัติ (ADR-0035 ข้อ 3)
      await recordAudit(conn, actorOf(req), [{
        action: "update", entity: "user", entityId: user.id, entityKey: user.username,
        summary: `${user.username} เปลี่ยนรหัสผ่านของตัวเอง`,
        before: null, after: { password_changed: true },
      }]);
    });

    issueSession(res, { ...user, password: hash });
    logger.info("เปลี่ยนรหัสผ่านของตัวเอง", { request_id: req.id, user: user.username });

    noStore(res);
    res.json({ message: "เปลี่ยนรหัสผ่านแล้ว" });
  })
);

// ============================================================
// POST /api/auth/logout
//
// ไม่บังคับว่าต้องมี token ที่ใช้ได้ เพราะจุดประสงค์คือทำให้ session หายไป —
// ถ้าบังคับ คนที่ token หมดอายุแล้วจะออกจากระบบไม่ได้และ cookie จะค้างในเบราว์เซอร์
// ============================================================
router.post("/logout", (req, res) => {
  // เพิกถอน token ที่ส่งมา — ลบ cookie อย่างเดียวไม่พอ สำเนาของ token ยังใช้ได้จนหมดอายุ (#240, ADR-0038)
  // token ที่ตรวจลายเซ็นไม่ผ่านหรือหมดอายุแล้วไม่ต้องจำ: ด่าน require-auth ปฏิเสธเองอยู่แล้ว
  // ทั้ง cookie และ Bearer: ด่าน require-auth อ่าน cookie ก่อน ถ้าเพิกถอนเฉพาะตัวที่มันจะเลือก คำขอที่มี
  // cookie ค้าง (หมดอายุ) คู่กับ Bearer ที่ยังใช้ได้ จะออกจากระบบ "สำเร็จ" โดย Bearer ไม่ถูกเพิกถอน
  const bearer = readToken({ cookies: {}, headers: req.headers });
  for (const token of new Set([req.cookies?.[SESSION_COOKIE], bearer].filter(Boolean))) {
    try {
      const claims = jwt.verify(token, process.env.JWT_SECRET);
      revokedSessions.revoke(token, claims.exp);
      logger.info("ออกจากระบบ", { request_id: req.id, user: claims.username });
    } catch {
      // ไม่มี session ที่ใช้ได้ให้เพิกถอน
    }
  }
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions({ maxAge: undefined }));
  noStore(res);
  res.json({ message: "ออกจากระบบแล้ว" });
});

module.exports = router;
