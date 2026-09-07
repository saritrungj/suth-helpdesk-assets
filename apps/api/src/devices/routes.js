// apps/api/src/devices/routes.js
//
// ผูกเส้นทางของทะเบียนเครื่องเข้ากับ handler ใน ./controller.js
//
// ⚠️ ลำดับของเส้นทางมีผลจริง: "/location-history" ต้องประกาศก่อน "/:id" เสมอ
// เพราะทั้งคู่เป็น path หนึ่งส่วนที่ตรงกับรูปแบบเดียวกัน — ถ้าสลับลำดับ Express
// จะจับคำว่า "location-history" เป็นค่าของ :id แล้วคืน 404 ตลอดไป

const express = require("express");
const router = express.Router();

const requireAuth = require("../auth/require-auth");
const requireAdmin = require("../auth/require-admin");
const asyncHandler = require("../shared/async-handler");
const devices = require("./controller");

// ทุกเส้นทางในไฟล์นี้ต้องล็อกอินก่อน
router.use(requireAuth);

// ---------- อ่าน: ทุกคนที่ล็อกอินแล้ว ----------

router.get("/", devices.validators.list, asyncHandler(devices.getAll));

router.get("/location-history", asyncHandler(devices.getAllLocationHistory));

router.get("/:id", devices.validators.byId, asyncHandler(devices.getOne));

router.get("/:id/history", devices.validators.byId, asyncHandler(devices.getHistory));

router.get("/:id/current-usage", devices.validators.byId, asyncHandler(devices.getCurrentUsage));

// ---------- เขียน: ผู้ดูแลระบบเท่านั้น ----------

router.post("/", requireAdmin, devices.validators.create, asyncHandler(devices.create));

router.put("/:id", requireAdmin, devices.validators.update, asyncHandler(devices.update));

// ย้ายเครื่อง — แยกจากการแก้ไขทั่วไปด้านบน เพราะการย้ายเขียนประวัติการย้ายด้วย
// และเป็นการกระทำที่ผู้ใช้ตั้งใจทำคนละครั้งกับการแก้ข้อมูลทรัพย์สิน
router.put("/:id/move", requireAdmin, devices.validators.move, asyncHandler(devices.move));

router.delete("/:id", requireAdmin, devices.validators.byId, asyncHandler(devices.remove));

module.exports = router;
