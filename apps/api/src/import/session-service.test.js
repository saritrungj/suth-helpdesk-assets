// ส่วนที่ไม่แตะฐานของ import session (#179) — เส้นทางเต็มกับฐานจริงอยู่ที่ e2e ของหน้านำเข้า (#180)

const test = require("node:test");
const assert = require("node:assert/strict");
const { diffDecisions } = require("./session-service");
const { validateDecisions } = require("./decisions");

test("ประวัติเก็บเฉพาะการตัดสินใจที่เปลี่ยน พร้อมค่าก่อนและหลัง", () => {
  const before = { names: { building: { "อาคาร ก": { action: "create" } } }, models: {} };
  const after = {
    names: { building: { "อาคาร ก": { action: "alias", target_id: 3 } } },
    models: { "oki|es5112": { meter_category_id: 2, has_color_meter: false } },
  };
  const changes = diffDecisions(before, after);
  assert.deepEqual(changes.find((c) => c.path === "names.building.อาคาร ก.action"), { path: "names.building.อาคาร ก.action", before: "create", after: "alias" });
  assert.ok(changes.some((c) => c.path === "names.building.อาคาร ก.target_id" && c.before === null && c.after === 3));
  assert.ok(changes.some((c) => c.path === "models.oki|es5112.meter_category_id" && c.after === 2));
  assert.deepEqual(diffDecisions(after, after), []);
});

test("ยอมรับความต่างของสัญญาต้องมีเหตุผล", () => {
  assert.throws(() => validateDecisions({ acknowledged: { "contract:X:rental": " " } }), (err) => err.code === "invalid_decisions");
  assert.equal(validateDecisions({ acknowledged: { "contract:X:rental": "ตามบันทึกแก้ไขสัญญา" } }).acknowledged["contract:X:rental"], "ตามบันทึกแก้ไขสัญญา");
});
