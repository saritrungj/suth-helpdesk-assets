const db = require("../db");
const { z } = require("zod");

// ============================================================
// Validation Schema
// ============================================================
const deviceSchema = z.object({
  serial_number: z.string().min(1, "Serial number is required"),
  brand_id: z.number().int().positive().optional().nullable(),
  model: z.string().optional().nullable(),
  building_id: z.number().int().positive().optional().nullable(),
  floor_id: z.number().int().positive().optional().nullable(),
  location: z.string().max(255).optional().nullable(),
  division_id: z.number().int().positive().optional().nullable(),
  department_id: z.number().int().positive().optional().nullable(),
  contract_id: z.number().int().positive().optional().nullable(),
  price_override: z.number().nonnegative().optional().nullable(),
  status: z.enum(["active", "repair", "retired"]).optional(),
});

// แก้ไขทรัพย์สิน (ทั่วไป) — ไม่รวมอาคาร/ชั้น/ตำแหน่ง/ฝ่าย/แผนก
// การย้ายเครื่องแยกไปใช้ moveSchema + exports.move ด้านล่างแทน
// เพื่อไม่ให้กด "บันทึก" ที่ฟอร์มแก้ไขทั่วไปเผลอย้ายเครื่อง (และไม่เขียนประวัติการย้ายซ้ำซ้อน)
const updateSchema = deviceSchema.omit({
  building_id: true,
  floor_id: true,
  location: true,
  division_id: true,
  department_id: true,
});

// ย้ายเครื่อง (อาคาร/ชั้น/ตำแหน่ง/ฝ่าย/แผนก) — แยกออกจากการแก้ไขทรัพย์สินทั่วไป
const moveSchema = z.object({
  building_id: z.number().int().positive().optional().nullable(),
  floor_id: z.number().int().positive().optional().nullable(),
  location: z.string().max(255).optional().nullable(),
  division_id: z.number().int().positive().optional().nullable(),
  department_id: z.number().int().positive().optional().nullable(),
});

// ============================================================
// ประวัติการย้าย (device_location_history)
// ============================================================
// เรียกทุกครั้งหลัง insert/update devices เพื่อ "ปิด" ช่วงเดิมที่ยังเปิดอยู่ (effective_to IS NULL)
// แล้วเปิดช่วงใหม่ ถ้าตำแหน่ง/ฝ่าย/แผนกเปลี่ยนไปจากช่วงล่าสุดจริงๆ เท่านั้น — กันไม่ให้กด "บันทึก"
// ซ้ำโดยไม่ได้แก้อะไรแล้วเกิดแถวประวัติขยะเพิ่มขึ้นเรื่อยๆ
//
// ใช้ conn ตัวเดียวกับที่ทำ insert/update devices (ส่งเข้ามาจากผู้เรียก) เพื่อให้อยู่ใน
// transaction เดียวกัน ถ้า insert/update devices สำเร็จแต่บันทึกประวัติพัง จะได้ rollback ทั้งคู่
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

  // effective_from ของช่วงเดิม (ถ้ามี) ต้องมาก่อนวันนี้เท่านั้น ถ้าแก้ไขเครื่องซ้ำในวันเดียวกัน
  // (เช่น แก้ผิดแล้วรีบแก้ใหม่) ให้ "แทนที่" ช่วงล่าสุดแทนการเปิดช่วงใหม่ซ้อนวันเดียวกัน
  const today = new Date().toISOString().slice(0, 10);

  if (latest && latest.effective_from === today) {
    await conn.query(
      `UPDATE device_location_history SET
         building_id=?, floor_id=?, location=?, division_id=?, department_id=?
       WHERE id=?`,
      [loc.building_id, loc.floor_id, loc.location, loc.division_id, loc.department_id, latest.id]
    );
    return;
  }

  if (latest) {
    await conn.query(`UPDATE device_location_history SET effective_to=? WHERE id=?`, [
      today,
      latest.id,
    ]);
  }

  await conn.query(
    `INSERT INTO device_location_history
       (device_id, building_id, floor_id, location, division_id, department_id, effective_from, effective_to)
     VALUES (?,?,?,?,?,?,?,NULL)`,
    [
      deviceId,
      loc.building_id,
      loc.floor_id,
      loc.location,
      loc.division_id,
      loc.department_id,
      today,
    ]
  );
}

// ส่งออกให้ importController.js เรียกใช้ตอนนำเข้าไฟล์หลายเครื่องพร้อมกัน
// เพื่อให้เครื่องที่มาจากการ import ได้เปิด "ช่วงประวัติแรก" เหมือนเครื่องที่เพิ่มทีละรายการทุกประการ
// (กันไม่ให้ logic เปิด/ปิดช่วงประวัติ ไปเขียนซ้ำอีกชุดในอีกไฟล์ แล้วพลาดไม่ตรงกัน)
exports.recordLocationHistory = recordLocationHistory;

