// packages/domain/coverage.cjs
//
// "ปีงบนี้กรอกยอดไปถึงไหนแล้ว" — ตรรกะเดียวที่ทั้งแดชบอร์ดและหน้าบันทึกยอดใช้ร่วมกัน
//
// ## ตัวส่วนแยกรายเดือน ไม่ใช่ตัวเลขเดียวใช้ทั้งปี
//
// เดิมตัวส่วนคือ "จำนวนเครื่องที่ใช้งานอยู่ตอนนี้" ค่าเดียวกันทั้ง 12 เดือน ทำให้
// การเพิ่มเครื่องใหม่กลางปีทำให้เดือนเก่าที่กรอกครบแล้วกลายเป็นค้างย้อนหลัง
// (issue #79) ตอนนี้รับ `requiredByMonth` ที่นับจากช่วงความรับผิดชอบจริงของ
// แต่ละเครื่อง — ดู service-period.cjs และ ADR-0018
//
// ## "ยังยืนยันไม่ได้" ไม่ใช่ "ยังไม่ครบ" และไม่ใช่ "ครบแล้ว"
//
// เครื่องที่ยังไม่มีใครตรวจยืนยันสถานะการติดตั้ง (ข้อมูลเดิมที่ย้ายมา) ระบบไม่รู้ว่า
// เดือนไหนมันต้องกรอกบ้าง ADR-0018 ข้อ Q19 และ Q21 ห้ามเดาทั้งสองทาง — ห้ามจัดเป็น
// "ยังไม่ได้ติดตั้ง" (ซึ่งจะทำให้ความครบถ้วนดูดีเกินจริง) และห้ามจัดเป็น "ติดตั้งแล้ว"
// (ซึ่งจะสร้างงานค้างที่อาจไม่มีอยู่จริง)
//
// จึงมีสถานะที่สาม `indeterminate` ที่แปลว่า "ยืนยันความครบถ้วนของเดือนนี้ไม่ได้"
// ระบบจะไม่ประกาศว่าเดือนนั้นครบหรือค้าง เพราะทั้งสองคำเป็นข้อสรุปที่หลักฐานยังไม่
// พอจะพูด
//
// การพูดว่า "ยืนยันไม่ได้" ดูเหมือนให้ข้อมูลน้อยลง แต่ให้ข้อมูลที่ถูกต้อง และมัน
// ชี้งานถัดไปที่ทำได้จริง (ไปตรวจยืนยันอีก N เครื่อง) ต่างจากตัวเลขที่มั่นใจแต่ผิด
// ซึ่งไม่ชี้อะไรเลยนอกจากทำให้คนเลิกเชื่อหน้าจอ
//
// ## "ยังยืนยันไม่ได้" ต้องแยกเป็นรายเดือน ไม่ใช่ตัวเลขเดียวทั้งขอบเขต
//
// ผู้ดูแลที่ตรวจเครื่องหนึ่งมักตอบได้แค่ข้อเท็จจริง **ปัจจุบัน** ("ตอนนี้ติดตั้งอยู่")
// ส่วนคำถามว่าเครื่องนี้เริ่มรับผิดชอบยอดตั้งแต่เมื่อไหร่ ต้องมีเอกสารถึงจะตอบได้
// Q21 จึงให้ยืนยันปัจจุบันไปก่อน แล้วรายงานช่วงย้อนหลังว่า "ยังยืนยันไม่ได้"
//
// ถ้าเก็บเป็นตัวเลขเดียว เครื่องที่ยืนยันแบบ "ตั้งแต่วันนี้" จะกลายเป็นยืนยันครบ
// ทันที แล้วเดือนย้อนหลังที่ไม่มีช่วงครอบคลุมจะถูกรายงานว่า "ไม่มีอะไรต้องกรอก"
// ซึ่งเป็นการสรุปแทนที่จะบอกว่าไม่รู้ — เป็นบั๊กชนิดเดียวกับที่ ADR ตั้งใจกันไว้
// เพียงแต่ย้ายไปโผล่อีกที่หนึ่ง

"use strict";

/** สถานะความครบถ้วนของหนึ่งเดือน */
const MONTH_STATUS = {
  /** ไม่มีเครื่องไหนต้องกรอกในเดือนนี้ */
  NOT_APPLICABLE: "not_applicable",
  /** เดือนจบแล้ว แต่ยังมีเครื่องที่ไม่ได้ตรวจยืนยัน จึงยืนยันความครบถ้วนไม่ได้ */
  INDETERMINATE: "indeterminate",
  /** กรอกครบทุกเครื่องที่ต้องกรอก */
  COMPLETE: "complete",
  /** เดือนจบแล้วและยังกรอกไม่ครบ */
  OVERDUE: "overdue",
  /** เดือนยังไม่จบ จึงยังอ่านมิเตอร์ปิดยอดไม่ได้ */
  NOT_DUE: "not_due",
};

/**
 * สถานะของหนึ่งเดือน
 *
 * ลำดับการตัดสินสำคัญ: `indeterminate` ต้องมาก่อน `complete` เสมอ — ถ้าสลับกัน
 * เดือนที่เครื่องซึ่งยืนยันแล้วกรอกครบ จะถูกประกาศว่า "ครบ" ทั้งที่เครื่องที่ยัง
 * ไม่ได้ตรวจอาจต้องกรอกเดือนนั้นด้วย ซึ่งเป็นการรายงานว่างานเสร็จทั้งที่ยังไม่รู้
 */
