// apps/api/src/auth/revoked-sessions.js
//
// token ที่ผู้ใช้ออกจากระบบไปแล้ว — ด่าน require-auth ปฏิเสธจนกว่าจะหมดอายุเอง (#240, ADR-0038)
//
// เดิม logout ลบ cookie ฝั่งเบราว์เซอร์อย่างเดียว token ที่ถูกคัดลอกไว้ก่อน (เครื่องที่ใช้ร่วมกัน ส่วนขยาย
// ของเบราว์เซอร์ log ของ proxy) ยังผ่านด่านได้จนครบ 8 ชั่วโมง
//
// เก็บในหน่วยความจำของโปรเซส ไม่ใช่ในฐาน:
//   - ระบบมี API โปรเซสเดียว (ADR-0028) รายการจึงเห็นตรงกันทุกคำขอ
//   - ไม่ต้องเปลี่ยน schema และไม่เพิ่มคำสั่งฐานข้อมูลต่อคำขอ
//   - รายการมีอายุเท่าอายุ token ที่เหลือ (ไม่เกิน 8 ชั่วโมง) จึงไม่โตไม่จำกัด
// ข้อแลก: API เริ่มใหม่แล้วรายการหาย token ที่ออกจากระบบไปแล้วแต่ยังไม่หมดอายุกลับมาใช้ได้ ถ้ารัน API
// หลายโปรเซส หรือต้องการให้ทนต่อการเริ่มใหม่ ต้องย้ายไปเก็บในฐาน — ดู ADR-0038
//
// เก็บค่าแฮชของ token ไม่ใช่ตัว token: ถ้าหน่วยความจำหรือ log หลุด ต้องไม่มี token ที่ยังใช้ได้อยู่ในนั้น

const crypto = require("crypto");

/** แฮชของ token → เวลาหมดอายุ (ms) */
const revoked = new Map();

const keyOf = (token) => crypto.createHash("sha256").update(String(token)).digest("base64url");

/** ทิ้งรายการที่ token หมดอายุไปแล้ว — jwt.verify ปฏิเสธ token พวกนั้นเองอยู่แล้ว */
function sweep(now) {
  for (const [key, expiresAt] of revoked) {
    if (expiresAt <= now) revoked.delete(key);
  }
}

/**
 * @param {string} token token ที่ตรวจลายเซ็นแล้ว
 * @param {number} expSeconds ค่า `exp` ของ token (วินาทีตั้งแต่ epoch)
 * @param {number} [now] เวลาอ้างอิงเป็น ms (ใส่ได้เพื่อทดสอบ)
 */
function revoke(token, expSeconds, now = Date.now()) {
  sweep(now);
  const expiresAt = Number(expSeconds) * 1000;
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return;
  revoked.set(keyOf(token), expiresAt);
}

/** @returns {boolean} token นี้ถูกเพิกถอนและยังไม่หมดอายุ */
function isRevoked(token, now = Date.now()) {
  const expiresAt = revoked.get(keyOf(token));
  return expiresAt !== undefined && expiresAt > now;
}

/** ใช้ในเทสเท่านั้น */
function clear() {
  revoked.clear();
}

/** ใช้ในเทสเท่านั้น — สิ่งที่เก็บอยู่จริง */
function snapshot() {
  return [...revoked.entries()];
}

module.exports = { revoke, isRevoked, clear, snapshot };
