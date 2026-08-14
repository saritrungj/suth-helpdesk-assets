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

router.delete(
  "/:id",
  authMiddleware,
  adminMiddleware,
  deviceController.remove
);

module.exports = router;