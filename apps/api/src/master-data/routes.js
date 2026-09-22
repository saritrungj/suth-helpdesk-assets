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
const { notFound, badRequest, conflict } = require("../shared/http-error");
const cache = require("../shared/cache");
const { normalizeName, nameKey } = require("./names");

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
 * @param {{ table: string, column: string }} [config.alias] ตารางชื่อเรียกอื่น (ADR-0025)
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

  const aliasColumns = alias && `id, \`${alias.column}\` AS target_id, alias`;
  const loadAliases = async () => (await db.query(`SELECT ${aliasColumns} FROM \`${alias.table}\``))[0];

  /**
   * ชื่อหลักห้ามชนชื่อเรียกอื่น — ไม่งั้นชื่อเดียวชี้ได้สองรายการ แล้วตัวนำเข้าต้องเดาเอง
   * เทียบด้วย nameKey (ไม่สนตัวพิมพ์เล็กใหญ่ และรวม "ำ" สองรูป) ซึ่ง UNIQUE ของฐานจับไม่ครบ
   */
  async function assertNotAlias(name) {
    if (!alias) return;
    const clash = (await loadAliases()).find((row) => nameKey(row.alias) === nameKey(name));
    if (clash) {
      throw conflict(`ชื่อนี้เป็นชื่อเรียกอื่นของ${label}อีกรายการอยู่แล้ว`, {
        code: "name_is_alias",
        detail: `ลบชื่อเรียกอื่น "${clash.alias}" ออกก่อน หรือใช้ชื่ออื่น`,
      });
    }
  }

  // ---------- ชื่อเรียกอื่น (ADR-0025) ----------
  //
  // ลงทะเบียนก่อน `${path}/:id` — ไม่งั้น "/aliases" ถูกอ่านเป็น id แล้วตอบ 400

  if (alias) {
    const aliasBody = z.object({ alias: requiredText("ชื่อเรียกอื่น", 255) });

    router.get(
      `${path}/aliases`,
      asyncHandler(async (req, res) => {
        const rows = await loadAliases();
        cache.referenceData(res);
        res.json(rows.sort((a, b) => thaiCollator.compare(a.alias, b.alias)));
      })
    );

    router.post(
      `${path}/:id/aliases`,
      requireAdmin,
      validate({ params: idParam, body: aliasBody }),
      asyncHandler(async (req, res) => {
        const text = normalizeName(req.body.alias);
        const [names] = await db.query(`SELECT id, name FROM \`${table}\``);
        if (!names.some((row) => row.id === req.params.id)) throw notFound(`ไม่พบ${label}ที่ต้องการ`);

        const sameName = names.find((row) => nameKey(row.name) === nameKey(text));
        if (sameName) {
          throw conflict(`ชื่อนี้เป็นชื่อหลักของ${label}อยู่แล้ว`, {
            code: "alias_is_name",
            detail: `"${sameName.name}" จับคู่ได้อยู่แล้วโดยไม่ต้องเพิ่มชื่อเรียกอื่น`,
          });
        }

        const taken = (await loadAliases()).find((row) => nameKey(row.alias) === nameKey(text));
        if (taken) {
          const owner = names.find((row) => row.id === taken.target_id);
          throw conflict("ชื่อเรียกอื่นนี้มีอยู่แล้ว", {
            code: "alias_taken",
            detail: `"${taken.alias}" ชี้ไปที่${label} "${owner?.name ?? taken.target_id}"`,
          });
        }

        // ด่านข้างบนคือตัวกันหลัก UNIQUE ของ alias เป็นแค่ชั้นสำรองของคำขอที่มาพร้อมกัน
        // (collation ของฐานกับ nameKey เทียบไม่เหมือนกันทุกกรณี) — ชนแล้วตอบรหัสเดียวกับด่านข้างบน
        let result;
        try {
          [result] = await db.query(
            `INSERT INTO \`${alias.table}\` (\`${alias.column}\`, alias) VALUES (?, ?)`,
            [req.params.id, text]
          );
        } catch (err) {
          if (err.code !== "ER_DUP_ENTRY") throw err;
          throw conflict("ชื่อเรียกอื่นนี้มีอยู่แล้ว", { code: "alias_taken", detail: `"${text}" มีอยู่ในระบบแล้ว` });
        }
        res.status(201).json({ id: result.insertId, target_id: req.params.id, alias: text });
      })
    );

    router.delete(
      `${path}/aliases/:id`,
      requireAdmin,
      validate({ params: idParam }),
      asyncHandler(async (req, res) => {
        const [result] = await db.query(`DELETE FROM \`${alias.table}\` WHERE id = ?`, [req.params.id]);
        if (!result.affectedRows) throw notFound("ไม่พบชื่อเรียกอื่นที่ต้องการลบ");
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

      res.json({ message: `ลบ${label}เรียบร้อยแล้ว` });
    })
  );
}

// ชื่อเรียกอื่นมีเฉพาะสามตารางที่ชื่อไม่ซ้ำทั้งระบบ — ชื่อชั้นและแผนกซ้ำกันได้คนละอาคาร/ฝ่าย
// ชื่อเรียกอื่นของสองตารางนั้นจึงต้องผูกตารางแม่ด้วย ยังไม่ทำจนกว่าจะเจอกรณีจริง (ADR-0025)
registerLookup({ table: "brand", path: "/brands", label: "ยี่ห้อ", maxLength: 100, alias: { table: "brand_alias", column: "brand_id" } });
registerLookup({ table: "building", path: "/buildings", label: "อาคาร", alias: { table: "building_alias", column: "building_id" } });
registerLookup({ table: "division", path: "/divisions", label: "ฝ่าย", alias: { table: "division_alias", column: "division_id" } });

// floor และ department ผูกกับตารางแม่ — ถ้าไม่บันทึก building_id / division_id
// ไปด้วย ชั้นจะลอยไม่สังกัดอาคารไหน และตัวกรองแบบลูกโซ่ในหน้าเว็บจะกรองไม่ได้
registerLookup({ table: "floor", path: "/floors", label: "ชั้น", maxLength: 50, parentField: "building_id" });
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

    res.json({ message: "ลบปีงบประมาณเรียบร้อยแล้ว" });
  })
);

module.exports = router;
