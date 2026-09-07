// apps/api/test/shared.test.js
//
// เทสของชั้นพื้นฐานที่ทุก feature พึ่งพา — รูปแบบข้อผิดพลาด และการตรวจข้อมูลขาเข้า
//
// สองเรื่องนี้ถ้าพังจะพังพร้อมกันทั้งระบบและพังแบบเงียบๆ: การตรวจที่หลวมไป
// หนึ่งจุดทำให้ข้อมูลเสียเข้าฐานข้อมูลโดยไม่มีใครรู้จนกว่าจะไปเห็นตอนออกรายงาน
//
// รัน: npm test --workspace @suth/api

const test = require("node:test");
const assert = require("node:assert/strict");
const { z } = require("zod");

const {
  ApiError,
  badRequest,
  notFound,
  conflict,
  fromDatabaseError,
} = require("../src/shared/http-error");

const {
  validate,
  idParam,
  optionalId,
  optionalMoney,
  optionalText,
  monthString,
  monthListQuery,
} = require("../src/shared/validate");

// ------------------------------------------------------------------
// ตัวช่วย
// ------------------------------------------------------------------

/** เรียก middleware แล้วคืนสิ่งที่มันทำ — ผ่านไป หรือส่ง error ต่อ */
function run(middleware, req) {
  let error = null;
  let passed = false;

  middleware(req, {}, (err) => {
    if (err) error = err;
    else passed = true;
  });

  return { error, passed, req };
}

/** สร้าง request ปลอมที่มี query เป็น getter เหมือน Express 5 */
function makeReq({ body, query, params } = {}) {
  const req = { body: body ?? {}, params: params ?? {} };

  // Express 5 ทำให้ req.query เป็น getter ที่กำหนดค่าทับตรงๆ ไม่ได้ — validate()
  // ต้องใช้ Object.defineProperty เขียนผลลัพธ์กลับ เทสจึงต้องจำลองสภาพเดียวกัน
  // ไม่งั้นเทสจะผ่านทั้งที่ของจริงพัง
  Object.defineProperty(req, "query", {
    get: () => query ?? {},
    configurable: true,
  });

  return req;
}

// ==================================================================
// รูปแบบข้อผิดพลาด (RFC 9457)
// ==================================================================

test("ApiError แปลงเป็น Problem Details ที่มีครบทุกช่องที่จำเป็น", () => {
  const problem = badRequest("ข้อมูลไม่ถูกต้อง", { detail: "อธิบายเพิ่ม" }).toProblem();

  assert.equal(problem.type, "about:blank");
  assert.equal(problem.title, "ข้อมูลไม่ถูกต้อง");
  assert.equal(problem.status, 400);
  assert.equal(problem.code, "bad_request");
  assert.equal(problem.detail, "อธิบายเพิ่ม");
});

test("ช่องที่ไม่มีค่าต้องไม่โผล่ในคำตอบเป็น null เปล่าๆ", () => {
  const problem = notFound().toProblem();

  assert.equal("detail" in problem, false, "detail ที่ไม่ได้ระบุต้องไม่ถูกส่งออกไป");
  assert.equal("errors" in problem, false);
});

test("code แยกจาก title เพื่อให้ฝั่งเว็บเทียบได้โดยไม่ต้องอ่านข้อความ", () => {
  // ข้อความภาษาไทยเปลี่ยนได้ตลอด แต่ code คือสัญญาที่โค้ดฝั่งเว็บพึ่งพา
  assert.equal(conflict("อะไรก็ได้").code, "conflict");
  assert.equal(notFound("อะไรก็ได้").code, "not_found");
});

// ------------------------------------------------------------------
// การแปลง error ของ MySQL
//
// ตรงนี้คือจุดที่กันไม่ให้ข้อความอย่าง "Duplicate entry 'x' for key
// 'devices.serial_number'" หลุดออกไปถึงเบราว์เซอร์ ซึ่งบอกชื่อตารางและชื่อคีย์
// ให้คนนอกฟรีๆ
// ------------------------------------------------------------------

