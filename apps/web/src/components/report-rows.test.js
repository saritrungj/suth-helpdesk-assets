import { describe, expect, test } from "vitest";
import { deviceReportRows, readingsByDevice } from "./report-rows";

const FY = ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03"];

const place = (id, name) => ({
  building_id: id, building_name: `ตึก ${name}`, floor_id: id * 10, floor_name: `ชั้น ${name}`,
  location: `ห้อง ${name}`, division_id: id, division_name: `ฝ่าย ${name}`,
  department_id: id * 10 + 1, department_name: `แผนก ${name}`,
});

const DEVICE = { id: 1, serial_number: "SN-1", ...place(2, "B") };
const period = (id, name, from, to = null) => ({ id, device_id: 1, ...place(name === "A" ? 1 : name === "B" ? 2 : 3, name), effective_from: from, effective_to: to });

function rows({ periods = [], readings = [], displayMonths = FY, device = DEVICE } = {}) {
  return deviceReportRows({
    device,
    periods,
    readings: readingsByDevice(readings)[device.id],
    fyMonths: FY,
    displayMonths,
    runLabel: (months) => `${months[0]}..${months[months.length - 1]}`,
  });
}

const reading = (month, pages, locationHistoryId) => ({ device_id: 1, month, pages_printed: pages, location_history_id: locationHistoryId });

describe("แบ่งแถวตามที่ตั้งของแต่ละเดือน", () => {
  test("เครื่องที่ไม่เคยย้ายเป็นแถวเดียว ใช้ที่ตั้งปัจจุบัน และไม่มีป้ายช่วง", () => {
    const result = rows({ periods: [period(1, "B", "2024-01-01")], readings: [reading("2025-10", 5, 1)] });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ _row_key: "1", _is_moved_group: false, _period_label: "", division_name: "ฝ่าย B" });
  });

  test("เดือนก่อนมีประวัติกับช่วงแรกที่อยู่ที่เดียวกันรวมเป็นแถวเดียว", () => {
    // เครื่องส่วนใหญ่มีประวัติช่วงเดียวที่เริ่มวันลงทะเบียน — ต้องไม่ถูกแตกเป็นสองแถว
    const result = rows({ periods: [period(1, "B", "2026-01-15")] });
    expect(result).toHaveLength(1);
    expect(Object.keys(result[0]._monthly)).toEqual(FY);
  });

  test("ย้าย A → B → A ได้สามแถวตามลำดับเวลา แต่ละแถวเห็นแค่เดือนของตัวเอง", () => {
    const result = rows({
      periods: [
        period(1, "A", "2025-10-01", "2025-12-01"),
        period(2, "B", "2025-12-01", "2026-02-10"),
        period(3, "A", "2026-02-10"),
      ],
    });
    expect(result.map((r) => r.division_name)).toEqual(["ฝ่าย A", "ฝ่าย B", "ฝ่าย A"]);
    expect(result.map((r) => Object.keys(r._monthly))).toEqual([
      ["2025-10", "2025-11"], ["2025-12", "2026-01"], ["2026-02", "2026-03"],
    ]);
    expect(result.map((r) => r._period_label)).toEqual(["2025-10..2025-11", "2025-12..2026-01", "2026-02..2026-03"]);
    expect(new Set(result.map((r) => r._row_key)).size).toBe(3);
  });

  test("เครื่องที่ลงทะเบียนกลางปีแล้วย้าย ไม่มีแถวว่างของเดือนก่อนลงทะเบียน", () => {
    const periods = [period(1, "A", "2025-12-10", "2026-02-01"), period(2, "B", "2026-02-01")];
    expect(rows({ periods }).map((r) => r.division_name)).toEqual(["ฝ่าย A", "ฝ่าย B"]);

    // แต่ถ้ามียอดในเดือนเหล่านั้น ต้องแสดงตามที่ตั้งปัจจุบันเหมือน API ไม่ทิ้งยอด
    const withReading = rows({ periods, readings: [reading("2025-10", 8, null)] });
    expect(withReading.map((r) => r.division_name)).toEqual(["ฝ่าย B", "ฝ่าย A", "ฝ่าย B"]);
    expect(withReading[0]._monthly["2025-10"]).toBe(8);
  });

  test("ปีงบเก่าที่เครื่องอยู่ที่อื่นทั้งปี แสดงที่ตั้งเดิมพร้อมป้ายว่าไม่ใช่ที่ปัจจุบัน", () => {
    const result = rows({ periods: [period(1, "A", "2024-01-01", "2026-06-01"), period(2, "B", "2026-06-01")] });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ division_name: "ฝ่าย A", _is_moved_group: true, _period_index: 1, _period_count: 1 });
  });

  test("ช่วงที่ไม่มีเดือนไหนถูกเลือกแสดง ไม่ต้องขึ้นเป็นแถวว่าง", () => {
    const result = rows({
      periods: [period(1, "A", "2025-10-01", "2026-01-20"), period(2, "B", "2026-01-20")],
      displayMonths: ["2026-02"],
    });
    expect(result.map((r) => r.division_name)).toEqual(["ฝ่าย B"]);
    // ยังบอกว่าเป็นช่วงที่ 2 จาก 2 เพื่อให้รู้ว่ามีอีกช่วงที่ไม่ได้แสดง
    expect(result[0]).toMatchObject({ _period_index: 2, _period_count: 2 });
  });
});

