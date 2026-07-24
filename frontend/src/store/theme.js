import { reactive } from "vue";

/**
 * theme.js — จัดการโหมดสี (สว่าง/มืด) ของทั้งระบบ
 *
 * กลไก: ใส่ attribute [data-mode="light"|"dark"] ไว้ที่ <html> แล้ว style.css จะ
 * แม็ปสเกลสี Tailwind "gray-*"/"red-*" ที่ใช้อยู่ทั่วทั้งระบบ (พื้นหลัง, ตัวหนังสือ,
 * กล่องแจ้งเตือน ฯลฯ) ให้เปลี่ยนตามโหมดที่เลือกโดยอัตโนมัติ — ไม่ต้องแก้ทีละไฟล์
 */

const STORAGE_KEY = "suth-ui-mode";
const DEFAULT_MODE = "dark";

function readStoredMode() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "light" || saved === "dark" ? saved : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

export const modeState = reactive({
  current: readStoredMode(),
});

export function applyMode(mode) {
  const valid = mode === "light" ? "light" : "dark";
  modeState.current = valid;
  document.documentElement.setAttribute("data-mode", valid);
  try {
    localStorage.setItem(STORAGE_KEY, valid);
  } catch {
    // localStorage ใช้ไม่ได้ (private mode ฯลฯ) — โหมดจะไม่ถูกจำไว้ข้ามเซสชัน แต่ยังใช้งานได้ปกติ
  }
}

export function toggleMode() {
  applyMode(modeState.current === "dark" ? "light" : "dark");
}

// เรียกครั้งแรกตอนแอปโหลด ให้ attribute ตรงกับค่าที่จำไว้เสมอ
applyMode(modeState.current); 