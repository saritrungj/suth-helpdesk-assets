// packages/domain/location-history.test.js
//
// เทสของกฎ "ยอดเดือนนี้เป็นของที่ตั้งไหน" (ADR-0014) — กรณีเดียวกับที่
// apps/api/src/shared/effective-location-sql.js ต้องตอบ
//
// รัน: npm test --workspace @suth/domain

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { locationPeriodCoversMonth, effectiveLocationPeriod } = require("./index.cjs");

const period = (id, from, to = null) => ({ id, effective_from: from, effective_to: to });

test("เดือนที่ย้ายกลางเดือนเป็นของที่ตั้งใหม่ทั้งเดือน", () => {
  const before = period(1, "2025-10-01", "2026-01-20");
  const after = period(2, "2026-01-20");

  assert.equal(locationPeriodCoversMonth(before, "2025-12"), true);
  assert.equal(locationPeriodCoversMonth(before, "2026-01"), false);
  assert.equal(locationPeriodCoversMonth(after, "2026-01"), true);
  assert.equal(effectiveLocationPeriod([before, after], "2026-01"), after);
});

test("ช่วงที่ซ้อนกัน วันเริ่มล่าสุดชนะ ไม่ว่าจะเรียงมาแบบไหน", () => {
  const older = period(5, "2025-10-01");
  const newer = period(4, "2026-01-01");

  assert.equal(effectiveLocationPeriod([older, newer], "2026-02"), newer);
  assert.equal(effectiveLocationPeriod([newer, older], "2026-02"), newer);
  assert.equal(effectiveLocationPeriod([older, newer], "2025-12"), older);
});

test("วันเริ่มเท่ากัน id มากกว่าชนะ — ผลคงที่ทุกครั้ง", () => {
  const first = period(7, "2026-01-01");
  const second = period(8, "2026-01-01");
  assert.equal(effectiveLocationPeriod([second, first], "2026-03"), second);
});

test("วันเริ่มคนละวันในเดือนเดียวกัน เทียบระดับวัน เหมือนคอลัมน์ DATE", () => {
  const early = period(9, "2026-01-05");
  const late = period(3, "2026-01-25");
  assert.equal(effectiveLocationPeriod([late, early], "2026-01"), late);
});

test("ไม่มีช่วงครอบคลุม คืน null ให้ใช้ที่ตั้งปัจจุบัน", () => {
  assert.equal(effectiveLocationPeriod([period(1, "2026-03-01")], "2026-02"), null);
  assert.equal(effectiveLocationPeriod([], "2026-02"), null);
  assert.equal(effectiveLocationPeriod(undefined, "2026-02"), null);
  // ช่วงที่อ่านวันเริ่มไม่ออก ไม่ครอบคลุมอะไร — ไม่เดาว่าเริ่มตั้งแต่ต้นเวลา
  assert.equal(effectiveLocationPeriod([period(1, null)], "2026-02"), null);
});
