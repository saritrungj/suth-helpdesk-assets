const test = require("node:test");
const assert = require("node:assert/strict");
const { findProblems, relativeLinks, schemaObjects } = require("./check-docs.cjs");

const SCHEMA = `
CREATE TABLE devices (
    id INT PRIMARY KEY,
    CONSTRAINT chk_devices_order CHECK (id > 0)
);
CREATE OR REPLACE VIEW v_monthly_kpi AS SELECT 1;
`;

const DATA_MODEL = { file: "docs/reference/data-model.md", text: "ตาราง `devices` และ view `v_monthly_kpi` กันด้วย `chk_devices_order`" };

/** รันตัวตรวจกับเอกสารชุดเล็ก โดยถือว่ามีเฉพาะไฟล์ใน existing */
function problemsOf(docs, existing = []) {
  const known = new Set([...docs.map((doc) => doc.file), ...existing]);
  return findProblems({ docs, schemaSql: SCHEMA, exists: (file) => known.has(file) });
}

test("เอกสารที่ตรงกับ schema และลิงก์ครบ ผ่านโดยไม่มีปัญหา", () => {
  const docs = [DATA_MODEL, { file: "docs/README.md", text: "ดู [โมเดลข้อมูล](reference/data-model.md#view) และ [เว็บ](https://example.com)" }];
  assert.deepEqual(problemsOf(docs), []);
});

test("ลิงก์ที่ชี้ไฟล์ซึ่งไม่มีแล้วถูกรายงานพร้อมไฟล์ต้นทาง", () => {
  const docs = [DATA_MODEL, { file: "docs/how-to/a.md", text: "ดู [เก่า](../explanation/gone.md)" }];
  assert.deepEqual(problemsOf(docs), ["docs/how-to/a.md: ลิงก์ชี้ไฟล์ที่ไม่มี — ../explanation/gone.md"]);
});

test("ลิงก์คิดจากโฟลเดอร์ของไฟล์ต้นทาง และชี้โฟลเดอร์ได้", () => {
  const docs = [DATA_MODEL, { file: "docs/explanation/a.md", text: "[โค้ด](../../apps/api/src/) [ADR](../decisions/0001-x.md)" }];
  assert.deepEqual(problemsOf(docs, ["apps/api/src/", "docs/decisions/0001-x.md"]), []);
});

test("ข้อความในบล็อกโค้ดไม่นับเป็นลิงก์", () => {
  const text = "```text\n[ตัวอย่าง](missing.md)\n```\nและ `[อีกอัน](missing-too.md)`";
  assert.deepEqual(relativeLinks(text), []);
});

test("ตารางหรือ view ใน schema ที่ data-model.md ไม่ได้เอ่ยถึงถูกรายงาน", () => {
  const docs = [{ file: "docs/reference/data-model.md", text: "มีแค่ `devices`" }];
  assert.deepEqual(problemsOf(docs), ["docs/reference/data-model.md: ไม่มี v_monthly_kpi ที่อยู่ใน schema.sql"]);
});

test("อ่านทั้ง CREATE TABLE และ CREATE OR REPLACE VIEW", () => {
  assert.deepEqual(schemaObjects(SCHEMA), ["devices", "v_monthly_kpi"]);
});

test("ชื่อ constraint ที่ไม่มีใน schema ถูกรายงาน แต่การอ้างทั้งกลุ่มด้วย _* ไม่ถูกนับ", () => {
  const docs = [DATA_MODEL, { file: "docs/reference/x.md", text: "`CHECK chk_devices_old_name` และกลุ่ม `chk_devices_`*" }];
  assert.deepEqual(problemsOf(docs), ["docs/reference/x.md: อ้าง constraint ที่ไม่มีใน schema.sql — chk_devices_old_name"]);
});

test("คำที่เลิกใช้ถูกจับในหน้าอธิบายกฎ แต่ไม่จับใน ADR ซึ่งเป็นบันทึก ณ วันตัดสิน", () => {
  const docs = [
    DATA_MODEL,
    { file: "docs/explanation/domain.md", text: "รวมหน้าสุทธิของรายการราคา" },
    { file: "docs/decisions/0017-x.md", text: "จำนวนหน้าสุทธิเท่ากับ 0.98" },
  ];
  assert.deepEqual(problemsOf(docs), ['docs/explanation/domain.md: ใช้คำที่ CONTEXT.md ให้เลิกใช้ — "หน้าสุทธิ"']);
});

test("ไม่มี data-model.md ถือเป็นปัญหา ไม่ใช่ผ่านเงียบๆ", () => {
  assert.deepEqual(problemsOf([{ file: "docs/README.md", text: "ว่าง" }]), ["docs/reference/data-model.md: ไม่พบไฟล์"]);
});
