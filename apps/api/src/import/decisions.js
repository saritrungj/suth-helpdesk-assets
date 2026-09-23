// apps/api/src/import/decisions.js
//
// สิ่งที่ผู้ดูแลตัดสินในหน้าตรวจนำเข้าทะเบียน (ชื่อที่ไม่รู้จัก หมวดมิเตอร์ของรุ่น) — ดู registry-plan.js
// ย้ายมาจาก import/controller.js โดยไม่เปลี่ยนพฤติกรรม (#178)

const { z } = require("zod");
const { badRequest } = require("../shared/http-error");

const nameDecision = z.union([
  z.object({ action: z.literal("create"), as: z.string().max(255).optional() }),
  z.object({ action: z.literal("alias"), target_id: z.coerce.number().int().positive() }),
  z.object({ action: z.literal("alias"), target_new: z.string().min(1).max(255) }),
]);

const decisionSchema = z.object({
  names: z.object({
    brand: z.record(z.string().max(255), nameDecision).optional(),
    building: z.record(z.string().max(255), nameDecision).optional(),
    division: z.record(z.string().max(255), nameDecision).optional(),
  }).optional(),
  models: z.record(
    z.string().max(600),
    z.object({
      meter_category_id: z.coerce.number().int().positive(),
      has_color_meter: z.boolean().optional(),
    })
  ).optional(),
  // ยอมรับความต่างระหว่างสัญญาในระบบกับไฟล์ พร้อมเหตุผล (import session, #179) — คีย์เช่น
  // "contract:SUTH86/2567:rental" เหตุผลถูกเก็บในประวัติของ session
  acknowledged: z.record(z.string().max(200), z.string().trim().min(3, "ระบุเหตุผลอย่างน้อย 3 ตัวอักษร").max(500)).optional(),
});

function parseDecisions(raw) {
  if (!raw) return {};
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw badRequest("ข้อมูลการตัดสินใจไม่ใช่ JSON", { code: "invalid_decisions" });
  }
  const parsed = decisionSchema.safeParse(value);
  if (!parsed.success) throw badRequest("ข้อมูลการตัดสินใจไม่ถูกต้อง", { code: "invalid_decisions" });
  return parsed.data;
}

/** การตัดสินใจที่ส่งมาเป็น object (import session) — ผ่านกฎเดียวกับ parseDecisions */
function validateDecisions(value) {
  const parsed = decisionSchema.safeParse(value ?? {});
  if (!parsed.success) {
    throw badRequest("ข้อมูลการตัดสินใจไม่ถูกต้อง", {
      code: "invalid_decisions",
      errors: parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
    });
  }
  return parsed.data;
}

module.exports = { decisionSchema, parseDecisions, validateDecisions };
