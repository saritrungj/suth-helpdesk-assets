// apps/api/src/devices/meters.js
//
// มิเตอร์ของเครื่อง และด่านสุดท้ายก่อนยอดพิมพ์เข้าฐาน (ADR-0021, ADR-0023)
//
// ## มิเตอร์หลัก
//
// เครื่องหนึ่งมีได้หลายมิเตอร์ แต่การกรอกยอดด้วยมือบนหน้าจอเป็น "หนึ่งช่องต่อเครื่อง
// ต่อเดือน" ช่องนั้นคือมิเตอร์ขาวดำของเครื่อง มิเตอร์สีเข้าระบบทางไฟล์ของผู้ให้เช่า
// เท่านั้น ซึ่งระบุชัดว่าแถวไหนเป็นมิเตอร์สี
//
// ## ทำไมต้องปฏิเสธยอดที่หาราคาไม่ได้ตั้งแต่ขาเข้า
//
// ADR-0021 ให้ราคาในสัญญามีผลทันที หน้าภาพรวมจึงไม่มีสถานะ "รอราคา" อีก ข้อนั้นเป็น
// จริงได้ก็ต่อเมื่อไม่มียอดที่หาราคาไม่ได้หลุดเข้าฐาน การตรวจที่นี่ถามคำถามเดียวกับ
// ที่รายงานถาม คืออ่านจาก v_monthly_kpi หลังเขียนใน transaction เดียวกัน ถ้ามีแถวที่
// ราคาเป็น NULL ให้โยนทิ้งทั้งชุด — กฎการหาราคาจึงอยู่ใน view ที่เดียว ไม่ถูกเขียนซ้ำ

const { badRequest } = require("../shared/http-error");

/** หมวดของมิเตอร์หลักที่สร้างให้เครื่องที่ยังไม่มีมิเตอร์ */
const DEFAULT_CATEGORY_CODE = "bw";

/**
 * มิเตอร์ขาวดำของเครื่อง — สร้างให้ถ้ายังไม่มี
 *
 * ทุกเครื่องควรมีมิเตอร์ตั้งแต่ตอนลงทะเบียน การสร้างที่นี่มีไว้กันเครื่องเก่าที่หลุด
 * มาโดยไม่มีมิเตอร์ ถ้าหมวดทั่วไปไม่มีราคาในสัญญาของเครื่อง ด่านราคาด้านล่างจะ
 * ปฏิเสธพร้อมบอกเหตุผล ไม่มีทางกลายเป็นยอดเงินผิดเงียบๆ
 *
 * @returns {Promise<number>}
 */
async function primaryMeterId(conn, deviceId) {
  const [[meter]] = await conn.query(
    `SELECT dm.id
     FROM device_meter dm
     JOIN meter_category mc ON mc.id = dm.category_id
     WHERE dm.device_id = ? AND mc.is_color = 0
     ORDER BY mc.sort_order, dm.id
     LIMIT 1`,
    [deviceId]
  );
  if (meter) return meter.id;

  const [result] = await conn.query(
    `INSERT INTO device_meter (device_id, category_id)
     SELECT ?, id FROM meter_category WHERE code = ?`,
    [deviceId, DEFAULT_CATEGORY_CODE]
  );
  return result.insertId;
}

/**
 * ตั้งหมวดของมิเตอร์หลัก (ใช้ตอนลงทะเบียนหรือแก้เครื่อง)
 *
 * เปลี่ยนหมวดของมิเตอร์เดิม ไม่สร้างมิเตอร์ใหม่ เพราะยอดเดิมของมิเตอร์นี้ต้องตาม
 * ไปด้วย — การย้ายหมวดคือการบอกว่าเครื่องนี้ถูกคิดราคาผิดหมวดมาตลอด
 */
