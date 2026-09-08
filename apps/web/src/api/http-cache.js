/**
 * http-cache.js — บังคับให้คำขอครั้งถัดไปของ URL ที่ระบุถาม server ใหม่
 *
 * ## ทำไมต้องมี
 *
 * endpoint ข้อมูลอ้างอิงตอบ `Cache-Control: private, max-age=60` เบราว์เซอร์จึง
 * ตอบจากแคชของตัวเองได้อีกหนึ่งนาทีโดยไม่ถาม server เลย — การล้าง TanStack cache
 * แล้ว refetch จะได้ข้อมูลเก่าก้อนเดิมกลับมา เหมือนไม่ได้ล้างอะไร
 *
 * ## ทำไมไม่แก้ด้วยการเลิกใช้ max-age
 *
 * เพราะ max-age มีประโยชน์จริงตอนเปิดหน้าใหม่/refresh — สิ่งที่ต้องการคือ
 * "ครั้งถัดไปหลังจากที่เราเพิ่งเขียนข้อมูล ให้ถามใหม่" ไม่ใช่ "ถามใหม่ทุกครั้ง"
 * เครื่องหมายจึงถูกใช้แล้วทิ้งทีละครั้ง
 */

const pending = new Set();

/** ทำเครื่องหมายว่า URL เหล่านี้ต้อง revalidate ในคำขอครั้งถัดไป */
export function markForRevalidation(urls) {
  for (const url of urls) pending.add(url);
}

/**
 * ขอ header สำหรับคำขอของ URL นี้ แล้ว **ล้างเครื่องหมายทิ้ง**
 *
 * @returns {object|undefined} undefined = ไม่ต้องใส่ header อะไรเพิ่ม
 */
export function takeRevalidationHeaders(url) {
  if (!pending.delete(url)) return undefined;
  return { "Cache-Control": "no-cache" };
}

/** ใช้ในเทสเท่านั้น — ล้างเครื่องหมายที่ค้างอยู่ทั้งหมด */
export function resetRevalidationMarks() {
  pending.clear();
}
