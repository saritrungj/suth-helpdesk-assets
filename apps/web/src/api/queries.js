import { useQuery } from "@tanstack/vue-query";
import { computed, unref } from "vue";
import api from "../services/api";

/**
 * queries.js — ชั้นดึงข้อมูลของทั้งเว็บ
 *
 * ปัญหาที่แก้: เดิมทุกหน้ายิง API เองด้วย axios ตรงๆ ใน onMounted แล้วเก็บลง ref
 * พร้อมตัวแปร loading กับ error ของตัวเอง ผลคือ
 *
 *   - **ยิงซ้ำโดยไม่จำเป็น** รายชื่ออาคาร ชั้น ฝ่าย แผนก ยี่ห้อ ถูกดึงใหม่ทุกครั้ง
 *     ที่เปลี่ยนหน้า ทั้งที่แทบไม่เคยเปลี่ยน — หกหน้าเปิดสลับกันไปมา = ยิงซ้ำสิบกว่ารอบ
 *   - **โค้ดจัดการสถานะซ้ำกันทุกไฟล์** loading/error/try-catch ชุดเดียวกันถูก
 *     คัดลอกไปกว่าสิบที่ แล้วค่อยๆ ไม่เหมือนกัน
 *   - **ไม่มีการรีเฟรชเบื้องหลัง** เปิดหน้าค้างไว้ทั้งวันแล้วข้อมูลไม่เคยอัปเดต
 *     จนกว่าจะกด F5 เอง
 *
 * TanStack Query จัดการทั้งสามข้อให้: cache ตาม key, ยุบคำขอที่ซ้ำกันในเวลาใกล้กัน
 * ให้เหลือครั้งเดียว, คืนค่าที่มีอยู่ทันทีแล้วค่อยรีเฟรชเบื้องหลัง และรีเฟรชเองเมื่อ
 * เน็ตกลับมาหรือผู้ใช้กลับมาที่แท็บ
 *
 * ทำไมข้อมูลอ้างอิงถึงตั้ง staleTime ยาว: อาคารกับแผนกเปลี่ยนปีละไม่กี่ครั้ง
 * การถือค่าไว้ 30 นาทีจึงไม่มีทางทำให้เห็นข้อมูลผิด แต่ตัดคำขอออกไปเกือบทั้งหมด
 * ส่วนหน้าที่ *แก้* ข้อมูลอ้างอิง (หน้า Admin) ยังยิง API ตรงๆ ของตัวเองอยู่ จึงเห็น
 * ผลทันทีเสมอ
 */

const MINUTE = 60 * 1000;

/**
 * key ของแต่ละชุดข้อมูล — รวมไว้ที่เดียวเพื่อไม่ให้พิมพ์ key ไม่ตรงกันคนละที่
 * แล้ว cache แตกเป็นสองก้อนโดยไม่รู้ตัว
 */
export const keys = {
  buildings: () => ["buildings"],
  floors: () => ["floors"],
  divisions: () => ["divisions"],
  departments: () => ["departments"],
  brands: () => ["brands"],
  contracts: () => ["contracts"],
  devices: (params) => (params ? ["devices", params] : ["devices"]),

  // key ของหน้ารายละเอียดเครื่อง — **ต้องมี deviceId อยู่ใน key เสมอ**
  // ถ้าลืมใส่ การสลับเครื่องเร็วๆ จะทำให้คำตอบของเครื่องก่อนหน้ามาทับเครื่องใหม่
  device: (deviceId) => ["devices", "detail", Number(deviceId)],
  deviceHistory: (deviceId) => ["devices", "detail", Number(deviceId), "history"],
  // ยอดพิมพ์ผูกกับปีงบ จึงต้องมีทั้งสองค่าใน key ไม่งั้นเปลี่ยนปีงบแล้วจะเห็น
  // ตัวเลขของปีเก่าค้างอยู่ใต้ป้ายปีใหม่ ซึ่งอันตรายกว่าไม่มีข้อมูลเลย
  deviceUsage: (deviceId, fiscalYearId) => [
    "print-transactions",
    "by-device",
    Number(deviceId),
    fiscalYearId ?? null,
  ],
  locationHistory: () => ["devices", "location-history"],
  monthlyKpi: (params) => ["dashboard", "monthly-kpi", params],
  summaryByBuilding: (params) => ["dashboard", "summary-by-building", params],
  overview: (params) => ["dashboard", "overview", params],
  coverage: (fiscalYearId) => ["print-transactions", "coverage", fiscalYearId],

  // ยอดพิมพ์ของ "หนึ่งเดือน ทุกเครื่อง" — เดือนต้องอยู่ใน key
  // ไม่งั้นเปลี่ยนเดือนเร็วๆ แล้วคำตอบของเดือนเก่าจะทับเดือนใหม่
  monthPages: (month) => ["print-transactions", "month", month || null],
};

