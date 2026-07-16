<script setup>
import { ref, computed, onMounted } from "vue";
import api from "../services/api";

const rows = ref([]);
const loading = ref(true);

// ฟิลเตอร์ (ค่าว่าง = ทั้งหมด)
const filters = ref({
  fiscal_year: "",
  month: "",
  building_name: "",
  division_name: "",
  department_name: "",
});

// สร้างตัวเลือกฟิลเตอร์จากข้อมูลจริง (distinct)
function distinct(key) {
  const values = new Set();
  rows.value.forEach((r) => {
    if (r[key]) values.add(r[key]);
  });
  return [...values].sort();
}

const fiscalYearOptions = computed(() => distinct("fiscal_year"));
const monthOptions = computed(() => distinct("month"));
const buildingOptions = computed(() => distinct("building_name"));
const divisionOptions = computed(() => distinct("division_name"));
const departmentOptions = computed(() => distinct("department_name"));

const filteredRows = computed(() =>
  rows.value.filter((r) => {
    if (filters.value.fiscal_year && r.fiscal_year !== filters.value.fiscal_year) return false;
    if (filters.value.month && r.month !== filters.value.month) return false;
    if (filters.value.building_name && r.building_name !== filters.value.building_name) return false;
    if (filters.value.division_name && r.division_name !== filters.value.division_name) return false;
    if (filters.value.department_name && r.department_name !== filters.value.department_name) return false;
    return true;
  })
);

const summary = computed(() => {
  const devices = new Set();
  let netPages = 0;
  let totalCost = 0;

  filteredRows.value.forEach((r) => {
    devices.add(r.serial_number);
    netPages += Number(r.net_pages);
    totalCost += Number(r.total_cost);
  });

  return {
    device_count: devices.size,
    net_pages: netPages,
    total_cost: totalCost,
  };
});

function clearFilters() {
  filters.value = {
    fiscal_year: "",
    month: "",
    building_name: "",
    division_name: "",
    department_name: "",
  };
}

