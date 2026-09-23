// apps/api/src/devices/location-history-date.test.js
//
// ประวัติที่ตั้งต้องลงวันที่ตามเวลาไทย แบบเดียวกับช่วงรับผิดชอบยอดและช่วงคิดเงิน (#151)
//
// เดิมใช้ new Date().toISOString() ซึ่งเป็นวันที่ UTC — เพิ่มหรือย้ายเครื่องระหว่าง 00:00–06:59
// เวลาไทยได้วันที่เมื่อวาน ถ้าเป็นวันที่ 1 ยอดทั้งเดือนก่อนไปตกที่หน่วยงานใหม่ (เดือนที่ย้ายเป็น
// ของที่ตั้งใหม่ทั้งเดือน) และวันที่ 1 ต.ค. ข้ามไปแตะปีงบก่อน

const test = require("node:test");
const assert = require("node:assert/strict");

const { recordLocationHistory } = require("./controller");

// 1 ต.ค. 2569 เวลา 01:30 น. ที่กรุงเทพฯ = 30 ก.ย. 18:30 UTC
const BANGKOK_OCT_1_EARLY = Date.UTC(2026, 8, 30, 18, 30);

/** connection ปลอมที่จำคำสั่งไว้ — latest = ช่วงที่เปิดอยู่ (หรือ undefined ถ้าเครื่องใหม่) */
function fakeConnection(latest) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql: String(sql), params });
      if (/SELECT \* FROM device_location_history/.test(sql)) return [[latest].filter(Boolean)];
      return [{ affectedRows: 1, insertId: 99 }];
    },
  };
}

const place = { building_id: 2, floor_id: 3, location: "ห้อง 1", division_id: 4, department_id: 5 };

test("เครื่องใหม่ตอน 01:30 น. วันที่ 1 ต.ค. เปิดช่วงที่ตั้งวันที่ 1 ต.ค. ไม่ใช่ 30 ก.ย.", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: BANGKOK_OCT_1_EARLY });
  const conn = fakeConnection(undefined);
  await recordLocationHistory(conn, 7, place);
  const insert = conn.calls.find((call) => call.sql.includes("INSERT INTO device_location_history"));
  assert.equal(insert.params.at(-1), "2026-10-01");
});

test("ย้ายเครื่องตอน 01:30 น. วันที่ 1 ต.ค. ปิดช่วงเดิมและเปิดช่วงใหม่วันที่ 1 ต.ค.", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: BANGKOK_OCT_1_EARLY });
  const conn = fakeConnection({ id: 11, ...place, effective_from: "2026-01-01", effective_to: null });
  await recordLocationHistory(conn, 7, { ...place, department_id: 6 });
  const close = conn.calls.find((call) => call.sql.includes("UPDATE device_location_history SET effective_to"));
  const insert = conn.calls.find((call) => call.sql.includes("INSERT INTO device_location_history"));
  assert.equal(close.params[0], "2026-10-01");
  assert.equal(insert.params.at(-1), "2026-10-01");
});

test("วันเริ่มสัญญาของเครื่องจากไฟล์นำเข้าเทียบกับ 'วันนี้' ตามเวลาไทย", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: BANGKOK_OCT_1_EARLY });
  const conn = fakeConnection(undefined);
  // สัญญาเริ่มวันนี้ (เวลาไทย) — ต้องใช้วันเริ่มสัญญา ไม่ถูกมองว่าเป็นวันในอนาคต
  await recordLocationHistory(conn, 7, place, "2026-10-01");
  const insert = conn.calls.find((call) => call.sql.includes("INSERT INTO device_location_history"));
  assert.equal(insert.params.at(-1), "2026-10-01");
});
