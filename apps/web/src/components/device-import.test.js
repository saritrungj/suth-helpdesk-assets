import { expect, test } from "vitest";
import { blockingMessages, buildDecisions, initialChoices, nameOptions } from "./device-import";

test("แปลงสิ่งที่เลือกเป็น decisions ที่ API รับ", () => {
  const decisions = buildDecisions(
    {
      building: { "อาคาร ก": "create", "อาคาร ก (A)": "new:อาคาร ก", "อาคาร ข": "alias:3", "อาคาร ค": "" },
      brand: { OKI: "create" },
    },
    { "oki|es5112": { category: "2", color: false }, "hp|x": { category: "", color: true } }
  );
  expect(decisions).toEqual({
    names: {
      building: {
        "อาคาร ก": { action: "create" },
        "อาคาร ก (A)": { action: "alias", target_new: "อาคาร ก" },
        "อาคาร ข": { action: "alias", target_id: 3 },
      },
      brand: { OKI: { action: "create" } },
    },
    models: { "oki|es5112": { meter_category_id: 2, has_color_meter: false } },
  });
});

test("ชื่อเรียกอื่นของรายการใหม่ที่ถูกเปลี่ยนใจไม่สร้างแล้ว ไม่ถูกส่งไป", () => {
  const decisions = buildDecisions({ building: { "อาคาร ก": "", "อาคาร ก (A)": "new:อาคาร ก" } }, {});
  expect(decisions.names).toEqual({});
});

test("ตัวเลือกของชื่อ: สร้างใหม่ ชื่อที่กำลังสร้าง แล้วรายการในระบบ", () => {
  const options = nameOptions("building", "อาคาร ก (A)", [{ id: 3, name: "อาคารเดิม" }], {
    building: { "อาคาร ก": "create", "อาคาร ก (A)": "" },
  });
  expect(options.map((o) => o.value)).toEqual(["create", "new:อาคาร ก", "alias:3"]);
});

test("ข้อความของสิ่งที่ยังกันการบันทึก", () => {
  const messages = blockingMessages([
    { code: "undecided_building", count: 2 },
    { code: "missing_contract", contracts: ["TEST 1/2567"] },
  ]);
  expect(messages[0]).toContain("2");
  expect(messages[1]).toContain("TEST 1/2567");
});

test("ตรวจซ้ำแล้วเก็บสิ่งที่เลือกไว้ รุ่นที่ระบบรู้หมวดแล้วตั้งค่าให้", () => {
  const preview = {
    unresolved: { brand: [], building: [{ name: "อาคาร ก", decision: null }], division: [] },
    models: [{ key: "oki|es5112", meter_category_id: 2, has_color_meter: false }],
  };
  const first = initialChoices(preview);
  expect(first.names.building).toEqual({ "อาคาร ก": "" });
  expect(first.models["oki|es5112"]).toEqual({ category: "2", color: false });
  first.names.building["อาคาร ก"] = "create";
  expect(initialChoices(preview, first).names.building["อาคาร ก"]).toBe("create");
});

test("สร้างใหม่ด้วยชื่อทางการที่แก้ไว้ ส่งไปเป็น as — ชื่อเดิมไม่ส่ง", () => {
  const decisions = buildDecisions(
    { building: { "ศูนย์ ก (EMC)": "create", "อาคาร ข": "create" } },
    {},
    { building: { "ศูนย์ ก (EMC)": "อาคารศูนย์ ก", "อาคาร ข": "อาคาร ข" } }
  );
  expect(decisions.names.building).toEqual({
    "ศูนย์ ก (EMC)": { action: "create", as: "อาคารศูนย์ ก" },
    "อาคาร ข": { action: "create" },
  });
});

test("ชื่อในไฟล์อย่าง 'constructor' ไม่ทำให้หน้าพัง", () => {
  const preview = { unresolved: { brand: [], building: [{ name: "constructor", decision: null }], division: [] }, models: [] };
  const choices = initialChoices(preview, { names: { building: {} }, models: {}, renames: { building: {} } });
  expect(choices.names.building.constructor).toBe("");
  expect(() => buildDecisions(choices.names, choices.models, choices.renames)).not.toThrow();
});

test("ชื่อที่ระบบจับคู่ให้เอง (ชื่อทางการของรายการใหม่) แสดงเป็นเลือกแล้ว", () => {
  const preview = {
    unresolved: { brand: [], building: [{ name: "อาคาร ข", decision: { action: "same_as_new", target_new: "อาคาร ก" } }], division: [] },
    models: [],
  };
  const choices = initialChoices(preview, { names: { building: { "อาคาร ข": "" } }, models: {}, renames: {} });
  expect(choices.names.building["อาคาร ข"]).toBe("new:อาคาร ก");
});
