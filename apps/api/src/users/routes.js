const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const db = require('../shared/db');
const authMiddleware = require('../auth/require-auth');
const adminMiddleware = require('../auth/require-admin');

// ============================================================
// User Management API — เฉพาะ admin เท่านั้นที่เข้าหน้านี้ได้ทั้งหมด
// (ต่างจาก master-data.js ที่ GET เปิดให้ user ทุก role อ่านได้)
// ============================================================
router.use(authMiddleware);
router.use(adminMiddleware);

const VALID_ROLES = ['admin', 'staff', 'viewer'];

// ไม่ส่ง password (hash) กลับไปให้ frontend ไม่ว่ากรณีใดๆ
const SAFE_FIELDS = 'id, username, role, created_at';

// GET all
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT ${SAFE_FIELDS} FROM users ORDER BY id`
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching users:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST — create
router.post('/', async (req, res) => {
  try {
    const { username, password, role } = req.body;

    if (!username || !username.trim()) {
      return res.status(400).json({ error: 'username is required' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'password ต้องมีอย่างน้อย 6 ตัวอักษร' });
    }
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `role ต้องเป็นหนึ่งใน ${VALID_ROLES.join(', ')}` });
    }

    const hash = await bcrypt.hash(password, 10);

    const [result] = await db.query(
      'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
      [username.trim(), hash, role]
    );

    res.status(201).json({
      id: result.insertId,
      username: username.trim(),
      role,
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: `Username "${req.body.username}" มีอยู่ในระบบแล้ว` });
    }
    console.error('Error creating user:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT — update (username / role เสมอ, password แก้เฉพาะตอนกรอกมาเท่านั้น)
router.put('/:id', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    const targetId = parseInt(req.params.id);

    if (!username || !username.trim()) {
      return res.status(400).json({ error: 'username is required' });
    }
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `role ต้องเป็นหนึ่งใน ${VALID_ROLES.join(', ')}` });
    }

    // กันไม่ให้ admin ลดสิทธิ์ตัวเองจนไม่เหลือ admin คนสุดท้ายในระบบ
    if (req.user.id === targetId && role !== 'admin') {
      const [[{ adminCount }]] = await db.query(
        `SELECT COUNT(*) AS adminCount FROM users WHERE role = 'admin' AND id != ?`,
        [targetId]
      );
      if (adminCount === 0) {
        return res.status(400).json({ error: 'ต้องมี admin เหลืออยู่ในระบบอย่างน้อย 1 คน' });
      }
    }

    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ error: 'password ต้องมีอย่างน้อย 6 ตัวอักษร' });
      }
      const hash = await bcrypt.hash(password, 10);
      const [result] = await db.query(
        'UPDATE users SET username = ?, role = ?, password = ? WHERE id = ?',
        [username.trim(), role, hash, targetId]
      );
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
    } else {
      const [result] = await db.query(
        'UPDATE users SET username = ?, role = ? WHERE id = ?',
        [username.trim(), role, targetId]
      );
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
    }

    res.json({ id: targetId, username: username.trim(), role });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: `Username "${req.body.username}" มีอยู่ในระบบแล้ว` });
    }
    console.error('Error updating user:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE — กันลบตัวเอง และกันลบ admin คนสุดท้าย
router.delete('/:id', async (req, res) => {
  try {
    const targetId = parseInt(req.params.id);

    if (req.user.id === targetId) {
      return res.status(400).json({ error: 'ไม่สามารถลบบัญชีของตัวเองได้' });
    }

    const [[target]] = await db.query('SELECT role FROM users WHERE id = ?', [targetId]);
    if (!target) return res.status(404).json({ error: 'Not found' });

    if (target.role === 'admin') {
      const [[{ adminCount }]] = await db.query(
        `SELECT COUNT(*) AS adminCount FROM users WHERE role = 'admin' AND id != ?`,
        [targetId]
      );
      if (adminCount === 0) {
        return res.status(400).json({ error: 'ต้องมี admin เหลืออยู่ในระบบอย่างน้อย 1 คน' });
      }
    }

    const [result] = await db.query('DELETE FROM users WHERE id = ?', [targetId]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    console.error('Error deleting user:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
