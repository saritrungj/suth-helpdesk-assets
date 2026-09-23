import { readSession, writeSession } from "./session-memory";

/**
 * form-draft.js — เก็บข้อมูลที่กรอกค้างไว้ของฟอร์มยาวๆ ให้รอดการออกจากหน้าและการรีเฟรช (#177)
 *
 * ## ทำไมใช้ sessionStorage ไม่ใช่ localStorage
 *
 * เครื่องในโรงพยาบาลใช้ร่วมกันหลายคน ร่างต้องไม่ข้ามวันและไม่ข้ามคน — sessionStorage หายเมื่อปิดแท็บ
 * ร่างผูกกับ id ผู้ใช้ และถูกล้างทุกครั้งที่ออกจากระบบหรือ session หมดอายุ (store/auth.js)
 *
 * ## ทำไมไม่ใช้สำหรับการนำเข้าไฟล์
 *
 * ไฟล์ขนาดหลาย MB และการตัดสินใจที่ผูกกับข้อมูลบนเซิร์ฟเวอร์ต้องอยู่ฝั่งเซิร์ฟเวอร์ (import session)
 * ที่นี่เก็บเฉพาะค่าของช่องกรอกเล็กๆ
 */

const PREFIX = "draft:";
const STORAGE_PREFIX = `suth:${PREFIX}`;

/**
 * @param {string} key ชื่อของฟอร์ม เช่น "add-asset"
 * @param {number|string|null|undefined} userId ร่างของคนอื่นอ่านไม่ได้
 */
export function formDraft(key, userId) {
  const storageKey = `${PREFIX}${key}`;
  return {
    /** @returns {{ values: object, at: string } | null} */
    read() {
      const saved = readSession(storageKey, null);
      if (!saved || typeof saved !== "object" || saved.user !== userId || !saved.values) return null;
      return { values: saved.values, at: saved.at };
    },
    write(values) {
      writeSession(storageKey, { user: userId, at: new Date().toISOString(), values });
    },
    clear() {
      writeSession(storageKey, undefined);
    },
  };
}

/** ล้างร่างทุกฟอร์ม — เรียกเมื่อตัวตนของผู้ใช้หายไป (ออกจากระบบ, session หมดอายุ) */
export function clearFormDrafts() {
  try {
    const storage = window.sessionStorage;
    const keys = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
  } catch {
    // ที่เก็บของเบราว์เซอร์ใช้ไม่ได้ = ไม่มีร่างให้ล้าง
  }
}
