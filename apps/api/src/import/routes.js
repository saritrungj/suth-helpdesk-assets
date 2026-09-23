const express = require("express");
const router = express.Router();

const authMiddleware = require("../auth/require-auth");
const adminMiddleware = require("../auth/require-admin");
const importController = require("./controller");
const { handleUpload } = require("./upload");

// ต้อง login และเป็น admin ถึงจะ import ได้ (เดิมไม่มีการป้องกันเลย)
router.post(
  "/devices/import",
  authMiddleware,
  adminMiddleware,
  handleUpload,
  importController.importDevices
);

// นำเข้ายอดพิมพ์รายเดือน (มิเตอร์) จากไฟล์ Excel เดิม — จับคู่ด้วย SN. แล้วแปลง
// หัวคอลัมน์ "meter M/YY" เป็นเดือนปฏิทินจริงก่อนบันทึก (ดูเหตุผลใน importController.js)
router.post(
  "/print-transactions/import",
  authMiddleware,
  adminMiddleware,
  handleUpload,
  importController.importPrintTransactions
);


module.exports = router;