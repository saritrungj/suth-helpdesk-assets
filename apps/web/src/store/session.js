import api from "../services/api";
import { setAuth, clearAuth, authState } from "./auth";

// การเรียก API ที่เกี่ยวกับ session แยกออกมาจาก store/auth.js
// เพราะ services/api.js import clearAuth จาก store/auth อยู่แล้ว ถ้าเอาการเรียก API
// ไปไว้ในไฟล์เดียวกันจะเกิด circular import

/**
 * ถามเซิร์ฟเวอร์ว่าตอนนี้ล็อกอินอยู่หรือเปล่าและเป็นใคร
 *
 * ต้องถามทุกครั้งที่เปิดหน้าใหม่ เพราะ token อยู่ใน cookie แบบ httpOnly ที่เว็บอ่านเองไม่ได้
 * เรียกก่อน mount แอป เพื่อให้ router guard ตัดสินใจได้ถูกตั้งแต่หน้าแรก
 *
 * @returns {Promise<void>} ไม่ throw — ถ้าถามไม่สำเร็จถือว่ายังไม่ได้ล็อกอิน
 */
export async function restoreSession() {
  try {
    const res = await api.get("/auth/me", { skipAuthRedirect: true });
    setAuth(res.data.user);
  } catch {
    // 401 = ยังไม่ได้ล็อกอิน ส่วน error อื่น (API ล่ม) ก็ให้ไปหน้า login เหมือนกัน
    // จะได้ไม่ค้างอยู่หน้าขาวโดยไม่มีอะไรบอก
    clearAuth();
  }
}

/**
 * ออกจากระบบ — ให้เซิร์ฟเวอร์ลบ cookie ทิ้ง แล้วเคลียร์ state ฝั่งเว็บ
 *
 * เคลียร์ state เสมอแม้เรียก API ไม่สำเร็จ เพราะผู้ใช้กด logout แล้วต้องหลุดออกจริง
 * ไม่ใช่ค้างอยู่ในระบบเพราะเน็ตมีปัญหา
 */
export async function logout() {
  try {
    await api.post("/auth/logout", null, { skipAuthRedirect: true });
  } catch {
    // ไม่ต้องทำอะไร — เคลียร์ฝั่งเว็บต่อไปอยู่ดี
  } finally {
    clearAuth();
  }
}

export { authState };
