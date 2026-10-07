const test = require("node:test");
const assert = require("node:assert/strict");
const { query } = require("./installation-summary");

test("current contract scope accepts multiple ids and unassigned, and deduplicates", () => {
  assert.deepEqual(query.parse({ contract_ids: "8,7,8" }), { contract_ids: [8, 7] });
  assert.deepEqual(query.parse({ contract_ids: "7,unassigned,7" }), { contract_ids: [7, "unassigned"] });
  assert.deepEqual(query.parse({}), {});
});

test("contract scope rejects malformed ids instead of broadening to all devices", () => {
  for (const contract_ids of ["", "0", "-1", "1,,2", "1 OR 1=1", "1.5", "9007199254740992"]) {
    assert.equal(query.safeParse({ contract_ids }).success, false, contract_ids);
  }
  assert.equal(query.safeParse({ contract_ids: Array.from({ length: 101 }, (_, i) => i + 1).join(",") }).success, false);
});
