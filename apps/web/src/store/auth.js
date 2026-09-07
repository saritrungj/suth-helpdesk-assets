import { reactive } from "vue";
import { resetQueryCacheForNewIdentity } from "../api/query-client";

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

/**
 * "ตัวตน" ที่ใช้ตัดสินว่าต้องล้าง cache ไหม — id คู่กับบทบาท
 *
 * บทบาทอยู่ในนี้ด้วยเพราะสิทธิ์อ่านผูกกับบทบาท ไม่ใช่กับตัวคน การถูกลดสิทธิ์
 * ระหว่างที่เปิดแอปค้างไว้จึงต้องล้างของที่ดึงมาตอนยังมีสิทธิ์มากกว่าทิ้ง
 */
function identityOf(user) {
  return user ? `${user.id}:${user.role}` : null;
}

/**
 * ⚠️ ทั้ง setAuth และ clearAuth ต้องล้าง query cache เมื่อตัวตนเปลี่ยน
 *
 * cache มีอายุเท่ากับ SPA ไม่ใช่เท่ากับ session และ query key ไม่ได้ผูกกับผู้ใช้
 * ถ้าไม่ล้าง การล็อกอินด้วยบัญชีอื่นบนเครื่องเดียวกันจะอ่านของบัญชีก่อนหน้าต่อได้
 * โดยยังไม่ถาม API ใหม่ (ดู api/query-client.js และ issue #29)
 *
 * ตัดสินจาก "ตัวตนเปลี่ยนจริงไหม" ไม่ใช่ล้างทุกครั้งที่ถูกเรียก — ไม่งั้นการ
 * ยืนยัน session ตอนรีเฟรชหน้าจะล้างของที่เพิ่งโหลดมาแล้วยิงใหม่ทั้งแอปทุกครั้ง
 */
export function setAuth(user) {
  const changed = identityOf(user) !== identityOf(authState.user);

  authState.user = user;
  authState.ready = true;

  if (changed) resetQueryCacheForNewIdentity();
}

export function clearAuth() {
  const changed = authState.user !== null;

  authState.user = null;
  authState.ready = true;

  if (changed) resetQueryCacheForNewIdentity();
}
