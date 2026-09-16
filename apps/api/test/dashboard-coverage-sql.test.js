// apps/api/test/dashboard-coverage-sql.test.js
//
// เทส regression ของ "ขอบเขต" ที่ใช้คำนวณความครบถ้วน — ระดับคิวรี่
//
// ## บั๊กที่เทสนี้มีไว้กัน
//
// ตัวเศษ (เครื่องที่กรอกแล้ว) กับตัวส่วน (เครื่องที่ต้องกรอก) มาจากคนละคิวรี่ และ
// เคยมีรอบหนึ่งที่คิวรี่หนึ่งมีตัวกรองอาคาร อีกคิวรี่ไม่มี ผลคือเลือกอาคารที่มี
// 3 เครื่อง ตัวส่วนเป็น 3 ส่วนตัวเศษยังเป็นยอดรวมทุกอาคาร (18) เงื่อนไข 18 < 3
// เป็นเท็จ ทุกเดือนจึงถูกรายงานว่า "ครบแล้ว" ทั้งที่อาคารนั้นอาจยังไม่ได้กรอกเลย
// พอเพิ่มตัวกรองสัญญาเข้ามาทีหลัง กับดักเดิมก็เกิดซ้ำอีกรอบ
//
// ## ทำไมเทสนี้ยังอยู่ ทั้งที่โครงสร้างกันไว้แล้ว
//
// ตอนนี้ทั้งสามคิวรี่สร้างจาก `scope` ก้อนเดียวกันใน readCoverageScope() การกรอง
// ไม่ตรงกันจึงต้องจงใจแก้ไฟล์นั้นให้ผิด — แต่ "ต้องจงใจ" ไม่เท่ากับ "เป็นไปไม่ได้"
// และของที่เคยพังสองรอบด้วยสาเหตุเดียวกันสมควรมีตาข่ายรับไว้ถาวร
//
// ดักคิวรี่ที่ถูกส่งไปฐานข้อมูลจริงๆ แล้วยืนยันค่าคงที่ข้อเดียว: ทุกคิวรี่ที่ประกอบ
// เป็นความครบถ้วนต้องถูกกรองด้วยเงื่อนไขชุดเดียวกันเสมอ ไม่ขึ้นกับข้อมูลในฐาน
//
// รัน: npm test --workspace @suth/api

const test = require("node:test");
const assert = require("node:assert/strict");

const db = require("../src/shared/db");
const { readCoverageScope } = require("../src/shared/coverage-scope");

const MONTHS = ["2025-10", "2025-11", "2025-12"];

/**
 * เรียก readCoverageScope โดยแทน db.query ด้วยตัวปลอมที่บันทึกทุกคิวรี่ไว้
 * ไม่แตะฐานข้อมูลจริงเลย — สนใจแค่ "ส่ง SQL อะไรออกไป" ไม่ได้สนใจผลลัพธ์
 */
async function withCapturedQueries(scope) {
  const calls = [];
  const originalQuery = db.query;

  db.query = async (sql, params = []) => {
    calls.push({ sql: String(sql), params });
    return [[]];
  };

  try {
    await readCoverageScope({
      months: MONTHS,
      startMonth: "2025-10",
      endMonth: "2026-09",
      ...scope,
    });
  } finally {
    db.query = originalQuery;
  }

  return calls;
}

/** คิวรี่ตัวส่วน — ช่วงความรับผิดชอบของเครื่องในขอบเขต */
const periodsQuery = (calls) => calls.find((c) => c.sql.includes("device_service_period"));

/** คิวรี่ตัวเศษ — เดือนที่แต่ละเครื่องบันทึกยอดไว้แล้ว */
const readingsQuery = (calls) => calls.find((c) => c.sql.includes("FROM print_transactions"));

/** คิวรี่สถานะการตรวจยืนยัน — ตัวที่บอกว่าเดือนไหนยังยืนยันไม่ได้ */
const verificationQuery = (calls) => calls.find((c) => c.sql.includes("installation_status"));