async function setPrimaryMeterCategory(conn, deviceId, categoryId) {
  const meterId = await primaryMeterId(conn, deviceId);
  if (categoryId) {
    const [[category]] = await conn.query(
      "SELECT id, is_color FROM meter_category WHERE id = ?",
      [categoryId]
    );
    if (!category) throw badRequest("ไม่พบหมวดมิเตอร์ที่เลือก", { code: "meter_category_not_found" });
    if (category.is_color) {
      throw badRequest("มิเตอร์หลักต้องเป็นหมวดขาวดำ", { code: "primary_meter_must_be_monochrome" });
    }
    await conn.query("UPDATE device_meter SET category_id = ? WHERE id = ?", [categoryId, meterId]);
  }
  return meterId;
}

/**
 * ตั้งมิเตอร์ของเครื่องตามที่ฟอร์มส่งมา — หมวดของมิเตอร์หลัก และมีมิเตอร์สีหรือไม่
 *
 * ไม่ส่งค่ามา (undefined) = ไม่แตะ ถอดมิเตอร์สีได้เฉพาะเมื่อยังไม่มียอดพิมพ์ ไม่งั้น
 * ยอดสีที่คิดเงินไปแล้วจะหายจากรายงานทั้งก้อน
 *
 * @param {{ primaryCategoryId?: number|null, hasColorMeter?: boolean|null }} meters
 */
async function setDeviceMeters(conn, deviceId, { primaryCategoryId, hasColorMeter } = {}) {
  await setPrimaryMeterCategory(conn, deviceId, primaryCategoryId ?? null);
  if (hasColorMeter === undefined || hasColorMeter === null) return;

  const [[color]] = await conn.query(
    `SELECT dm.id,
            (SELECT COUNT(*) FROM print_transactions pt WHERE pt.meter_id = dm.id) AS readings
     FROM device_meter dm
     JOIN meter_category mc ON mc.id = dm.category_id
     WHERE dm.device_id = ? AND mc.is_color = 1
     LIMIT 1`,
    [deviceId]
  );

  if (hasColorMeter && !color) {
    await conn.query(
      `INSERT INTO device_meter (device_id, category_id)
       SELECT ?, id FROM meter_category WHERE is_color = 1 ORDER BY sort_order LIMIT 1`,
      [deviceId]
    );
  } else if (!hasColorMeter && color) {
    if (Number(color.readings) > 0) {
      throw badRequest("ถอดมิเตอร์สีไม่ได้ เพราะมียอดพิมพ์สีบันทึกไว้แล้ว", { code: "color_meter_in_use" });
    }
    await conn.query("DELETE FROM device_meter WHERE id = ?", [color.id]);
  }
}

/**
 * บอกสาเหตุที่ยอดหนึ่งหาราคาไม่ได้ เป็นภาษาที่ผู้ดูแลแก้ต่อได้
 */
function unpricedReason(row) {
  if (!row.history_id) return "เครื่องยังไม่ได้ผูกสัญญาในเดือนนี้";
  if (!row.contract_id) return "ประวัติการคิดเงินระบุว่าเดือนนี้เครื่องไม่มีสัญญา";
  if (!row.in_term) return `เดือนนี้อยู่นอกอายุสัญญา ${row.contract_no}`;
  return `สัญญา ${row.contract_no} ไม่มีราคาหมวด "${row.category_name}"`;
}

/**
 * โยน 400 ถ้ายอดที่เพิ่งเขียนมีรายการที่หาราคาไม่ได้ — ต้องเรียกใน transaction
 * เดียวกับการเขียน เพื่อให้ withTransaction ย้อนทั้งชุด
 *
 * @param {Array<{ meterId: number, month: string }>} readings
 * @param {Set<string>} [alreadyUnpriced] "meterId|month" ที่หาราคาไม่ได้อยู่ก่อนแล้ว — ไม่นับว่าเป็นความผิดของการแก้ครั้งนี้
 */