// ============================================================
// GET /api/devices

// ============================================================
exports.getAll = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        d.id,
        d.serial_number,
        d.model,
        d.location,
        d.status,
        d.price_override,
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
      ORDER BY d.serial_number
    `);

    res.json(rows);
  } catch (err) {
    console.error("Error fetching devices:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// ============================================================
// GET /api/devices/:id
// ============================================================
exports.getOne = async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT
        d.*,
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
      WHERE d.id = ?
    `,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        error: "Device not found",
      });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("Error fetching device:", err.message);
    res.status(500).json({
      error: err.message,
    });
  }
};

// ============================================================
// POST /api/devices
// ============================================================
exports.create = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const validatedData = deviceSchema.parse(req.body);

    const {
      serial_number,
      brand_id,
      model,
      building_id,
      floor_id,
      location,
      division_id,
      department_id,
      contract_id,
      price_override,
      status,
    } = validatedData;

    await conn.beginTransaction();

    const [result] = await conn.query(
      `
      INSERT INTO devices
      (
        serial_number,
        brand_id,
        model,
        building_id,
        floor_id,
        location,
        division_id,
        department_id,
        contract_id,
        price_override,
        status
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `,
      [
        serial_number,
        brand_id || null,
        model || null,
        building_id || null,
        floor_id || null,
        location?.trim() || null,
        division_id || null,
        department_id || null,
        contract_id || null,
        price_override || null,
        status || "active",
      ]
    );

    // เครื่องใหม่ ยังไม่มีช่วงประวัติเดิม — เปิดช่วง "ปัจจุบัน" แรกให้เลย
    await recordLocationHistory(conn, result.insertId, {
      building_id: building_id || null,
      floor_id: floor_id || null,
      location: location?.trim() || null,
      division_id: division_id || null,
      department_id: department_id || null,
    });

    await conn.commit();

    res.status(201).json({
      id: result.insertId,
      serial_number,
    });
  } catch (err) {
    await conn.rollback();

    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation failed",
        details: err.errors,
      });
    }

    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        error: `Serial number "${req.body.serial_number}" already exists`,
      });
    }

    console.error(err);

    res.status(500).json({
      error: err.message,
    });
  } finally {
    conn.release();
  }
};

// ============================================================
// PUT /api/devices/:id
// ============================================================
exports.update = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const validatedData = updateSchema.parse(req.body);

    const {
      serial_number,
      brand_id,
      model,
      contract_id,
      price_override,
      status,
    } = validatedData;

    await conn.beginTransaction();

    // ไม่แตะอาคาร/ชั้น/ตำแหน่ง/ฝ่าย/แผนก และไม่เขียนประวัติการย้ายที่นี่ —
    // ใช้ PUT /api/devices/:id/move (exports.move) แยกต่างหากสำหรับย้ายเครื่อง
    const [result] = await conn.query(
      `
      UPDATE devices SET
        serial_number=?,
        brand_id=?,
        model=?,
        contract_id=?,
        price_override=?,
        status=?
      WHERE id=?
    `,
      [
        serial_number,
        brand_id || null,
        model || null,
        contract_id || null,
        price_override || null,
        status || "active",
        req.params.id,
      ]
    );

    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({
        error: "Device not found",
      });
    }

    await conn.commit();

    res.json({
      message: "Device updated successfully",
    });
  } catch (err) {
    await conn.rollback();

    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation failed",
        details: err.errors,
      });
    }

    console.error(err);

    res.status(500).json({
      error: err.message,
    });
  } finally {
    conn.release();
  }
};

// ============================================================
// PUT /api/devices/:id/move
// ย้ายเครื่อง (อาคาร/ชั้น/ตำแหน่ง/ฝ่าย/แผนก) — แยกออกจากการแก้ไขทรัพย์สินทั่วไป (exports.update)
// อัปเดตค่า "ปัจจุบัน" ในตาราง devices และเขียนประวัติการย้ายผ่าน recordLocationHistory
// ============================================================
exports.move = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const validatedData = moveSchema.parse(req.body);

    const { building_id, floor_id, location, division_id, department_id } = validatedData;

    await conn.beginTransaction();

    const [result] = await conn.query(
      `
      UPDATE devices SET
        building_id=?,
        floor_id=?,
        location=?,
        division_id=?,
        department_id=?
      WHERE id=?
    `,
      [
        building_id || null,
        floor_id || null,
        location?.trim() || null,
        division_id || null,
        department_id || null,
        req.params.id,
      ]
    );

    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({
        error: "Device not found",
      });
    }

    await recordLocationHistory(conn, req.params.id, {
      building_id: building_id || null,
      floor_id: floor_id || null,
      location: location?.trim() || null,
      division_id: division_id || null,
      department_id: department_id || null,
    });

    await conn.commit();

    res.json({
      message: "Device moved successfully",
    });
  } catch (err) {
    await conn.rollback();

    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation failed",
        details: err.errors,
      });
    }

    console.error(err);

    res.status(500).json({
      error: err.message,
    });
  } finally {
    conn.release();
  }
};