const get = (url, params) => api.get(url, { params }).then((res) => res.data ?? []);

/** ข้อมูลอ้างอิงที่แทบไม่เปลี่ยน — ถือไว้นาน รีเฟรชเบื้องหลังเงียบๆ */
const REFERENCE = { staleTime: 30 * MINUTE, gcTime: 60 * MINUTE };

/** ข้อมูลที่เปลี่ยนได้ระหว่างวัน — ถือสั้นกว่า แต่ยังตัดการยิงซ้ำตอนสลับหน้าได้ */
const OPERATIONAL = { staleTime: 2 * MINUTE, gcTime: 15 * MINUTE };

export const useBuildings = () =>
  useQuery({ queryKey: keys.buildings(), queryFn: () => get("/buildings"), ...REFERENCE });

export const useFloors = () =>
  useQuery({ queryKey: keys.floors(), queryFn: () => get("/floors"), ...REFERENCE });

export const useDivisions = () =>
  useQuery({ queryKey: keys.divisions(), queryFn: () => get("/divisions"), ...REFERENCE });

export const useDepartments = () =>
  useQuery({ queryKey: keys.departments(), queryFn: () => get("/departments"), ...REFERENCE });

export const useBrands = () =>
  useQuery({ queryKey: keys.brands(), queryFn: () => get("/brands"), ...REFERENCE });

export const useContracts = () =>
  useQuery({ queryKey: keys.contracts(), queryFn: () => get("/contracts"), ...REFERENCE });

/**
 * ทะเบียนเครื่อง
 *
 * ไม่ส่ง params มา = ดึงทั้งหมด ซึ่งเป็นสิ่งที่หน้าที่กรองเองในเบราว์เซอร์ต้องการ
 * ส่ง params มา = ให้ API กรองให้ ซึ่งเร็วกว่ามากเมื่อจำนวนเครื่องโตขึ้น
 * (ดูพารามิเตอร์ที่รับได้ใน docs/reference/api.md)
 */
export function useDevices(params) {
  const key = computed(() => keys.devices(unref(params)));

  return useQuery({
    queryKey: key,
    queryFn: () => get("/devices", unref(params) ?? {}),
    placeholderData: (previous) => previous,
    ...OPERATIONAL,
  });
}

export const useLocationHistory = () =>
  useQuery({
    queryKey: keys.locationHistory(),
    queryFn: () => get("/devices/location-history"),
    ...OPERATIONAL,
  });

/**
 * ยอดรายเดือน — ใช้ร่วมกันหลายที่ในหน้าเดียว (กราฟแนวโน้ม, เส้นจิ๋วบนการ์ด KPI,
 * รายชื่อเดือนที่มีข้อมูลของตัวเลือกช่วงเวลา) การมี cache กลางทำให้ทั้งหมดนี้
 * ใช้คำขอเดียวกัน แทนที่จะยิงสามรอบพร้อมกันตอนเปิดหน้า
 *
 * params เป็น ref/computed ได้ พอค่าเปลี่ยน key เปลี่ยน แล้ว query จะดึงชุดใหม่เอง
 * โดยยังคืนชุดเดิมไว้ก่อนจนกว่าของใหม่จะมาถึง (placeholderData) — กราฟจึงไม่กระพริบ
 */
export function useMonthlyKpi(params) {
  const key = computed(() => keys.monthlyKpi(unref(params) ?? {}));

  return useQuery({
    queryKey: key,
    queryFn: () => get("/dashboard/monthly-kpi", unref(params) ?? {}),
    placeholderData: (previous) => previous,
    ...OPERATIONAL,
  });
}

/**
 * ภาพรวมของหน้าแรก — คำขอเดียวแทนที่ของเดิมห้าคำขอ
 *
 * รวมยอดรวม เส้นแนวโน้มทั้งปีงบ สถานะเครื่อง อันดับแผนก และ "รายการที่ต้องลงมือทำ"
 * ไว้ในคำตอบเดียว เพราะทั้งหมดนี้ถูกวาดพร้อมกันบนหน้าจอเดียว การแยกเป็นห้าคำขอ
 * ทำให้หน้าค่อยๆ โผล่ทีละส่วนและช้าเท่ากับคำขอที่ช้าที่สุดอยู่ดี
 */
export function useOverview(params) {
  const key = computed(() => keys.overview(unref(params) ?? {}));

  return useQuery({
    queryKey: key,
    queryFn: () => get("/dashboard/overview", unref(params) ?? {}),
    placeholderData: (previous) => previous,
    ...OPERATIONAL,
  });
}

