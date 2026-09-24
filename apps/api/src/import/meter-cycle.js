// apps/api/src/import/meter-cycle.js
//
// สองสิ่งที่รายงานมิเตอร์ของผู้ให้เช่าบอกอยู่แล้ว แต่ระบบเดิมไม่ได้อ่าน (#221)
//
// 1. **รอบมิเตอร์ของสัญญา** — งวดในหัวแผ่น ("July 24 to Aug 23") บอกวันเริ่มรอบ สัญญาที่ตัดรอบวันที่ 24
//    เครื่องที่ติดตั้งวันที่ 24–31 มียอดแรกในรายงานเดือนถัดไป ระบบต้องรู้รอบนี้ถึงจะนับเดือนที่ต้องกรอกถูก
//    (packages/domain billingPeriodStart) ตั้งให้เฉพาะสัญญาที่ยังไม่มีค่า — ค่าที่ผู้ดูแลตั้งไว้แล้วไม่ถูกทับ
//
// 2. **การเปลี่ยนเครื่อง** — ลำดับเดิม (คอลัมน์ No.) เดือนหนึ่งเป็นเครื่อง A เดือนถัดไปเป็นเครื่อง B และ A
//    ไม่อยู่ที่ไหนในเดือนนั้นแล้ว = ผู้ให้เช่าเอาเครื่อง A ออกแล้วใส่ B แทน ระบบปิดช่วงที่ต้องกรอกของ A ที่
//    เดือนสุดท้ายที่มันอยู่ในรายงาน และตั้ง A เป็นปลดระวาง — เดิม A ค้างเป็น "ต้องกรอก" ทุกเดือนตลอดไป
//    หลักฐานคือรายงานของผู้ให้เช่าเองเท่านั้น (ADR-0018: ไม่เดาวันที่) ไม่ใช่ "ไม่มียอดสองเดือน"

const { comparableContractNo } = require("./vendor-meter");

const dayOf = (date) => Number(String(date ?? "").slice(8, 10));

/** เดือนก่อนหน้า "YYYY-MM" → วันสุดท้ายของเดือนนั้น "YYYY-MM-DD" */
function lastDayBefore(month) {
  const [year, m] = month.split("-").map(Number);
  const end = new Date(Date.UTC(year, m - 1, 0)); // วันที่ 0 ของเดือนนี้ = วันสุดท้ายของเดือนก่อน
  return end.toISOString().slice(0, 10);
}

/**
 * รอบมิเตอร์ของแต่ละสัญญาในไฟล์ — วันเริ่มงวดที่พบบ่อยที่สุด (1–28)
 * @param {{ sheets: Array<{ contract_no: string|null, period_start: string|null }> }|null} vendor
 * @returns {Array<{ contract_no: string, cycle_day: number }>}
 */
function detectCycles(vendor) {
  const votes = new Map();
  for (const sheet of vendor?.sheets ?? []) {
    const day = dayOf(sheet.period_start);
    if (!sheet.contract_no || !(day >= 1 && day <= 28)) continue;
    const key = comparableContractNo(sheet.contract_no);
    const tally = votes.get(key) ?? { contract_no: sheet.contract_no, days: new Map() };
    tally.days.set(day, (tally.days.get(day) ?? 0) + 1);
    votes.set(key, tally);
  }
  return [...votes.values()].map(({ contract_no, days }) => ({
    contract_no,
    cycle_day: [...days].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0],
  }));
}

/**
 * ลำดับที่เปลี่ยนเครื่องระหว่างสองเดือนที่อยู่ติดกันในไฟล์
 * @param {{ slots?: Array<{ contract_no: string|null, month: string, slot: number, serial_number: string }> }|null} vendor
 * @returns {Array<{ contract_no: string, slot: number, old_serial: string, new_serial: string, from_month: string, last_month: string }>}
 */
