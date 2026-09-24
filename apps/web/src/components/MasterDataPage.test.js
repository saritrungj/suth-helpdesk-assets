// @vitest-environment jsdom
//
// ข้อมูลอ้างอิงโหลดไม่สำเร็จ ต้องไม่หน้าตาเหมือน "ยังไม่มีข้อมูล" (#105)
//
// หน้าชั้น/แผนกเลือกอาคาร/ฝ่ายจากรายการที่โหลดมาอีกเส้นหนึ่ง ถ้าเส้นนั้นล้มแล้วหน้า
// เงียบ ผู้ใช้จะเห็นช่องเลือกว่างและตารางที่ชื่ออาคารเป็น "—" ทุกแถว ซึ่งอ่านได้ว่า
// ระบบไม่มีอาคารเลย

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { markForRevalidation, resetRevalidationMarks } from "../api/http-cache";

const get = vi.fn();
const post = vi.fn();
const put = vi.fn();
const del = vi.fn();
vi.mock("../services/api", () => ({
  default: {
    get: (...a) => get(...a),
    post: (...a) => post(...a),
    put: (...a) => put(...a),
    delete: (...a) => del(...a),
  },
}));
vi.mock("../store/confirmDialog", () => ({ askConfirm: vi.fn(async () => true) }));
vi.mock("../store/toast", () => ({ toastError: vi.fn(), toastSuccess: vi.fn() }));
vi.mock("../api/invalidate", () => ({ invalidateAfterWrite: vi.fn(async () => {}), changeKindForEndpoint: (ep) => ep.replace(/^\//, "") }));
vi.mock("@tanstack/vue-query", () => ({ useQueryClient: () => ({}) }));

const { mount, flushPromises } = await import("@vue/test-utils");
const MasterDataPage = (await import("./MasterDataPage.vue")).default;

const FLOORS = [{ id: 1, building_id: 3, name: "ชั้น 2" }];
const BUILDINGS = [{ id: 3, name: "อาคารผู้ป่วยนอก" }];

let buildingsFail;

beforeEach(() => {
  buildingsFail = true;
  resetRevalidationMarks();
  get.mockReset();
  post.mockReset();
  put.mockReset();
  del.mockReset();
  get.mockImplementation(async (path) => {
    if (path === "/floors") return { data: FLOORS };
    if (path === "/buildings") {
      if (buildingsFail) throw Object.assign(new Error("Network Error"), { request: {} });
      return { data: BUILDINGS };
    }
    return { data: [] };
  });
});

const mounted = [];
afterEach(() => { while (mounted.length) mounted.pop().unmount(); });

async function mountFloors() {
  const wrapper = mount(MasterDataPage, {
    props: {
      title: "ชั้น",
      endpoint: "/floors",
      itemNoun: "ชั้น",
      columns: [
        { key: "building_id", label: "อาคาร", optionKey: "building_id" },
        { key: "name", label: "ชื่อชั้น" },
      ],
      fields: [
        { key: "building_id", label: "อาคาร", type: "select", required: true, optionsFrom: "/buildings" },
        { key: "name", label: "ชื่อชั้น", required: true },
      ],
    },
    global: {
      stubs: {
        UiDataTable: true,
        UiModal: { template: "<div><slot /><slot name=\"footer\" /></div>" },
      },
    },
  });
  mounted.push(wrapper);
  await flushPromises();
  return wrapper;
}

describe("ข้อมูลอ้างอิงโหลดไม่สำเร็จ", () => {
  test("บอกว่ารายการไหนโหลดไม่สำเร็จ ไม่ใช่ปล่อยเป็นรายการว่างเงียบๆ", async () => {
    const wrapper = await mountFloors();
    expect(wrapper.text()).toContain("โหลดรายการอาคารไม่สำเร็จ");
  });

  test("ตารางไม่แสดงชื่ออาคารเป็นขีดราวกับไม่มีอาคาร", async () => {
    const wrapper = await mountFloors();
    const column = wrapper.vm.tableColumns.find((col) => col.key === "building_id");
    expect(column.value(FLOORS[0])).not.toBe("—");
  });

  test("บันทึกไม่ได้ระหว่างที่รายการอาคารยังใช้ไม่ได้ และบอกเหตุผล", async () => {
    const wrapper = await mountFloors();
    wrapper.vm.openCreate();
    wrapper.vm.form.name = "ชั้น 5";
    wrapper.vm.form.building_id = 3;
    await wrapper.vm.submit();
    expect(post).not.toHaveBeenCalled();
    expect(wrapper.vm.formError).toContain("อาคาร");
  });

  test("ลองใหม่สำเร็จแล้วข้อความหาย ตัวเลือกมา ค่าที่กรอกไว้ยังอยู่", async () => {
    const wrapper = await mountFloors();
    wrapper.vm.openCreate();
    wrapper.vm.form.name = "ชั้น 5";

    buildingsFail = false;
    await wrapper.get("[data-testid=retry-options]").trigger("click");
    await flushPromises();

    expect(wrapper.text()).not.toContain("โหลดรายการอาคารไม่สำเร็จ");
    expect(wrapper.vm.optionSets.building_id).toEqual([{ value: 3, label: "อาคารผู้ป่วยนอก" }]);
    expect(wrapper.vm.form.name).toBe("ชั้น 5");
    const column = wrapper.vm.tableColumns.find((col) => col.key === "building_id");
    expect(column.value(FLOORS[0])).toBe("อาคารผู้ป่วยนอก");
  });
});

describe("การดึงข้อมูลและ revalidation ข้าม HTTP cache (#136)", () => {
  test("ดึงข้อมูลใหม่พร้อม Cache-Control: no-cache เมื่อมีเครื่องหมาย revalidate", async () => {
    markForRevalidation(["/floors"]);
    await mountFloors();
    expect(get).toHaveBeenCalledWith("/floors", {
      headers: { "Cache-Control": "no-cache" },
    });
  });

  test("หลังล้างเครื่องหมายแล้ว การโหลดรอบถัดไปไม่ส่ง no-cache ซ้ำ", async () => {
    markForRevalidation(["/floors"]);
    const wrapper = await mountFloors();
    expect(get).toHaveBeenCalledWith("/floors", {
      headers: { "Cache-Control": "no-cache" },
    });

    get.mockClear();
    await wrapper.vm.load();
    expect(get).toHaveBeenCalledWith("/floors", undefined);
  });

  test("ลบรายการแล้วสั่ง invalidate แคชก่อนโหลดรายการใหม่ เพื่อให้ได้ revalidation mark", async () => {
    const { invalidateAfterWrite } = await import("../api/invalidate");
    const callOrder = [];
    vi.mocked(invalidateAfterWrite).mockImplementation(async () => {
      callOrder.push("invalidate");
      markForRevalidation(["/floors"]);
    });
    get.mockImplementation(async (path, config) => {
      if (path === "/floors") {
        callOrder.push(config?.headers?.["Cache-Control"] === "no-cache" ? "get-nocache" : "get");
        return { data: FLOORS };
      }
      return { data: BUILDINGS };
    });

    const wrapper = await mountFloors();
    callOrder.length = 0;

    await wrapper.vm.remove(FLOORS[0]);

    expect(del).toHaveBeenCalledWith("/floors/1");
    expect(callOrder).toEqual(["invalidate", "get-nocache"]);
  });

  test("กล่องยืนยันลบบอกชื่อชั้นพร้อมอาคาร ไม่ใช่รหัสอาคาร (#206)", async () => {
    const { askConfirm } = await import("../store/confirmDialog");
    get.mockImplementation(async (path) => ({ data: path === "/floors" ? FLOORS : BUILDINGS }));
    const wrapper = await mountFloors();
    await wrapper.vm.remove(FLOORS[0]);
    expect(vi.mocked(askConfirm).mock.calls.at(-1)[0]).toContain("“ชั้น 2 · อาคาร อาคารผู้ป่วยนอก”");
  });

  test("ผลโหลดเก่าที่กลับมาทีหลังไม่เขียนทับรายการจากการโหลดล่าสุด", async () => {
    let resolveInitialLoad;
    let floorsRequests = 0;
    get.mockImplementation(async (path) => {
      if (path === "/floors") {
        floorsRequests += 1;
        if (floorsRequests === 1) {
          return new Promise((resolve) => { resolveInitialLoad = resolve; });
        }
        return { data: [{ id: 2, building_id: 3, name: "ชั้นล่าสุด" }] };
      }
      if (path === "/buildings") return { data: BUILDINGS };
      return { data: [] };
    });

    const wrapper = mount(MasterDataPage, {
      props: {
        title: "ชั้น",
        endpoint: "/floors",
        itemNoun: "ชั้น",
        columns: [{ key: "name", label: "ชื่อชั้น" }],
        fields: [{ key: "name", label: "ชื่อชั้น", required: true }],
      },
      global: {
        stubs: {
          UiDataTable: true,
          UiModal: { template: "<div><slot /><slot name=\"footer\" /></div>" },
        },
      },
    });
    mounted.push(wrapper);
    await flushPromises();

    await wrapper.vm.load();
    resolveInitialLoad({ data: FLOORS });
    await flushPromises();

    expect(get.mock.calls.filter(([path]) => path === "/floors")[1][1]).toEqual({
      headers: { "Cache-Control": "no-cache" },
    });
    expect(wrapper.vm.rows).toEqual([{ id: 2, building_id: 3, name: "ชั้นล่าสุด" }]);
  });
});
