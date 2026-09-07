// @vitest-environment jsdom
//
// เทสการ "ต่อสาย" ของหน้ากรอกยอดพิมพ์ — ไม่ใช่ตรรกะของด่าน (อันนั้นอยู่ที่
// lib/draft-guard.test.js) แต่ตรวจว่า **หน้านี้เรียกด่านจริง** ในเส้นทางที่ทำให้
// ตารางกรอกหายไปจากหน้าจอ
//
// จำเป็นเพราะเทสระดับ unit ของด่านผ่านหมดได้ทั้งที่ลืมต่อสายในไฟล์ .vue —
// ซึ่งเป็นตัวบั๊กจริงของ issue #23 ไม่ใช่ตัวด่าน
//
// ใช้ shallow mount: สนใจว่าหน้าเรียกอะไร ไม่ได้สนใจหน้าตาของ component ลูก

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { ref } from "vue";

const askConfirm = vi.fn();

vi.mock("../store/confirmDialog", () => ({
  askConfirm: (...args) => askConfirm(...args),
  confirmState: {},
}));

vi.mock("../services/api", () => ({
  default: { get: vi.fn(async () => ({ data: [] })) },
}));

vi.mock("vue-router", () => ({
  useRoute: () => ({ query: {} }),
  RouterLink: { template: "<a><slot /></a>" },
}));

// store/fiscalYear.js import ../router เข้ามาเพื่อ sync ?fy= ซึ่งลาก view ทุกหน้า
// (และไฟล์ภาพใน public/) ตามมาทั้งกอง — ตัดทิ้ง เทสนี้ไม่ได้ตรวจ routing
vi.mock("../router", () => ({
  default: {
    replace: vi.fn(),
    currentRoute: { value: { query: {} } },
  },
}));

// TanStack Query ต้องการ QueryClient ที่ provide ไว้ — ตัดทิ้งทั้งชั้น เทสนี้ไม่ได้
// ตรวจการดึงข้อมูล
const emptyQuery = () => ({
  data: ref(null),
  isSuccess: ref(true),
  isFetching: ref(false),
  isError: ref(false),
  error: ref(null),
  refetch: vi.fn(),
});

vi.mock("../api/queries", () => ({
  // `keys` ถูกใช้โดย api/invalidate.js ซึ่งหน้านี้เรียกหลังบันทึกสำเร็จ —
  // ต้องคืนของจริงมาด้วย ไม่ใช่แค่ hook สองตัว
  keys: {
    buildings: () => ["buildings"],
    floors: () => ["floors"],
    divisions: () => ["divisions"],
    departments: () => ["departments"],
    brands: () => ["brands"],
    contracts: () => ["contracts"],
    devices: () => ["devices"],
  },
  useCoverage: () => ({ data: ref(null), refetch: vi.fn() }),
  useMonthPages: () => emptyQuery(),
}));

// หน้านี้เรียก useQueryClient() ซึ่งต้องมี provider — ให้ของปลอมที่จำการเรียกได้
const invalidateQueries = vi.fn(async () => {});

vi.mock("@tanstack/vue-query", () => ({
  useQueryClient: () => ({ invalidateQueries }),
}));

const { mount } = await import("@vue/test-utils");
const { fiscalYearState, setActiveFiscalYear } = await import("../store/fiscalYear");
const { authState } = await import("../store/auth");
const PrintTransactions = (await import("./PrintTransactions.vue")).default;

/**
 * ตารางกรอกปลอม — ต้องมี discard() จริง เพราะหน้าเรียกผ่าน template ref
 * ตอนผู้ใช้ยืนยันให้ทิ้ง draft ส่วน stub อัตโนมัติไม่มีเมธอดอะไรเลย
 */
const discard = vi.fn();
const MonthEntryGridStub = {
  name: "MonthEntryGrid",
  template: "<div />",
  methods: { discard },
};

/** mount หน้าโดย stub component ลูกทั้งหมด */
async function mountPage() {
  const wrapper = mount(PrintTransactions, {
    shallow: true,
    global: {
      stubs: { teleport: true, MonthEntryGrid: MonthEntryGridStub },
    },
  });
  await Promise.resolve();
  return wrapper;
}

/** ตั้งให้หน้าอยู่ในสถานะ "โหมดกรอก มีเดือนเปิดอยู่ และมีของแก้ค้าง N รายการ" */
async function makeDirty(wrapper, count = 3) {
  wrapper.vm.mode = "month";
  wrapper.vm.filters = { ...wrapper.vm.filters, month: "2568-10" };
  await wrapper.vm.$nextTick();

  wrapper.findComponent({ name: "MonthEntryGrid" }).vm.$emit("update:dirty", count);
  await wrapper.vm.$nextTick();
}

