// apps/api/src/master-data/names.test.js — จับคู่ชื่อในไฟล์กับข้อมูลหลัก (ADR-0025)

const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeName, nameKey, createNameResolver } = require("./names");

test("normalizeName ยุบช่องว่างซ้อน ตัดหัวท้าย และตัดอักขระที่มองไม่เห็น", () => {
  assert.equal(normalizeName("  หอผู้ป่วยพิเศษ   11B ​"), "หอผู้ป่วยพิเศษ 11B");
  assert.equal(normalizeName(" The\tmall\n"), "The mall");
  assert.equal(normalizeName(null), "");
});

test("nameKey ไม่สนตัวพิมพ์เล็กใหญ่ เหมือน collation ของฐาน", () => {
  assert.equal(nameKey("The Mall"), nameKey(" the  mall "));
});

test("nameKey ถือว่า \"ำ\" ตัวเดียว กับ \"ํ\" + \"า\" เป็นชื่อเดียวกัน", () => {
  // แสดงผลเหมือนกันทุกประการแต่คนละ byte — พบบ่อยในไฟล์ที่พิมพ์จากคนละโปรแกรม
  assert.equal(nameKey("ศูนย์บริบาลผู้สูงอายุและผู้ป่วยสำรอง"), nameKey("ศูนย์บริบาลผู้สูงอายุและผู้ป่วยสํารอง"));
});

const resolver = createNameResolver({
  names: [
    { id: 1, name: "อาคารศูนย์ความเป็นเลิศทางการแพทย์" },
    { id: 2, name: "อาคารรัตนเวชพัฒน์" },
  ],
  aliases: [
    { target_id: 1, alias: "ศูนย์ความเป็นเลิศทางการแพทย์ (EMC)" },
    { target_id: 2, alias: "รัตนเวชพัฒน์ (RVP)" },
  ],
});

test("จับคู่ชื่อหลักได้ และบอกว่าได้มาจากชื่อหลัก", () => {
  assert.deepEqual(resolver.resolve("อาคารรัตนเวชพัฒน์ "), { id: 2, via: "name" });
});

test("จับคู่ชื่อเรียกอื่นได้ และบอกว่าได้มาจากชื่อเรียกอื่น", () => {
  assert.deepEqual(resolver.resolve("ศูนย์ความเป็นเลิศทางการแพทย์  (EMC)"), { id: 1, via: "alias" });
});

test("ชื่อที่ไม่รู้จักหรือว่าง = null ไม่เดา", () => {
  assert.equal(resolver.resolve("ศูนย์ความเป็นเลิศ"), null);
  assert.equal(resolver.resolve("   "), null);
});

test("ชื่อเรียกอื่นที่ชนชื่อหลัก — ชื่อหลักชนะ", () => {
  const clash = createNameResolver({
    names: [{ id: 1, name: "A" }, { id: 2, name: "B" }],
    aliases: [{ target_id: 2, alias: "a" }],
  });
  assert.deepEqual(clash.resolve("A"), { id: 1, via: "name" });
});
