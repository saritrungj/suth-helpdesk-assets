// apps/api/src/shared/http-error.test.js — รูป body ของ ApiError ที่ client พึ่งพา (#268)

const test = require("node:test");
const assert = require("node:assert/strict");

const { tooManyRequests } = require("./http-error");

test("tooManyRequests: 429 รูปเดียวกับ body ที่ตัวจำกัดอัตราเคยเขียนเอง", () => {
  const problem = tooManyRequests("พยายามเข้าสู่ระบบบ่อยเกินไป", {
    code: "too_many_attempts",
    detail: "กรุณารอ 15 นาทีแล้วลองใหม่ หรือติดต่อผู้ดูแลระบบ",
  }).toProblem();

  assert.deepEqual(problem, {
    type: "about:blank",
    title: "พยายามเข้าสู่ระบบบ่อยเกินไป",
    status: 429,
    code: "too_many_attempts",
    detail: "กรุณารอ 15 นาทีแล้วลองใหม่ หรือติดต่อผู้ดูแลระบบ",
  });
});

test("tooManyRequests: code เริ่มต้นเป็น rate_limited", () => {
  assert.equal(tooManyRequests("มีคำขอเข้ามาถี่เกินไป").code, "rate_limited");
});
