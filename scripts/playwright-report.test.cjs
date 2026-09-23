const assert = require("node:assert/strict");
const test = require("node:test");
const { assertRequiredCoverage } = require("./playwright-report.cjs");

test("required suite accepts completed tests", () => {
  assert.match(assertRequiredCoverage({ stats: { expected: 2, skipped: 0 }, suites: [] }, "fixture"), /ผ่าน 2 เคส, ข้าม 0/);
});

test("required suite names skipped tests and their reasons", () => {
  const report = {
    stats: { expected: 1, skipped: 1 },
    suites: [{ title: "monthly", specs: [{ title: "saves a reading", tests: [{ status: "skipped", annotations: [{ type: "skip", description: "missing seed" }] }] }] }],
  };
  assert.throws(() => assertRequiredCoverage(report, "db"), /monthly › saves a reading — missing seed/);
});

test("required suite rejects empty or malformed reports", () => {
  assert.throws(() => assertRequiredCoverage({ stats: { expected: 0, skipped: 0 } }, "fixture"), /ผ่าน 0/);
  assert.throws(() => assertRequiredCoverage({ stats: {} }, "fixture"), /ไม่มีจำนวนเคส/);
});
