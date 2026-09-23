// apps/api/test/request-body.test.js
//
// body ที่อ่านเป็น JSON ไม่ได้คือความผิดของคำขอ ไม่ใช่บั๊กของเซิร์ฟเวอร์ (#175)
//
// เดิม error ของ express.json หลุดไปที่ handler กลางแล้วกลายเป็น 500 — เว็บส่ง body เป็น JSON `null`
// ตอนออกจากระบบ route จึงไม่เคยถูกเรียก cookie ไม่ถูกล้าง แล้วเปิดหน้าใหม่ก็เข้าระบบได้โดยไม่ใส่รหัส

const test = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-unit-tests-0123456789abcdef";

const app = require("../index");
const { SESSION_COOKIE } = require("../src/auth/session-cookie");

async function withServer(fn) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    return await fn(`http://localhost:${server.address().port}/api`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const clearsSession = (res) =>
  res.headers.getSetCookie().some((cookie) => cookie.startsWith(`${SESSION_COOKIE}=;`));

test("body JSON ที่อ่านไม่ได้ตอบ 400 แบบ Problem Details ไม่ใช่ 500", async () => {
  await withServer(async (base) => {
    for (const body of ["null", "{", "12"]) {
      const res = await fetch(`${base}/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      assert.equal(res.status, 400, `body ${body}`);
      assert.match(res.headers.get("content-type"), /application\/problem\+json/);
      assert.equal((await res.json()).code, "invalid_json");
    }
  });
});

test("ออกจากระบบด้วยคำขอแบบที่เว็บส่ง ({} หรือไม่มี body) ล้าง cookie ของ session", async () => {
  await withServer(async (base) => {
    for (const init of [
      { headers: { "Content-Type": "application/json" }, body: "{}" },
      {},
    ]) {
      const res = await fetch(`${base}/auth/logout`, { method: "POST", ...init });
      assert.equal(res.status, 200);
      assert.ok(clearsSession(res), "ต้องมี Set-Cookie ที่ล้าง session");
    }
  });
});
