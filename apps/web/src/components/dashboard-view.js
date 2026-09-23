import { fiscalYearMonths, getFiscalYearRange } from "@suth/domain";
import { DIMENSIONS, MAX_YEARS, fiscalPosition } from "./comparison";

/**
 * dashboard-view.js — สถานะทั้งหมดของหน้าภาพรวมการพิมพ์ อยู่ที่เดียว
 *
 * หน้านี้มีตัวเลือกสองชนิดเท่านั้น และสองชนิดนี้ห้ามปนกัน
 *
 *   ตัวกรอง         ปีงบ ช่วงเวลา ฝ่าย แผนก สัญญา อาคาร เครื่อง
 *                   → บอกว่า "ดูข้อมูลชุดไหน" ทุกตัวเลขบนหน้าอ่านจากชุดนี้ชุดเดียว
 *   เปรียบเทียบตาม   → บอกว่า "แบ่งข้อมูลชุดนั้นเป็นเส้นอะไร" ไม่เพิ่มและไม่ลดข้อมูล
 *
 * เดิมชื่อมิติเดียวกัน (ฝ่าย สัญญา อาคาร …) โผล่บนหน้าสองที่: ตัวกรองขอบเขตชั้นหนึ่ง
 * กับช่อง "รายการที่เลือก" ของพื้นที่เปรียบเทียบอีกชั้นหนึ่ง คนละความหมายแต่ชื่อเดียวกัน
 * จนผู้ใช้ไม่รู้ว่าตัวไหนคุมอะไร ตอนนี้เหลือชั้นเดียว ผลพลอยได้คือ "การเลือกในกราฟ
 * ต้องไม่เปลี่ยนตัวเลขสำคัญ" กลายเป็นจริงโดยอัตโนมัติ เพราะไม่มีการเลือกในกราฟอีกแล้ว
 *
 * ปีงบเป็นตัวกรองเหมือนช่วงเวลา เลือกได้หลายปีเพื่อเทียบ โดย **ปีที่ใหม่ที่สุดที่เลือก
 * คือปีงบหลัก** ซึ่งเป็นตัวเดียวกับที่แถบบนสุดของแอปแสดง — ห้ามมีปีงบสองความหมาย
 * ในหน้าเดียว ส่วนเดือนที่เลือกเก็บเป็นเดือนจริงของปีงบหลัก แล้วขยายไปยังปีอื่นตาม
 * ตำแหน่งเดือนในปีงบ (ต.ค. ของปีหนึ่ง คู่กับ ต.ค. ของอีกปี ตาม ADR-0001)
 */

/** ตัวกรองหน่วยงาน/สถานที่/เครื่อง → คอลัมน์ของแถวรายเครื่องรายเดือนที่ใช้คัด */
const SCOPE_FIELDS = {
  divisions: "division_id",
  departments: "department_id",
  // สัญญาที่ API resolve ตามเดือนแล้ว (ADR-0019) ห้ามใช้ contract_id ซึ่งเป็นสัญญา
  // ปัจจุบันของเครื่องและจะย้อนทับอดีต
  contracts: "billing_contract_id",
  buildings: "building_id",
  devices: "device_id",
};

/** ตัวกรองหนึ่งตัว → ชื่อพารามิเตอร์ใน URL (เอกพจน์ สั้น และอ่านออกตอนแชร์ลิงก์) */
const SCOPE_QUERY = {
  divisions: "division",
  departments: "department",
  contracts: "contract",
  buildings: "building",
  devices: "device",
};

export const SCOPE_KEYS = Object.keys(SCOPE_FIELDS);

/**
 * มิติที่เทียบ → ตัวกรองตัวเดียวกันในแถบด้านบน (ภาพรวมและปีงบไม่มีตัวกรองคู่)
 *
 * เป็น Map ไม่ใช่ object ธรรมดา เพราะชื่อมิติมาจาก query string ได้ การอ่านด้วย
 * `object[name]` จะคืนค่าที่สืบทอดมาจาก prototype เมื่อ name เป็น "constructor"
 * หรือ "toString" แล้วโค้ดที่อ่านต่อพังทั้งหน้า
 */
