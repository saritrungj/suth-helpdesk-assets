const express = require('express');
const router = express.Router();
const db = require('../db');

// ============================================================
// Devices API — CRUD สำหรับอุปกรณ์ (เครื่องพิมพ์ ฯลฯ)
// ============================================================

// GET /api/devices — ดึงรายการอุปกรณ์ทั้งหมด (JOIN กับ Master Data)
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        d.id,
        d.serial_number,
        d.model,
        d.price_override,
        br.name   AS brand_name,
        b.name    AS building_name,
        f.name    AS floor_name,
        divi.name AS division_name,
        dept.name AS department_name,
        c.contract_no,
        c.price_per_page,
        fy.year   AS fiscal_year
      FROM devices d
      LEFT JOIN brand br       ON d.brand_id = br.id
      LEFT JOIN building b     ON d.building_id = b.id
      LEFT JOIN floor f        ON d.floor_id = f.id
      LEFT JOIN division divi  ON d.division_id = divi.id
      LEFT JOIN department dept ON d.department_id = dept.id
      LEFT JOIN contracts c    ON d.contract_id = c.id
      LEFT JOIN fiscal_year fy ON c.fiscal_year_id = fy.id
      ORDER BY d.id
    `);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching devices:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/devices/:id — ดึงอุปกรณ์ตัวเดียว
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        d.*,
        br.name   AS brand_name,
        b.name    AS building_name,
        f.name    AS floor_name,
        divi.name AS division_name,
        dept.name AS department_name,
        c.contract_no,
        c.price_per_page,
        fy.year   AS fiscal_year
      FROM devices d
      LEFT JOIN brand br       ON d.brand_id = br.id
      LEFT JOIN building b     ON d.building_id = b.id
      LEFT JOIN floor f        ON d.floor_id = f.id
      LEFT JOIN division divi  ON d.division_id = divi.id
      LEFT JOIN department dept ON d.department_id = dept.id
      LEFT JOIN contracts c    ON d.contract_id = c.id
      LEFT JOIN fiscal_year fy ON c.fiscal_year_id = fy.id
      WHERE d.id = ?
    `, [req.params.id]);

    if (rows.length === 0) return res.status(404).json({ error: 'Device not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching device:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/devices — เพิ่มอุปกรณ์ใหม่
router.post('/', async (req, res) => {
  try {
    const { serial_number, brand_id, model, building_id, floor_id, division_id, department_id, contract_id, price_override } = req.body;

    if (!serial_number) return res.status(400).json({ error: 'serial_number is required' });

    const [result] = await db.query(
      `INSERT INTO devices (serial_number, brand_id, model, building_id, floor_id, division_id, department_id, contract_id, price_override)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [serial_number, brand_id || null, model || null, building_id || null, floor_id || null, division_id || null, department_id || null, contract_id || null, price_override || null]
    );

    res.status(201).json({ id: result.insertId, serial_number });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: `Serial number "${req.body.serial_number}" already exists` });
    }
    console.error('Error creating device:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/devices/:id — แก้ไขอุปกรณ์
router.put('/:id', async (req, res) => {
  try {
    const { serial_number, brand_id, model, building_id, floor_id, division_id, department_id, contract_id, price_override } = req.body;

    const [result] = await db.query(
      `UPDATE devices SET 
        serial_number = ?, brand_id = ?, model = ?, building_id = ?, floor_id = ?, 
        division_id = ?, department_id = ?, contract_id = ?, price_override = ?
       WHERE id = ?`,
      [serial_number, brand_id || null, model || null, building_id || null, floor_id || null, division_id || null, department_id || null, contract_id || null, price_override || null, req.params.id]
    );

    if (result.affectedRows === 0) return res.status(404).json({ error: 'Device not found' });
    res.json({ message: 'Device updated successfully' });
  } catch (err) {
    console.error('Error updating device:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/devices/:id — ลบอุปกรณ์
router.delete('/:id', async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM devices WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Device not found' });
    res.json({ message: 'Device deleted successfully' });
  } catch (err) {
    console.error('Error deleting device:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
