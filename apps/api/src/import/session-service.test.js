// ส่วนที่ไม่แตะฐานของ import session (#179) — เส้นทางเต็มกับฐานจริงอยู่ที่ e2e ของหน้านำเข้า (#180)

const test = require("node:test");
const assert = require("node:assert/strict");
const { diffDecisions, assertSeenLatest } = require("./session-service");
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

// หน้าที่ค้างเก่าต้องไม่เขียนทับหรือยืนยันสิ่งที่ไม่ได้เห็น (#227)
test("ลายนิ้วมือที่ผู้เรียกเห็นต้องตรงกับผลตรวจล่าสุด ไม่ส่งมา = ไม่ตรวจ", () => {
  const session = { fingerprint: "aaa" };
  const changed = (err) => err.status === 409 && err.code === "import_session_changed";

  assert.doesNotThrow(() => assertSeenLatest(session, "aaa"));
  assert.doesNotThrow(() => assertSeenLatest(session, undefined));
  assert.throws(() => assertSeenLatest(session, "bbb"), changed);
  assert.throws(() => assertSeenLatest(session, null), changed);
  // งานที่ยังไม่เคยตรวจผ่านไม่มีลายนิ้วมือ — หน้าเว็บส่ง null
  assert.doesNotThrow(() => assertSeenLatest({ fingerprint: null }, null));
  assert.throws(() => assertSeenLatest({}, "aaa"), changed);
});
