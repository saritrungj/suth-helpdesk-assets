// apps/api/src/shared/rate-limit-response.test.js — 429 ของตัวจำกัดอัตราผ่าน error handler กลาง (#268)
//
// ตัวจำกัดอัตราเคยเขียน response เอง: Content-Type เป็น application/json และไม่มี Cache-Control: no-store
// ทดสอบกับ app จริง (index.js) เพื่อให้เห็นว่า handler → next(ApiError) → error handler กลางต่อกันถูก

const test = require("node:test");
const assert = require("node:assert/strict");
require("../auth/unit-test-users"); // บัญชีจำลองแทนการอ่านฐาน (#208)

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-unit-tests";
process.env.RATE_LIMIT_PER_MINUTE = "3";

const app = require("../../index");

async function withServer(fn) {
  const server = app.listen(0);
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function assertProblem(res, body, expected) {
  assert.equal(res.status, 429);
  assert.match(res.headers.get("content-type"), /^application\/problem\+json/);
  assert.match(res.headers.get("cache-control"), /no-store/);
  assert.deepEqual(body, { type: "about:blank", status: 429, ...expected });
}

test("ตัวจำกัดรวมของ /api: เกินโควตาได้ 429 problem+json ที่ไม่ถูกแคช", async () => {
  await withServer(async (base) => {
    let res;
    for (let i = 0; i < 4; i += 1) res = await fetch(`${base}/api/ไม่มีเส้นทางนี้`);
    assertProblem(res, await res.json(), {
      title: "มีคำขอเข้ามาถี่เกินไป",
      code: "rate_limited",
      detail: "กรุณารอสักครู่แล้วลองใหม่",
    });
  });
});
