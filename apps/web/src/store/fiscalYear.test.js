import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { ref, nextTick } from "vue";

// mock HTTP client และ router ก่อน import store — store เรียก router.replace ทุกครั้งที่
// เปลี่ยนปีงบ ส่วน router ตัวจริงมาจาก lib/app-router ซึ่งเป็นที่เก็บ instance ที่ router/index.js
// ฝากไว้ (ดูเหตุผลที่ต้องมีชั้นนี้ใน lib/app-router.js)
const get = vi.fn();
const replace = vi.fn();

// query ต้องเป็น reactive จริง เพราะ startFiscalYearRouterSync ตั้ง watch ไว้บน
// router.currentRoute.value.query.fy — ถ้าเป็น object ธรรมดา watch จะไม่มีวันยิง
const currentQuery = ref({});

vi.mock("../services/api", () => ({
  default: { get },
}));

const fakeRouter = {
  replace: (...args) => replace(...args),
  get currentRoute() {
    return { value: { query: currentQuery.value } };
  },
};

vi.mock("../lib/app-router", () => ({
  appRouter: () => fakeRouter,
  setAppRouter: () => {},
}));

const { fiscalYearState, loadFiscalYears, refreshFiscalYears, resetFiscalYearState, setActiveFiscalYear, registerFiscalYearGuard, startFiscalYearRouterSync } =
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

  test("รอให้ URL เปลี่ยนเสร็จก่อนรายงานว่าปีงบเปลี่ยนแล้ว", async () => {
    let finishNavigation;
    replace.mockReturnValue(new Promise((resolve) => { finishNavigation = resolve; }));
    let settled = false;

    const changing = setActiveFiscalYear(2).then((result) => {
      settled = true;
      return result;
    });
    await vi.waitFor(() => expect(replace).toHaveBeenCalledOnce());
    await Promise.resolve();

    expect(settled).toBe(false);
    finishNavigation();
    await expect(changing).resolves.toBe(true);
    expect(fiscalYearState.activeId).toBe(2);
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

describe("สลับปีงบจากแถบบนขณะที่หน้าเลือกหลายปีไว้", () => {
  test("ชุดปีที่เทียบและเดือนของปีเก่าต้องหายไปใน navigation เดียว ส่วนตัวกรองอื่นคงเดิม", async () => {
    currentQuery.value = { fy: "1", years: "2567,2568", months: "2566-10", division: "3", by: "division" };

    const changed = await setActiveFiscalYear(2);

    expect(changed).toBe(true);
    expect(replace).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledWith({ query: { fy: 2, division: "3", by: "division" } });
  });

  test("หน้าที่ส่ง query ของตัวเองมา (เลือกหลายปีจากตัวกรอง) เป็นเจ้าของชุดปีเอง", async () => {
    currentQuery.value = { fy: "1", years: "2567", months: "2566-10" };

    await setActiveFiscalYear(2, { query: { years: "2567,2568", months: "2566-10" } });

    expect(replace).toHaveBeenCalledWith({ query: { fy: 2, years: "2567,2568", months: "2566-10" } });
  });
});

describe("เลือกปีงบตั้งต้นหลังโหลดรายการ", () => {
  test("เลือกปีงบตั้งต้นหลังโหลดรายการ ไม่ใช่การสลับปี — เดือนที่มากับลิงก์ต้องอยู่ครบ", async () => {
    // ลิงก์ที่แชร์กันมาไม่มี ?fy= — store เลือกปีงบล่าสุดให้เอง แต่ขอบเขตอื่นในลิงก์เป็นของผู้ส่ง
    resetFiscalYearState();
    currentQuery.value = { months: "2025-11", division: "2" };
    get.mockResolvedValue({ data: [
      { id: 1, year: "2567", start_month: "2566-10", end_month: "2567-09" },
      { id: 2, year: "2568", start_month: "2567-10", end_month: "2568-09" },
    ] });

    await loadFiscalYears();

    expect(fiscalYearState.activeId).toBe(2);
    expect(replace).toHaveBeenCalledWith({ query: { months: "2025-11", division: "2", fy: 2 } });
  });
});

describe("refreshFiscalYears", () => {
  test("ส่ง header Cache-Control: no-cache เพื่อบังคับให้ดึงข้อมูลล่าสุดข้าม HTTP cache", async () => {
    resetFiscalYearState();
    get.mockResolvedValue({
      data: [
        { id: 1, year: "2567", start_month: "2566-10", end_month: "2567-09" },
      ],
    });

    await refreshFiscalYears();

    expect(get).toHaveBeenCalledWith("/fiscal-years", {
      headers: { "Cache-Control": "no-cache" },
    });
  });

  test("หากมี loadFiscalYears กำลังโหลดค้างอยู่ refreshFiscalYears จะรอให้จบก่อนแล้วโหลดใหม่พร้อม no-cache", async () => {
    resetFiscalYearState();
    let resolveFirst;
    get.mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve; }));
    get.mockResolvedValueOnce({
      data: [{ id: 2, year: "2568", start_month: "2567-10", end_month: "2568-09" }],
    });

    const firstPromise = loadFiscalYears();
    const refreshPromise = refreshFiscalYears();

    resolveFirst({ data: [{ id: 1, year: "2567", start_month: "2566-10", end_month: "2567-09" }] });
    await firstPromise;
    await refreshPromise;

    expect(get).toHaveBeenNthCalledWith(1, "/fiscal-years", undefined);
    expect(get).toHaveBeenNthCalledWith(2, "/fiscal-years", {
      headers: { "Cache-Control": "no-cache" },
    });
  });

  test("refresh ที่เกิดพร้อมกันระหว่างโหลดจะไม่ยิงคำขอที่สองซึ่งอาจเขียนข้อมูลเก่าทับ", async () => {
    resetFiscalYearState();
    let resolveInitial;
    get.mockImplementationOnce(
      () => new Promise((resolve) => { resolveInitial = resolve; })
    );
    get.mockResolvedValueOnce({
      data: [{ id: 2, year: "2569", start_month: "2568-10", end_month: "2569-09" }],
    });
    get.mockResolvedValueOnce({
      data: [{ id: 1, year: "2568", start_month: "2567-10", end_month: "2568-09" }],
    });

    const initialLoad = loadFiscalYears();
    const firstRefresh = refreshFiscalYears();
    const secondRefresh = refreshFiscalYears();

    resolveInitial({
      data: [{ id: 1, year: "2568", start_month: "2567-10", end_month: "2568-09" }],
    });
    await Promise.all([initialLoad, firstRefresh, secondRefresh]);

    expect(get).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenNthCalledWith(2, "/fiscal-years", {
      headers: { "Cache-Control": "no-cache" },
    });
    expect(fiscalYearState.list).toEqual([
      { id: 2, year: "2569", start_month: "2568-10", end_month: "2569-09" },
    ]);
  });

  test("refresh ใหม่ระหว่าง revalidation จะตามด้วยคำขอ no-cache อีกครั้ง", async () => {
    resetFiscalYearState();
    get.mockResolvedValueOnce({
      data: [{ id: 1, year: "2568", start_month: "2567-10", end_month: "2568-09" }],
    });
    let resolveFirstRefresh;
    get.mockImplementationOnce(
      () => new Promise((resolve) => { resolveFirstRefresh = resolve; })
    );
    get.mockResolvedValueOnce({
      data: [{ id: 3, year: "2570", start_month: "2569-10", end_month: "2570-09" }],
    });

    await loadFiscalYears();
    const firstRefresh = refreshFiscalYears();
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    const secondRefresh = refreshFiscalYears();

    resolveFirstRefresh({
      data: [{ id: 2, year: "2569", start_month: "2568-10", end_month: "2569-09" }],
    });
    await Promise.all([firstRefresh, secondRefresh]);

    expect(get).toHaveBeenCalledTimes(3);
    expect(get).toHaveBeenNthCalledWith(2, "/fiscal-years", {
      headers: { "Cache-Control": "no-cache" },
    });
    expect(get).toHaveBeenNthCalledWith(3, "/fiscal-years", {
      headers: { "Cache-Control": "no-cache" },
    });
    expect(fiscalYearState.list).toEqual([
      { id: 3, year: "2570", start_month: "2569-10", end_month: "2570-09" },
    ]);
  });
});
