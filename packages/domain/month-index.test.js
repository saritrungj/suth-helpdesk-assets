const { test } = require("node:test");
const assert = require("node:assert/strict");
const { monthIndex } = require("./index.cjs");

test("month adjacency crosses calendar and fiscal year boundaries", () => {
  assert.equal(monthIndex("2026-01") - monthIndex("2025-12"), 1);
  assert.equal(monthIndex("2025-10") - monthIndex("2025-09"), 1);
  assert.equal(monthIndex("2026-03") - monthIndex("2026-01"), 2);
});
