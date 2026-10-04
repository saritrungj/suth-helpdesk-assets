// apps/api/src/dashboard/fiscal-year-gap.test.js — ขอบปีงบ ก.ย. → ต.ค. (#256)

const test = require("node:test");
const assert = require("node:assert/strict");

const { missingFiscalYearAttention } = require("./fiscal-year-gap");

const FY2569 = { year: "2569", start_month: "2025-10", end_month: "2026-09" };
const FY2570 = { year: "2570", start_month: "2026-10", end_month: "2027-09" };

test("เดือนสุดท้ายของปีงบยังอยู่ในปีงบ — ไม่เตือน", () => {
  assert.equal(missingFiscalYearAttention("2026-09", [FY2569]), null);
});

test("ต.ค. มาถึงแต่ยังไม่มีปีงบใหม่ — เตือนและบอกเลขปีงบที่ต้องเพิ่ม", () => {
  const item = missingFiscalYearAttention("2026-10", [FY2569]);
  assert.equal(item.code, "missing_fiscal_year");
  assert.equal(item.severity, "critical");
  assert.match(item.title, /2570/);
  assert.match(item.detail, /ตุลาคม 2569/);
  assert.deepEqual(item.params, { month: "2026-10", year: 2570 });
  assert.equal(item.action.to, "/admin/fiscal-years");
});

test("มีปีงบใหม่แล้ว — ไม่เตือน", () => {
  assert.equal(missingFiscalYearAttention("2026-10", [FY2569, FY2570]), null);
});

test("ฐานที่ยังไม่มีปีงบเลยก็เตือน", () => {
  assert.equal(missingFiscalYearAttention("2026-03", []).params.year, 2569);
});
