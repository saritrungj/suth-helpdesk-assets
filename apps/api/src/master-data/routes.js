// apps/api/src/master-data/routes.js
//
// ข้อมูลอ้างอิงของระบบ — ยี่ห้อ อาคาร ชั้น ฝ่าย แผนก ปีงบประมาณ
//
// ห้าตารางแรกมีรูปร่างเหมือนกันหมด (id + name และบางตัวมีตารางแม่) จึงสร้าง
// เส้นทาง CRUD ให้ด้วยฟังก์ชันตัวเดียว แทนที่จะคัดลอกโค้ดชุดเดิมห้ารอบ
//
// สิ่งที่แก้จากเดิม
//
//   1. **`SELECT *`** ทำให้คอลัมน์ที่เพิ่มในฐานข้อมูลวันหลังหลุดออก API เองโดย
//      ไม่มีใครตั้งใจ ตอนนี้ระบุคอลัมน์ที่ส่งออกชัดเจน — API คือสัญญา ไม่ใช่กระจก
//      สะท้อนตาราง
//   2. **ตรวจข้อมูลด้วยมือแค่ `if (!name)`** ไม่เคยเช็คความยาว ทำให้ยัดชื่อยาว
//      เกินขนาดคอลัมน์เข้าไปได้แล้ว MySQL ตัดทิ้งเงียบๆ ตอนนี้ตรวจด้วย schema
//      ที่ประกาศไว้ที่เดียว
//   3. **ไม่มี Cache-Control** ข้อมูลชุดนี้แทบไม่เปลี่ยนแต่ถูกดึงใหม่ทุกครั้งที่
//      เปลี่ยนหน้า ตอนนี้ตอบ 304 ตัวเปล่าให้คำขอที่สองเป็นต้นไป (ดู shared/cache.js)
//   4. **เรียงตาม id** ทำให้รายการในกล่องเลือกเรียงตามลำดับที่ถูกเพิ่มเข้ามา
//      ซึ่งไม่มีความหมายกับคนอ่าน ตอนนี้เรียงตามชื่อด้วยการเทียบแบบภาษาไทย

const express = require("express");
const { z } = require("zod");

const router = express.Router();
const db = require("../shared/db");
const asyncHandler = require("../shared/async-handler");
const requireAuth = require("../auth/require-auth");
const requireAdmin = require("../auth/require-admin");
const { validate, idParam, requiredText, optionalId } = require("../shared/validate");
const { MAX_LENGTH } = require("@suth/domain");
const { notFound, badRequest } = require("../shared/http-error");
const cache = require("../shared/cache");
const { normalizeName } = require("./names");
const lookupWrites = require("./lookup-writes");

// ต้องล็อกอินก่อนถึงจะเรียกข้อมูลอ้างอิงได้
router.use(requireAuth);

/**
 * เรียงตามชื่อแบบภาษาไทย
 *
 * MySQL เรียง utf8mb4_general_ci ตามลำดับ code point ซึ่งจัด "เ" กับ "แ" ไว้
 * ผิดที่ในสายตาคนไทย (สระนำหน้าพยัญชนะ) การเรียงฝั่ง SQL จึงได้ลำดับที่คนอ่าน
 * แล้วหาไม่เจอ — ใช้ Intl.Collator("th") เรียงฝั่ง JS แทน ซึ่งเป็นตัวเดียวกับที่
 * ตารางฝั่งเว็บใช้ ทำให้ลำดับตรงกันทั้งระบบ
 */
const thaiCollator = new Intl.Collator("th", { numeric: true, sensitivity: "base" });
const byName = (a, b) => thaiCollator.compare(a.name ?? "", b.name ?? "");

