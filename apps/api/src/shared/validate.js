// apps/api/src/shared/validate.js
//
// ตรวจข้อมูลขาเข้าที่ "ปากทาง" ก่อน handler ได้เห็น
//
// ปัญหาเดิม: มี zod ติดตั้งอยู่แล้วแต่ใช้จริงแค่ไฟล์เดียว (devices/controller.js)
// ที่เหลือตรวจด้วยมือทีละบรรทัด — `if (!name) return res.status(400)...` ผลคือ
//
//   - ตรวจไม่ครบ: master-data เช็คแค่ว่า name มีค่าไหม ไม่เช็คความยาว ทำให้ยัด
//     ชื่ออาคารยาว 5000 ตัวอักษรได้จนฐานข้อมูลตัดทิ้งเงียบๆ (MySQL ไม่ strict)
//   - แปลงชนิดไม่ตรง: req.body.brand_id ที่มาจากฟอร์มเป็น string "3" แต่ zod
//     schema เดิมประกาศเป็น number ทำให้บันทึกไม่ผ่านทั้งที่ข้อมูลถูก
//   - query string ไม่เคยถูกตรวจเลย: ?page=-1 หรือ ?per_page=999999 ผ่านเข้าไป
//     ถึง SQL ได้ตรงๆ
//
// ตัวนี้แปลงชนิดให้ด้วย (coerce) เพราะข้อมูลจาก HTTP เป็น string เสมอ แล้วเขียน
// ค่าที่ผ่านการตรวจแล้วกลับลง req.body / req.query / req.params ให้ handler
// ใช้ค่าที่สะอาดแล้วเท่านั้น — handler ไม่ต้องแตะค่าดิบอีก

const { z } = require("zod");
const { badRequest } = require("./http-error");

/**
 * แปลงผลจาก zod ให้เป็นรายการข้อผิดพลาดรายช่อง ที่ฟอร์มฝั่งเว็บเอาไปวางใต้ช่องได้เลย
 *
 * @param {import("zod").ZodError} error
 * @returns {{ field: string, message: string }[]}
 */
function toFieldErrors(error) {
  return error.issues.map((issue) => ({
    // path ว่าง = ปัญหาของทั้งก้อน ไม่ใช่ของช่องใดช่องหนึ่ง
    field: issue.path.length ? issue.path.join(".") : "_",
    message: issue.message,
  }));
}

/**
 * สร้าง middleware ที่ตรวจส่วนต่างๆ ของ request
 *
 * ตรวจทุกส่วนที่ระบุมาให้ครบก่อนค่อยตอบกลับ ไม่หยุดที่ error แรก — ผู้ใช้จะได้
 * เห็นทุกช่องที่ต้องแก้ในรอบเดียว ไม่ใช่แก้ทีละช่องแล้วกดบันทึกใหม่ห้ารอบ
 *
 * @param {{ body?: import("zod").ZodType, query?: import("zod").ZodType, params?: import("zod").ZodType }} schemas
 */
