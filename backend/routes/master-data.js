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
      if (err.code === 'ER_ROW_IS_REFERENCED_2') {
        return res.status(409).json({ error: `ลบไม่ได้ เพราะมีข้อมูลอื่นอ้างอิง ${tableName} รายการนี้อยู่` });
      }
      console.error(`Error deleting ${tableName}:`, err.message);
      res.status(500).json({ error: err.message });
    }
  });
}

// Helper: CRUD สำหรับ lookup ที่ผูกกับตารางแม่ (floor→building, department→division)
function registerChildLookup(tableName, routePath, parentCol, parentTable) {

  // GET all — JOIN ชื่อตารางแม่ และ filter ด้วย ?<parentCol>=id ได้
  router.get(routePath, async (req, res) => {
    try {
      let sql = `
        SELECT t.*, p.name AS ${parentTable}_name
        FROM \`${tableName}\` t
        LEFT JOIN \`${parentTable}\` p ON t.\`${parentCol}\` = p.id
      `;
      const params = [];
      if (req.query[parentCol]) {
        sql += ` WHERE t.\`${parentCol}\` = ?`;
        params.push(req.query[parentCol]);
      }
      sql += ' ORDER BY t.id';

      const [rows] = await db.query(sql, params);
      res.json(rows);
    } catch (err) {
      console.error(`Error fetching ${tableName}:`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST — create (name + parent id)
  router.post(routePath, async (req, res) => {
    try {
      const { name } = req.body;
      const parentId = req.body[parentCol];
      if (!name) return res.status(400).json({ error: 'name is required' });

      const [result] = await db.query(
        `INSERT INTO \`${tableName}\` (name, \`${parentCol}\`) VALUES (?, ?)`,
        [name.trim(), parentId || null]
      );
      res.status(201).json({ id: result.insertId, name: name.trim(), [parentCol]: parentId || null });
    } catch (err) {
      console.error(`Error creating ${tableName}:`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // PUT — update (name + parent id)
  router.put(`${routePath}/:id`, async (req, res) => {
    try {
      const { name } = req.body;
      const parentId = req.body[parentCol];
      if (!name) return res.status(400).json({ error: 'name is required' });

      const [result] = await db.query(
        `UPDATE \`${tableName}\` SET name = ?, \`${parentCol}\` = ? WHERE id = ?`,
        [name.trim(), parentId || null, req.params.id]
      );
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
      res.json({ id: parseInt(req.params.id), name: name.trim(), [parentCol]: parentId || null });
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
      if (err.code === 'ER_ROW_IS_REFERENCED_2') {
        return res.status(409).json({ error: `ลบไม่ได้ เพราะมีข้อมูลอื่นอ้างอิง ${tableName} รายการนี้อยู่` });
      }
      console.error(`Error deleting ${tableName}:`, err.message);
      res.status(500).json({ error: err.message });
    }
  });
}

// Register all lookup tables
registerLookup('brand', '/brands');
registerLookup('building', '/buildings');
registerLookup('division', '/divisions');
registerChildLookup('floor', '/floors', 'building_id', 'building');
registerChildLookup('department', '/departments', 'division_id', 'division');

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

router.put('/fiscal-years/:id', async (req, res) => {
  try {
    const { year } = req.body;
    if (!year) return res.status(400).json({ error: 'year is required' });

    const [result] = await db.query('UPDATE fiscal_year SET year = ? WHERE id = ?', [year.trim(), req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ id: parseInt(req.params.id), year: year.trim() });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: `Fiscal year "${req.body.year}" already exists` });
    }
    res.status(500).json({ error: err.message });
  }
});

router.delete('/fiscal-years/:id', async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM fiscal_year WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ error: 'ลบไม่ได้ เพราะมีสัญญาที่อ้างอิงปีงบประมาณนี้อยู่' });
    }
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
