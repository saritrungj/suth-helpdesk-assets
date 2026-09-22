// apps/api/src/shared/schema-check.js
//
// ตรวจว่าฐานข้อมูลที่ต่ออยู่มีโครงสร้างที่โค้ดรุ่นนี้ต้องใช้จริงหรือยัง
//
// ## ปัญหาที่ไฟล์นี้มีไว้แก้
//
// โค้ดกับฐานข้อมูลของระบบนี้เดินคนละจังหวะกัน — โค้ดอัปเดตด้วย `git pull` ส่วน
// ฐานข้อมูลอัปเดตด้วยคนที่ต้องจำไปรัน migration เอง เมื่อสองอย่างนี้ไม่ตรงกัน
// ของเดิมไม่มีอะไรฟ้องเลย เพราะ verifyConnection() ตรวจแค่ว่า "ต่อติดไหม" ซึ่ง
// ต่อติดเสมอ เซิร์ฟเวอร์จึงเปิดขึ้นมาเหมือนปกติทุกอย่าง แล้วผู้ใช้เป็นคนไปเจอเอง
// ทีละหน้าในรูปของ:
//
//     เกิดข้อผิดพลาดในระบบ
//     ERROR GET /api/print-transactions/coverage status=500
//
// ซึ่งบอกเจ้าหน้าที่ไม่ได้สักอย่างว่าเกิดอะไรขึ้นและต้องทำอะไรต่อ ทั้งที่สาเหตุจริง
// สั้นมากและแก้ได้ในคำสั่งเดียว — "ยังไม่ได้รัน migration_add_device_service_period.sql"
//
// ## ทำไมไม่เปิดเซิร์ฟเวอร์เลยเมื่อโครงสร้างไม่ครบ
//
// ตามเหตุผลเดียวกับ verifyConnection() ใน index.js — ระบบที่เปิดขึ้นมาแล้วพัง
// ทุกคำขอ แย่กว่าระบบที่ไม่ยอมเปิดพร้อมบอกสาเหตุ อย่างแรกดูเหมือนทำงานอยู่ในสายตา
// ของระบบ service และของคนที่เพิ่ง deploy เสร็จ กว่าจะรู้ว่าพังคือตอนที่ผู้ใช้โทรมา
//
// ## ทำไมไม่ใช้ตารางเก็บเลขเวอร์ชัน (schema_migrations) แบบที่เครื่องมือ migration ทำกัน
//
// ตารางแบบนั้นบันทึกว่า "มีคนรันไฟล์นี้ไปแล้ว" ซึ่งไม่เท่ากับ "ฐานข้อมูลมีของที่
// ไฟล์นั้นควรสร้าง" — รันแล้วล้มกลางทาง รันกับฐานผิดตัว หรือมีคนลบตารางทิ้งทีหลัง
// ล้วนทำให้สองอย่างนี้ไม่ตรงกัน ไฟล์นี้จึงถามฐานข้อมูลตรงๆ ว่าของอยู่ครบไหม
// คำตอบที่ได้จึงเป็นความจริงเสมอไม่ว่าจะมาถึงสถานะนี้ด้วยเส้นทางไหน
//
// ## เพิ่มรายการใหม่เมื่อไร
//
// ทุกครั้งที่เพิ่ม migration ที่โค้ด**อ่านหรือเขียนของที่มันสร้าง** ให้เพิ่มบรรทัด
// ที่นี่ด้วย ถ้าไม่เพิ่ม ฐานที่ตามไม่ทันจะกลับไปพังเป็น 500 เหมือนเดิม

const db = require("./db");

/**
 * สิ่งที่โค้ดรุ่นนี้ต้องใช้ กับ migration ที่เป็นคนสร้างมัน
 *
 * เรียงตามลำดับการรัน เพื่อให้ข้อความที่ฟ้องออกมาเรียงตามลำดับที่ต้องรันจริง
 * โดยที่คนอ่านไม่ต้องไปเปิดตารางลำดับใน run-migrations.md เทียบเอง
 *
 * @type {Array<{ migration: string, table?: string, column?: [string, string],
 *                index?: [string, string], viewMentions?: [string, string] }>}
 */
