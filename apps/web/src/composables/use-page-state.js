import { getCurrentInstance, watch } from "vue";
import { readSession, writeSession } from "../lib/session-memory";
import { hasActionQuery, ownQuery, sameQuery } from "../lib/page-memory";

/**
 * จำค่าของหน้าที่ไม่ได้อยู่ใน URL ไว้ในแท็บนี้ (#115) — คำค้น กิ่งที่กางไว้ แท็บที่เปิดอยู่
 *
 * ค่าที่จำถูกคืนเมื่อเปิดหน้าด้วยมุมมองเดิม: เข้าจากเมนู (router เติม query เดิมให้ ดู
 * page-memory.js) หรือกด F5 ถ้าเปิดด้วยลิงก์ที่ระบุค่าต่างไปจากเดิม ลิงก์ชนะ และหน้าเริ่มจาก
 * ค่าเริ่มต้นเหมือนเปิดครั้งแรก
 *
 * เรียกหลังประกาศ ref ทั้งหมดแล้ว ก่อน watcher ที่โหลดข้อมูลตามค่าเหล่านั้น จะได้โหลดชุดที่
 * คืนค่าแล้วเป็นรอบแรก ไม่ใช่โหลดค่าเริ่มต้นทิ้งไปหนึ่งรอบ
 *
 * @param {Record<string, import("vue").Ref>} refs ค่าที่จะจำ — Set ถูกเก็บเป็นรายการแล้วคืนเป็น Set
 * @param {{ key?: string }} [options] แยกความจำเมื่อหน้าเดียวมีหลายส่วนที่จำแยกกัน
 */
export function usePageState(refs, { key = "" } = {}) {
  // route ปัจจุบันของแอป — อยู่นอก router (เช่นในเทสของ component) จึงไม่จำอะไรและไม่รบกวนกัน
  // อ่าน $route ทุกครั้งที่ใช้ เพราะมันคืนค่าของ route ณ ตอนนั้น (อ่านใน watch จึงติดตามได้)
  const globals = getCurrentInstance()?.appContext.config.globalProperties;
  const route = globals?.$route;
  if (!route?.name) return;
  const current = () => globals.$route;
  const storageKey = `state:${String(route.name)}${key ? `:${key}` : ""}`;
  const saved = readSession(storageKey, null);
  const ownRoute = ownQuery(route.query);
  if (isPlainObject(saved?.values) && !hasActionQuery(route.query) && (!Object.keys(ownRoute).length || sameQuery(ownRoute, saved.query))) {
    for (const [name, target] of Object.entries(refs)) {
      if (Object.hasOwn(saved.values, name)) target.value = revive(saved.values[name], target.value);
    }
  }
  watch(
    () => [current().query, ...Object.values(refs).map((target) => target.value)],
    () => writeSession(storageKey, {
      query: ownQuery(current().query),
      values: Object.fromEntries(Object.entries(refs).map(([name, target]) => [name, pack(target.value)])),
    }),
    { deep: true },
  );
}

const pack = (value) => (value instanceof Set ? { $set: [...value] } : value);

function revive(value, current) {
  if (value && Array.isArray(value.$set)) return new Set(value.$set);
  // object ตัวกรอง — คีย์ใหม่ที่เพิ่มทีหลังยังได้ค่าเริ่มต้น ไม่หายไปเพราะความจำเก่า
  if (isPlainObject(current) && isPlainObject(value)) return { ...current, ...value };
  return value;
}

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Set) && !(value instanceof Map);