function fmt(n, decimals = 0) {
  return Number(n).toLocaleString("th-TH", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// Export ตารางที่กรองแล้วเป็น CSV (มี BOM ให้ Excel อ่านภาษาไทยถูก)
function exportCSV() {
  const header = [
    "เดือน", "ปีงบประมาณ", "Serial Number", "ยี่ห้อ", "อาคาร", "ชั้น",
    "ฝ่าย", "แผนก", "สถานะ", "ยอดสุทธิ (แผ่น)", "ราคาต่อแผ่น (บาท)", "ค่าใช้จ่าย (บาท)",
  ];

  const lines = filteredRows.value.map((r) =>
    [
      r.month, r.fiscal_year || "", r.serial_number, r.brand_name || "",
      r.building_name || "", r.floor_name || "", r.division_name || "",
      r.department_name || "", r.device_status || "",
      Number(r.net_pages).toFixed(1),
      Number(r.cost_per_page).toFixed(2),
      Number(r.total_cost).toFixed(2),
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );

  const csv = "\uFEFF" + [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `report_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function load() {
  loading.value = true;
  try {
    const res = await api.get("/dashboard/compare");
    rows.value = res.data;
  } catch (err) {
    console.error(err);
    alert("โหลดข้อมูลไม่สำเร็จ");
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <h1 class="text-3xl font-bold mb-6">รายงานการใช้งานและค่าใช้จ่าย</h1>

    <p v-if="loading" class="text-gray-500">กำลังโหลดข้อมูล...</p>

    <p v-else-if="rows.length === 0" class="text-gray-500">
      ยังไม่มีข้อมูลยอดพิมพ์สำหรับออกรายงาน
    </p>

    <template v-else>
      <!-- ฟิลเตอร์ -->
      <div class="bg-white shadow rounded-lg p-4 mb-6">
        <div class="flex flex-wrap gap-3 items-end">
          <div>
            <label class="block text-sm text-gray-500 mb-1">ปีงบประมาณ</label>
            <select v-model="filters.fiscal_year" class="border rounded px-3 py-2">
              <option value="">ทั้งหมด</option>
              <option v-for="o in fiscalYearOptions" :key="o" :value="o">{{ o }}</option>
            </select>
          </div>

          <div>
            <label class="block text-sm text-gray-500 mb-1">เดือน</label>
            <select v-model="filters.month" class="border rounded px-3 py-2">
              <option value="">ทั้งหมด</option>
              <option v-for="o in monthOptions" :key="o" :value="o">{{ o }}</option>
            </select>
          </div>

          <div>
            <label class="block text-sm text-gray-500 mb-1">อาคาร</label>
            <select v-model="filters.building_name" class="border rounded px-3 py-2">
              <option value="">ทั้งหมด</option>
              <option v-for="o in buildingOptions" :key="o" :value="o">{{ o }}</option>
            </select>
          </div>

          <div>
            <label class="block text-sm text-gray-500 mb-1">ฝ่าย</label>
            <select v-model="filters.division_name" class="border rounded px-3 py-2">
              <option value="">ทั้งหมด</option>
              <option v-for="o in divisionOptions" :key="o" :value="o">{{ o }}</option>
            </select>
          </div>

          <div>
            <label class="block text-sm text-gray-500 mb-1">แผนก</label>
            <select v-model="filters.department_name" class="border rounded px-3 py-2">
              <option value="">ทั้งหมด</option>
              <option v-for="o in departmentOptions" :key="o" :value="o">{{ o }}</option>
            </select>
          </div>

          <button
            @click="clearFilters"
            class="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300"
          >
            ล้างฟิลเตอร์
          </button>

          <button
            @click="exportCSV"
            class="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 ml-auto"
          >
            ⬇️ Export CSV
          </button>
        </div>
      </div>

      <!-- การ์ดสรุป -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div class="bg-white shadow rounded-lg p-5">
          <p class="text-sm text-gray-500">จำนวนเครื่อง (ตามเงื่อนไข)</p>
          <p class="text-2xl font-bold text-blue-600">{{ fmt(summary.device_count) }}</p>
        </div>
        <div class="bg-white shadow rounded-lg p-5">
          <p class="text-sm text-gray-500">ยอดพิมพ์สุทธิรวม (แผ่น)</p>
          <p class="text-2xl font-bold text-purple-600">{{ fmt(summary.net_pages, 1) }}</p>
        </div>
        <div class="bg-white shadow rounded-lg p-5">
          <p class="text-sm text-gray-500">ค่าใช้จ่ายรวม (บาท)</p>
          <p class="text-2xl font-bold text-red-600">{{ fmt(summary.total_cost, 2) }}</p>
        </div>
      </div>

      <!-- ตาราง -->
      <div class="bg-white shadow rounded-lg p-4 overflow-x-auto">
        <p class="text-sm text-gray-500 mb-2">
          แสดง {{ fmt(filteredRows.length) }} รายการ
        </p>

        <table class="w-full border-collapse border text-sm">
          <thead>
            <tr class="bg-gray-100">
              <th class="border p-2">เดือน</th>
              <th class="border p-2">ปีงบ</th>
              <th class="border p-2">Serial</th>
              <th class="border p-2">ยี่ห้อ</th>
              <th class="border p-2">อาคาร</th>
              <th class="border p-2">ชั้น</th>
              <th class="border p-2">ฝ่าย</th>
              <th class="border p-2">แผนก</th>
              <th class="border p-2 text-right">ยอดสุทธิ</th>
              <th class="border p-2 text-right">บาท/แผ่น</th>
              <th class="border p-2 text-right">ค่าใช้จ่าย</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in filteredRows" :key="i">
              <td class="border p-2">{{ r.month }}</td>
              <td class="border p-2">{{ r.fiscal_year || '-' }}</td>
              <td class="border p-2">{{ r.serial_number }}</td>
              <td class="border p-2">{{ r.brand_name || '-' }}</td>
              <td class="border p-2">{{ r.building_name || '-' }}</td>
              <td class="border p-2">{{ r.floor_name || '-' }}</td>
              <td class="border p-2">{{ r.division_name || '-' }}</td>
              <td class="border p-2">{{ r.department_name || '-' }}</td>
              <td class="border p-2 text-right">{{ fmt(r.net_pages, 1) }}</td>
              <td class="border p-2 text-right">{{ fmt(r.cost_per_page, 2) }}</td>
              <td class="border p-2 text-right">{{ fmt(r.total_cost, 2) }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="font-semibold bg-gray-50">
              <td colspan="8" class="border p-2">รวม</td>
              <td class="border p-2 text-right">{{ fmt(summary.net_pages, 1) }}</td>
              <td class="border p-2"></td>
              <td class="border p-2 text-right">{{ fmt(summary.total_cost, 2) }}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </template>
  </div>
</template>
