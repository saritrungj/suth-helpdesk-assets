// apps/api/src/devices/controller.js
//
// ทะเบียนเครื่อง — ตารางหลักของทั้งระบบ ทุกยอดพิมพ์และทุกบาทผูกกลับมาที่นี่
//
// สิ่งที่เปลี่ยนรอบนี้
//
//   1. **กรอง ค้นหา เรียง และแบ่งหน้าฝั่งเซิร์ฟเวอร์** เดิม GET /api/devices ส่ง
//      เครื่องทั้งหมดกลับไปเสมอ แล้วให้เบราว์เซอร์กรองเอง ซึ่งทำงานได้จนกว่าจำนวน
//      เครื่องจะโตขึ้น — ทุกหน้าที่ต้องใช้ทะเบียนต้องดาวน์โหลดทั้งตารางก่อนวาดอะไร
//      ได้เลย ตอนนี้รับพารามิเตอร์กรองได้ และ **ยังคงคืนทั้งหมดเหมือนเดิมถ้าไม่ส่ง
//      per_page มา** เพื่อไม่ให้หน้าที่มีอยู่พัง
//
//   2. **ยอดพิมพ์ของปีงบติดมากับแต่ละเครื่องได้** (?fiscal_year_id=) เดิมหน้า
//      บันทึกยอดพิมพ์ต้องยิงสองคำขอแล้วเอามาต่อกันเองในเบราว์เซอร์
//
//   3. **ไม่ส่งข้อความ error ของ MySQL ออกไป** — ทุก error ไหลไป error handler กลาง

const db = require("../shared/db");
const { z } = require("zod");
const { notFound } = require("../shared/http-error");
const { validate, idParam, requiredText, optionalText, optionalId, optionalMoney } = require("../shared/validate");
const cache = require("../shared/cache");
const { DEVICE_STATUSES, MAX_LENGTH } = require("@suth/domain");

// ============================================================
// Schema ของข้อมูลขาเข้า
// ============================================================

const deviceBody = z.object({
  serial_number: requiredText("หมายเลขเครื่อง", MAX_LENGTH.serial_number),
  brand_id: optionalId,
  model: optionalText(MAX_LENGTH.model),
  building_id: optionalId,
  floor_id: optionalId,
  location: optionalText(MAX_LENGTH.location),
  division_id: optionalId,
  department_id: optionalId,
  contract_id: optionalId,
  price_override: optionalMoney,
  status: z.enum(DEVICE_STATUSES).default("active"),
});

// แก้ไขทรัพย์สินทั่วไป — ไม่รวมที่ตั้งและสังกัด การย้ายเครื่องใช้ moveBody แยกต่างหาก
// เพื่อไม่ให้กด "บันทึก" ที่ฟอร์มแก้ไขธรรมดาแล้วเผลอย้ายเครื่องพร้อมเขียนประวัติการย้าย
const updateBody = deviceBody.omit({
  building_id: true,
  floor_id: true,
  location: true,
  division_id: true,
  department_id: true,
});

const moveBody = z.object({
  building_id: optionalId,
  floor_id: optionalId,
  location: optionalText(MAX_LENGTH.location),
  division_id: optionalId,
  department_id: optionalId,
});

/**
 * พารามิเตอร์ของการค้นหาในทะเบียน
 *
 * ทุกตัวไม่บังคับ — ไม่ส่งอะไรมาเลย = คืนทุกเครื่องเรียงตามหมายเลข ซึ่งเป็น
 * พฤติกรรมเดิมทุกประการ ทำให้เพิ่มความสามารถนี้ได้โดยไม่ต้องแก้หน้าที่มีอยู่
 */
const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  building_id: optionalId,
  floor_id: optionalId,
  division_id: optionalId,
  department_id: optionalId,
  brand_id: optionalId,
  contract_id: optionalId,
  status: z.enum(DEVICE_STATUSES).optional(),
  // เครื่องที่ยังไม่ได้ผูกสัญญา — ตอบคำถาม "เครื่องไหนยังคิดเงินไม่ได้"
  unassigned: z.coerce.boolean().optional(),
  fiscal_year_id: optionalId,
  sort: z.enum(["serial_number", "model", "building_name", "department_name", "status"]).default("serial_number"),
  order: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(200).optional(),
});

// ============================================================
// SQL ที่ใช้ร่วมกัน
// ============================================================