/**
 * สร้างเส้นทาง CRUD ให้ตารางข้อมูลอ้างอิงหนึ่งตาราง
 *
 * @param {object} config
 * @param {string} config.table ชื่อตารางในฐานข้อมูล
 * @param {string} config.path เส้นทางย่อยของ API เช่น "/buildings"
 * @param {string} config.label ชื่อภาษาไทยที่ใช้ในข้อความ error
 * @param {string} [config.parentField] คอลัมน์ที่ชี้ไปตารางแม่ เช่น "building_id"
 * @param {boolean} [config.parentRequired] ตารางแม่บังคับต้องเลือกหรือไม่
 * @param {{ kind: string, table: string, column: string }} [config.alias] ตารางชื่อเรียกอื่น (ADR-0025)
 * @param {number} [config.maxLength] ความยาวคอลัมน์ name ใน schema.sql — ฐานแบบ strict
 *   ตอบ error แทนการตัดทิ้งเงียบ ถ้าตรวจยาวกว่าคอลัมน์ ผู้ใช้จะเห็น 500 แทน 400
 */
function registerLookup({ table, path, label, parentField, parentRequired = true, alias, maxLength = 255 }) {
  // ระบุคอลัมน์ที่ส่งออกชัดเจน ไม่ใช้ SELECT * — คอลัมน์ status มีอยู่ในตารางแต่
  // ไม่เคยถูกใช้งานที่ไหนเลยในระบบ จึงไม่ส่งออกไปให้ฝั่งเว็บต้องเดาว่าต้องทำอะไรกับมัน
  const columns = ["id", "name", ...(parentField ? [parentField] : [])]
    .map((column) => `\`${column}\``)
    .join(", ");

  const bodySchema = z.object({
    // เก็บในรูปเดียวกับชื่อเรียกอื่น (NFC ยุบช่องว่าง) — ชื่อที่ติดอักขระมองไม่เห็นมาจากการคัดลอก
    // จะไม่กลายเป็นอีกชื่อที่หน้าตาเหมือนกันทุกอย่าง
    name: requiredText(label, maxLength).transform(normalizeName),
    ...(parentField
      ? {
          [parentField]: parentRequired
            ? z.coerce.number({ error: "กรุณาเลือกรายการแม่" }).int().positive("กรุณาเลือกรายการแม่")
            : optionalId,
        }
      : {}),
  });

  // กฎของชื่อหลักและชื่อเรียกอื่นอยู่ที่ lookup-writes.js ที่เดียว — ตัวนำเข้าทะเบียนใช้ชุดเดียวกัน
  const assertNotAlias = (name) => (alias ? lookupWrites.assertNotAlias(db, alias.kind, name) : undefined);

  // ---------- ชื่อเรียกอื่น (ADR-0025) ----------
  //
  // ลงทะเบียนก่อน `${path}/:id` — ไม่งั้น "/aliases" ถูกอ่านเป็น id แล้วตอบ 400

  if (alias) {
    const aliasBody = z.object({ alias: requiredText("ชื่อเรียกอื่น", 255) });

    router.get(
      `${path}/aliases`,
      asyncHandler(async (req, res) => {
        const rows = await lookupWrites.loadAliases(db, alias.kind);
        cache.referenceData(res);
        res.json(rows.sort((a, b) => thaiCollator.compare(a.alias, b.alias)));
      })
    );

    router.post(
      `${path}/:id/aliases`,
      requireAdmin,
      validate({ params: idParam, body: aliasBody }),
      asyncHandler(async (req, res) => {
        const created = await lookupWrites.addAlias(db, alias.kind, req.params.id, req.body.alias);
        cache.noStore(res);
        res.set("Location", `${req.baseUrl}${path}/aliases`);
        res.status(201).json({ id: created.id, target_id: req.params.id, alias: created.alias });
      })
    );

    router.delete(
      `${path}/aliases/:id`,
      requireAdmin,
      validate({ params: idParam }),
      asyncHandler(async (req, res) => {
        const [result] = await db.query(`DELETE FROM \`${alias.table}\` WHERE id = ?`, [req.params.id]);
        if (!result.affectedRows) throw notFound("ไม่พบชื่อเรียกอื่นที่ต้องการลบ");
        cache.noStore(res);
        res.set("Location", `${req.baseUrl}${path}/aliases`);
        res.json({ message: "ลบชื่อเรียกอื่นเรียบร้อยแล้ว" });
      })
    );
  }

  // ---------- อ่าน ----------

  router.get(
    path,
    asyncHandler(async (req, res) => {
      const [rows] = await db.query(`SELECT ${columns} FROM \`${table}\``);
      cache.referenceData(res);
      res.json(rows.sort(byName));
    })
  );

  router.get(
    `${path}/:id`,
    validate({ params: idParam }),
    asyncHandler(async (req, res) => {
      const [rows] = await db.query(`SELECT ${columns} FROM \`${table}\` WHERE id = ?`, [req.params.id]);
      if (!rows.length) throw notFound(`ไม่พบ${label}ที่ต้องการ`);

      cache.referenceData(res);
      res.json(rows[0]);
    })
  );

  // ---------- เขียน (ผู้ดูแลระบบเท่านั้น) ----------

  router.post(
    path,
    requireAdmin,
    validate({ body: bodySchema }),
    asyncHandler(async (req, res) => {
      await assertNotAlias(req.body.name);
      const fields = parentField ? ["name", parentField] : ["name"];
      const values = fields.map((field) => req.body[field]);

      const [result] = await db.query(
        `INSERT INTO \`${table}\` (${fields.map((f) => `\`${f}\``).join(", ")}) VALUES (${fields.map(() => "?").join(", ")})`,
        values
      );

      cache.noStore(res);
      res.set("Location", `${req.baseUrl}${path}/${result.insertId}`);
      res.status(201).json({ id: result.insertId, ...req.body });
    })
  );

  router.put(
    `${path}/:id`,
    requireAdmin,
    validate({ params: idParam, body: bodySchema }),
    asyncHandler(async (req, res) => {
      await assertNotAlias(req.body.name);
      const fields = parentField ? ["name", parentField] : ["name"];

      const [result] = await db.query(
        `UPDATE \`${table}\` SET ${fields.map((f) => `\`${f}\` = ?`).join(", ")} WHERE id = ?`,
        [...fields.map((field) => req.body[field]), req.params.id]
      );

      if (!result.affectedRows) throw notFound(`ไม่พบ${label}ที่ต้องการแก้ไข`);

      cache.noStore(res);
      res.set("Location", `${req.baseUrl}${path}`);
      res.json({ id: req.params.id, ...req.body });
    })
  );

  router.delete(
    `${path}/:id`,
    requireAdmin,
    validate({ params: idParam }),
    asyncHandler(async (req, res) => {
      // ถ้ายังมีเครื่อง/ชั้น/แผนกอ้างถึงอยู่ MySQL จะโยน ER_ROW_IS_REFERENCED
      // ซึ่ง error handler กลางแปลงเป็นข้อความภาษาไทยที่บอกวิธีแก้ให้แล้ว
      const [result] = await db.query(`DELETE FROM \`${table}\` WHERE id = ?`, [req.params.id]);
      if (!result.affectedRows) throw notFound(`ไม่พบ${label}ที่ต้องการลบ`);

      cache.noStore(res);
      res.set("Location", `${req.baseUrl}${path}`);
      res.json({ message: `ลบ${label}เรียบร้อยแล้ว` });
    })
  );
}

