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

const { dateFromParts, parseDayFirstDate } = require("./index.cjs");

test("dateFromParts แปลง พ.ศ. เป็น ค.ศ. และปฏิเสธวันที่ไม่มีจริงหรือปีนอกช่วง", () => {
  assert.equal(dateFromParts(2567, 10, 1), "2024-10-01");
  assert.equal(dateFromParts(2024, 9, 21), "2024-09-21");
  assert.equal(dateFromParts(2024, 2, 30), null);
  assert.equal(dateFromParts(25, 1, 1), null); // Date.UTC ตีปี 0–99 เป็น 19xx — ต้องไม่หลุด
});

test("parseDayFirstDate รับ วัน/เดือน/ปี 4 หลัก เท่านั้น", () => {
  assert.equal(parseDayFirstDate("21/09/2024"), "2024-09-21");
  assert.equal(parseDayFirstDate("1/10/2567"), "2024-10-01");
  assert.equal(parseDayFirstDate("9/21/24"), null); // ปี 2 หลักแบบสหรัฐ กำกวม ไม่เดา
  assert.equal(parseDayFirstDate("31/02/2024"), null);
});
