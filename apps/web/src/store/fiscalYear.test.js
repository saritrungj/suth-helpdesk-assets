import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { ref, nextTick } from "vue";

// mock HTTP client และ router ก่อน import store — store เรียก router.replace ทุกครั้งที่
// เปลี่ยนปีงบ และ import ../router จริงจะลาก view ทั้งหมดเข้ามาด้วย
const get = vi.fn();
const replace = vi.fn();

// query ต้องเป็น reactive จริง เพราะ startFiscalYearRouterSync ตั้ง watch ไว้บน
// router.currentRoute.value.query.fy — ถ้าเป็น object ธรรมดา watch จะไม่มีวันยิง
const currentQuery = ref({});

vi.mock("../services/api", () => ({
  default: { get },
}));

vi.mock("../router", () => ({
  default: {
    replace: (...args) => replace(...args),
    get currentRoute() {
      return { value: { query: currentQuery.value } };
    },
  },
}));

const { fiscalYearState, setActiveFiscalYear, registerFiscalYearGuard, startFiscalYearRouterSync } =
  await import("./fiscalYear");

// registry ของด่านเป็น module singleton — ถ้า assertion ล้มกลาง test body แล้วเราถอด
// ด่านท้าย body เอง ด่านจะรั่วไปบล็อกเทสถัดไป เก็บไว้ถอดใน afterEach แทน
let cleanups = [];

function addGuard(guard) {
  const off = registerFiscalYearGuard(guard);
  cleanups.push(off);
  return off;
}

beforeEach(() => {
  get.mockReset();
  replace.mockReset();
  currentQuery.value = {};
  fiscalYearState.list = [
    { id: 1, year: "2567", start_month: "2566-10", end_month: "2567-09" },
    { id: 2, year: "2568", start_month: "2567-10", end_month: "2568-09" },
  ];
  fiscalYearState.activeId = 1;
});

afterEach(() => {
  for (const off of cleanups) off();
  cleanups = [];
});

describe("ด่านกันข้อมูลที่ยังไม่ได้บันทึกตอนเปลี่ยนปีงบ", () => {
  test("ไม่มีด่าน — เปลี่ยนปีงบได้ตามปกติ", async () => {
    const changed = await setActiveFiscalYear(2);

    expect(changed).toBe(true);
    expect(fiscalYearState.activeId).toBe(2);
    expect(replace).toHaveBeenCalledOnce();
  });

  test("ด่านตอบ false — ปีงบต้องคงเดิมและไม่แตะ URL", async () => {
    addGuard(async () => false);

    const changed = await setActiveFiscalYear(2);

    expect(changed).toBe(false);
    expect(fiscalYearState.activeId).toBe(1);
    expect(replace).not.toHaveBeenCalled();
  });

  test("ด่านตอบ true — เปลี่ยนปีงบได้", async () => {
    addGuard(async () => true);

    const changed = await setActiveFiscalYear(2);

    expect(changed).toBe(true);
    expect(fiscalYearState.activeId).toBe(2);
  });

  test("ด่านได้รับปีงบปลายทาง เพื่อเอาไปประกอบข้อความถาม", async () => {
    const seen = [];
    addGuard(async (nextId) => {
      seen.push(nextId);
      return true;
    });

    await setActiveFiscalYear(2);

    expect(seen).toEqual([2]);
  });

  test("ถอดด่านออกแล้วต้องไม่ถูกเรียกอีก — กัน guard ค้างหลังออกจากหน้า", async () => {
    const guard = vi.fn(async () => false);
    const unregister = registerFiscalYearGuard(guard);
    unregister();

    const changed = await setActiveFiscalYear(2);

    expect(guard).not.toHaveBeenCalled();
    expect(changed).toBe(true);
    expect(fiscalYearState.activeId).toBe(2);
  });

  test("เลือกปีงบเดิมซ้ำ ไม่ต้องถามด่าน แต่ยัง sync URL", async () => {
    const guard = vi.fn(async () => false);
    addGuard(guard);

    const changed = await setActiveFiscalYear(1);

    expect(guard).not.toHaveBeenCalled();
    expect(changed).toBe(true);
    expect(fiscalYearState.activeId).toBe(1);
    expect(replace).toHaveBeenCalledOnce();
  });

  test("ด่านหนึ่งตัวปฏิเสธ ก็พอที่จะยับยั้งทั้งหมด", async () => {
    addGuard(async () => true);
    addGuard(async () => false);

    const changed = await setActiveFiscalYear(2);

    expect(changed).toBe(false);
    expect(fiscalYearState.activeId).toBe(1);
  });
});

describe("เปลี่ยนปีงบผ่าน ?fy= (กด back/forward หรือเปิดลิงก์)", () => {
  // เส้นทางนี้เคยเขียน activeId ตรงๆ โดยข้ามด่านทั้งหมด — ของที่กรอกค้างไว้หายเงียบ
  test("ด่านตอบ false — ปีงบคงเดิม และ URL ถูกเขียนกลับให้ตรงกับที่ใช้อยู่จริง", async () => {
    startFiscalYearRouterSync();
    addGuard(async () => false);

    currentQuery.value = { fy: "2" };
    await nextTick();
    await Promise.resolve();

    expect(fiscalYearState.activeId).toBe(1);
    expect(replace).toHaveBeenCalledWith({ query: { fy: 1 } });
  });

  test("ด่านตอบ true — เปลี่ยนปีงบตาม URL", async () => {
    startFiscalYearRouterSync();
    addGuard(async () => true);

    currentQuery.value = { fy: "2" };
    await nextTick();
    await Promise.resolve();

    expect(fiscalYearState.activeId).toBe(2);
  });
});