// ชื่อเรียกอื่นมีเฉพาะสามตารางที่ชื่อไม่ซ้ำทั้งระบบ — ชื่อชั้นและแผนกซ้ำกันได้คนละอาคาร/ฝ่าย
// ชื่อเรียกอื่นของสองตารางนั้นจึงต้องผูกตารางแม่ด้วย ยังไม่ทำจนกว่าจะเจอกรณีจริง (ADR-0025)
registerLookup({ table: "brand", path: "/brands", label: "ยี่ห้อ", maxLength: MAX_LENGTH.brand_name, alias: { kind: "brand", table: "brand_alias", column: "brand_id" } });
registerLookup({ table: "building", path: "/buildings", label: "อาคาร", alias: { kind: "building", table: "building_alias", column: "building_id" } });
registerLookup({ table: "division", path: "/divisions", label: "ฝ่าย", alias: { kind: "division", table: "division_alias", column: "division_id" } });

// floor และ department ผูกกับตารางแม่ — ถ้าไม่บันทึก building_id / division_id
// ไปด้วย ชั้นจะลอยไม่สังกัดอาคารไหน และตัวกรองแบบลูกโซ่ในหน้าเว็บจะกรองไม่ได้
registerLookup({ table: "floor", path: "/floors", label: "ชั้น", maxLength: MAX_LENGTH.floor_name, parentField: "building_id" });
registerLookup({ table: "department", path: "/departments", label: "แผนก", parentField: "division_id" });

