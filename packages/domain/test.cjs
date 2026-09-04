// packages/domain/test.cjs
//
// เทสของกฎธุรกิจที่พังมาแล้วจริงในระบบนี้ — ปีงบคร่อมปี และเดือน พ.ศ./ค.ศ.
// ใช้ assert ของ Node ตรงๆ ไม่พึ่ง test framework เพื่อให้ `npm test` รันได้ทันที
// โดยไม่ต้องติดตั้งอะไรเพิ่ม เมื่อโปรเจกต์เลือก framework แล้วค่อยย้ายเคสเหล่านี้เข้าไป
//
// รัน: npm test --workspace @suth/domain   (หรือ npm test ที่ราก)

const assert = require("node:assert/strict");
const {
  normalizeMonth,
  toBuddhistMonth,
  parseMonths,
  getFiscalYearRange,
  fiscalYearMonths,
  formatMonthTH,
  formatDateTH,
  fiscalYearLabel,
} = require("./index.cjs");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (error) {
    failed += 1;
    console.error(`  ✗ ${name}\n    ${error.message.split("\n")[0]}`);
  }
}

// ------------------------------------------------------------------
// ปีงบประมาณไทย — ADR-0001
// ------------------------------------------------------------------

test("ปีงบ 2569 ครอบคลุม ต.ค. 2025 ถึง ก.ย. 2026", () => {
  assert.deepEqual(getFiscalYearRange(2569), { startMonth: "2025-10", endMonth: "2026-09" });
});

test("ปีงบคร่อมสองปีปฏิทินเสมอ ไม่ใช่ ม.ค.-ธ.ค. ปีเดียว", () => {
  const range = getFiscalYearRange(2568);
  assert.equal(range.startMonth, "2024-10");
  assert.equal(range.endMonth, "2025-09");
  assert.notEqual(range.startMonth.slice(0, 4), range.endMonth.slice(0, 4));
});

test("ปีงบที่ไม่ถูกต้องต้อง throw ไม่ใช่คืนค่ามั่ว", () => {
  assert.throws(() => getFiscalYearRange("ปีงบ"));
  assert.throws(() => getFiscalYearRange(100));
});

test("fiscalYearMonths คืน 12 เดือนเรียงจาก ต.ค. ถึง ก.ย.", () => {
  const months = fiscalYearMonths(getFiscalYearRange(2569));
  assert.equal(months.length, 12);
  assert.equal(months[0], "2025-10");
  assert.equal(months[2], "2025-12");
  assert.equal(months[3], "2026-01", "ต้องข้ามปีปฏิทินตรงรอยต่อ ธ.ค. -> ม.ค.");
  assert.equal(months[11], "2026-09");
});

test("fiscalYearMonths รับ null ได้โดยไม่ระเบิด", () => {
  assert.deepEqual(fiscalYearMonths(null), []);
  assert.deepEqual(fiscalYearMonths({}), []);
});

// ------------------------------------------------------------------
// เดือน พ.ศ. / ค.ศ. — ADR-0002
// ------------------------------------------------------------------

test("รับเดือน พ.ศ. แล้วแปลงเป็น ค.ศ.", () => {
  assert.equal(normalizeMonth("2568-10"), "2025-10");
  assert.equal(normalizeMonth("2569-03"), "2026-03");
});

test("รับเดือน ค.ศ. แล้วคืนค่าเดิม", () => {
  assert.equal(normalizeMonth("2025-10"), "2025-10");
});

test("พ.ศ. และ ค.ศ. ของเดือนเดียวกันต้อง normalize ได้ค่าเท่ากัน", () => {
  assert.equal(normalizeMonth("2568-10"), normalizeMonth("2025-10"));
});

test("เติมศูนย์หน้าเดือนหลักเดียว", () => {
  assert.equal(normalizeMonth("2568-1"), "2025-01");
  assert.equal(normalizeMonth("2025-7"), "2025-07");
});

test("รับรูปแบบที่คนไทยพิมพ์จริง", () => {
  assert.equal(normalizeMonth("2568/10"), "2025-10");
  assert.equal(normalizeMonth("10/2568"), "2025-10");
  assert.equal(normalizeMonth("  2568-10  "), "2025-10");
});

test("ค่าที่ผิดรูปแบบต้องได้ null ไม่ใช่เดาให้", () => {
  for (const bad of ["2568-13", "2568-0", "abc", "", "2025", "2025-10-01", null, undefined, "1899-01"]) {
    assert.equal(normalizeMonth(bad), null, `ควรได้ null สำหรับ ${JSON.stringify(bad)}`);
  }
});

test("toBuddhistMonth แปลงกลับเป็น พ.ศ. และทำซ้ำแล้วค่าไม่เพี้ยน", () => {
  assert.equal(toBuddhistMonth("2025-10"), "2568-10");
  assert.equal(toBuddhistMonth(toBuddhistMonth("2025-10")), "2568-10");
});

test("parseMonths แปลงทุกตัว ตัดตัวผิด และตัดตัวซ้ำหลังแปลง", () => {
  assert.deepEqual(parseMonths("2568-10,2025-10,2569-01, ,bogus,2568-11"), [
    "2025-10",
    "2026-01",
    "2025-11",
  ]);
  assert.deepEqual(parseMonths(""), []);
  assert.deepEqual(parseMonths(undefined), []);
});

test("ทุกเดือนของปีงบต้องอยู่ในช่วง start_month ถึง end_month จริง", () => {
  const range = getFiscalYearRange(2569);
  for (const month of fiscalYearMonths(range)) {
    assert.ok(
      month >= range.startMonth && month <= range.endMonth,
      `${month} หลุดออกนอกช่วงปีงบ — การเทียบ string ต้องใช้ได้เพราะรูปแบบเป็น YYYY-MM`
    );
  }
});

// ------------------------------------------------------------------
// การแสดงผลภาษาไทย
// ------------------------------------------------------------------

test("formatMonthTH แสดงเป็น พ.ศ. เสมอ ไม่ว่ารับ พ.ศ. หรือ ค.ศ.", () => {
  assert.equal(formatMonthTH("2025-10"), "ต.ค. 2568");
  assert.equal(formatMonthTH("2568-10"), "ต.ค. 2568");
  assert.equal(formatMonthTH("2026-01"), "ม.ค. 2569");
});

test("formatMonthTH แบบปีสองหลัก", () => {
  assert.equal(formatMonthTH("2025-10", { shortYear: true }), "ต.ค. 68");
});

test("formatDateTH แสดงวันที่เป็นไทย", () => {
  assert.equal(formatDateTH("2025-10-01"), "1 ต.ค. 2568");
  assert.equal(formatDateTH(""), "");
});

test("fiscalYearLabel อ่านเลขปีงบจากเดือนสิ้นสุด", () => {
  assert.equal(fiscalYearLabel(getFiscalYearRange(2569)), "2569");
  assert.equal(fiscalYearLabel(null), "-");
});

// ------------------------------------------------------------------

console.log(`\n@suth/domain — ผ่าน ${passed} เคส${failed ? `, ไม่ผ่าน ${failed} เคส` : ""}`);
process.exit(failed ? 1 : 0);