const COMPARE_SCOPE = new Map([
  ["division", "divisions"],
  ["department", "departments"],
  ["contract", "contracts"],
  ["building", "buildings"],
  ["device", "devices"],
]);

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const ID_PATTERN = /^(\d+|unassigned)$/;
/**
 * ปีงบเป็น พ.ศ. สี่หลักในช่วงที่เป็นไปได้จริง
 *
 * `\d{4}` เฉยๆ ยอมให้ `?years=0000` ผ่าน แล้วช่วงเดือนที่คำนวณได้จะกลายเป็นปี ค.ศ.
 * ติดลบ ซึ่งถูกส่งไปให้ API แล้วเด้งกลับเป็น 400 โดยหน้าจอบอกได้แค่ "โหลดไม่สำเร็จ"
 */
const YEAR_PATTERN = /^2[3-9]\d{2}$/;

const first = (value) => String(Array.isArray(value) ? value[0] ?? "" : value ?? "");
const listFrom = (value, pattern) => [...new Set(first(value).split(",").map((item) => item.trim()).filter((item) => pattern.test(item)))];

export function emptyView() {
  return {
    years: [],
    months: [],
    ...Object.fromEntries(SCOPE_KEYS.map((key) => [key, []])),
    by: "overall",
    metric: "cost",
  };
}

/**
 * อ่านสถานะจาก query
 *
 * ค่าที่ไม่รู้จักตกไปที่ค่าเริ่มต้นเสมอ และเทียบกับรายการที่อนุญาตด้วย `includes()`
 * ไม่ใช่การมี property บน object — ไม่งั้น `?by=constructor` ผ่านด่านได้ทาง prototype
 */
export function viewFromQuery(query = {}) {
  const view = {
    years: listFrom(query.years, YEAR_PATTERN).sort().slice(-MAX_YEARS),
    months: listFrom(query.months, MONTH_PATTERN).sort(),
    ...Object.fromEntries(SCOPE_KEYS.map((key) => [key, listFrom(query[SCOPE_QUERY[key]], ID_PATTERN)])),
    by: DIMENSIONS.includes(first(query.by)) ? first(query.by) : "overall",
    metric: first(query.measure) === "pages" ? "rawPages" : "cost",
  };

  /*
   * ลิงก์เก่า: `?items=` คือรายการที่หยิบมาเทียบของมิติ `?by=` และ `?scope=`/`?scopeItem=`
   * คือขอบเขตของการเทียบข้ามปีงบ ทั้งสองอย่างมีความหมายเดียวกับ "ตัวกรอง" ในหน้าใหม่
   * จึงย้ายเข้าตัวกรองของมิตินั้นแทนการทิ้ง — บุ๊กมาร์กเดิมเปิดแล้วได้ข้อมูลชุดเดิม
   */
  const carry = (dimension, values) => {
    const key = COMPARE_SCOPE.get(dimension);
    if (key && values.length && !view[key].length) view[key] = values;
  };
  carry(view.by, listFrom(query.items, ID_PATTERN));
  carry(first(query.scope), listFrom(query.scopeItem, ID_PATTERN));
  return view;
}

/** สถานะ → query — ค่าเริ่มต้นไม่ถูกเขียน ลิงก์ของมุมมองปกติจึงยังสั้น */
export function viewToQuery(view) {
  return {
    years: view.years.length ? view.years.join(",") : undefined,
    months: view.months.length ? view.months.join(",") : undefined,
    ...Object.fromEntries(SCOPE_KEYS.map((key) => [SCOPE_QUERY[key], view[key]?.length ? view[key].join(",") : undefined])),
    by: view.by === "overall" ? undefined : view.by,
    measure: view.metric === "rawPages" ? "pages" : undefined,
  };
}

