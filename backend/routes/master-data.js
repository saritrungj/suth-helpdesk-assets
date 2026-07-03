const express = require('express');
const router = express.Router();
const db = require('../db');

// ============================================================
// Master Data API — brand, building, floor, division, department, fiscal_year
// ============================================================

// Helper: สร้าง CRUD สำหรับแต่ละ lookup table
function registerLookup(tableName, routePath) {

  // GET all
  router.get(routePath, async (req, res) => {
    try {
      const [rows] = await db.query(`SELECT * FROM \`${tableName}\` ORDER BY id`);
      res.json(rows);
    } catch (err) {
      console.error(`Error fetching ${tableName}:`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // GET by id
  router.get(`${routePath}/:id`, async (req, res) => {
    try {
      const [rows] = await db.query(`SELECT * FROM \`${tableName}\` WHERE id = ?`, [req.params.id]);
      if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
      res.json(rows[0]);
    } catch (err) {
      console.error(`Error fetching ${tableName}:`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST — create
  router.post(routePath, async (req, res) => {
    try {
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: 'name is required' });

      const [result] = await db.query(`INSERT INTO \`${tableName}\` (name) VALUES (?)`, [name.trim()]);
      res.status(201).json({ id: result.insertId, name: name.trim() });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: `"${req.body.name}" already exists in ${tableName}` });
      }
      console.error(`Error creating ${tableName}:`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // PUT — update
  router.put(`${routePath}/:id`, async (req, res) => {
    try {
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: 'name is required' });

      const [result] = await db.query(`UPDATE \`${tableName}\` SET name = ? WHERE id = ?`, [name.trim(), req.params.id]);
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
      res.json({ id: parseInt(req.params.id), name: name.trim() });
    } catch (err) {
      console.error(`Error updating ${tableName}:`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE
  router.delete(`${routePath}/:id`, async (req, res) => {
    try {
      const [result] = await db.query(`DELETE FROM \`${tableName}\` WHERE id = ?`, [req.params.id]);
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
      res.json({ message: 'Deleted successfully' });
    } catch (err) {
      console.error(`Error deleting ${tableName}:`, err.message);
      res.status(500).json({ error: err.message });
    }
  });
}

// Register all lookup tables
registerLookup('brand', '/brands');
registerLookup('building', '/buildings');
registerLookup('floor', '/floors');
registerLookup('division', '/divisions');
registerLookup('department', '/departments');

// fiscal_year uses "year" column instead of "name"
router.get('/fiscal-years', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM fiscal_year ORDER BY year');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/fiscal-years', async (req, res) => {
  try {
    const { year } = req.body;
    if (!year) return res.status(400).json({ error: 'year is required' });

    const [result] = await db.query('INSERT INTO fiscal_year (year) VALUES (?)', [year.trim()]);
    res.status(201).json({ id: result.insertId, year: year.trim() });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: `Fiscal year "${req.body.year}" already exists` });
    }
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
