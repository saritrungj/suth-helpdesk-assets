// apps/api/src/devices/move-unchanged.test.js
//
// ย้ายเครื่องไปที่เดิมต้องไม่ตอบว่าสำเร็จ (#239) — เดิม PUT /devices/:id/move ตอบ 200 "ย้ายเครื่อง
// เรียบร้อยแล้ว" ทั้งที่ไม่มีอะไรเปลี่ยนและไม่มีประวัติเพิ่ม ผู้ใช้จึงเข้าใจว่าย้ายแล้ว

const test = require("node:test");
const assert = require("node:assert/strict");

const { sameLocation } = require("./controller");

const here = { building_id: 2, floor_id: 3, location: "ห้อง 1", division_id: 4, department_id: 5 };

test("ที่ตั้งและหน่วยงานเท่ากันทุกช่อง = ไม่มีอะไรให้ย้าย", () => {
  assert.equal(sameLocation(here, { ...here }), true);
});

test("ช่องใดช่องหนึ่งต่าง = ย้ายจริง", () => {
  for (const [field, value] of [["building_id", 9], ["floor_id", 9], ["location", "ห้อง 2"], ["division_id", 9], ["department_id", null]]) {
    assert.equal(sameLocation(here, { ...here, [field]: value }), false, field);
  }
});

test("ตำแหน่งว่างกับ null ถือว่าเท่ากัน และช่องว่างหัวท้ายไม่นับเป็นการย้าย", () => {
  assert.equal(sameLocation({ ...here, location: null }, { ...here, location: "" }), true);
  assert.equal(sameLocation(here, { ...here, location: " ห้อง 1 " }), true);
});

test("เครื่องที่ยังไม่มีที่ตั้ง ย้ายไปที่ว่างเหมือนเดิม = ไม่มีอะไรให้ย้าย", () => {
  const nowhere = { building_id: null, floor_id: null, location: null, division_id: null, department_id: null };
  assert.equal(sameLocation(nowhere, { ...nowhere }), true);
});
