import { describe, expect, it, test } from "vitest";
import {
  autoMadeLines,
  blockingItems,
  contractBodyFromForm,
  contractFormFromPrefill,
  decisionsPayload,
  eventDetail,
  fiscalYearForMonths,
  statusOf,
} from "./import-session";

describe("decisionsPayload", () => {
  test("แปลงค่าในกล่องเลือกเป็นการตัดสินใจ และแนบเหตุผลที่ยอมรับความต่างของสัญญา", () => {
    const payload = decisionsPayload(
      {
        names: { building: { "อาคาร ก": "create", "ตึก ก": "new:อาคาร ก" } },
        renames: { building: { "อาคาร ก": "อาคารกลาง" } },
        models: { "oki|es5112": { category: "2", color: false } },
      },
      { "contract:X:rental": "ตามบันทึกแก้ไขสัญญา", "contract:X:vat": " " }
    );
    expect(payload.names.building["อาคาร ก"]).toEqual({ action: "create", as: "อาคารกลาง" });
    expect(payload.names.building["ตึก ก"]).toEqual({ action: "alias", target_new: "อาคาร ก" });
    expect(payload.models["oki|es5112"]).toEqual({ meter_category_id: 2, has_color_meter: false });
    expect(payload.acknowledged).toEqual({ "contract:X:rental": "ตามบันทึกแก้ไขสัญญา" });
  });

  test("ไม่มีเหตุผลที่ใช้ได้ ไม่ส่ง acknowledged", () => {
    expect(decisionsPayload({ names: {}, models: {}, renames: {} }, { a: "" })).not.toHaveProperty("acknowledged");
  });
});

describe("ฟอร์มสัญญาจากหัวไฟล์", () => {
  test("เติมค่าที่อ่านได้ และแปลงกลับเป็น body ของ API — ช่องว่างเป็น null ราคาว่างไม่ส่ง", () => {
    const form = contractFormFromPrefill({
      contract_no: "TEST 2/2567",
      effective_from: "2024-09-29",
      effective_to: "2027-09-29",
      monthly_rental: "2333.65",
      vat_rate: "7",
      price_lines: [{ category_id: 2, category_name: "A4", price_per_page: "0.41" }, { category_id: 3, category_name: "MFP", price_per_page: null }],
    });
    expect(form.monthly_rental).toBe("2333.65");
    form.vat_rate = "";
    const body = contractBodyFromForm(form);
    expect(body.vat_rate).toBeNull();
    expect(body.price_lines).toEqual([{ category_id: 2, price_per_page: "0.41" }]);
  });
});

describe("fiscalYearForMonths", () => {
  const list = [
    { id: 1, start_month: "2024-10", end_month: "2025-09" },
    { id: 2, start_month: "2025-10", end_month: "2026-09" },
    { id: 5, start_month: "2028-10", end_month: "2029-09" },
  ];
  test("ปีงบที่ครอบงวดล่าสุดในไฟล์", () => {
    expect(fiscalYearForMonths(list, ["2026-03", "2026-08"]).id).toBe(2);
  });
  test("ไม่มีงวด (ไฟล์ทะเบียน) → null", () => {
    expect(fiscalYearForMonths(list, [])).toBeNull();
  });
});

describe("ป้ายและรายละเอียด", () => {
  test("สถานะที่ไม่รู้จักยังแสดงได้", () => {
    expect(statusOf("ready").tone).toBe("ok");
    expect(statusOf("weird").label).toBe("weird");
  });
  test("รายละเอียดของการบันทึกสำเร็จบอกจำนวนครบ", () => {
    expect(eventDetail({ event: "completed", detail: { devices_created: 3, devices_filled: 1, readings_new: 6, readings_overwritten: 0 } })).toContain("3");
  });
  test("รายการที่ยังกันการบันทึก รวมสิ่งที่รอขั้นก่อนหน้า", () => {
    const items = blockingItems({ checklist: [{ state: "ok" }, { state: "blocking" }, { state: "waiting" }, { state: "warning" }] });
    expect(items).toHaveLength(2);
  });
});

describe("autoMadeLines (#190)", () => {
  it("สรุปสิ่งที่ระบบสร้างให้เป็นบรรทัดที่คนอ่าน — สัญญา ปีงบ ชื่อ และหมวดของรุ่น", () => {
    const lines = autoMadeLines({
      contracts: [{ contract_no: "C1/2569", effective_from: "2026-02-24", effective_to: "2029-02-23" }],
      fiscal_years: ["2569"],
      names: [
        { kind: "building", name: "อาคาร ก", decision: "create" },
        { kind: "building", name: "อาคาร  ก.", decision: "alias", target: "อาคาร ก" },
        { kind: "brand", name: "Brother", decision: "create" },
      ],
      models: [{ name: "Brother HL-L5210DN", category: "a4-laser-bw" }],
    });
    expect(lines[0]).toContain("C1/2569");
    expect(lines).toContain("จะสร้างปีงบ 2569"); // เตรียมไว้ — สร้างจริงเมื่อกดยืนยัน (#207)
    expect(lines.some((l) => l.includes("Brother") && l.includes("1 รายการ"))).toBe(true);
    expect(lines.some((l) => l.includes("“อาคาร  ก.” คือ “อาคาร ก”"))).toBe(true);
    expect(lines.at(-1)).toContain("a4-laser-bw");
  });

  it("ไม่มีอะไรสร้าง → ไม่มีบรรทัด", () => {
    expect(autoMadeLines({})).toEqual([]);
    expect(autoMadeLines(undefined)).toEqual([]);
  });
});
