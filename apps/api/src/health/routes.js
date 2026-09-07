// apps/api/src/health/routes.js
//
// เส้นทางสำหรับตรวจว่าระบบยังทำงานได้จริง
//
// ปัญหาเดิม: health check ตัวเดียวที่มีอยู่คือ GET / ที่ตอบข้อความคงที่กลับมาเสมอ
// ไม่ว่าฐานข้อมูลจะล่มไปแล้วหรือไม่ — เท่ากับบอกได้แค่ว่า "โปรเซส Node ยังไม่ตาย"
// ซึ่งเป็นข้อมูลที่แทบไม่มีประโยชน์เวลาระบบมีปัญหาจริง
//
// แยกเป็นสองเส้นทางตามธรรมเนียมที่ระบบ deploy สมัยใหม่คาดหวัง เพราะสองคำถามนี้
// ต้องการคำตอบคนละแบบ
//
//   /api/health/live   "โปรเซสนี้ยังตอบอยู่ไหม ควรฆ่าทิ้งแล้วเปิดใหม่หรือเปล่า"
//                      ห้ามตรวจฐานข้อมูล — ถ้าตรวจแล้วฐานข้อมูลล่มชั่วคราว ตัว
//                      orchestrator จะรีสตาร์ต API ทิ้งวนไปเรื่อยๆ ทั้งที่ API ไม่ผิด
//
//   /api/health        "พร้อมรับงานจริงหรือยัง" ตรวจฐานข้อมูลด้วย ถ้าต่อไม่ได้
//                      ตอบ 503 เพื่อให้ตัวกระจายโหลดพาผู้ใช้ไปเครื่องอื่นแทน
//
// ทั้งสองเส้นทางไม่ต้องล็อกอิน เพราะตัวที่เรียกคือระบบ ไม่ใช่คน และไม่มีข้อมูลของ
// ผู้ใช้อยู่ในคำตอบเลย

const express = require("express");
const router = express.Router();

const db = require("../shared/db");
const asyncHandler = require("../shared/async-handler");
const { noStore } = require("../shared/cache");

/** เวลาที่โปรเซสนี้เปิดมาแล้ว — ใช้ดูว่าเพิ่งรีสตาร์ตไปหรือเปล่า */
const startedAt = Date.now();

// GET /api/health/live — ยังหายใจอยู่ไหม (ไม่แตะฐานข้อมูล)
router.get("/live", (req, res) => {
  noStore(res);
  res.json({ status: "ok", uptime_seconds: Math.round((Date.now() - startedAt) / 1000) });
});

// GET /api/health — พร้อมรับงานจริงหรือยัง (ตรวจฐานข้อมูลด้วย)
router.get(
  "/",
  asyncHandler(async (req, res) => {
    noStore(res);

    const database = await db.ping();

    // 503 ไม่ใช่ 500 — 500 แปลว่า "โค้ดพัง" ส่วน 503 แปลว่า "ยังไม่พร้อม ลองใหม่
    // ทีหลัง" ซึ่งเป็นสถานการณ์จริงเมื่อฐานข้อมูลกำลังรีสตาร์ตอยู่
    res.status(database.ok ? 200 : 503).json({
      status: database.ok ? "ok" : "degraded",
      uptime_seconds: Math.round((Date.now() - startedAt) / 1000),
      checks: { database },
    });
  })
);

module.exports = router;
