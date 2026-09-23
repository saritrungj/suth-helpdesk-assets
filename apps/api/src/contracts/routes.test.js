// apps/api/src/contracts/routes.test.js
//
// อายุสัญญาและค่าเช่าต้องถูกจำกัดที่ปากทาง — v_contract_invoice กางค่าเช่าทีละเดือนตลอดอายุสัญญา
// ด้วย recursive CTE ถ้าพิมพ์ปี พ.ศ. ปนในวันสิ้นสุด (2571 แทน 2028) สัญญาจะยาวหลายพันเดือน
// เกิน cte_max_recursion_depth แล้วหน้าค่าใช้จ่ายของทุกคนล่มจนกว่าจะมีคนแก้สัญญา

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-unit-tests";
const TOKEN = jwt.sign({ id: 1, username: "admin", role: "admin" }, process.env.JWT_SECRET, { expiresIn: "5m" });

const db = require("../shared/db");

async function post(body) {
  const calls = [];
  const originalQuery = db.query;
  const originalWithTransaction = db.withTransaction;
  db.query = async (sql) => { calls.push(String(sql)); return [[]]; };
  db.withTransaction = async () => { calls.push("withTransaction"); throw new Error("ต้องไม่ถึงฐานข้อมูล"); };

  const app = express();
  app.use(express.json());
  app.use("/api/contracts", require("./routes"));
  app.use((err, _req, res, _next) => res.status(err.status || 500).json({ error: err.message }));
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const res = await fetch(`http://localhost:${server.address().port}/api/contracts`, {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json(), calls };
  } finally {
    db.query = originalQuery;
    db.withTransaction = originalWithTransaction;
    await new Promise((resolve) => server.close(resolve));
  }
}

const valid = {
  contract_no: "SUTH192/2568",
  effective_from: "2025-02-24",
  effective_to: "2028-02-23",
  price_lines: [{ category_id: 1, price_per_page: "0.365" }],
};

test("ปฏิเสธสัญญาที่ใส่ปี พ.ศ. ปนในวันสิ้นสุดก่อนถึงฐานข้อมูล", async () => {
  const res = await post({ ...valid, effective_to: "2571-02-23" });
  assert.equal(res.status, 400, JSON.stringify(res.body));
  assert.deepEqual(res.calls, []);
});

test("ปฏิเสธสัญญาที่ยาวเกิน 10 ปี", async () => {
  const res = await post({ ...valid, effective_from: "2020-01-01", effective_to: "2030-01-01" });
  assert.equal(res.status, 400, JSON.stringify(res.body));
});

test("ปฏิเสธค่าเช่าที่เกินคอลัมน์ DECIMAL(12,2) เป็น 400 ไม่ใช่ 500", async () => {
  const res = await post({ ...valid, monthly_rental: "10000000000" });
  assert.equal(res.status, 400, JSON.stringify(res.body));
});

test("สัญญา 3 ปีตามจริงผ่านด่านตรวจไปถึงชั้นฐานข้อมูล", async () => {
  const res = await post(valid);
  assert.notEqual(res.status, 400, JSON.stringify(res.body));
  assert.ok(res.calls.length > 0);
});