/**
 * คอลัมน์และการ join ที่ทุก endpoint ของทะเบียนใช้เหมือนกัน
 *
 * ประกาศไว้ที่เดียวเพราะเดิม getAll กับ getOne เขียน join ชุดเดียวกันคนละก๊อปปี้
 * แล้วต่างกันจริงๆ — getOne ใช้ `d.*` ส่วน getAll ระบุคอลัมน์ ทำให้หน้าที่ดึงทีละ
 * เครื่องได้ฟิลด์ที่หน้ารายการไม่มี และโค้ดฝั่งเว็บก็เขียนพึ่งฟิลด์นั้นไปโดยไม่รู้ตัว
 */
const DEVICE_SELECT = `
  SELECT
    d.id,
    d.serial_number,
    d.model,
    d.location,
    d.status,
    d.price_override,
    d.brand_id,
    d.building_id,
    d.floor_id,
    d.division_id,
    d.department_id,
    d.contract_id,
    br.name AS brand_name,
    b.name AS building_name,
    f.name AS floor_name,
    divi.name AS division_name,
    dept.name AS department_name,
    c.contract_no,
    c.price_per_page,
    fy.year AS fiscal_year
  FROM devices d
  LEFT JOIN brand br ON d.brand_id = br.id
  LEFT JOIN building b ON d.building_id = b.id
  LEFT JOIN floor f ON d.floor_id = f.id
  LEFT JOIN division divi ON d.division_id = divi.id
  LEFT JOIN department dept ON d.department_id = dept.id
  LEFT JOIN contracts c ON d.contract_id = c.id
  LEFT JOIN fiscal_year fy ON c.fiscal_year_id = fy.id
`;

/**
 * แปลงพารามิเตอร์การค้นหาเป็นเงื่อนไข WHERE
 *
 * คืนทั้งข้อความเงื่อนไขและค่าที่จะส่งเป็นพารามิเตอร์ — ห้ามต่อค่าที่ผู้ใช้ส่งมา
 * เข้าไปใน SQL ตรงๆ ไม่ว่ากรณีใด ชื่อคอลัมน์สำหรับเรียงลำดับจึงต้องผ่านรายการที่
 * อนุญาตไว้ (whitelist) เพราะ ORDER BY ใช้พารามิเตอร์ ? ไม่ได้
 *
 * @param {object} query ค่าที่ผ่าน listQuery มาแล้ว
 */
function buildFilters(query) {
  const conditions = [];
  const params = [];

  if (query.q) {
    // ค้นหาข้ามหลายช่องพร้อมกัน — เจ้าหน้าที่จำได้บ้างไม่ได้บ้างว่าเครื่องที่ตามหา
    // มีหมายเลขอะไร รุ่นอะไร หรืออยู่ตรงไหน จึงให้พิมพ์คำเดียวแล้วค้นทุกช่องที่
    // เป็นไปได้ แทนที่จะบังคับให้เลือกก่อนว่าจะค้นจากช่องไหน
    conditions.push("(d.serial_number LIKE ? OR d.model LIKE ? OR d.location LIKE ? OR br.name LIKE ?)");
    const term = `%${query.q}%`;
    params.push(term, term, term, term);
  }

  for (const field of ["building_id", "floor_id", "division_id", "department_id", "brand_id", "contract_id"]) {
    if (query[field]) {
      conditions.push(`d.${field} = ?`);
      params.push(query[field]);
    }
  }

  if (query.status) {
    conditions.push("d.status = ?");
    params.push(query.status);
  }

  if (query.unassigned) {
    conditions.push("d.contract_id IS NULL");
  }

  return { where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "", params };
}

/** คอลัมน์ที่เรียงได้ — map จากชื่อที่ API รับ ไปเป็นนิพจน์ SQL จริง */
const SORTABLE = {
  serial_number: "d.serial_number",
  model: "d.model",
  building_name: "b.name",
  department_name: "dept.name",
  status: "d.status",
};

// ============================================================
// GET /api/devices
// ============================================================
exports.listQuery = listQuery;

