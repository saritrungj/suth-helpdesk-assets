import { t } from "../lib/locale";
import { keys } from "./queries";
import { markForRevalidation } from "./http-cache";

/**
 * invalidate.js — หลังเขียนข้อมูลสำเร็จ ต้องล้างแคชอะไรบ้าง
 *
 * ## ปัญหาที่ตัวนี้แก้
 *
 * ADR-0009 กำหนดให้เรียก `invalidateQueries` หลังแก้ข้อมูล แต่แต่ละหน้ากลับโหลด
 * เฉพาะรายการของตัวเองด้วย axios ตรงๆ ผลคือหน้าอื่นที่ใช้ข้อมูลชุดเดียวกันยังเห็น
 * ของเก่า — แก้ชื่ออาคารในหน้าข้อมูลอ้างอิงแล้วตัวกรองบนแดชบอร์ดยังขึ้นชื่อเดิม
 * ได้อีก 30 นาทีตาม staleTime
 *
 * ## ทำไมต้องเป็นตาราง ไม่ใช่เรียก invalidate ตรงจุดที่เขียน
 *
 * "แก้อาคารแล้วกระทบอะไรบ้าง" เป็นความรู้ที่ต้องอยู่ที่เดียว ถ้าให้แต่ละหน้าตอบเอง
 * หน้าใหม่ที่เขียนทีหลังจะตอบไม่ครบเสมอ — ซึ่งเป็นสิ่งที่เกิดขึ้นมาแล้ว
 *
 * ## สองชั้น ไม่ใช่ชั้นเดียว
 *
 * ล้าง TanStack cache อย่างเดียวไม่พอ เพราะ endpoint ข้อมูลอ้างอิงตอบ
 * `Cache-Control: private, max-age=60` (ดู apps/api/src/shared/cache.js)
 * เบราว์เซอร์จึงตอบจากแคชของตัวเองได้อีกหนึ่งนาทีโดยไม่ถามเซิร์ฟเวอร์เลย
 * การ refetch หลังล้างแคชจะได้ข้อมูลเก่ากลับมาเหมือนเดิม — จึงต้องสั่งให้คำขอ
 * ครั้งถัดไปของ URL เหล่านั้น revalidate ด้วย (ดู ./http-cache.js)
 */

/**
 * ตาราง "เขียนอะไร → แคชไหนเสีย"
 *
 * ค่าเป็น **prefix ของ key** ไม่ใช่ key เต็ม — `["devices"]` ครอบทั้งรายการเครื่อง
 * หน้ารายละเอียด และประวัติการย้าย เพราะทุกตัวขึ้นต้นด้วย "devices" เหมือนกัน
 * (ดูเหตุผลใน api/device-detail.test.js)
 */
export const AFFECTED_KEYS = {
  // ข้อมูลอ้างอิงแต่ละชนิด — ชื่อของมันไปโผล่ในทะเบียนเครื่องและทุกรายงาน
  // จึงต้องล้างสามอย่างเสมอ ไม่ใช่แค่รายการของตัวเอง
  buildings: [keys.buildings(), keys.devices(), ["dashboard"]],
  floors: [keys.floors(), keys.devices(), ["dashboard"]],
  divisions: [keys.divisions(), keys.departments(), keys.devices(), ["dashboard"]],
  departments: [keys.departments(), keys.devices(), ["dashboard"]],
  brands: [keys.brands(), keys.devices(), ["dashboard"]],
  contracts: [keys.contracts(), keys.devices(), ["dashboard"]],

  // ปีงบเปลี่ยนช่วงเดือน ทุกอย่างที่คิดตามปีงบจึงเสียหมด
  "fiscal-years": [keys.devices(), ["dashboard"], ["print-transactions"]],

  // เพิ่ม/แก้/ย้าย/ลบ/นำเข้าเครื่อง — ความครบถ้วนรายเดือนนับจากจำนวนเครื่องด้วย
  device: [keys.devices(), ["dashboard"], ["print-transactions"]],

  // บันทึกยอดพิมพ์ — ทุกตัวเลขเงินคำนวณจากตรงนี้
  usage: [["print-transactions"], ["dashboard"]],
};

/** URL ที่ต้องบังคับ revalidate เมื่อแคชของชนิดนั้นเสีย — เฉพาะที่ตอบ max-age > 0 */
export const AFFECTED_URLS = {
  buildings: ["/buildings"],
  floors: ["/floors"],
  divisions: ["/divisions", "/departments"],
  departments: ["/departments"],
  brands: ["/brands"],
  contracts: ["/contracts"],
  "fiscal-years": ["/fiscal-years"],
  device: [],
  usage: [],
};

/**
 * ล้างแคชทุกชั้นหลังเขียนข้อมูลสำเร็จ
 *
 * @param {import("@tanstack/vue-query").QueryClient} queryClient
 * @param {keyof typeof AFFECTED_KEYS} change สิ่งที่เพิ่งถูกเขียน
 * @returns {Promise<void>} รอจนคำขอที่ถูกกระตุ้นเสร็จ เพื่อให้ผู้เรียกรู้ว่าหน้าจอตรงแล้ว
 */
export function invalidateAfterWrite(queryClient, change) {
  const keyList = AFFECTED_KEYS[change];

  if (!keyList) {
    // เขียนชื่อชนิดผิดแปลว่าแคชจะไม่ถูกล้างเลย ซึ่งเป็นบั๊กที่เงียบมาก — ต้องดังไว้ก่อน
    throw new Error(t("invalidateAfterWrite: ไม่รู้จักชนิดการเขียน \"{0}\"", [change]));
  }

  markForRevalidation(AFFECTED_URLS[change] ?? []);

  return Promise.all(
    keyList.map((queryKey) => queryClient.invalidateQueries({ queryKey }))
  ).then(() => undefined);
}

/** ชนิดของข้อมูลอ้างอิงที่ MasterDataPage ใช้ — map จาก endpoint ที่หน้านั้นรับมาเป็น prop */
export function changeKindForEndpoint(endpoint) {
  const name = String(endpoint || "").replace(/^\//, "");
  return name in AFFECTED_KEYS ? name : null;
}
