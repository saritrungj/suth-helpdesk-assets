import { beforeEach, describe, expect, test } from "vitest";
import { clearFormDrafts, formDraft } from "./form-draft";

/** sessionStorage ขนาดเล็กพอสำหรับเทส — environment ของเทสเป็น node ไม่มี DOM */
function fakeStorage() {
  const data = new Map();
  return {
    get length() { return data.size; },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

beforeEach(() => {
  globalThis.window = { sessionStorage: fakeStorage() };
});

describe("formDraft", () => {
  test("เก็บแล้วอ่านคืนได้ พร้อมเวลาที่เก็บ", () => {
    formDraft("add-asset", 1).write({ serial_number: "TEST-001" });
    const saved = formDraft("add-asset", 1).read();
    expect(saved.values).toEqual({ serial_number: "TEST-001" });
    expect(Number.isNaN(Date.parse(saved.at))).toBe(false);
  });

  test("ร่างของผู้ใช้อื่นอ่านไม่ได้ — เครื่องในโรงพยาบาลใช้ร่วมกัน", () => {
    formDraft("add-asset", 1).write({ serial_number: "TEST-001" });
    expect(formDraft("add-asset", 2).read()).toBe(null);
  });

  test("clear ลบเฉพาะร่างของฟอร์มนั้น", () => {
    formDraft("add-asset", 1).write({ a: 1 });
    formDraft("other", 1).write({ b: 2 });
    formDraft("add-asset", 1).clear();
    expect(formDraft("add-asset", 1).read()).toBe(null);
    expect(formDraft("other", 1).read().values).toEqual({ b: 2 });
  });

  test("clearFormDrafts ลบร่างทุกฟอร์ม แต่ไม่แตะความจำของหน้าอื่น", () => {
    formDraft("add-asset", 1).write({ a: 1 });
    window.sessionStorage.setItem("suth:route:Dashboard", "{}");
    clearFormDrafts();
    expect(formDraft("add-asset", 1).read()).toBe(null);
    expect(window.sessionStorage.getItem("suth:route:Dashboard")).toBe("{}");
  });

  test("ที่เก็บของเบราว์เซอร์ใช้ไม่ได้ — ไม่ throw และอ่านได้ null", () => {
    globalThis.window = {};
    expect(() => formDraft("add-asset", 1).write({ a: 1 })).not.toThrow();
    expect(formDraft("add-asset", 1).read()).toBe(null);
    expect(() => clearFormDrafts()).not.toThrow();
  });
});