function detectReplacements(vendor) {
  const byContract = new Map();
  for (const entry of vendor?.slots ?? []) {
    if (!entry.contract_no) continue;
    const key = comparableContractNo(entry.contract_no);
    const months = byContract.get(key) ?? { contract_no: entry.contract_no, months: new Map() };
    const month = months.months.get(entry.month) ?? { bySlot: new Map(), serials: new Set() };
    month.bySlot.set(entry.slot, entry.serial_number);
    month.serials.add(entry.serial_number.toUpperCase());
    months.months.set(entry.month, month);
    byContract.set(key, months);
  }

  const found = [];
  for (const { contract_no, months } of byContract.values()) {
    const order = [...months.keys()].sort();
    for (let i = 1; i < order.length; i++) {
      const before = months.get(order[i - 1]);
      const after = months.get(order[i]);
      for (const [slot, oldSerial] of before.bySlot) {
        const newSerial = after.bySlot.get(slot);
        if (!newSerial || newSerial.toUpperCase() === oldSerial.toUpperCase()) continue;
        // เครื่องเดิมยังอยู่ในเดือนถัดไป (ย้ายลำดับ) หรือเครื่องใหม่มีอยู่แล้วเดือนก่อน = ไม่ใช่การเปลี่ยนเครื่อง
        if (after.serials.has(oldSerial.toUpperCase()) || before.serials.has(newSerial.toUpperCase())) continue;
        found.push({ contract_no, slot, old_serial: oldSerial, new_serial: newSerial, from_month: order[i], last_month: order[i - 1] });
      }
    }
  }
  return found;
}

/**
 * ตั้งรอบมิเตอร์ให้สัญญาที่ยังไม่มีค่า
 * @returns {Promise<Array<{ contract_id: number, contract_no: string, cycle_day: number }>>}
 */
async function applyMeterCycles(conn, vendor) {
  const detected = detectCycles(vendor);
  if (!detected.length) return [];
  const [contracts] = await conn.query("SELECT id, contract_no, meter_cycle_day FROM contracts");
  const applied = [];
  for (const { contract_no, cycle_day } of detected) {
    const contract = contracts.find((c) => comparableContractNo(c.contract_no) === comparableContractNo(contract_no));
    if (!contract || contract.meter_cycle_day !== null) continue;
    // วันที่ 1 = ค่าเริ่มต้นอยู่แล้ว บันทึกไว้เพื่อให้รู้ว่าอ่านจากรายงานแล้ว ไม่ใช่ยังไม่รู้
    await conn.query("UPDATE contracts SET meter_cycle_day = ? WHERE id = ? AND meter_cycle_day IS NULL", [cycle_day, contract.id]);
    applied.push({ contract_id: contract.id, contract_no: contract.contract_no, cycle_day });
  }
  return applied;
}

/**
 * ปิดเครื่องที่ผู้ให้เช่าเปลี่ยนออก — เฉพาะเครื่องที่ยังใช้งานอยู่และไม่มียอดตั้งแต่เดือนที่ถูกเปลี่ยน
 * @returns {Promise<Array<object>>} รายการที่ปิดแล้ว (ใช้แสดงในหน้าตรวจและบันทึกประวัติ)
 */
async function applyReplacements(conn, vendor) {
  const detected = detectReplacements(vendor);
  if (!detected.length) return [];
  const applied = [];
  for (const item of detected) {
    const [[device]] = await conn.query(
      `SELECT d.id, d.status,
              (SELECT MAX(p.month) FROM print_transactions p WHERE p.device_id = d.id) AS last_reading
       FROM devices d WHERE d.serial_number = ?`,
      [item.old_serial]
    );
    if (!device || device.status !== "active") continue;
    if (device.last_reading && device.last_reading >= item.from_month) continue; // ยังมียอดหลังเปลี่ยน = ไม่แตะ
    const endDate = lastDayBefore(item.from_month);
    const [[open]] = await conn.query(
      "SELECT id, effective_from FROM device_service_period WHERE device_id = ? AND effective_to IS NULL ORDER BY effective_from DESC LIMIT 1",
      [device.id]
    );
    if (open) {
      await conn.query("UPDATE device_service_period SET effective_to = ?, note = CONCAT_WS(' · ', note, ?) WHERE id = ?", [
        endDate < open.effective_from ? open.effective_from : endDate,
        `ผู้ให้เช่าเปลี่ยนเป็น ${item.new_serial} ตั้งแต่ ${item.from_month}`,
        open.id,
      ]);
    }
    await conn.query("UPDATE devices SET status = 'retired' WHERE id = ?", [device.id]);
    applied.push({ ...item, device_id: device.id, service_end: endDate });
  }
  return applied;
}

module.exports = { detectCycles, detectReplacements, applyMeterCycles, applyReplacements, lastDayBefore };