exports.getAll = async (req, res) => {
  const query = req.query;
  const { where, params } = buildFilters(query);

  const orderBy = `ORDER BY ${SORTABLE[query.sort]} ${query.order === "desc" ? "DESC" : "ASC"}, d.id ASC`;

  // นับจำนวนทั้งหมดเฉพาะตอนที่แบ่งหน้าจริง — ถ้าไม่แบ่ง จำนวนแถวที่คืนไปก็คือ
  // จำนวนทั้งหมดอยู่แล้ว ไม่ต้องเสียคำสั่งนับเพิ่ม
  let sql = `${DEVICE_SELECT} ${where} ${orderBy}`;
  const sqlParams = [...params];
  let total = null;

  if (query.per_page) {
    const [[counted]] = await db.query(
      `SELECT COUNT(*) AS total
       FROM devices d
       LEFT JOIN brand br ON d.brand_id = br.id
       LEFT JOIN building b ON d.building_id = b.id
       LEFT JOIN department dept ON d.department_id = dept.id
       ${where}`,
      params
    );
    total = counted.total;

    sql += " LIMIT ? OFFSET ?";
    sqlParams.push(query.per_page, (query.page - 1) * query.per_page);
  }

  const [rows] = await db.query(sql, sqlParams);

  // ยอดพิมพ์ของปีงบที่ระบุ ติดไปกับแต่ละเครื่องเลย — เดิมหน้าบันทึกยอดพิมพ์ต้อง
  // ยิงคำขอที่สองไปที่ /print-transactions/summary แล้วเอามา join ในเบราว์เซอร์เอง
  if (query.fiscal_year_id) {
    await attachUsage(rows, query.fiscal_year_id);
  }

  if (total !== null) {
    res.set("X-Total-Count", String(total));
  }

  cache.operationalData(res);
  res.json(rows);
};

/**
 * เติมสรุปยอดพิมพ์ของปีงบให้แถวที่ดึงมาแล้ว — คำสั่งเดียวสำหรับทุกเครื่องรวมกัน
 *
 * ทำเป็นคำสั่งแยกแทนที่จะ join เข้าไปใน DEVICE_SELECT เพราะการ join กับตาราง
 * ยอดพิมพ์แล้วรวมกลุ่ม จะทำให้ต้องใส่ทุกคอลัมน์ของ devices ลงใน GROUP BY และ
 * ทำให้คำสั่งหลักช้าลงสำหรับทุกหน้าที่ไม่ได้ต้องการยอดพิมพ์
 *
 * @param {object[]} devices แถวที่จะเติมข้อมูลให้ (แก้ในที่)
 * @param {number} fiscalYearId
 */
async function attachUsage(devices, fiscalYearId) {
  if (!devices.length) return;

  const [[fiscalYear]] = await db.query(
    "SELECT start_month, end_month FROM fiscal_year WHERE id = ?",
    [fiscalYearId]
  );
  if (!fiscalYear) throw notFound("ไม่พบปีงบประมาณที่ระบุ");

  const [rows] = await db.query(
    `SELECT
       device_id,
       COUNT(*) AS months_filled,
       SUM(pages) AS total_pages,
       MAX(month) AS latest_month
     FROM print_transactions
     WHERE month BETWEEN ? AND ? AND device_id IN (?)
     GROUP BY device_id`,
    [fiscalYear.start_month, fiscalYear.end_month, devices.map((d) => d.id)]
  );

  const usage = new Map(rows.map((row) => [row.device_id, row]));

  for (const device of devices) {
    const row = usage.get(device.id);
    device.usage = {
      months_filled: row ? Number(row.months_filled) : 0,
      total_pages: row ? Number(row.total_pages) : 0,
      latest_month: row ? row.latest_month : null,
    };
  }
}

/**
 * ตรวจว่าเครื่องนี้มีอยู่จริง — ใช้กับเส้นทางย่อยที่ไม่ได้ดึงตัวเครื่องมาเอง
 *
 * ปัญหาที่แก้: `GET /devices/1` ตอบ 404 แต่ `GET /devices/1/history` ตอบ 200
 * พร้อมประวัติว่างเปล่า สำหรับเครื่องที่ไม่มีอยู่จริง ผู้เรียกจึงแยกไม่ออกระหว่าง
 * "เครื่องนี้ไม่มีในระบบ" กับ "เครื่องนี้มีอยู่แต่ยังไม่เคยย้าย" ซึ่งเป็นคนละเรื่อง
 * และต้องแสดงผลคนละแบบ
 *
 * @param {number} id
 */
async function assertDeviceExists(id) {
  const [rows] = await db.query("SELECT 1 FROM devices WHERE id = ?", [id]);
  if (!rows.length) throw notFound("ไม่พบเครื่องที่ต้องการ");
}

// ============================================================
// GET /api/devices/:id
// ============================================================
exports.getOne = async (req, res) => {
  const [rows] = await db.query(`${DEVICE_SELECT} WHERE d.id = ?`, [req.params.id]);
  if (!rows.length) throw notFound("ไม่พบเครื่องที่ต้องการ");

  cache.operationalData(res);
  res.json(rows[0]);
};

