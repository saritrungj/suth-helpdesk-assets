const test = require("node:test");
const assert = require("node:assert/strict");

const { setPrimaryMeterCategory, assertDeviceReadingsPriced } = require("./meters");

test("primary meter rejects a colour category", async () => {
  const replies = [
    [[{ id: 5 }]],
    [[{ id: 9, is_color: 1 }]],
  ];
  const conn = { query: async () => replies.shift() };

  await assert.rejects(
    setPrimaryMeterCategory(conn, 7, 9),
    (error) => error.status === 400 && error.code === "primary_meter_must_be_monochrome"
  );
});

test("device edit rejects an arrangement that makes an existing reading unpriced", async () => {
  const replies = [
    [[{ meterId: 5, month: "2026-03" }]],
    [[{
      meter_id: 5,
      month: "2026-03",
      serial_number: "SN-1",
      category_name: "A3 ขาวดำ",
      history_id: 2,
      contract_id: 3,
      contract_no: "CT-1",
      in_term: 0,
    }]],
  ];
  const conn = { query: async () => replies.shift() };

  await assert.rejects(
    assertDeviceReadingsPriced(conn, 7),
    (error) => error.status === 400 && error.code === "unpriced_reading"
  );
});

test("device edit still saves when the only unpriced reading was already unpriced before the edit", async () => {
  // เดือนเก่าที่หาราคาไม่ได้อยู่แล้วต้องไม่ล็อกการแก้เครื่องทั้งเครื่อง เช่น แก้เลข Serial ที่พิมพ์ผิด
  const replies = [
    [[{ meterId: 5, month: "2026-03" }, { meterId: 5, month: "2026-04" }]],
    [[{
      meter_id: 5,
      month: "2026-03",
      serial_number: "SN-1",
      category_name: "ขาวดำ",
      history_id: null,
      contract_id: null,
      contract_no: null,
      in_term: 0,
    }]],
  ];
  const conn = { query: async () => replies.shift() };

  await assertDeviceReadingsPriced(conn, 7, new Set(["5|2026-03"]));
});
