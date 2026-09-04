const express = require("express");
const multer = require("multer");
const router = express.Router();

const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const importController = require("../controllers/importController");

// จำกัดขนาดไฟล์ (5MB) และรับเฉพาะไฟล์ Excel/CSV กัน disk เต็ม/อัปโหลดไฟล์แปลกปลอม
const ALLOWED_MIME_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls
  "text/csv",
];
const ALLOWED_EXTENSIONS = [".xlsx", ".xls", ".csv"];

const upload = multer({
  dest: "uploads/",
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    const ext = file.originalname
      .slice(file.originalname.lastIndexOf("."))
      .toLowerCase();

    const isAllowed =
      ALLOWED_MIME_TYPES.includes(file.mimetype) ||
      ALLOWED_EXTENSIONS.includes(ext);

    if (!isAllowed) {
      return cb(new Error("รองรับเฉพาะไฟล์ .xlsx, .xls หรือ .csv เท่านั้น"));
    }

    cb(null, true);
  },
});

// ดัก error จาก multer (ไฟล์ใหญ่เกิน/นามสกุลไม่ตรง) ให้ตอบกลับเป็น JSON ที่อ่านง่าย
// แทนที่จะปล่อยให้หลุดไป error handler กลาง ๆ
function handleUpload(req, res, next) {
  upload.single("file")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ error: "ไฟล์มีขนาดใหญ่เกิน 5MB" });
      }
      return res.status(400).json({ error: err.message });
    }
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}


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