test("ชื่อซ้ำกลายเป็น 409 ไม่ใช่ 500", () => {
  const problem = fromDatabaseError({ code: "ER_DUP_ENTRY", message: "Duplicate entry 'A1' for key 'x'" });

  assert.equal(problem.status, 409);
  assert.equal(problem.code, "conflict");
  assert.equal(
    problem.toProblem().detail.includes("devices"),
    false,
    "ห้ามให้ชื่อตารางจาก MySQL หลุดออกไปในคำตอบ"
  );
});

test("ลบของที่ยังมีคนอ้างถึงกลายเป็น 409 พร้อมบอกวิธีแก้", () => {
  for (const code of ["ER_ROW_IS_REFERENCED", "ER_ROW_IS_REFERENCED_2"]) {
    const problem = fromDatabaseError({ code });
    assert.equal(problem.status, 409);
    assert.equal(problem.code, "still_referenced");
  }
});

test("อ้างถึง id ที่ไม่มีอยู่กลายเป็น 400 เพราะเป็นความผิดของข้อมูลที่ส่งมา", () => {
  const problem = fromDatabaseError({ code: "ER_NO_REFERENCED_ROW_2" });

  assert.equal(problem.status, 400, "ไม่ใช่ 500 — ผู้ใช้เลือกของที่ถูกลบไปแล้ว");
  assert.equal(problem.code, "invalid_reference");
});

test("error ที่ไม่รู้จักต้องคืน null เพื่อให้ถูกจัดการเป็นบั๊กของเรา", () => {
  assert.equal(fromDatabaseError({ code: "ER_SOMETHING_NEW" }), null);
  assert.equal(fromDatabaseError(new Error("boom")), null);
  assert.equal(fromDatabaseError(undefined), null);
});

// ==================================================================
// การตรวจข้อมูลขาเข้า
// ==================================================================

test("รหัสจาก URL ต้องถูกแปลงเป็นเลขจำนวนเต็มบวก", () => {
  const middleware = validate({ params: idParam });

  const ok = run(middleware, makeReq({ params: { id: "42" } }));
  assert.equal(ok.passed, true);
  assert.equal(ok.req.params.id, 42, "ต้องเป็นเลข ไม่ใช่ string");

  for (const bad of ["abc", "-1", "0", "1 OR 1=1", ""]) {
    assert.equal(run(middleware, makeReq({ params: { id: bad } })).passed, false, `"${bad}" ต้องไม่ผ่าน`);
  }
});

test("ตรวจทุกช่องให้ครบก่อนตอบ ไม่หยุดที่ช่องแรกที่ผิด", () => {
  const middleware = validate({
    body: z.object({ a: z.string().min(1, "ต้องกรอก a"), b: z.string().min(1, "ต้องกรอก b") }),
  });

  const { error } = run(middleware, makeReq({ body: { a: "", b: "" } }));

  // ผู้ใช้ต้องเห็นทุกช่องที่ต้องแก้ในรอบเดียว ไม่ใช่แก้ทีละช่องแล้วกดบันทึกใหม่
  assert.equal(error.errors.length, 2);
  assert.deepEqual(
    error.errors.map((e) => e.field),
    ["a", "b"]
  );
});

test("ข้อผิดพลาดของ query ติดคำนำหน้าไว้ แต่ของ body ไม่ติด", () => {
  const middleware = validate({
    query: z.object({ page: z.coerce.number().int().positive() }),
  });

  const { error } = run(middleware, makeReq({ query: { page: "ศูนย์" } }));

  // ช่องของฟอร์มอยู่ใน body เกือบทั้งหมด การเติม "body." นำหน้าทุกช่องจะบังคับให้
  // ฝั่งเว็บต้องมาตัดคำนำหน้าออกเองก่อนเอาไปวางใต้ช่องกรอก
  assert.equal(error.errors[0].field, "query.page");
});