const REQUIREMENTS = [
  // uq_device_month ของ migration_unique_print_transactions.sql ถูกแทนด้วย uq_meter_month
  // ใน migration_billing_lines_and_meters.sql จึงตรวจคีย์ใหม่แทน (ท้ายรายการ)
  { migration: "migration_add_fiscal_year_range.sql", column: ["fiscal_year", "start_month"] },
  { migration: "migration_add_fiscal_year_range.sql", column: ["fiscal_year", "end_month"] },
  { migration: "migration_add_device_location.sql", column: ["devices", "location"] },
  { migration: "migration_add_device_location_history.sql", table: "device_location_history" },

  { migration: "migration_add_device_service_period.sql", column: ["devices", "installation_status"] },
  { migration: "migration_add_device_service_period.sql", column: ["devices", "service_unverified_before"] },
  { migration: "migration_add_device_service_period.sql", table: "device_service_period" },

  { migration: "migration_add_effective_pricing.sql", column: ["contracts", "effective_from"] },
  { migration: "migration_add_effective_pricing.sql", column: ["contracts", "effective_to"] },
  { migration: "migration_add_effective_pricing.sql", table: "device_contract_history" },

  // view ที่ยังไม่ถูกเขียนทับเป็นกรณีที่อันตรายกว่าตารางที่หายไป เพราะมันไม่พัง —
  // มันตอบตัวเลขที่คิดจากราคาปัจจุบันแทนราคาที่มีผลในเดือนนั้น แล้วรายงานทุกหน้า
  // ก็แสดงเงินผิดอย่างเงียบสนิท เกิดได้จริงเมื่อ migration ล้มกลางไฟล์ (ตาราง
  // สร้างเสร็จแล้วแต่ CREATE OR REPLACE VIEW ยังไม่ทำงาน)
  { migration: "migration_add_effective_pricing.sql", viewMentions: ["v_monthly_kpi", "device_contract_history"] },

  // ADR-0021/0022/0023 — รายการราคา มิเตอร์ อายุสัญญา ค่าเช่า/VAT
  { migration: "migration_billing_lines_and_meters.sql", table: "meter_category" },
  { migration: "migration_billing_lines_and_meters.sql", table: "contract_price_line" },
  { migration: "migration_billing_lines_and_meters.sql", table: "device_meter" },
  { migration: "migration_billing_lines_and_meters.sql", column: ["print_transactions", "meter_id"] },
  { migration: "migration_billing_lines_and_meters.sql", column: ["print_transactions", "meter_start"] },
  { migration: "migration_billing_lines_and_meters.sql", column: ["contracts", "monthly_rental"] },
  { migration: "migration_billing_lines_and_meters.sql", index: ["print_transactions", "uq_meter_month"] },
  // view ที่ยังคิดราคาเดียวต่อสัญญาและปัดทีละแถว ให้ตัวเลขผิดโดยไม่พัง จึงต้องตรวจเนื้อ view
  { migration: "migration_billing_lines_and_meters.sql", viewMentions: ["v_monthly_kpi", "contract_price_line"] },
  { migration: "migration_billing_lines_and_meters.sql", viewMentions: ["v_contract_invoice", "monthly_rental"] },

  // ADR-0025 — ชื่อเรียกอื่นของข้อมูลหลัก
  { migration: "migration_add_master_aliases.sql", table: "brand_alias" },
  { migration: "migration_add_master_aliases.sql", table: "building_alias" },
  { migration: "migration_add_master_aliases.sql", table: "division_alias" },
];

/**
 * ถามฐานข้อมูลครั้งเดียวว่ามีอะไรอยู่บ้าง แล้วเทียบกับรายการข้างบน
 *
 * ใช้ DATABASE() แทนการอ่านชื่อฐานจาก environment เพราะคำตอบที่ต้องการคือ
 * "ฐานที่ pool นี้ต่ออยู่จริง" ไม่ใช่ "ฐานที่ไฟล์ตั้งค่าบอกว่าน่าจะเป็น" — ถ้าสองอย่างนี้
 * ไม่ตรงกัน การตรวจสอบฐานผิดตัวแล้วบอกว่าผ่านคือผลลัพธ์ที่แย่ที่สุดที่เป็นไปได้
 *
 * @returns {Promise<Array<{ what: string, migration: string }>>} ว่าง = ครบแล้ว
 */
