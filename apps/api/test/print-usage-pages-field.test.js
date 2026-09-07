// apps/api/test/print-usage-pages-field.test.js
//
// เทสของการตรวจ "จำนวนหน้า" ที่รับเข้ามาทุกเส้นทางของการบันทึกยอดพิมพ์
//
// ## บั๊กที่เทสชุดนี้มีไว้กัน
//
// `pagesField` เคยเขียนเป็น union แบบนี้
//
//   z.union([ z.coerce.number()..., z.literal(""), z.null(), z.undefined() ])
//
// ซึ่ง **ผิดแบบเงียบสนิท** เพราะ union ไล่ลองตามลำดับ และ `z.coerce.number()`
// รับ `null` ได้ (`Number(null) === 0`) กับ `""` ได้ (`Number("") === 0`)
// มันจึงชนะตั้งแต่ตัวแรก ทำให้ `z.null()` ไม่เคยถูกใช้เลย
//
// ผลคือ **การล้างยอดที่บันทึกไว้ทำไม่ได้ทั้งระบบ** — ส่ง null ไปได้ 0 กลับมา
//
//   0     = อ่านมิเตอร์แล้ว เดือนนั้นไม่ได้พิมพ์  -> นับว่า "กรอกแล้ว"
//   null  = ยังไม่ได้อ่าน / ขอลบที่กรอกไว้ทิ้ง    -> นับว่า "ยังไม่กรอก"
//
// และเพราะ 0 นับว่ากรอกแล้ว เดือนที่ผู้ใช้ตั้งใจล้างจะกลายเป็น "ครบแล้ว"
// บนแดชบอร์ด — ระบบรายงานว่างานเสร็จทั้งที่ข้อมูลเพิ่งถูกลบไป
//
// เป็นบั๊กตระกูลเดียวกับ `optionalMoney` ที่เคยทำให้ "ไม่กรอกราคา" กลายเป็น
// "ราคา 0 บาท" — ทั้งคู่เกิดจาก z.coerce กลืนค่าว่างและ null
//
// รัน: npm test --workspace @suth/api

const test = require("node:test");
const assert = require("node:assert/strict");
const { MAX_PAGES_PER_MONTH } = require("@suth/domain");

// ใช้ schema **ตัวจริง** ที่ routes.js ใช้ ไม่ใช่สำเนาที่เขียนขึ้นในเทส —
// สำเนาจะผ่านเสมอแม้ของจริงจะพัง ซึ่งเป็นเทสที่ให้ความมั่นใจผิดๆ
const { pagesField } = require("../src/print-usage/routes");

const parse = (input) => pagesField.safeParse(input);

test("จำนวนหน้าที่รับเข้ามา (pagesField)", async (t) => {
  await t.test("null คือ 'ล้างค่าทิ้ง' ห้ามกลายเป็น 0 เด็ดขาด", () => {
    const result = parse(null);
    assert.equal(result.success, true);
    assert.equal(result.data, null, "null กลายเป็น 0 = ล้างยอดไม่ได้ทั้งระบบ");
  });

  await t.test("ช่องว่างก็คือ 'ล้างค่าทิ้ง' เหมือนกัน", () => {
    const result = parse("");
    assert.equal(result.success, true);
    assert.equal(result.data, null, '"" กลายเป็น 0 = ช่องที่ลบจนว่างถูกบันทึกเป็นศูนย์');
  });

  await t.test("ไม่ส่งค่ามาเลย = ไม่แตะเดือนนั้น", () => {
    assert.equal(parse(undefined).data, null);
  });

  await t.test("เลข 0 ที่ผู้ใช้พิมพ์เองต้องเป็น 0 จริง ไม่ใช่ null", () => {
    // นี่คือด้านกลับของกฎข้อบน — 0 ที่ตั้งใจพิมพ์แปลว่า "อ่านแล้ว ไม่ได้พิมพ์"
    // ต้องถูกบันทึกและนับว่ากรอกแล้ว
    const result = parse(0);
    assert.equal(result.success, true);
    assert.equal(result.data, 0);
  });

  await t.test('สตริง "0" จากฟอร์มก็ต้องเป็น 0 ไม่ใช่ null', () => {
    assert.equal(parse("0").data, 0);
  });

  await t.test("ตัวเลขปกติผ่านทั้งแบบตัวเลขและแบบสตริง", () => {
    assert.equal(parse(1500).data, 1500);
    assert.equal(parse("1500").data, 1500);
  });

  await t.test("ค่าติดลบต้องถูกปฏิเสธ", () => {
    assert.equal(parse(-1).success, false);
  });

  await t.test("ทศนิยมต้องถูกปฏิเสธ — มิเตอร์นับเป็นแผ่น ไม่มีครึ่งแผ่น", () => {
    assert.equal(parse(12.5).success, false);
  });

  await t.test("ค่าที่สูงผิดปกติต้องถูกปฏิเสธ (คนกรอกเลขมิเตอร์สะสมมาแทนยอดเดือน)", () => {
    assert.equal(parse(MAX_PAGES_PER_MONTH + 1).success, false);
  });

  await t.test("ข้อความที่ไม่ใช่ตัวเลขต้องถูกปฏิเสธ", () => {
    assert.equal(parse("ไม่มีข้อมูล").success, false);
  });
});

test("โครงสร้างของ pagesField ในโค้ดจริง", async (t) => {
  await t.test("ต้องใช้ preprocess และห้ามให้ z.coerce มาก่อน z.null()", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const source = fs.readFileSync(
      path.join(__dirname, "../src/print-usage/routes.js"),
      "utf8"
    );

    const start = source.indexOf("const pagesField");
    assert.ok(start >= 0, "หา pagesField ในไฟล์ไม่เจอ");
    const block = source.slice(start, start + 1600);

    assert.match(
      block,
      /z\s*\.\s*preprocess\(\s*blankToNull/,
      "pagesField ต้องผ่าน blankToNull ก่อนเสมอ ไม่งั้น null/'' จะถูก z.coerce กลืนเป็น 0"
    );

    // ถ้ามี union ต้องให้ z.null() มาก่อน z.coerce.number() เสมอ
    const nullIndex = block.indexOf("z.null()");
    const coerceIndex = block.indexOf("z.coerce");
    if (nullIndex >= 0 && coerceIndex >= 0) {
      assert.ok(
        nullIndex < coerceIndex,
        "z.null() ต้องอยู่ก่อน z.coerce.number() ใน union ไม่งั้น null จะถูกแปลงเป็น 0"
      );
    }
  });
});
