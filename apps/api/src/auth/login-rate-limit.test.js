// apps/api/src/auth/login-rate-limit.test.js — 429 ของตัวจำกัดการล็อกอินผ่าน error handler กลาง (#268)

const test = require("node:test");
const assert = require("node:assert/strict");
require("./unit-test-users"); // บัญชีจำลองแทนการอ่านฐาน (#208)

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-unit-tests";
process.env.RATE_LIMIT_PER_MINUTE = "1000"; // ไม่ให้ตัวจำกัดรวมของ /api มาตัดก่อน

const app = require("../../index");
const jwt = require("jsonwebtoken");
const db = require("../shared/db");

test("ล็อกอินผิดเกินโควตา: ได้ 429 problem+json ที่ไม่ถูกแคช และ body เท่าเดิม", async () => {
  const originalQuery = db.query;
  db.query = async () => [[]]; // ไม่พบผู้ใช้ → 401 โดยไม่แตะฐานจริง
  const server = app.listen(0);
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/auth/login`;
    const attempt = () =>
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "ไม่มีผู้ใช้นี้", password: "รหัสผิด-1234" }),
      });

    for (let i = 0; i < 10; i += 1) {
      const res = await attempt();
      assert.equal(res.status, 401, `ครั้งที่ ${i + 1} ยังไม่ควรถูกจำกัด`);
    }

    const res = await attempt();
    assert.equal(res.status, 429);
    assert.match(res.headers.get("content-type"), /^application\/problem\+json/);
    assert.match(res.headers.get("cache-control"), /no-store/);
    assert.deepEqual(await res.json(), {
      type: "about:blank",
      title: "พยายามเข้าสู่ระบบบ่อยเกินไป",
      status: 429,
      code: "too_many_attempts",
      detail: "กรุณารอ 15 นาทีแล้วลองใหม่ หรือติดต่อผู้ดูแลระบบ",
    });
  } finally {
    db.query = originalQuery;
    await new Promise((resolve) => server.close(resolve));
  }
});

test("เปลี่ยนรหัสผ่านผิดเกินโควตา: ได้ 429 body เท่าเดิม ผ่าน error handler กลาง", async () => {
  const originalQuery = db.query;
  db.query = async () => [[]];
  const server = app.listen(0);
  try {
    const token = jwt.sign({ id: 1, username: "admin", role: "admin" }, process.env.JWT_SECRET, { expiresIn: "5m" });
    const url = `http://127.0.0.1:${server.address().port}/api/auth/password`;
    const attempt = () =>
      fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: `token=${token}`, Authorization: `Bearer ${token}` },
        body: JSON.stringify({ current_password: "ผิด-12345678", new_password: "รหัสใหม่-ที่ยาวพอ-9876" }),
      });

    for (let i = 0; i < 10; i += 1) {
      const res = await attempt();
      assert.equal(res.status, 401, `ครั้งที่ ${i + 1} ต้องถึงด่านตรวจรหัสและยังไม่ถูกจำกัด`);
    }

    const res = await attempt();
    assert.equal(res.status, 429);
    assert.match(res.headers.get("content-type"), /^application\/problem\+json/);
    assert.deepEqual(await res.json(), {
      type: "about:blank",
      title: "ลองเปลี่ยนรหัสผ่านบ่อยเกินไป",
      status: 429,
      code: "too_many_attempts",
      detail: "กรุณารอ 15 นาทีแล้วลองใหม่ หรือติดต่อผู้ดูแลระบบ",
    });
  } finally {
    db.query = originalQuery;
    await new Promise((resolve) => server.close(resolve));
  }
});
