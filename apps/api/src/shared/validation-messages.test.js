// apps/api/src/shared/validation-messages.test.js — ข้อความตรวจข้อมูลต้องเป็นภาษาไทยเสมอ (#257)

const test = require("node:test");
const assert = require("node:assert/strict");
const { z } = require("zod");

const { thaiMessage } = require("./validation-messages");

const messages = (schema, value) => {
  const result = schema.safeParse(value);
  assert.equal(result.success, false);
  return result.error.issues.map(thaiMessage);
};

const NO_ENGLISH = /^[^A-Za-z]*$/;

test("ข้อความไทยที่ schema เขียนเองไม่ถูกแตะ", () => {
  assert.deepEqual(messages(z.object({ name: z.string().min(1, "กรอกชื่อก่อน") }), { name: "" }), ["กรอกชื่อก่อน"]);
});

test("ไม่ส่งช่องมา หรือส่ง null = จำเป็นต้องกรอก", () => {
  assert.deepEqual(messages(z.object({ name: z.string() }), {}), ["จำเป็นต้องกรอก"]);
  assert.deepEqual(messages(z.object({ name: z.string() }), { name: null }), ["จำเป็นต้องกรอก"]);
  // กรณีจริงจากหน้าแก้ไขผู้ใช้: union ที่ไม่มี .optional()
  assert.deepEqual(messages(z.object({ p: z.union([z.string(), z.literal("")]).transform((v) => v) }), {}).every((m) => NO_ENGLISH.test(m)), true);
});

test("ชนิดผิด ตัวเลขน้อยหรือมากเกิน และความยาว", () => {
  assert.deepEqual(messages(z.object({ n: z.number() }), { n: "x" }), ["ชนิดของข้อมูลไม่ถูกต้อง"]);
  assert.deepEqual(messages(z.object({ n: z.coerce.number().int().positive() }), { n: 0 }), ["ต้องมากกว่า 0"]);
  assert.deepEqual(messages(z.object({ n: z.number().min(1).max(12) }), { n: 13 }), ["ต้องไม่เกิน 12"]);
  assert.deepEqual(messages(z.object({ s: z.string().min(6) }), { s: "abc" }), ["ต้องมีอย่างน้อย 6 ตัวอักษร"]);
  assert.deepEqual(messages(z.object({ s: z.string().max(3) }), { s: "abcdef" }), ["ต้องไม่เกิน 3 ตัวอักษร"]);
  assert.deepEqual(messages(z.object({ a: z.array(z.number()).min(1) }), { a: [] }), ["ต้องมีอย่างน้อย 1 รายการ"]);
});

test("ตัวเลือกและรูปแบบ", () => {
  assert.deepEqual(messages(z.object({ role: z.enum(["admin", "staff"]) }), { role: "root" }), ["ค่าที่เลือกไม่อยู่ในตัวเลือกที่ใช้ได้"]);
  assert.deepEqual(messages(z.object({ m: z.string().regex(/^\d{4}-\d{2}$/) }), { m: "x" }), ["รูปแบบไม่ถูกต้อง"]);
});

test("ไม่มีข้อความอังกฤษหลุดออกมาจากกฎทั่วไป", () => {
  const schema = z.object({
    a: z.string().email(), b: z.number().multipleOf(5), c: z.string().length(4), d: z.coerce.date(), e: z.boolean(),
  });
  for (const message of messages(schema, { a: "x", b: 3, c: "ab", d: "nope", e: "y" })) {
    assert.match(message, NO_ENGLISH, message);
  }
});
