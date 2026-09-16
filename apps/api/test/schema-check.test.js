// apps/api/test/schema-check.test.js
//
// เทสของด่านที่ตรวจว่าฐานข้อมูลตามโค้ดทัน (src/shared/schema-check.js)
//
// ## ทำไมต้องมี
//
// ด่านนี้เกิดจากเหตุจริง: ฐานพัฒนายังไม่ได้รัน migration_add_device_service_period.sql
// แล้วทั้งระบบตอบ 500 พร้อมข้อความ "เกิดข้อผิดพลาดในระบบ" ซึ่งไม่บอกอะไรเลย
// ทั้งที่แก้ได้ในคำสั่งเดียว
//
// สิ่งที่ต้องกันไม่ให้พังเงียบคือตัว **รายการสิ่งที่ต้องมี** เอง — ถ้าวันหนึ่งมีคน
// พิมพ์ชื่อตารางผิดในรายการนั้น ด่านจะฟ้องว่าฐานไม่ครบทั้งที่ครบ (แล้วระบบไม่ยอม
// เปิดเลย) หรือแย่กว่าคือไม่ฟ้องทั้งที่ขาด เทสชุดนี้จึงผูกรายการเข้ากับ schema.sql
// ซึ่งเป็น source of truth ของฐานใหม่ — สองไฟล์นี้ต้องพูดตรงกันเสมอ
//
// รัน: npm test --workspace @suth/api

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { describeGaps, REQUIREMENTS } = require("../src/shared/schema-check");

const schemaSql = fs.readFileSync(
  path.resolve(__dirname, "../../../database/schema.sql"),
  "utf8"
);

test("ทุกอย่างที่รายการเรียกร้อง มีอยู่จริงใน schema.sql", () => {
  // ฐานใหม่ตั้งจาก schema.sql อย่างเดียวโดยไม่ไล่รัน migration (ดู
  // database/migrations/README.md) ดังนั้นของที่ด่านนี้เรียกหา ต้องมีใน schema.sql
  // ครบทุกชิ้น ไม่งั้นติดตั้งใหม่แล้วเซิร์ฟเวอร์จะไม่ยอมเปิดทั้งที่ฐานถูกต้อง
  for (const need of REQUIREMENTS) {
    if (need.table) {
      assert.match(
        schemaSql,
        new RegExp(`CREATE TABLE(\\s+IF NOT EXISTS)?\\s+${need.table}\\b`, "i"),
        `schema.sql ไม่มีตาราง ${need.table} ที่ schema-check เรียกหา`
      );
    }

    if (need.column) {
      const [table, column] = need.column;
      assert.ok(
        new RegExp(`^\\s*\`?${column}\`?\\s`, "mi").test(schemaSql),
        `schema.sql ไม่มีคอลัมน์ ${table}.${column} ที่ schema-check เรียกหา`
      );
    }

    if (need.index) {
      const [, index] = need.index;
      assert.ok(schemaSql.includes(index), `schema.sql ไม่มี index ${index} ที่ schema-check เรียกหา`);
    }

    if (need.viewMentions) {
      const [view, mention] = need.viewMentions;
      const body = schemaSql.slice(schemaSql.indexOf(`VIEW ${view}`));
      assert.ok(
        body.includes(mention),
        `นิยามของ view ${view} ใน schema.sql ไม่อ้างถึง ${mention} ที่ schema-check เรียกหา`
      );
    }
  }
});

test("ทุก migration ที่รายการอ้างถึง มีไฟล์อยู่จริง", () => {
  // ข้อความที่ด่านนี้พิมพ์ออกมาคือคำสั่งที่คนจะพิมพ์ตาม — ชื่อไฟล์ที่ไม่มีอยู่จริง
  // ทำให้คนที่ยืนอยู่หน้าเครื่อง server ตอนระบบไม่ยอมเปิด ไปต่อไม่ได้เลย
  const dir = path.resolve(__dirname, "../../../database/migrations");

  for (const need of REQUIREMENTS) {
    assert.ok(
      fs.existsSync(path.join(dir, need.migration)),
      `รายการอ้างถึง ${need.migration} แต่ไม่มีไฟล์นั้นใน database/migrations/`
    );
  }
});

test("ข้อความที่ฟ้อง บอกทั้งสิ่งที่ขาดและไฟล์ที่ต้องรัน", () => {
  const message = describeGaps([
    { what: "ไม่มีตาราง device_service_period", migration: "migration_add_device_service_period.sql" },
    { what: "ไม่มีคอลัมน์ devices.installation_status", migration: "migration_add_device_service_period.sql" },
    { what: "ไม่มีตาราง device_contract_history", migration: "migration_add_effective_pricing.sql" },
  ]);

  assert.match(message, /device_service_period/);
  assert.match(message, /devices\.installation_status/);
  assert.match(message, /migration_add_effective_pricing\.sql/);

  // ชื่อ migration เดียวกันต้องยุบเป็นหัวข้อเดียว ไม่ใช่ซ้ำสองครั้ง — คนอ่านต้อง
  // เห็นว่า "รันไฟล์นี้หนึ่งครั้ง" ไม่ใช่ "รันสองครั้ง"
  const occurrences = message.split("migration_add_device_service_period.sql").length - 1;
  assert.equal(occurrences, 1);

  // ต้องเตือนเรื่อง utf8mb4 เสมอ — ลืมตัวเลือกนี้แล้วภาษาไทยในฐานเพี้ยนถาวร
  // และไม่มีอะไรฟ้องจนกว่าจะมีคนเปิดรายงานมาอ่าน
  assert.match(message, /utf8mb4/);
  assert.match(message, /mysqldump/);
});
