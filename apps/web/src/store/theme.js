import { reactive } from "vue";

/**
 * theme.js — โหมดสี (สว่าง/มืด/ตามเครื่อง) และความหนาแน่นของข้อมูล
 *
 * กลไก: ใส่ attribute ที่ <html> แล้ว design token ใน src/design/tokens.css
 * กับ base.css จะสลับค่าตามเอง — ไม่มีที่ไหนในแอปต้องรู้ว่าตอนนี้โหมดอะไร
 *
 *   data-mode-pref  สิ่งที่ผู้ใช้เลือก   "light" | "dark" | "system"
 *   data-mode       โหมดที่ใช้จริง       "light" | "dark"
 *   data-density    ความหนาแน่น         "compact" | "default" | "relaxed"
 *
 * ต้องแยก pref กับ mode ออกจากกัน เพราะ "system" ไม่ใช่โหมดที่ทาสีได้ แต่เป็น
 * คำสั่งว่า "ตามเครื่อง" ซึ่งค่าจริงเปลี่ยนได้เองระหว่างที่เปิดหน้าอยู่ (เช่นเครื่อง
 * ตั้งให้สลับเป็นโหมดมืดตอนพระอาทิตย์ตก) จึงต้อง subscribe การเปลี่ยนแปลงไว้ด้วย
 *
 * ค่าเริ่มต้นของผู้ใช้ใหม่คือ "system" — เคารพสิ่งที่เขาตั้งไว้ที่เครื่องแล้ว
 * ดีกว่าบังคับโหมดใดโหมดหนึ่งของเราเอง
 *
 * หมายเหตุ: index.html อ่านค่าเดียวกันนี้และตั้ง attribute ให้ก่อน CSS จะ paint
 * ครั้งแรก ถ้าแก้ชื่อ key ตรงนี้ต้องแก้ที่นั่นด้วย
 */

const MODE_KEY = "suth-ui-mode";
const DENSITY_KEY = "suth-ui-density";

const MODES = ["light", "dark", "system"];
const DENSITIES = ["compact", "default", "relaxed"];

function readStored(key, allowed, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return allowed.includes(saved) ? saved : fallback;
  } catch {
    // localStorage ใช้ไม่ได้ (โหมดส่วนตัว/นโยบายของเครื่อง) — ใช้ค่าเริ่มต้นแทน
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // จำข้ามเซสชันไม่ได้ แต่ใช้งานในรอบนี้ได้ปกติ
  }
}

const darkQuery =
  typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;

function systemMode() {
  return darkQuery?.matches ? "dark" : "light";
}

export const modeState = reactive({
  /** สิ่งที่ผู้ใช้เลือกไว้ — ใช้กับ UI ตัวสลับโหมด */
  pref: readStored(MODE_KEY, MODES, "system"),
  /** โหมดที่กำลังแสดงจริง — ใช้กับกราฟที่ต้องรู้สีพื้นหลัง */
  current: "light",
  density: readStored(DENSITY_KEY, DENSITIES, "default"),
});

function paint() {
  const resolved = modeState.pref === "system" ? systemMode() : modeState.pref;
  modeState.current = resolved;

  const root = document.documentElement;
  root.setAttribute("data-mode-pref", modeState.pref);
  root.setAttribute("data-mode", resolved);
  root.setAttribute("data-density", modeState.density);
}

export function setMode(pref) {
  modeState.pref = MODES.includes(pref) ? pref : "system";
  write(MODE_KEY, modeState.pref);
  paint();
}

/** วนตามลำดับ สว่าง -> มืด -> ตามเครื่อง สำหรับปุ่มกดเดียว */
export function cycleMode() {
  const order = ["light", "dark", "system"];
  const next = order[(order.indexOf(modeState.pref) + 1) % order.length];
  setMode(next);
}

export function setDensity(density) {
  modeState.density = DENSITIES.includes(density) ? density : "default";
  write(DENSITY_KEY, modeState.density);
  paint();
}

// ถ้าเลือก "ตามเครื่อง" ไว้ ต้องเปลี่ยนตามทันทีที่เครื่องเปลี่ยน โดยไม่ต้องรีเฟรช
darkQuery?.addEventListener("change", () => {
  if (modeState.pref === "system") paint();
});

paint();
