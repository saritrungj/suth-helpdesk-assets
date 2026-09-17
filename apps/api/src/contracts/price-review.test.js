// apps/api/src/contracts/price-review.test.js
//
// GET /api/contracts/price-review ต้องนับยอดที่หาราคาไม่ได้ตามสัญญาที่ราคามาจริง และ
// เฉพาะปีงบของสัญญานั้น — เดิมนับยอดทุกปีงบตามสัญญาปัจจุบันของเครื่อง หน้าตรวจจึงขึ้น
// ว่ายังค้างหลายร้อยรายการทั้งที่ยืนยันช่วงครบแล้ว (#96)
//
// ดักคิวรี่ที่ route ส่งออกไปจริง ไม่ได้อ่านข้อความในไฟล์ต้นฉบับ ส่วนผลกับข้อมูลจริง
// ตรวจใน e2e ชุด db (report-workflow.spec.js)

const test = require("node:test");
const assert = require("node:assert/strict");

const db = require("../shared/db");
const router = require("./routes");

async function capturePriceReviewSql(rows = []) {
  const layer = router.stack.find(
    (entry) => entry.route?.path === "/price-review" && entry.route.methods.get
  );
  const handler = layer.route.stack.at(-1).handle;
  const calls = [];
  const originalQuery = db.query;
  db.query = async (sql, params = []) => {
    calls.push({ sql: String(sql).replace(/\s+/g, " "), params });
    return [rows];
  };

  try {
    const body = await new Promise((resolve, reject) => {
      handler({ query: {}, user: { role: "admin" } }, { set() {}, json: resolve }, reject);
    });
    return { body, sql: calls[0].sql };
  } finally {
    db.query = originalQuery;
  }
}

test("price review attributes unpriced readings to the contract the price comes from", async () => {
  const { sql } = await capturePriceReviewSql();

  assert.match(sql, /CASE WHEN dch\.id IS NOT NULL THEN dch\.contract_id ELSE d\.contract_id END AS contract_id/);
  assert.match(sql, /ORDER BY dch_candidate\.effective_from DESC, dch_candidate\.id DESC LIMIT 1/);
  assert.match(sql, /WHERE v\.total_cost IS NULL/);
});

test("price review only counts readings inside the contract's fiscal year", async () => {
  const { sql } = await capturePriceReviewSql();
  const counts = sql.slice(sql.indexOf("review_counts AS"), sql.indexOf("GROUP BY u.contract_id"));

  assert.match(counts, /WHERE \(fy\.start_month IS NULL OR u\.month >= fy\.start_month\) AND \(fy\.end_month IS NULL OR u\.month <= fy\.end_month\)/);
  // ยอดนอกช่วงนับเฉพาะสัญญาที่ยืนยันช่วงแล้ว ส่วนที่เหลือของปีงบคือ "รอยืนยัน"
  // ผลรวมของสองช่องจึงเท่ากับยอดของสัญญาในปีงบนั้นเสมอ
  assert.match(counts, /WHEN c\.price_verified_at IS NOT NULL AND c\.effective_from IS NOT NULL AND \(u\.month < DATE_FORMAT\(c\.effective_from, '%Y-%m'\) OR \(c\.effective_to IS NOT NULL AND u\.month > DATE_FORMAT\(c\.effective_to, '%Y-%m'\)\)\)/);
  assert.match(sql, /COALESCE\(rc\.fiscal_year_readings - rc\.outside_term_readings, 0\) AS unpriced_readings/);
  assert.match(sql, /COALESCE\(rc\.outside_term_readings, 0\) AS outside_term_readings/);
});

test("price review lists contracts that are unconfirmed or still have readings to review", async () => {
  const { sql, body } = await capturePriceReviewSql([
    {
      id: 1,
      contract_no: "CT-001/2569",
      price_verified_at: "2026-09-16 12:00:00",
      effective_from: "2025-10-01",
      effective_to: "2026-01-15",
      fiscal_start_month: "2025-10",
      fiscal_end_month: "2026-09",
      unpriced_readings: 0,
      outside_term_readings: 154,
    },
  ]);

  assert.match(sql, /WHERE c\.price_verified_at IS NULL OR c\.effective_from IS NULL /);
  assert.match(sql, /OR rc\.contract_id IS NOT NULL ORDER BY/);
  assert.equal(body.pending, 1);
  assert.equal(body.contracts[0].price_confirmed, true);
  assert.equal(body.contracts[0].outside_term_readings, 154);
});
