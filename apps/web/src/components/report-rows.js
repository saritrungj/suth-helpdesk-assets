import { effectiveLocationPeriod } from "@suth/domain";

/**
 * report-rows.js — แถวของหน้ารายงานสรุปยอดพิมพ์ (issue #104)
 *
 * ## หนึ่งเดือนของหนึ่งเครื่องอยู่ได้แถวเดียว
 *
 * เดิมหน้ารายงานแจกเดือนให้ทุกช่วงประวัติที่ครอบคลุมเดือนนั้น ช่วงที่ซ้อนกันจึงได้
 * ยอดเดียวกันไปคนละแถว (100 หน้ากลายเป็น 200) และกรองด้วยฝ่ายปัจจุบันของเครื่อง
 * ก่อนแตกแถว เครื่องที่ย้ายจาก A ไป B จึงหายเมื่อกรอง A แต่แถวเก่าของ A ติดมาเมื่อ
 * กรอง B — ต่างจาก API และ ADR-0014 ที่ให้ยอดหนึ่งเดือนมีเจ้าของคนเดียว
 *
 * ที่นี่ตัดสินเจ้าของทีละเดือนก่อน แล้วค่อยรวมเดือนที่ติดกันและอยู่ที่ตั้งเดียวกัน
 * เป็นแถวเดียว ตัวกรองหน่วยงานและที่ตั้งจึงใช้ที่ตั้งของแถว ไม่ใช่ของเครื่องวันนี้
 *
 * ## ใครตัดสินเจ้าของเดือน
 *
 * เดือนที่มียอด เชื่อ `location_history_id` ที่ API จัดไว้ (API ใช้ตัดสินยอดของทุก
 * หน้ารายงานอยู่แล้ว) เดือนที่ยังไม่มียอด API ไม่มีคำตอบ จึงใช้กฎเดียวกันจาก
 * `@suth/domain` — ยอดรวมของหน้านี้จึงตรงกับ API เสมอ แม้กฎสองฉบับจะเพี้ยนกัน
 *
 * ## ช่องว่างไม่ใช่ศูนย์
 *
 * `_monthly[m]` เป็น `null` เมื่อเดือนนั้นยังไม่มียอด และไม่มีคีย์เลยเมื่อเดือนนั้น
 * ไม่ใช่ของแถวนี้ ส่วน 0 คือยอดที่บันทึกว่าพิมพ์ศูนย์หน้าจริง `_total` เป็น `null`
 * เมื่อแถวยังไม่มียอดสักเดือน — ห้ามแปลงเป็น 0 เพราะไฟล์ Excel จะแยกไม่ออก
 */

/** ที่ตั้งที่ใช้เทียบว่าเดือนสองเดือน "อยู่ที่เดียวกัน" — เทียบด้วย id ไม่ใช่ชื่อ */
const LOCATION_KEYS = ["building_id", "floor_id", "location", "division_id", "department_id"];

/** ฟิลด์ที่ถูกแทนด้วยที่ตั้งของช่วง เมื่อแถวนั้นไม่ใช่ที่ตั้งปัจจุบัน */
const LOCATION_FIELDS = [
  ...LOCATION_KEYS,
  "building_name",
  "floor_name",
  "division_name",
  "department_name",
];

const locationKey = (place) => JSON.stringify(LOCATION_KEYS.map((key) => place?.[key] ?? null));

/**
 * แปลงแถวของ `/dashboard/monthly-kpi` เป็น เครื่อง -> เดือน -> ยอด
 *
 * ใช้ `pages_printed` (ยอดมิเตอร์ดิบ) เพราะหน้านี้ตอบว่า "พิมพ์ไปเท่าไหร่"
 * ไม่ใช่ยอดที่เอาไปคิดเงิน
 *
 * @returns {Record<number, Record<string, { pages: number, locationHistoryId: number|null|undefined }>>}
 */
export function readingsByDevice(rows) {
  const map = {};
  for (const row of rows ?? []) {
    if (!map[row.device_id]) map[row.device_id] = {};
    map[row.device_id][row.month] = {
      pages: Number(row.pages_printed || 0),
      // undefined = API รุ่นนี้ไม่ได้บอกช่วงมา ต่างจาก null ที่แปลว่าไม่มีช่วงครอบคลุม
      locationHistoryId: "location_history_id" in row ? row.location_history_id : undefined,
    };
  }
  return map;
}

/** จัดกลุ่มประวัติที่ตั้งตามเครื่อง */
export function periodsByDevice(history) {
  const map = {};
  for (const row of history ?? []) {
    if (!map[row.device_id]) map[row.device_id] = [];
    map[row.device_id].push(row);
  }
  return map;
}

/**
 * เดือนติดกันของปีงบที่อยู่ที่ตั้งเดียวกัน — หนึ่งช่วงต่อหนึ่งแถวในรายงาน
 *
 * เครื่องที่ย้าย A → B → A ได้สามช่วง ไม่รวม A สองช่วงเป็นแถวเดียว เพื่อให้ลำดับ
 * แถวเล่าเรื่องการย้ายตามเวลาจริง
 */
