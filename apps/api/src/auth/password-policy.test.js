// apps/api/src/auth/password-policy.test.js

const test = require("node:test");
const assert = require("node:assert/strict");

const { z } = require("zod");
const { passwordField, optionalPasswordField } = require("./password-policy");

const ok = (value) => passwordField.safeParse(value).success;

test("สั้นกว่า 6 ตัวอักษรไม่ผ่าน 6 ตัวขึ้นไปผ่าน", () => {
  assert.equal(ok("12345"), false);
  assert.equal(ok("123456"), true);
});

test("เพดานนับเป็นไบต์: ASCII 72 ตัวผ่าน 73 ตัวไม่ผ่าน", () => {
  assert.equal(ok("a".repeat(72)), true);
  assert.equal(ok("a".repeat(73)), false);
});

test("รหัสผ่านภาษาไทยที่เกิน 72 ไบต์ไม่ผ่าน แม้ไม่ถึง 72 ตัวอักษร — bcrypt จะตรวจแค่ 72 ไบต์แรก", () => {
  assert.equal(ok("ก".repeat(24)), true); // 72 ไบต์พอดี
  assert.equal(ok("ก".repeat(25)), false); // 75 ไบต์
});

test("ไม่ใช่ข้อความไม่ผ่าน", () => {
  assert.equal(ok(undefined), false);
  assert.equal(ok(123456), false);
});

// หน้าแก้ไขผู้ใช้ไม่ส่งคีย์ password เมื่อแก้เฉพาะสิทธิ์ — เดิมได้ 400 เพราะ union กับ z.undefined() ไม่ทำให้คีย์เป็น optional
test("แก้ไขผู้ใช้: ไม่ส่งคีย์ ค่าว่าง หรือ null = ไม่เปลี่ยนรหัส; ส่งรหัสมาต้องผ่านกฎเดียวกัน", () => {
  const body = z.object({ username: z.string(), password: optionalPasswordField });
  assert.equal(body.parse({ username: "a" }).password, null);
  assert.equal(body.parse({ username: "a", password: "" }).password, null);
  assert.equal(body.parse({ username: "a", password: null }).password, null);
  assert.equal(body.parse({ username: "a", password: "new-pass-1" }).password, "new-pass-1");
  assert.equal(body.safeParse({ username: "a", password: "123" }).success, false);
});
