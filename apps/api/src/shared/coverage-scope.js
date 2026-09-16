// apps/api/src/shared/coverage-scope.js
//
// ที่มาของตัวเลข "ความครบถ้วนของยอดพิมพ์" — ทางเดียวของทั้งระบบ
//
// ## ทำไมตัวเศษ ตัวส่วน และตัวที่ยังยืนยันไม่ได้ ต้องออกมาจากฟังก์ชันเดียว
//
// บั๊กที่เคยเกิดสองรอบและเป็นที่มาของไฟล์นี้: ตัวเศษ (เครื่องที่กรอกแล้ว) กับตัวส่วน
// (เครื่องที่ต้องกรอก) มาจากคนละคิวรี่ แล้วมีรอบหนึ่งที่คิวรี่หนึ่งมีตัวกรองอาคาร
// อีกคิวรี่ไม่มี ผลคือเลือกอาคารที่มีเครื่อง 3 เครื่อง ตัวส่วนเป็น 3 ส่วนตัวเศษยัง
// เป็นยอดรวมทุกอาคาร (18) เงื่อนไข 18 < 3 เป็นเท็จ ทุกเดือนจึงถูกรายงานว่า
// "ครบแล้ว" ทั้งที่อาคารนั้นอาจยังไม่ได้กรอกสักเครื่อง — ระบบบอกว่างานเสร็จทั้งที่
// ยังไม่ได้ทำ พอเพิ่มตัวกรองสัญญาเข้ามาทีหลัง กับดักเดิมก็เกิดซ้ำอีกรอบ
//
// มีเทสที่ดักคิวรี่ไว้จับกรณีนี้ (dashboard-coverage-sql.test.js) แต่เทสจับได้หลัง
// จากที่มีคนเขียนผิดไปแล้ว ไฟล์นี้ทำให้ **เขียนผิดแบบนั้นไม่ได้ตั้งแต่แรก** เพราะ
// ทั้งสามตัวเลขสร้างจาก `scope` ก้อนเดียวกันในฟังก์ชันเดียวกัน จะกรองไม่ตรงกันได้
// ก็ต่อเมื่อจงใจแก้ไฟล์นี้ให้ผิด
//
// ## ทำไมนับฝั่ง JS ไม่นับใน SQL
//
// กฎ "เดือนนี้เครื่องนี้ต้องกรอกไหม" มีรายละเอียดที่ผิดง่าย (ปลายช่วงรวมเดือนนั้น
// ด้วย เครื่องเดียวมีหลายช่วงในเดือนเดียวกันได้ ช่วงที่ไม่มีวันเริ่มไม่นับ) การเขียน
// กฎนี้เป็น SQL ซ้ำในทุกคิวรี่ที่ต้องใช้ คือการรอวันที่สำเนาหนึ่งเพี้ยนไปจากที่อื่น
// กฎจึงอยู่ที่ packages/domain/service-period.cjs ที่เดียว แล้วดึงข้อมูลดิบมานับ
//
// ราคาที่จ่าย: หนึ่งคำขอดึงคู่ (device_id, month) ของยอดที่บันทึกแล้วทั้งปีงบ
// ประมาณ (จำนวนเครื่อง × 12) แถว — ที่ 300 เครื่องคือ 3,600 แถวเล็กๆ ซึ่งถูกกว่า
// ความเสี่ยงที่กฎจะเพี้ยนมาก ถ้าวันหนึ่งเครื่องเกินหลักพันจนแถวเกินหลักหมื่น ค่อย
// ย้ายการนับลง SQL โดยยก periodCoversMonth ไปเป็น SQL expression ที่เดียวเช่นกัน

const db = require("./db");
const { requiredDevicesByMonth, monthOfDate } = require("@suth/domain");

/**
 * เงื่อนไขกรองที่ใช้ร่วมกันทุกคิวรี่ในไฟล์นี้
 *
 * คืนทั้งข้อความ SQL และพารามิเตอร์คู่กันเสมอ เพื่อไม่ให้มีทางต่อ SQL ไว้แล้วลืม
 * ส่งพารามิเตอร์ (หรือกลับกัน) ซึ่งเป็นความผิดพลาดที่ฟ้องตอน runtime เท่านั้น
 *
 * @param {{ buildingName?: string, contractId?: number }} scope
 */
function scopeClause({ buildingName, contractId } = {}) {
  const clauses = [];
  const params = [];

  if (buildingName) {
    clauses.push("b.name = ?");
    params.push(buildingName);
  }

  if (contractId) {
    clauses.push("d.contract_id = ?");
    params.push(contractId);
  }

  return { sql: clauses.length ? ` AND ${clauses.join(" AND ")} ` : " ", params };
}

/**
 * ตัวเลขทั้งหมดที่ computeCoverage() ต้องใช้ ในขอบเขตเดียวกันทั้งชุด
 *
 * @param {object} input
 * @param {string[]} input.months เดือนของปีงบที่ต้องการคำตอบ
 * @param {string} input.startMonth ขอบล่างของปีงบ "YYYY-MM"
 * @param {string} input.endMonth ขอบบนของปีงบ "YYYY-MM"
 * @param {string} [input.buildingName] กรองตามอาคาร
 * @param {number} [input.contractId] กรองตามสัญญา
 * @returns {Promise<{
 *   filledByMonth: Map<string, number>,
 *   requiredByMonth: Map<string, number>,
 *   unverifiedByMonth: Map<string, number>,
 *   unreviewedDevices: number,
 * }>}
 */
