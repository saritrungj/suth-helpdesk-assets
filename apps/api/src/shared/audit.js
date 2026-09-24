// apps/api/src/shared/audit.js
//
// บันทึกการตรวจย้อนหลัง — ใครแก้อะไร เมื่อไร จากค่าอะไรเป็นค่าอะไร (audit 2026-09-24 F05, ADR-0035)
//
// ยอดพิมพ์คือฐานของทุกบาท เดิมตอบไม่ได้ว่าใครแก้ยอดเดือนไหน เครื่องถูกย้ายโดยใคร หรือใครเปลี่ยนราคาสัญญา
// มีเฉพาะงานนำเข้าที่มีประวัติของตัวเอง (import_session_event)
//
// ## กติกา
//
// - เขียนผ่าน connection เดียวกับการแก้ข้อมูลเมื่อมี transaction — แก้สำเร็จ = มีบันทึก, ย้อน = ไม่มีบันทึก
// - เก็บเฉพาะช่องที่เปลี่ยน (diff) ไม่เก็บทั้งแถว — อ่านง่ายและไม่บวม
// - **ห้ามเก็บรหัสผ่านหรือ hash** — เส้นทางผู้ใช้บันทึกแค่ว่า "เปลี่ยนรหัสผ่าน"
// - ชื่อผู้ใช้เก็บเป็นสำเนา ลบบัญชีทีหลังแล้วบันทึกยังบอกได้ว่าใครทำ (user_id กลายเป็น NULL)

/** ชนิดของสิ่งที่ถูกแก้ — ชื่อคงที่ใช้กรองในหน้าประวัติ (หน้าเว็บแปลเป็นภาษาคน) */
const ENTITIES = [
  "print_reading", "device", "contract", "fiscal_year", "brand", "building", "floor", "division", "department",
  "alias", "user", "import_session", "service_period",
];

/** ผู้กระทำจากคำขอ — require-auth แนบ req.user จากบัญชีปัจจุบันในฐานแล้ว (#208) */
function actorOf(req) {
  return { userId: req.user?.id ?? null, username: req.user?.username ?? null, requestId: req.id ?? null };
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * ช่องที่ต่างกันระหว่างก่อน/หลัง — คืน null ถ้าไม่มีอะไรเปลี่ยน
 * @param {object|null} before
 * @param {object|null} after
 * @param {string[]} [fields] เฉพาะช่องเหล่านี้ (ไม่ระบุ = ทุกช่องที่มีในสองฝั่ง)
 */
function changedFields(before, after, fields) {
  const keys = fields ?? [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  const changed = keys.filter((key) => !same(before?.[key], after?.[key]));
  if (!changed.length) return null;
  return {
    before: Object.fromEntries(changed.map((key) => [key, before?.[key] ?? null])),
    after: Object.fromEntries(changed.map((key) => [key, after?.[key] ?? null])),
  };
}

/**
 * @param {{ query: Function }} q connection ของ transaction หรือ pool
 * @param {{ userId: number|null, username: string|null, requestId: string|null }} actor
 * @param {Array<{ action: "create"|"update"|"delete", entity: string, entityId?: number|null, entityKey?: string|null,
 *   summary: string, before?: object|null, after?: object|null }>} entries
 */
async function recordAudit(q, actor, entries) {
  const rows = entries.filter(Boolean);
  if (!rows.length) return;
  for (const entry of rows) {
    if (!ENTITIES.includes(entry.entity)) throw new Error(`audit: ไม่รู้จักชนิด ${entry.entity}`);
  }
  // แบ่งก้อนละ 500 แถว — การบันทึกยอดทั้งเดือนส่งได้ถึง 2000 รายการ
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    await q.query(
      `INSERT INTO audit_log
         (user_id, username, action, entity, entity_id, entity_key, summary, before_value, after_value, request_id)
       VALUES ?`,
      [chunk.map((entry) => [
        actor.userId,
        actor.username,
        entry.action,
        entry.entity,
        entry.entityId ?? null,
        entry.entityKey ?? null,
        String(entry.summary).slice(0, 255),
        entry.before == null ? null : JSON.stringify(entry.before),
        entry.after == null ? null : JSON.stringify(entry.after),
        actor.requestId,
      ])]
    );
  }
}

module.exports = { ENTITIES, actorOf, changedFields, recordAudit };
