const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");

const deviceController = require("../controllers/deviceController");

// ทุกคนที่ Login แล้วดูได้
router.get(
  "/",
  authMiddleware,
  deviceController.getAll
);

// ประวัติการย้ายของ "ทุกเครื่อง" พร้อมกัน — ใช้ในหน้ารายงานเพื่อแยกยอดพิมพ์เก่า/ใหม่
// เมื่อเครื่องมีการย้าย ต้องวางไว้ก่อน "/:id" ไม่งั้น Express จะจับคำว่า "location-history"
// เป็นค่า :id แทน (ทั้งคู่เป็น path แบบ 1 segment ให้ตรงกับ pattern เดียวกัน)
router.get(
  "/location-history",
  authMiddleware,
  deviceController.getAllLocationHistory
);

router.get(
  "/:id",
  authMiddleware,
  deviceController.getOne
);

// ประวัติการย้ายอาคาร/ชั้น/ฝ่าย/แผนกของเครื่อง — ดูได้เหมือนหน้ารายงานอื่นๆ ไม่ต้องเป็น admin
router.get(
  "/:id/history",
  authMiddleware,
  deviceController.getHistory
);

// ยอดพิมพ์สะสมของช่วงที่ตั้ง/สังกัดปัจจุบัน — โชว์ในหน้าต่าง "ย้ายเครื่อง" ก่อนย้ายจริง
router.get(
  "/:id/current-usage",
  authMiddleware,
  deviceController.getCurrentUsage
);

// Admin เท่านั้น
router.post(
  "/",
  authMiddleware,
  adminMiddleware,
  deviceController.create
);

router.put(
  "/:id",
  authMiddleware,
  adminMiddleware,
  deviceController.update
);

// ย้ายเครื่อง (อาคาร/ชั้น/ตำแหน่ง/ฝ่าย/แผนก) — แยกออกจากการแก้ไขทรัพย์สินทั่วไปด้านบน
router.put(
  "/:id/move",
  authMiddleware,
  adminMiddleware,
  deviceController.move
);

router.delete(
  "/:id",
  authMiddleware,
  adminMiddleware,
  deviceController.remove
);

module.exports = router;