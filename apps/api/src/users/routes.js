// apps/api/src/users/routes.js
//
// จัดการบัญชีผู้ใช้ — ผู้ดูแลระบบเท่านั้นทั้งไฟล์
//
// กฎที่บังคับไว้ที่นี่และห้ามย้ายไปฝั่งเว็บ (เพราะฝั่งเว็บถูกข้ามได้ด้วย curl)
//
//   - ไม่ส่ง hash ของรหัสผ่านกลับออกไปไม่ว่ากรณีใด
//   - ต้องเหลือ admin อย่างน้อยหนึ่งคนในระบบเสมอ — ทั้งตอนลดสิทธิ์ตัวเองและตอนลบ
//     คนอื่น ถ้าไม่กันไว้ ระบบจะเข้าไม่ได้ถาวรและต้องแก้ด้วยการเข้าฐานข้อมูลตรงๆ
//   - ลบบัญชีตัวเองไม่ได้
//
// ความยาวรหัสผ่านขั้นต่ำอยู่ใน packages/domain/constraints.cjs ที่เดียว เพื่อให้
// ข้อความเตือนฝั่งเว็บกับกฎจริงฝั่ง API ไม่มีทางไม่ตรงกัน

const express = require("express");
const bcrypt = require("bcrypt");
const { z } = require("zod");

const router = express.Router();
const db = require("../shared/db");
const asyncHandler = require("../shared/async-handler");
const requireAuth = require("../auth/require-auth");
const requireAdmin = require("../auth/require-admin");
const { validate, idParam, requiredText } = require("../shared/validate");
const { notFound, badRequest } = require("../shared/http-error");
const { noStore } = require("../shared/cache");
const { USER_ROLES, PASSWORD_MIN_LENGTH } = require("@suth/domain");

router.use(requireAuth);
router.use(requireAdmin);

/** ไม่ส่ง password (hash) กลับไปให้ฝั่งเว็บไม่ว่ากรณีใดๆ */
const SAFE_FIELDS = "id, username, role, created_at";

const BCRYPT_ROUNDS = 10;

const passwordField = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `รหัสผ่านต้องมีอย่างน้อย ${PASSWORD_MIN_LENGTH} ตัวอักษร`)
  .max(72, "รหัสผ่านยาวเกินไป");

const roleField = z.enum(USER_ROLES, {
  error: `สิทธิ์ต้องเป็นหนึ่งใน ${USER_ROLES.join(", ")}`,
});

const createBody = z.object({
  username: requiredText("ชื่อผู้ใช้", 50),
  password: passwordField,
  role: roleField,
});

// แก้ไข: รหัสผ่านจะกรอกหรือไม่ก็ได้ — ไม่กรอก = ไม่เปลี่ยนรหัสเดิม
// ค่าว่างต้องถือว่า "ไม่เปลี่ยน" ไม่ใช่ "ตั้งรหัสเป็นค่าว่าง"
const updateBody = z.object({
  username: requiredText("ชื่อผู้ใช้", 50),
  role: roleField,
  password: z.union([passwordField, z.literal(""), z.null(), z.undefined()]).transform((v) => v || null),
});

/**
 * ยังมี admin คนอื่นเหลืออยู่ในระบบหรือไม่ ถ้าไม่นับคนนี้
 *
 * ใช้ทั้งตอนลดสิทธิ์และตอนลบ — สองเส้นทางนี้เคยเขียน query เดียวกันคนละที่
 * @param {number} excludeId
 * @returns {Promise<boolean>}
 */
async function hasAnotherAdmin(excludeId) {
  const [[row]] = await db.query(
    "SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND id != ?",
    [excludeId]
  );
  return row.count > 0;
}

// GET /api/users
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const [rows] = await db.query(`SELECT ${SAFE_FIELDS} FROM users ORDER BY role, username`);
    // ข้อมูลบัญชีห้ามถูกเก็บไว้ในเบราว์เซอร์บนเครื่องที่ใช้ร่วมกันหลายคน
    noStore(res);
    res.json(rows);
  })
);

// POST /api/users
router.post(
  "/",
  validate({ body: createBody }),
  asyncHandler(async (req, res) => {
    const { username, password, role } = req.body;

    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const [result] = await db.query("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", [
      username,
      hash,
      role,
    ]);

    noStore(res);
    res.status(201).json({ id: result.insertId, username, role });
  })
);

// PUT /api/users/:id
router.put(
  "/:id",
  validate({ params: idParam, body: updateBody }),
  asyncHandler(async (req, res) => {
    const { username, role, password } = req.body;
    const targetId = req.params.id;

    // กันไม่ให้ผู้ดูแลลดสิทธิ์ตัวเองจนไม่เหลือ admin คนสุดท้าย
    if (req.user.id === targetId && role !== "admin" && !(await hasAnotherAdmin(targetId))) {
      throw badRequest("ต้องมีผู้ดูแลระบบเหลืออยู่อย่างน้อย 1 คน", {
        code: "last_admin",
        detail: "ตั้งบัญชีอื่นเป็นผู้ดูแลระบบก่อน แล้วจึงเปลี่ยนสิทธิ์ของบัญชีนี้ได้",
      });
    }

    // สร้าง SQL ตามช่องที่มีค่าจริง แทนการเขียน UPDATE สองชุดที่ต่างกันแค่คอลัมน์เดียว
    const assignments = ["username = ?", "role = ?"];
    const values = [username, role];

    if (password) {
      assignments.push("password = ?");
      values.push(await bcrypt.hash(password, BCRYPT_ROUNDS));
    }

    const [result] = await db.query(`UPDATE users SET ${assignments.join(", ")} WHERE id = ?`, [
      ...values,
      targetId,
    ]);

    if (!result.affectedRows) throw notFound("ไม่พบบัญชีผู้ใช้ที่ต้องการแก้ไข");

    noStore(res);
    res.json({ id: targetId, username, role });
  })
);

// DELETE /api/users/:id
router.delete(
  "/:id",
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const targetId = req.params.id;

    if (req.user.id === targetId) {
      throw badRequest("ลบบัญชีของตัวเองไม่ได้", {
        code: "cannot_delete_self",
        detail: "ให้ผู้ดูแลระบบคนอื่นเป็นผู้ลบบัญชีนี้แทน",
      });
    }

    const [[target]] = await db.query("SELECT role FROM users WHERE id = ?", [targetId]);
    if (!target) throw notFound("ไม่พบบัญชีผู้ใช้ที่ต้องการลบ");

    if (target.role === "admin" && !(await hasAnotherAdmin(targetId))) {
      throw badRequest("ต้องมีผู้ดูแลระบบเหลืออยู่อย่างน้อย 1 คน", {
        code: "last_admin",
        detail: "ตั้งบัญชีอื่นเป็นผู้ดูแลระบบก่อน แล้วจึงลบบัญชีนี้ได้",
      });
    }

    await db.query("DELETE FROM users WHERE id = ?", [targetId]);

    noStore(res);
    res.json({ message: "ลบบัญชีผู้ใช้เรียบร้อยแล้ว" });
  })
);

module.exports = router;
