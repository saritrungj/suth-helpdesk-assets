// @vitest-environment jsdom
//
// บันทึกทั้งชุดไม่ผ่านเพราะบางเครื่องยังไม่มีราคา — ผู้ใช้ต้องรู้ว่าเครื่องไหน เดือนไหน (#230)
// API ส่ง errors[] มาแล้ว เดิมหน้าเว็บแสดงแค่ title จึงต้องไล่หาเองจากทั้งตาราง

import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("../store/confirmDialog", () => ({ askConfirm: vi.fn(async () => true) }));

const toastError = vi.fn();
vi.mock("../store/toast", () => ({ toastError: (...a) => toastError(...a), toastSuccess: vi.fn() }));

const post = vi.fn();
vi.mock("../services/api", () => ({ default: { post: (...a) => post(...a) } }));
vi.mock("../api/invalidate", () => ({ invalidateAfterWrite: vi.fn(async () => {}) }));
vi.mock("@tanstack/vue-query", () => ({ useQueryClient: () => ({}) }));

const { mount, flushPromises } = await import("@vue/test-utils");
const MonthEntryGrid = (await import("./MonthEntryGrid.vue")).default;

const DEVICES = [
  { id: 1, serial_number: "SN-1" },
  { id: 2, serial_number: "SN-2" },
];

const UNPRICED = {
  response: {
    status: 400,
    data: {
      code: "unpriced_reading",
      title: "บันทึกไม่ได้ เพราะยอดบางรายการหาราคาไม่ได้ — แก้สัญญาหรือเครื่องก่อน แล้วบันทึกใหม่",
      errors: [{ serial_number: "SN-2", month: "2026-09", reason: "เครื่องยังไม่ได้ผูกสัญญาในเดือนนี้" }],
    },
  },
};

function mountGrid() {
  return mount(MonthEntryGrid, {
    props: { devices: DEVICES, month: "2026-09", saved: {}, canEdit: true, ready: true },
    slots: { default: "<div />" },
    global: {
      stubs: {
        UiAlert: { template: '<div role="alert"><slot /><slot name="actions" /></div>' },
        UiButton: { template: "<button><slot /></button>" },
        Teleport: true,
      },
    },
  });
}

beforeEach(() => {
  post.mockReset();
  toastError.mockReset();
});

describe("บันทึกไม่ผ่านเพราะยังไม่มีราคา", () => {
  test("บอกเครื่อง เดือน และเหตุผลในกล่องแจ้งเตือน", async () => {
    post.mockRejectedValue(UNPRICED);
    const wrapper = mountGrid();

    wrapper.vm.onInput(1, "10");
    wrapper.vm.onInput(2, "20");
    await wrapper.vm.save();
    await flushPromises();

    const alert = wrapper.find('[role="alert"]').text();
    expect(alert).toContain("SN-2");
    expect(alert).toContain("ก.ย. 2569");
    expect(alert).toContain("เครื่องยังไม่ได้ผูกสัญญาในเดือนนี้");

    wrapper.unmount();
  });

  test("ชี้ช่องของเครื่องที่ผิด และเลิกชี้เมื่อผู้ใช้แก้ช่องนั้น", async () => {
    post.mockRejectedValue(UNPRICED);
    const wrapper = mountGrid();

    wrapper.vm.onInput(1, "10");
    wrapper.vm.onInput(2, "20");
    await wrapper.vm.save();
    await flushPromises();

    expect(wrapper.vm.problemFor(2)).toBe("เครื่องยังไม่ได้ผูกสัญญาในเดือนนี้");
    expect(wrapper.vm.problemFor(1)).toBe("");
    // ค่าที่กรอกไว้ต้องไม่หาย
    expect(wrapper.vm.dirtyCount).toBe(2);

    wrapper.vm.onInput(2, "");
    expect(wrapper.vm.problemFor(2)).toBe("");

    wrapper.unmount();
  });

  test("แจ้งที่เดียว — ไม่ขึ้น toast ซ้ำกับกล่องในหน้า", async () => {
    post.mockRejectedValue(UNPRICED);
    const wrapper = mountGrid();

    wrapper.vm.onInput(2, "20");
    await wrapper.vm.save();
    await flushPromises();

    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    expect(toastError).not.toHaveBeenCalled();

    wrapper.unmount();
  });
});
