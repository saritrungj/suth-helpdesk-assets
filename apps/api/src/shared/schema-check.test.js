// apps/api/src/shared/schema-check.test.js
//
// ข้อความตอนบูตต้องพาคนไปแก้ถูกที่ — บัญชีที่ไม่มีสิทธิ์ SHOW VIEW ทำให้ information_schema
// คืนนิยาม view ว่างเปล่า ซึ่งเดิมถูกรายงานว่า "ต้องรัน migration ซ้ำ" ทั้งที่ฐานครบแล้ว

const test = require("node:test");
const assert = require("node:assert/strict");

const db = require("./db");
const { findSchemaGaps, describeGaps, REQUIREMENTS } = require("./schema-check");

/** ฐานจำลองที่มีทุกอย่างครบตาม REQUIREMENTS โดยนิยาม view เป็นค่าที่ส่งเข้ามา */
async function gapsWith(viewDefinition) {
  const tables = new Set();
  const columns = [];
  const indexes = [];
  const views = new Map();
  for (const need of REQUIREMENTS) {
    if (need.table) tables.add(need.table);
    if (need.column) columns.push({ TABLE_NAME: need.column[0], COLUMN_NAME: need.column[1] });
    if (need.index) indexes.push({ TABLE_NAME: need.index[0], INDEX_NAME: need.index[1] });
    if (need.viewMentions) {
      const [view, mention] = need.viewMentions;
      views.set(view, `${views.get(view) ?? ""} ${mention}`);
    }
  }

  const original = db.query;
  db.query = async (sql) => {
    if (sql.includes("information_schema.TABLES")) return [[...tables].map((TABLE_NAME) => ({ TABLE_NAME }))];
    if (sql.includes("information_schema.COLUMNS")) return [columns];
    if (sql.includes("information_schema.STATISTICS")) return [indexes];
    return [[...views].map(([TABLE_NAME, body]) => ({ TABLE_NAME, VIEW_DEFINITION: viewDefinition(body) }))];
  };
  try {
    return await findSchemaGaps();
  } finally {
    db.query = original;
  }
}

test("ฐานที่ครบทุกอย่าง = ไม่มีช่องว่าง", async () => {
  assert.deepEqual(await gapsWith((body) => body), []);
});

test("นิยาม view ว่างเปล่า = เรื่องสิทธิ์ ไม่ใช่ migration ที่ค้าง", async () => {
  const gaps = await gapsWith(() => "");
  assert.ok(gaps.length > 0);
  assert.ok(gaps.every((gap) => gap.migration === null), JSON.stringify(gaps));
  // view หนึ่งตัวถูกตรวจหลายบรรทัด แต่รายงานเรื่องสิทธิ์ครั้งเดียวต่อ view
  assert.equal(new Set(gaps.map((gap) => gap.what)).size, gaps.length);

  const message = describeGaps(gaps);
  assert.match(message, /SHOW VIEW/);
  assert.doesNotMatch(message, /รัน migration/);
});

test("นิยาม view เก่าจริง = ยังบอกให้รัน migration เหมือนเดิม", async () => {
  const gaps = await gapsWith(() => "select 1");
  assert.ok(gaps.every((gap) => gap.migration !== null));
  assert.match(describeGaps(gaps), /รัน migration/);
});