async function readCoverageScope({ months, startMonth, endMonth, buildingName, contractId }) {
  const scope = scopeClause({ buildingName, contractId });

  const [periods, readings, verification] = await Promise.all([
    // ---------- ตัวส่วน: ช่วงที่แต่ละเครื่องต้องรับผิดชอบ ----------
    // ไม่กรองด้วยช่วงปีงบที่นี่ เพราะช่วงหนึ่งช่วงคร่อมหลายปีงบได้ (ติดตั้งปี 2567
    // แล้วยังใช้อยู่ถึงวันนี้) การกรองด้วยวันที่จะตัดช่วงแบบนั้นทิ้งทั้งช่วง แล้ว
    // เครื่องที่อยู่มานานที่สุดจะหายออกจากตัวส่วน — ปล่อยให้ domain ตัดสินรายเดือน
    db
      .query(
        `SELECT sp.device_id, sp.effective_from, sp.effective_to
         FROM device_service_period sp
         JOIN devices d ON d.id = sp.device_id
         LEFT JOIN building b ON d.building_id = b.id
         WHERE 1=1 ${scope.sql}`,
        scope.params
      )
      .then(([rows]) => rows),

    // ---------- ตัวเศษ: เดือนที่แต่ละเครื่องบันทึกยอดไว้แล้ว ----------
    // แถวที่มีอยู่ = กรอกแล้ว ไม่ว่ายอดจะเป็น 0 หรือไม่ (0 คือ "อ่านมิเตอร์แล้ว
    // ไม่ได้พิมพ์" ซึ่งนับว่าทำงานแล้ว ส่วน "ยังไม่ได้อ่าน" คือไม่มีแถวเลย)
    db
      .query(
        `SELECT pt.device_id, pt.month
         FROM print_transactions pt
         JOIN devices d ON d.id = pt.device_id
         LEFT JOIN building b ON d.building_id = b.id
         WHERE pt.month BETWEEN ? AND ? ${scope.sql}`,
        [startMonth, endMonth, ...scope.params]
      )
      .then(([rows]) => rows),

    // ---------- สถานะการตรวจยืนยันของแต่ละเครื่องในขอบเขต ----------
    // installation_status IS NULL     = ยังไม่มีใครตรวจเลย ไม่ใช่ "ยังไม่ได้ติดตั้ง"
    // service_unverified_before IS NULL = ตรวจแล้วและยืนยันครบทุกช่วงเวลา
    // service_unverified_before = วันที่ = ก่อนวันนั้นยังยืนยันไม่ได้
    // (ADR-0018 Q19/Q21)
    db
      .query(
        `SELECT d.id, d.installation_status, d.service_unverified_before
         FROM devices d
         LEFT JOIN building b ON d.building_id = b.id
         WHERE 1=1 ${scope.sql}`,
        scope.params
      )
      .then(([rows]) => rows),
  ]);

  const requiredByMonth = requiredDevicesByMonth(periods, months);

  // ---------- เดือนไหนมีกี่เครื่องที่ยังยืนยันไม่ได้ ----------
  //
  // เครื่องหนึ่งทำให้เดือนหนึ่ง "ยืนยันไม่ได้" เมื่อยังไม่มีใครตรวจเลย หรือตรวจแล้ว
  // แต่ยืนยันย้อนหลังไปไม่ถึงเดือนนั้น — ทั้งสองกรณีคือ "ระบบยังไม่รู้ว่าเครื่องนี้
  // ต้องกรอกยอดของเดือนนั้นหรือเปล่า" ซึ่งต่างจาก "รู้แล้วว่าไม่ต้องกรอก"
  const unverifiedByMonth = new Map(months.map((month) => [month, 0]));

  for (const device of verification) {
    // ยังไม่ตรวจเลย = ไม่รู้ทุกเดือน
    if (device.installation_status === null) {
      for (const month of months) unverifiedByMonth.set(month, unverifiedByMonth.get(month) + 1);
      continue;
    }

    // ตรวจแล้วและยืนยันครบทุกช่วงเวลา = ไม่มีเดือนไหนค้างคาใจ
    const unverifiedBefore = monthOfDate(device.service_unverified_before);
    if (!unverifiedBefore) continue;

    for (const month of months) {
      if (month < unverifiedBefore) unverifiedByMonth.set(month, unverifiedByMonth.get(month) + 1);
    }
  }

  const unreviewedDevices = verification.filter((d) => d.installation_status === null).length;

  // นับเฉพาะยอดของเครื่องที่ "ต้องกรอก" เดือนนั้นจริง — ยอดของเครื่องที่ยังไม่ถึง
  // ช่วงรับผิดชอบ (หรือปิดช่วงไปแล้ว) ยังเก็บไว้และยังคิดเงินตามปกติ (Q21) แต่
  // ไม่ควรไปโป่งตัวเศษจนเดือนที่ยังกรอกไม่ครบดูเหมือนครบ
  const periodsByDevice = new Map();
  for (const period of periods) {
    if (!periodsByDevice.has(period.device_id)) periodsByDevice.set(period.device_id, []);
    periodsByDevice.get(period.device_id).push(period);
  }

  const filledByMonth = new Map(months.map((month) => [month, 0]));
  const counted = new Set();

  for (const reading of readings) {
    if (!filledByMonth.has(reading.month)) continue;

    // เครื่องเดียวมีได้แถวเดียวต่อเดือนอยู่แล้ว (UNIQUE KEY) แต่กันไว้ให้ชัด
    const key = `${reading.device_id}:${reading.month}`;
    if (counted.has(key)) continue;

    const devicePeriods = periodsByDevice.get(reading.device_id) || [];
    const required = requiredDevicesByMonth(devicePeriods, [reading.month]).get(reading.month) > 0;
    if (!required) continue;

    counted.add(key);
    filledByMonth.set(reading.month, filledByMonth.get(reading.month) + 1);
  }

  return { filledByMonth, requiredByMonth, unverifiedByMonth, unreviewedDevices };
}

module.exports = { readCoverageScope, scopeClause };
