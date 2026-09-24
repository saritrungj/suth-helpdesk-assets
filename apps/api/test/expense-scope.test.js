// apps/api/test/expense-scope.test.js
//
// หน้าค่าใช้จ่ายจัดยอดตามสัญญาที่คิดเงินเดือนนั้นจริง (v_monthly_kpi.billing_contract_id)
// ไม่ใช่สัญญาปัจจุบันของเครื่อง และยอดรวมต้องเท่ายอดของทุกแถวในช่วง — ตัวเลขเดียวกับ
// แดชบอร์ด (ADR-0019, ADR-0023)
//
// ดักคิวรี่ที่ route ส่งออกไปจริง ผลกับฐานข้อมูลจริงตรวจในชุด db

const test = require("node:test");
const assert = require("node:assert/strict");
require("../src/auth/unit-test-users"); // บัญชีจำลองแทนการอ่านฐาน (#208)
const express = require("express");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-unit-tests";
const TOKEN = jwt.sign({ id: 1, username: "admin", role: "admin" }, process.env.JWT_SECRET, { expiresIn: "5m" });

const db = require("../src/shared/db");

const FY = { start_month: "2025-10", end_month: "2026-09", start_date: "2025-10-01", end_date: "2026-09-30" };

// เครื่อง PRN-MOVED ย้ายจากสัญญา 1 ไปสัญญา 2 ในเดือน ก.พ. — ยอดต้องแยกตามเดือนของมัน
// เครื่อง PRN-COLOR มีมิเตอร์ขาวดำและสีในเดือนเดียวกัน — ต้องรวมเป็นหนึ่งแถวต่อเดือน
// เครื่อง PRN-NONE ไม่มีสัญญาคิดเงิน — ต้องอยู่ในกลุ่มแยก และยังนับในยอดรวม
const READINGS = [
  { device_id: 10, serial_number: "PRN-MOVED", month: "2026-01", pages: 1000, price_per_page: "0.4500", total_cost: "441.00", billing_contract_id: 1, billing_contract_no: "CT-1" },
  { device_id: 10, serial_number: "PRN-MOVED", month: "2026-02", pages: 1000, price_per_page: "0.3650", total_cost: "357.70", billing_contract_id: 2, billing_contract_no: "CT-2" },
  { device_id: 20, serial_number: "PRN-COLOR", month: "2026-02", pages: 100, price_per_page: "0.3500", total_cost: "34.30", billing_contract_id: 2, billing_contract_no: "CT-2" },
  { device_id: 20, serial_number: "PRN-COLOR", month: "2026-02", pages: 10, price_per_page: "3.9000", total_cost: "38.22", billing_contract_id: 2, billing_contract_no: "CT-2" },
  { device_id: 30, serial_number: "PRN-NONE", month: "2026-02", pages: 50, price_per_page: null, total_cost: null, billing_contract_id: null, billing_contract_no: null },
];

async function withCapturedQueries(work) {
  const calls = [];
  const originalQuery = db.query;

  db.query = async (sql, params = []) => {
    calls.push({ sql: String(sql), params });
    if (sql.includes("FROM fiscal_year")) return [[FY]];
    if (sql.includes("FROM contracts c")) {
      return [[
        { id: 1, contract_no: "CT-1", effective_from: "2024-10-01", effective_to: "2026-01-31", monthly_rental: null, vat_rate: null },
        { id: 2, contract_no: "CT-2", effective_from: "2026-02-01", effective_to: "2029-01-31", monthly_rental: "100.00", vat_rate: "7.00" },
      ]];
    }
    if (sql.includes("FROM v_contract_invoice")) {
      return [[
        { contract_id: 1, rental: "0.00", vat: "0.00", invoice_total: "441.00" },
        { contract_id: 2, rental: "100.00", vat: "37.60", invoice_total: "567.82" },
      ]];
    }
    if (sql.includes("FROM v_monthly_kpi")) return [READINGS.map((row) => ({ ...row }))];
    return [[]];
  };

  const expense = require("../src/expense/routes");
  const app = express();
  app.use("/api/expense", expense);
  app.use((err, _req, res, _next) => res.status(err.status || 500).json({ error: err.message }));

  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();

  try {
    return await work({ port, calls });
  } finally {
    db.query = originalQuery;
    await new Promise((resolve) => server.close(resolve));
  }
}

async function fetchExpense(port) {
  const res = await fetch(`http://localhost:${port}/api/expense/1`, {
    headers: { authorization: `Bearer ${TOKEN}` },
  });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  return body;
}

test("หน้าค่าใช้จ่ายจัดยอดตามสัญญาที่คิดเงินจริง", async (t) => {
  await withCapturedQueries(async ({ port, calls }) => {
    const body = await fetchExpense(port);
    const byNo = Object.fromEntries(body.contracts.map((c) => [c.contract_no, c]));

    await t.test("สัญญาที่อายุคร่อมปีงบต้องมาจากช่วงวันที่ ไม่ใช่ปีงบที่ผูก", () => {
      const query = calls.find((c) => c.sql.includes("FROM contracts c"));
      assert.match(query.sql, /c\.effective_from <= \? AND c\.effective_to >= \?/);
      assert.deepEqual(query.params, [FY.end_date, FY.start_date]);
    });

    await t.test("เครื่องที่ย้ายสัญญากลางปีอยู่ใต้ทั้งสองสัญญาตามเดือนของมัน", () => {
      assert.equal(byNo["CT-1"].devices.find((d) => d.serial_number === "PRN-MOVED").total_cost, 441);
      assert.equal(byNo["CT-2"].devices.find((d) => d.serial_number === "PRN-MOVED").total_cost, 357.7);
    });

    await t.test("มิเตอร์ขาวดำกับสีของเดือนเดียวกันรวมเป็นหนึ่งแถว", () => {
      const color = byNo["CT-2"].devices.find((d) => d.serial_number === "PRN-COLOR");
      assert.equal(color.monthly.length, 1);
      assert.equal(color.monthly[0].pages, 110);
      assert.equal(color.monthly[0].cost, 72.52);
      assert.equal(color.monthly[0].price_per_page, null, "สองราคาในเดือนเดียวต้องไม่แสดงเป็นราคาเดียว");
    });

    await t.test("ยอดรวมเท่าผลรวมทุกแถวในช่วง รวมกลุ่มที่ไม่มีสัญญา", () => {
      // 441.00 + 357.70 + 34.30 + 38.22 = 871.22
      assert.equal(body.total_cost_satang, 87122);
      assert.equal(body.no_contract_devices.length, 1);
      assert.equal(body.no_contract_unpriced_readings, 1);
      assert.equal(body.unpriced_readings, 1);
    });

    await t.test("ยอดตามใบแจ้งหนี้รวมค่าเช่าและ VAT มาจาก v_contract_invoice", () => {
      assert.equal(byNo["CT-2"].invoice_total, "567.82");
      assert.equal(body.invoice_total_satang, 44100 + 56782);
    });
  });
});
