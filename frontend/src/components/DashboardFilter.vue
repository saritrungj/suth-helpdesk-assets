<script setup>
import { ref, computed, onMounted, watch } from "vue";
import api from "../services/api";
import { activeGregorianYear } from "../store/fiscalYear";
import SearchableSelect from "./SearchableSelect.vue";
import MonthPicker from "./MonthPicker.vue";

const emit = defineEmits(["filter"]);

const building_name = ref("");

// เดือนที่เลือก — เลือกได้หลายเดือน ใช้ MonthPicker แบบเดียวกับหน้า "เปรียบเทียบข้อมูลรายเดือน"
// ส่งให้ backend เป็น string คั่นด้วย comma "YYYY-MM,YYYY-MM" (ไม่จำกัด max)
const monthSelection = ref([]);
const month = computed(() => monthSelection.value.join(","));

const buildings = ref([]);
const allMonths = ref([]); // เดือนทั้งหมด "YYYY-MM" ที่เคยมีข้อมูล (ทุกปี) — ยังไม่กรองปีงบ

// โหลดอาคาร
async function loadBuildings() {
  try {
    const res = await api.get("/buildings");
    buildings.value = res.data;
  } catch (err) {
    console.error("Load buildings error", err);
  }
}

// โหลดเดือนทั้งหมดที่เคยมีข้อมูล (ทุกปี) — จะไปกรองเหลือเฉพาะปีงบปัจจุบันในขั้นตอนถัดไป
async function loadMonths() {
  try {
    const res = await api.get("/dashboard/monthly-kpi");
    allMonths.value = [...new Set(res.data.map((item) => item.month))].sort();
  } catch (err) {
    console.error("Load months error", err);
  }
}

// ปีอ้างอิงตามปีงบที่ active อยู่ตอนนี้เสมอ (global, เลือกที่ Navbar) — filter นี้จึงเหลือให้เลือกแค่ "เดือน"
const year = computed(() => activeGregorianYear.value);

// ตัวเลือกเดือนที่โชว์ใน MonthPicker — จำกัดเฉพาะเดือนของปีงบปัจจุบันเท่านั้น
const months = computed(() => {
  if (!year.value) return [];
  return allMonths.value.filter((m) => m.startsWith(`${year.value}-`));
});

// ตัวเลือกอาคารสำหรับ SearchableSelect (เลือกจากรายการเสมอ ไม่มีปัญหาพิมพ์ชื่อไม่ตรงแบบ input ธรรมดา)
const buildingOptions = computed(() => buildings.value.map((b) => ({ value: b.name, label: b.name })));

// ส่ง Filter
function sendFilter() {
  const filter = {
    building_name: building_name.value,
    month: month.value,
  };

  emit("filter", filter);
}

// จับการเปลี่ยนค่า
watch([building_name, month], sendFilter);

// ปีงบเปลี่ยน (จาก Navbar) → เดือนที่เคยเลือกไว้อาจเป็นของปีงบเก่า ใช้ต่อไม่ได้แล้ว ล้างทิ้งให้เริ่มเลือกใหม่
// (MonthPicker เองก็ watch ปีงบแล้วเคลียร์ตัวเองอยู่แล้ว แต่กันไว้เผื่อ options ยังไม่ทันอัปเดต)
watch(year, () => {
  if (monthSelection.value.length) monthSelection.value = [];
});

// Reset
function resetFilter() {
  building_name.value = "";
  monthSelection.value = [];
}

onMounted(async () => {
  await loadBuildings();
  await loadMonths();
});
</script>

<template>
  <div class="bg-gray-50 shadow rounded-lg p-4 mb-6">
    <h2 class="font-bold mb-3">Filter Dashboard</h2>

    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
      <!-- อาคาร -->
      <div>
        <label class="block text-xs text-gray-500 mb-1">อาคาร</label>
        <SearchableSelect
          v-model="building_name"
          :options="buildingOptions"
          placeholder="ทุกอาคาร"
          search-placeholder="พิมพ์ชื่ออาคาร..."
        />
      </div>

      <!-- เดือน (ปีอ้างอิงจากปีงบที่เลือกที่ Navbar) -->
      <div>
        <label class="block text-xs text-gray-500 mb-1">
          เดือน (ปีงบ {{ year ? year + 543 : "-" }})
        </label>
        <MonthPicker v-model="monthSelection" :options="months" />
      </div>

      <button
        @click="resetFilter"
        class="bg-red-500 hover:bg-red-600 text-white rounded px-4 py-2"
      >
        ล้างตัวกรอง
      </button>
    </div>
  </div>
</template>