// ============================================================
// ปีงบประมาณ — ใช้คอลัมน์ "year" ไม่ใช่ "name" จึงเขียนแยก
//
// ช่วงเดือน (start_month / end_month) คำนวณจากเลขปีเสมอ ไม่ให้ผู้ใช้กรอกเอง
// เพราะปีงบราชการไทยคือ ต.ค.–ก.ย. คร่อมสองปีปฏิทิน (ADR-0001) การปล่อยให้กรอก
// มือคือการเปิดช่องให้ช่วงเดือนไม่ตรงกับปีงบโดยไม่มีอะไรตรวจจับได้
// ============================================================

const { getFiscalYearRange } = require("@suth/domain");

const fiscalYearBody = z.object({
  year: requiredText("ปีงบประมาณ", 10),
});

router.get(
  "/fiscal-years",
  asyncHandler(async (req, res) => {
    const [rows] = await db.query(
      "SELECT id, year, start_month, end_month FROM fiscal_year ORDER BY year"
    );
    cache.referenceData(res);
    res.json(rows);
  })
);

/**
 * คำนวณช่วงเดือนของปีงบ แล้วแปลง error ของ domain ให้เป็น 400 ที่อ่านรู้เรื่อง
 * (getFiscalYearRange โยน error ถ้าเลขปีไม่ใช่ตัวเลขที่ใช้ได้)
 */
function rangeOf(year) {
  try {
    return getFiscalYearRange(year);
  } catch (err) {
    throw badRequest("เลขปีงบประมาณไม่ถูกต้อง", { detail: err.message });
  }
}

router.post(
  "/fiscal-years",
  requireAdmin,
  validate({ body: fiscalYearBody }),
  asyncHandler(async (req, res) => {
    const { year } = req.body;
    const { startMonth, endMonth } = rangeOf(year);

    const [result] = await db.query(
      "INSERT INTO fiscal_year (year, start_month, end_month) VALUES (?, ?, ?)",
      [year, startMonth, endMonth]
    );

    cache.noStore(res);
    res.set("Location", `${req.baseUrl}/fiscal-years/${result.insertId}`);
    res.status(201).json({ id: result.insertId, year, start_month: startMonth, end_month: endMonth });
  })
);

router.put(
  "/fiscal-years/:id",
  requireAdmin,
  validate({ params: idParam, body: fiscalYearBody }),
  asyncHandler(async (req, res) => {
    const { year } = req.body;
    // แก้เลขปีแล้วช่วงเดือนต้องคำนวณใหม่ด้วย ไม่งั้นจะค้างช่วงเดือนของปีเก่าไว้
    const { startMonth, endMonth } = rangeOf(year);

    const [result] = await db.query(
      "UPDATE fiscal_year SET year = ?, start_month = ?, end_month = ? WHERE id = ?",
      [year, startMonth, endMonth, req.params.id]
    );

    if (!result.affectedRows) throw notFound("ไม่พบปีงบประมาณที่ต้องการแก้ไข");

    cache.noStore(res);
    res.set("Location", `${req.baseUrl}/fiscal-years`);
    res.json({ id: req.params.id, year, start_month: startMonth, end_month: endMonth });
  })
);

router.delete(
  "/fiscal-years/:id",
  requireAdmin,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const [result] = await db.query("DELETE FROM fiscal_year WHERE id = ?", [req.params.id]);
    if (!result.affectedRows) throw notFound("ไม่พบปีงบประมาณที่ต้องการลบ");

    cache.noStore(res);
    // RFC 9111 §4.4 บังคับ invalidate target URI ของ DELETE อยู่แล้ว; Location นี้
    // ชี้ไปยัง collection เพิ่มเติม เพื่อให้ cache ที่รองรับเลือก invalidate URI นั้นได้
    res.set("Location", `${req.baseUrl}/fiscal-years`);
    res.json({ message: "ลบปีงบประมาณเรียบร้อยแล้ว" });
  })
);

module.exports = router;
