// packages/domain/index.cjs
//
// กฎธุรกิจที่ทั้ง apps/api และ apps/web ต้องเห็นตรงกัน — ดู ADR-0004
//
// กฎข้อเดียวของแพ็กเกจนี้: ถ้าคำตอบต้องเหมือนกันทั้งสองฝั่ง มันต้องอยู่ที่นี่
// ห้าม copy ไปเขียนซ้ำในฝั่งใดฝั่งหนึ่ง เพราะนั่นคือสาเหตุที่ปีงบเคยเพี้ยนคนละทาง
// (backend ใช้ ต.ค.-ก.ย. ถูก ส่วน frontend เดา ม.ค.-ธ.ค. ผิด)

const month = require("./month.cjs");
const fiscalYear = require("./fiscal-year.cjs");
const format = require("./format.cjs");
const money = require("./money.cjs");
const constraints = require("./constraints.cjs");

module.exports = {
  ...require("./coverage.cjs"),
  ...require("./locale-format.cjs"),
  ...month,
  ...fiscalYear,
  ...format,
  ...money,
  ...constraints,
};