/** ชื่อพารามิเตอร์ทุกตัวที่หน้านี้เป็นเจ้าของ — ใช้ตรวจว่า URL ตรงกับสถานะจริงหรือยัง */
export const VIEW_QUERY_KEYS = ["years", "months", ...Object.values(SCOPE_QUERY), "by", "measure"];

/**
 * คัดแถวรายเครื่องรายเดือนด้วยตัวกรองของหน้า
 *
 * ตัวกรองแต่ละตัวเป็น "ค่าใดค่าหนึ่งในที่เลือก" และตัวกรองคนละตัวต้องเป็นจริงพร้อมกัน
 * เลือกหลายแผนกข้ามฝ่ายได้โดยไม่ต้องเลือกฝ่ายก่อน เพราะสองตัวกรองไม่ผูกกัน
 */
export function filterRows(rows, view = {}) {
  const selected = Object.fromEntries(
    SCOPE_KEYS.map((key) => [key, new Set((view[key] ?? []).map(String))])
  );
  const active = SCOPE_KEYS.filter((key) => selected[key].size > 0);
  if (!active.length) return rows ?? [];
  return (rows ?? []).filter((row) => active.every((key) => selected[key].has(String(row[SCOPE_FIELDS[key]] ?? "unassigned"))));
}

/** หลังเปลี่ยนปีงบ คงเฉพาะตัวกรองที่มีแถวในช่วงใหม่ โดยตรวจแต่ละมิติแยกกัน */
export function pruneUnavailableScopes(view, rows) {
  const removed = [];
  const next = { ...view };
  for (const key of SCOPE_KEYS) {
    const available = new Set((rows ?? []).map((row) => String(row[SCOPE_FIELDS[key]] ?? "unassigned")));
    const kept = (view[key] ?? []).filter((value) => available.has(String(value)));
    if (kept.length !== (view[key] ?? []).length) {
      removed.push({ key, values: (view[key] ?? []).filter((value) => !available.has(String(value))) });
      next[key] = kept;
    }
  }
  return { view: next, removed };
}

/**
 * รหัสที่ผู้ใช้เลือกไว้ในตัวกรองของมิติที่กำลังเทียบ
 *
 * เลือกฝ่าย A, B, C ไว้แล้ว C ไม่มียอดในช่วงนี้ — C ต้องยังอยู่ในตารางพร้อมคำว่า
 * "ไม่มีข้อมูล" ไม่ใช่หายไปเงียบๆ จนผู้ใช้คิดว่าตัวเองเลือกพลาด
 */
export function selectedKeysFor(view, dimension) {
  const key = COMPARE_SCOPE.get(dimension);
  return key ? [...new Set((view[key] ?? []).map(String))] : [];
}

/**
 * เดือนจริงที่ต้องขอจาก API
 *
 * ปีงบเดียว = เดือนที่เลือก (หรือทั้งปีงบเมื่อไม่ได้เจาะจง) — เหมือนเดิมทุกอย่าง
 * หลายปีงบ  = เดือนตำแหน่งเดียวกันของทุกปีที่เลือก เช่นเลือก ต.ค.–ธ.ค. กับปีงบ 2568
 *             และ 2569 จะได้ ต.ค.–ธ.ค. ของทั้งสองปี ไม่ใช่หกเดือนติดกัน
 *
 * @param {{months: string[]}} view
 * @param {Array<string|number>} years ปีงบ พ.ศ. ทุกปีที่เลือก
 */
export function requestedMonths(view, years) {
  const positions = (view.months ?? []).map(fiscalPosition).filter(Boolean);
  const months = (years ?? []).flatMap((year) => {
    const all = fiscalYearMonths(getFiscalYearRange(Number(year)));
    if (!all.length) return [];
    if (!positions.length) return all;
    return positions.map((position) => all[Number(position.slice(1)) - 1]).filter(Boolean);
  });
  return [...new Set(months)].sort();
}
