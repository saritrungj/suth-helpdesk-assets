const test = require("node:test");
const assert = require("node:assert/strict");
const { fiscalYearMonths, fiscalYearOfMonth, getFiscalYearRange } = require("./index.cjs");

test("ทุกเดือนของปีงบย้อนกลับมาเป็นปีงบเดิม ทั้งฝั่ง ต.ค.–ธ.ค. และ ม.ค.–ก.ย.", () => {
  for (const year of [2567, 2568, 2569, 2570]) {
    for (const month of fiscalYearMonths(getFiscalYearRange(year))) {
      assert.equal(fiscalYearOfMonth(month), year, month);
    }
  }
});

test("รอยต่อ ก.ย. → ต.ค. เปลี่ยนปีงบ ไม่ใช่รอยต่อ ธ.ค. → ม.ค.", () => {
  assert.equal(fiscalYearOfMonth("2025-09"), 2568);
  assert.equal(fiscalYearOfMonth("2025-10"), 2569);
  assert.equal(fiscalYearOfMonth("2025-12"), 2569);
  assert.equal(fiscalYearOfMonth("2026-01"), 2569);
});

test("รูปแบบเดือนที่ไม่ถูกต้องคืน null ไม่เดาปีงบให้", () => {
  for (const value of ["", null, undefined, "2025-13", "2025-00", "2568-10-01", "10/2568"]) {
    assert.equal(fiscalYearOfMonth(value), null, String(value));
  }
});

// ---------- ปีงบเริ่มต้นของแอป (#176) ----------
const { defaultFiscalYear } = require("./index.cjs");
const fy = (year) => ({ id: year, year: String(year), ...(() => {
  const r = getFiscalYearRange(year);
  return { start_month: r.startMonth, end_month: r.endMonth };
})() });

test("ปีงบเริ่มต้น = ปีที่ครอบเดือนปัจจุบัน แม้มีปีล่วงหน้าต่อท้ายรายการ", () => {
  const list = [2568, 2569, 2570, 2571, 2572].map(fy);
  assert.equal(defaultFiscalYear(list, "2026-09").year, "2569");
  assert.equal(defaultFiscalYear(list, "2026-10").year, "2570", "ต.ค. เปลี่ยนปีงบ");
});

test("ไม่มีปีที่ครอบวันนี้ → ปีล่าสุดที่เริ่มไปแล้ว ถ้าทุกปีอยู่ในอนาคต → ปีแรกสุด", () => {
  assert.equal(defaultFiscalYear([2566, 2567].map(fy), "2026-09").year, "2567");
  assert.equal(defaultFiscalYear([2571, 2570].map(fy), "2026-09").year, "2570");
});

test("ลำดับในรายการไม่มีผล และรายการว่างคืน null", () => {
  assert.equal(defaultFiscalYear([2572, 2569, 2568].map(fy), "2026-01").year, "2569");
  assert.equal(defaultFiscalYear([], "2026-01"), null);
});
