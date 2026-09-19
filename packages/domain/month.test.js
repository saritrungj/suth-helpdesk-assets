const assert = require("node:assert/strict");
const { test } = require("node:test");
const { recentMonths } = require("./index.cjs");

test("recentMonths crosses the calendar year in chronological order", () => {
  assert.deepEqual(recentMonths("2026-01"), ["2025-11", "2025-12", "2026-01"]);
});

test("recentMonths crosses the fiscal-year boundary without skipping September", () => {
  assert.deepEqual(recentMonths("2026-10"), ["2026-08", "2026-09", "2026-10"]);
});

test("recentMonths supports spans longer than a calendar year", () => {
  assert.deepEqual(recentMonths("2026-01", 14), [
    "2024-12", "2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06",
    "2025-07", "2025-08", "2025-09", "2025-10", "2025-11", "2025-12", "2026-01",
  ]);
});

test("ESM and CommonJS expose the same month calculation", async () => {
  const domain = await import("./index.mjs");
  assert.equal(domain.recentMonths, recentMonths);
});
