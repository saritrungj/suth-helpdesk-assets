import { reactive, computed, watch } from "vue";
import api from "../services/api";
import router from "../router";

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
// backend คำนวณเก็บไว้ให้แล้วตอนสร้าง/แก้ไขปีงบ (ดู backend/utils/fiscalYear.js) แทน
// null = ยังไม่มีปีงบ active ให้ component ที่ใช้ค่านี้เช็คเองก่อนสร้างเดือน
export const activeFiscalYearRange = computed(() => {
  const fy = activeFiscalYear.value;
  if (!fy || !fy.start_month || !fy.end_month) return null;
  return { startMonth: fy.start_month, endMonth: fy.end_month };
});

// สร้างรายชื่อเดือน "YYYY-MM" เรียงจาก start_month ถึง end_month ของปีงบ (12 เดือน ต.ค.-ก.ย.)
export function fiscalYearMonths(range) {
  if (!range) return [];

  const [startY, startM] = range.startMonth.split("-").map(Number);
  const months = [];
  let y = startY;
  let m = startM;

  for (let i = 0; i < 12; i++) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }

  return months;
}

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
        setActiveFiscalYear(fiscalYearState.list[fiscalYearState.list.length - 1].id);
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
// เพื่อให้ dropdown ปีงบที่ Navbar (และทุกหน้าที่ subscribe fiscalYearState) เห็นข้อมูลล่าสุดทันที
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

export function setActiveFiscalYear(id) {
  fiscalYearState.activeId = id;

  // sync ลง query param ?fy= ทุกครั้งที่เปลี่ยนปีงบ (replace ไม่ push เพื่อไม่ให้ history รก)
  router.replace({
    query: { ...router.currentRoute.value.query, fy: id },
  });
}

// ถ้า query เปลี่ยนจากทางอื่น (เช่น กด back/forward, หรือ paste link ที่มี ?fy=) ให้ sync state ตาม
watch(
  () => router.currentRoute.value.query.fy,
  (fy) => {
    const id = Number(fy);
    if (id && id !== fiscalYearState.activeId) {
      fiscalYearState.activeId = id;
    }
  }
);