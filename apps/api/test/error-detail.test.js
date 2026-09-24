// apps/api/test/error-detail.test.js — error ที่ไม่คาดคิดต้องไม่ส่งข้อความภายในออกไป (audit 2026-09-24 F02)
//
// production จริงไม่ได้ตั้ง NODE_ENV เดิมตัวจัดการ 500 ซ่อนรายละเอียดเฉพาะเมื่อ NODE_ENV=production จึงส่งข้อความ
// ของ MySQL (ชื่อตาราง ชื่อคอลัมน์) ให้เบราว์เซอร์ทุกครั้ง

const test = require("node:test");
const assert = require("node:assert/strict");
require("../src/auth/unit-test-users"); // บัญชีจำลองแทนการอ่านฐาน (#208)
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-unit-tests";
const db = require("../src/shared/db");
const app = require("../index");

async function brandsWithBrokenDb(nodeEnv) {
  const original = db.query;
  const previousEnv = process.env.NODE_ENV;
  if (nodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = nodeEnv;
  db.query = async () => { throw new Error("Unknown column 'secret_col' in 'field list' of table `brand`"); };
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const token = jwt.sign({ id: 1, username: "admin", role: "admin" }, process.env.JWT_SECRET, { expiresIn: "5m" });
    const res = await fetch(`http://localhost:${server.address().port}/api/brands`, { headers: { authorization: `Bearer ${token}` } });
    return { status: res.status, body: await res.json() };
  } finally {
    db.query = original;
    if (previousEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnv;
    await new Promise((resolve) => server.close(resolve));
  }
}

test("ไม่ได้ตั้ง NODE_ENV (production บนเครื่องนี้) → 500 ไม่มีข้อความภายใน มีแค่รหัสอ้างอิง", async () => {
  const res = await brandsWithBrokenDb(undefined);
  assert.equal(res.status, 500);
  assert.doesNotMatch(JSON.stringify(res.body), /secret_col|brand`/);
  assert.match(res.body.detail, /รหัสอ้างอิง/);
});

test("NODE_ENV=production → ไม่ส่งข้อความภายในเช่นกัน", async () => {
  const res = await brandsWithBrokenDb("production");
  assert.doesNotMatch(JSON.stringify(res.body), /secret_col/);
});

test("NODE_ENV=development → เห็นข้อความจริงเพื่อไล่บั๊ก", async () => {
  const res = await brandsWithBrokenDb("development");
  assert.match(res.body.detail, /secret_col/);
});
