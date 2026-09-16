// apps/api/src/devices/contract-history.js
//
// "เดือนนั้นเครื่องนี้ถูกคิดเงินภายใต้สัญญาไหน ราคาเท่าไหร่" — ฝั่งเขียนของ ADR-0019
//
// ## ทำไมต้องมีประวัติ ไม่ใช่แค่ devices.contract_id
//
// devices.contract_id กับ devices.price_override เป็น "ค่าปัจจุบัน" แต่ถูกใช้ตอบ
// คำถามย้อนหลัง การย้ายเครื่องไปสัญญาของปีงบใหม่จึงเปลี่ยนยอดเงินของเดือนเก่าทันที
// ทั้งที่เดือนเก่าถูกคิดตามสัญญาเดิมไปแล้วจริงๆ — issue #81 แก้ไม่ได้อย่างปลอดภัย
// ถ้าไม่มีตารางนี้
//
// โครงเหมือน recordLocationHistory ทุกประการโดยตั้งใจ: ปิดช่วงเดิม เปิดช่วงใหม่
// เฉพาะเมื่อค่าที่บันทึกเปลี่ยนจริง ทีมอ่านไฟล์นั้นเข้าใจแล้วจะอ่านไฟล์นี้ออกทันที
//
// ## วันที่ต้องมาจากคน ไม่ใช่จากระบบ
//
// ADR-0019 Q26 ห้ามอนุมานวันที่ราคามีผลจากวันที่แก้ข้อมูลในระบบ ผู้เรียกจึงต้องส่ง
// `effectiveFrom` มาเสมอ — ค่าที่ควรส่งคือวันที่ผู้ดูแลระบุ หรือ "วันนี้" เมื่อ
// ผู้ดูแลเพิ่งลงมือเปลี่ยนเอง (ซึ่งเป็นข้อเท็จจริงที่เพิ่งเกิด ไม่ใช่การเดาอดีต)

const { today } = require("./service-period");

/** ช่วงการคิดเงินที่ยังเปิดอยู่ของเครื่องนี้ (ถ้ามี) */
async function openBillingPeriod(conn, deviceId) {
  const [[row]] = await conn.query(
    `SELECT id, contract_id, price_override, effective_from
     FROM device_contract_history
     WHERE device_id = ? AND effective_to IS NULL
     ORDER BY effective_from DESC, id DESC LIMIT 1`,
    [deviceId]
  );
  return row;
}

/** ค่าที่บันทึกไว้ในช่วงล่าสุด ตรงกับสิ่งที่กำลังจะบันทึกหรือไม่ */
function sameArrangement(period, { contractId, priceOverride }) {
  if (!period) return false;

  const samePrice =
    (period.price_override === null || period.price_override === undefined
      ? null
      : String(period.price_override)) ===
    (priceOverride === null || priceOverride === undefined ? null : String(priceOverride));

  return (period.contract_id ?? null) === (contractId ?? null) && samePrice;
}

/**
 * บันทึกว่าเครื่องนี้ถูกคิดเงินอย่างไร ตั้งแต่วันที่ระบุเป็นต้นไป
 *
 * ไม่ทำอะไรถ้าค่าตรงกับช่วงที่เปิดอยู่แล้ว — กดบันทึกซ้ำโดยไม่ได้แก้อะไรต้องไม่
 * สร้างแถวประวัติขยะ (บทเรียนเดียวกับ recordLocationHistory)
 *
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {number} deviceId
 * @param {{ contractId: number|null, priceOverride: string|number|null }} arrangement
 * @param {string} effectiveFrom วันที่เริ่มมีผล "YYYY-MM-DD"
 * @param {{ note?: string|null }} [options]
 */
async function recordContractHistory(conn, deviceId, arrangement, effectiveFrom, options = {}) {
  const open = await openBillingPeriod(conn, deviceId);
  if (sameArrangement(open, arrangement)) return;

  if (open) {
    // ช่วงใหม่เริ่มก่อนช่วงเดิม = ผู้ดูแลกำลังแก้ประวัติย้อนหลัง ปิดช่วงเดิมที่
    // วันเดียวกับที่เริ่มช่วงใหม่ไม่ได้เพราะจะได้ช่วงที่จบก่อนเริ่ม — ทับช่วงเดิมแทน
    if (open.effective_from >= effectiveFrom) {
      await conn.query("DELETE FROM device_contract_history WHERE id = ?", [open.id]);
    } else {
      await conn.query("UPDATE device_contract_history SET effective_to = ? WHERE id = ?", [
        effectiveFrom,
        open.id,
      ]);
    }
  }

  await conn.query(
    `INSERT INTO device_contract_history
       (device_id, contract_id, price_override, effective_from, effective_to, note)
     VALUES (?, ?, ?, ?, NULL, ?)`,
    [
      deviceId,
      arrangement.contractId ?? null,
      arrangement.priceOverride ?? null,
      effectiveFrom,
      options.note ?? null,
    ]
  );
}

/**
 * เปิดช่วงการคิดเงินให้เครื่องทุกเครื่องที่ผูกกับสัญญาฉบับนี้ ครอบคลุมช่วงของสัญญา
 *
 * เรียกตอนผู้ดูแลกดยืนยันช่วงที่สัญญามีผล — เป็นการบันทึกสิ่งที่เพิ่งถูกรับรองว่า
 * "สัญญาฉบับนี้ครอบคลุมช่วงนี้ และเครื่องกลุ่มนี้อยู่ในสัญญาฉบับนี้"
 *
 * ข้ามเครื่องที่มีช่วงครอบคลุมวันเริ่มของสัญญาอยู่แล้ว เพื่อไม่ให้การกดยืนยันซ้ำ
 * ไปทับประวัติที่ผู้ดูแลตั้งใจบันทึกไว้เอง
 *
 * @returns {Promise<number>} จำนวนเครื่องที่ถูกเปิดช่วงให้
 */
async function openPeriodsForContract(conn, contractId, { from, to }) {
  const [devices] = await conn.query(
    `SELECT d.id, d.price_override
     FROM devices d
     WHERE d.contract_id = ?
       AND NOT EXISTS (
         SELECT 1 FROM device_contract_history h
         WHERE h.device_id = d.id
           AND h.effective_from <= ?
           AND (h.effective_to IS NULL OR h.effective_to >= ?)
       )`,
    [contractId, from, from]
  );

  for (const device of devices) {
    await conn.query(
      `INSERT INTO device_contract_history
         (device_id, contract_id, price_override, effective_from, effective_to, note)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [device.id, contractId, device.price_override ?? null, from, to, "ยืนยันช่วงที่สัญญามีผล"]
    );
  }

  return devices.length;
}

module.exports = { openBillingPeriod, recordContractHistory, openPeriodsForContract, today };
