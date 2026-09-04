const express = require('express');
const router = express.Router();
const db = require('../shared/db');
const authMiddleware = require('../auth/require-auth');
const adminMiddleware = require('../auth/require-admin');

router.use(authMiddleware);

// ============================================================
// Contracts API — CRUD สำหรับสัญญา
// ============================================================

// GET /api/contracts — ดึงรายการสัญญาทั้งหมด (JOIN กับ fiscal_year)
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        c.id,
        c.contract_no,
        c.price_per_page,
        fy.year AS fiscal_year,
        c.fiscal_year_id
      FROM contracts c
      LEFT JOIN fiscal_year fy ON c.fiscal_year_id = fy.id
      ORDER BY fy.year, c.contract_no
    `);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching contracts:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/contracts/:id — ดึงสัญญาตัวเดียว
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        c.*,
        fy.year AS fiscal_year
      FROM contracts c
      LEFT JOIN fiscal_year fy ON c.fiscal_year_id = fy.id
      WHERE c.id = ?
    `, [req.params.id]);

    if (rows.length === 0) return res.status(404).json({ error: 'Contract not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching contract:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/contracts — เพิ่มสัญญาใหม่ (admin เท่านั้น)
router.post('/', adminMiddleware, async (req, res) => {
  try {
    const { contract_no, fiscal_year_id, price_per_page } = req.body;

    if (!contract_no) return res.status(400).json({ error: 'contract_no is required' });

    const [result] = await db.query(
      'INSERT INTO contracts (contract_no, fiscal_year_id, price_per_page) VALUES (?, ?, ?)',
      [contract_no, fiscal_year_id || null, price_per_page || null]
    );

    res.status(201).json({ id: result.insertId, contract_no });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: `Contract "${req.body.contract_no}" already exists` });
    }
    console.error('Error creating contract:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/contracts/:id — แก้ไขสัญญา (admin เท่านั้น)
router.put('/:id', adminMiddleware, async (req, res) => {
  try {
    const { contract_no, fiscal_year_id, price_per_page } = req.body;

    const [result] = await db.query(
      'UPDATE contracts SET contract_no = ?, fiscal_year_id = ?, price_per_page = ? WHERE id = ?',
      [contract_no, fiscal_year_id || null, price_per_page || null, req.params.id]
    );

    if (result.affectedRows === 0) return res.status(404).json({ error: 'Contract not found' });
    res.json({ message: 'Contract updated successfully' });
  } catch (err) {
    console.error('Error updating contract:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/contracts/:id — ลบสัญญา (admin เท่านั้น)
router.delete('/:id', adminMiddleware, async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM contracts WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Contract not found' });
    res.json({ message: 'Contract deleted successfully' });
  } catch (err) {
    console.error('Error deleting contract:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;