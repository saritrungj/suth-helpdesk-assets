// apps/api/src/print-usage/write-readings.test.js
//
// ยอดเก่าที่หาราคาไม่ได้อยู่แล้วหนึ่งเดือน ต้องไม่ล็อกการบันทึกเดือนอื่นของเครื่อง (#154)
//
// หน้าต่างกรอกทั้งปีส่งครบทุกเดือนเสมอ ถ้าเครื่องมียอดเก่า (ก่อน ADR-0021) ที่หาราคาไม่ได้ในเดือน ก.พ.
// การแก้เดือน เม.ย. ถูกปฏิเสธทั้งชุดเพราะ ก.พ. ถูกส่งซ้ำด้วยค่าเดิม ขณะที่ตารางกรอกรายเดือนบันทึก
// ค่าเดียวกันได้ — ยอดเก่าแบบนี้สร้างผ่าน API ไม่ได้แล้ว เทสจึงใช้ connection จำลอง

const test = require("node:test");
const assert = require("node:assert/strict");
require("../auth/unit-test-users"); // บัญชีจำลองแทนการอ่านฐาน (#208)

const { writeReadings } = require("./routes");

const METER = 501;
/** ยอดในฐานก่อนบันทึก — ก.พ. เป็นยอดเก่าที่หาราคาไม่ได้ */
const STORED = { "2026-02": 10 };
const UNPRICED_MONTHS = new Set(["2026-02"]);

function fakeConnection() {
  return {
    async query(sql, params) {
      const text = String(sql);
      if (text.includes("FROM device_meter dm")) return [[{ id: METER }]];
      if (text.startsWith("SELECT pages FROM print_transactions")) {
        const month = params[1];
        return [[month in STORED ? { pages: STORED[month] } : undefined].filter(Boolean)];
      }
      if (text.includes("FROM v_monthly_kpi v")) {
        const [months] = params;
        const rows = months
          .filter((month) => UNPRICED_MONTHS.has(month))
          .map((month) => ({ meter_id: METER, month, serial_number: "TEST-LEGACY", category_name: "ขาวดำ", history_id: null }));
        return [rows];
      }
      return [{ affectedRows: 1, insertId: 1 }];
    },
  };
}

test("ส่งยอดเก่าที่หาราคาไม่ได้ซ้ำด้วยค่าเดิม ไม่ทำให้การบันทึกเดือนอื่นถูกปฏิเสธ", async () => {
  const result = await writeReadings(fakeConnection(), [
    { deviceId: 7, month: "2026-02", pages: 10 },
    { deviceId: 7, month: "2026-04", pages: 77 },
  ]);
  assert.equal(result.saved, 2);
});

test("แก้ค่าของเดือนที่หาราคาไม่ได้ ยังถูกปฏิเสธเหมือนเดิม (ADR-0021)", async () => {
  await assert.rejects(
    writeReadings(fakeConnection(), [{ deviceId: 7, month: "2026-02", pages: 11 }]),
    (error) => error.code === "unpriced_reading"
  );
});

test("ยอดใหม่ในเดือนที่หาราคาไม่ได้ ยังถูกปฏิเสธเหมือนเดิม", async () => {
  delete STORED["2026-03"];
  UNPRICED_MONTHS.add("2026-03");
  try {
    await assert.rejects(
      writeReadings(fakeConnection(), [{ deviceId: 7, month: "2026-03", pages: 5 }]),
      (error) => error.code === "unpriced_reading"
    );
  } finally {
    UNPRICED_MONTHS.delete("2026-03");
  }
});