function locationRuns(device, periods, readings, fyMonths) {
  const byId = new Map(periods.map((period) => [Number(period.id), period]));

  const ownerOf = (month) => {
    const allocated = readings[month]?.locationHistoryId;
    // API บอกว่าไม่มีช่วงครอบคลุม = ใช้ที่ตั้งปัจจุบัน (ADR-0014 ข้อ 4)
    if (allocated === null) return null;
    if (allocated !== undefined && byId.has(Number(allocated))) return byId.get(Number(allocated));
    // เดือนที่ยังไม่มียอด หรือช่วงที่ API เลือกไม่อยู่ในประวัติที่โหลดมา (มีคนย้าย
    // เครื่องระหว่างสองคำขอ) ใช้กฎเดียวกันฝั่งนี้แทนการทิ้งยอด
    return effectiveLocationPeriod(periods, month);
  };

  const runs = [];
  for (const month of fyMonths) {
    const period = ownerOf(month);
    const place = period ?? device;
    const key = locationKey(place);
    const last = runs[runs.length - 1];

    if (last && last.key === key) last.months.push(month);
    else runs.push({ key, place, isHistory: Boolean(period), months: [month] });
  }

  return runs;
}

/**
 * สถานะยอดของแถว — นับจากเดือนของแถวที่แสดงอยู่ ไม่ใช่ความครบถ้วนตามหน้าที่
 *
 * บอกได้แค่ว่ามียอดบันทึกไว้ครบทุกเดือนที่แสดงหรือไม่ ไม่รู้ว่าเครื่องต้องรับผิดชอบ
 * เดือนไหน (ADR-0018) งานค้างจริงจึงดูที่การแจ้งเตือน ไม่ใช่ตัวกรองนี้
 */
function recordStatus(recorded, months) {
  if (!recorded) return "none";
  return recorded === months ? "done" : "partial";
}

/**
 * แถวรายงานของเครื่องหนึ่งเครื่อง
 *
 * @param {object} input
 * @param {object} input.device เครื่องจาก `/devices` (ที่ตั้งปัจจุบัน)
 * @param {object[]} input.periods ประวัติที่ตั้งของเครื่องนี้
 * @param {ReturnType<typeof readingsByDevice>[number]} input.readings ยอดของเครื่องนี้
 * @param {string[]} input.fyMonths ทุกเดือนของปีงบ
 * @param {string[]} input.displayMonths เดือนที่แสดงในตาราง
 * @param {(months: string[]) => string} input.runLabel ป้ายช่วงเดือนของแถว
 */
export function deviceReportRows({ device, periods = [], readings = {}, fyMonths, displayMonths, runLabel }) {
  // ช่วงที่ไม่มีประวัติครอบคลุมใช้ที่ตั้งปัจจุบันแทน (ADR-0014 ข้อ 4) ส่วนใหญ่คือเดือน
  // ก่อนลงทะเบียนเครื่อง ถ้าไม่มียอดเลย แถวว่างแถวนั้นมีแต่ทำให้ดูเหมือนเครื่องเคยอยู่
  // ที่ตั้งปัจจุบันก่อนย้ายมา — แสดงเฉพาะเมื่อมียอดจริง ยอดจึงไม่หายจากรายงาน
  const allRuns = locationRuns(device, periods, readings, fyMonths);
  const runs = allRuns.length === 1
    ? allRuns
    : allRuns.filter((run) => run.isHistory || run.months.some((month) => readings[month]));
  const shown = new Set(displayMonths);
  // ที่ตั้งของแถวเดียวต่างจากวันนี้ = ปีงบเก่าที่เครื่องอยู่ที่อื่น ต้องบอกให้รู้
  const moved = runs.length > 1 || (runs[0]?.isHistory && runs[0].key !== locationKey(device));

  return runs.flatMap((run, index) => {
    const months = run.months.filter((month) => shown.has(month));
    // เดือนที่เลือกแสดงไม่มีเดือนไหนเป็นของช่วงนี้ แถวจะว่างทั้งแถว
    if (!months.length) return [];

    const monthly = Object.fromEntries(months.map((month) => [month, readings[month]?.pages ?? null]));
    const values = Object.values(monthly).filter((value) => value !== null);
    const place = run.isHistory
      ? Object.fromEntries(LOCATION_FIELDS.map((field) => [field, run.place[field] ?? null]))
      : {};

    return [{
      ...device,
      ...place,
      _row_key: moved ? `${device.id}-m${run.months[0]}` : String(device.id),
      _monthly: monthly,
      _total: values.length ? values.reduce((sum, value) => sum + value, 0) : null,
      _record_status: recordStatus(values.length, months.length),
      _period_label: moved ? runLabel(run.months) : "",
      _is_moved_group: moved,
      _period_index: index + 1,
      _period_count: runs.length,
    }];
  });
}