/**
 * ความคืบหน้าการกรอกยอดพิมพ์ของปีงบ — เดือนไหนครบ เดือนไหนขาดกี่เครื่อง
 *
 * แยกจาก useOverview เพราะหน้าบันทึกยอดพิมพ์ต้องใช้ทั้ง 12 เดือนแบบละเอียด
 * ส่วนหน้าแรกต้องการแค่ข้อสรุป — แต่ทั้งสองหน้าใช้ cache ก้อนเดียวกันเมื่อเปิดสลับกัน
 */
export function useCoverage(fiscalYearId) {
  const key = computed(() => keys.coverage(unref(fiscalYearId)));

  return useQuery({
    queryKey: key,
    queryFn: () => get("/print-transactions/coverage", { fiscal_year_id: unref(fiscalYearId) }),
    enabled: computed(() => Boolean(unref(fiscalYearId))),
    ...OPERATIONAL,
  });
}

/**
 * รายละเอียดของเครื่องหนึ่งเครื่อง — ข้อมูลประจำ, ประวัติการย้าย และยอดพิมพ์
 *
 * ## ทำไมต้องอยู่ในชั้นนี้ ไม่ใช่ `Promise.all` ในหน้า
 *
 * หน้ารายละเอียดเดิมยิงสามคำขอเองแล้วเขียนผลลง `ref` ใน `watch`
 *
 *   **อาการที่พิสูจน์แล้วว่าเกิดจริง — สลับปีงบเร็วๆ แล้วข้อมูลปีเก่าไปอยู่ใต้
 *   ป้ายปีใหม่** วัดจากเบราว์เซอร์จริงโดยหน่วงคำขอของปีงบหนึ่งไว้ 2.5 วินาที
 *   แล้วสลับ 2568 -> 2569 -> 2568 ภายใน 400ms ผลคือหน้าขึ้นว่า
 *   "ปีงบประมาณ 2568" คู่กับยอด "22,208 หน้า" ซึ่งเป็นตัวเลขของปี 2569
 *   (ปี 2568 ของเครื่องนั้นไม่มีข้อมูลเลย) — ตัวเลขผิดเจ้าของโดยไม่มีอะไรฟ้อง
 *
 *   **อาการที่ตรวจแล้วว่า "ไม่" เกิดกับแอปนี้ — สลับเครื่องเร็วๆ** เพราะ
 *   `MainLayout` ใส่ `:key="route.path"` ไว้ การเปลี่ยนจาก /assets/17 ไป
 *   /assets/5 จึงสร้าง component ใหม่ทั้งตัว คำตอบที่มาช้าของเครื่องเก่าเขียนลง
 *   ref ของ instance ที่ถูกทิ้งไปแล้ว ไม่กระทบหน้าจอ — ทดสอบยืนยันแล้วทั้งโค้ดเดิม
 *   และโค้ดใหม่ **แต่การผูกข้อมูลกับ key ยังจำเป็นอยู่** เพราะเป็นสิ่งที่ทำให้
 *   ข้อ 1 หายไป และทำให้ข้อ 2 ไม่กลับมาถ้าวันหลังมีคนถอด key นั้นออก
 *
 * TanStack Query แก้ทั้งสองข้อด้วยการผูกข้อมูลกับ **key** แทนที่จะเป็นลำดับเวลา
 * คำตอบที่มาถึงจะถูกเก็บเข้า cache ของ key ที่มันขอ ไม่ใช่ของ key ที่กำลังแสดงอยู่
 *
 * ที่นี่ **ไม่ใช้** `placeholderData: (previous) => previous` โดยตั้งใจ — ต่างจาก
 * หน้าแดชบอร์ดที่คงกราฟเดิมไว้ระหว่างโหลดเพื่อไม่ให้เลย์เอาต์กระโดด เพราะที่นี่
 * "ข้อมูลเดิม" คือข้อมูลของ *เครื่องอื่น* หรือ *ปีอื่น* การคงไว้คือการโชว์ตัวเลข
 * ที่ไม่ใช่ของสิ่งที่หัวเรื่องบอก
 */
export function useDevice(deviceId) {
  return useQuery({
    queryKey: computed(() => keys.device(unref(deviceId))),
    queryFn: () => get(`/devices/${unref(deviceId)}`),
    enabled: computed(() => Number.isFinite(Number(unref(deviceId)))),
    ...OPERATIONAL,
  });
}

export function useDeviceHistory(deviceId) {
  return useQuery({
    queryKey: computed(() => keys.deviceHistory(unref(deviceId))),
    queryFn: () => get(`/devices/${unref(deviceId)}/history`).then((data) => data.history ?? []),
    enabled: computed(() => Number.isFinite(Number(unref(deviceId)))),
    ...OPERATIONAL,
  });
}

