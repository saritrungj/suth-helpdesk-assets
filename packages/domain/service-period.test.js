// packages/domain/service-period.test.js
//
// เทสของกฎ "เดือนไหนเครื่องไหนต้องกรอก" — ตรรกะที่ผิดแล้วไม่มีอะไรฟ้อง
// ผลลัพธ์ยังเป็นตัวเลขที่ดูสมเหตุสมผล มีแค่คนที่เอาไปตัดสินใจต่อโดยไม่รู้ว่าผิด
//
// รัน: npm test --workspace @suth/domain

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { monthOfDate, periodCoversMonth, requiredDevicesByMonth } = require("./index.cjs");

const period = (from, to = null, device_id = 1) => ({
  device_id,
  effective_from: from,
  effective_to: to,
});

test("ตัดวันที่ทิ้งเหลือเดือน โดยไม่ผ่าน Date ที่เลื่อนตาม timezone", () => {
  assert.equal(monthOfDate("2026-03-15"), "2026-03");
  // mysql2 ตั้ง dateStrings ไว้ แต่เผื่อผู้เรียกฝั่งอื่นส่ง Date มา
  assert.equal(monthOfDate(new Date(2026, 2, 15)), "2026-03");
  assert.equal(monthOfDate(null), null);
  assert.equal(monthOfDate(""), null);
  assert.equal(monthOfDate("ไม่ใช่วันที่"), null);
});

test("เดือนก่อนวันติดตั้งไม่ใช่งานค้าง (ADR-0018 Q17)", () => {
  const installed = period("2026-03-10");
  assert.equal(periodCoversMonth(installed, "2026-02"), false);
  // เดือนที่ติดตั้งกลางเดือน ยังต้องมียอดของเดือนนั้น (Q20)
  assert.equal(periodCoversMonth(installed, "2026-03"), true);
  assert.equal(periodCoversMonth(installed, "2026-04"), true);
});

test("เดือนที่ปิดช่วงกลางเดือน ยังต้องบันทึกยอดของเดือนนั้น (ADR-0018 Q20)", () => {
  // จุดที่ต่างจาก device_location_history โดยตั้งใจ — ที่นั่นปลายช่วงไม่รวมเดือน
  // ที่ย้าย เพราะยอดเดือนนั้นเป็นของที่ตั้งใหม่ ส่วนที่นี่ "ต้องกรอกไหม" ตอบว่าต้อง
  const retiredMidMarch = period("2025-10-01", "2026-03-15");
  assert.equal(periodCoversMonth(retiredMidMarch, "2026-03"), true);
  assert.equal(periodCoversMonth(retiredMidMarch, "2026-04"), false);
});

test("ช่วงที่ไม่มีวันเริ่มไม่ครอบคลุมเดือนไหนเลย ห้ามเดาว่าเริ่มตั้งแต่ต้นเวลา", () => {
  // Q21 ห้ามอนุมานวันติดตั้ง การเดาว่า "ไม่รู้ = ตั้งแต่ต้นปีงบ" คือการอนุมาน
  assert.equal(periodCoversMonth(period(null), "2026-03"), false);
  assert.equal(periodCoversMonth(period(""), "2026-03"), false);
  assert.equal(periodCoversMonth(undefined, "2026-03"), false);
});

test("นับเป็นจำนวนเครื่องไม่ซ้ำ ไม่ใช่จำนวนช่วง", () => {
  // เครื่องเดียวถูกถอดแล้วติดตั้งใหม่ภายในเดือนเดียวกัน = สองช่วง แต่ยังเป็น
  // เครื่องเดียวที่ต้องกรอกยอดหนึ่งรายการ ถ้านับตามช่วงตัวส่วนจะเป็น 2
  // แล้วเดือนนั้นจะไม่มีวันครบไม่ว่าจะกรอกยังไง
  const months = ["2026-03"];
  const counts = requiredDevicesByMonth(
    [period("2026-03-01", "2026-03-10", 7), period("2026-03-20", null, 7)],
    months
  );
  assert.equal(counts.get("2026-03"), 1);
});

test("ตัวส่วนของแต่ละเดือนต่างกันได้ตามช่วงจริงของเครื่อง (issue #79)", () => {
  const months = ["2025-10", "2025-11", "2025-12", "2026-01"];

  const counts = requiredDevicesByMonth(
    [
      period("2025-10-01", null, 1), // อยู่ตั้งแต่ต้นปีงบ
      period("2025-10-01", null, 2),
      period("2025-12-05", null, 3), // เพิ่งติดตั้งกลางปี — เดือนก่อนหน้าไม่ใช่งานค้าง
    ],
    months
  );

  assert.equal(counts.get("2025-10"), 2);
  assert.equal(counts.get("2025-11"), 2);
  assert.equal(counts.get("2025-12"), 3);
  assert.equal(counts.get("2026-01"), 3);
});

test("เดือนที่ยังไม่มีเครื่องไหนรับผิดชอบ ได้ 0 ไม่ใช่หายไปจาก Map", () => {
  // ฝั่งที่เรียกใช้วาดตาราง 12 ช่องจาก Map นี้ตรงๆ เดือนที่หายไปจะกลายเป็นช่องว่าง
  // ที่ไม่มีใครสังเกต แทนที่จะเป็น 0 ที่อ่านออกว่า "เดือนนี้ไม่มีอะไรต้องทำ"
  const counts = requiredDevicesByMonth([], ["2025-10", "2025-11"]);
  assert.equal(counts.get("2025-10"), 0);
  assert.equal(counts.size, 2);
});