function monthStatus({ required, filled, unverified, elapsed }) {
  if (required === 0 && unverified === 0) return MONTH_STATUS.NOT_APPLICABLE;
  if (unverified > 0) return elapsed ? MONTH_STATUS.INDETERMINATE : MONTH_STATUS.NOT_DUE;
  if (required > 0 && filled >= required) return MONTH_STATUS.COMPLETE;
  return elapsed ? MONTH_STATUS.OVERDUE : MONTH_STATUS.NOT_DUE;
}

/**
 * ความครบถ้วนของยอดพิมพ์ตลอดปีงบ
 *
 * @param {object} input
 * @param {string[]} input.fyMonths 12 เดือนของปีงบ เรียงจาก ต.ค. ถึง ก.ย.
 * @param {Map<string, number>} input.filledByMonth เดือน -> จำนวนเครื่องที่กรอกแล้ว
 * @param {Map<string, number>} input.requiredByMonth เดือน -> จำนวนเครื่องที่ต้องกรอก
 * @param {Map<string, number>} [input.unverifiedByMonth] เดือน -> เครื่องที่ยังยืนยันไม่ได้
 * @param {number} [input.unreviewedDevices] เครื่องที่ยังไม่มีใครตรวจเลยสักครั้ง
 * @param {string} input.today เดือนปัจจุบัน "YYYY-MM"
 */
function computeCoverage({
  fyMonths,
  filledByMonth,
  requiredByMonth,
  unverifiedByMonth,
  unreviewedDevices = 0,
  today,
}) {
  const months = fyMonths.map((month) => {
    const required = Number(requiredByMonth?.get(month)) || 0;
    const unverified = Math.max(0, Number(unverifiedByMonth?.get(month)) || 0);

    // ตัวเศษโตกว่าตัวส่วนได้จริง — เครื่องที่ปิดช่วงความรับผิดชอบไปแล้วยังมียอด
    // ของเดือนเก่าค้างอยู่ (และต้องค้างอยู่ ตาม Q21 ที่ให้เก็บยอดดิบไว้) ตัดให้
    // ไม่เกินตัวส่วนเพื่อไม่ให้ "ขาดอีกกี่เครื่อง" กลายเป็นค่าติดลบ
    const filled = Math.min(Number(filledByMonth?.get(month)) || 0, required);

    return {
      month,
      required_devices: required,
      filled_devices: filled,
      missing_devices: Math.max(0, required - filled),
      unverified_devices: unverified,
      status: monthStatus({ required, filled, unverified, elapsed: month < today }),
    };
  });

  const countOf = (status) => months.filter((m) => m.status === status).length;
  const elapsedMonths = fyMonths.filter((month) => month < today);

  // เดือนที่ "ค้าง" จริงเท่านั้นที่ส่งออกไปเป็นงานที่ต้องทำ — เดือนที่ยืนยันไม่ได้
  // ไม่ใช่งานค้าง มันคือสัญญาณว่าต้องไปตรวจยืนยันเครื่องก่อน ซึ่งเป็นงานคนละอย่าง
  const incompleteMonths = months
    .filter((m) => m.status === MONTH_STATUS.OVERDUE)
    .map((m) => m.month);

  return {
    incompleteMonths,
    coverage: {
      total_months: fyMonths.length,

      // ห้าตัวนี้แบ่ง 12 เดือนออกจากกันหมดพอดี ไม่ซ้อนและไม่เหลือ —
      //   annual_complete + incomplete + not_due + indeterminate + not_applicable = total
      // เดิมมีแค่สามตัวแรกและบวกกันได้ 12 พอดี เทสของ E2E จึงเขียนยืนยันไว้แบบนั้น
      // การเพิ่ม indeterminate ทำให้สมการเดิมไม่จริงอีกต่อไป จึงต้องเปิดเผยตัวที่
      // เหลือด้วย ไม่งั้นผู้เรียกจะบวกสามตัวแล้วสรุปเองว่าเดือนที่หายไปคือ "ครบ"
      annual_complete_months: countOf(MONTH_STATUS.COMPLETE),
      not_due_months: countOf(MONTH_STATUS.NOT_DUE),
      indeterminate_months: countOf(MONTH_STATUS.INDETERMINATE),
      not_applicable_months: countOf(MONTH_STATUS.NOT_APPLICABLE),

      // ขอบเขตนี้มีเครื่องที่ต้องกรอกอยู่หรือไม่ (รวมเครื่องที่ยังยืนยันไม่ได้ ซึ่ง
      // อาจต้องกรอกก็ได้) — false แปลว่าไม่มีอะไรให้ทำ ไม่ใช่ "ทำครบแล้ว"
      applicable: months.some((m) => m.required_devices > 0 || m.unverified_devices > 0),

      // ยืนยันตัวเลขความครบถ้วนทั้งปีได้หรือยัง — false ถ้ามีเดือนไหนก็ตามที่ยังมี
      // เครื่องซึ่งยังไม่รู้ว่าต้องกรอกเดือนนั้นหรือเปล่า
      verifiable: months.every((m) => m.unverified_devices === 0),

      // เครื่องที่ยังไม่มีใครตรวจเลยสักครั้ง — ตัวเลขของ "งานตรวจยืนยันที่เหลือ"
      // ต่างจาก unverified_devices รายเดือน ซึ่งรวมเครื่องที่ตรวจแล้วแต่ยืนยัน
      // ย้อนหลังไปไม่ถึงเดือนนั้นด้วย
      unreviewed_devices: Math.max(0, Number(unreviewedDevices) || 0),

      months,
      elapsed_months: elapsedMonths.length,
      complete_months: months.filter(
        (m) => m.status === MONTH_STATUS.COMPLETE && m.month < today
      ).length,
      incomplete_months: incompleteMonths.length,
    },
  };
}

module.exports = { computeCoverage, MONTH_STATUS };
