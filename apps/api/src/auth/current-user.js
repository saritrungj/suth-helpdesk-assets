// apps/api/src/auth/current-user.js
//
// สิทธิ์ของคำขอมาจากบัญชีปัจจุบันในฐาน ไม่ใช่จาก token อย่างเดียว (#208)
//
// token อายุ 8 ชั่วโมงเก็บบทบาท ณ ตอนล็อกอิน เดิม middleware เชื่อบทบาทนั้นตรงๆ ผู้ใช้ที่ถูกลดสิทธิ์หรือถูกลบบัญชี
// จึงยังทำงานด้วยสิทธิ์เดิมต่อได้จนกว่า token จะหมดอายุ ตอนนี้ทุกคำขออ่านแถวผู้ใช้หนึ่งแถว (PK) แล้ว
//
//   - บัญชีถูกลบ → 401
//   - บทบาทที่ใช้ = บทบาทที่ต่ำกว่าระหว่าง token กับฐาน — ลดสิทธิ์มีผลทันที เพิ่มสิทธิ์มีผลเมื่อล็อกอินใหม่
//   - token จากการล็อกอินมีลายนิ้วมือของรหัสผ่าน (pwv) เปลี่ยนรหัสผ่านแล้ว token เดิมใช้ไม่ได้
//
// token ที่ไม่มี pwv (ออกก่อนการเปลี่ยนนี้ หรือออกเองด้วย JWT_SECRET ในเทส) ยังผ่านได้แต่โดนสองข้อแรกเหมือนกัน —
// คนที่มี JWT_SECRET ออก token อะไรก็ได้อยู่แล้ว การบังคับ pwv จึงไม่ได้กันใครเพิ่ม

const crypto = require("crypto");
const db = require("../shared/db");

const RANK = { viewer: 0, staff: 1, admin: 2 };

/** ลายนิ้วมือสั้นของ hash รหัสผ่าน — ใส่ใน token ได้โดยไม่เปิดเผย hash */
function passwordVersion(hash) {
  return crypto.createHash("sha256").update(String(hash)).digest("base64url").slice(0, 16);
}

/** แถวผู้ใช้ปัจจุบัน — เทสระดับหน่วยแทนด้วย setUserSource() แทนการต่อฐานจริง */
let findUser = async (id) => {
  const [rows] = await db.query("SELECT id, username, role, password FROM users WHERE id = ?", [id]);
  return rows?.[0] ?? null;
};

/** ใช้ในเทสเท่านั้น — ไม่มีเส้นทางใดจากภายนอกเรียกถึง */
function setUserSource(fn) {
  findUser = fn;
}

/**
 * @param {{ id: number, role: string, pwv?: string }} claims สิ่งที่ token บอก (ตรวจลายเซ็นแล้ว)
 * @returns {Promise<{ id: number, username: string, role: string } | { revoked: "account_removed"|"password_changed" }>}
 */
async function currentUser(claims) {
  const row = await findUser(claims.id);
  if (!row) return { revoked: "account_removed" };
  if (claims.pwv && claims.pwv !== passwordVersion(row.password)) return { revoked: "password_changed" };
  const tokenRank = RANK[claims.role] ?? RANK.viewer;
  const dbRank = RANK[row.role] ?? RANK.viewer;
  const role = tokenRank <= dbRank ? claims.role : row.role;
  return { id: row.id, username: row.username, role };
}

module.exports = { currentUser, passwordVersion, setUserSource, RANK };