// ============================================================
// ประวัติการย้าย (device_location_history)
// ============================================================
//
// เรียกทุกครั้งหลังเพิ่ม/ย้ายเครื่อง เพื่อ "ปิด" ช่วงเดิมที่ยังเปิดอยู่ (effective_to
// IS NULL) แล้วเปิดช่วงใหม่ — เฉพาะเมื่อที่ตั้ง/สังกัดเปลี่ยนไปจากช่วงล่าสุดจริงๆ
// เท่านั้น กันไม่ให้กด "บันทึก" ซ้ำโดยไม่ได้แก้อะไรแล้วเกิดแถวประวัติขยะเพิ่มเรื่อยๆ
//
// ใช้ connection ตัวเดียวกับที่ทำ insert/update devices (ส่งเข้ามาจากผู้เรียก) เพื่อให้
// อยู่ใน transaction เดียวกัน ถ้าบันทึกเครื่องสำเร็จแต่บันทึกประวัติพัง จะได้ย้อนคืนทั้งคู่
//
// ข้อจำกัดที่ต้องรู้: ยอดพิมพ์ละเอียดสุดแค่ระดับ "เดือน" (v_monthly_kpi.month คือ
// 'YYYY-MM' ไม่มีวันที่) ถ้าย้ายซ้ำภายในเดือนปฏิทินเดียวกัน ยอดทั้งเดือนจะไปตกอยู่กับ
// ช่วงที่ "เปิดอยู่" ตอนดึงรายงาน ส่วนช่วงที่ปิดไปแล้วในเดือนเดียวกันจะได้ 0 แผ่นสำหรับ
// เดือนนั้น — getHistory ติดธง is_same_month_transition ไว้ให้ฝั่งเว็บอธิบายผู้ใช้
async function recordLocationHistory(conn, deviceId, loc) {
  const [[latest]] = await conn.query(
    `SELECT * FROM device_location_history
     WHERE device_id = ? AND effective_to IS NULL
     ORDER BY id DESC LIMIT 1`,
    [deviceId]
  );

  const sameAsLatest =
    latest &&
    latest.building_id === loc.building_id &&
    latest.floor_id === loc.floor_id &&
    (latest.location || null) === (loc.location || null) &&
    latest.division_id === loc.division_id &&
    latest.department_id === loc.department_id;

  if (sameAsLatest) return;

  const today = new Date().toISOString().slice(0, 10);

  if (latest) {
    await conn.query("UPDATE device_location_history SET effective_to = ? WHERE id = ?", [today, latest.id]);
  }

  await conn.query(
    `INSERT INTO device_location_history
       (device_id, building_id, floor_id, location, division_id, department_id, effective_from, effective_to)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
    [deviceId, loc.building_id, loc.floor_id, loc.location, loc.division_id, loc.department_id, today]
  );
}

// ส่งออกให้ import/controller.js เรียกใช้ตอนนำเข้าไฟล์หลายเครื่องพร้อมกัน เพื่อให้
// เครื่องที่มาจากการนำเข้าเปิด "ช่วงประวัติแรก" เหมือนเครื่องที่เพิ่มทีละรายการทุกประการ
exports.recordLocationHistory = recordLocationHistory;

// ============================================================
// POST /api/devices
// ============================================================
exports.create = async (req, res) => {
  const data = req.body;

  const id = await db.withTransaction(async (conn) => {
    const columns = [
      "serial_number",
      "brand_id",
      "model",
      "building_id",
      "floor_id",
      "location",
      "division_id",
      "department_id",
      "contract_id",
      "price_override",
      "status",
    ];

    const [result] = await conn.query(
      `INSERT INTO devices (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
      columns.map((column) => data[column])
    );

    // เครื่องใหม่ยังไม่มีช่วงประวัติเดิม — เปิดช่วง "ปัจจุบัน" แรกให้เลย ไม่งั้น
    // รายงานที่อิงประวัติการย้ายจะมองไม่เห็นเครื่องนี้จนกว่าจะมีการย้ายครั้งแรก
    await recordLocationHistory(conn, result.insertId, data);

    return result.insertId;
  });

  res.status(201).json({ id, serial_number: data.serial_number });
};

