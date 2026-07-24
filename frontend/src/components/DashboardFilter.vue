<script setup>
import { ref, computed, onMounted, watch } from "vue";
import api from "../services/api";
import { activeGregorianYear } from "../store/fiscalYear";
import SearchableSelect from "./SearchableSelect.vue";

const emit = defineEmits(["filter"]);

const building_name = ref("");
const month = ref("");

const buildings = ref([]);
const allMonths = ref([]); // เดือนทั้งหมด "YYYY-MM" ที่เคยมีข้อมูล (ทุกปี) — ยังไม่กรองปีงบ

const monthsTH = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน",
  "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม",
  "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

function formatMonth(value) {
  if (!value || typeof value !== "string") return "";
  const [y, m] = value.split("-");
  return `${monthsTH[Number(m) - 1]} ${Number(y) + 543}`;
}

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

// ตัวเลือกเดือนที่โชว์ในดรอปดาวน์ — จำกัดเฉพาะเดือนของปีงบปัจจุบันเท่านั้น
const months = computed(() => {
  if (!year.value) return [];
  return allMonths.value
    .filter((m) => m.startsWith(`${year.value}-`))
    .map((m) => ({ value: m, label: formatMonth(m) }));
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
watch(year, () => {
  if (month.value && !months.value.some((m) => m.value === month.value)) {
    month.value = "";
  }
});

// Reset
function resetFilter() {
  building_name.value = "";
  month.value = "";
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
        <select v-model="month" class="border rounded p-2 w-full">
          <option value="">ทุกเดือน</option>
          <option v-for="m in months" :key="m.value" :value="m.value">{{ m.label }}</option>
        </select>
      </div>

      <button
        @click="resetFilter"
        class="bg-gray-500 hover:bg-gray-600 text-white rounded px-4 py-2"
      >
        ล้างตัวกรอง
      </button>
    </div>
  </div>
</template>