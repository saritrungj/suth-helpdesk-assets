// apps/api/src/devices/contract-history.test.js
//
// ฝั่งเขียนของประวัติการคิดเงิน (ADR-0019) — คำสั่งที่ส่งไปฐานข้อมูลเมื่อยืนยันช่วง
// สัญญาหรือบันทึกวันที่เริ่มคิดเงินของเครื่อง ผลกับข้อมูลจริงตรวจใน e2e ชุด db
// (report-workflow.spec.js) ซึ่งล้มเมื่อถอดการแก้ของ #96 ออก

const test = require("node:test");
const assert = require("node:assert/strict");

const { recordContractHistory } = require("./contract-history");

const squash = (sql) => String(sql).replace(/\s+/g, " ").trim();

/** ฐานข้อมูลปลอมที่ตอบคำถาม SELECT ด้วยแถวที่ให้ไว้ และบันทึกทุกคำสั่งที่เขียน */
function fakeConnection(selectRows) {
  const calls = [];
  return {
    calls,
    writes: () => calls.filter((call) => !call.sql.startsWith("SELECT")),
    async query(sql, params) {
      calls.push({ sql: squash(sql), params });
      if (squash(sql).startsWith("SELECT")) return [selectRows];
      return [{ affectedRows: 1 }];
    },
  };
}


function deviceWithHistory(history) {
  return {
    id: 7,
    price_override: null,
    history_id: 12,
    history_contract_id: 3,
    history_price_override: null,
    history_effective_to: "2026-01-15",
    next_effective_from: null,
    ...history,
  };
}

const openPeriod = (period) => [{ id: 12, contract_id: 3, price_override: null, effective_from: "2026-09-16", ...period }];

test("saving the same contract with an earlier reviewed date moves the open period back", async () => {
  const conn = fakeConnection(openPeriod());

  await recordContractHistory(conn, 7, { contractId: 3, priceOverride: null }, "2025-10-01", {
    note: "ตรวจเอกสารย้อนหลัง",
  });

  const writes = conn.writes();
  assert.equal(writes.length, 2);
  assert.ok(!writes.some((call) => call.sql.startsWith("INSERT")), "no duplicate period for the same arrangement");
  assert.match(writes[1].sql, /SET effective_from = \?, note = COALESCE\(\?, note\) WHERE id = \?/);
  assert.deepEqual(writes[1].params, ["2025-10-01", "ตรวจเอกสารย้อนหลัง", 12]);
});

test("an earlier reviewed date removes only later no-contract periods", async () => {
  // ช่วง "ไม่มีสัญญา" ที่เริ่มกลางเดือนจะชนะช่วงที่ขยายกลับไปวันที่ 1 ตามกติกา
  // ช่วงที่เริ่มทีหลังชนะ ส่วนช่วงของสัญญาอื่นคือการคิดเงินที่มีคนบันทึกไว้ ห้ามลบ
  const conn = fakeConnection(openPeriod({ effective_from: "2025-11-01" }));

  await recordContractHistory(conn, 7, { contractId: 3, priceOverride: null }, "2025-10-01");

  const [removed, moved] = conn.writes();
  assert.equal(
    removed.sql,
    "DELETE FROM device_contract_history WHERE device_id = ? AND effective_from >= ? AND id <> ? AND contract_id IS NULL AND price_override IS NULL"
  );
  assert.deepEqual(removed.params, [7, "2025-10-01", 12]);
  assert.match(moved.sql, /SET effective_from = \?/);
});

test("saving the same arrangement with a later or equal date changes nothing", async () => {
  const conn = fakeConnection(openPeriod());

  await recordContractHistory(conn, 7, { contractId: 3, priceOverride: null }, "2026-09-16");

  assert.deepEqual(conn.writes(), []);
});

test("equivalent decimal price overrides do not create duplicate periods", async () => {
  const conn = fakeConnection(openPeriod({ price_override: "0.4000" }));

  await recordContractHistory(conn, 7, { contractId: 3, priceOverride: 0.4 }, "2026-09-16");

  assert.deepEqual(conn.writes(), []);
});

test("changing the contract from an earlier date replaces the open period", async () => {
  const conn = fakeConnection(openPeriod({ effective_from: "2026-03-01" }));

  await recordContractHistory(conn, 7, { contractId: 4, priceOverride: null }, "2025-11-01");

  const writes = conn.writes();
  assert.deepEqual(writes[0], { sql: "DELETE FROM device_contract_history WHERE id = ?", params: [12] });
  assert.match(writes[1].sql, /contract_id IS NULL AND price_override IS NULL/);
  assert.deepEqual(writes[1].params, [7, "2025-11-01", 0]);
  assert.match(writes[2].sql, /^INSERT INTO device_contract_history/);
  assert.deepEqual(writes[2].params, [7, 4, null, "2025-11-01", null]);
});

test("changing the contract from today closes the open period today", async () => {
  const conn = fakeConnection(openPeriod({ effective_from: "2025-10-01" }));

  await recordContractHistory(conn, 7, { contractId: 4, priceOverride: null }, "2026-09-16");

  const writes = conn.writes();
  assert.deepEqual(writes[0], {
    sql: "UPDATE device_contract_history SET effective_to = ? WHERE id = ?",
    params: ["2026-09-16", 12],
  });
  assert.match(writes[2].sql, /^INSERT INTO device_contract_history/);
});
