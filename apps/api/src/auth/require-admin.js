// apps/api/src/auth/require-admin.js
//
// ด่านที่สอง: คนนี้มีสิทธิ์ทำสิ่งนี้ไหม — ต้องวางหลัง require-auth เสมอ
//
// การซ่อนเมนูฝั่งเว็บเป็นเรื่องประสบการณ์ใช้งาน ไม่ใช่ความปลอดภัย ตัวที่บังคับ
// สิทธิ์จริงคือไฟล์นี้ เพราะใครก็ยิง API ตรงด้วย curl ได้โดยไม่ผ่านหน้าเว็บ

const { forbidden } = require("../shared/http-error");

module.exports = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return next(
      forbidden("ต้องเป็นผู้ดูแลระบบจึงจะทำรายการนี้ได้", {
        code: "admin_only",
        detail: "ติดต่อผู้ดูแลระบบหากต้องการสิทธิ์เพิ่ม",
      })
    );
  }

  next();
};
