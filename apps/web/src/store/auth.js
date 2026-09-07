import { reactive } from "vue";

// reactive state เดียวที่ทุก component (แถบเมนู, แถบบน, หน้าล็อกอิน) ใช้ร่วมกัน
//
// ไม่มี token อยู่ที่นี่และไม่มีใน localStorage อีกแล้ว — token อยู่ใน cookie แบบ httpOnly
// ที่ JavaScript อ่านไม่ได้ (ดู apps/api/src/auth/session-cookie.js) เว็บรู้แค่ว่า
// "ตอนนี้เป็นใคร" ซึ่งได้มาจาก GET /auth/me ตอนเปิดหน้า
//
// ไฟล์นี้ตั้งใจไม่ import services/api เพื่อไม่ให้เกิด circular import
// (api.js เรียก clearAuth ตอนเจอ 401) การเรียก API ที่เกี่ยวกับ session อยู่ใน store/session.js
export const authState = reactive({
  user: null,

  // false ระหว่างที่ยังถาม /auth/me ไม่เสร็จ — router guard ต้องรอให้เป็น true ก่อน
  // ไม่งั้นตอนรีเฟรชหน้าจะถูกเด้งไป /login ทั้งที่ยังล็อกอินอยู่
  ready: false,
});

export function setAuth(user) {
  authState.user = user;
  authState.ready = true;
}

export function clearAuth() {
  authState.user = null;
  authState.ready = true;
}
