import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("../services/api", () => ({ default: { get: vi.fn() } }));

const { AFFECTED_KEYS, invalidateAfterWrite, changeKindForEndpoint } = await import("./invalidate");
const { takeRevalidationHeaders, resetRevalidationMarks } = await import("./http-cache");

/** queryClient ปลอมที่จำว่าถูกสั่งล้าง key ไหนบ้าง */
function fakeQueryClient() {
  const invalidated = [];
  return {
    invalidated,
    invalidateQueries: vi.fn(async ({ queryKey }) => {
      invalidated.push(queryKey);
    }),
  };
}

beforeEach(() => {
  resetRevalidationMarks();
});

describe("ตาราง mutation → affected keys", () => {
  test("แก้อาคารต้องล้างทั้งรายการอาคาร ทะเบียนเครื่อง และแดชบอร์ด", async () => {
    const qc = fakeQueryClient();

    await invalidateAfterWrite(qc, "buildings");

    expect(qc.invalidated).toEqual([["buildings"], ["devices"], ["dashboard"]]);
  });

  test("แก้ฝ่ายต้องล้างแผนกด้วย เพราะแผนกสังกัดฝ่าย", async () => {
    const qc = fakeQueryClient();

    await invalidateAfterWrite(qc, "divisions");

    expect(qc.invalidated).toContainEqual(["departments"]);
  });

  test("บันทึกยอดพิมพ์ต้องล้างทั้งยอดและแดชบอร์ด", async () => {
    const qc = fakeQueryClient();

    await invalidateAfterWrite(qc, "usage");

    expect(qc.invalidated).toEqual([["print-transactions"], ["dashboard"]]);
  });

  test("แก้ทะเบียนเครื่องต้องล้างความครบถ้วนรายเดือนด้วย เพราะนับจากจำนวนเครื่อง", async () => {
    const qc = fakeQueryClient();

    await invalidateAfterWrite(qc, "device");

    expect(qc.invalidated).toContainEqual(["print-transactions"]);
  });

  test("ทุกชนิดที่กระทบชื่อในรายงาน ต้องล้างแดชบอร์ดเสมอ — กันเพิ่มชนิดใหม่แล้วลืม", async () => {
    for (const change of Object.keys(AFFECTED_KEYS)) {
      const qc = fakeQueryClient();
      await invalidateAfterWrite(qc, change);
      expect(qc.invalidated, `ชนิด "${change}"`).toContainEqual(["dashboard"]);
    }
  });

  test("ชนิดที่ไม่รู้จักต้องดัง ไม่ใช่เงียบแล้วไม่ล้างอะไรเลย", async () => {
    const qc = fakeQueryClient();

    expect(() => invalidateAfterWrite(qc, "ไม่มีชนิดนี้")).toThrow();
    expect(qc.invalidateQueries).not.toHaveBeenCalled();
  });
});

describe("ชั้น HTTP cache", () => {
  test("หลังแก้ข้อมูลอ้างอิง คำขอครั้งถัดไปของ URL นั้นต้อง revalidate", async () => {
    const qc = fakeQueryClient();

    await invalidateAfterWrite(qc, "buildings");

    expect(takeRevalidationHeaders("/buildings")).toEqual({ "Cache-Control": "no-cache" });
  });

  test("เครื่องหมายใช้แล้วทิ้ง — คำขอถัดไปกลับไปใช้แคชปกติ", async () => {
    const qc = fakeQueryClient();

    await invalidateAfterWrite(qc, "buildings");
    takeRevalidationHeaders("/buildings");

    expect(takeRevalidationHeaders("/buildings")).toBeUndefined();
  });

  test("URL ที่ไม่เกี่ยวข้องต้องไม่ถูกบังคับ revalidate", async () => {
    const qc = fakeQueryClient();

    await invalidateAfterWrite(qc, "buildings");

    expect(takeRevalidationHeaders("/brands")).toBeUndefined();
  });

  test("แก้ฝ่ายต้องบังคับ revalidate ทั้ง /divisions และ /departments", async () => {
    const qc = fakeQueryClient();

    await invalidateAfterWrite(qc, "divisions");

    expect(takeRevalidationHeaders("/divisions")).toEqual({ "Cache-Control": "no-cache" });
    expect(takeRevalidationHeaders("/departments")).toEqual({ "Cache-Control": "no-cache" });
  });
});

describe("changeKindForEndpoint", () => {
  test("แปลง endpoint ของ MasterDataPage เป็นชนิดการเขียน", () => {
    expect(changeKindForEndpoint("/buildings")).toBe("buildings");
    expect(changeKindForEndpoint("/fiscal-years")).toBe("fiscal-years");
  });

  test("endpoint ที่ไม่มีในตารางต้องได้ null ไม่ใช่เดา", () => {
    expect(changeKindForEndpoint("/users")).toBe(null);
  });
});
