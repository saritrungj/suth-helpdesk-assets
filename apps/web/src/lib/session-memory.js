/**
 * session-memory.js — จำสถานะของหน้าไว้ในแท็บนี้ (#115)
 *
 * ใช้ sessionStorage เพราะขอบเขตที่ตกลงไว้คือ "ในแท็บนี้จนกว่าจะปิด" — เปิดวันใหม่ต้องเห็น
 * ปีงบและเดือนล่าสุด ไม่ใช่มุมมองที่ค้างจากเมื่อวาน (localStorage จะจำข้ามวัน)
 *
 * ที่เก็บของเบราว์เซอร์อาจใช้ไม่ได้ (โหมดส่วนตัว ปิดที่เก็บข้อมูล) — ทุกการอ่านเขียนจึงอยู่ใน
 * try/catch และหน้ายังทำงานได้ครบเพียงแต่จำอะไรไม่ได้
 */

const PREFIX = "suth:";

export function readSession(key, fallback = null) {
  try {
    const raw = window.sessionStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeSession(key, value) {
  try {
    if (value === undefined) window.sessionStorage.removeItem(PREFIX + key);
    else window.sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // จำไม่ได้ก็ไม่เป็นไร — หน้าเริ่มจากค่าเริ่มต้นเหมือนเปิดครั้งแรก
  }
}

/**
 * ความจำแยกตามโหมดของหน้าเดียว เช่น "เทียบระหว่าง: สัญญา" กับ "อาคาร" จำรายการที่เลือกคนละชุด
 * สลับไปดูอีกโหมดแล้วกลับมาจึงได้ชุดเดิม ไม่ใช่เริ่มเลือกใหม่ทุกครั้ง
 */
export function modeMemory(page) {
  const key = `modes:${page}`;
  return {
    save(mode, value) {
      writeSession(key, { ...readSession(key, {}), [mode]: value });
    },
    restore(mode) {
      const modes = readSession(key, {});
      return modes && typeof modes === "object" && Object.hasOwn(modes, mode) ? modes[mode] ?? null : null;
    },
    clear() {
      writeSession(key, undefined);
    },
  };
}
