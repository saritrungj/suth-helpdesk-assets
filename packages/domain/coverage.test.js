const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  computeCoverage,
  fiscalYearMonths,
  formatMonth,
  formatFiscalYear,
  formatDate,
} = require("./index.cjs");
const fyMonths = fiscalYearMonths({ startMonth: "2025-10", endMonth: "2026-09" });

/** ทุกเดือนต้องกรอกเท่ากันหมด — กรณีที่ง่ายที่สุด ใช้เป็นฐานของเทสด้านล่าง */
const sameEveryMonth = (count) => new Map(fyMonths.map((m) => [m, count]));

test("annual completion and overdue work have distinct denominators", () => {
  const input = {
    fyMonths,
    filledByMonth: new Map(fyMonths.slice(0, 6).map((m) => [m, 18])),
    requiredByMonth: sameEveryMonth(18),
    today: "2026-09",
  };
  const { coverage } = computeCoverage(input);
  assert.equal(coverage.total_months, 12);
  assert.equal(coverage.annual_complete_months, 6);
  assert.equal(coverage.incomplete_months, 5);
  assert.equal(coverage.not_due_months, 1);
  assert.equal(coverage.months[6].missing_devices, 18);
  input.filledByMonth.set("2026-09", 18);
  const early = computeCoverage(input).coverage;
  assert.equal(early.annual_complete_months, 7);
  assert.equal(early.complete_months, 6);
  assert.equal(early.not_due_months, 0);
});

test("October boundary makes September overdue; no devices is not completion", () => {
  const input = {
    fyMonths,
    filledByMonth: new Map(),
    requiredByMonth: sameEveryMonth(1),
    today: "2026-10",
  };
  assert.equal(computeCoverage(input).coverage.incomplete_months, 12);
  const empty = computeCoverage({ ...input, requiredByMonth: sameEveryMonth(0) }).coverage;
  assert.equal(empty.applicable, false);
  assert.equal(empty.annual_complete_months, 0);
  assert.equal(empty.incomplete_months, 0);
});

test("a device installed mid-year does not make earlier months overdue (#79)", () => {
  // นี่คือ issue #79 ทั้งใบ: เดิมตัวส่วนเป็นค่าเดียวใช้ทั้งปี การเพิ่มเครื่องที่ 3
  // กลางเดือน ธ.ค. จึงทำให้ ต.ค. และ พ.ย. ที่กรอกครบไปแล้วกลายเป็นค้างย้อนหลัง
  const requiredByMonth = new Map(fyMonths.map((m) => [m, m >= "2025-12" ? 3 : 2]));
  const filledByMonth = new Map([
    ["2025-10", 2],
    ["2025-11", 2],
    ["2025-12", 3],
  ]);

  const { coverage, incompleteMonths } = computeCoverage({
    fyMonths,
    filledByMonth,
    requiredByMonth,
    today: "2026-01",
  });

  assert.deepEqual(incompleteMonths, []);
  assert.equal(coverage.complete_months, 3);
  assert.equal(coverage.months[0].required_devices, 2);
  assert.equal(coverage.months[2].required_devices, 3);
});

test("unverified devices make completeness indeterminate, not complete and not overdue", () => {
  // ADR-0018 Q19/Q21 — ห้ามสรุปทั้งสองทางตราบใดที่ยังมีเครื่องที่ไม่ได้ตรวจ
  const { coverage, incompleteMonths } = computeCoverage({
    fyMonths,
    filledByMonth: sameEveryMonth(5),
    requiredByMonth: sameEveryMonth(5),
    unverifiedByMonth: sameEveryMonth(4),
    unreviewedDevices: 4,
    today: "2026-01",
  });

  assert.equal(coverage.verifiable, false);
  assert.equal(coverage.unreviewed_devices, 4);
  assert.equal(coverage.indeterminate_months, 3); // ต.ค. พ.ย. ธ.ค. จบไปแล้ว
  assert.equal(coverage.annual_complete_months, 0, "ห้ามประกาศว่าครบทั้งที่ยังตรวจไม่ครบ");
  assert.equal(coverage.incomplete_months, 0, "ห้ามประกาศว่าค้างทั้งที่ยังตรวจไม่ครบ");
  assert.deepEqual(incompleteMonths, [], "เดือนที่ยืนยันไม่ได้ต้องไม่ถูกส่งไปเป็นงานค้าง");
  assert.equal(coverage.applicable, true, "ยังมีงานให้ทำอยู่ — คือไปตรวจยืนยัน");
});

test("verifying only the present leaves the past indeterminate, never 'nothing was due' (Q21)", () => {
  // ผู้ดูแลยืนยันว่า "ตอนนี้ติดตั้งอยู่" ตั้งแต่ ม.ค. เป็นต้นไป แต่ย้อนหลังไม่มีเอกสาร
  // เดือน ต.ค.–ธ.ค. จึงไม่มีช่วงครอบคลุม (required = 0) — ถ้าไม่มีธงยืนยันรายเดือน
  // สามเดือนนั้นจะกลายเป็น "ไม่มีอะไรต้องกรอก" ซึ่งเป็นการสรุปแทนการบอกว่าไม่รู้
  const past = ["2025-10", "2025-11", "2025-12"];
  const { coverage } = computeCoverage({
    fyMonths,
    filledByMonth: new Map(),
    requiredByMonth: new Map(fyMonths.map((m) => [m, past.includes(m) ? 0 : 5])),
    unverifiedByMonth: new Map(fyMonths.map((m) => [m, past.includes(m) ? 5 : 0])),
    unreviewedDevices: 0,
    today: "2026-02",
  });

  assert.equal(coverage.months[0].status, "indeterminate");
  assert.equal(coverage.months[2].status, "indeterminate");
  assert.notEqual(coverage.months[0].status, "not_applicable");
  // ม.ค. ยืนยันได้แล้วและยังไม่มีใครกรอก — ต้องขึ้นเป็นงานค้างจริง
  assert.equal(coverage.months[3].status, "overdue");
  assert.equal(coverage.verifiable, false);
});

test("verified scope reports real numbers again once nothing is left unverified", () => {
  const { coverage } = computeCoverage({
    fyMonths,
    filledByMonth: sameEveryMonth(5),
    requiredByMonth: sameEveryMonth(5),
    unverifiedByMonth: sameEveryMonth(0),
    today: "2026-01",
  });

  assert.equal(coverage.verifiable, true);
  assert.equal(coverage.indeterminate_months, 0);
  assert.equal(coverage.complete_months, 3);
});

test("readings kept from a closed period never push a month past its denominator", () => {
  // Q21 ให้เก็บยอดดิบของเครื่องที่ปลดระวางไว้ ตัวเศษจึงโตกว่าตัวส่วนได้จริง
  const { coverage } = computeCoverage({
    fyMonths,
    filledByMonth: sameEveryMonth(20),
    requiredByMonth: sameEveryMonth(18),
    today: "2025-12",
  });

  assert.equal(coverage.months[0].filled_devices, 18);
  assert.equal(coverage.months[0].missing_devices, 0);
  assert.equal(coverage.complete_months, 2);
});

test("English dates use Gregorian years without changing fiscal periods", () => {
  assert.equal(formatMonth("2568-10", { locale: "en" }), "Oct 2025");
  assert.equal(formatFiscalYear(2569, "en"), "2026 (B.E. 2569)");
  assert.equal(formatMonth("2025-10"), "ต.ค. 2568");
  assert.equal(formatDate("2026-09-08", "en"), "8 Sept 2026");
});
