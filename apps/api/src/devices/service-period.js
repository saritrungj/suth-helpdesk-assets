// apps/api/src/devices/service-period.js
//
// เปิดและปิด "ช่วงที่เครื่องต้องบันทึกยอดพิมพ์" — ฝั่งเขียนของ ADR-0018
//
// ## ช่วงหนึ่งช่วงเปิดอยู่ได้ทีละหนึ่งเท่านั้น
//
// ถ้ามีสองช่วงที่ effective_to เป็น NULL พร้อมกัน เครื่องนั้นจะถูกนับสองรอบใน
// ตัวส่วนของความครบถ้วน แล้วเดือนนั้นจะไม่มีวันครบไม่ว่าจะกรอกยังไง — โดเมนนับ
// เป็นจำนวนเครื่องไม่ซ้ำอยู่แล้วจึงกันผลเสียไว้ชั้นหนึ่ง แต่ข้อมูลที่ขัดกันเองยัง
// ไม่ควรมีอยู่ตั้งแต่แรก ทุกทางที่เปิดช่วงใหม่ในไฟล์นี้จึงปิดช่วงเดิมก่อนเสมอ
//
// ## สิ่งที่ไฟล์นี้ "ห้าม" ทำ
//
// ห้ามเดาวันเริ่มรับผิดชอบจากวันลงทะเบียน วันกรอกยอดครั้งแรก หรือวันย้ายเครื่อง
// (ADR-0018 ข้อ Q21) วันที่ทุกวันในตารางนี้ต้องมาจากสิ่งที่ผู้ดูแลยืนยันเอง หรือ
// จากเหตุการณ์ที่ผู้ดูแลเพิ่งทำ (เปลี่ยนสถานะเป็นซ่อม = วันนี้เลิกรับผิดชอบ)
//
// "วันนี้" เป็นข้อเท็จจริง ส่วน "น่าจะตั้งแต่ตอนนั้น" เป็นการเดา — เส้นแบ่งอยู่ตรงนี้

const { monthOfDate } = require("@suth/domain");

/** วันที่วันนี้ "YYYY-MM-DD" ตามเวลาไทย ให้ตรงกับเดือนที่ระบบใช้ตัดสินงานค้าง */
function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * ช่วงที่ยังเปิดอยู่ของเครื่องนี้ (ถ้ามี)
 * @returns {Promise<{ id: number, effective_from: string } | undefined>}
 */
async function openPeriodOf(conn, deviceId) {
  const [[row]] = await conn.query(
    `SELECT id, effective_from FROM device_service_period
     WHERE device_id = ? AND effective_to IS NULL
     ORDER BY effective_from DESC, id DESC LIMIT 1`,
    [deviceId]
  );
  return row;
}

/**
 * ปิดช่วงที่เปิดอยู่ ณ วันที่ระบุ
 *
 * ไม่ทำอะไรถ้าไม่มีช่วงเปิดอยู่ — การเรียกซ้ำจึงปลอดภัย (เปลี่ยนสถานะจากซ่อมเป็น
 * ปลดระวางไม่ควรพังเพราะช่วงถูกปิดไปแล้วตอนส่งซ่อม)
 *
 * วันปิดที่เก่ากว่าวันเริ่มถูกดันขึ้นมาเท่าวันเริ่ม — ช่วงที่จบก่อนเริ่มผิด CHECK
 * ของฐานข้อมูลและไม่มีความหมาย ส่วนช่วงที่เริ่มและจบวันเดียวกันมีความหมายชัดเจน
 * (รับผิดชอบเดือนนั้นหนึ่งเดือน ตาม Q20)
 */
async function closeOpenPeriod(conn, deviceId, endDate) {
  const open = await openPeriodOf(conn, deviceId);
  if (!open) return;

  const end = endDate < open.effective_from ? open.effective_from : endDate;
  await conn.query("UPDATE device_service_period SET effective_to = ? WHERE id = ?", [end, open.id]);
}

/**
 * เปิดช่วงใหม่ ถ้ายังไม่มีช่วงที่เปิดอยู่และครอบคลุมวันที่นั้นแล้ว
 *
 * ไม่เปิดซ้ำถ้ามีช่วงเปิดอยู่ที่เริ่มก่อนหรือพร้อมกับวันที่ขอ — การกดบันทึกซ้ำโดย
 * ไม่ได้เปลี่ยนอะไรต้องไม่สร้างแถวขยะ (บทเรียนเดียวกับ recordLocationHistory)
 */
async function openPeriod(conn, deviceId, startDate, { userId = null, note = null } = {}) {
  const open = await openPeriodOf(conn, deviceId);
  if (open && open.effective_from <= startDate) return;

  // มีช่วงเปิดอยู่แต่เริ่มหลังวันที่ขอ = ผู้ดูแลเพิ่งยืนยันว่ารับผิดชอบมาตั้งแต่
  // ก่อนหน้านั้น ขยับต้นช่วงให้ครอบคลุมแทนการเปิดช่วงซ้อน
  if (open) {
    await conn.query(
      `UPDATE device_service_period
       SET effective_from = ?, verified_by = ?, verified_at = CURRENT_TIMESTAMP, note = COALESCE(?, note)
       WHERE id = ?`,
      [startDate, userId, note, open.id]
    );
    return;
  }

  await conn.query(
    `INSERT INTO device_service_period
       (device_id, effective_from, effective_to, note, verified_by, verified_at)
     VALUES (?, ?, NULL, ?, ?, CURRENT_TIMESTAMP)`,
    [deviceId, startDate, note, userId]
  );
}

