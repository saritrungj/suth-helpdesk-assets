// scripts/seed-demo-data.cjs — เติมข้อมูลตัวอย่างให้ฐานพัฒนา "ดูเต็ม" พอจะตรวจหน้าจอจริง
//
//   node scripts/seed-demo-data.cjs --confirm
//
// ปัญหาที่แก้: ฐานพัฒนามีเครื่อง 21 เครื่อง ยอดพิมพ์ครึ่งปี และ **ไม่มีแถวเลย**ใน
// device_service_period กับ device_contract_history หน้าจอทุกหน้าจึงขึ้นว่า "ยังยืนยัน
// ราคาไม่ได้" และ "รอตรวจยืนยันการติดตั้ง" ทั้งระบบ ซึ่งเป็นสถานะที่ถูกต้องตาม ADR-0018
// และ ADR-0019 แต่ทำให้ตรวจหน้าจอส่วนที่เหลือไม่ได้เลยสักหน้า
//
// ## กฎของสคริปต์นี้
//
//   1. **ไม่ทับข้อมูลเดิม** — ยอดพิมพ์ที่มีอยู่แล้วใช้ INSERT IGNORE, ช่องที่ถูกกรอก
//      ไว้แล้วมี WHERE ... IS NULL กำกับ รันซ้ำกี่รอบผลก็เท่าเดิม
//   2. **ตัวเลขเป็น deterministic** — สุ่มจาก seed คงที่ รันซ้ำแล้วยอดไม่ขยับ
//      ทำให้ภาพหน้าจอสองรอบเทียบกันได้
//   3. **ห้ามรันโดยไม่ตั้งใจ** — ต้องมี --confirm และสคริปต์พิมพ์ชื่อฐานที่จะเขียนก่อน
//
// ⚠️ นี่คือข้อมูลตัวอย่างสำหรับเครื่องพัฒนา ห้ามรันกับฐานข้อมูลจริงของโรงพยาบาล

const path = require("node:path");
// mysql2/dotenv ถูก hoist ขึ้น node_modules ของ root ตาม npm workspaces จึง require ตรงๆ ได้
const mysql = require("mysql2/promise");
require("dotenv").config({ path: path.join(__dirname, "..", "apps", "api", ".env"), quiet: true });

const { MAX_PAGES_PER_MONTH } = require("../packages/domain/constraints.cjs");

/** เดือนสุดท้ายที่ "จบแล้ว" — เดือนปัจจุบันยังอ่านมิเตอร์ไม่ได้ จึงไม่ใช่ยอดค้าง */
function lastClosedMonth(today = new Date()) {
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** ไล่เดือนแบบ YYYY-MM จาก from ถึง to (รวมปลายทั้งสองข้าง) */
function monthsBetween(from, to) {
  const out = [];
  let [y, m] = from.split("-").map(Number);
  const [ey, em] = to.split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (++m > 12) { m = 1; y += 1; }
  }
  return out;
}

const firstDay = (month) => `${month}-01`;
const lastDay = (month) => {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
};

/**
 * สุ่มแบบ deterministic (mulberry32) — ไม่ใช้ Math.random เพราะต้องการให้รันซ้ำ
 * แล้วได้ยอดเดิม ภาพหน้าจอรอบนี้กับรอบหน้าจึงเทียบกันได้จริง
 */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** เครื่องที่จะเพิ่มเข้าทะเบียน — กระจายตามอาคาร/ชั้น/แผนกที่มีอยู่จริงในฐาน */
