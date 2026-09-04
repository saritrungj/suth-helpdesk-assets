const express = require('express');
const router = express.Router();
const db = require('../db');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

// ต้อง login ก่อนถึงจะเรียก master data ได้ (เดิมไม่มีการป้องกันเลย)
router.use(authMiddleware);

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

  // POST — create (admin เท่านั้น)
  router.post(routePath, adminMiddleware, async (req, res) => {
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

  // PUT — update (admin เท่านั้น)
  router.put(`${routePath}/:id`, adminMiddleware, async (req, res) => {
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

  // DELETE (admin เท่านั้น)
  router.delete(`${routePath}/:id`, adminMiddleware, async (req, res) => {
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

// Helper: CRUD สำหรับ lookup table ที่มี parent (foreign key) เช่น floor -> building
function registerChildLookup(tableName, routePath, parentField) {

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

  // POST — create (admin เท่านั้น, ต้องมีทั้งชื่อและ parent id)
  router.post(routePath, adminMiddleware, async (req, res) => {
    try {
      const { name } = req.body;
      const parentId = req.body[parentField];

      if (!name) return res.status(400).json({ error: 'name is required' });
      if (!parentId) return res.status(400).json({ error: `${parentField} is required` });

      const [result] = await db.query(
        `INSERT INTO \`${tableName}\` (\`${parentField}\`, name) VALUES (?, ?)`,
        [parentId, name.trim()]
      );

      res.status(201).json({ id: result.insertId, [parentField]: parentId, name: name.trim() });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: `"${req.body.name}" already exists in ${tableName}` });
      }
      console.error(`Error creating ${tableName}:`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // PUT — update (admin เท่านั้น, แก้ทั้งชื่อและ parent id)
  router.put(`${routePath}/:id`, adminMiddleware, async (req, res) => {
    try {
      const { name } = req.body;
      const parentId = req.body[parentField];

      if (!name) return res.status(400).json({ error: 'name is required' });
      if (!parentId) return res.status(400).json({ error: `${parentField} is required` });

      const [result] = await db.query(
        `UPDATE \`${tableName}\` SET \`${parentField}\` = ?, name = ? WHERE id = ?`,
        [parentId, name.trim(), req.params.id]
      );

      if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
      res.json({ id: parseInt(req.params.id), [parentField]: parentId, name: name.trim() });
    } catch (err) {
      console.error(`Error updating ${tableName}:`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE (admin เท่านั้น)
  router.delete(`${routePath}/:id`, adminMiddleware, async (req, res) => {
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
registerLookup('division', '/divisions');

// floor และ department มี foreign key ผูกกับตารางแม่ (building / division)
// ต้องใช้ registerChildLookup แทน registerLookup ธรรมดา
// (registerLookup เดิมบันทึกแค่ name ทำให้ building_id / division_id หายไปทุกครั้ง)
registerChildLookup('floor', '/floors', 'building_id');
registerChildLookup('department', '/departments', 'division_id');

// fiscal_year uses "year" column instead of "name"
const { getFiscalYearRange } = require('../utils/fiscalYear');

router.get('/fiscal-years', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM fiscal_year ORDER BY year');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/fiscal-years', adminMiddleware, async (req, res) => {
  try {
    const { year } = req.body;
    if (!year) return res.status(400).json({ error: 'year is required' });

    // คำนวณช่วงเดือน (ต.ค.-ก.ย.) ของปีงบนี้เก็บไว้เลยตอนสร้าง แทนที่จะให้แต่ละหน้าไปเดาเอาเอง
    const { startMonth, endMonth } = getFiscalYearRange(year.trim());

    const [result] = await db.query(
      'INSERT INTO fiscal_year (year, start_month, end_month) VALUES (?, ?, ?)',
      [year.trim(), startMonth, endMonth]
    );
    res.status(201).json({
      id: result.insertId,
      year: year.trim(),
      start_month: startMonth,
      end_month: endMonth,
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: `Fiscal year "${req.body.year}" already exists` });
    }
    res.status(500).json({ error: err.message });
  }
});

// เดิมหน้า admin/FiscalYear.vue เรียก PUT/DELETE อยู่แล้ว แต่ backend ไม่เคยมี route
// นี้มาก่อน ทำให้แก้ไข/ลบปีงบประมาณจากหน้า Admin ได้ 404 เสมอ
router.put('/fiscal-years/:id', adminMiddleware, async (req, res) => {
  try {
    const { year } = req.body;
    if (!year) return res.status(400).json({ error: 'year is required' });

    // แก้เลขปีงบแล้ว ช่วงเดือนต้องคำนวณใหม่ให้ตรงกันด้วย ไม่งั้นจะค้างช่วงเดือนของปีเก่าไว้
    const { startMonth, endMonth } = getFiscalYearRange(year.trim());

    const [result] = await db.query(
      'UPDATE fiscal_year SET year = ?, start_month = ?, end_month = ? WHERE id = ?',
      [year.trim(), startMonth, endMonth, req.params.id]
    );

    if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
    res.json({
      id: parseInt(req.params.id),
      year: year.trim(),
      start_month: startMonth,
      end_month: endMonth,
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: `Fiscal year "${req.body.year}" already exists` });
    }
    res.status(500).json({ error: err.message });
  }
});

router.delete('/fiscal-years/:id', adminMiddleware, async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM fiscal_year WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;