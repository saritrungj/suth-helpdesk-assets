// apps/api/src/auth/jwt-secret.js
//
// ตรวจกุญแจเซ็น token ก่อนเปิดเซิร์ฟเวอร์ (#139)
//
// เดิมไม่มีใครตรวจเลย ผลสองแบบที่เกิดได้จริง
//
//   - ไม่ได้ตั้ง JWT_SECRET: เซิร์ฟเวอร์เปิดขึ้นมา health ตอบ 200 แต่การล็อกอินที่รหัสถูกทุกครั้ง
//     ตอบ 500 ("secretOrPrivateKey must have a value") — ระบบดูปกติจนกว่าจะมีคนเข้าไม่ได้
//   - คัดลอก .env.example มาทั้งไฟล์: กุญแจคือค่าที่อยู่ใน repo สาธารณะ ใครก็เซ็น token เป็น
//     admin ได้เองโดยไม่ต้องรู้รหัสผ่าน
//
// ล้มตั้งแต่ตอนบูตเหมือนด่านฐานข้อมูลใน index.js ดีกว่าเปิดขึ้นมาแบบพังเงียบหรือเปิดประตูทิ้งไว้

/** ความยาวขั้นต่ำ — HS256 ใช้กุญแจ 256 บิต ข้อความสุ่ม 32 ตัวขึ้นไปจึงไม่เป็นจุดอ่อน */
const MIN_LENGTH = 32;

/** ค่าที่อยู่ใน repository สาธารณะ — apps/api/.env.example */
const PUBLISHED_EXAMPLES = new Set(["your_secret_key_here"]);

/**
 * ปัญหาของกุญแจ หรือ null ถ้าใช้ได้
 *
 * @param {string|undefined} secret
 * @returns {string|null}
 */
function jwtSecretProblem(secret) {
  if (!secret) return "ยังไม่ได้ตั้ง JWT_SECRET";
  if (PUBLISHED_EXAMPLES.has(secret)) return "JWT_SECRET ยังเป็นค่าตัวอย่างจาก .env.example ซึ่งอยู่ใน repository สาธารณะ";
  if (secret.length < MIN_LENGTH) return `JWT_SECRET สั้นเกินไป (${secret.length} ตัวอักษร ต้องอย่างน้อย ${MIN_LENGTH})`;
  return null;
}

module.exports = { jwtSecretProblem, MIN_LENGTH };
