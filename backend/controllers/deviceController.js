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
  division_id: z.number().int().positive().optional().nullable(),
  department_id: z.number().int().positive().optional().nullable(),
  contract_id: z.number().int().positive().optional().nullable(),
  price_override: z.number().nonnegative().optional().nullable(),
  status: z.enum(["active", "repair", "retired"]).optional().nullable(),
});

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
        d.price_override,
        d.status,
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
      ORDER BY d.id
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
  try {
    const validatedData = deviceSchema.parse(req.body);

    const {
      serial_number,
      brand_id,
      model,
      building_id,
      floor_id,
      division_id,
      department_id,
      contract_id,
      price_override,
      status,
    } = validatedData;

    const [result] = await db.query(
      `
      INSERT INTO devices
      (
        serial_number,
        brand_id,
        model,
        building_id,
        floor_id,
        division_id,
        department_id,
        contract_id,
        price_override,
        status
      )
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `,
      [
        serial_number,
        brand_id || null,
        model || null,
        building_id || null,
        floor_id || null,
        division_id || null,
        department_id || null,
        contract_id || null,
        price_override || null,
        status || "active",
      ]
    );

    res.status(201).json({
      id: result.insertId,
      serial_number,
    });
  } catch (err) {
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
  }
};

// ============================================================
// PUT /api/devices/:id
// ============================================================
exports.update = async (req, res) => {
  try {
    const validatedData = deviceSchema.parse(req.body);

    const {
      serial_number,
      brand_id,
      model,
      building_id,
      floor_id,
      division_id,
      department_id,
      contract_id,
      price_override,
      status,
    } = validatedData;

    const [result] = await db.query(
      `
      UPDATE devices SET
        serial_number=?,
        brand_id=?,
        model=?,
        building_id=?,
        floor_id=?,
        division_id=?,
        department_id=?,
        contract_id=?,
        price_override=?,
        status=?
      WHERE id=?
    `,
      [
        serial_number,
        brand_id || null,
        model || null,
        building_id || null,
        floor_id || null,
        division_id || null,
        department_id || null,
        contract_id || null,
        price_override || null,
        status || "active",
        req.params.id,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        error: "Device not found",
      });
    }

    res.json({
      message: "Device updated successfully",
    });
  } catch (err) {
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
    if (err.code === "ER_ROW_IS_REFERENCED_2") {
      return res.status(409).json({
        error: "ลบไม่ได้ เพราะเครื่องนี้มียอดพิมพ์บันทึกอยู่",
      });
    }

    console.error(err);

    res.status(500).json({
      error: err.message,
    });
  }
};