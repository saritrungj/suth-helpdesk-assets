// apps/api/test/dashboard-coverage-sql.test.js
//
// เทส regression ของ "ขอบเขต" ที่ใช้คำนวณความครบถ้วน — ระดับคิวรี่
//
// ## ทำไมต้องมีทั้งไฟล์นี้และ dashboard-coverage-scope.test.js
//
// ไฟล์ `-scope` เทียบผลของ endpoint กับค่าที่คำนวณจากข้อมูลดิบ ซึ่งเป็นการตรวจ
// ที่ตรงกับความจริงที่สุด **แต่แยกโค้ดที่ถูกกับผิดได้ก็ต่อเมื่อข้อมูลไม่สม่ำเสมอ**
// ชุดข้อมูลบนเครื่องพัฒนาตอนนี้ทุกอาคารกรอกครบพร้อมกันหมด เทสนั้นจึงผ่านทั้งโค้ด
// ที่ถูกและโค้ดที่ผิด (ตัวเทสเองประกาศเรื่องนี้ออกมาตอนรัน)
//
// ไฟล์นี้ปิดช่องว่างนั้นด้วยการ **ดักดูคิวรี่ที่ถูกส่งไปฐานข้อมูลจริงๆ** แล้วยืนยัน
// ค่าคงที่ข้อเดียว: ตัวเศษ (`filled`) กับตัวส่วน (`active_devices`) ต้องถูกกรอง
// ด้วยเงื่อนไขชุดเดียวกันเสมอ ไม่ขึ้นกับว่าในฐานข้อมูลมีข้อมูลแบบไหน
//
// ถ้าใครถอด `${buildingClause}` ออกจากคิวรี่ใดคิวรี่หนึ่งอีก เทสนี้จะแดงทันที
//
// รัน: npm test --workspace @suth/api

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const db = require("../src/shared/db");

/** เดือนของปีงบสมมติ ต.ค. 2568 – ก.ย. 2569 */
const FY = { id: 1, year: "2569", start_month: "2025-10", end_month: "2026-09" };

/**
 * เปิดเซิร์ฟเวอร์ชั่วคราวที่ mount เฉพาะ router ของ overview โดยแทน db.query
 * ด้วยตัวปลอมที่บันทึกทุกคิวรี่ไว้
 *
 * ไม่แตะฐานข้อมูลจริงเลย — เทสนี้สนใจแค่ "ส่ง SQL อะไรออกไป" ไม่ได้สนใจผลลัพธ์
 */
async function withCapturedQueries(work) {
  const calls = [];
  const originalQuery = db.query;

  db.query = async (sql, params = []) => {
    calls.push({ sql: String(sql), params });

    // ตอบค่าที่ทำให้ handler เดินจนจบได้ โดยดูจากรูปร่างของคิวรี่
    if (sql.includes("FROM fiscal_year")) return [[FY]];
    if (sql.includes("d.status, COUNT(*)")) return [[{ status: "active", count: 3 }]];
    if (sql.includes("AS filled")) return [[]];
    if (sql.includes("total_pages")) {
      return [[{ total_pages: 0, total_cost: 0, reporting_devices: 0, reporting_active_devices: 0 }]];
    }
    return [[]];
  };

  // require แบบ lazy หลังจากแทน db.query แล้ว เพื่อให้ router ใช้ตัวปลอม
  const overview = require("../src/dashboard/overview");

  const app = express();
  app.use("/api/dashboard", overview);
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

/** คิวรี่ที่นับ "จำนวนเครื่องที่กรอกแล้วในแต่ละเดือน" (ตัวเศษของความครบถ้วน) */
const filledQuery = (calls) => calls.find((c) => c.sql.includes("AS filled"));

/** คิวรี่ที่นับ "จำนวนเครื่องแยกตามสถานะ" ซึ่งเป็นที่มาของ active_devices (ตัวส่วน) */
const statusQuery = (calls) => calls.find((c) => c.sql.includes("d.status, COUNT(*)"));

test("ขอบเขตของคิวรี่ที่ใช้คำนวณความครบถ้วน", async (t) => {
  await t.test("เลือกอาคาร: ทั้งตัวเศษและตัวส่วนต้องกรองด้วยอาคารเดียวกัน", async () => {
    await withCapturedQueries(async ({ port, calls }) => {
      const building = "อาคารศูนย์แพทยศาสตรศึกษา";

      const res = await fetch(
        `http://localhost:${port}/api/dashboard/overview` +
          `?fiscal_year_id=1&building_name=${encodeURIComponent(building)}`
      );
      assert.equal(res.status, 200, await res.text());

      const filled = filledQuery(calls);
      const status = statusQuery(calls);

      assert.ok(filled, "ไม่พบคิวรี่ที่นับเดือนที่กรอกแล้ว");
      assert.ok(status, "ไม่พบคิวรี่ที่นับเครื่องตามสถานะ");

      // นี่คือหัวใจของเทสนี้ — บั๊กเดิมคือคิวรี่ตัวเศษไม่มีบรรทัดนี้
      assert.match(
        filled.sql,
        /b\.name\s*=\s*\?/,
        "คิวรี่ที่นับ 'filled' ไม่ได้กรองตามอาคาร แต่คิวรี่ที่นับ active_devices กรอง — " +
          "ตัวเศษกับตัวส่วนจะมาจากคนละขอบเขต ทำให้เดือนที่ยังไม่ได้กรอกถูกนับว่าครบ"
      );

      assert.match(status.sql, /b\.name\s*=\s*\?/, "คิวรี่ที่นับเครื่องตามสถานะไม่ได้กรองตามอาคาร");

      assert.ok(
        filled.params.includes(building),
        "คิวรี่ตัวเศษไม่ได้รับชื่ออาคารเป็นพารามิเตอร์"
      );
      assert.ok(
        status.params.includes(building),
        "คิวรี่ตัวส่วนไม่ได้รับชื่ออาคารเป็นพารามิเตอร์"
      );
    });
  });

  await t.test("ไม่เลือกอาคาร: ทั้งสองคิวรี่ต้องไม่กรอง เหมือนกันทั้งคู่", async () => {
    await withCapturedQueries(async ({ port, calls }) => {
      const res = await fetch(`http://localhost:${port}/api/dashboard/overview?fiscal_year_id=1`);
      assert.equal(res.status, 200, await res.text());

      const filled = filledQuery(calls);
      const status = statusQuery(calls);

      assert.doesNotMatch(filled.sql, /b\.name\s*=\s*\?/);
      assert.doesNotMatch(status.sql, /b\.name\s*=\s*\?/);
    });
  });

  await t.test("ตัวเศษต้องนับเฉพาะเครื่องที่ใช้งานอยู่ ให้ตรงกับตัวส่วน", async () => {
    await withCapturedQueries(async ({ port, calls }) => {
      const res = await fetch(`http://localhost:${port}/api/dashboard/overview?fiscal_year_id=1`);
      assert.equal(res.status, 200, await res.text());

      // ตัวส่วนคือจำนวนเครื่องสถานะ active เท่านั้น ถ้าตัวเศษนับเครื่องที่ปลดระวาง
      // ด้วย เศษจะโตกว่าส่วนได้ แล้วเดือนที่ยังไม่ครบจะถูกนับว่าครบ
      assert.match(
        filledQuery(calls).sql,
        /d\.status\s*=\s*'active'/,
        "คิวรี่ตัวเศษต้องจำกัดเฉพาะเครื่องที่ใช้งานอยู่"
      );
    });
  });
});