// ============================================================
// GET /api/devices/:id/history
// ประวัติการย้ายอาคาร/ชั้น/ฝ่าย/แผนกของเครื่องนี้ — เรียงล่าสุดก่อน
// ============================================================
exports.getHistory = async (req, res) => {
  try {
    // ยอดพิมพ์สะสม (แผ่นสุทธิ/ค่าใช้จ่าย) ต่อ "ช่วง" ที่ตั้ง/สังกัด — ไม่ใช่แค่ช่วงปัจจุบัน
    // (h.effective_to IS NULL) แบบ getCurrentUsage แต่คำนวณให้ทุกแถวในประวัติ เพื่อรองรับ
    // การย้ายบ่อยๆ แล้วยังย้อนดูยอดพิมพ์สะสมของที่ตั้งเดิมแต่ละช่วงได้
    // ขอบเขตช่วง: v_monthly_kpi.month >= effective_from และ < effective_to (ถ้ายังเปิดอยู่ไม่จำกัดบน)
    // ใช้ตรรกะเดียวกับ exports.getCurrentUsage เพื่อให้ตัวเลขตรงกัน
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
        COALESCE((
          SELECT SUM(v.net_pages)
          FROM v_monthly_kpi v
          WHERE v.device_id = h.device_id
            AND STR_TO_DATE(CONCAT(v.month, '-01'), '%Y-%m-%d') >= h.effective_from
            AND (
              h.effective_to IS NULL
              OR STR_TO_DATE(CONCAT(v.month, '-01'), '%Y-%m-%d') < h.effective_to
            )
        ), 0) AS total_pages,
        COALESCE((
          SELECT SUM(v.total_cost)
          FROM v_monthly_kpi v
          WHERE v.device_id = h.device_id
            AND STR_TO_DATE(CONCAT(v.month, '-01'), '%Y-%m-%d') >= h.effective_from
            AND (
              h.effective_to IS NULL
              OR STR_TO_DATE(CONCAT(v.month, '-01'), '%Y-%m-%d') < h.effective_to
            )
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

    // mysql2 คืนค่า SUM() เป็น string เมื่อมาจาก DECIMAL — แปลงเป็น number ให้ frontend ใช้ตรงๆ
    const history = rows.map((row) => ({
      ...row,
      total_pages: Number(row.total_pages),
      total_cost: Number(row.total_cost),
    }));

    res.json({ history });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: err.message,
    });
  }
};

// ============================================================
// GET /api/devices/:id/current-usage
// ยอดพิมพ์สะสม (แผ่นสุทธิ/ค่าใช้จ่าย) ของเครื่องนี้ นับตั้งแต่ช่วงที่ตั้ง/สังกัดปัจจุบัน
// (effective_to IS NULL) เริ่มต้น — ใช้โชว์ในหน้าต่าง "ย้ายเครื่อง" ก่อนย้ายจริง
// ให้รู้ว่าที่เดิมสะสมยอดพิมพ์ไว้เท่าไหร่แล้วก่อนจะตัดไปเริ่มช่วงใหม่
// คำนวณแบบเดียวกับรายงาน "ยอดพิมพ์แยกตามฝ่าย/แผนก" (v_monthly_kpi + device_location_history)
// เพื่อให้ตัวเลขตรงกัน
// ============================================================
exports.getCurrentUsage = async (req, res) => {
  try {
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

    // ยังไม่เคยมีประวัติเลย (ไม่ควรเกิดขึ้นถ้าเพิ่มเครื่องผ่านฟอร์มปกติ) — ไม่มียอดให้โชว์
    if (!latest) {
      return res.json({ usage: null });
    }

    const [[usage]] = await db.query(
      `SELECT
         COALESCE(SUM(v.net_pages), 0) AS total_pages,
         COALESCE(SUM(v.total_cost), 0) AS total_cost
       FROM v_monthly_kpi v
       WHERE v.device_id = ?
         AND STR_TO_DATE(CONCAT(v.month, '-01'), '%Y-%m-%d') >= ?`,
      [req.params.id, latest.effective_from]
    );

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
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: err.message,
    });
  }
};

// ============================================================
// DELETE /api/devices/:id
// ============================================================
exports.remove = async (req, res) => {
  try {
    const [result] = await db.query(
      "DELETE FROM devices WHERE id=?",
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        error: "Device not found",
      });
    }

    res.json({
      message: "Device deleted successfully",
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: err.message,
    });
  }
};