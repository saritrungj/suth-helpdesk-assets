import { reactive } from "vue";

/**
 * ui.js — สถานะ UI ทั่วไปที่ใช้ร่วมกันหลาย component (ไม่ผูกกับ auth/theme)
 * ตอนนี้ใช้เก็บสถานะเปิด/ปิด sidebar บนจอมือถือ/แท็บเล็ต (< md)
 * บนจอ desktop sidebar จะแสดงอยู่แล้วเสมอ ไม่ใช้ state นี้
 */
export const uiState = reactive({
  mobileSidebarOpen: false,
});

export function openMobileSidebar() {
  uiState.mobileSidebarOpen = true;
}

export function closeMobileSidebar() {
  uiState.mobileSidebarOpen = false;
}

export function toggleMobileSidebar() {
  uiState.mobileSidebarOpen = !uiState.mobileSidebarOpen;
}
