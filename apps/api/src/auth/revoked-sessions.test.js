// apps/api/src/auth/revoked-sessions.test.js — token ที่ออกจากระบบแล้วต้องใช้ไม่ได้ (#240, ADR-0038)

const test = require("node:test");
const assert = require("node:assert/strict");

const revoked = require("./revoked-sessions");

const SECOND = 1000;

test.beforeEach(() => revoked.clear());

test("token ที่ถูกเพิกถอนถูกจำไว้จนถึงเวลาหมดอายุของมัน แล้วเลิกจำ", () => {
  const now = 1_000_000 * SECOND;
  revoked.revoke("token-a", 1_000_060, now);

  assert.equal(revoked.isRevoked("token-a", now), true);
  assert.equal(revoked.isRevoked("token-a", now + 59 * SECOND), true);
  // หมดอายุแล้ว jwt.verify ปฏิเสธเองอยู่แล้ว ไม่ต้องจำต่อ
  assert.equal(revoked.isRevoked("token-a", now + 61 * SECOND), false);
});

test("token อื่นของผู้ใช้คนเดียวกันไม่ถูกกระทบ", () => {
  revoked.revoke("token-a", 2_000_000);
  assert.equal(revoked.isRevoked("token-b"), false);
});

test("ไม่เก็บตัว token — เก็บแค่ค่าแฮช", () => {
  const now = 1_000_000 * SECOND;
  revoked.revoke("secret-token-value", 1_000_060, now);
  assert.equal(JSON.stringify(revoked.snapshot()).includes("secret-token-value"), false);
});

test("รายการที่หมดอายุถูกเก็บกวาดเมื่อมีการเพิกถอนครั้งถัดไป ไม่โตไม่จำกัด", () => {
  const now = 1_000_000 * SECOND;
  for (let i = 0; i < 50; i += 1) revoked.revoke(`old-${i}`, 1_000_010, now);
  assert.equal(revoked.snapshot().length, 50);

  revoked.revoke("new", 1_000_500, now + 20 * SECOND);
  assert.equal(revoked.snapshot().length, 1);
});
