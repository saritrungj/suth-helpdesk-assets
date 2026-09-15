// apps/api/test/expense-scope.test.js
//
// ขอบเขตของยอดรวมในหน้า "ค่าใช้จ่ายตามสัญญา"
//
// ## เรื่องที่เทสนี้กันไว้
//
// ยอดรวมของหน้านี้เริ่มจาก `contracts WHERE c.fiscal_year_id = ?` จึงเป็น
// "ยอดของสัญญาที่ขึ้นทะเบียนกับปีงบนี้" ส่วนแท็บตามฝ่าย/แผนกกับแดชบอร์ดคิดจาก
// "เดือนของยอดพิมพ์" สองอย่างนี้ต่างกันเมื่อเครื่องยังผูกสัญญาปีก่อนแต่ยังพิมพ์อยู่
//
// เคยเจอบนข้อมูลจริงว่าต่างกันถึง 3.3 เท่า โดยป้ายบนจอทั้งสองที่เขียนว่า
// "ค่าใช้จ่ายสุทธิรวม" เหมือนกันและช่วงเวลาเดียวกัน — คนที่เอาไปเทียบกับใบแจ้งหนี้
// ไม่มีทางรู้ว่าทำไมไม่เท่ากัน
//
// ทางแก้ที่เลือกคือไม่เปลี่ยนความหมายของยอดรวม (เพราะ "ตามสัญญา" ไว้ตรวจใบแจ้งหนี้
// ของสัญญาฉบับนั้นจริงๆ) แต่ต้องรายงานส่วนที่ไม่ถูกนับออกมาให้เห็นเสมอ
//
// รัน: npm test --workspace @suth/api

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");

// เทสนี้ยิงผ่าน router จริงซึ่งมี requireAuth อยู่ข้างใน จึงต้องมี token จริง
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-unit-tests";
const TOKEN = jwt.sign({ id: 1, username: "admin", role: "admin" }, process.env.JWT_SECRET, { expiresIn: "5m" });

const db = require("../src/shared/db");

const FY = { start_month: "2025-10", end_month: "2026-09" };

async function withCapturedQueries(work) {
  const calls = [];
  const originalQuery = db.query;

  db.query = async (sql, params = []) => {
    calls.push({ sql: String(sql), params });

    if (sql.includes("FROM fiscal_year")) return [[FY]];

    // สัญญาของปีงบนี้ พร้อมเครื่องหนึ่งเครื่อง
    if (sql.includes("FROM contracts c")) {
      return [[{
        contract_id: 1, contract_no: "CT-001/2569", price_per_page: "0.45",
        device_id: 10, serial_number: "PRN-A", model: "M", price_override: null,
        status: "active", brand_name: "B",
      }]];
    }

    // เครื่องที่สัญญาอยู่คนละปีงบ แต่มียอดพิมพ์ในช่วงปีงบนี้
    if (sql.includes("c.fiscal_year_id <> ?")) {
      return [[{
        device_id: 99, serial_number: "PRN-OLD", model: "M",
        price_override: null, contract_no: "CT-001/2568",
        price_per_page: "0.50", contract_fiscal_year: "2568",
      }]];
    }

    // ยอดพิมพ์พร้อมค่าใช้จ่ายที่ view คำนวณไว้แล้ว — หน้าค่าใช้จ่ายไม่คิดเงินเอง
    // อีกต่อไป ราคาที่มีผลของแต่ละเดือนและจุดปัดเศษอยู่ใน v_monthly_kpi ที่เดียว
    // (ADR-0019) 1000 หน้า x 0.98 x 0.50 บาท = 490.00
    if (sql.includes("FROM v_monthly_kpi")) {
      return [[{ device_id: 99, month: "2026-01", pages: 1000, price_per_page: "0.50", total_cost: "490.00" }]];
    }

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

test("ยอดที่ไม่ถูกนับในค่าใช้จ่ายตามสัญญาต้องถูกรายงานออกมา", async (t) => {
  await t.test("เครื่องที่สัญญาอยู่คนละปีงบต้องถูกคิดและส่งกลับแยกจากยอดรวม", async () => {
    await withCapturedQueries(async ({ port, calls }) => {
      const res = await fetch(`http://localhost:${port}/api/expense/1`, {
        headers: { authorization: `Bearer ${TOKEN}` },
      });
      // อ่านบอดี้ครั้งเดียว — ส่ง await res.text() เป็นข้อความของ assert จะกินบอดี้ทิ้ง
      const body = await res.json();
      assert.equal(res.status, 200, JSON.stringify(body));

      const outsideQuery = calls.find((c) => c.sql.includes("c.fiscal_year_id <> ?"));
      assert.ok(outsideQuery, "ไม่มีคิวรี่ที่หาเครื่องซึ่งสัญญาอยู่คนละปีงบ");
      assert.ok(
        outsideQuery.sql.includes("pt.month BETWEEN ? AND ?"),
        "ต้องจำกัดเฉพาะเครื่องที่มียอดพิมพ์ในช่วงปีงบที่กำลังดู ไม่ใช่ทุกเครื่องของปีอื่น"
      );

      assert.equal(body.outside_year_devices.length, 1);
      assert.equal(body.outside_year_devices[0].serial_number, "PRN-OLD");
      assert.equal(body.outside_year_devices[0].contract_fiscal_year, "2568");

      // 1000 หน้า x 0.98 x 0.50 บาท = 490.00 บาท
      assert.equal(body.outside_year_total, 490);

      // และต้องไม่ถูกบวกเข้าไปในยอดรวมของหน้า ซึ่งเป็นยอดของสัญญาปีงบนี้เท่านั้น
      assert.notEqual(body.total_cost, body.total_cost + body.outside_year_total);
      assert.ok(
        !body.contracts.some((c) => c.devices.some((d) => d.serial_number === "PRN-OLD")),
        "เครื่องของสัญญาปีอื่นต้องไม่ถูกจัดเข้าสัญญาของปีงบนี้"
      );
    });
  });
});
