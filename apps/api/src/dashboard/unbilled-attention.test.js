// apps/api/src/dashboard/unbilled-attention.test.js
//
// งานค้างของยอดที่หาราคาไม่ได้ต้องพาไปยังหน้าที่แก้สาเหตุนั้นได้จริง (#96) — เดิมทุก
// สาเหตุรวมเป็นรายการเดียวที่ลิงก์ไปหน้าตรวจสัญญา ซึ่งไม่แสดงยอดส่วนใหญ่เลย

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildUnbilledAttention } = require("./overview");

test("งานราคาที่ค้างพาไปยังหน้าที่แก้สาเหตุนั้นได้จริง", () => {
  const items = buildUnbilledAttention({
    outside_term_device_count: 2,
    outside_term_readings: 5,
    outside_term_pages: 1200,
    unassigned_device_count: 1,
    unassigned_readings: 11,
    unassigned_pages: "38003",
    unassigned_first_target: "2025-10|00000000000000000002",
    contract_history_device_count: 1,
    contract_history_readings: 3,
    contract_history_pages: 900,
    contract_history_first_target: "2025-10|00000000000000000042",
    missing_price_line_device_count: 0,
  });

  assert.deepEqual(items.map((item) => item.code), [
    "unpriced_outside_term",
    "unassigned_unbilled_devices",
    "unpriced_contract_history",
  ]);
  assert.deepEqual(items[0].action, { label: "ไปตรวจอายุสัญญา", to: "/admin/contracts" });
  // เปิดฟอร์มของเครื่องนั้นเลย — พาไปแค่รายการเครื่องแล้วผู้ใช้ไม่รู้ว่าต้องทำอะไรต่อ
  assert.deepEqual(items[1].action, {
    label: "ไปผูกสัญญาให้เครื่อง",
    to: "/assets",
    query: { unassigned: "true", edit: "2", billing_from: "2025-10-01" },
  });
  // SUM() ของ MySQL กลับมาเป็นข้อความ ต้องแปลงเป็นตัวเลขก่อนส่งให้หน้าเว็บ
  assert.deepEqual(items[1].params, { readings: 11, pages: 38003 });
  assert.equal(items[1].detail, "11 รายการ รวม 38,003 แผ่น ยังไม่ถูกนับในยอดเงิน");
  assert.deepEqual(items[2].action, {
    label: "ไปตรวจประวัติสัญญาของเครื่อง",
    to: "/assets",
    query: { edit: "42", billing_from: "2025-10-01" },
  });
});

test("สัญญาที่ไม่มีราคาของหมวดมิเตอร์พาไปแก้รายการราคาของสัญญา", () => {
  const items = buildUnbilledAttention({
    missing_price_line_device_count: 1,
    missing_price_line_readings: 6,
    missing_price_line_pages: 3166,
  });

  assert.deepEqual(items.map((item) => item.code), ["unpriced_missing_price_line"]);
  assert.deepEqual(items[0].params, { readings: 6, pages: 3166 });
  assert.deepEqual(items[0].action, { label: "ไปตรวจรายการราคาของสัญญา", to: "/admin/contracts" });
});

test("ไม่รู้ว่าเครื่องไหนก็ยังพาไปรายการที่กรองไว้", () => {
  const [item] = buildUnbilledAttention({
    unassigned_device_count: 1,
    unassigned_readings: 1,
    unassigned_pages: 10,
  });
  assert.deepEqual(item.action, { label: "ไปผูกสัญญาให้เครื่อง", to: "/assets", query: { unassigned: "true" } });
});

test("ไม่มียอดค้างก็ไม่มีงาน", () => {
  assert.deepEqual(buildUnbilledAttention(undefined), []);
  assert.deepEqual(buildUnbilledAttention({ outside_term_device_count: 0 }), []);
});
