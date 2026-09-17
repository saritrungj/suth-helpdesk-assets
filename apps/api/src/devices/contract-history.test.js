// apps/api/src/devices/contract-history.test.js
//
// ฝั่งเขียนของประวัติการคิดเงิน (ADR-0019) — คำสั่งที่ส่งไปฐานข้อมูลเมื่อยืนยันช่วง
// สัญญาหรือบันทึกวันที่เริ่มคิดเงินของเครื่อง ผลกับข้อมูลจริงตรวจใน e2e ชุด db
// (report-workflow.spec.js) ซึ่งล้มเมื่อถอดการแก้ของ #96 ออก

const test = require("node:test");
const assert = require("node:assert/strict");

const { openPeriodsForContract, recordContractHistory } = require("./contract-history");

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

const TERM = { from: "2025-10-01", to: "2026-09-30" };

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

test("confirming an extended contract term updates the matching device history", async () => {
  const conn = fakeConnection([deviceWithHistory()]);

  const changed = await openPeriodsForContract(conn, 3, TERM);

  assert.equal(changed, 1);
  assert.deepEqual(conn.writes(), [
    { sql: "UPDATE device_contract_history SET effective_to = ? WHERE id = ?", params: ["2026-09-30", 12] },
  ]);
});

test("the next period is looked up from the contract start, not from the old period's start", async () => {
  const conn = fakeConnection([]);

  await openPeriodsForContract(conn, 3, TERM);

  assert.match(conn.calls[0].sql, /h3\.effective_from > \?\) AS next_effective_from/);
  assert.deepEqual(conn.calls[0].params, ["2025-10-01", "2025-10-01", "2025-10-01", 3]);
});

test("confirming a contract does not overwrite another contract's history", async () => {
  const conn = fakeConnection([deviceWithHistory({ history_contract_id: 99 })]);

  assert.equal(await openPeriodsForContract(conn, 3, TERM), 0);
  assert.deepEqual(conn.writes(), []);
});

test("confirming a contract does not overwrite a device-specific price", async () => {
  const conn = fakeConnection([deviceWithHistory({ price_override: "0.30", history_price_override: "0.25" })]);

  assert.equal(await openPeriodsForContract(conn, 3, TERM), 0);
  assert.deepEqual(conn.writes(), []);
});

test("extending a contract stops at the next history period", async () => {
  const conn = fakeConnection([
    deviceWithHistory({ history_effective_to: "2025-12-31", next_effective_from: "2026-01-01" }),
  ]);

  assert.equal(await openPeriodsForContract(conn, 3, TERM), 1);
  assert.deepEqual(conn.writes()[0].params, ["2026-01-01", 12]);
});

test("confirming a shorter or equal term never cuts a device period", async () => {
  // ราคาของสัญญาถูกจำกัดด้วยช่วงของสัญญาใน view อยู่แล้ว การหดช่วงของเครื่องจึงไม่ช่วย
  // อะไร แต่ทำให้เครื่องที่มีราคาเฉพาะเครื่องเสียราคาของเดือนหลังวันสิ้นสุดไป — เกิดจริง
  // เมื่อกดยืนยัน CT-001/2569 ซ้ำด้วยวันเดิม ยอด ก.พ.–ส.ค. ของสองเครื่องหายราคา (#96)
  const conn = fakeConnection([
    deviceWithHistory({ price_override: "0.40", history_price_override: "0.40", history_effective_to: "2026-09-30" }),
  ]);

  assert.equal(await openPeriodsForContract(conn, 3, { from: "2025-10-01", to: "2026-01-15" }), 0);
  assert.deepEqual(conn.writes(), []);
});

test("confirming the same term twice changes nothing", async () => {
  const conn = fakeConnection([deviceWithHistory({ history_effective_to: "2026-09-30" })]);

  assert.equal(await openPeriodsForContract(conn, 3, TERM), 0);
  assert.deepEqual(conn.writes(), []);
});

test("confirming a contract leaves a device's open billing period open", async () => {
  // ช่วงที่เปิดอยู่คือ arrangement ปัจจุบันของเครื่อง ราคาถูกจำกัดด้วยช่วงของสัญญาใน
  // view อยู่แล้ว ถ้าปิดมันที่วันสิ้นสุดสัญญา การบันทึกเครื่องครั้งถัดไปจะหาช่วงเปิด
  // ไม่เจอแล้วสร้างแถวประวัติซ้ำ
  const conn = fakeConnection([deviceWithHistory({ history_effective_to: null })]);

  assert.equal(await openPeriodsForContract(conn, 3, TERM), 0);
  assert.deepEqual(conn.writes(), []);
});

test("confirming a contract creates history when the device has none", async () => {
  const conn = fakeConnection([
    deviceWithHistory({ price_override: "0.25", history_id: null, history_contract_id: null, history_effective_to: null }),
  ]);

  assert.equal(await openPeriodsForContract(conn, 3, TERM), 1);
  assert.deepEqual(conn.writes()[0].params, [7, 3, "0.25", "2025-10-01", "2026-09-30", "ยืนยันช่วงที่สัญญามีผล"]);
});

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
