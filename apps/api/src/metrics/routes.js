// apps/api/src/metrics/routes.js
//
// รับค่า Core Web Vitals จากเบราว์เซอร์ของผู้ใช้จริง แล้วเขียนลง log บรรทัดละหนึ่งค่า (#171)
//
// ตัวเลขจากเครื่องนักพัฒนาบอกไม่ได้ว่าผู้ใช้จริงรู้สึกอย่างไร — หน้าเว็บเร็วบนเครื่องเดียวกับ
// เซิร์ฟเวอร์ แต่อาจช้าบน Wi-Fi ของตึกอื่นหรือเครื่องสเปกต่ำ เว็บจึงส่งค่าที่วัดได้จริงมาที่นี่
// (apps/web/src/lib/web-vitals.js) และ scripts/web-vitals-report.cjs สรุป p75 รายหน้าจาก log
//
// ไม่ต้องล็อกอิน: หน้าเข้าสู่ระบบก็ต้องวัด — จึงรับเฉพาะรูปแบบที่แคบมาก ไม่เก็บตัวตนผู้ใช้
// ไม่เก็บ query string (หน้าเป็นรูปแบบ route เช่น /assets/:id) และไม่แตะฐานข้อมูล
//
// รับ body เป็น text/plain เพราะ navigator.sendBeacon ข้ามโดเมน (เว็บ :4100 → API :3100) ส่งได้
// เฉพาะชนิดที่ไม่ต้อง preflight — application/json ทำให้ beacon ถูกบล็อกเงียบๆ

const express = require("express");
const { z } = require("zod");

const { logger } = require("../shared/logger");
const { ApiError, badRequest } = require("../shared/http-error");
const { noStore } = require("../shared/cache");

const router = express.Router();

/** ข้อความสั้นที่ไม่มีอักขระควบคุม — กันการปลอมบรรทัดใน log */
const safeText = (max) => z.string().max(max).regex(/^[^\x00-\x1f\x7f]*$/, "มีอักขระที่ไม่อนุญาต");
const ms = z.number().finite().min(0).max(600_000);

const metricSchema = z
  .object({
    name: z.enum(["LCP", "INP", "CLS", "FCP", "TTFB"]),
    value: z.number().finite().min(0).max(600_000),
    rating: z.enum(["good", "needs-improvement", "poor"]),
    id: safeText(80),
    navigationType: safeText(40).optional(),
    /** รูปแบบ route ของหน้า เช่น /assets/:id — ไม่ใช่ URL จริง */
    page: safeText(120).regex(/^\/[^?#]*$/, "ต้องเป็น path ที่ไม่มี query"),
    /** element ที่เป็นต้นเหตุ (LCP/CLS/INP) */
    target: safeText(200).optional(),
    interactionType: z.enum(["pointer", "keyboard"]).optional(),
    inputDelay: ms.optional(),
    processingDuration: ms.optional(),
    presentationDelay: ms.optional(),
  })
  .strict();

const batchSchema = z.array(metricSchema).min(1).max(20);

const parseText = express.text({ type: "text/plain", limit: "8kb" });

/** error ของ body-parser (ใหญ่เกิน/เข้ารหัสผิด) เป็นความผิดของผู้ส่ง ไม่ใช่บั๊ก — error handler กลางยังไม่แปลงให้ */
function readTextBody(req, res, next) {
  parseText(req, res, (err) => {
    if (!err) return next();
    if (err.type === "entity.too.large") return next(new ApiError(413, "ข้อมูลใหญ่เกินไป", { code: "payload_too_large" }));
    return next(badRequest("รูปแบบข้อมูลไม่ถูกต้อง"));
  });
}

// POST /api/metrics/web-vitals — body เป็น JSON array ส่งมาแบบ text/plain (หรือ application/json)
router.post("/web-vitals", readTextBody, (req, res, next) => {
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return next(badRequest("รูปแบบข้อมูลไม่ถูกต้อง"));
    }
  }

  const parsed = batchSchema.safeParse(body);
  if (!parsed.success) return next(badRequest("รูปแบบข้อมูลไม่ถูกต้อง"));

  for (const metric of parsed.data) {
    // ฟิลด์เดียวเป็น JSON — ตัวเลือก CSS มีช่องว่าง ถ้าแยกเป็น key=value log แบบ pretty จะอ่านกลับไม่ได้
    logger.info("web-vital", { vital: { ...metric, value: Math.round(metric.value * 1000) / 1000 } });
  }

  noStore(res);
  // helmet ตั้ง Cross-Origin-Resource-Policy: same-origin ทุกคำตอบ beacon แบบ text/plain เป็นคำขอ no-cors
  // เบราว์เซอร์จึงทิ้งคำตอบและขึ้น ERR_BLOCKED_BY_RESPONSE ใน console ทุกครั้งที่ซ่อนหน้า (ข้อมูลถึง API แล้ว)
  // คำตอบนี้ว่างเปล่า อนุญาตข้าม origin ได้โดยไม่เปิดเผยอะไร
  res.set("Cross-Origin-Resource-Policy", "cross-origin");
  res.status(204).end();
});

module.exports = router;