const NEW_DEVICES = [
  ["PRN-OPD-004", "HP", "LaserJet M404dn", "อาคารผู้ป่วยนอก", "ชั้น 1", "ฝ่ายการแพทย์", "OPD", "เคาน์เตอร์เวชระเบียนหน้า"],
  ["PRN-OPD-005", "Canon", "LBP226dw", "อาคารผู้ป่วยนอก", "ชั้น 2", "ฝ่ายการแพทย์", "OPD", "ห้องตรวจ 3"],
  ["PRN-OPD-006", "HP", "LaserJet M428fdw", "อาคารผู้ป่วยนอก", "ชั้น 2", "ฝ่ายการแพทย์", "OPD", "ห้องตรวจ 7"],
  ["PRN-ER-003", "Brother", "HL-L5100DN", "อาคารผู้ป่วยนอก", "ชั้น 1", "ฝ่ายการแพทย์", "ER", "ห้องฉุกเฉินโซน A"],
  ["PRN-ER-004", "HP", "LaserJet M404dn", "อาคารผู้ป่วยนอก", "ชั้น 1", "ฝ่ายการแพทย์", "ER", "ห้องสังเกตอาการ"],
  ["PRN-LAB-002", "Epson", "M320dn", "อาคารผู้ป่วยนอก", "ชั้น 3", "ฝ่ายการแพทย์", "LAB", "ห้องผลตรวจ"],
  ["PRN-LAB-003", "Epson", "M320dn", "อาคารผู้ป่วยนอก", "ชั้น 3", "ฝ่ายการแพทย์", "LAB", "ห้องจุลชีววิทยา"],
  ["PRN-XRAY-002", "Fuji Xerox", "P285dw", "อาคารผู้ป่วยนอก", "ชั้น 3", "ฝ่ายการแพทย์", "X-RAY", "ห้องอ่านฟิล์ม"],
  ["PRN-IPD-M-003", "Canon", "LBP226dw", "อาคารผู้ป่วยใน", "ชั้น 2", "ฝ่ายการพยาบาล", "IPD ชาย", "เคาน์เตอร์พยาบาลตะวันออก"],
  ["PRN-IPD-M-004", "Canon", "LBP226dw", "อาคารผู้ป่วยใน", "ชั้น 3", "ฝ่ายการพยาบาล", "IPD ชาย", "เคาน์เตอร์พยาบาลตะวันตก"],
  ["PRN-IPD-F-003", "HP", "LaserJet M404dn", "อาคารผู้ป่วยใน", "ชั้น 2", "ฝ่ายการพยาบาล", "IPD หญิง", "เคาน์เตอร์พยาบาลกลาง"],
  ["PRN-IPD-F-004", "Brother", "HL-L5100DN", "อาคารผู้ป่วยใน", "ชั้น 4", "ฝ่ายการพยาบาล", "IPD หญิง", "ห้องพักเจ้าหน้าที่"],
  ["PRN-ICU-002", "HP", "LaserJet M428fdw", "อาคารผู้ป่วยใน", "ชั้น 4", "ฝ่ายการพยาบาล", "ICU", "เคาน์เตอร์ ICU 1"],
  ["PRN-ICU-003", "HP", "LaserJet M428fdw", "อาคารผู้ป่วยใน", "ชั้น 4", "ฝ่ายการพยาบาล", "ICU", "เคาน์เตอร์ ICU 2"],
  ["PRN-IPD-W-001", "Canon", "LBP226dw", "อาคารผู้ป่วยใน", "ชั้น 1", "ฝ่ายการพยาบาล", "IPD หญิง", "ห้องรับผู้ป่วยใน"],
  ["PRN-FIN-003", "Epson", "M320dn", "อาคารอำนวยการ", "ชั้น 1", "ฝ่ายบริหาร", "การเงิน", "ห้องเบิกจ่าย"],
  ["PRN-FIN-004", "Epson", "M320dn", "อาคารอำนวยการ", "ชั้น 1", "ฝ่ายบริหาร", "การเงิน", "ห้องบัญชี"],
  ["PRN-SUP-002", "Brother", "HL-L5100DN", "อาคารอำนวยการ", "ชั้น 2", "ฝ่ายบริหาร", "พัสดุ", "คลังพัสดุกลาง"],
  ["PRN-SUP-003", "Brother", "HL-L5100DN", "อาคารอำนวยการ", "ชั้น 2", "ฝ่ายบริหาร", "พัสดุ", "ห้องจัดซื้อ"],
  ["PRN-ADM-002", "Canon", "LBP226dw", "อาคารอำนวยการ", "ชั้น 1", "ฝ่ายบริหาร", "ธุรการ", "ห้องสารบรรณ"],
  ["PRN-ADM-003", "HP", "LaserJet M404dn", "อาคารอำนวยการ", "ชั้น 2", "ฝ่ายบริหาร", "ธุรการ", "ห้องประชุมใหญ่"],
  ["PRN-MR-003", "Fuji Xerox", "P285dw", "อาคารศูนย์แพทยศาสตรศึกษา", "ชั้น 1", "ฝ่ายสนับสนุนบริการ", "เวชระเบียน", "ห้องเก็บเวชระเบียน"],
  ["PRN-MR-004", "Fuji Xerox", "P285dw", "อาคารศูนย์แพทยศาสตรศึกษา", "ชั้น 1", "ฝ่ายสนับสนุนบริการ", "เวชระเบียน", "เคาน์เตอร์ยืมแฟ้ม"],
  ["PRN-IT-002", "HP", "LaserJet M404dn", "อาคารศูนย์แพทยศาสตรศึกษา", "ชั้น 2", "ฝ่ายสนับสนุนบริการ", "IT", "ห้องเซิร์ฟเวอร์"],
  ["PRN-IT-003", "Canon", "LBP226dw", "อาคารศูนย์แพทยศาสตรศึกษา", "ชั้น 2", "ฝ่ายสนับสนุนบริการ", "IT", "ห้องซ่อมคอมพิวเตอร์"],
];

