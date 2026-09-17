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
 * ลบช่วง "ไม่มีสัญญา" ที่เริ่มตั้งแต่วันที่ผู้ดูแลเพิ่งยืนยัน
 *
 * กติกาช่วงที่เริ่มทีหลังชนะ (ADR-0014/0019) ทำให้ช่วงเหล่านี้ยังชนะช่วงที่เพิ่ง
 * บันทึกในเดือนของมัน — เช่นเครื่องที่ติดตั้งกลางเดือนก่อนผูกสัญญา การบันทึกวันที่
 * ที่ตรวจจากเอกสารแล้วจึงไม่มีผลกับยอดเลย (#96)
 *
 * ลบเฉพาะช่วงที่ไม่คิดเงินกับอะไรเลย ช่วงของสัญญาอื่นหรือราคาเฉพาะเครื่องคือการ
 * คิดเงินที่มีคนบันทึกไว้ จึงคงไว้และยังชนะเดือนของมันเหมือนเดิม — วันที่ที่ระบบ
 * เสนอจากงานค้างต้องไม่ลบยอดที่คิดเงินถูกต้องอยู่แล้วเพียงเพราะผู้ใช้กดบันทึก
 *
 * @param {number|null} keepId ช่วงที่กำลังจะขยาย ซึ่งต้องไม่ถูกลบไปด้วย
 */
async function removeNoContractPeriodsFrom(conn, deviceId, effectiveFrom, keepId = null) {
  await conn.query(
    `DELETE FROM device_contract_history
     WHERE device_id = ? AND effective_from >= ? AND id <> ?
       AND contract_id IS NULL AND price_override IS NULL`,
    [deviceId, effectiveFrom, keepId ?? 0]
  );
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
  if (sameArrangement(open, arrangement)) {
    // ผู้ดูแลอาจกำลังยืนยันว่า arrangement ปัจจุบันเริ่มก่อนวันที่ที่เคยบันทึกไว้
    // (เช่นเครื่องผูกสัญญาแล้ว แต่ประวัติเดิมเริ่มวันนี้จนยอดเดือนเก่ายังไม่มีราคา)
    // การกดบันทึกค่าเดิมพร้อมวันที่ย้อนหลังจึงต้องขยายช่วง ไม่ใช่ถูกมองเป็น no-op
    if (effectiveFrom < open.effective_from) {
      await removeNoContractPeriodsFrom(conn, deviceId, effectiveFrom, open.id);
      await conn.query(
        `UPDATE device_contract_history
         SET effective_from = ?, note = COALESCE(?, note)
         WHERE id = ?`,
        [effectiveFrom, options.note ?? null, open.id]
      );
    }
    return;
  }

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
  await removeNoContractPeriodsFrom(conn, deviceId, effectiveFrom);

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
 * ถ้าช่วงที่ครอบวันเริ่มเป็นสัญญาและราคาเดียวกัน ให้ขยายวันสิ้นสุดตามการยืนยัน
 * รอบล่าสุด (ไม่หด); ถ้าเป็นคนละสัญญาหรือคนละราคาให้ข้ามเพื่อไม่ทับประวัติที่ผู้ดูแล
 * ตั้งใจบันทึกไว้เอง
 *
 * @returns {Promise<number>} จำนวนเครื่องที่ถูกสร้างหรือปรับช่วงให้
 */
async function openPeriodsForContract(conn, contractId, { from, to }) {
  const [devices] = await conn.query(
    `SELECT
       d.id,
       d.price_override,
       h.id AS history_id,
       h.contract_id AS history_contract_id,
       h.price_override AS history_price_override,
       h.effective_to AS history_effective_to,
       -- ช่วงถัดไปนับจากวันเริ่มสัญญา ช่วงที่เริ่มหลังช่วงนี้แต่จบก่อนวันเริ่มสัญญา
       -- ไม่เกี่ยว ถ้านับด้วยจะตัดช่วงนี้ให้จบก่อนสัญญาเริ่ม
       (SELECT MIN(h3.effective_from)
          FROM device_contract_history h3
         WHERE h3.device_id = d.id
           AND h3.effective_from > ?) AS next_effective_from
     FROM devices d
     LEFT JOIN device_contract_history h ON h.id = (
         SELECT h2.id FROM device_contract_history h2
         WHERE h2.device_id = d.id
           AND h2.effective_from <= ?
           AND (h2.effective_to IS NULL OR h2.effective_to >= ?)
         ORDER BY h2.effective_from DESC, h2.id DESC
         LIMIT 1
       )
     WHERE d.contract_id = ?`,
    [from, from, from, contractId]
  );

  let changed = 0;
  for (const device of devices) {
    if (device.history_id) {
      const history = {
        contract_id: device.history_contract_id,
        price_override: device.history_price_override,
      };

      // ยืนยันซ้ำหลังเลื่อนวันสิ้นสุดออกไปต้องขยายช่วงเดิมด้วย ไม่ใช่อัปเดตเฉพาะ
      // contracts แล้วปล่อยประวัติเครื่องค้างที่วันเก่า (#96)
      // ช่วงที่ยังเปิดอยู่คือ arrangement ปัจจุบัน ไม่ต้องขยาย และห้ามปิด — ราคาถูก
      // จำกัดด้วยช่วงของสัญญาใน v_monthly_kpi อยู่แล้ว
      if (
        sameArrangement(history, { contractId, priceOverride: device.price_override })
        && device.history_effective_to != null
      ) {
        // ห้ามขยายทะลุช่วงถัดไปแล้วทำให้สัญญาเก่า "ฟื้น" หลังช่วงถัดไปสิ้นสุด
        // ช่วงซ้อนที่เดือนรอยต่อยังเลือกช่วงเริ่มล่าสุดตาม ADR-0019 เหมือนเดิม
        const effectiveTo = device.next_effective_from && device.next_effective_from < to
          ? device.next_effective_from
          : to;
        // ขยายเท่านั้น ไม่หด — ราคาของสัญญาถูกจำกัดด้วยช่วงของสัญญาอยู่แล้ว แต่ราคา
        // เฉพาะเครื่องไม่ขึ้นกับช่วงนั้น การหดจึงทำให้เดือนที่คิดเงินถูกแล้วหายราคา
        if (device.history_effective_to >= effectiveTo) continue;
        await conn.query(
          "UPDATE device_contract_history SET effective_to = ? WHERE id = ?",
          [effectiveTo, device.history_id]
        );
        changed += 1;
      }
      continue;
    }

    await conn.query(
      `INSERT INTO device_contract_history
         (device_id, contract_id, price_override, effective_from, effective_to, note)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [device.id, contractId, device.price_override ?? null, from, to, "ยืนยันช่วงที่สัญญามีผล"]
    );
    changed += 1;
  }

  return changed;
}

module.exports = { openBillingPeriod, recordContractHistory, openPeriodsForContract, today };
