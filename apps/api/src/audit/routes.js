// apps/api/src/audit/routes.js
//
// GET /api/audit-log — ประวัติการแก้ไขทั้งระบบ (ADR-0035) ผู้ดูแลเท่านั้น
//
//   ?entity=device&entity_id=12   ประวัติของสิ่งเดียว
//   ?device_id=12                 ทุกอย่างของเครื่องหนึ่ง: ตัวเครื่อง + ยอดพิมพ์ของเครื่องนั้น
//   ?user_id= ?q= ?from=YYYY-MM-DD ?to=YYYY-MM-DD (วันตามเวลาไทย) ?page= ?per_page=
//
// เวลาอ่านผ่าน UNIX_TIMESTAMP — ไม่ขึ้นกับ time zone ของฐาน (ฐานบน Docker รันเวลา UTC)

const express = require("express");
const { z } = require("zod");
const router = express.Router();

const db = require("../shared/db");
const asyncHandler = require("../shared/async-handler");
const requireAuth = require("../auth/require-auth");
const requireAdmin = require("../auth/require-admin");
const { validate } = require("../shared/validate");
const cache = require("../shared/cache");
const { ENTITIES } = require("../shared/audit");

router.use(requireAuth, requireAdmin);

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "วันที่ต้องเป็นรูปแบบ YYYY-MM-DD");
const optionalId = z.coerce.number().int().positive().optional();

const listQuery = z.object({
  entity: z.enum(ENTITIES).optional(),
  entity_id: optionalId,
  device_id: optionalId,
  user_id: optionalId,
  q: z.string().trim().max(100).optional(),
  from: dateString.optional(),
  to: dateString.optional(),
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(200).default(50),
});

/** วันตามเวลาไทย → epoch วินาทีของต้นวัน */
const bangkokDayStart = (date) => Math.floor(Date.parse(`${date}T00:00:00+07:00`) / 1000);

router.get(
  "/",
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const { entity, entity_id, device_id, user_id, q, from, to, page, per_page } = req.query;
    const where = [];
    const params = [];
    if (device_id) {
      where.push("a.entity IN ('device', 'print_reading') AND a.entity_id = ?");
      params.push(device_id);
    } else {
      if (entity) { where.push("a.entity = ?"); params.push(entity); }
      if (entity_id) { where.push("a.entity_id = ?"); params.push(entity_id); }
    }
    if (user_id) { where.push("a.user_id = ?"); params.push(user_id); }
    if (q) {
      where.push("(a.summary LIKE ? OR a.entity_key LIKE ? OR a.username LIKE ?)");
      const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      params.push(like, like, like);
    }
    if (from) { where.push("a.occurred_at >= FROM_UNIXTIME(?)"); params.push(bangkokDayStart(from)); }
    if (to) { where.push("a.occurred_at < FROM_UNIXTIME(?)"); params.push(bangkokDayStart(to) + 86400); }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM audit_log a ${clause}`, params);
    const [rows] = await db.query(
      `SELECT a.id, UNIX_TIMESTAMP(a.occurred_at) AS occurred_epoch, a.user_id, a.username, a.action, a.entity,
              a.entity_id, a.entity_key, a.summary, a.before_value, a.after_value, a.request_id
       FROM audit_log a ${clause}
       ORDER BY a.occurred_at DESC, a.id DESC
       LIMIT ? OFFSET ?`,
      [...params, per_page, (page - 1) * per_page]
    );

    const parse = (value) => (value == null ? null : typeof value === "string" ? JSON.parse(value) : value);
    cache.noStore(res);
    res.set("X-Total-Count", String(total));
    res.json({
      total: Number(total),
      page,
      per_page,
      rows: rows.map(({ occurred_epoch, before_value, after_value, ...row }) => ({
        ...row,
        occurred_at: new Date(Number(occurred_epoch) * 1000).toISOString(),
        before: parse(before_value),
        after: parse(after_value),
      })),
    });
  })
);

module.exports = router;
