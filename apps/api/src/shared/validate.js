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

/**
 * ราคาต่อหน้า — ห้ามติดลบ ทศนิยมไม่เกินสี่ตำแหน่ง และจำกัดเพดานกันพิมพ์ผิด
 *
 * ราคาจริงมีสามตำแหน่ง (0.365) และคอลัมน์ราคาเก็บสี่ตำแหน่ง (ADR-0022) ค่าที่ละเอียด
 * กว่านั้นต้องถูกปฏิเสธ ไม่ใช่ปล่อยให้ฐานข้อมูลปัดทิ้งเงียบๆ แล้วคิดเงินด้วยราคาที่
 * ผู้ใช้ไม่ได้กรอก
 */
const MONEY_PATTERN = /^\d+(\.\d{1,4})?$/;
const priceNumber = z.coerce
  .string()
  .trim()
  .regex(MONEY_PATTERN, "ราคาต่อหน้าต้องเป็นตัวเลขไม่ติดลบ ทศนิยมไม่เกิน 4 ตำแหน่ง")
  .transform(Number)
  .refine((value) => value <= 1000, "ราคาต่อหน้าสูงผิดปกติ");

/** number → string ก่อนตรวจ เพื่อให้ตรวจจำนวนทศนิยมจากค่าที่ผู้ใช้กรอกจริง */
const priceInput = (value) => (typeof value === "number" ? String(value) : value);

/** ราคาที่ต้องกรอก เช่นราคาในรายการราคาของสัญญา */
const requiredPrice = z.preprocess(priceInput, priceNumber);

/** ราคาที่เว้นว่างได้ เช่นราคาพิเศษเฉพาะเครื่อง */
const optionalMoney = z
  .preprocess((value) => priceInput(blankToNull(value)), priceNumber.nullable())
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

/**
 * ตัวกรองแบบ true/false ที่มาทาง query string
 *
 * ⚠️ **ห้ามใช้ `z.coerce.boolean()` กับ query string** — มันคือ `Boolean(value)`
 * ตรงๆ และค่าจาก HTTP เป็นสตริงเสมอ สตริงที่ไม่ว่างจึงเป็น truthy ทั้งหมด
 * `?unassigned=false` กลายเป็น `true` แล้วตัวกรองทำงานกลับด้าน **โดยไม่มีอะไรฟ้อง**
 * ซึ่งเป็นบั๊กที่เจอจริงใน `/devices` (issue #24): ไม่ส่งตัวกรองได้ 20 เครื่อง
 * แต่ส่ง `unassigned=false` ได้ 0
 *
 * ตัวนี้จึงอ่านเฉพาะคำที่ตั้งใจเขียนมาว่าเป็น true/false และ **ปฏิเสธค่าที่อ่านไม่ออก**
 * แทนที่จะเดา — ตัวกรองที่เดาผิดอันตรายกว่าคำขอที่ถูกปฏิเสธ เพราะผู้ใช้เห็นผลลัพธ์
 * ที่ดูสมเหตุสมผลแต่ผิด
 */
const BOOLEAN_QUERY_TRUE = new Set(["true", "1"]);
const BOOLEAN_QUERY_FALSE = new Set(["false", "0"]);

// `?unassigned=` ที่ไม่มีค่าตามหลัง แปลว่า "ไม่กรอง" ไม่ใช่ค่าที่อ่านไม่ออก —
// ฟอร์มฝั่งเว็บส่ง "" มาเมื่อผู้ใช้ไม่ได้เลือก เหมือนกับ optionalId/optionalText
const booleanQuery = z.preprocess(
  blankToNull,
  z.union([
    z.null(),
    z.union([z.boolean(), z.string()]).transform((value, ctx) => {
      if (typeof value === "boolean") return value;

      const normalized = value.trim().toLowerCase();
      if (BOOLEAN_QUERY_TRUE.has(normalized)) return true;
      if (BOOLEAN_QUERY_FALSE.has(normalized)) return false;

      ctx.addIssue({ code: "custom", message: "ต้องเป็น true หรือ false" });
      return z.NEVER;
    }),
  ])
);

/**
 * วันที่ในรูปแบบ "YYYY-MM-DD" ที่มีอยู่จริงในปฏิทิน
 *
 * ตรวจสองชั้นเพราะ regex อย่างเดียวปล่อย "2026-02-31" ผ่าน แล้ว MySQL จะเก็บเป็น
 * '0000-00-00' หรือปฏิเสธเงียบๆ ขึ้นกับโหมดของเซิร์ฟเวอร์ — ทั้งสองทางทำให้ช่วง
 * ความรับผิดชอบของเครื่องนั้นหายไปจากตัวส่วนโดยไม่มีอะไรฟ้อง
 *
 * ไม่รับ Date object และไม่ใช้ `new Date(text)` แปลง เพราะการ parse ผ่าน Date
 * จะเลื่อนวันตาม timezone ของเครื่องที่รัน ซึ่งเป็นบั๊กที่ทั้ง repo นี้เลี่ยงมาตลอด
 * (ดู mysql2 `dateStrings: true` ใน shared/db.js)
 */
const dateString = z
  .string({ error: "กรุณาระบุวันที่" })
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "วันที่ต้องอยู่ในรูปแบบ YYYY-MM-DD")
  .refine((text) => {
    const [year, month, day] = text.split("-").map(Number);
    if (month < 1 || month > 12 || day < 1) return false;
    // วันสุดท้ายของเดือนนั้นจริงๆ — `new Date(y, m, 0)` คือวันสุดท้ายของเดือน m
    return day <= new Date(year, month, 0).getDate();
  }, "ไม่มีวันที่นี้อยู่จริงในปฏิทิน");

module.exports = {
  validate,
  blankToNull,
  toFieldErrors,
  idParam,
  requiredText,
  optionalText,
  optionalId,
  optionalMoney,
  requiredPrice,
  monthString,
  monthListQuery,
  booleanQuery,
  dateString,
};
