// อนุญาตเฉพาะ admin และ staff (กัน viewer ที่มีไว้ "ดูอย่างเดียว" ไม่ให้กรอก/แก้ไขข้อมูลได้)
// ใช้แทน adminMiddleware ตรงจุดที่ staff ควรทำได้ด้วย เช่น บันทึกยอดพิมพ์รายเดือน
module.exports = (req, res, next) => {
  if (req.user.role !== "admin" && req.user.role !== "staff") {
    return res.status(403).json({
      message: "Access denied",
      error: "บัญชีนี้เป็นสิทธิ์ดูอย่างเดียว ไม่สามารถบันทึก/แก้ไขข้อมูลได้",
    });
  }

  next();
};