function validate(schemas) {
  return (req, res, next) => {
    const fieldErrors = [];

    for (const part of ["params", "query", "body"]) {
      const schema = schemas[part];
      if (!schema) continue;

      const result = schema.safeParse(req[part] ?? {});

      if (!result.success) {
        // ใส่ชื่อส่วนนำหน้าเฉพาะตอนที่ไม่ใช่ body — ช่องของฟอร์มอยู่ใน body เกือบทั้งหมด
        // การเติม "body." นำหน้าทุกช่องทำให้ฝั่งเว็บต้องมาตัดคำนำหน้าออกเองอีกที
        const prefix = part === "body" ? "" : `${part}.`;
        fieldErrors.push(
          ...toFieldErrors(result.error).map((e) => ({ ...e, field: `${prefix}${e.field}` }))
        );
        continue;
      }

      // req.query ใน Express 5 เป็น getter ที่เขียนทับตรงๆ ไม่ได้ ต้องนิยามใหม่
      Object.defineProperty(req, part, {
        value: result.data,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }

    if (fieldErrors.length) {
      return next(
        badRequest("ข้อมูลที่กรอกไม่ถูกต้อง", {
          code: "validation_failed",
          detail: fieldErrors.map((e) => e.message).join(" / "),
          errors: fieldErrors,
        })
      );
    }

    next();
  };
}

// ============================================================
// ชิ้นส่วนที่ใช้ซ้ำทั้งระบบ
// ============================================================

/**
 * id ที่มาจาก URL — เป็น string เสมอ ต้องแปลงเป็นเลขจำนวนเต็มบวก
 * ห้ามปล่อยให้ "abc" หรือ "1 OR 1=1" ไหลไปถึง SQL แม้จะใช้ parameterized query แล้วก็ตาม
 */
// ข้อความ error ต้องผูกไว้ที่ตัว coerce ด้วย ไม่ใช่แค่ที่ .positive() — ถ้า
// แปลงเป็นตัวเลขไม่ได้เลย (เช่น "abc") การตรวจจะหยุดที่ขั้นแปลงชนิดก่อน แล้วผู้ใช้
// จะได้ข้อความภาษาอังกฤษของ zod ("expected number, received NaN") แทนข้อความของเรา
const idParam = z.object({
  id: z.coerce
    .number({ error: "รหัสไม่ถูกต้อง" })
    .int("รหัสไม่ถูกต้อง")
    .positive("รหัสไม่ถูกต้อง"),
});

/** ข้อความที่ผู้ใช้กรอก — ตัดช่องว่างหัวท้ายเสมอ แล้วห้ามเหลือค่าว่าง */
const requiredText = (label, max = 255) =>
  z
    .string({ error: `กรุณากรอก${label}` })
    .trim()
    .min(1, `กรุณากรอก${label}`)
    .max(max, `${label}ต้องยาวไม่เกิน ${max} ตัวอักษร`);

/**
 * ค่าที่ผู้ใช้ "ไม่ได้กรอก" — ฟอร์ม HTML ส่ง "" มาเสมอเมื่อเว้นว่าง ส่วน API ที่
 * เรียกจากสคริปต์มักละคีย์นั้นไปเลย ทั้งสามแบบต้องหมายถึงสิ่งเดียวกันคือ null
 *
 * ⚠️ ต้องแปลงเป็น null **ก่อน** ที่ z.coerce จะทำงาน ไม่ใช่ใส่ z.literal("") ไว้
 * ในตัวเลือกของ union — เพราะ Number("") มีค่าเท่ากับ 0 การปล่อยให้ coerce เห็น
 * "" ก่อนจึงทำให้ "ไม่ได้กรอกราคา" กลายเป็น "ราคา 0 บาท" เงียบๆ ซึ่งต่างกันคนละ
 * เรื่อง: ราคา 0 คือของฟรี ส่วนไม่กรอกคือยังไม่รู้ราคา แล้วระบบจะไป fallback ไปใช้
 * ราคาของสัญญาแทน (COALESCE ใน schema.sql)
 */
const blankToNull = (value) => (value === "" || value === null || value === undefined ? null : value);

/** ข้อความที่กรอกหรือไม่กรอกก็ได้ — ช่องว่างล้วนถือเป็น null ไม่ใช่ string ว่าง */
const optionalText = (max = 255) =>
  z
    .preprocess(
      blankToNull,
      z.union([
        z.null(),
        z
          .string()
          .trim()
          .max(max, `ต้องยาวไม่เกิน ${max} ตัวอักษร`)
          .transform((value) => value || null),
      ])
    )
    .optional()
    .transform((value) => value ?? null);

/**
 * รหัสอ้างอิงไปยังตารางอื่น (brand_id, building_id, ...) ที่จะกรอกหรือไม่ก็ได้
 *
 * ฟอร์มฝั่งเว็บส่ง "" เมื่อผู้ใช้ไม่ได้เลือก และส่ง "3" (string) เมื่อเลือกแล้ว
 * ทั้งสองกรณีต้องกลายเป็น null กับ 3 ตามลำดับ ไม่ใช่ NaN
 */
const optionalId = z
  .preprocess(
    blankToNull,
    z.union([z.null(), z.coerce.number().int("รหัสอ้างอิงไม่ถูกต้อง").positive("รหัสอ้างอิงไม่ถูกต้อง")])
  )
  .optional()
  .transform((value) => value ?? null);

/** จำนวนเงินต่อหน่วย เช่น ราคาต่อแผ่น — ห้ามติดลบ และจำกัดเพดานกันพิมพ์ผิด */
const optionalMoney = z
  .preprocess(
    blankToNull,
    z.union([
      z.null(),
      z.coerce.number().nonnegative("ราคาต้องไม่ติดลบ").max(1_000_000, "ราคาสูงผิดปกติ"),
    ])
  )
  .optional()
  .transform((value) => value ?? null);

/**
 * เดือน "YYYY-MM" — รับได้ทั้ง พ.ศ. และ ค.ศ. แล้วแปลงเป็น ค.ศ. ตาม ADR-0002
 * ใช้ normalizeMonth จาก @suth/domain ที่เดียว ห้ามเขียน regex เดือนซ้ำที่นี่
 */
const { normalizeMonth, parseMonths } = require("@suth/domain");

const monthString = z
  .string()
  .transform((value) => normalizeMonth(value))
  .refine((value) => value !== null, "รูปแบบเดือนไม่ถูกต้อง (ต้องเป็น YYYY-MM)");

/** ?month= รับได้ทั้งเดือนเดียวและหลายเดือนคั่นด้วย comma — คืน array เสมอ */
const monthListQuery = z
  .string()
  .optional()
  .transform((value) => parseMonths(value));

module.exports = {
  validate,
  blankToNull,
  toFieldErrors,
  idParam,
  requiredText,
  optionalText,
  optionalId,
  optionalMoney,
  monthString,
  monthListQuery,
};
