// packages/domain/location-history.cjs
//
// "ยอดของเดือนนี้เป็นของที่ตั้งไหน" — กฎ ADR-0014 ฉบับที่อ่านจาก JavaScript
//
// ## ทำไมต้องมีอีกฉบับ ทั้งที่ API ใช้ SQL อยู่แล้ว
//
// ต้นฉบับของกฎอยู่ที่ `apps/api/src/shared/effective-location-sql.js` ซึ่ง API ใช้
// จัดยอดพิมพ์ทุกแถวให้ที่ตั้งเดียว แต่ API ตอบได้เฉพาะเดือนที่ **มียอด** เท่านั้น
// หน้ารายงานต้องรู้ด้วยว่าเดือนที่ยังไม่มียอดเป็นของแถวไหน ไม่งั้นวางช่องว่างและนับ
// ความครบของแถวไม่ได้ — จึงต้องมีกฎเดียวกันฝั่งเว็บ
//
// เดือนที่มียอดแล้ว ผู้เรียกควรเชื่อ `location_history_id` ที่ API ส่งมาก่อนเสมอ
// (ดู apps/web/src/components/report-rows.js) ไฟล์นี้จึงตัดสินเฉพาะเดือนที่ไม่มี
// คำตอบจาก API ถ้าสองฉบับเพี้ยนจากกันวันหนึ่ง ยอดรวมยังตรงกับ API
//
// ## ⚠️ ปลายช่วง "ไม่รวม" เดือนนั้น ต่างจาก service-period.cjs โดยตั้งใจ
//
// เครื่องที่ย้ายวันที่ 20 ม.ค. — ยอดเดือน ม.ค. ทั้งเดือนเป็นของที่ตั้งใหม่ เพราะยอด
// หนึ่งเดือนมีเจ้าของได้คนเดียว (หัวไฟล์ service-period.cjs อธิบายว่าทำไมที่นั่นรวม)

"use strict";

const { monthOfDate } = require("./service-period.cjs");

/** "YYYY-MM-DD" สำหรับเทียบวันเริ่มที่อยู่เดือนเดียวกัน — เทียบแบบเดียวกับคอลัมน์ DATE */
function dateOf(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  const match = String(value ?? "").match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : "";
}

/**
 * ช่วงประวัติที่ตั้งนี้ครอบคลุมเดือนที่ระบุหรือไม่ (ADR-0014 ข้อ 1)
 *
 * @param {{ effective_from: string|Date, effective_to?: string|Date|null }} period
 * @param {string} month "YYYY-MM"
 */
function locationPeriodCoversMonth(period, month) {
  const from = monthOfDate(period?.effective_from);
  if (!from || !month || month < from) return false;

  const to = monthOfDate(period?.effective_to);
  return !to || month < to;
}

/**
 * ช่วงประวัติที่มีผลกับเดือนนั้น — ไม่เกินหนึ่งช่วงเสมอ
 *
 * ช่วงซ้อนกัน: วันเริ่มล่าสุดชนะ ถ้าวันเริ่มเท่ากัน id มากกว่าชนะ (ADR-0014 ข้อ 2–3)
 * ไม่มีช่วงไหนครอบคลุม คืน null ให้ผู้เรียกใช้ที่ตั้งปัจจุบันของเครื่อง (ข้อ 4)
 *
 * @template {{ id: number, effective_from: string|Date, effective_to?: string|Date|null }} P
 * @param {P[]} periods ประวัติของเครื่องเดียว
 * @param {string} month "YYYY-MM"
 * @returns {P|null}
 */
function effectiveLocationPeriod(periods, month) {
  let winner = null;

  for (const period of periods || []) {
    if (!locationPeriodCoversMonth(period, month)) continue;
    if (!winner) {
      winner = period;
      continue;
    }

    const from = dateOf(period.effective_from);
    const winnerFrom = dateOf(winner.effective_from);
    if (from > winnerFrom || (from === winnerFrom && Number(period.id) > Number(winner.id))) {
      winner = period;
    }
  }

  return winner;
}

module.exports = { locationPeriodCoversMonth, effectiveLocationPeriod };
