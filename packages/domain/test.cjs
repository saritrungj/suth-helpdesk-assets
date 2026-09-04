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
  toSatang,
  fromSatang,
  billablePages,
  costSatang,
  effectivePriceSatang,
  sumSatang,
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
// การคิดเงิน — ต้องเป๊ะระดับสตางค์ ห้ามคลาด
// ------------------------------------------------------------------

test("toSatang แปลงราคาจาก string ของ DECIMAL ได้เป๊ะ", () => {
  assert.equal(toSatang("0.45"), 45);
  assert.equal(toSatang("0.40"), 40);
  assert.equal(toSatang("1.50"), 150);
  assert.equal(toSatang("12.34"), 1234);
  assert.equal(toSatang(0.35), 35);
});

test("toSatang ปัดครึ่งขึ้นเมื่อทศนิยมเกินสองตำแหน่ง", () => {
  assert.equal(toSatang("0.455"), 46);
  assert.equal(toSatang("0.454"), 45);
});

test("toSatang รับค่าว่างได้โดยไม่ระเบิด", () => {
  for (const empty of [null, undefined, "", "abc"]) {
    assert.equal(toSatang(empty), 0);
  }
});

test("หน้าสุทธิคือ 80% ของหน้าดิบ และมีเศษได้", () => {
  assert.equal(billablePages(3360), 2688);
  assert.equal(billablePages(1057), 845.6);
  assert.equal(billablePages(0), 0);
});

test("ค่าใช้จ่ายคำนวณเป็นจำนวนเต็มสตางค์ ไม่มีเศษลอยตัว", () => {
  // float เดิมให้ 1209.6000000000001
  assert.equal(costSatang(3360, "0.45"), 120960);
  assert.equal(fromSatang(costSatang(3360, "0.45")), 1209.6);
});

test("ค่าใช้จ่ายถูกต้องเมื่อหน้าสุทธิมีเศษ", () => {
  // 1057 x 0.8 x 0.40 = 845.6 x 0.40 = 338.24
  assert.equal(costSatang(1057, "0.40"), 33824);
  assert.equal(fromSatang(costSatang(1057, "0.40")), 338.24);
});

test("ไม่มีหน้าหรือไม่มีราคา ค่าใช้จ่ายต้องเป็นศูนย์", () => {
  assert.equal(costSatang(0, "0.45"), 0);
  assert.equal(costSatang(1000, null), 0);
  assert.equal(costSatang(1000, ""), 0);
});

test("ราคาเฉพาะเครื่องมีผลเหนือราคาตามสัญญา", () => {
  assert.equal(effectivePriceSatang("0.30", "0.45"), 30);
  assert.equal(effectivePriceSatang(null, "0.45"), 45);
  assert.equal(effectivePriceSatang("", "0.45"), 45);
  assert.equal(effectivePriceSatang(null, null), 0);
});

test("รวมเงินหลายรายการต้องไม่คลาดสะสม", () => {
  const one = costSatang(3360, "0.45");
  const total = sumSatang(Array(114).fill(one));
  assert.equal(total, 120960 * 114);
  assert.equal(fromSatang(total), 137894.4);

  // ยืนยันว่านี่คือสิ่งที่การบวก float ทำไม่ได้
  let asFloat = 0;
  for (let i = 0; i < 114; i++) asFloat += 1209.6;
  assert.notEqual(asFloat, 137894.4, "ถ้าข้อนี้ผ่านแปลว่า float ไม่คลาดแล้ว ลบเทสนี้ได้");
});

test("คำนวณเกินช่วงที่แม่นยำต้อง throw ไม่ใช่คืนค่าเพี้ยนเงียบๆ", () => {
  assert.throws(() => costSatang(Number.MAX_SAFE_INTEGER, "9999999.99"));
});

// ------------------------------------------------------------------

console.log(`\n@suth/domain — ผ่าน ${passed} เคส${failed ? `, ไม่ผ่าน ${failed} เคส` : ""}`);
process.exit(failed ? 1 : 0);
