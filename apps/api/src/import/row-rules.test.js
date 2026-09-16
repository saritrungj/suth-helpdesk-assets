const test = require("node:test");
const assert = require("node:assert");

const { rowFieldProblems, tooLong } = require("./row-rules");
const { MAX_LENGTH } = require("@suth/domain");

/*
 * เทสชุดนี้คุ้มกันบั๊ก #85 — ก่อนแก้ ไฟล์ที่มีเลขซีเรียลว่างและเลขซีเรียลยาว 150
 * ตัวอักษร ถูกบันทึกลงฐานข้อมูลทั้งคู่โดย API ตอบว่า "Import สำเร็จ" ตัวที่ยาวเกิน
 * ถูก MySQL ตัดเหลือ 100 ตัวอักษรเงียบๆ เพราะ sql_mode ไม่ได้เปิด STRICT_TRANS_TABLES
 */

test("แถวที่ครบถ้วนไม่มีเหตุผลให้ข้าม", () => {
  assert.deepStrictEqual(rowFieldProblems({ serial_number: "PRN-OPD-001", model: "M404", location: "เคาน์เตอร์" }), []);
});

test("เลขซีเรียลว่างต้องถูกข้าม ไม่ใช่บันทึกเป็นเครื่องที่จับคู่ยอดไม่ได้ตลอดไป", () => {
  assert.deepStrictEqual(rowFieldProblems({ serial_number: "" }), ["ไม่มีเลขซีเรียล"]);
  assert.deepStrictEqual(rowFieldProblems({ serial_number: "   " }), ["ไม่มีเลขซีเรียล"]);
  assert.deepStrictEqual(rowFieldProblems({}), ["ไม่มีเลขซีเรียล"]);
});

test("เลขซีเรียลที่ยาวเกินขนาดคอลัมน์ต้องถูกปฏิเสธ ไม่ใช่ถูกตัดทิ้งเงียบๆ", () => {
  const serial = "P".repeat(MAX_LENGTH.serial_number + 1);
  const problems = rowFieldProblems({ serial_number: serial });

  assert.strictEqual(problems.length, 1);
  // เหตุผลต้องบอกความยาวจริงกับเพดาน ไม่ใช่แค่ "ยาวเกินไป" — คนแก้ไฟล์ต้องรู้ว่าต้องตัดเท่าไร
  assert.match(problems[0], new RegExp(`${serial.length}`));
  assert.match(problems[0], new RegExp(`${MAX_LENGTH.serial_number}`));
});

test("ความยาวพอดีเพดานยังผ่าน — เส้นแบ่งอยู่ที่ 'เกิน' ไม่ใช่ 'เท่ากับ'", () => {
  assert.deepStrictEqual(rowFieldProblems({ serial_number: "P".repeat(MAX_LENGTH.serial_number) }), []);
});

test("ชื่อรุ่นและตำแหน่งที่ยาวเกินก็ถูกตัดเงียบได้เหมือนกัน จึงต้องดักด้วย", () => {
  const problems = rowFieldProblems({
    serial_number: "PRN-001",
    model: "M".repeat(MAX_LENGTH.model + 1),
    location: "ล".repeat(MAX_LENGTH.location + 1),
  });

  assert.strictEqual(problems.length, 2);
  assert.match(problems[0], /ชื่อรุ่น/);
  assert.match(problems[1], /ตำแหน่ง/);
});

test("ซีเรียลซ้ำในไฟล์เดียวกันรายงานรายแถว ไม่ปล่อยให้ทั้งไฟล์ล้มที่ UNIQUE KEY", () => {
  const seen = new Set(["PRN-OPD-001"]);
  assert.deepStrictEqual(rowFieldProblems({ serial_number: "PRN-OPD-001" }, seen), [
    "เลขซีเรียลนี้ซ้ำกับแถวก่อนหน้าในไฟล์เดียวกัน",
  ]);
});

test("ฟังก์ชันไม่เพิ่มซีเรียลลง seenSerials เอง — ผู้เรียกเป็นคนตัดสินว่าแถวนี้นับหรือไม่", () => {
  const seen = new Set();
  rowFieldProblems({ serial_number: "PRN-OPD-001" }, seen);

  // ถ้าฟังก์ชันเพิ่มเอง แถวที่ถูกข้ามด้วยเหตุผลอื่น (เช่นหายี่ห้อไม่เจอ) จะไปกัน
  // แถวถัดไปที่มีซีเรียลเดียวกันและอาจจะถูกต้อง ให้ถูกข้ามตามไปด้วย
  assert.strictEqual(seen.size, 0);
});

test("เลขซีเรียลว่างที่ซ้ำกันหลายแถว รายงานว่า 'ไม่มีเลขซีเรียล' ทุกแถว ไม่ใช่ 'ซ้ำ'", () => {
  const seen = new Set([""]);
  assert.deepStrictEqual(rowFieldProblems({ serial_number: "" }, seen), ["ไม่มีเลขซีเรียล"]);
});

test("tooLong คืนเพดานเมื่อเกิน และ null เมื่อไม่เกิน", () => {
  assert.strictEqual(tooLong("x".repeat(MAX_LENGTH.model + 1), "model"), MAX_LENGTH.model);
  assert.strictEqual(tooLong("x", "model"), null);
  // ช่องที่ไม่มีเพดานกำหนดไว้ ต้องไม่ถูกปฏิเสธเพราะเดาเอง
  assert.strictEqual(tooLong("x".repeat(9999), "ช่องที่ไม่มีในตาราง"), null);
});
