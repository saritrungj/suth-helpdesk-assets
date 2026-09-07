// apps/api/src/auth/require-staff.js
//
// อนุญาต admin และ staff — กัน viewer ที่มีไว้ "ดูอย่างเดียว" ไม่ให้กรอกหรือแก้ข้อมูล
//
// ใช้แทน require-admin ตรงจุดที่ staff ต้องทำได้ด้วย โดยเฉพาะการบันทึกยอดพิมพ์
// รายเดือน ซึ่งเป็นงานประจำของเจ้าหน้าที่ ไม่ควรต้องรอผู้ดูแลระบบมากดให้

const { forbidden } = require("../shared/http-error");
const { USER_ROLES } = require("@suth/domain");

/** สิทธิ์ที่แก้ไขข้อมูลได้ — ทุกอย่างยกเว้นตัวสุดท้ายในรายการ (viewer) */
const CAN_WRITE = USER_ROLES.filter((role) => role !== "viewer");

module.exports = (req, res, next) => {
  if (!CAN_WRITE.includes(req.user?.role)) {
    return next(
      forbidden("บัญชีนี้เป็นสิทธิ์ดูอย่างเดียว", {
        code: "read_only",
        detail: "ไม่สามารถบันทึกหรือแก้ไขข้อมูลได้ ติดต่อผู้ดูแลระบบหากต้องการสิทธิ์เพิ่ม",
      })
    );
  }

  next();
};
