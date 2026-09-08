import { describe, test, expect, vi } from "vitest";

import { createDraftGuard } from "./draft-guard";

/** สร้าง guard พร้อมของปลอมที่ตรวจสอบได้ — คืนตัว guard และของปลอมทั้งชุด */
function setup({ count = 0, answer = true } = {}) {
  const state = { count };
  const discard = vi.fn(() => {
    state.count = 0;
  });
  const confirm = vi.fn(async () => answer);

  const guard = createDraftGuard({
    dirtyCount: () => state.count,
    discard,
    confirm,
    describe: (count, consequence) => `มีของแก้ไว้ ${count} รายการแต่ยังไม่ได้บันทึก ${consequence}`,
  });

  return { guard, discard, confirm, state };
}

describe("createDraftGuard", () => {
  test("ไม่มีของแก้ค้าง — ผ่านเลย ไม่ถาม ไม่ล้าง", async () => {
    const { guard, discard, confirm } = setup({ count: 0 });

    await expect(guard("ถ้าเปลี่ยนปีงบตอนนี้ ค่าที่กรอกไว้จะหายทั้งหมด")).resolves.toBe(true);

    expect(confirm).not.toHaveBeenCalled();
    expect(discard).not.toHaveBeenCalled();
  });

  test("มีของแก้ค้างแล้วผู้ใช้ยกเลิก — ต้องไม่ล้าง draft และตอบ false", async () => {
    const { guard, discard, confirm, state } = setup({ count: 3, answer: false });

    await expect(guard("ถ้าเปลี่ยนปีงบตอนนี้ ค่าที่กรอกไว้จะหายทั้งหมด")).resolves.toBe(false);

    expect(confirm).toHaveBeenCalledOnce();
    expect(discard).not.toHaveBeenCalled();
    expect(state.count).toBe(3);
  });

  test("มีของแก้ค้างแล้วผู้ใช้ยืนยัน — ล้าง draft แล้วตอบ true", async () => {
    const { guard, discard, confirm, state } = setup({ count: 3, answer: true });

    await expect(guard("ถ้าเปลี่ยนปีงบตอนนี้ ค่าที่กรอกไว้จะหายทั้งหมด")).resolves.toBe(true);

    expect(confirm).toHaveBeenCalledOnce();
    expect(discard).toHaveBeenCalledOnce();
    expect(state.count).toBe(0);
  });

  test("ข้อความที่ถามต้องบอกจำนวนรายการและผลที่จะเกิด", async () => {
    const { guard, confirm } = setup({ count: 7, answer: false });

    await guard("ถ้าล้างตัวกรองตอนนี้ ค่าที่กรอกไว้จะหายทั้งหมด", {
      confirmText: "ล้างตัวกรองโดยไม่บันทึก",
    });

    const [message, options] = confirm.mock.calls[0];
    expect(message).toContain("7");
    expect(message).toContain("ถ้าล้างตัวกรองตอนนี้ ค่าที่กรอกไว้จะหายทั้งหมด");
    expect(options.confirmText).toBe("ล้างตัวกรองโดยไม่บันทึก");
    expect(options.danger).toBe(true);
  });

  test("ถามอยู่แล้วถูกเรียกซ้ำ — ต้องไม่เปิดกล่องถามซ้อนกันสองใบ", async () => {
    const state = { count: 2 };
    let release;
    const confirm = vi.fn(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    const guard = createDraftGuard({
      dirtyCount: () => state.count,
      discard: () => {
        state.count = 0;
      },
      confirm,
      describe: (count, consequence) => `มีของแก้ไว้ ${count} รายการ ${consequence}`,
    });

    const first = guard("ถ้าเปลี่ยนเดือนตอนนี้ ค่าที่กรอกไว้จะหายทั้งหมด");
    const second = guard("ถ้าเปลี่ยนปีงบตอนนี้ ค่าที่กรอกไว้จะหายทั้งหมด");

    expect(confirm).toHaveBeenCalledOnce();
    await expect(second).resolves.toBe(false);

    release(true);
    await expect(first).resolves.toBe(true);
  });
});
