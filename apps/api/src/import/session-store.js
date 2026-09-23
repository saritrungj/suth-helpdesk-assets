// apps/api/src/import/session-store.js
//
// แถวของ import session และประวัติ (ADR-0027) — ส่วนที่แตะฐานข้อมูลอย่างเดียว ไม่มีตรรกะการนำเข้า
//
// ## ทำไมการเปลี่ยนสถานะเป็น UPDATE แบบมีเงื่อนไข
//
// สองแท็บกดบันทึกพร้อมกัน หรือกดตรวจระหว่างที่อีกคนกำลังบันทึก — UPDATE ... WHERE status IN (...) ให้คำตอบ
// ว่าใครได้ไปต่อในคำสั่งเดียว คนที่แพ้ได้ 409 ไม่ใช่ทั้งสองคนเขียนซ้อนกัน

const fs = require("fs");
const path = require("path");
const db = require("../shared/db");
const { conflict, notFound } = require("../shared/http-error");

/** ไม่มีการเคลื่อนไหวนานเท่านี้ → expired (ADR-0027) */
const EXPIRE_AFTER_DAYS = 14;
/** สถานะชั่วคราวที่ค้างนานเกินนี้ = API ตายกลางทาง → failed */
const STUCK_AFTER_MINUTES = 15;

const OPEN = ["draft", "validating", "ready", "processing", "failed"];

function sessionDir() {
  return path.resolve(process.env.IMPORT_SESSION_DIR || path.join("uploads", "import-sessions"));
}

function absoluteFilePath(session) {
  return path.join(sessionDir(), session.file_path);
}

const parseJson = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value; // mysql2 แปลง JSON ให้แล้ว
  try { return JSON.parse(value); } catch { return null; }
};
const toJson = (value) => (value === undefined || value === null ? null : JSON.stringify(value));

function rowToSession(row) {
  return {
    ...row,
    decisions: parseJson(row.decisions) ?? {},
    validation: parseJson(row.validation),
    result: parseJson(row.result),
    error: parseJson(row.error),
  };
}

const SELECT_SESSION = `
  SELECT s.*, owner.username AS owner_username, last_user.username AS last_activity_username
  FROM import_session s
  JOIN users owner ON owner.id = s.created_by
  LEFT JOIN users last_user ON last_user.id = s.last_activity_by`;

async function addEvent(q, sessionId, event, actorId, detail = null) {
  await q.query(
    "INSERT INTO import_session_event (session_id, event, actor_id, detail) VALUES (?, ?, ?, ?)",
    [sessionId, event, actorId ?? null, toJson(detail)]
  );
}

/**
 * รับไฟล์ที่ multer เก็บไว้ชั่วคราว เข้าเป็น session ใหม่ แล้วย้ายไฟล์ไปที่เก็บถาวร
 * @param {{ path: string, originalname: string, size: number }} file
 */
async function createSession(file, sha256, actorId) {
  const dir = sessionDir();
  fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 6);

  return db.withTransaction(async (conn) => {
    const [result] = await conn.query(
      `INSERT INTO import_session (status, file_name, file_size, file_sha256, file_path, created_by, last_activity_by)
       VALUES ('draft', ?, ?, ?, '', ?, ?)`,
      [file.originalname.slice(0, 255), file.size, sha256, actorId, actorId]
    );
    const id = result.insertId;
    const name = `${id}-${sha256.slice(0, 12)}${ext}`;
    const target = path.join(dir, name);
    try {
      fs.renameSync(file.path, target);
    } catch {
      // uploads/ กับที่เก็บ session อยู่คนละ volume ได้ — rename ข้ามไม่ได้ ให้คัดลอกแทน
      fs.copyFileSync(file.path, target);
    }
    await conn.query("UPDATE import_session SET file_path = ? WHERE id = ?", [name, id]);
    await addEvent(conn, id, "uploaded", actorId, { file_name: file.originalname, file_size: file.size, file_sha256: sha256 });
    return id;
  });
}

async function getSession(id) {
  const [[row]] = await db.query(`${SELECT_SESSION} WHERE s.id = ?`, [id]);
  if (!row) throw notFound("ไม่พบงานนำเข้านี้");
  return rowToSession(row);
}

async function listSessions({ includeClosed = false } = {}) {
  const [rows] = await db.query(
    `${SELECT_SESSION}
     ${includeClosed ? "" : `WHERE s.status IN (${OPEN.map(() => "?").join(", ")})`}
     ORDER BY s.last_activity_at DESC, s.id DESC
     LIMIT 200`,
    includeClosed ? [] : OPEN
  );
  return rows.map(rowToSession);
}