// ============================================================
// PUT /api/devices/:id — แก้ไขทรัพย์สินทั่วไป (ไม่แตะที่ตั้ง/สังกัด)
// ============================================================
exports.update = async (req, res) => {
  const { serial_number, brand_id, model, contract_id, price_override, status } = req.body;

  const [result] = await db.query(
    `UPDATE devices
     SET serial_number = ?, brand_id = ?, model = ?, contract_id = ?, price_override = ?, status = ?
     WHERE id = ?`,
    [serial_number, brand_id, model, contract_id, price_override, status, req.params.id]
  );

  if (!result.affectedRows) throw notFound("ไม่พบเครื่องที่ต้องการแก้ไข");

  res.json({ message: "บันทึกการแก้ไขเรียบร้อยแล้ว" });
};

// ============================================================
// PUT /api/devices/:id/move — ย้ายเครื่อง
// ============================================================
exports.move = async (req, res) => {
  const data = req.body;

  await db.withTransaction(async (conn) => {
    const [result] = await conn.query(
      `UPDATE devices
       SET building_id = ?, floor_id = ?, location = ?, division_id = ?, department_id = ?
       WHERE id = ?`,
      [data.building_id, data.floor_id, data.location, data.division_id, data.department_id, req.params.id]
    );

    if (!result.affectedRows) throw notFound("ไม่พบเครื่องที่ต้องการย้าย");

    await recordLocationHistory(conn, req.params.id, data);
  });

  res.json({ message: "ย้ายเครื่องเรียบร้อยแล้ว" });
};

// ============================================================
// GET /api/devices/location-history
// ประวัติการย้ายของ "ทุกเครื่อง" พร้อมกัน — หน้ารายงานใช้แยกยอดพิมพ์เก่า/ใหม่
// ไม่ join กับยอดพิมพ์ที่นี่ เพราะฝั่งเว็บมี v_monthly_kpi ของทุกเครื่องอยู่แล้ว
// ============================================================
exports.getAllLocationHistory = async (req, res) => {
  const [rows] = await db.query(`
    SELECT
      h.id,
      h.device_id,
      h.building_id,
      b.name AS building_name,
      h.floor_id,
      f.name AS floor_name,
      h.location,
      h.division_id,
      divi.name AS division_name,
      h.department_id,
      dept.name AS department_name,
      h.effective_from,
      h.effective_to
    FROM device_location_history h
    LEFT JOIN building b ON h.building_id = b.id
    LEFT JOIN floor f ON h.floor_id = f.id
    LEFT JOIN division divi ON h.division_id = divi.id
    LEFT JOIN department dept ON h.department_id = dept.id
    ORDER BY h.device_id ASC, h.effective_from ASC, h.id ASC
  `);

  cache.operationalData(res);
  res.json(rows);
};

// ============================================================
// GET /api/devices/:id/history
//
// ยอดพิมพ์สะสมต่อ "ช่วง" ที่ตั้ง/สังกัด คำนวณให้ทุกแถวในประวัติ ไม่ใช่แค่ช่วงปัจจุบัน
//
// ขอบเขตช่วงเทียบระดับ "เดือน" ล้วนๆ — ต้องแปลง effective_from/to เป็น 'YYYY-MM'
// ก่อนเทียบ ห้ามเทียบกับวันที่ 1 ของเดือนตรงๆ เพราะถ้า effective_from เป็นวันกลางเดือน
// (ย้ายวันที่ 20) เดือนนั้นจะไม่ตรงเงื่อนไขช่วงไหนเลย ยอดพิมพ์เดือนที่ย้ายจะหายไปทั้งเดือน
// ============================================================
exports.getHistory = async (req, res) => {
  await assertDeviceExists(req.params.id);

  const [rows] = await db.query(
    `
    SELECT
      h.id,
      h.effective_from,
      h.effective_to,
      b.name AS building_name,
      f.name AS floor_name,
      h.location,
      divi.name AS division_name,
      dept.name AS department_name,
      (
        h.effective_to IS NOT NULL
        AND DATE_FORMAT(h.effective_from, '%Y-%m') = DATE_FORMAT(h.effective_to, '%Y-%m')
      ) AS is_same_month_transition,
      COALESCE((
        SELECT SUM(v.net_pages) FROM v_monthly_kpi v
        WHERE v.device_id = h.device_id
          AND v.month >= DATE_FORMAT(h.effective_from, '%Y-%m')
          AND (h.effective_to IS NULL OR v.month < DATE_FORMAT(h.effective_to, '%Y-%m'))
      ), 0) AS total_pages,
      COALESCE((
        SELECT SUM(v.total_cost) FROM v_monthly_kpi v
        WHERE v.device_id = h.device_id
          AND v.month >= DATE_FORMAT(h.effective_from, '%Y-%m')
          AND (h.effective_to IS NULL OR v.month < DATE_FORMAT(h.effective_to, '%Y-%m'))
      ), 0) AS total_cost
    FROM device_location_history h
    LEFT JOIN building b ON h.building_id = b.id
    LEFT JOIN floor f ON h.floor_id = f.id
    LEFT JOIN division divi ON h.division_id = divi.id
    LEFT JOIN department dept ON h.department_id = dept.id
    WHERE h.device_id = ?
    ORDER BY h.effective_from DESC, h.id DESC
    `,
    [req.params.id]
  );

  // mysql2 คืน SUM() ของ DECIMAL เป็น string และคืนนิพจน์ boolean เป็น 0/1
  const history = rows.map((row) => ({
    ...row,
    total_pages: Number(row.total_pages),
    total_cost: Number(row.total_cost),
    is_same_month_transition: Boolean(Number(row.is_same_month_transition)),
  }));

  cache.operationalData(res);
  res.json({ history });
};

