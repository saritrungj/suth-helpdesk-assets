import { reactive } from "vue";

/**
 * ui.js — สถานะของเปลือกแอป (แถบเมนู, ช่องค้นหาคำสั่ง) ที่หลาย component ใช้ร่วมกัน
 *
 * แยกจาก store/theme.js เพราะอันนั้นเป็น "ความชอบด้านการแสดงผล" ที่มีผลกับทุกหน้า
 * ส่วนอันนี้เป็น "สถานะการเปิด-ปิดของชิ้นส่วนบนหน้าจอ" ซึ่งเปลี่ยนไปมาตลอดการใช้งาน
 *
 * การพับแถบเมนูถูกจำไว้ข้ามเซสชัน เพราะคนที่ทำงานกับตารางกว้างๆ ทั้งวันจะพับไว้
 * ตลอด แล้วต้องมาพับใหม่ทุกครั้งที่เปิดเว็บถ้าไม่จำให้
 */

const RAIL_KEY = "suth-ui-nav-collapsed";

function readCollapsed() {
  try {
    return localStorage.getItem(RAIL_KEY) === "1";
  } catch {
    return false;
  }
}

export const uiState = reactive({
  /** ลิ้นชักเมนูบนจอเล็ก (< lg) — บนจอใหญ่แถบเมนูอยู่ประจำที่เสมอ */
  mobileNavOpen: false,
  /** พับแถบเมนูบนจอใหญ่ให้เหลือเฉพาะไอคอน */
  navCollapsed: readCollapsed(),
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

export function openCommandPalette() {
  uiState.commandOpen = true;
}

export function setCommandPalette(open) {
  uiState.commandOpen = open;
}