/** session อื่นที่เป็นไฟล์เดียวกัน — ยังเปิดอยู่ หรือเคยบันทึกแล้ว */
async function sameFileSessions(id, sha256) {
  const [rows] = await db.query(
    `${SELECT_SESSION}
     WHERE s.file_sha256 = ? AND s.id <> ? AND s.status <> 'expired'
     ORDER BY s.id DESC LIMIT 10`,
    [sha256, id]
  );
  return rows.map(rowToSession);
}

async function listEvents(sessionId, limit = 500) {
  const [rows] = await db.query(
    `SELECT e.id, e.event, e.detail, e.created_at, e.actor_id, u.username AS actor_username
     FROM import_session_event e
     LEFT JOIN users u ON u.id = e.actor_id
     WHERE e.session_id = ?
     ORDER BY e.id DESC
     LIMIT ?`,
    [sessionId, limit]
  );
  return rows.map((row) => ({ ...row, detail: parseJson(row.detail) }));
}

/**
 * เปลี่ยนสถานะเมื่อสถานะปัจจุบันอยู่ใน from เท่านั้น — คนที่แพ้การแข่งได้ 409
 * @returns {Promise<void>}
 */
async function transition(q, id, from, to, actorId, message) {
  const [result] = await q.query(
    `UPDATE import_session
     SET status = ?, status_changed_at = CURRENT_TIMESTAMP, last_activity_at = CURRENT_TIMESTAMP, last_activity_by = ?
     WHERE id = ? AND status IN (${from.map(() => "?").join(", ")})`,
    [to, actorId, id, ...from]
  );
  if (!result.affectedRows) {
    throw conflict(message ?? "งานนำเข้านี้อยู่ในสถานะที่ทำรายการนี้ไม่ได้แล้ว — รีเฟรชแล้วดูสถานะล่าสุด", {
      code: "import_session_state",
    });
  }
}

/** บันทึกผลของขั้นที่เพิ่งจบ — fields เป็นชื่อคอลัมน์จากโค้ด ไม่ใช่จากผู้ใช้ */
async function saveOutcome(q, id, actorId, fields) {
  const columns = Object.keys(fields);
  const json = new Set(["decisions", "validation", "result", "error"]);
  const values = columns.map((column) => (json.has(column) ? toJson(fields[column]) : fields[column]));
  const statusChange = columns.includes("status") ? ", status_changed_at = CURRENT_TIMESTAMP" : "";
  await q.query(
    `UPDATE import_session
     SET ${columns.map((column) => `\`${column}\` = ?`).join(", ")}${statusChange},
         last_activity_at = CURRENT_TIMESTAMP, last_activity_by = ?
     WHERE id = ?`,
    [...values, actorId, id]
  );
}

/**
 * เก็บกวาดก่อนอ่านรายการ (ไม่มีงานเบื้องหลัง — ADR-0027)
 *   - draft/ready/failed ที่ไม่มีการเคลื่อนไหว 14 วัน → expired
 *   - validating/processing ที่ค้างเกิน 15 นาที → failed (API ตายกลางทาง ไม่มีอะไรถูกบันทึก เพราะอยู่ใน transaction)
 */
async function sweep() {
  await db.withTransaction(async (conn) => {
    const [stale] = await conn.query(
      `SELECT id FROM import_session
       WHERE status IN ('draft', 'ready', 'failed') AND last_activity_at < NOW() - INTERVAL ? DAY
       FOR UPDATE`,
      [EXPIRE_AFTER_DAYS]
    );
    for (const { id } of stale) {
      await conn.query(
        "UPDATE import_session SET status = 'expired', status_changed_at = CURRENT_TIMESTAMP WHERE id = ?",
        [id]
      );
      await addEvent(conn, id, "expired", null, { reason: "inactive", days: EXPIRE_AFTER_DAYS });
    }

    const [stuck] = await conn.query(
      `SELECT id, status FROM import_session
       WHERE status IN ('validating', 'processing') AND status_changed_at < NOW() - INTERVAL ? MINUTE
       FOR UPDATE`,
      [STUCK_AFTER_MINUTES]
    );
    for (const { id, status } of stuck) {
      const error = { code: "interrupted", message: `ค้างที่ขั้น ${status} เกิน ${STUCK_AFTER_MINUTES} นาที — ไม่มีข้อมูลใดถูกบันทึก ตรวจใหม่แล้วบันทึกอีกครั้ง` };
      await conn.query(
        "UPDATE import_session SET status = 'failed', error = ?, status_changed_at = CURRENT_TIMESTAMP WHERE id = ?",
        [toJson(error), id]
      );
      await addEvent(conn, id, "failed", null, error);
    }
  });
}

module.exports = {
  EXPIRE_AFTER_DAYS,
  OPEN,
  sessionDir,
  absoluteFilePath,
  addEvent,
  createSession,
  getSession,
  listSessions,
  sameFileSessions,
  listEvents,
  transition,
  saveOutcome,
  sweep,
};