export function useDeviceUsage(deviceId, fiscalYearId) {
  return useQuery({
    queryKey: computed(() => keys.deviceUsage(unref(deviceId), unref(fiscalYearId))),
    queryFn: () =>
      get(`/print-transactions/by-device/${unref(deviceId)}`, {
        fiscal_year_id: unref(fiscalYearId),
      }),
    // ⚠️ ต้องรอ fiscalYearId ด้วย ไม่ใช่แค่ deviceId — endpoint นี้ **บังคับ**
    // ให้ส่งปีงบมา ถ้ายิงตั้งแต่ก่อนที่ store ปีงบจะโหลดเสร็จ จะได้ 400 ทุกครั้ง
    // ที่เปิดหน้า ซึ่งไม่ทำให้หน้าพัง (มันลองใหม่เองตอนปีงบมา) แต่ทิ้ง error ไว้ใน
    // console ทุกครั้ง จนคนเลิกสนใจ error ใน console ไปเลย
    enabled: computed(() => Number.isFinite(Number(unref(deviceId))) && Boolean(unref(fiscalYearId))),
    ...OPERATIONAL,
  });
}

/**
 * ยอดพิมพ์ของทุกเครื่องในเดือนหนึ่ง
 *
 * ## ทำไมต้องผ่านชั้นนี้ ไม่ใช่ยิง axios เองแล้วเก็บลง ref
 *
 * หน้าบันทึกยอดพิมพ์เคยโหลดเองด้วย `loadMonthPages()` ที่เขียนผลลง state ก้อนเดียว
 * โดยไม่ตรวจว่าคำตอบที่เพิ่งมาถึงเป็นของเดือนที่กำลังเลือกอยู่หรือเปล่า
 *
 *   - เลือก ก.ค. แล้วรีบเปลี่ยนเป็น ส.ค. ถ้าคำตอบของ ก.ค. มาช้ากว่า
 *     **ยอดของ ก.ค. จะไปแสดงใต้หัวข้อ ส.ค.** และถ้าผู้ใช้กดบันทึกตอนนั้น
 *     ตัวเลขของเดือนหนึ่งจะถูกเขียนทับลงอีกเดือนหนึ่งจริงๆ
 *   - โหลดไม่สำเร็จถูกกลืนเป็น `{}` ซึ่งหน้าตาเหมือน "เดือนนี้ยังไม่มีใครกรอก"
 *     ทั้งที่จริงคือ "ยังไม่รู้" — แล้วผู้ใช้จะกรอกทับของเดิมโดยไม่รู้ตัว
 *
 * ผูกกับ key ที่มีเดือนอยู่ข้างในแล้วทั้งสองปัญหาหายไปพร้อมกัน และได้สถานะ
 * error จริงมาแสดงด้วย แทนที่จะเป็นความว่างเปล่าที่ตีความผิดได้
 */
export function useMonthPages(month) {
  return useQuery({
    queryKey: computed(() => keys.monthPages(unref(month))),
    queryFn: () => get("/print-transactions", { month: unref(month) }),
    enabled: computed(() => Boolean(unref(month))),
    // ห้ามคงข้อมูลเดือนก่อนไว้ระหว่างโหลดเดือนใหม่ — ที่นี่ "ข้อมูลเดิม" คือยอด
    // ของ *เดือนอื่น* การคงไว้คือการโชว์ตัวเลขที่ไม่ใช่ของเดือนที่หัวข้อบอก
    ...OPERATIONAL,
  });
}

export function useSummaryByBuilding(params) {
  const key = computed(() => keys.summaryByBuilding(unref(params) ?? {}));

  return useQuery({
    queryKey: key,
    queryFn: () => get("/dashboard/summary-by-building", unref(params) ?? {}),
    placeholderData: (previous) => previous,
    ...OPERATIONAL,
  });
}

/**
 * ข้อมูลอ้างอิงทั้งชุดในครั้งเดียว — หน้าที่มีตัวกรองหลายชั้น (ทะเบียนทรัพย์สิน,
 * รายงาน, เปรียบเทียบ) ต้องใช้เกือบครบทุกชุด เรียกตัวนี้ตัวเดียวแทนการเรียกทีละอัน
 * ห้าหกบรรทัด และเพราะทุกชุดใช้ cache กลาง การเปิดหน้าที่สองจึงไม่ยิงอะไรเลย
 */
export function useReferenceData() {
  const buildings = useBuildings();
  const floors = useFloors();
  const divisions = useDivisions();
  const departments = useDepartments();
  const brands = useBrands();

  return {
    buildings: computed(() => buildings.data.value ?? []),
    floors: computed(() => floors.data.value ?? []),
    divisions: computed(() => divisions.data.value ?? []),
    departments: computed(() => departments.data.value ?? []),
    brands: computed(() => brands.data.value ?? []),
    isLoading: computed(() =>
      [buildings, floors, divisions, departments, brands].some((q) => q.isLoading.value)
    ),
  };
}