test("ค่าที่ผ่านการตรวจแล้วถูกเขียนกลับลง req ให้ handler ใช้ค่าสะอาด", () => {
  const middleware = validate({ body: z.object({ name: z.string().trim() }) });
  const { req } = run(middleware, makeReq({ body: { name: "  มีช่องว่าง  " } }));

  assert.equal(req.body.name, "มีช่องว่าง");
});

// ------------------------------------------------------------------
// ชิ้นส่วนที่ใช้ซ้ำ — จุดที่เคยทำให้ฟอร์มบันทึกไม่ผ่านทั้งที่ข้อมูลถูก
// ------------------------------------------------------------------

test("รหัสอ้างอิงที่ไม่ได้เลือก กลายเป็น null ไม่ใช่ NaN", () => {
  const schema = z.object({ brand_id: optionalId });

  // ฟอร์มฝั่งเว็บส่ง "" มาเมื่อผู้ใช้ไม่ได้เลือก และส่ง "3" เมื่อเลือกแล้ว
  assert.equal(schema.parse({ brand_id: "" }).brand_id, null);
  assert.equal(schema.parse({ brand_id: null }).brand_id, null);
  assert.equal(schema.parse({}).brand_id, null);
  assert.equal(schema.parse({ brand_id: "3" }).brand_id, 3);
  assert.equal(schema.parse({ brand_id: 3 }).brand_id, 3);
});

test("ราคาต้องไม่ติดลบ และค่าว่างต้องเป็น null ไม่ใช่ 0", () => {
  const schema = z.object({ price: optionalMoney });

  assert.equal(schema.parse({ price: "" }).price, null, "ไม่กรอกราคา ต่างจากกรอกราคา 0");
  assert.equal(schema.parse({ price: "1.25" }).price, 1.25);
  assert.equal(schema.parse({ price: 0 }).price, 0);
  assert.throws(() => schema.parse({ price: "-1" }));
});

test("ข้อความที่ไม่บังคับ: ช่องว่างล้วนต้องกลายเป็น null", () => {
  const schema = z.object({ location: optionalText(50) });

  // ถ้าปล่อยให้เป็น string ว่าง ฐานข้อมูลจะเก็บ "" ซึ่งต่างจาก NULL ในการ query
  // แล้วเงื่อนไข "IS NULL" ของรายงานจะมองข้ามแถวเหล่านั้นไป
  assert.equal(schema.parse({ location: "   " }).location, null);
  assert.equal(schema.parse({}).location, null);
  assert.equal(schema.parse({ location: " ห้อง 301 " }).location, "ห้อง 301");
});

test("เดือนรับได้ทั้ง พ.ศ. และ ค.ศ. แต่เก็บเป็น ค.ศ. เสมอ (ADR-0002)", () => {
  const schema = z.object({ month: monthString });

  assert.equal(schema.parse({ month: "2568-10" }).month, "2025-10");
  assert.equal(schema.parse({ month: "2025-10" }).month, "2025-10");
  assert.equal(schema.parse({ month: "2568-1" }).month, "2025-01", "เดือนหลักเดียวต้องถูกเติม 0 ให้");
  assert.throws(() => schema.parse({ month: "ตุลาคม" }));
  assert.throws(() => schema.parse({ month: "2025-13" }));
});

test("รายชื่อเดือนคั่นด้วย comma คืน array เสมอ และตัดตัวซ้ำหลังแปลงแล้ว", () => {
  const schema = z.object({ month: monthListQuery });

  assert.deepEqual(schema.parse({}).month, []);
  assert.deepEqual(schema.parse({ month: "2025-10" }).month, ["2025-10"]);
  assert.deepEqual(schema.parse({ month: "2025-10,2025-11" }).month, ["2025-10", "2025-11"]);

  // "2568-10" กับ "2025-10" คือเดือนเดียวกันหลังแปลง — ถ้าไม่ตัดซ้ำ เงื่อนไข
  // IN (?) จะมีค่าซ้ำและทำให้อ่าน SQL ที่ log ไว้แล้วสับสน
  assert.deepEqual(schema.parse({ month: "2568-10,2025-10" }).month, ["2025-10"]);
});
