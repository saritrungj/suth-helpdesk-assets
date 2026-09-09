const { test } = require("node:test");
const assert = require("node:assert/strict");
const { computeCoverage, fiscalYearMonths, formatMonth, formatFiscalYear, formatDate } = require("./index.cjs");
const fyMonths = fiscalYearMonths({ startMonth: "2025-10", endMonth: "2026-09" });

test("annual completion and overdue work have distinct denominators", () => {
  const input = { fyMonths, filledByMonth: new Map(fyMonths.slice(0, 6).map((m) => [m, 18])), activeDevices: 18, today: "2026-09" };
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
  const input = { fyMonths, filledByMonth: new Map(), activeDevices: 1, today: "2026-10" };
  assert.equal(computeCoverage(input).coverage.incomplete_months, 12);
  const empty = computeCoverage({ ...input, activeDevices: 0 }).coverage;
  assert.equal(empty.applicable, false);
  assert.equal(empty.annual_complete_months, 0);
  assert.equal(empty.incomplete_months, 0);
});

test("English dates use Gregorian years without changing fiscal periods", () => {
  assert.equal(formatMonth("2568-10", { locale: "en" }), "Oct 2025");
  assert.equal(formatFiscalYear(2569, "en"), "2026 (B.E. 2569)");
  assert.equal(formatMonth("2025-10"), "ต.ค. 2568");
  assert.equal(formatDate("2026-09-08", "en"), "8 Sept 2026");
});
