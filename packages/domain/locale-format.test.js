const test = require("node:test");
const assert = require("node:assert/strict");

const { formatMonth } = require("./locale-format.cjs");

test("formats a fiscal month in English", () => {
  assert.equal(formatMonth("2568-10", { locale: "en" }), "Oct 2025");
});