/**
 * เครื่องที่จงใจปล่อยให้อยู่ในสถานะมีปัญหา — เปิดด้วย --with-problems เท่านั้น
 *
 * ค่าเริ่มต้นสร้างข้อมูลที่สมบูรณ์ เพราะนั่นคือสิ่งที่ต้องเห็นเวลาตรวจหน้าจอทั่วไป:
 * ความครบถ้วนเป็นตัวเลขจริง อันดับค่าใช้จ่ายและเปอร์เซ็นต์เพิ่ม-ลดแสดงได้ครบ
 *
 * แต่ข้อมูลที่เขียวหมดทุกช่องก็ทดสอบอีกครึ่งหนึ่งของระบบไม่ได้เลย — การ์ดเตือนสามใบ
 * ในลิ้นชัก หน้าตรวจยืนยันการติดตั้ง และเส้นทาง "ยังยืนยันราคาไม่ได้" จะไม่มีวันถูก
 * วาดออกมา --with-problems จึงสร้างสามสถานะนั้นให้ ตรงกับการ์ดสามใบพอดี
 *
 * ⚠️ เครื่องที่ยังไม่ตรวจยืนยันแม้เครื่องเดียวทำให้ "ความครบถ้วน" ทั้งปีสรุปไม่ได้
 * (ADR-0018) ตัวเลขความครบถ้วนบนแดชบอร์ดจะเป็น "รอยืนยันข้อมูล" ทันที ซึ่งถูกต้อง
 * ตามกฎ แต่ทำให้หน้าจอดูไม่เต็ม — นี่คือเหตุผลที่มันไม่ใช่ค่าเริ่มต้น
 */
const WITH_PROBLEMS = process.argv.includes("--with-problems");
const KEEP_UNPRICED = WITH_PROBLEMS ? ["SN44558"] : [];      // สัญญาปีงบเก่า → "ยังยืนยันราคาไม่ได้" (#81)
const KEEP_UNREVIEWED = WITH_PROBLEMS ? ["PRN-IT-003"] : []; // ยังไม่ตรวจการติดตั้ง → "มีงานค้าง"
const KEEP_IDLE = WITH_PROBLEMS ? ["PRN-ADM-003"] : [];      // ไม่มียอดทั้งปีงบ → "น่าตรวจสอบ"

