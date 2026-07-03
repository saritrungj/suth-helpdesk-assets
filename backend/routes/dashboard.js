const express = require('express');
const router = express.Router();
const db = require('../db');

// ============================================================
// Dashboard API — ดึงข้อมูลจาก SQL Views สำหรับ Dashboard
// ============================================================

// GET /api/dashboard/monthly-kpi — ดึงจาก v_monthly_kpi
// Query params: ?month=2025-01&device_id=1
router.get('/monthly-kpi', async (req, res) => {
  try {
    let sql = 'SELECT * FROM v_monthly_kpi';
    const params = [];
    const conditions = [];

    if (req.query.month) {
      conditions.push('month = ?');
      params.push(req.query.month);
    }
    if (req.query.device_id) {
      conditions.push('device_id = ?');
      params.push(req.query.device_id);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY month DESC';

    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching monthly KPI:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/summary-by-building — ดึงจาก v_summary_by_building
router.get('/summary-by-building', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM v_summary_by_building ORDER BY total_building_cost DESC');
    res.json(rows);
  } catch (err) {
    console.error('Error fetching summary by building:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/compare — ดึงจาก v_compare_usage_costs (รองรับ filter)
// Query params: ?fiscal_year=2567&building_name=xxx&department_name=xxx&division_name=xxx
router.get('/compare', async (req, res) => {
  try {
    let sql = 'SELECT * FROM v_compare_usage_costs';
    const params = [];
    const conditions = [];

    if (req.query.fiscal_year) {
      conditions.push('fiscal_year = ?');
      params.push(req.query.fiscal_year);
    }
    if (req.query.building_name) {
      conditions.push('building_name = ?');
      params.push(req.query.building_name);
    }
    if (req.query.department_name) {
      conditions.push('department_name = ?');
      params.push(req.query.department_name);
    }
    if (req.query.division_name) {
      conditions.push('division_name = ?');
      params.push(req.query.division_name);
    }
    if (req.query.month) {
      conditions.push('month = ?');
      params.push(req.query.month);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY month, serial_number';

    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching compare data:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/stats — สถิติรวมสำหรับ Dashboard cards
router.get('/stats', async (req, res) => {
  try {
    const [[deviceCount]] = await db.query('SELECT COUNT(*) AS total_devices FROM devices');
    const [[contractCount]] = await db.query('SELECT COUNT(*) AS total_contracts FROM contracts');
    const [[transactionStats]] = await db.query(`
      SELECT 
        COUNT(*) AS total_transactions,
        COALESCE(SUM(pages), 0) AS total_pages
      FROM print_transactions
    `);

    res.json({
      total_devices: deviceCount.total_devices,
      total_contracts: contractCount.total_contracts,
      total_transactions: transactionStats.total_transactions,
      total_pages: transactionStats.total_pages
    });
  } catch (err) {
    console.error('Error fetching dashboard stats:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
