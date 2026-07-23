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

// ปีงบเริ่มเดือน ม.ค. (ปีปฏิทินปกติ) จึงตรงกับปี ค.ศ. ตัวเดียวกันเป๊ะๆ
// ค่า year ในตาราง fiscal_year เก็บเป็น พ.ศ. (เช่น "2567") ต้อง -543 ให้เป็น ค.ศ. (2024)
// ก่อนเอาไปประกอบเป็น "YYYY-MM" เพื่อ query กับ backend
// null = ยังไม่มีปีงบ active ให้ component ที่ใช้ค่านี้เช็คเองก่อนสร้างเดือน
export const activeGregorianYear = computed(() =>
  activeFiscalYear.value ? Number(activeFiscalYear.value.year) - 543 : null
);

let loaded = false;

export async function loadFiscalYears() {
  // กันโหลดซ้ำหลายรอบ ถ้าหลายหน้าเรียกพร้อมกัน
  if (loaded) return;
  loaded = true;

  fiscalYearState.loading = true;
  try {
    const res = await api.get("/fiscal-years");
    fiscalYearState.list = res.data;

    // 1) ถ้า URL มี ?fy= อยู่แล้ว (เช่น refresh หน้า หรือ share link มา) ใช้ค่านั้นก่อน
    const queryFy = Number(router.currentRoute.value.query.fy);
    const matched = fiscalYearState.list.find((f) => f.id === queryFy);

    if (matched) {
      fiscalYearState.activeId = matched.id;
    } else if (fiscalYearState.list.length) {
      // 2) ไม่งั้น default เป็นปีงบล่าสุด (ตัวสุดท้ายของ list)
      setActiveFiscalYear(fiscalYearState.list[fiscalYearState.list.length - 1].id);
    }
  } catch (err) {
    console.error("Load fiscal years error:", err);
  } finally {
    fiscalYearState.loading = false;
  }
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