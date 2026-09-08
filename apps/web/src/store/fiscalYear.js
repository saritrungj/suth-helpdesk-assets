import { reactive, computed, watch } from "vue";
import api from "../services/api";
import router from "../router";
import { fiscalYearMonths } from "@suth/domain";

// state ปีงบกลาง ที่ทุกหน้า/ทุก component subscribe ร่วมกัน
// ห้ามสร้าง fiscalYearId ซ้ำเป็น local state ในหน้าอื่นอีก ให้ import ตัวนี้ไปใช้แทน
export const fiscalYearState = reactive({
  list: [],        // [{ id, year }] — year เก็บเป็น พ.ศ. (เช่น "2567")
  activeId: null,  // fiscal_year_id ที่ active อยู่ตอนนี้
  loading: false,
});

// ปีงบที่ active อยู่ตอนนี้ (object เต็ม ไม่ใช่แค่ id)
export const activeFiscalYear = computed(
  () => fiscalYearState.list.find((f) => f.id === fiscalYearState.activeId) || null
);

// ช่วงเดือนจริงของปีงบที่ active อยู่ตอนนี้ (ปีงบราชการไทย = 1 ต.ค. - 30 ก.ย. เสมอ คร่อม 2 ปีปฏิทิน)
// เดิมที่นี่คำนวณเองแบบผิดๆ ว่าปีงบเริ่ม ม.ค. ตรงกับปี ค.ศ. เดียวกันเป๊ะ (แค่ -543 จาก พ.ศ.)
// ทำให้เดือนที่โชว์ให้เลือก/ใช้ query ผิดจากปีงบจริง ตอนนี้อ่าน start_month/end_month ที่
// backend คำนวณเก็บไว้ให้แล้วตอนสร้าง/แก้ไขปีงบ (ดู @suth/domain) แทน
// null = ยังไม่มีปีงบ active ให้ component ที่ใช้ค่านี้เช็คเองก่อนสร้างเดือน
export const activeFiscalYearRange = computed(() => {
  const fy = activeFiscalYear.value;
  if (!fy || !fy.start_month || !fy.end_month) return null;
  return { startMonth: fy.start_month, endMonth: fy.end_month };
});

// สร้างรายชื่อเดือน "YYYY-MM" เรียงจาก start_month ถึง end_month ของปีงบ (12 เดือน ต.ค.-ก.ย.)
// ตัวจริงอยู่ที่ @suth/domain เพราะฝั่ง API ต้องได้ลำดับเดือนชุดเดียวกัน — re-export ต่อไว้
// เพื่อไม่ให้หน้าที่ import จาก store นี้อยู่เดิมต้องแก้
export { fiscalYearMonths };

let loaded = false;
let loadingPromise = null;

async function fetchFiscalYears() {
  fiscalYearState.loading = true;

  loadingPromise = (async () => {
    try {
      const res = await api.get("/fiscal-years");
      fiscalYearState.list = res.data;

      // 1) ถ้า URL มี ?fy= อยู่แล้ว (เช่น refresh หน้า หรือ share link มา) ใช้ค่านั้นก่อน
      const queryFy = Number(router.currentRoute.value.query.fy);
      const matched = fiscalYearState.list.find((f) => f.id === queryFy);

      if (matched) {
        fiscalYearState.activeId = matched.id;
      } else if (
        fiscalYearState.list.length &&
        !fiscalYearState.list.some((f) => f.id === fiscalYearState.activeId)
      ) {
        // 2) ไม่งั้น default เป็นปีงบล่าสุด (ตัวสุดท้ายของ list) — เฉพาะตอนที่ค่าที่เลือกไว้เดิม
        // ใช้ไม่ได้แล้ว (ยังไม่เคยเลือก หรือปีงบที่เคยเลือกไว้ถูกลบไปแล้ว) ไม่งั้นจะไปทับปีงบที่
        // ผู้ใช้ตั้งใจเลือกไว้อยู่ทุกครั้งที่มีคน add/edit ปีงบใหม่จากหน้า Admin
        applyFiscalYear(fiscalYearState.list[fiscalYearState.list.length - 1].id);
      }

      // ล็อกว่าโหลดสำเร็จแล้วก็ต่อเมื่อ "สำเร็จจริง" เท่านั้น — ถ้าพลาดจะไม่ล็อก เพื่อให้เรียกซ้ำได้ใหม่
      loaded = true;
    } catch (err) {
      console.error("Load fiscal years error:", err);
    } finally {
      fiscalYearState.loading = false;
      loadingPromise = null;
    }
  })();

  return loadingPromise;
}

export async function loadFiscalYears() {
  // กันยิงซ้ำถ้าหลายหน้าเรียกพร้อมกัน "ระหว่างที่กำลังโหลดอยู่" เท่านั้น
  // (เดิม lock ด้วย loaded = true ก่อนเรียก API เลย ถ้ารอบแรกพลาด เช่น token ยังไม่ทันแนบตอน
  // login เสร็จใหม่ๆ จะค้าง loaded = true ตลอดไป ทำให้ปีงบไม่มีให้เลือกจนกว่าจะ refresh หน้าเอง)
  if (loaded) return;
  if (loadingPromise) return loadingPromise;
  return fetchFiscalYears();
}

// บังคับโหลดใหม่เสมอ ไม่สนใจ loaded flag — ใช้ตอนมีการ add/edit/delete ปีงบจากหน้า Admin
// เพื่อให้ตัวเลือกปีงบบนแถบบน (และทุกหน้าที่ subscribe fiscalYearState) เห็นข้อมูลล่าสุดทันที
// โดยไม่ต้อง refresh หน้าเว็บเอง
export async function refreshFiscalYears() {
  if (loadingPromise) return loadingPromise;
  return fetchFiscalYears();
}

