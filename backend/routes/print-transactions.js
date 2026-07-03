const express = require('express');
const router = express.Router();
const db = require('../db');

// ============================================================
// Print Transactions API — ยอดพิมพ์รายเดือน
// ============================================================

// GET /api/print-transactions — ดึงยอดพิมพ์ทั้งหมด (รองรับ filter)
// Query params: ?device_id=1&month=2025-01
router.get('/', async (req, res) => {
  try {
    let sql = `
      SELECT 
        pt.id,
        pt.device_id,
        pt.month,
        pt.pages,
        d.serial_number
      FROM print_transactions pt
      JOIN devices d ON pt.device_id = d.id
    `;
    const params = [];
    const conditions = [];

    if (req.query.device_id) {
      conditions.push('pt.device_id = ?');
      params.push(req.query.device_id);
    }
    if (req.query.month) {
      conditions.push('pt.month = ?');
      params.push(req.query.month);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY pt.month DESC, pt.id';

    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching print transactions:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/print-transactions/:id — ดึงยอดพิมพ์ตัวเดียว
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT pt.*, d.serial_number
      FROM print_transactions pt
      JOIN devices d ON pt.device_id = d.id
      WHERE pt.id = ?
    `, [req.params.id]);

    if (rows.length === 0) return res.status(404).json({ error: 'Transaction not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching print transaction:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/print-transactions — เพิ่มยอดพิมพ์
router.post('/', async (req, res) => {
  try {
    const { device_id, month, pages } = req.body;

    if (!device_id || !month) {
      return res.status(400).json({ error: 'device_id and month are required' });
    }

    const [result] = await db.query(
      'INSERT INTO print_transactions (device_id, month, pages) VALUES (?, ?, ?)',
      [device_id, month, pages || 0]
    );

    res.status(201).json({ id: result.insertId, device_id, month, pages: pages || 0 });
  } catch (err) {
    console.error('Error creating print transaction:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/print-transactions/:id — แก้ไขยอดพิมพ์
router.put('/:id', async (req, res) => {
  try {
    const { device_id, month, pages } = req.body;

    const [result] = await db.query(
      'UPDATE print_transactions SET device_id = ?, month = ?, pages = ? WHERE id = ?',
      [device_id, month, pages || 0, req.params.id]
    );

    if (result.affectedRows === 0) return res.status(404).json({ error: 'Transaction not found' });
    res.json({ message: 'Transaction updated successfully' });
  } catch (err) {
    console.error('Error updating print transaction:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/print-transactions/:id — ลบยอดพิมพ์
router.delete('/:id', async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM print_transactions WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Transaction not found' });
    res.json({ message: 'Transaction deleted successfully' });
  } catch (err) {
    console.error('Error deleting print transaction:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
