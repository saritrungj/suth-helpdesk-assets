// packages/domain/money.test.js
//
// เทสของ sumCostSatang — การรวมเงินที่ไม่กลืน "ยังไม่รู้ราคา" ทิ้ง
//
// ## บั๊กจริงที่เป็นที่มาของไฟล์นี้
//
// หลัง ADR-0019 ค่าใช้จ่ายของยอดพิมพ์ที่หาราคาที่มีผลไม่ได้เป็น NULL ไม่ใช่ 0 แต่
// หน้าเปรียบเทียบและหน้าฝ่าย/แผนกรวมเงินด้วย
//
//     sumSatang(rows.map((r) => toSatang(r.total_cost)))
//
// ซึ่งอ่านแล้วดูถูกต้องทุกบรรทัด และให้คำตอบผิดทุกครั้งที่ราคายังไม่ครบ เพราะ
// toSatang(null) เป็น 0 ทั้งหน้าจึงประกาศว่า "ค่าใช้จ่าย ฿0.00" อย่างมั่นใจ
// ทั้งที่ความจริงคือยังไม่รู้ว่าเท่าไร
//
// เทสชุดนี้ตรึงพฤติกรรมที่ต่างจาก sumSatang ไว้ เพราะความต่างนั้นคือเหตุผลทั้งหมด
// ที่ฟังก์ชันนี้มีอยู่ — ถ้าวันหนึ่งมีคนทำให้มันเหมือนกัน บั๊กเดิมจะกลับมาทันที
//
// รัน: npm test --workspace @suth/domain

const test = require("node:test");
const assert = require("node:assert/strict");

const { sumCostSatang, sumSatang, toSatang } = require("./index.cjs");

test("รายการที่ไม่รู้ราคา ถูกนับแยก ไม่ถูกบวกเป็นศูนย์", () => {
  const result = sumCostSatang(["10.00", null, "5.50", null]);

  assert.equal(result.satang, 1550);
  assert.equal(result.unpriced, 2);
});

test("ราคา 0 บาทจริง ต่างจากยังไม่รู้ราคา", () => {
  // เครื่องที่อ่านมิเตอร์แล้วไม่ได้พิมพ์เลย มีค่าใช้จ่าย 0 บาทจริง — เป็นข้อเท็จจริง
  // ที่ยืนยันได้ ไม่ใช่ช่องว่าง การนับรวมกับ NULL จะทำให้งานที่ทำเสร็จแล้วกลายเป็น
  // งานค้างบนหน้าจอ
  const result = sumCostSatang(["0.00", 0, null]);

  assert.equal(result.satang, 0);
  assert.equal(result.unpriced, 1);
});

test("ไม่มีรายการที่ไม่รู้ราคาเลย ต้องได้ยอดเท่ากับ sumSatang", () => {
  const values = ["12.34", "0.66", "100.00"];

  const viaCost = sumCostSatang(values);
  const viaSum = sumSatang(values.map(toSatang));

  assert.equal(viaCost.satang, viaSum);
  assert.equal(viaCost.unpriced, 0);
});

test("undefined และสตริงว่าง นับเป็นยังไม่รู้ราคาเหมือน null", () => {
  // API ตอบ null, ตัวแปรที่ยังไม่ถูกเซ็ตเป็น undefined และช่องว่างจาก CSV เป็น ""
  // ทั้งสามมาถึงจุดนี้ได้จริง และทั้งสามแปลว่า "ไม่มีตัวเลขให้บวก" เหมือนกัน
  const result = sumCostSatang([undefined, "", null, "1.00"]);

  assert.equal(result.satang, 100);
  assert.equal(result.unpriced, 3);
});

test("รายการว่างเปล่าไม่พัง และไม่ได้แปลว่ามีอะไรค้าง", () => {
  assert.deepEqual(sumCostSatang([]), { satang: 0, unpriced: 0 });
  assert.deepEqual(sumCostSatang(null), { satang: 0, unpriced: 0 });
});
