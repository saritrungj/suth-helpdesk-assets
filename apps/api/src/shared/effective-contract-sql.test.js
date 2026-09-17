"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { effectiveContractJoin, effectiveContractId } = require("./effective-contract-sql");

const squash = (sql) => sql.replace(/\s+/g, " ").trim();

test("effective contract join picks the same row as v_monthly_kpi", () => {
  const sql = squash(effectiveContractJoin({ deviceIdExpression: "v.device_id", monthExpression: "v.month", historyAlias: "dch" }));

  assert.match(sql, /^LEFT JOIN device_contract_history dch ON dch\.id = \(/);
  assert.match(sql, /dch_candidate\.device_id = v\.device_id/);
  assert.match(sql, /v\.month >= DATE_FORMAT\(dch_candidate\.effective_from, '%Y-%m'\)/);
  assert.match(sql, /v\.month <= DATE_FORMAT\(dch_candidate\.effective_to, '%Y-%m'\)/);
  assert.match(sql, /ORDER BY dch_candidate\.effective_from DESC, dch_candidate\.id DESC LIMIT 1/);

  // ถ้า view เปลี่ยนกติกา คิวงานต้องเปลี่ยนตาม ไม่งั้นจะชี้ไปคนละสัญญากับที่ราคามาจริง
  const schema = squash(fs.readFileSync(path.join(__dirname, "../../../../database/schema.sql"), "utf8"));
  assert.match(schema, /ORDER BY h\.effective_from DESC, h\.id DESC LIMIT 1 \) LEFT JOIN contracts c ON c\.id = dch\.contract_id;/);
  assert.match(schema, /pt\.month <= DATE_FORMAT\(h\.effective_to, '%Y-%m'\)/);
});

test("a history row that says no contract is not replaced by the current contract", () => {
  assert.equal(
    effectiveContractId({ historyAlias: "dch", deviceAlias: "d" }),
    "CASE WHEN dch.id IS NOT NULL THEN dch.contract_id ELSE d.contract_id END"
  );
});
