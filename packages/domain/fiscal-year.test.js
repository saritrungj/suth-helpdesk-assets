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
