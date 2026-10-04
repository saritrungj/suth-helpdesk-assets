// apps/api/src/auth/password-policy.js
//
// กฎของรหัสผ่านใหม่ — ที่เดียวสำหรับทั้งผู้ดูแลตั้งให้ (users/routes.js) และผู้ใช้เปลี่ยนเอง (auth/routes.js)
//
// เพดานนับเป็น **ไบต์** ไม่ใช่ตัวอักษร: bcrypt ใช้แค่ 72 ไบต์แรก รหัสผ่านภาษาไทย 40 ตัว (120 ไบต์) จึงเคยถูกรับ
// แล้วตรวจจริงแค่ 24 ตัวแรก — ตัวที่เหลือพิมพ์ผิดก็ยังเข้าได้

const { z } = require("zod");
const { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } = require("@suth/domain");

const passwordField = z
  .string({ error: "กรุณากรอกรหัสผ่าน" })
  .min(PASSWORD_MIN_LENGTH, `รหัสผ่านต้องมีอย่างน้อย ${PASSWORD_MIN_LENGTH} ตัวอักษร`)
  .refine((value) => Buffer.byteLength(value, "utf8") <= PASSWORD_MAX_LENGTH, "รหัสผ่านยาวเกินไป");

/**
 * รหัสผ่านในฟอร์มแก้ไขผู้ใช้ — ไม่ส่งช่องนี้มา ค่าว่าง หรือ null = ไม่เปลี่ยนรหัสเดิม (ได้ null)
 *
 * ต้องมี .optional(): union ที่มี z.undefined() อย่างเดียวไม่ทำให้ "ไม่มีคีย์" ผ่านใน zod 4 หน้าเว็บที่ไม่ส่ง
 * คีย์ password ตอนแก้เฉพาะสิทธิ์จึงเคยได้ 400 "expected nonoptional, received undefined"
 */
const optionalPasswordField = z
  .union([passwordField, z.literal(""), z.null()])
  .optional()
  .transform((value) => value || null);

module.exports = { passwordField, optionalPasswordField };