/** ทั้งสามคิวรี่ที่ประกอบกันเป็นตัวเลขความครบถ้วนหนึ่งชุด */
function coverageQueries(calls) {
  const queries = {
    ตัวส่วน: periodsQuery(calls),
    ตัวเศษ: readingsQuery(calls),
    การตรวจยืนยัน: verificationQuery(calls),
  };

  for (const [name, query] of Object.entries(queries)) {
    assert.ok(query, `ไม่พบคิวรี่ของ${name}`);
  }

  return queries;
}

test("ขอบเขตของคิวรี่ที่ใช้คำนวณความครบถ้วน", async (t) => {
  await t.test("เลือกอาคาร: ทุกคิวรี่ต้องกรองด้วยอาคารเดียวกัน", async () => {
    const building = "อาคารศูนย์แพทยศาสตรศึกษา";
    const calls = await withCapturedQueries({ buildingName: building });

    for (const [name, query] of Object.entries(coverageQueries(calls))) {
      assert.match(
        query.sql,
        /b\.name\s*=\s*\?/,
        `คิวรี่ของ${name}ไม่ได้กรองตามอาคาร — ตัวเลขจะมาจากคนละขอบเขตกับคิวรี่อื่น ` +
          "ทำให้เดือนที่ยังไม่ได้กรอกถูกนับว่าครบ"
      );
      assert.ok(query.params.includes(building), `คิวรี่ของ${name}ไม่ได้รับชื่ออาคารเป็นพารามิเตอร์`);
    }
  });

  await t.test("เลือกสัญญา: ทุกคิวรี่ต้องกรองด้วยสัญญาเดียวกัน", async () => {
    const calls = await withCapturedQueries({ contractId: 7 });

    for (const [name, query] of Object.entries(coverageQueries(calls))) {
      assert.match(query.sql, /d\.contract_id\s*=\s*\?/, `คิวรี่ของ${name}ไม่ได้กรองตามสัญญา`);
      assert.ok(query.params.includes(7), `คิวรี่ของ${name}ไม่ได้รับรหัสสัญญาเป็นพารามิเตอร์`);
    }
  });

  await t.test("เลือกทั้งอาคารและสัญญาพร้อมกัน: ต้องลงครบทุกคิวรี่", async () => {
    const calls = await withCapturedQueries({ buildingName: "อาคาร ก", contractId: 3 });

    for (const [name, query] of Object.entries(coverageQueries(calls))) {
      assert.match(query.sql, /b\.name\s*=\s*\?/, `คิวรี่ของ${name}ตกตัวกรองอาคาร`);
      assert.match(query.sql, /d\.contract_id\s*=\s*\?/, `คิวรี่ของ${name}ตกตัวกรองสัญญา`);
    }
  });

  await t.test("ไม่เลือกอะไรเลย: ทุกคิวรี่ต้องไม่กรอง เหมือนกันทั้งหมด", async () => {
    const calls = await withCapturedQueries({});

    for (const [name, query] of Object.entries(coverageQueries(calls))) {
      assert.doesNotMatch(query.sql, /b\.name\s*=\s*\?/, `คิวรี่ของ${name}กรองอาคารทั้งที่ไม่ได้เลือก`);
      assert.doesNotMatch(
        query.sql,
        /d\.contract_id\s*=\s*\?/,
        `คิวรี่ของ${name}กรองสัญญาทั้งที่ไม่ได้เลือก`
      );
    }
  });

  await t.test("ตัวส่วนไม่ถูกตัดด้วยช่วงปีงบ — เครื่องที่อยู่มาก่อนต้องไม่หายไป", async () => {
    // ช่วงความรับผิดชอบหนึ่งช่วงคร่อมหลายปีงบได้ (ติดตั้งปี 2567 ยังใช้อยู่ถึงวันนี้)
    // ถ้ากรองด้วย effective_from BETWEEN ช่วงปีงบ ช่วงแบบนั้นจะถูกตัดทิ้งทั้งช่วง
    // แล้วเครื่องที่อยู่มานานที่สุดจะหายออกจากตัวส่วน ทำให้ความครบถ้วนดูดีเกินจริง
    const calls = await withCapturedQueries({});

    assert.doesNotMatch(
      periodsQuery(calls).sql,
      /effective_from\s+BETWEEN/i,
      "คิวรี่ตัวส่วนตัดช่วงด้วยปีงบ ซึ่งจะทำให้ช่วงที่คร่อมปีงบหายไปทั้งช่วง"
    );
  });
});
