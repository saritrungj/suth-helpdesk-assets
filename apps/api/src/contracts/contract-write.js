// apps/api/src/contracts/contract-write.js
//
// รูปแบบข้อมูลสัญญาที่รับ และการเขียนสัญญาพร้อมรายการราคา — หน้าสัญญาและหน้านำเข้าไฟล์ (import session
// สร้างสัญญาจากหัวไฟล์) ใช้ชุดเดียวกัน ย้ายมาจาก contracts/routes.js โดยไม่เปลี่ยนพฤติกรรม (#179)

const { z } = require("zod");
const { requiredText, requiredPrice, dateString, booleanQuery } = require("../shared/validate");
const { notFound } = require("../shared/http-error");

/** ค่าเช่าคงที่ต่อเดือน — จำนวนเงินจริง ทศนิยมไม่เกินสองตำแหน่ง */
const optionalBaht = z
  .preprocess((value) => (value === "" || value === undefined ? null : value), z.union([
    z.null(),
    z.coerce.string().trim()
      .regex(/^\d+(\.\d{1,2})?$/, "ค่าเช่าต้องเป็นจำนวนเงินไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง")
      // คอลัมน์เป็น DECIMAL(12,2) — เกินนี้ฐานข้อมูลปฏิเสธเป็น 500 แทนที่จะบอกผู้ใช้
      .refine((value) => Number(value) < 1e10, "ค่าเช่าสูงเกินกว่าที่ระบบเก็บได้"),
  ]))
  .transform((value) => (value === null ? null : Number(value)));

/** อัตรา VAT เป็นเปอร์เซ็นต์ เช่น 7 */
const optionalVatRate = z
  .preprocess((value) => (value === "" || value === undefined ? null : value), z.union([
    z.null(),
    z.coerce.number().min(0, "อัตรา VAT ต้องไม่ติดลบ").max(100, "อัตรา VAT ต้องไม่เกิน 100"),
  ]));

const MAX_TERM_YEARS = 10;

const priceLine = z.object({
  category_id: z.coerce.number({ error: "กรุณาเลือกหมวด" }).int().positive("กรุณาเลือกหมวด"),
  price_per_page: requiredPrice,
});

const contractBody = z
  .object({
    contract_no: requiredText("เลขที่สัญญา", 100),
    effective_from: dateString,
    effective_to: dateString,
    price_lines: z.array(priceLine).min(1, "สัญญาต้องมีรายการราคาอย่างน้อยหนึ่งรายการ").max(20),
    monthly_rental: optionalBaht,
    vat_rate: optionalVatRate,
    preview: booleanQuery.optional(),
  })
  .refine((body) => body.effective_to >= body.effective_from, {
    message: "วันสิ้นสุดสัญญาต้องไม่มาก่อนวันเริ่ม",
    path: ["effective_to"],
  })
  // v_contract_invoice กางค่าเช่าทีละเดือนตลอดอายุสัญญา ปี พ.ศ. ที่พิมพ์ปนมา (2571 แทน 2028)
  // จะทำให้สัญญายาวหลายพันเดือนจนหน้าค่าใช้จ่ายของทุกคนล่ม — จึงรับเฉพาะปี ค.ศ. และไม่เกิน 10 ปี
  .refine((body) => [body.effective_from, body.effective_to].every((date) => date >= "2000-01-01" && date <= "2100-12-31"), {
    message: "วันที่ของสัญญาต้องเป็นปี ค.ศ. 2000–2100",
    path: ["effective_to"],
  })
  .refine((body) => body.effective_to < `${Number(body.effective_from.slice(0, 4)) + MAX_TERM_YEARS}${body.effective_from.slice(4)}`, {
    message: `อายุสัญญาต้องไม่เกิน ${MAX_TERM_YEARS} ปี`,
    path: ["effective_to"],
  })
  .refine(
    (body) => new Set(body.price_lines.map((line) => line.category_id)).size === body.price_lines.length,
    { message: "หมวดเดียวกันมีได้ราคาเดียวต่อสัญญา", path: ["price_lines"] }
  );

async function writeContract(conn, contractId, body) {
  const { contract_no, effective_from, effective_to, price_lines, monthly_rental, vat_rate } = body;

  let id = contractId;
  if (id) {
    const [result] = await conn.query(
      `UPDATE contracts
       SET contract_no = ?, effective_from = ?, effective_to = ?, monthly_rental = ?, vat_rate = ?
       WHERE id = ?`,
      [contract_no, effective_from, effective_to, monthly_rental, vat_rate, id]
    );
    if (!result.affectedRows) throw notFound("ไม่พบสัญญาที่ต้องการแก้ไข");
    await conn.query("DELETE FROM contract_price_line WHERE contract_id = ?", [id]);
  } else {
    const [result] = await conn.query(
      `INSERT INTO contracts (contract_no, effective_from, effective_to, monthly_rental, vat_rate)
       VALUES (?, ?, ?, ?, ?)`,
      [contract_no, effective_from, effective_to, monthly_rental, vat_rate]
    );
    id = result.insertId;
  }

  await conn.query(
    "INSERT INTO contract_price_line (contract_id, category_id, price_per_page) VALUES ?",
    [price_lines.map((line) => [id, line.category_id, line.price_per_page])]
  );
  return id;
}

module.exports = { contractBody, writeContract, MAX_TERM_YEARS };