/**
 * บันทึกผลการตรวจยืนยันสถานะการติดตั้งของเครื่องหนึ่ง
 *
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {number} deviceId
 * @param {object} input
 * @param {"installed"|"not_installed"} input.installationStatus สิ่งที่ผู้ดูแลเห็นจริง
 * @param {string} input.effectiveFrom วันที่ข้อเท็จจริงนี้เริ่มมีผล "YYYY-MM-DD"
 * @param {boolean} input.historyKnown ย้อนหลังก่อนวันนั้นยืนยันได้ด้วยหรือไม่
 * @param {"active"|"repair"|"retired"} input.deviceStatus สถานะการใช้งานปัจจุบัน
 * @param {number|null} input.userId ผู้ยืนยัน
 * @param {string|null} [input.note]
 */
async function recordInstallationReview(conn, deviceId, input) {
  const { installationStatus, effectiveFrom, historyKnown, deviceStatus, userId, note = null } = input;

  // ผู้ดูแลที่ตอบได้แค่ข้อเท็จจริงปัจจุบัน ทิ้งเส้นแบ่งไว้ว่าก่อนวันนั้นยังไม่รู้
  // ส่วนคนที่มีเอกสารยืนยันย้อนหลังได้ ล้างเส้นแบ่งทิ้ง (NULL = ยืนยันครบ)
  await conn.query(
    "UPDATE devices SET installation_status = ?, service_unverified_before = ? WHERE id = ?",
    [installationStatus, historyKnown ? null : effectiveFrom, deviceId]
  );

  // กลุ่มที่ต้องบันทึกยอดคือ "ติดตั้งแล้ว + ใช้งานอยู่" เท่านั้น (Q15)
  // เครื่องที่ติดตั้งแล้วแต่ส่งซ่อมหรือปลดระวาง ไม่มีมิเตอร์ให้อ่านตอนนี้
  const inService = installationStatus === "installed" && deviceStatus === "active";

  if (inService) {
    await openPeriod(conn, deviceId, effectiveFrom, { userId, note });
  } else {
    await closeOpenPeriod(conn, deviceId, effectiveFrom);
  }
}

/**
 * ปรับช่วงความรับผิดชอบตามการเปลี่ยน "สถานะการใช้งาน" ของเครื่อง
 *
 * เรียกจาก PUT /devices/:id หลังบันทึกสถานะใหม่แล้ว
 *
 * ## ทำไมทำให้อัตโนมัติได้โดยไม่ขัด Q21
 *
 * Q21 ห้าม **อนุมานอดีต** ที่ไม่มีใครยืนยัน ส่วนที่นี่คือการบันทึกเหตุการณ์ที่
 * ผู้ดูแลเพิ่งลงมือทำเมื่อครู่นี้ พร้อมวันที่ที่รู้แน่นอนคือวันนี้ — เป็นข้อเท็จจริง
 * ที่เพิ่งเกิด ไม่ใช่การเดาย้อนหลัง
 *
 * เครื่องที่ยังไม่เคยตรวจยืนยัน (installation_status เป็น NULL) จะไม่ถูกแตะเลย
 * เพราะระบบยังไม่รู้ว่ามันติดตั้งอยู่หรือเปล่า การเปิดช่วงให้มันตอนกดเปลี่ยน
 * สถานะเป็น "ใช้งานอยู่" จะเท่ากับตัดสินแทนผู้ดูแลว่าติดตั้งแล้ว
 */
async function syncServicePeriodWithStatus(conn, deviceId, { installationStatus, deviceStatus }) {
  if (installationStatus !== "installed") {
    if (installationStatus === "not_installed") await closeOpenPeriod(conn, deviceId, today());
    return;
  }

  if (deviceStatus === "active") {
    await openPeriod(conn, deviceId, today());
  } else {
    await closeOpenPeriod(conn, deviceId, today());
  }
}

/**
 * เดือนแรกที่ยืนยันแล้วของเครื่อง หรือ null ถ้ายืนยันครบทุกช่วงเวลา
 * ใช้ตอนอธิบายให้ผู้ใช้ว่าตัวเลขของเครื่องนี้เชื่อได้ย้อนหลังถึงไหน
 */
const unverifiedBeforeMonth = (device) =>
  device?.installation_status ? monthOfDate(device.service_unverified_before) : null;

module.exports = {
  today,
  openPeriodOf,
  closeOpenPeriod,
  openPeriod,
  recordInstallationReview,
  syncServicePeriodWithStatus,
  unverifiedBeforeMonth,
};
