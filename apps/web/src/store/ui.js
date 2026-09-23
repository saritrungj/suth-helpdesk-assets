import { reactive } from "vue";

/**
 * ui.js — สถานะของเปลือกแอป (แถบเมนู, ช่องค้นหาคำสั่ง) ที่หลาย component ใช้ร่วมกัน
 *
 * แยกจาก store/theme.js เพราะอันนั้นเป็น "ความชอบด้านการแสดงผล" ที่มีผลกับทุกหน้า
 * ส่วนอันนี้เป็น "สถานะการเปิด-ปิดของชิ้นส่วนบนหน้าจอ" ซึ่งเปลี่ยนไปมาตลอดการใช้งาน
 *
 * การพับแถบเมนูถูกจำไว้ข้ามเซสชัน เพราะคนที่ทำงานกับตารางกว้างๆ ทั้งวันจะพับไว้
 * ตลอด แล้วต้องมาพับใหม่ทุกครั้งที่เปิดเว็บถ้าไม่จำให้
 *
 * การเปิด-ปิดหมวดเมนูก็จำด้วยเหตุผลเดียวกัน ทุกหมวดเปิดเป็นค่าเริ่มต้น และจำเฉพาะหมวดที่
 * ผู้ใช้กดเอง — เดิมเปิดแค่งานประจำ และลืมทุกครั้งที่โหลดหน้าหรือล็อกอินใหม่
 */

const RAIL_KEY = "suth-ui-nav-collapsed";
const GROUPS_KEY = "suth-ui-nav-groups";

function readCollapsed() {
  try {
    return localStorage.getItem(RAIL_KEY) === "1";
  } catch {
    return false;
  }
}

/** { [key ของหมวด]: true/false } เฉพาะหมวดที่ผู้ใช้เคยกด — ค่าที่อ่านไม่ได้ถือว่ายังไม่เคยกด */
function readNavGroups() {
  try {
    const saved = JSON.parse(localStorage.getItem(GROUPS_KEY) || "{}");
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
    return Object.fromEntries(Object.entries(saved).filter(([, open]) => typeof open === "boolean"));
  } catch {
    return {};
  }
}

export const uiState = reactive({
  /** ลิ้นชักเมนูบนจอเล็ก (< lg) — บนจอใหญ่แถบเมนูอยู่ประจำที่เสมอ */
  mobileNavOpen: false,
  /** พับแถบเมนูบนจอใหญ่ให้เหลือเฉพาะไอคอน */
  navCollapsed: readCollapsed(),
  /** หมวดเมนูที่ผู้ใช้เปิด-ปิดเอง — หมวดที่ไม่อยู่ในนี้เปิดตามค่าเริ่มต้น */
  navGroups: readNavGroups(),
  /** ช่องค้นหาคำสั่ง (Ctrl+K) */
  commandOpen: false,
});

export function openMobileNav() {
  uiState.mobileNavOpen = true;
}

export function closeMobileNav() {
  uiState.mobileNavOpen = false;
}

export function toggleNavCollapsed() {
  uiState.navCollapsed = !uiState.navCollapsed;
  try {
    localStorage.setItem(RAIL_KEY, uiState.navCollapsed ? "1" : "0");
  } catch {
    // จำข้ามเซสชันไม่ได้ แต่ยังพับได้ในรอบนี้
  }
}

/** หมวดเปิดอยู่ไหม — ยังไม่เคยกด = เปิด */
export function isNavGroupOpen(key) {
  return uiState.navGroups[key] ?? true;
}

export function toggleNavGroup(key) {
  uiState.navGroups = { ...uiState.navGroups, [key]: !isNavGroupOpen(key) };
  try {
    localStorage.setItem(GROUPS_KEY, JSON.stringify(uiState.navGroups));
  } catch {
    // จำข้ามเซสชันไม่ได้ แต่ยังเปิด-ปิดได้ในรอบนี้
  }
}

export function openCommandPalette() {
  uiState.commandOpen = true;
}

export function setCommandPalette(open) {
  uiState.commandOpen = open;
}
