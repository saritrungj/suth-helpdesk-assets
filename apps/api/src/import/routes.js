const express = require("express");
const multer = require("multer");
const router = express.Router();

const authMiddleware = require("../auth/require-auth");
const adminMiddleware = require("../auth/require-admin");
const importController = require("./controller");
const { badRequest } = require("../shared/http-error");

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

// ดัก error จาก multer (ไฟล์ใหญ่เกิน / นามสกุลไม่ตรง) แล้วส่งต่อเป็น ApiError
// เพื่อให้ออกไปในรูปแบบเดียวกับข้อผิดพลาดอื่นทั้งระบบ (RFC 9457) — เดิมตอบเป็น
// { error } ซึ่งเป็นรูปแบบที่สามของระบบนี้ ทำให้ฝั่งเว็บต้องเดาว่าจะอ่านช่องไหน
function handleUpload(req, res, next) {
  upload.single("file")(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return next(
        badRequest("ไฟล์มีขนาดใหญ่เกิน 5MB", {
          code: "file_too_large",
          detail: "แบ่งไฟล์เป็นหลายไฟล์ หรือลบคอลัมน์/แผ่นงานที่ไม่เกี่ยวข้องออกก่อนนำเข้า",
        })
      );
    }

    if (err) {
      return next(badRequest(err.message, { code: "upload_rejected" }));
    }

    // ไม่ได้แนบไฟล์มาเลย — ต้องดักที่นี่ ไม่งั้น controller จะพังตอนอ่าน req.file.path
    // แล้วผู้ใช้จะเห็น 500 แทนที่จะเห็นว่าลืมเลือกไฟล์
    if (!req.file) {
      return next(badRequest("กรุณาเลือกไฟล์ที่ต้องการนำเข้า", { code: "no_file" }));
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