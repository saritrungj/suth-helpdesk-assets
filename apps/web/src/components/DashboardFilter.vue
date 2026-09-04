<script setup>
import { ref, computed, onMounted, watch } from "vue";
import api from "../services/api";
import { activeFiscalYearRange, fiscalYearMonths } from "../store/fiscalYear";
import SearchableSelect from "./SearchableSelect.vue";
import MonthPicker from "./MonthPicker.vue";

const emit = defineEmits(["filter"]);

const building_name = ref("");

// เดือนที่เลือก — เลือกได้หลายเดือน ใช้ MonthPicker แบบเดียวกับหน้า "เปรียบเทียบข้อมูลรายเดือน"
// ส่งให้ backend เป็น string คั่นด้วย comma "YYYY-MM,YYYY-MM" (ไม่จำกัด max)
const monthSelection = ref([]);

// ถ้าผู้ใช้ยังไม่ได้เลือกเดือนเจาะจงใน MonthPicker ให้ default เป็น "ทั้งปีงบที่ active อยู่"
// (ต.ค.-ก.ย. เรียงตามปีงบจริงจาก fiscalYearMonths()) แทนการส่ง "" ว่างๆ ซึ่งเดิมแปลว่า
// "ไม่กรองเดือนเลย" ทำให้กราฟไปดึงข้อมูลทุกเดือนที่เคยมีย้อนหลังข้ามปีงบมาปนกัน
// (เห็นเป็นเดือนเรียงข้ามปีงบ/กราฟไม่ตรงปีงบที่เลือกไว้บน Navbar)
const month = computed(() => {
  if (monthSelection.value.length) return monthSelection.value.join(",");
  if (!range.value) return "";
  return fiscalYearMonths(range.value).join(",");
});

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

// ช่วงเดือนตามปีงบที่ active อยู่ตอนนี้เสมอ (global, เลือกที่ Navbar) — filter นี้จึงเหลือให้เลือกแค่ "เดือน"
const range = computed(() => activeFiscalYearRange.value);

// ตัวเลือกเดือนที่โชว์ใน MonthPicker — จำกัดเฉพาะเดือนของปีงบปัจจุบันเท่านั้น
// เดิม filter ด้วย m.startsWith(`${year}-`) ซึ่งจับได้แค่ปีปฏิทินเดียว แต่ปีงบราชการไทย
// คร่อม 2 ปีปฏิทิน (ต.ค.-ก.ย.) จึงต้องเทียบเป็นช่วง (BETWEEN) แทนการเทียบ prefix ปีเดียว
const months = computed(() => {
  if (!range.value) return [];
  return allMonths.value.filter(
    (m) => m >= range.value.startMonth && m <= range.value.endMonth
  );
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

// จับการเปลี่ยนค่า — immediate:true เพราะ default "month" ตอนนี้คือทั้งปีงบ (ไม่ใช่ "" ว่างๆ
// เหมือนเดิม) ต้อง emit filter ให้ Dashboard ตั้งแต่โหลดหน้าครั้งแรกเลย ไม่ใช่รอผู้ใช้แตะ filter ก่อน
watch([building_name, month], sendFilter, { immediate: true });

// ปีงบเปลี่ยน (จาก Navbar) → เดือนที่เคยเลือกไว้อาจเป็นของปีงบเก่า ใช้ต่อไม่ได้แล้ว ล้างทิ้งให้เริ่มเลือกใหม่
// (MonthPicker เองก็ watch ปีงบแล้วเคลียร์ตัวเองอยู่แล้ว แต่กันไว้เผื่อ options ยังไม่ทันอัปเดต)
watch(range, () => {
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
  <div class="bg-gray-50 shadow rounded-xl border border-gray-100/60 p-4 mb-6">
    <div class="flex items-center justify-between mb-3">
      <h2 class="text-[11px] font-semibold tracking-widest text-gray-400 uppercase">
        ตัวกรองแดชบอร์ด
      </h2>
    </div>

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
          เดือน (ปีงบ {{ range ? Number(range.endMonth.split("-")[0]) + 543 : "-" }})
        </label>
        <MonthPicker v-model="monthSelection" :options="months" />
      </div>

      <button
        @click="resetFilter"
        class="bg-red-500 hover:bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-medium"
      >
        ล้างตัวกรอง
      </button>
    </div>
  </div>
</template>