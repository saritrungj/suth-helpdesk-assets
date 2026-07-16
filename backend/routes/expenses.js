const express = require('express');
const router = express.Router();
const db = require('../db');

// ============================================================
// Expenses API — ค่าใช้จ่ายแบบโครงสร้างต้นไม้
// ปีงบประมาณ → สัญญา → เครื่อง → ค่าใช้จ่ายรายเดือน
// ============================================================

// GET /api/expenses/tree
router.get('/tree', async (req, res) => {
  try {
    const [years] = await db.query('SELECT id, year FROM fiscal_year ORDER BY year DESC');

    const [contracts] = await db.query(`
      SELECT id, contract_no, fiscal_year_id, price_per_page
      FROM contracts
      ORDER BY contract_no
    `);

    const [devices] = await db.query(`
      SELECT
        d.id,
        d.serial_number,
        d.model,
        d.status,
        d.contract_id,
        br.name AS brand_name,
        COALESCE(d.price_override, c.price_per_page, 0) AS cost_per_page
      FROM devices d
      LEFT JOIN brand br ON d.brand_id = br.id
      LEFT JOIN contracts c ON d.contract_id = c.id
      WHERE d.contract_id IS NOT NULL
      ORDER BY d.serial_number
    `);

    // ยอดพิมพ์รายเดือนต่อเครื่อง (สุทธิ = pages * 0.8 ตามสูตรเดียวกับ views)
    const [monthly] = await db.query(`
      SELECT
        pt.device_id,
        pt.month,
        SUM(pt.pages) AS pages,
        SUM(pt.pages * 0.8) AS net_pages,
        SUM(pt.pages * 0.8 * COALESCE(d.price_override, c.price_per_page, 0)) AS total_cost
      FROM print_transactions pt
      JOIN devices d ON pt.device_id = d.id
      LEFT JOIN contracts c ON d.contract_id = c.id
      GROUP BY pt.device_id, pt.month
      ORDER BY pt.month
    `);

    // ประกอบเป็นต้นไม้ พร้อมยอดรวมสะสมทุกระดับ
    const monthsByDevice = {};
    for (const m of monthly) {
      if (!monthsByDevice[m.device_id]) monthsByDevice[m.device_id] = [];
      monthsByDevice[m.device_id].push({
        month: m.month,
        pages: Number(m.pages),
        net_pages: Number(m.net_pages),
        total_cost: Number(m.total_cost)
      });
    }

    const devicesByContract = {};
    for (const d of devices) {
      const months = monthsByDevice[d.id] || [];
      const node = {
        id: d.id,
        serial_number: d.serial_number,
        model: d.model,
        status: d.status,
        brand_name: d.brand_name,
        cost_per_page: Number(d.cost_per_page),
        months,
        total_net_pages: months.reduce((s, m) => s + m.net_pages, 0),
        total_cost: months.reduce((s, m) => s + m.total_cost, 0)
      };
      if (!devicesByContract[d.contract_id]) devicesByContract[d.contract_id] = [];
      devicesByContract[d.contract_id].push(node);
    }

    const contractsByYear = {};
    for (const c of contracts) {
      const deviceNodes = devicesByContract[c.id] || [];
      const node = {
        id: c.id,
        contract_no: c.contract_no,
        price_per_page: c.price_per_page === null ? null : Number(c.price_per_page),
        devices: deviceNodes,
        device_count: deviceNodes.length,
        total_net_pages: deviceNodes.reduce((s, d) => s + d.total_net_pages, 0),
        total_cost: deviceNodes.reduce((s, d) => s + d.total_cost, 0)
      };
      const key = c.fiscal_year_id === null ? 'none' : c.fiscal_year_id;
      if (!contractsByYear[key]) contractsByYear[key] = [];
      contractsByYear[key].push(node);
    }

    const tree = years.map((y) => {
      const contractNodes = contractsByYear[y.id] || [];
      return {
        id: y.id,
        year: y.year,
        contracts: contractNodes,
        contract_count: contractNodes.length,
        total_net_pages: contractNodes.reduce((s, c) => s + c.total_net_pages, 0),
        total_cost: contractNodes.reduce((s, c) => s + c.total_cost, 0)
      };
    });

    // สัญญาที่ยังไม่ผูกปีงบประมาณ
    if (contractsByYear['none']) {
      const contractNodes = contractsByYear['none'];
      tree.push({
        id: null,
        year: 'ไม่ระบุปีงบประมาณ',
        contracts: contractNodes,
        contract_count: contractNodes.length,
        total_net_pages: contractNodes.reduce((s, c) => s + c.total_net_pages, 0),
        total_cost: contractNodes.reduce((s, c) => s + c.total_cost, 0)
      });
    }

    res.json(tree);
  } catch (err) {
    console.error('Error building expense tree:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