describe("เดือนที่มียอดเชื่อการจัดของ API", () => {
  const periods = [period(1, "A", "2025-10-01"), period(2, "B", "2026-01-01")];

  test("API จัดยอดให้ช่วงไหน ยอดอยู่แถวนั้น แม้กฎฝั่งเว็บจะตอบต่างไป", () => {
    const result = rows({ periods, readings: [reading("2026-02", 40, 1)] });
    const owner = result.find((r) => r._monthly["2026-02"] === 40);
    expect(owner.division_name).toBe("ฝ่าย A");
    expect(result.reduce((sum, r) => sum + (r._total ?? 0), 0)).toBe(40);
  });

  test("API บอกว่าไม่มีช่วงครอบคลุม (null) ใช้ที่ตั้งปัจจุบัน", () => {
    const result = rows({ periods, readings: [reading("2026-02", 40, null)] });
    expect(result.find((r) => r._monthly["2026-02"] === 40).division_name).toBe("ฝ่าย B");
  });

  test("API รุ่นที่ไม่ได้ส่งช่วงมา หรือช่วงที่ไม่อยู่ในประวัติที่โหลดมา ใช้กฎฝั่งเว็บแทน", () => {
    const withoutField = rows({ periods, readings: [{ device_id: 1, month: "2025-11", pages_printed: 9 }] });
    expect(withoutField.find((r) => r._monthly["2025-11"] === 9).division_name).toBe("ฝ่าย A");

    const unknownPeriod = rows({ periods, readings: [reading("2025-11", 9, 999)] });
    expect(unknownPeriod.find((r) => r._monthly["2025-11"] === 9).division_name).toBe("ฝ่าย A");
  });
});

describe("ช่องว่าง ศูนย์ และสถานะยอด", () => {
  test("ยอด 0 ที่บันทึกจริงนับเป็นเดือนที่มียอด เดือนที่ไม่มียอดเป็น null", () => {
    const [row] = rows({ readings: [reading("2025-10", 0, null), reading("2025-11", 12, null)] });
    expect(row._monthly["2025-10"]).toBe(0);
    expect(row._monthly["2025-12"]).toBeNull();
    expect(row._total).toBe(12);
    expect(row._record_status).toBe("partial");
  });

  test("แถวที่ยังไม่มียอดเลย ยอดรวมเป็น null ไม่ใช่ 0", () => {
    const [row] = rows();
    expect(row._total).toBeNull();
    expect(row._record_status).toBe("none");
  });

  test("ยอดครบทุกเดือนที่แสดง นับว่าครบ แม้เดือนอื่นของปีงบยังไม่มี", () => {
    const [row] = rows({ readings: [reading("2025-10", 1, null)], displayMonths: ["2025-10"] });
    expect(row._record_status).toBe("done");
  });
});
