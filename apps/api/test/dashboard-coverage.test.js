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
// รอบที่สองคือ issue #79: ตัวส่วนเป็น "จำนวนเครื่องที่ใช้งานอยู่ตอนนี้" ค่าเดียว
// ใช้ทั้ง 12 เดือน การเพิ่มเครื่องใหม่กลางปีจึงทำให้เดือนที่กรอกครบไปแล้วกลายเป็น
// ค้างย้อนหลัง — ตอนนี้ตัวส่วนมาจากช่วงความรับผิดชอบจริงรายเดือน (ADR-0018)
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

/** เครื่องจำนวนเท่ากันทุกเดือน — รูปแบบที่พบบ่อยที่สุด ใช้เป็นฐานของเทสด้านล่าง */
function required(count) {
  return new Map(FY_MONTHS.map((month) => [month, count]));
}

test("ความครบถ้วนของข้อมูล (computeCoverage)", async (t) => {
  await t.test("เดือนปัจจุบันไม่นับเป็นงานค้าง เพราะยังอ่านมิเตอร์ปิดยอดไม่ได้", () => {
    // อยู่เดือน ก.ย. 2569 = เดือนสุดท้ายของปีงบ ผ่านไปแล้ว 11 เดือน ไม่ใช่ 12
    const { coverage } = computeCoverage({
      fyMonths: FY_MONTHS,
      filledByMonth: filled({}),
      requiredByMonth: required(18),
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
      requiredByMonth: required(18),
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
      requiredByMonth: required(5),
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
      requiredByMonth: required(18),
      today: "2025-09",
    });

    assert.equal(coverage.elapsed_months, 0);
    assert.equal(coverage.incomplete_months, 0);
  });

  await t.test("ไม่มีเครื่องที่ต้องกรอกเลย = ไม่มีอะไรให้กรอก ไม่ใช่ค้างทุกเดือน", () => {
    const { coverage } = computeCoverage({
      fyMonths: FY_MONTHS,
      filledByMonth: filled({}),
      requiredByMonth: required(0),
      today: "2026-03",
    });

    assert.equal(coverage.incomplete_months, 0);
    assert.equal(coverage.applicable, false);
  });

  await t.test("กรอกเกินจำนวนเครื่องที่ต้องกรอก ยังถือว่าครบ ไม่ติดลบ", () => {
    // เกิดได้จริงเมื่อมีเครื่องที่ปิดช่วงความรับผิดชอบหลังจากกรอกยอดของเดือนนั้น
    // ไปแล้ว — ยอดดิบยังต้องเก็บไว้ (Q21) ตัวเศษจึงมากกว่าตัวส่วนได้
    const { coverage } = computeCoverage({
      fyMonths: FY_MONTHS,
      filledByMonth: filled({ "2025-10": 20, "2025-11": 20 }),
      requiredByMonth: required(18),
      today: "2025-12",
    });

    assert.equal(coverage.complete_months, 2);
    assert.equal(coverage.incomplete_months, 0);
    assert.equal(coverage.months[0].missing_devices, 0);
  });

  await t.test("เพิ่มเครื่องกลางปีไม่ทำให้เดือนที่กรอกครบแล้วกลายเป็นค้าง (#79)", () => {
    // ตัวส่วนของ ต.ค.–พ.ย. ต้องเป็น 2 ต่อไป แม้ตอนนี้ทะเบียนจะมี 3 เครื่องแล้ว
    const requiredByMonth = new Map(
      FY_MONTHS.map((month) => [month, month >= "2025-12" ? 3 : 2])
    );

    const { coverage, incompleteMonths } = computeCoverage({
      fyMonths: FY_MONTHS,
      filledByMonth: filled({ "2025-10": 2, "2025-11": 2, "2025-12": 3 }),
      requiredByMonth,
      today: "2026-01",
    });

    assert.deepEqual(incompleteMonths, [], "เดือนที่กรอกครบแล้วต้องไม่กลับมาค้าง");
    assert.equal(coverage.complete_months, 3);
  });

  await t.test("ยังตรวจยืนยันไม่ครบ = ไม่ประกาศว่าครบ และไม่ประกาศว่าค้าง", () => {
    // ADR-0018 Q19/Q21 — ทั้ง "ครบ" และ "ค้าง" เป็นข้อสรุปที่หลักฐานยังไม่พอจะพูด
    const { coverage, incompleteMonths } = computeCoverage({
      fyMonths: FY_MONTHS,
      filledByMonth: filled({}),
      requiredByMonth: required(5),
      unverifiedByMonth: required(2),
      unreviewedDevices: 2,
      today: "2026-01",
    });

    assert.equal(coverage.verifiable, false);
    assert.equal(coverage.unreviewed_devices, 2);
    assert.equal(coverage.incomplete_months, 0);
    assert.equal(coverage.annual_complete_months, 0);
    assert.deepEqual(incompleteMonths, []);
    assert.equal(coverage.indeterminate_months, 3);
  });
});
