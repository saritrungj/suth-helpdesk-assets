"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { effectiveLocationJoin } = require("./effective-location-sql");

test("effective location join selects one deterministic row when ranges overlap", () => {
  const sql = effectiveLocationJoin({ deviceAlias: "d", monthExpression: "v.month", historyAlias: "h" });

  assert.match(sql, /NOT EXISTS/);
  assert.match(sql, /h_newer\.effective_from > h\.effective_from/);
  assert.match(sql, /h_newer\.id > h\.id/);
  assert.match(sql, /v\.month < DATE_FORMAT\(h\.effective_to/);
});
