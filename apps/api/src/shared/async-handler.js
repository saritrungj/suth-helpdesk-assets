// apps/api/src/shared/async-handler.js
//
// ห่อ route handler ที่เป็น async ให้ error ที่ throw ออกมาไหลไปหา error handler กลาง
//
// ปัญหาเดิม: ทุก route เขียน try/catch ของตัวเองห่อทั้งฟังก์ชัน แล้วจบด้วย
// res.status(500).json({ error: err.message }) เหมือนกันหมด — โค้ดชุดเดียวกัน
// ถูกคัดลอกไปกว่าสามสิบที่ และแต่ละที่ค่อยๆ เขียนไม่เหมือนกัน บางที่ลืม catch
// ทำให้ promise พังเงียบๆ แล้ว request ค้างจนหมดเวลาโดยไม่มีคำตอบกลับไปเลย
//
// Express 5 ดัก promise ที่ reject ให้เองแล้วก็จริง แต่ห่อชัดเจนแบบนี้ทำให้
// อ่านโค้ดแล้วรู้ทันทีว่า handler ตัวนี้ตั้งใจโยน error ทิ้งให้ส่วนกลางจัดการ
// ไม่ใช่ลืมเขียน try/catch
//
// @param {(req, res, next) => Promise<unknown>} handler
// @returns {(req, res, next) => void}

module.exports = function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
};