export function resetFiscalYearState() {
  loaded = false;
  loadingPromise = null;
  fiscalYearState.list = [];
  fiscalYearState.activeId = null;
}

// ด่านที่หน้าต่างๆ ฝากไว้ว่า "ก่อนเปลี่ยนปีงบ ถามฉันก่อน"
//
// จำเป็นเพราะการเปลี่ยนปีงบเกิดจากแถบบนซึ่งอยู่คนละที่กับหน้าที่มีของกรอกค้างอยู่
// ถ้าปล่อยให้หน้านั้นไปดักที่ watch ของตัวเอง ปีงบจะเปลี่ยนไปแล้วก่อนที่จะได้ถาม
// แล้วต้องย้อนกลับ ซึ่งผู้ใช้จะเห็นตัวเลขปีงบกระพริบไปมา — กันที่ต้นทางตรงนี้แทน
const guards = new Set();

/**
 * ฝากด่านไว้ — คืนฟังก์ชันสำหรับถอดออก
 *
 * **ต้องถอดตอน unmount เสมอ** ไม่งั้นหน้าที่ปิดไปแล้วยังบล็อกการเปลี่ยนปีงบของทั้งแอป
 *
 * @param {(nextId: number) => Promise<boolean>} guard false = ยับยั้งการเปลี่ยน
 */
export function registerFiscalYearGuard(guard) {
  guards.add(guard);
  return () => guards.delete(guard);
}

/** ถามด่านทุกตัว — ด่านเดียวที่ปฏิเสธก็พอที่จะยับยั้ง */
async function guardsAllow(id) {
  for (const guard of guards) {
    if (!(await guard(id))) return false;
  }
  return true;
}

/**
 * เปลี่ยนปีงบจริงๆ โดย **ไม่ผ่านด่าน**
 *
 * ใช้เฉพาะตอนเลือกปีงบเริ่มต้นหลังโหลดรายการเสร็จ ซึ่งยังไม่มีหน้าไหนมีของกรอกค้าง
 * และเป็นจังหวะที่ห้ามถูกยับยั้ง ไม่งั้นแอปจะค้างโดยไม่มีปีงบ active เลย
 */
function applyFiscalYear(id) {
  fiscalYearState.activeId = id;

  // sync ลง query param ?fy= ทุกครั้งที่เปลี่ยนปีงบ (replace ไม่ push เพื่อไม่ให้ history รก)
  router.replace({
    query: { ...router.currentRoute.value.query, fy: id },
  });
}

/**
 * เปลี่ยนปีงบที่ active ตามคำสั่งของผู้ใช้ — ผ่านด่านก่อนเสมอ
 *
 * @returns {Promise<boolean>} false = ถูกด่านยับยั้ง ปีงบยังเป็นค่าเดิม
 */
export async function setActiveFiscalYear(id) {
  // เลือกปีเดิมซ้ำไม่ใช่การเปลี่ยน จึงไม่ต้องถามด่าน แต่ยัง sync URL เหมือนเดิม
  // เผื่อกรณีที่ activeId ถูกตั้งจากที่อื่นโดยที่ ?fy= ยังไม่มีในลิงก์
  if (id === fiscalYearState.activeId) {
    applyFiscalYear(id);
    return true;
  }

  if (!(await guardsAllow(id))) return false;

  applyFiscalYear(id);
  return true;
}

// ถ้า query เปลี่ยนจากทางอื่น (เช่น กด back/forward, หรือ paste link ที่มี ?fy=) ให้ sync state ตาม
//
// ต้องเรียกจาก main.js หลังจากที่ router ถูกสร้างเสร็จแล้ว ห้ามตั้ง watch ตอน module evaluate
// เพราะไฟล์นี้กับ router/index.js import กันเป็นวง (router -> Dashboard.vue -> ไฟล์นี้ -> router)
// getter ของ watch จะทำงานทันทีที่สร้าง ถ้าตอนนั้น router/index.js ยังประกาศ const router ไม่เสร็จ
// จะได้ ReferenceError: Cannot access 'router' before initialization แล้วแอปไม่ mount ทั้งหน้า
export function startFiscalYearRouterSync() {
  // ธงกันวน: ตอนที่ด่านยับยั้งแล้วเราเขียน ?fy= กลับเป็นค่าเดิม watch ตัวนี้จะยิงอีกรอบ
  // ถ้าไม่กันไว้ มันจะเห็นว่า fy ไม่ตรง activeId แล้ววนถามด่านซ้ำไม่จบ
  let reverting = false;

  watch(
    () => router.currentRoute.value.query.fy,
    async (fy) => {
      if (reverting) return;

      const id = Number(fy);
      if (!id || id === fiscalYearState.activeId) return;

      // ต้องผ่านด่านเหมือนการกดเลือกจากแถบบน — เส้นทางนี้ (กด back/forward หรือเปิด
      // ลิงก์ที่มี ?fy=) เคยข้ามด่านไปได้ ทำให้ของที่กรอกค้างไว้หายเงียบเหมือนเดิม
      if (await guardsAllow(id)) {
        fiscalYearState.activeId = id;
        return;
      }

      // ถูกยับยั้ง — URL เดินหน้าไปแล้วเพราะเบราว์เซอร์เป็นคนเปลี่ยน ต้องเขียนกลับ
      // ให้ตรงกับปีงบที่ยังใช้อยู่จริง ไม่งั้นแถบที่อยู่กับหน้าจอจะบอกคนละปี
      reverting = true;
      try {
        await router.replace({
          query: { ...router.currentRoute.value.query, fy: fiscalYearState.activeId },
        });
      } finally {
        reverting = false;
      }
    }
  );
}
