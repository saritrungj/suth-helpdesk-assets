// apps/api/src/master-data/lookup-writes.js
//
// เขียนชื่อหลักและชื่อเรียกอื่นของยี่ห้อ อาคาร ฝ่าย ด้วยกฎชุดเดียว (ADR-0025)
//
// ใช้ทั้งเส้นทางของหน้าข้อมูลอ้างอิง (master-data/routes.js) และตัวนำเข้าทะเบียน
// (import/registry-import.js) — ตัวนำเข้าสร้างอาคารและชื่อเรียกอื่นใน transaction เดียวกับ
// การลงเครื่อง ถ้ากฎอยู่คนละที่ สองทางจะค่อยๆ ยอมรับชื่อชนกันไม่เท่ากัน
//
// ทุกฟังก์ชันรับ `q` ที่มี `query()` — `db` (pool) หรือ `conn` ใน withTransaction

const { conflict, notFound } = require("../shared/http-error");
const { normalizeName, nameKey } = require("./names");

/** ตารางที่มีชื่อเรียกอื่น — ชื่อชั้นและแผนกซ้ำกันได้คนละอาคาร/ฝ่าย จึงยังไม่มี */
const LOOKUPS = {
  brand: { table: "brand", label: "ยี่ห้อ", alias: { table: "brand_alias", column: "brand_id" } },
  building: { table: "building", label: "อาคาร", alias: { table: "building_alias", column: "building_id" } },
  division: { table: "division", label: "ฝ่าย", alias: { table: "division_alias", column: "division_id" } },
};

async function loadAliases(q, kind) {
  const { alias } = LOOKUPS[kind];
  const [rows] = await q.query(`SELECT id, \`${alias.column}\` AS target_id, alias FROM \`${alias.table}\``);
  return rows;
}

async function loadNames(q, kind) {
  const [rows] = await q.query(`SELECT id, name FROM \`${LOOKUPS[kind].table}\``);
  return rows;
}

/**
 * ชื่อหลักห้ามชนชื่อเรียกอื่น — ไม่งั้นชื่อเดียวชี้ได้สองรายการ แล้วตัวนำเข้าต้องเดาเอง
 * เทียบด้วย nameKey (ไม่สนตัวพิมพ์เล็กใหญ่ และรวม "ำ" สองรูป) ซึ่ง UNIQUE ของฐานจับไม่ครบ
 */
async function assertNotAlias(q, kind, name) {
  const clash = (await loadAliases(q, kind)).find((row) => nameKey(row.alias) === nameKey(name));
  if (clash) {
    throw conflict(`ชื่อนี้เป็นชื่อเรียกอื่นของ${LOOKUPS[kind].label}อีกรายการอยู่แล้ว`, {
      code: "name_is_alias",
      detail: `ลบชื่อเรียกอื่น "${clash.alias}" ออกก่อน หรือใช้ชื่ออื่น`,
    });
  }
}

/** สร้างชื่อหลักใหม่ คืน id — ชนชื่อหลักเดิมหรือชื่อเรียกอื่น = 409 */
async function createLookup(q, kind, rawName) {
  const name = normalizeName(rawName);
  const { table, label } = LOOKUPS[kind];
  const same = (await loadNames(q, kind)).find((row) => nameKey(row.name) === nameKey(name));
  if (same) throw conflict(`มี${label} "${same.name}" อยู่แล้ว`, { code: "name_taken" });
  await assertNotAlias(q, kind, name);
  const [result] = await q.query(`INSERT INTO \`${table}\` (name) VALUES (?)`, [name]);
  return result.insertId;
}

/** เพิ่มชื่อเรียกอื่นให้รายการ `targetId` คืน { id, alias } */
async function addAlias(q, kind, targetId, rawAlias) {
  const text = normalizeName(rawAlias);
  const { label, alias } = LOOKUPS[kind];
  const names = await loadNames(q, kind);
  if (!names.some((row) => row.id === targetId)) throw notFound(`ไม่พบ${label}ที่ต้องการ`);

  const sameName = names.find((row) => nameKey(row.name) === nameKey(text));
  if (sameName) {
    throw conflict(`ชื่อนี้เป็นชื่อหลักของ${label}อยู่แล้ว`, {
      code: "alias_is_name",
      detail: `"${sameName.name}" จับคู่ได้อยู่แล้วโดยไม่ต้องเพิ่มชื่อเรียกอื่น`,
    });
  }

  const taken = (await loadAliases(q, kind)).find((row) => nameKey(row.alias) === nameKey(text));
  if (taken) {
    const owner = names.find((row) => row.id === taken.target_id);
    throw conflict("ชื่อเรียกอื่นนี้มีอยู่แล้ว", {
      code: "alias_taken",
      detail: `"${taken.alias}" ชี้ไปที่${label} "${owner?.name ?? taken.target_id}"`,
    });
  }

  // ด่านข้างบนคือตัวกันหลัก UNIQUE ของ alias เป็นแค่ชั้นสำรองของคำขอที่มาพร้อมกัน
  // (collation ของฐานกับ nameKey เทียบไม่เหมือนกันทุกกรณี) — ชนแล้วตอบรหัสเดียวกับด่านข้างบน
  try {
    const [result] = await q.query(
      `INSERT INTO \`${alias.table}\` (\`${alias.column}\`, alias) VALUES (?, ?)`,
      [targetId, text]
    );
    return { id: result.insertId, alias: text };
  } catch (err) {
    if (err.code !== "ER_DUP_ENTRY") throw err;
    throw conflict("ชื่อเรียกอื่นนี้มีอยู่แล้ว", { code: "alias_taken", detail: `"${text}" มีอยู่ในระบบแล้ว` });
  }
}

module.exports = { LOOKUPS, loadAliases, loadNames, assertNotAlias, createLookup, addAlias };
