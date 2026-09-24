// apps/api/src/import/meter-cycle.test.js — รอบมิเตอร์และการเปลี่ยนเครื่องจากรายงานของผู้ให้เช่า (#221)
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { detectCycles, detectReplacements, lastDayBefore } = require("./meter-cycle");

const sheet = (month, start, contract = "TEST 1/2569") => ({ month, period_start: start, contract_no: contract });
const slot = (month, n, serial, contract = "TEST 1/2569") => ({ month, slot: n, serial_number: serial, contract_no: contract });

test("รอบมิเตอร์อ่านจากวันเริ่มงวดที่พบบ่อยที่สุดของแต่ละสัญญา", () => {
  const cycles = detectCycles({
    sheets: [
      sheet("2026-03", "2026-02-24"), sheet("2026-04", "2026-03-24"), sheet("2026-05", "2026-04-25"),
      sheet("2026-05", "2026-05-01", "OTHER 2/2569"),
    ],
  });
  assert.deepEqual(cycles, [
    { contract_no: "TEST 1/2569", cycle_day: 24 },
    { contract_no: "OTHER 2/2569", cycle_day: 1 },
  ]);
});

test("งวดที่ไม่มีวันเริ่ม หรือวันเริ่มเกิน 28 ไม่ถูกนับเป็นรอบ", () => {
  assert.deepEqual(detectCycles({ sheets: [sheet("2026-03", null), sheet("2026-04", "2026-03-30")] }), []);
  assert.deepEqual(detectCycles(null), []);
});

test("ลำดับเดิมเปลี่ยนเลขเครื่อง และเครื่องเดิมหายไป = เปลี่ยนเครื่อง", () => {
  const found = detectReplacements({
    slots: [
      slot("2026-04", 1, "OLD-A"), slot("2026-04", 2, "SAME-B"),
      slot("2026-05", 1, "NEW-C"), slot("2026-05", 2, "SAME-B"),
      slot("2026-06", 1, "NEW-C"), slot("2026-06", 2, "SAME-B"),
    ],
  });
  assert.deepEqual(found, [{
    contract_no: "TEST 1/2569", slot: 1, old_serial: "OLD-A", new_serial: "NEW-C", from_month: "2026-05", last_month: "2026-04",
  }]);
});

test("สลับลำดับกันเฉยๆ ไม่ใช่การเปลี่ยนเครื่อง", () => {
  const found = detectReplacements({
    slots: [
      slot("2026-04", 1, "A"), slot("2026-04", 2, "B"),
      slot("2026-05", 1, "B"), slot("2026-05", 2, "A"),
    ],
  });
  assert.deepEqual(found, []);
});

test("คนละสัญญาไม่ปนกัน", () => {
  const found = detectReplacements({
    slots: [slot("2026-04", 1, "A"), slot("2026-05", 1, "B", "OTHER 2/2569")],
  });
  assert.deepEqual(found, []);
});

test("วันสุดท้ายของเดือนก่อนหน้า รวมข้ามปีและ ก.พ.", () => {
  assert.equal(lastDayBefore("2026-05"), "2026-04-30");
  assert.equal(lastDayBefore("2026-03"), "2026-02-28");
  assert.equal(lastDayBefore("2027-01"), "2026-12-31");
});
