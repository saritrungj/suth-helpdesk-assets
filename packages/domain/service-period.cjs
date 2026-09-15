// packages/domain/service-period.cjs
//
// "เดือนนี้ เครื่องไหนต้องบันทึกยอดบ้าง" — จุดเดียวของระบบที่ตอบคำถามนี้
//
// ## ปัญหาที่แก้ (ดู ADR-0018 และ issue #79)
//
// เดิมตัวส่วนของความครบถ้วนคือ "จำนวนเครื่องที่ใช้งานอยู่ **ณ ตอนนี้**" ซึ่งเป็น
// ค่าเดียวใช้กับทั้ง 12 เดือน ผลคือเพิ่มเครื่องใหม่เข้าทะเบียนกลางปีงบหนึ่งเครื่อง
// ตัวส่วนของ **ทุกเดือนย้อนหลัง** โตขึ้นพร้อมกัน เดือนที่กรอกครบไปแล้วกลายเป็น
// "ค้าง" ทันทีทั้งที่ไม่มีใครลบยอดของเดือนไหนเลย
//
// คำถามที่ระบบถามคือคำถามย้อนหลัง ("เดือนมีนาคมต้องกรอกกี่เครื่อง") แต่ฐานข้อมูล
// เดิมเก็บแต่คำตอบปัจจุบัน ("ตอนนี้มีกี่เครื่อง") — ช่องว่างนี้ปิดด้วยการเก็บ
// **ช่วงเวลาความรับผิดชอบ** ของแต่ละเครื่อง แล้วนับตัวส่วนแยกรายเดือนจากช่วงนั้น
//
// ## กฎการเทียบ: เทียบระดับ "เดือน" ไม่ใช่ระดับวัน
//
// ยอดพิมพ์ผูกกับเดือน (`print_transactions.month` = "YYYY-MM" ไม่มีวันที่) ส่วน
// ช่วงความรับผิดชอบเก็บเป็นวันที่จริง การเทียบจึงตัดวันทิ้งทั้งสองฝั่งก่อนเสมอ
//
// ## ⚠️ ปลายช่วงเป็นแบบ "รวมเดือนนั้นด้วย" ต่างจาก device_location_history
//
// `effective-location-sql.js` ใช้ `month < DATE_FORMAT(effective_to)` (ไม่รวม)
// เพราะเครื่องที่ย้ายวันที่ 20 ต้องให้ที่ตั้ง **ใหม่** เป็นเจ้าของยอดทั้งเดือนนั้น
// — ยอดหนึ่งเดือนมีเจ้าของได้คนเดียว
//
// ที่นี่ตรงกันข้าม ADR-0018 ข้อ Q20 ยืนยันว่าเดือนที่มีช่วงติดตั้งและใช้งานอยู่
// **แม้เพียงบางส่วน** ต้องบันทึกยอดจริงหนึ่งรายการ (ไม่พิมพ์เลยให้บันทึก 0 ไม่ใช่
// เว้นว่าง และไม่เฉลี่ยยอดตามจำนวนวัน) เครื่องที่ปลดระวางวันที่ 15 มี.ค. จึงยัง
// ต้องมียอดของเดือน มี.ค. — ปลายช่วงจึงต้องรวมเดือนนั้นด้วย
//
// สองไฟล์นี้จงใจไม่ใช้กฎเดียวกัน เพราะตอบคนละคำถาม ("ยอดเดือนนี้เป็นของใคร"
// กับ "เดือนนี้ใครต้องกรอก") ห้ามรวมเป็นฟังก์ชันเดียวกันโดยเห็นว่าหน้าตาคล้ายกัน

"use strict";

/**
 * ตัดวันที่ทิ้ง เหลือเดือน "YYYY-MM"
 *
 * รับ string จาก mysql2 ที่ตั้ง `dateStrings: true` ไว้ (คืน DATE เป็น
 * "YYYY-MM-DD" ตรงๆ ไม่ผ่าน Date object ที่จะเลื่อนไปหนึ่งวันตาม timezone
 * ของเครื่อง) และรับ Date เผื่อผู้เรียกฝั่งอื่น
 *
 * @param {string|Date|null|undefined} value
 * @returns {string|null} "YYYY-MM" หรือ null ถ้าอ่านไม่ออก
 */
function monthOfDate(value) {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
  }

  const match = String(value).match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : null;
}

/**
 * ช่วงความรับผิดชอบนี้ครอบคลุมเดือนที่ระบุหรือไม่
 *
 * ช่วงที่ไม่มีวันเริ่ม (อ่านไม่ออก/ไม่มีข้อมูล) ไม่ครอบคลุมเดือนไหนเลย — ห้ามเดา
 * ว่าเริ่มตั้งแต่ต้นเวลา เพราะนั่นคือการอนุมานวันติดตั้งที่ ADR-0018 ข้อ Q21 ห้ามไว้
 *
 * @param {{ effective_from: string|Date, effective_to: string|Date|null }} period
 * @param {string} month "YYYY-MM"
 * @returns {boolean}
 */
function periodCoversMonth(period, month) {
  const from = monthOfDate(period?.effective_from);
  if (!from || !month) return false;
  if (month < from) return false;

  const to = monthOfDate(period?.effective_to);
  // ยังไม่ปิดช่วง = ยังรับผิดชอบอยู่ถึงปัจจุบัน
  if (!to) return true;

  // รวมเดือนที่ปิดช่วงด้วย — ดูหัวข้อ "ปลายช่วงเป็นแบบรวม" ด้านบน
  return month <= to;
}

/**
 * นับ "เครื่องที่ต้องบันทึกยอด" ของแต่ละเดือน
 *
 * นับเป็นจำนวน **เครื่องที่ไม่ซ้ำ** ไม่ใช่จำนวนช่วง — เครื่องเดียวมีได้หลายช่วง
 * ในเดือนเดียวกัน (ติดตั้ง ถอดออก แล้วติดตั้งใหม่ภายในเดือนนั้น) ถ้านับตามช่วง
 * ตัวส่วนจะโตเกินจริงแล้วเดือนนั้นจะไม่มีวันครบ
 *
 * @param {Array<{ device_id: number, effective_from: string, effective_to: string|null }>} periods
 * @param {string[]} months เดือนที่ต้องการคำตอบ (ปกติคือ 12 เดือนของปีงบ)
 * @returns {Map<string, number>} เดือน -> จำนวนเครื่องที่ต้องบันทึกยอด
 */
function requiredDevicesByMonth(periods, months) {
  const byMonth = new Map(months.map((month) => [month, new Set()]));

  for (const period of periods || []) {
    for (const month of months) {
      if (periodCoversMonth(period, month)) byMonth.get(month).add(period.device_id);
    }
  }

  return new Map([...byMonth].map(([month, devices]) => [month, devices.size]));
}

module.exports = { monthOfDate, periodCoversMonth, requiredDevicesByMonth };