// ============================================================
// GET /api/devices/:id/current-usage
// ยอดพิมพ์สะสมของช่วงที่ตั้ง/สังกัดปัจจุบัน — โชว์ในหน้าต่าง "ย้ายเครื่อง" ก่อนย้ายจริง
// ให้รู้ว่าที่เดิมสะสมยอดไว้เท่าไหร่ก่อนจะตัดไปเริ่มช่วงใหม่
// ============================================================
exports.getCurrentUsage = async (req, res) => {
  await assertDeviceExists(req.params.id);

  const [[latest]] = await db.query(
    `SELECT h.*,
       b.name AS building_name,
       f.name AS floor_name,
       divi.name AS division_name,
       dept.name AS department_name
     FROM device_location_history h
     LEFT JOIN building b ON h.building_id = b.id
     LEFT JOIN floor f ON h.floor_id = f.id
     LEFT JOIN division divi ON h.division_id = divi.id
     LEFT JOIN department dept ON h.department_id = dept.id
     WHERE h.device_id = ? AND h.effective_to IS NULL
     ORDER BY h.id DESC LIMIT 1`,
    [req.params.id]
  );

  // ยังไม่เคยมีประวัติเลย (ไม่ควรเกิดถ้าเพิ่มเครื่องผ่านฟอร์มปกติ) — ไม่มียอดให้โชว์
  if (!latest) return res.json({ usage: null });

  const [[usage]] = await db.query(
    `SELECT
       COALESCE(SUM(v.net_pages), 0) AS total_pages,
       COALESCE(SUM(v.total_cost), 0) AS total_cost
     FROM v_monthly_kpi v
     WHERE v.device_id = ? AND v.month >= DATE_FORMAT(?, '%Y-%m')`,
    [req.params.id, latest.effective_from]
  );

  cache.operationalData(res);
  res.json({
    usage: {
      effective_from: latest.effective_from,
      building_name: latest.building_name,
      floor_name: latest.floor_name,
      location: latest.location,
      division_name: latest.division_name,
      department_name: latest.department_name,
      total_pages: Number(usage.total_pages),
      total_cost: Number(usage.total_cost),
    },
  });
};

// ============================================================
// DELETE /api/devices/:id
// ============================================================
exports.remove = async (req, res) => {
  // ยอดพิมพ์ที่เคยบันทึกไว้อ้างถึงเครื่องนี้อยู่ MySQL จะปฏิเสธการลบด้วย foreign key
  // แล้ว error handler กลางแปลงเป็น 409 พร้อมข้อความว่าต้องจัดการของที่อ้างถึงก่อน
  // ซึ่งถูกต้องแล้ว — การลบเครื่องที่มีประวัติค่าใช้จ่ายทิ้งจะทำให้รายงานย้อนหลังเพี้ยน
  const [result] = await db.query("DELETE FROM devices WHERE id = ?", [req.params.id]);
  if (!result.affectedRows) throw notFound("ไม่พบเครื่องที่ต้องการลบ");

  res.json({ message: "ลบเครื่องเรียบร้อยแล้ว" });
};

// ============================================================
// middleware ตรวจข้อมูลของแต่ละเส้นทาง — ประกาศคู่กับ handler เพื่อให้เห็นพร้อมกัน
// ============================================================
exports.validators = {
  list: validate({ query: listQuery }),
  byId: validate({ params: idParam }),
  create: validate({ body: deviceBody }),
  update: validate({ params: idParam, body: updateBody }),
  move: validate({ params: idParam, body: moveBody }),
};
