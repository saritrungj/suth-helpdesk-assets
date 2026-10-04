// apps/api/src/audit/names.test.js — ประวัติการแก้ไขต้องอ่านเป็นชื่อได้ ไม่ใช่รหัส (#237)

const test = require("node:test");
const assert = require("node:assert/strict");

const { referencedIds, attachNames } = require("./names");

test("เก็บรหัสจากทั้งค่าก่อนและหลัง แยกตามชนิดรายการ ไม่ซ้ำ", () => {
  const ids = referencedIds({
    before: { division_id: 21, department_id: 495, location: "ห้องยา" },
    after: { division_id: 27, department_id: null, location: "ห้องยา" },
  });
  assert.deepEqual(ids, { division: [21, 27], department: [495] });
});

test("ราคาตามหมวดของสัญญาอ้างถึงหมวดมิเตอร์", () => {
  const ids = referencedIds({ before: null, after: { contract_no: "X", price_lines: "2:0.4500, 3:1.2000" } });
  assert.deepEqual(ids, { meter_category: [2, 3] });
});

test("ค่าที่ไม่ใช่รหัส (ว่าง ข้อความ ศูนย์) ไม่ถูกนับ และแถวที่ไม่มีค่าก่อน/หลังไม่ล้ม", () => {
  assert.deepEqual(referencedIds({ before: { brand_id: null, building_id: "", floor_id: 0, contract_id: "abc" }, after: null }), {});
  assert.deepEqual(referencedIds({ before: null, after: null }), {});
});

test("ใส่ชื่อให้เฉพาะรหัสที่ยังมีอยู่ และถามแต่ละตารางครั้งเดียว", async () => {
  const calls = [];
  const q = {
    async query(sql, params) {
      calls.push({ sql, ids: params[0] });
      if (sql.includes("`division`")) return [[{ id: 21, name: "ฝ่ายการพยาบาล" }, { id: 27, name: "ฝ่ายเภสัชกรรม" }]];
      if (sql.includes("`department`")) return [[]]; // แผนก 495 ถูกลบไปแล้ว
      return [[]];
    },
  };
  const rows = [
    { id: 1, before: { division_id: 21, department_id: 495 }, after: { division_id: 27, department_id: null } },
    { id: 2, before: { division_id: 27 }, after: { division_id: 21 } },
    { id: 3, before: null, after: { pages: 120 } },
  ];

  const result = await attachNames(q, rows);

  assert.equal(calls.length, 2);
  assert.deepEqual(result[0].names, { division: { 21: "ฝ่ายการพยาบาล", 27: "ฝ่ายเภสัชกรรม" }, department: {} });
  assert.deepEqual(result[1].names, { division: { 21: "ฝ่ายการพยาบาล", 27: "ฝ่ายเภสัชกรรม" } });
  assert.deepEqual(result[2].names, {});
  assert.equal(result[0].id, 1);
});
