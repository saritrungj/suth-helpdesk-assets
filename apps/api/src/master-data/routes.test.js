// apps/api/src/master-data/routes.test.js — ชื่อเรียกอื่นของข้อมูลหลัก (ADR-0025)
//
// ชื่อหนึ่งต้องชี้ได้รายการเดียว — ชื่อเรียกอื่นห้ามชนชื่อหลักหรือชื่อเรียกอื่นที่มีอยู่
// และชื่อหลักที่เพิ่ม/แก้ใหม่ห้ามชนชื่อเรียกอื่น ไม่งั้นตัวนำเข้าต้องเดาว่าหมายถึงอันไหน

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-unit-tests";
const sign = (role) => jwt.sign({ id: 1, username: role, role }, process.env.JWT_SECRET, { expiresIn: "5m" });

const db = require("../shared/db");

const BUILDINGS = [
  { id: 1, name: "อาคารศูนย์ความเป็นเลิศทางการแพทย์" },
  { id: 2, name: "อาคารรัตนเวชพัฒน์" },
];
const ALIASES = [{ id: 7, target_id: 2, alias: "รัตนเวชพัฒน์ (RVP)" }];

/** ยิงคำขอหนึ่งครั้งกับ router จริง โดยแทน db.query ด้วยข้อมูลจำลองด้านบน */
async function call(method, route, body, { role = "admin", writeError } = {}) {
  const writes = [];
  const original = db.query;
  db.query = async (sql, params) => {
    const text = String(sql);
    if (/^SELECT id, name FROM `building`/.test(text)) return [BUILDINGS];
    if (/FROM `(building|brand)_alias`/.test(text) && text.startsWith("SELECT")) return [ALIASES];
    writes.push({ sql: text, params });
    if (writeError) throw Object.assign(new Error("db"), { code: writeError });
    return [{ insertId: 99, affectedRows: 1 }];
  };

  const app = express();
  app.use(express.json());
  app.use("/api", require("./routes"));
  app.use((err, _req, res, _next) => res.status(err.status || 500).json({ code: err.code, title: err.message }));
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const res = await fetch(`http://localhost:${server.address().port}/api${route}`, {
      method,
      headers: { authorization: `Bearer ${sign(role)}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, headers: res.headers, body: await res.json(), writes };
  } finally {
    db.query = original;
    await new Promise((resolve) => server.close(resolve));
  }
}

test("GET /buildings/aliases ไม่ถูกอ่านเป็น /buildings/:id", async () => {
  const res = await call("GET", "/buildings/aliases");
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body, ALIASES);
});

test("เพิ่มชื่อเรียกอื่นได้ และเก็บในรูปที่ยุบช่องว่างแล้ว", async () => {
  const res = await call("POST", "/buildings/1/aliases", { alias: "  ศูนย์ความเป็นเลิศทางการแพทย์   (EMC) " });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.alias, "ศูนย์ความเป็นเลิศทางการแพทย์ (EMC)");
  assert.deepEqual(res.writes[0].params, [1, "ศูนย์ความเป็นเลิศทางการแพทย์ (EMC)"]);
});

test("ปฏิเสธชื่อเรียกอื่นที่ซ้ำชื่อหลัก", async () => {
  const res = await call("POST", "/buildings/1/aliases", { alias: "อาคารรัตนเวชพัฒน์" });
  assert.equal(res.status, 409);
  assert.equal(res.body.code, "alias_is_name");
  assert.deepEqual(res.writes, []);
});

test("ปฏิเสธชื่อเรียกอื่นที่มีอยู่แล้ว แม้ต่างตัวพิมพ์และช่องว่าง", async () => {
  const res = await call("POST", "/buildings/1/aliases", { alias: "รัตนเวชพัฒน์  (rvp)" });
  assert.equal(res.status, 409);
  assert.equal(res.body.code, "alias_taken");
  assert.deepEqual(res.writes, []);
});

test("อาคารที่ไม่มีอยู่ = 404", async () => {
  const res = await call("POST", "/buildings/404/aliases", { alias: "ชื่อใหม่" });
  assert.equal(res.status, 404);
});

test("ชื่อหลักใหม่ห้ามชนชื่อเรียกอื่น", async () => {
  const res = await call("POST", "/buildings", { name: "รัตนเวชพัฒน์ (RVP)" });
  assert.equal(res.status, 409);
  assert.equal(res.body.code, "name_is_alias");
  assert.deepEqual(res.writes, []);
});

test("แก้ชื่อหลักให้ชนชื่อเรียกอื่นไม่ได้", async () => {
  const res = await call("PUT", "/buildings/1", { name: "รัตนเวชพัฒน์ (RVP)" });
  assert.equal(res.status, 409);
  assert.equal(res.body.code, "name_is_alias");
});

test("เฉพาะผู้ดูแลระบบเพิ่มชื่อเรียกอื่นได้", async () => {
  const res = await call("POST", "/buildings/1/aliases", { alias: "EMC" }, { role: "staff" });
  assert.equal(res.status, 403);
  assert.deepEqual(res.writes, []);
});

test("ลบชื่อเรียกอื่นด้วย id ของชื่อเรียกอื่น", async () => {
  const res = await call("DELETE", "/buildings/aliases/7");
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.match(res.writes[0].sql, /DELETE FROM `building_alias` WHERE id = \?/);
  assert.deepEqual(res.writes[0].params, [7]);
});

test("ชื่อเรียกอื่นที่ผ่านด่านแต่ชน UNIQUE ของฐาน (คำขอพร้อมกัน) ได้ alias_taken ไม่ใช่ 500", async () => {
  const res = await call("POST", "/buildings/1/aliases", { alias: "EMC" }, { writeError: "ER_DUP_ENTRY" });
  assert.equal(res.status, 409);
  assert.equal(res.body.code, "alias_taken");
});

test("ชื่อหลักถูกเก็บในรูปที่ยุบช่องว่างและตัดอักขระมองไม่เห็นแล้ว", async () => {
  const res = await call("POST", "/buildings", { name: "อาคาร​  ใหม่ " });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.deepEqual(res.writes.at(-1).params, ["อาคาร ใหม่"]);
});

test("ชื่อยี่ห้อยาวเกินคอลัมน์ VARCHAR(100) ตอบ 400 ก่อนถึงฐาน (ฐาน strict ไม่ตัดทิ้งให้)", async () => {
  const res = await call("POST", "/brands", { name: "ก".repeat(101) });
  assert.equal(res.status, 400);
  assert.deepEqual(res.writes, []);
});

test("DELETE /fiscal-years/:id ส่ง Location: /api/fiscal-years และ Cache-Control: no-store ตาม RFC 9111 §4.4 (#136)", async () => {
  const res = await call("DELETE", "/fiscal-years/1");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("location"), "/api/fiscal-years");
  assert.equal(res.headers.get("cache-control"), "no-store");
});

test("POST และ PUT /fiscal-years ส่ง Location: /api/fiscal-years และ Cache-Control: no-store (#136)", async () => {
  const postRes = await call("POST", "/fiscal-years", { year: "2568" });
  assert.equal(postRes.status, 201);
  assert.equal(postRes.headers.get("location"), "/api/fiscal-years");
  assert.equal(postRes.headers.get("cache-control"), "no-store");

  const putRes = await call("PUT", "/fiscal-years/1", { year: "2569" });
  assert.equal(putRes.status, 200);
  assert.equal(putRes.headers.get("location"), "/api/fiscal-years");
  assert.equal(putRes.headers.get("cache-control"), "no-store");
});

test("DELETE และ PUT ใน registerLookup ส่ง Location ชี้ collection และ Cache-Control: no-store (#136)", async () => {
  const delRes = await call("DELETE", "/buildings/1");
  assert.equal(delRes.status, 200);
  assert.equal(delRes.headers.get("location"), "/api/buildings");
  assert.equal(delRes.headers.get("cache-control"), "no-store");

  const putRes = await call("PUT", "/buildings/1", { name: "อาคารปรับปรุง" });
  assert.equal(putRes.status, 200);
  assert.equal(putRes.headers.get("location"), "/api/buildings");
  assert.equal(putRes.headers.get("cache-control"), "no-store");
});