beforeEach(() => {
  askConfirm.mockReset();
  discard.mockReset();
  authState.user = { id: 1, username: "staff", role: "staff" };
  fiscalYearState.list = [
    { id: 1, year: "2567", start_month: "2566-10", end_month: "2567-09" },
    { id: 2, year: "2568", start_month: "2567-10", end_month: "2568-09" },
  ];
  fiscalYearState.activeId = 1;
});

afterEach(() => {
  authState.user = null;
});

describe("PrintTransactions ต่อสายด่านกัน draft หาย", () => {
  test("ล้างตัวกรองตอนไม่มีของแก้ค้าง — ไม่ถาม และล้างจริง", async () => {
    const wrapper = await mountPage();

    const bar = wrapper.findComponent({ name: "UiFilterBar" });
    expect(bar.exists()).toBe(true);

    bar.vm.$emit("clear");
    await wrapper.vm.$nextTick();

    expect(askConfirm).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  test("ล้างตัวกรองตอนมีของแก้ค้าง แล้วยกเลิก — ตัวกรองต้องอยู่ครบ", async () => {
    askConfirm.mockResolvedValue(false);

    const wrapper = await mountPage();
    await makeDirty(wrapper);

    const before = { ...wrapper.vm.filters };

    wrapper.findComponent({ name: "UiFilterBar" }).vm.$emit("clear");
    await wrapper.vm.$nextTick();
    await Promise.resolve();

    expect(askConfirm).toHaveBeenCalledOnce();
    expect(askConfirm.mock.calls[0][0]).toContain("ล้างตัวกรอง");
    expect(wrapper.vm.filters).toEqual(before);
    expect(wrapper.vm.filters.month).toBe("2568-10");

    wrapper.unmount();
  });

  test("ล้างตัวกรองตอนมีของแก้ค้าง แล้วยืนยัน — ตัวกรองถูกล้าง", async () => {
    askConfirm.mockResolvedValue(true);

    const wrapper = await mountPage();
    await makeDirty(wrapper);

    wrapper.findComponent({ name: "UiFilterBar" }).vm.$emit("clear");
    await wrapper.vm.$nextTick();
    await Promise.resolve();
    await wrapper.vm.$nextTick();

    expect(askConfirm).toHaveBeenCalledOnce();
    expect(wrapper.vm.filters.month).toBe("");
    expect(discard).toHaveBeenCalledOnce();

    wrapper.unmount();
  });

  test("เปลี่ยนปีงบตอนมีของแก้ค้าง แล้วยกเลิก — ปีงบและเดือนต้องอยู่ครบ", async () => {
    askConfirm.mockResolvedValue(false);

    const wrapper = await mountPage();
    await makeDirty(wrapper);

    const changed = await setActiveFiscalYear(2);

    expect(changed).toBe(false);
    expect(askConfirm).toHaveBeenCalledOnce();
    expect(askConfirm.mock.calls[0][0]).toContain("เปลี่ยนปีงบ");
    expect(fiscalYearState.activeId).toBe(1);
    expect(wrapper.vm.filters.month).toBe("2568-10");
    expect(discard).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  test("เปลี่ยนปีงบตอนมีของแก้ค้าง แล้วยืนยัน — เปลี่ยนได้และ draft ถูกทิ้ง", async () => {
    askConfirm.mockResolvedValue(true);

    const wrapper = await mountPage();
    await makeDirty(wrapper);

    const changed = await setActiveFiscalYear(2);
    await wrapper.vm.$nextTick();

    expect(changed).toBe(true);
    expect(fiscalYearState.activeId).toBe(2);
    expect(discard).toHaveBeenCalledOnce();

    wrapper.unmount();
  });

  test("ออกจากหน้าแล้วต้องถอดด่านออก ไม่บล็อกการเปลี่ยนปีงบของทั้งแอปค้างไว้", async () => {
    askConfirm.mockResolvedValue(false);

    const wrapper = await mountPage();
    await makeDirty(wrapper);
    wrapper.unmount();

    const changed = await setActiveFiscalYear(2);

    expect(askConfirm).not.toHaveBeenCalled();
    expect(changed).toBe(true);
    expect(fiscalYearState.activeId).toBe(2);
  });
});
