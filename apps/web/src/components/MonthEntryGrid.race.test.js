// @vitest-environment jsdom
//
// เทสลำดับเหตุการณ์ที่ทำให้ "ความตั้งใจล่าสุดของผู้ใช้หายเงียบ" (issue #26)
//
// ช่องกรอกยังพิมพ์ได้ระหว่างที่คำขอบันทึกกำลังเดินทาง การเทียบค่าที่พิมพ์กับ
// "ค่าที่บันทึกไว้" เพียงอย่างเดียวจึงไม่พอ เพราะระหว่างนั้นค่าที่บันทึกไว้ยัง
// เป็นของเก่าอยู่

import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("../store/confirmDialog", () => ({ askConfirm: vi.fn(async () => true) }));
vi.mock("../store/toast", () => ({ toastError: vi.fn(), toastSuccess: vi.fn() }));

const post = vi.fn();
vi.mock("../services/api", () => ({ default: { post: (...a) => post(...a) } }));

const invalidateAfterWrite = vi.fn(async () => {});
vi.mock("../api/invalidate", () => ({ invalidateAfterWrite: (...a) => invalidateAfterWrite(...a) }));

vi.mock("@tanstack/vue-query", () => ({ useQueryClient: () => ({}) }));

const { mount } = await import("@vue/test-utils");
const MonthEntryGrid = (await import("./MonthEntryGrid.vue")).default;

const DEVICES = [{ id: 1, serial_number: "SN-1" }];

/** mount ตารางกรอกพร้อมค่าที่บันทึกไว้ */
function mountGrid(saved = { 1: 100 }) {
  return mount(MonthEntryGrid, {
    shallow: true,
    props: { devices: DEVICES, month: "2568-10", saved, canEdit: true, ready: true },
    slots: { default: "<div />" },
  });
}

beforeEach(() => {
  post.mockReset();
  invalidateAfterWrite.mockClear();
});

describe("แก้ค่ากลับเป็นค่าเดิมระหว่างรอบันทึก", () => {
  test("พิมพ์กลับเท่าค่าที่บันทึกไว้ตอนไม่มีคำขอค้าง — ถอดออกจาก draft ตามเดิม", async () => {
    const wrapper = mountGrid({ 1: 100 });

    wrapper.vm.onInput(1, "200");
    expect(wrapper.vm.dirtyCount).toBe(1);

    wrapper.vm.onInput(1, "100");
    expect(wrapper.vm.dirtyCount).toBe(0);

    wrapper.unmount();
  });

  test("saved=100 → ส่ง 200 → ระหว่างรอพิมพ์กลับ 100 → ต้องยังถือว่าแก้อยู่", async () => {
    let release;
    post.mockImplementation(
      () => new Promise((resolve) => { release = () => resolve({ data: {} }); })
    );

    const wrapper = mountGrid({ 1: 100 });

    wrapper.vm.onInput(1, "200");
    const saving = wrapper.vm.save();
    await Promise.resolve();

    // ระหว่างที่คำขอยังไม่กลับ ผู้ใช้พิมพ์กลับเป็น 100
    wrapper.vm.onInput(1, "100");

    // 100 ต่างจาก 200 ที่กำลังจะถูกบันทึก — ความตั้งใจนี้ต้องไม่ถูกทิ้ง
    expect(wrapper.vm.dirtyCount).toBe(1);

    release();
    await saving;

    // หลังบันทึกเสร็จ ค่าที่ค้างต้องยังเป็น 100 ไม่ถูกกลืนหายไปกับรายการที่ส่งไป
    expect(wrapper.vm.dirtyCount).toBe(1);

    wrapper.unmount();
  });

  test("ระหว่างรอแล้วพิมพ์เท่ากับค่าที่กำลังส่ง — ไม่ต้องถือว่าแก้ซ้ำ", async () => {
    let release;
    post.mockImplementation(
      () => new Promise((resolve) => { release = () => resolve({ data: {} }); })
    );

    const wrapper = mountGrid({ 1: 100 });

    wrapper.vm.onInput(1, "200");
    const saving = wrapper.vm.save();
    await Promise.resolve();

    wrapper.vm.onInput(1, "200");
    expect(wrapper.vm.dirtyCount).toBe(0);

    release();
    await saving;

    expect(wrapper.vm.dirtyCount).toBe(0);

    wrapper.unmount();
  });

  test("บันทึกล้มเหลว — ค่าที่ส่งไปต้องกลับมาเป็นของค้างเหมือนเดิม", async () => {
    post.mockRejectedValue(new Error("network"));

    const wrapper = mountGrid({ 1: 100 });

    wrapper.vm.onInput(1, "200");
    await wrapper.vm.save();

    expect(wrapper.vm.dirtyCount).toBe(1);

    wrapper.unmount();
  });
});
