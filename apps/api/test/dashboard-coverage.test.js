// apps/api/test/dashboard-coverage.test.js
//
// เทสของการนับ "ความครบถ้วนของข้อมูล" บนแดชบอร์ด
//
// ## ทำไมตรรกะสั้นๆ นี้ต้องมีเทสของตัวเอง
//
// เพราะมันผิดแล้ว **เงียบ** — ผลลัพธ์ที่ผิดยังเป็นตัวเลขที่ดูสมเหตุสมผลทุกประการ
// ไม่มี error ไม่มีหน้าขาว มีแค่ตัวเลขที่คนเอาไปตัดสินใจต่อโดยไม่รู้ว่าผิด
//
// บั๊กจริงที่เคยเกิดและเป็นที่มาของไฟล์นี้: หน้าเว็บเอา `reporting_active_devices`
// (จำนวนเครื่องที่มียอดอย่างน้อยหนึ่งเดือน) มาแสดงใต้ป้าย "ความครบถ้วนของข้อมูล"
// ทำให้ขึ้นว่า "18/18 กรอกครบแล้ว" พร้อมกับแผงข้างๆ ที่บอกว่า "ยังกรอกไม่ครบ
// 5 เดือน" อยู่บนจอเดียวกัน
//
// รัน: npm test --workspace @suth/api

const test = require("node:test");
const assert = require("node:assert/strict");

const { computeCoverage } = require("../src/dashboard/overview");

/** ปีงบไทย ต.ค. 2568 – ก.ย. 2569 เก็บเป็น ค.ศ. ตาม ADR-0002 */
const FY_MONTHS = [
  "2025-10", "2025-11", "2025-12",
  "2026-01", "2026-02", "2026-03",
  "2026-04", "2026-05", "2026-06",
  "2026-07", "2026-08", "2026-09",
];

/** ทุกเดือนที่ระบุกรอกครบ เดือนที่ไม่ระบุถือว่าไม่มีใครกรอกเลย */
function filled(map) {
  return new Map(Object.entries(map));
}

test("ความครบถ้วนของข้อมูล (computeCoverage)", async (t) => {
  await t.test("เดือนปัจจุบันไม่นับเป็นงานค้าง เพราะยังอ่านมิเตอร์ปิดยอดไม่ได้", () => {
    // อยู่เดือน ก.ย. 2569 = เดือนสุดท้ายของปีงบ ผ่านไปแล้ว 11 เดือน ไม่ใช่ 12
    const { coverage } = computeCoverage({
      fyMonths: FY_MONTHS,
      filledByMonth: filled({}),
      activeDevices: 18,
      today: "2026-09",
    });

    assert.equal(coverage.elapsed_months, 11);
  });

  await t.test("นับเดือนที่กรอกครบทุกเครื่องเท่านั้น กรอกไม่ครบไม่นับ", () => {
    const { coverage, incompleteMonths } = computeCoverage({
      fyMonths: FY_MONTHS,
      filledByMonth: filled({
        "2025-10": 18, // ครบ
        "2025-11": 18, // ครบ
        "2025-12": 17, // ขาดหนึ่งเครื่อง — ยังไม่ครบ
        "2026-01": 18, // ครบ
      }),
      activeDevices: 18,
      today: "2026-03",
    });

    // ผ่านไปแล้ว 5 เดือน (ต.ค.–ก.พ.) ครบ 3 เดือน
    assert.equal(coverage.elapsed_months, 5);
    assert.equal(coverage.complete_months, 3);
    assert.equal(coverage.incomplete_months, 2);
    assert.deepEqual(incompleteMonths, ["2025-12", "2026-02"]);
  });

  await t.test("กรอกครบทุกเดือนที่ถึงกำหนดแล้ว = ไม่มีอะไรค้าง", () => {
    const { coverage, incompleteMonths } = computeCoverage({
      fyMonths: FY_MONTHS,
      filledByMonth: filled({ "2025-10": 5, "2025-11": 5 }),
      activeDevices: 5,
      today: "2025-12",
    });

    assert.equal(coverage.complete_months, 2);
    assert.equal(coverage.incomplete_months, 0);
    assert.deepEqual(incompleteMonths, []);
  });

  await t.test("ยังไม่ถึงปีงบนี้ = ยังไม่มีเดือนไหนถึงกำหนด ไม่ใช่ค้างทั้งปี", () => {
    // อยู่ก่อนเดือนแรกของปีงบ — ระบบต้องไม่เตือนงานที่ยังไม่เริ่ม
    const { coverage } = computeCoverage({
      fyMonths: FY_MONTHS,
      filledByMonth: filled({}),
      activeDevices: 18,
      today: "2025-09",
    });

    assert.equal(coverage.elapsed_months, 0);
    assert.equal(coverage.incomplete_months, 0);
  });

  await t.test("ไม่มีเครื่องที่ใช้งานอยู่เลย = ไม่มีอะไรให้กรอก ไม่ใช่ค้างทุกเดือน", () => {
    const { coverage } = computeCoverage({
      fyMonths: FY_MONTHS,
      filledByMonth: filled({}),
      activeDevices: 0,
      today: "2026-03",
    });

    assert.equal(coverage.incomplete_months, 0);
  });

  await t.test("กรอกเกินจำนวนเครื่องที่ใช้งานอยู่ ยังถือว่าครบ ไม่ติดลบ", () => {
    // เกิดได้จริงเมื่อมีเครื่องที่ถูกปลดระวางหลังจากกรอกยอดของเดือนนั้นไปแล้ว —
    // จำนวนที่กรอกจึงมากกว่าจำนวนเครื่องที่ยัง active อยู่ตอนนี้
    const { coverage } = computeCoverage({
      fyMonths: FY_MONTHS,
      filledByMonth: filled({ "2025-10": 20, "2025-11": 20 }),
      activeDevices: 18,
      today: "2025-12",
    });

    assert.equal(coverage.complete_months, 2);
    assert.equal(coverage.incomplete_months, 0);
  });
});