async function findSchemaGaps() {
  const [[tables], [columns], [indexes], [views]] = await Promise.all([
    db.query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()"),
    db.query("SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()"),
    db.query("SELECT TABLE_NAME, INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()"),
    db.query("SELECT TABLE_NAME, VIEW_DEFINITION FROM information_schema.VIEWS WHERE TABLE_SCHEMA = DATABASE()"),
  ]);

  const hasTable = new Set(tables.map((row) => row.TABLE_NAME.toLowerCase()));
  const hasColumn = new Set(columns.map((row) => `${row.TABLE_NAME}.${row.COLUMN_NAME}`.toLowerCase()));
  const hasIndex = new Set(indexes.map((row) => `${row.TABLE_NAME}.${row.INDEX_NAME}`.toLowerCase()));
  const viewBody = new Map(views.map((row) => [row.TABLE_NAME.toLowerCase(), String(row.VIEW_DEFINITION || "").toLowerCase()]));

  const gaps = [];

  for (const need of REQUIREMENTS) {
    if (need.table && !hasTable.has(need.table.toLowerCase())) {
      gaps.push({ what: `ไม่มีตาราง ${need.table}`, migration: need.migration });
      continue;
    }

    if (need.column && !hasColumn.has(`${need.column[0]}.${need.column[1]}`.toLowerCase())) {
      gaps.push({ what: `ไม่มีคอลัมน์ ${need.column[0]}.${need.column[1]}`, migration: need.migration });
      continue;
    }

    if (need.index && !hasIndex.has(`${need.index[0]}.${need.index[1]}`.toLowerCase())) {
      gaps.push({ what: `ไม่มี index ${need.index[0]}.${need.index[1]}`, migration: need.migration });
      continue;
    }

    if (need.viewMentions) {
      const [view, mention] = need.viewMentions;
      const body = viewBody.get(view.toLowerCase());

      // view หายไปทั้งตัวก็นับเป็นช่องว่างเดียวกัน — ปลายทางที่ต้องทำเหมือนกันคือ
      // รัน migration ฉบับนั้นซ้ำให้ครบ
      if (body === undefined) {
        gaps.push({ what: `ไม่มี view ${view}`, migration: need.migration });
      } else if (body === "") {
        // view มีอยู่แต่ information_schema ให้นิยามว่างเปล่า = บัญชีนี้ไม่มีสิทธิ์ SHOW VIEW
        // ไม่ใช่นิยามเดิม การบอกให้รัน migration ซ้ำจะพาคนไปแก้ผิดที่ (เจอจริงกับฐาน Docker)
        gaps.push({ what: `อ่านนิยาม view ${view} ไม่ได้ — บัญชีฐานข้อมูลไม่มีสิทธิ์ SHOW VIEW`, migration: null });
      } else if (!body.includes(mention.toLowerCase())) {
        gaps.push({ what: `view ${view} ยังเป็นนิยามเดิม (ไม่อ้างถึง ${mention})`, migration: need.migration });
      }
    }
  }

  // view หนึ่งตัวถูกตรวจหลายบรรทัด ช่องว่างเรื่องสิทธิ์จึงซ้ำกันได้ — เหลือบรรทัดเดียวต่อ view
  return gaps.filter((gap, i) => gap.migration !== null || gaps.findIndex((other) => other.what === gap.what) === i);
}

/**
 * ข้อความสำหรับคนที่ต้องลงมือแก้ — บอกว่าขาดอะไรและต้องรันไฟล์ไหนตามลำดับไหน
 *
 * ตั้งใจไม่ย่อเป็นบรรทัดเดียว เพราะคนที่อ่านข้อความนี้คือคนที่กำลังยืนอยู่หน้า
 * เครื่อง server ตอนที่ระบบไม่ยอมเปิด เขาต้องการคำสั่งที่พิมพ์ตามได้เลย
 *
 * @param {Array<{ what: string, migration: string }>} gaps
 * @returns {string}
 */
function describeGaps(gaps) {
  const privilege = gaps.filter((gap) => gap.migration === null);
  if (privilege.length > 0 && privilege.length === gaps.length) {
    return [
      "บัญชีฐานข้อมูลที่ API ใช้มีสิทธิ์ไม่พอตรวจโครงสร้าง:",
      "",
      ...privilege.map((gap) => `  - ${gap.what}`),
      "",
      "  ให้สิทธิ์ SHOW VIEW บนฐานนี้กับบัญชีของ API (อ่านนิยาม view เท่านั้น ไม่ได้แก้ข้อมูล):",
      "",
      "      GRANT SHOW VIEW ON `DBNAME`.* TO 'USER'@'HOST';",
    ].join("\n");
  }

  const byMigration = new Map();
  for (const gap of gaps) {
    if (gap.migration === null) continue; // บอกเรื่องสิทธิ์หลังแก้ migration ครบแล้ว
    if (!byMigration.has(gap.migration)) byMigration.set(gap.migration, []);
    byMigration.get(gap.migration).push(gap.what);
  }

  const lines = ["ฐานข้อมูลยังไม่ได้อัปเดตให้ตรงกับโค้ดรุ่นนี้ ต้องรัน migration ที่ค้างอยู่ก่อน:", ""];

  for (const [migration, what] of byMigration) {
    lines.push(`  ${migration}`);
    for (const item of what) lines.push(`      - ${item}`);
  }

  lines.push(
    "",
    "  สำรองฐานข้อมูลก่อนเสมอ แล้วรันตามลำดับข้างบน:",
    "",
    "      mysqldump --default-character-set=utf8mb4 -u USER -p DBNAME > backup.sql",
    "      mysql --default-character-set=utf8mb4 -u USER -p DBNAME < database/migrations/ไฟล์ที่ค้าง.sql",
    "",
    "  ดู docs/how-to/run-migrations.md — ตัวเลือก --default-character-set=utf8mb4 ห้ามลืม",
    "  ไม่งั้นภาษาไทยในฐานจะเพี้ยนถาวร"
  );

  return lines.join("\n");
}

module.exports = { findSchemaGaps, describeGaps, REQUIREMENTS };
