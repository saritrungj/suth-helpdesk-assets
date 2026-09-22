// apps/api/src/auth/jwt-secret.test.js — ด่านกุญแจเซ็น token ตอนบูต (#139)

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { jwtSecretProblem, MIN_LENGTH } = require("./jwt-secret");

test("ไม่ตั้งค่าหรือค่าว่าง = ไม่เปิดเซิร์ฟเวอร์", () => {
  assert.match(jwtSecretProblem(undefined), /ยังไม่ได้ตั้ง/);
  assert.match(jwtSecretProblem(""), /ยังไม่ได้ตั้ง/);
});

test("ค่าตัวอย่างใน .env.example ถูกปฏิเสธ — อ่านจากไฟล์จริง ไม่ใช่สำเนา", () => {
  const example = fs.readFileSync(path.resolve(__dirname, "../../.env.example"), "utf8");
  const value = example.match(/^JWT_SECRET=(.*)$/m)[1].trim();
  assert.match(jwtSecretProblem(value), /ค่าตัวอย่าง/);
});

test("สั้นกว่าเกณฑ์ถูกปฏิเสธ ยาวพอผ่าน", () => {
  assert.match(jwtSecretProblem("x".repeat(MIN_LENGTH - 1)), /สั้นเกินไป/);
  assert.equal(jwtSecretProblem("x".repeat(MIN_LENGTH)), null);
  assert.equal(jwtSecretProblem("0123456789abcdef".repeat(4)), null);
});
