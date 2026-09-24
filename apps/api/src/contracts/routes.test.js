// apps/api/src/contracts/routes.test.js
//
// อายุสัญญาและค่าเช่าต้องถูกจำกัดที่ปากทาง — v_contract_invoice กางค่าเช่าทีละเดือนตลอดอายุสัญญา
// ด้วย recursive CTE ถ้าพิมพ์ปี พ.ศ. ปนในวันสิ้นสุด (2571 แทน 2028) สัญญาจะยาวหลายพันเดือน
// เกิน cte_max_recursion_depth แล้วหน้าค่าใช้จ่ายของทุกคนล่มจนกว่าจะมีคนแก้สัญญา

const test = require("node:test");
const assert = require("node:assert/strict");
require("../auth/unit-test-users"); // บัญชีจำลองแทนการอ่านฐาน (#208)
const express = require("express");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-unit-tests";
const TOKEN = jwt.sign({ id: 1, username: "admin", role: "admin" }, process.env.JWT_SECRET, { expiresIn: "5m" });

const db = require("../shared/db");
const { ApiError, PROBLEM_JSON, fromDatabaseError } = require("../shared/http-error");

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

async function deleteContract({ exists = true, current = 0, history = 0, rentals = 0, role = "admin" } = {}) {
  const originalWithTransaction = db.withTransaction;
  const calls = [];
  db.withTransaction = async (work) => work({
    query: async (sql) => {
      const statement = String(sql);
      calls.push(statement);
      if (statement.includes("SELECT id FROM contracts")) return [exists ? [{ id: 1 }] : [], []];
      if (statement.includes("FROM devices WHERE contract_id")) return [[{ count: current }], []];
      if (statement.includes("FROM device_contract_history WHERE contract_id")) return [[{ count: history }], []];
      if (statement.includes("FROM v_contract_invoice")) return [[{ count: rentals }], []];
      if (statement.includes("DELETE FROM contracts")) return [{ affectedRows: 1 }, []];
      // ประวัติการแก้ไข (ADR-0035): สำเนาสัญญาก่อนลบ + แถว audit_log
      if (statement.includes("SELECT id, contract_no")) return [[{ id: 1, contract_no: "TEST-1", effective_from: "2026-01-01", effective_to: "2026-12-31", monthly_rental: null, vat_rate: null }], []];
      if (statement.includes("FROM contract_price_line WHERE contract_id")) return [[], []];
      if (statement.includes("INSERT INTO audit_log")) return [{ affectedRows: 1 }, []];
      throw new Error(`Unexpected SQL: ${statement}`);
    },
  });

  const app = express();
  app.use(express.json());
  app.use("/api/contracts", require("./routes"));
  app.use((err, _req, res, _next) => {
    const problem = err instanceof ApiError ? err : fromDatabaseError(err);
    if (problem) return res.status(problem.status).type(PROBLEM_JSON).json(problem.toProblem());
    return res.status(500).json({ title: "เกิดข้อผิดพลาดในระบบ" });
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const token = jwt.sign({ id: 1, username: "tester", role }, process.env.JWT_SECRET, { expiresIn: "5m" });
    const response = await fetch(`http://localhost:${server.address().port}/api/contracts/1`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    return { status: response.status, headers: response.headers, body: await response.json(), calls };
  } finally {
    db.withTransaction = originalWithTransaction;
    await new Promise((resolve) => server.close(resolve));
  }
}

test("DELETE /api/contracts/:id ลบสัญญาที่ไม่มี references หรืองวดค่าเช่าที่เกิดขึ้นแล้ว", async () => {
  const res = await deleteContract();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("location"), "/api/contracts");
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.ok(res.calls.includes("DELETE FROM contracts WHERE id = ?"));
  assert.ok(res.calls.some((sql) => sql.includes("INSERT INTO audit_log")), "การลบสัญญาต้องมีบันทึกในประวัติการแก้ไข");
  const rentalSql = res.calls.find((sql) => sql.includes("FROM v_contract_invoice"));
  assert.match(rentalSql, /i\.month < DATE_FORMAT\(t\.today, '%Y-%m'\)/);
  assert.match(rentalSql, /t\.today >= CASE[\s\S]*DAY\(c\.effective_from\)/);
  // วันนี้มาจากแอปตามเวลาไทย ไม่ใช่ CURRENT_DATE ของฐานที่รันเวลา UTC (audit F11)
  assert.doesNotMatch(rentalSql, /CURRENT_DATE/);
});

for (const [reason, options] of [
  ["contract_has_current_devices", { current: 1 }],
  ["contract_has_history", { history: 1 }],
  ["contract_has_realized_rental_months", { rentals: 1 }],
]) {
  test(`DELETE /api/contracts/:id ตอบ 409 ${reason} และไม่ลบสัญญา`, async () => {
    const res = await deleteContract(options);
    assert.equal(res.status, 409);
    assert.match(res.headers.get("content-type"), /^application\/problem\+json/);
    assert.equal(res.body.code, reason);
    assert.equal(res.calls.some((sql) => sql.startsWith("DELETE FROM contracts")), false);
  });
}

test("DELETE /api/contracts/:id ตอบ 404 เมื่อไม่มีสัญญา", async () => {
  const res = await deleteContract({ exists: false });
  assert.equal(res.status, 404);
  assert.equal(res.calls.some((sql) => sql.startsWith("DELETE FROM contracts")), false);
});

test("DELETE /api/contracts/:id จำกัดสิทธิ์ผู้ดูแล", async () => {
  const res = await deleteContract({ role: "viewer" });
  assert.equal(res.status, 403);
  assert.equal(res.calls.length, 0);
});
