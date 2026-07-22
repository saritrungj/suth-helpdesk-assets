import { reactive, watch } from "vue";
import api from "../services/api";
import router from "../router";

// state ปีงบกลาง ที่ทุกหน้า/ทุก component subscribe ร่วมกัน
// ห้ามสร้าง fiscalYearId ซ้ำเป็น local state ในหน้าอื่นอีก ให้ import ตัวนี้ไปใช้แทน
export const fiscalYearState = reactive({
  list: [],        // [{ id, year }]
  activeId: null,  // fiscal_year_id ที่ active อยู่ตอนนี้
  loading: false,
});

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