/** โหลดข้อมูลอ้างอิงเป็น Map ชื่อ → id (ชื่อคือสิ่งที่ผู้ใช้เห็นและไฟล์นำเข้าใช้จับคู่) */
async function lookup(db, table, extraKey = null) {
  const [rows] = await db.query(`SELECT * FROM \`${table}\``);
  const map = new Map();
  for (const row of rows) map.set(extraKey ? `${row.name}|${row[extraKey]}` : row.name, row.id);
  return map;
}

async function main() {
  if (!process.argv.includes("--confirm")) {
    console.error(`ต้องยืนยันก่อน: node scripts/seed-demo-data.cjs --confirm`);
    console.error(`จะเขียนลงฐาน "${process.env.DB_NAME}" ที่ ${process.env.DB_HOST}`);
    process.exit(1);
  }

  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: false,
  });
  console.log(`เขียนลงฐาน "${process.env.DB_NAME}" ที่ ${process.env.DB_HOST}`);

  const summary = {};
  // ใช้ query ไม่ใช่ execute — prepared statement ของ mysql2 ไม่ขยาย array ให้ `IN (?)`
  const count = async (label, sql, params = []) => {
    const [result] = await db.query(sql, params);
    summary[label] = (summary[label] ?? 0) + (result.affectedRows ?? 0);
  };

  /*
   * --rebuild — ลบเฉพาะแถวที่สคริปต์นี้เป็นคนสร้าง (note = 'ข้อมูลตัวอย่าง') แล้วสร้างใหม่
   *
   * จำเป็นเพราะขั้นตอนด้านล่างข้ามแถวที่มีอยู่แล้ว การแก้กติกาในสคริปต์จึงไม่มีผล
   * กับฐานที่เคยรันไปแล้ว ถ้าไม่มีทางล้างของเดิม ยอดพิมพ์ที่คนกรอกเองไม่ถูกแตะ
   */
  if (process.argv.includes("--rebuild")) {
    await count("ประวัติสัญญาที่ล้าง", "DELETE FROM device_contract_history WHERE note = 'ข้อมูลตัวอย่าง'");
    await count("ช่วงบันทึกยอดที่ล้าง", "DELETE FROM device_service_period WHERE note = 'ข้อมูลตัวอย่าง'");
    await count("ยอดของเครื่องที่ต้องไม่มียอด", `
      DELETE p FROM print_transactions p JOIN devices d ON d.id = p.device_id
      WHERE d.serial_number IN (?)
    `, [KEEP_IDLE.length ? KEEP_IDLE : [""]]);
  }

  const [fiscalYears] = await db.query("SELECT * FROM fiscal_year ORDER BY start_month");
  const [admin] = await db.query("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1");
  const adminId = admin[0]?.id ?? null;

  // ---------- 1. สัญญา: ช่วงที่มีผล + การยืนยันราคา (ADR-0019) ----------
  //
  // ไม่มีช่วงที่มีผล = หาราคาของเดือนไหนไม่ได้เลย ทุกยอดจึงขึ้นว่า "ยังยืนยันราคาไม่ได้"
  // ตั้งช่วงให้เท่ากับปีงบของสัญญา ซึ่งเป็นค่าตั้งต้นที่หน้าเว็บเสนอให้ผู้ดูแลกดยืนยันอยู่แล้ว
  for (const fy of fiscalYears) {
    await count("สัญญาที่ตั้งช่วงมีผล", `
      UPDATE contracts SET effective_from = ?, effective_to = ?,
        price_source = COALESCE(price_source, ?),
        price_verified_by = COALESCE(price_verified_by, ?),
        price_verified_at = COALESCE(price_verified_at, NOW())
      WHERE fiscal_year_id = ? AND effective_from IS NULL
    `, [firstDay(fy.start_month), lastDay(fy.end_month), `ข้อมูลตัวอย่าง ปีงบ ${fy.year}`, adminId, fy.id]);
  }

  // ---------- 2. เครื่องใหม่ ----------
  const brands = await lookup(db, "brand");
  const buildings = await lookup(db, "building");
  const floors = await lookup(db, "floor", "building_id");
  const divisions = await lookup(db, "division");
  const departments = await lookup(db, "department", "division_id");
  const [contractRows] = await db.query("SELECT id, contract_no, fiscal_year_id FROM contracts WHERE fiscal_year_id IS NOT NULL");

  const activeFy = fiscalYears.find((fy) => fy.year === "2569") ?? fiscalYears.at(-1);
  const contractsOfActiveFy = contractRows.filter((c) => c.fiscal_year_id === activeFy.id);

  for (const [index, [serial, brand, model, building, floor, division, department, location]] of NEW_DEVICES.entries()) {
    const buildingId = buildings.get(building);
    const divisionId = divisions.get(division);
    await count("เครื่องที่เพิ่ม", `
      INSERT IGNORE INTO devices
        (serial_number, brand_id, model, building_id, floor_id, location, division_id, department_id, contract_id, status, installation_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'installed')
    `, [
      serial, brands.get(brand), model, buildingId, floors.get(`${floor}|${buildingId}`), location,
      divisionId, departments.get(`${department}|${divisionId}`),
      contractsOfActiveFy[index % contractsOfActiveFy.length].id,
    ]);
  }

  // ---------- 3. สถานะการติดตั้งของเครื่องเดิม (ADR-0018) ----------
  //
  // ระบบไม่เดาให้ว่าเครื่องเดิมติดตั้งแล้วหรือยัง — ปกติผู้ดูแลต้องไล่กดยืนยันทีละเครื่อง
  // ที่หน้า "ตรวจยืนยันการติดตั้ง" สคริปต์นี้กดแทนให้ **เฉพาะฐานตัวอย่าง** เพื่อให้ตัวเลข
  // ความครบถ้วนบนแดชบอร์ดยืนยันได้ ไม่ใช่เพราะระบบควรเดาเอง
  await count("เครื่องที่ตั้งสถานะติดตั้ง", `
    UPDATE devices SET installation_status = 'installed'
    WHERE installation_status IS NULL AND serial_number NOT IN (?)
  `, [KEEP_UNREVIEWED.length ? KEEP_UNREVIEWED : [""]]);
  await count("เครื่องที่คืนสถานะยังไม่ตรวจ", `
    UPDATE devices SET installation_status = NULL WHERE serial_number IN (?)
  `, [KEEP_UNREVIEWED.length ? KEEP_UNREVIEWED : [""]]);

  // ---------- 4. ช่วงที่ต้องบันทึกยอด ----------
  const [devices] = await db.query("SELECT id, serial_number, status FROM devices ORDER BY id");
  const historyStart = fiscalYears[0].start_month;
  for (const device of devices) {
    const [[existing]] = await db.query("SELECT COUNT(*) n FROM device_service_period WHERE device_id = ?", [device.id]);
    if (existing.n > 0) continue;
    // เครื่องปลดระวางปิดช่วงไว้ที่สิ้นปีงบก่อนหน้า — ไม่ใช่เครื่องที่ยังต้องบันทึกยอดวันนี้
    const endsAt = device.status === "retired" ? lastDay(fiscalYears.at(-2)?.end_month ?? historyStart) : null;
    await count("ช่วงที่ต้องบันทึกยอด", `
      INSERT INTO device_service_period (device_id, effective_from, effective_to, note, verified_by, verified_at)
      VALUES (?, ?, ?, 'ข้อมูลตัวอย่าง', ?, NOW())
    `, [device.id, firstDay(historyStart), endsAt, adminId]);
  }

  // ---------- 4.5 เครื่องที่ยังผูกสัญญาของปีงบเก่า ----------
  //
  // ต้องมาก่อนการสร้างประวัติสัญญา ไม่งั้นประวัติจะถูกสร้างจากสัญญาเก่าที่ยังค้างอยู่
  // แล้วยอดตามประวัติ (แดชบอร์ด) กับยอดตามสัญญาปัจจุบัน (หน้าค่าใช้จ่าย) จะไม่ตรงกัน
  //
  // หน้า "ค่าใช้จ่ายตามสัญญา" จัดกลุ่มตามสัญญาที่ผูกกับเครื่อง **ตอนนี้** ไม่ใช่ตาม
  // ประวัติ เครื่องที่ยังค้างสัญญาปีงบเก่าจึงหลุดออกจากยอดรวมของทุกสัญญาในปีงบ
  // ปัจจุบัน แล้วไปกองอยู่ในกล่องเตือน "เครื่องที่พิมพ์ในปีงบนี้ แต่สัญญาอยู่คนละปีงบ"
  // ทำให้ยอดบนแดชบอร์ดกับยอดหน้าค่าใช้จ่ายไม่ตรงกัน — นี่คืองานที่ #81 บอกให้ทำ
  //
  // ข้อมูลตัวอย่างย้ายให้ ยกเว้นเครื่องใน KEEP_UNPRICED ที่จงใจปล่อยค้างไว้
  const [stale] = await db.query(`
    SELECT d.id, d.serial_number FROM devices d
    JOIN contracts c ON c.id = d.contract_id
    WHERE c.fiscal_year_id <> ? AND d.serial_number NOT IN (?)
  `, [activeFy.id, KEEP_UNPRICED.length ? KEEP_UNPRICED : [""]]);

  for (const [index, device] of stale.entries()) {
    await count("เครื่องที่ย้ายมาสัญญาปีงบปัจจุบัน", "UPDATE devices SET contract_id = ? WHERE id = ?", [
      contractsOfActiveFy[index % contractsOfActiveFy.length].id,
      device.id,
    ]);
  }

  // ---------- 5. ประวัติว่าเครื่องอยู่ใต้สัญญาไหนในช่วงไหน ----------
  //
  // ไม่มีประวัตินี้ = ราคาของเดือนที่ผ่านมาหาไม่เจอ แม้สัญญาจะยืนยันช่วงแล้วก็ตาม
  const [deviceContracts] = await db.query(
    "SELECT id, serial_number, contract_id, price_override FROM devices WHERE contract_id IS NOT NULL",
  );
  const activeContractIds = new Set(contractsOfActiveFy.map((c) => c.id));
  for (const [index, device] of deviceContracts.entries()) {
    for (const fy of fiscalYears) {
      const contract = contractRows.find((c) => c.fiscal_year_id === fy.id);
      if (!contract) continue;
      const [[existing]] = await db.query(
        "SELECT COUNT(*) n FROM device_contract_history WHERE device_id = ? AND effective_from = ?",
        [device.id, firstDay(fy.start_month)],
      );
      if (existing.n > 0) continue;
      /*
       * ปีก่อนหน้าใช้สัญญาของปีนั้น ส่วนปีงบปัจจุบันต้องใช้สัญญา**ของปีงบปัจจุบัน**
       *
       * เครื่องหลายเครื่องในฐานยังผูก contract_id ของปีงบเก่าอยู่ ถ้าลอกค่านั้นมาเป็น
       * ประวัติของปีงบปัจจุบัน ราคาจะหาไม่เจอทั้งปี เพราะช่วงที่สัญญาเก่ามีผลจบไป
       * ตั้งแต่ปีที่แล้ว (ดูกฎใน v_monthly_kpi) — นั่นคืออาการของ #81 พอดี
       * ข้อมูลตัวอย่างจึงย้ายให้ ยกเว้นเครื่องใน KEEP_UNPRICED ที่จงใจปล่อยค้างไว้
       * ให้การ์ด "ยังยืนยันราคาไม่ได้" มีของจริงให้แสดง
       */
      let contractId = contract.id;
      if (fy.id === activeFy.id) {
        contractId = activeContractIds.has(device.contract_id) || KEEP_UNPRICED.includes(device.serial_number)
          ? device.contract_id
          : contractsOfActiveFy[index % contractsOfActiveFy.length].id;
      }
      await count("ประวัติสัญญาของเครื่อง", `
        INSERT INTO device_contract_history (device_id, contract_id, price_override, effective_from, effective_to, note)
        VALUES (?, ?, ?, ?, ?, 'ข้อมูลตัวอย่าง')
      `, [
        device.id, contractId,
        // ราคาเฉพาะเครื่องชนะราคาสัญญาเสมอ (ดู v_monthly_kpi) เครื่องที่จงใจให้หาราคา
        // ไม่ได้จึงต้องไม่มีราคาเฉพาะเครื่องติดมาด้วย ไม่งั้นมันจะมีราคาทันที
        fy.id === activeFy.id && !KEEP_UNPRICED.includes(device.serial_number) ? device.price_override : null,
        firstDay(fy.start_month), lastDay(fy.end_month),
      ]);
    }
  }

  // ---------- 6. ยอดพิมพ์ ----------
  //
  // INSERT IGNORE — ยอดที่มีอยู่แล้วในฐานห้ามถูกทับ ยอดคือข้อมูลจริงที่คนกรอกไว้
  const closed = lastClosedMonth();
  const [servicePeriods] = await db.query("SELECT device_id, effective_from, effective_to FROM device_service_period");
  const periodOf = new Map(servicePeriods.map((p) => [p.device_id, p]));
  const random = rng(2569);

  const idleIds = new Set(devices.filter((d) => KEEP_IDLE.includes(d.serial_number)).map((d) => d.id));
  for (const device of devices) {
    const period = periodOf.get(device.id);
    if (!period || idleIds.has(device.id)) continue;
    const from = String(period.effective_from instanceof Date
      ? period.effective_from.toISOString().slice(0, 7)
      : String(period.effective_from).slice(0, 7));
    const to = period.effective_to
      ? String(period.effective_to instanceof Date
        ? period.effective_to.toISOString().slice(0, 7)
        : String(period.effective_to).slice(0, 7))
      : closed;
    if (from > to) continue;

    // ฐานการใช้งานต่อเครื่องคงที่ แล้วแกว่งรายเดือน ±35% — ไม่ใช่ตัวเลขแบนเท่ากันทุกเดือน
    // ซึ่งจะทำให้กราฟแนวโน้มเป็นเส้นตรงและดูไม่ออกว่าหน้าจอทำงานถูกไหม
    const base = 400 + Math.floor(random() * 4200);
    for (const month of monthsBetween(from, to > closed ? closed : to)) {
      const pages = Math.min(MAX_PAGES_PER_MONTH, Math.max(0, Math.round(base * (0.65 + random() * 0.7))));
      await count("ยอดพิมพ์ที่เพิ่ม", `
        INSERT IGNORE INTO print_transactions (device_id, month, pages) VALUES (?, ?, ?)
      `, [device.id, month, pages]);
    }
  }

  console.log("");
  for (const [label, n] of Object.entries(summary)) console.log(String(n).padStart(6), label);

  const [[totals]] = await db.query(`
    SELECT (SELECT COUNT(*) FROM devices) devices,
           (SELECT COUNT(*) FROM print_transactions) readings,
           (SELECT COUNT(*) FROM device_service_period) periods,
           (SELECT COUNT(*) FROM device_contract_history) contract_history,
           (SELECT COUNT(*) FROM contracts WHERE price_verified_at IS NOT NULL) verified_contracts
  `);
  console.log("\nรวมในฐานตอนนี้:", JSON.stringify(totals));
  await db.end();
}

main().catch((error) => { console.error(error); process.exit(1); });