async function assertReadingsPriced(conn, readings, alreadyUnpriced = new Set()) {
  if (!readings.length) return;

  const months = [...new Set(readings.map((r) => r.month))];
  const meterIds = [...new Set(readings.map((r) => r.meterId))];

  const [rows] = await conn.query(
    `SELECT v.meter_id, v.month, v.serial_number, v.meter_category AS category_name,
            dch.id AS history_id, c.id AS contract_id, c.contract_no,
            (c.id IS NOT NULL
             AND v.month >= DATE_FORMAT(c.effective_from + INTERVAL (DAY(c.effective_from) > 1) MONTH, '%Y-%m')
             AND v.month <= DATE_FORMAT(c.effective_to, '%Y-%m')) AS in_term
     FROM v_monthly_kpi v
     LEFT JOIN device_contract_history dch ON dch.id = (
       SELECT h.id FROM device_contract_history h
       WHERE h.device_id = v.device_id
         AND v.month >= DATE_FORMAT(h.effective_from, '%Y-%m')
         AND (h.effective_to IS NULL OR v.month <= DATE_FORMAT(h.effective_to, '%Y-%m'))
       ORDER BY h.effective_from DESC, h.id DESC LIMIT 1
     )
     LEFT JOIN contracts c ON c.id = dch.contract_id
     WHERE v.month IN (?) AND v.meter_id IN (?) AND v.price_per_page IS NULL`,
    [months, meterIds]
  );

  const wanted = new Set(readings.map((r) => `${r.meterId}|${r.month}`));
  const problems = rows.filter((row) => {
    const key = `${row.meter_id}|${row.month}`;
    return wanted.has(key) && !alreadyUnpriced.has(key);
  });
  if (!problems.length) return;

  throw badRequest("บันทึกไม่ได้ เพราะยอดบางรายการหาราคาไม่ได้ — แก้สัญญาหรือเครื่องก่อน แล้วบันทึกใหม่", {
    code: "unpriced_reading",
    errors: problems.slice(0, 50).map((row) => ({
      serial_number: row.serial_number,
      month: row.month,
      reason: unpricedReason(row),
    })),
  });
}

/**
 * "meterId|month" ของยอดเครื่องนี้ที่หาราคาไม่ได้อยู่แล้ว — เรียกก่อนแก้เครื่อง แล้วส่งให้
 * assertDeviceReadingsPriced เพื่อให้ปฏิเสธเฉพาะยอดที่การแก้ครั้งนี้ทำให้หาราคาไม่ได้
 * (ข้อมูลเก่าที่ผิดอยู่แล้วต้องไม่ล็อกการแก้อื่นของเครื่อง เช่น เลข Serial ที่พิมพ์ผิด)
 */
async function unpricedDeviceReadingKeys(conn, deviceId) {
  const [rows] = await conn.query(
    "SELECT meter_id, month FROM v_monthly_kpi WHERE device_id = ? AND price_per_page IS NULL",
    [deviceId]
  );
  return new Set(rows.map((row) => `${row.meter_id}|${row.month}`));
}

/** ตรวจยอดเดิมทั้งหมดของเครื่องหลังเปลี่ยนสัญญา ราคาเฉพาะเครื่อง หรือหมวดมิเตอร์ */
async function assertDeviceReadingsPriced(conn, deviceId, alreadyUnpriced = new Set()) {
  const [readings] = await conn.query(
    `SELECT pt.meter_id AS meterId, pt.month
     FROM print_transactions pt
     JOIN device_meter dm ON dm.id = pt.meter_id
     WHERE dm.device_id = ?`,
    [deviceId]
  );
  await assertReadingsPriced(conn, readings, alreadyUnpriced);
}

module.exports = {
  primaryMeterId,
  setPrimaryMeterCategory,
  setDeviceMeters,
  assertReadingsPriced,
  assertDeviceReadingsPriced,
  unpricedDeviceReadingKeys,
  unpricedReason,
};
