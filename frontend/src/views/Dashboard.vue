<template>
  <div>

    <!-- Loading Overlay -->
    <div v-if="loading" class="text-center text-gray-500 mb-4">
      กำลังอัปเดตข้อมูล...
    </div>

    <!-- Error -->
    <div v-if="error" class="bg-red-100 text-red-700 p-4 rounded mb-4">
      {{ error }}
    </div>

    <!-- Dashboard -->
    <h1 class="text-3xl font-bold mb-6">Dashboard</h1>

    <DashboardFilter @filter="handleFilter" />

    <!-- KPI Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

      <div class="bg-white shadow rounded-lg p-6 hover:shadow-xl transition">
        <h2 class="text-gray-500 text-sm">อุปกรณ์ทั้งหมด</h2>
        <p class="text-3xl font-bold text-blue-600">
          {{ Number(stats.total_devices || 0).toLocaleString() }}
        </p>
      </div>

      <div class="bg-white shadow rounded-lg p-6 hover:shadow-xl transition">
        <h2 class="text-gray-500 text-sm">สัญญาทั้งหมด</h2>
        <p class="text-3xl font-bold text-green-600">
          {{ Number(stats.total_contracts || 0).toLocaleString() }}
        </p>
      </div>

      <div class="bg-white shadow rounded-lg p-6 hover:shadow-xl transition">
        <h2 class="text-gray-500 text-sm">รายการพิมพ์</h2>
        <p class="text-3xl font-bold text-purple-600">
          {{ Number(stats.total_transactions || 0).toLocaleString() }}
        </p>
      </div>

      <div class="bg-white shadow rounded-lg p-6 hover:shadow-xl transition">
        <h2 class="text-gray-500 text-sm">จำนวนหน้าที่พิมพ์</h2>
        <p class="text-3xl font-bold text-red-600">
          {{ Number(stats.total_pages || 0).toLocaleString() }}
        </p>
      </div>

    </div>

    <!-- Monthly Usage -->
    <div class="mt-8 bg-white shadow rounded-lg p-6">
      <h2 class="text-xl font-bold mb-4">Print Usage รายเดือน</h2>
      <MonthlyChart :filter="dashboardFilter" />
    </div>

    <!-- Building + Cost -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">

      <div class="bg-white shadow rounded-lg p-6">
        <h2 class="text-xl font-bold mb-4">จำนวนหน้าพิมพ์รายอาคาร</h2>
        <BuildingChart :filter="dashboardFilter" />
      </div>

      <div class="bg-white shadow rounded-lg p-6">
        <h2 class="text-xl font-bold mb-4">ค่าใช้จ่ายรายอาคาร</h2>
        <BuildingCostChart :filter="dashboardFilter" />
      </div>

    </div>

    <!-- Monthly Cost -->
    <div class="mt-8 bg-white shadow rounded-lg p-6">
      <h2 class="text-xl font-bold mb-4">ค่าใช้จ่ายรายเดือน</h2>
      <CostChart :filter="dashboardFilter" />
    </div>


    <!-- ============================================================
         ส่วนเสริม (Highlights) — ข้อมูลที่ไม่มีในหน้าอื่น
         ============================================================ -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">

      <!-- สถานะเครื่องพิมพ์ -->
      <div class="bg-white shadow rounded-lg p-6">
        <h2 class="text-xl font-bold mb-4">สถานะเครื่องพิมพ์</h2>

        <div v-if="highlightsLoading" class="text-gray-400 text-sm">กำลังโหลด...</div>

        <div v-else class="grid grid-cols-3 gap-4">
          <div
            v-for="s in highlights.device_status"
            :key="s.status"
            class="text-center p-4 rounded-lg"
            :class="deviceStatusMeta[s.status]?.bg"
          >
            <p class="text-2xl font-bold" :class="deviceStatusMeta[s.status]?.text">
              {{ Number(s.count).toLocaleString() }}
            </p>
            <p class="text-sm text-gray-600 mt-1">
              {{ deviceStatusMeta[s.status]?.label || s.status }}
            </p>
          </div>
        </div>
      </div>

      <!-- Top 5 แผนกที่ค่าใช้จ่ายสูงสุด -->
      <div class="bg-white shadow rounded-lg p-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-bold">แผนกที่ค่าใช้จ่ายสูงสุด (Top 5)</h2>
          <RouterLink to="/by-department" class="text-sm text-blue-600 hover:underline">
            ดูทั้งหมด →
          </RouterLink>
        </div>

        <div v-if="highlightsLoading" class="text-gray-400 text-sm">กำลังโหลด...</div>

        <div v-else-if="highlights.top_departments.length === 0" class="text-gray-400 text-sm">
          ไม่มีข้อมูลในช่วงที่เลือก
        </div>

        <table v-else class="w-full text-sm">
          <thead>
            <tr class="text-left text-gray-500 border-b">
              <th class="py-2">แผนก</th>
              <th class="py-2">ฝ่าย</th>
              <th class="py-2 text-right">หน้า</th>
              <th class="py-2 text-right">ค่าใช้จ่าย (บาท)</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="d in highlights.top_departments"
              :key="d.department_id ?? d.department_name"
              class="border-b last:border-0"
            >
              <td class="py-2">{{ d.department_name || "ไม่ระบุแผนก" }}</td>
              <td class="py-2 text-gray-500">{{ d.division_name || "-" }}</td>
              <td class="py-2 text-right">{{ Number(d.total_pages || 0).toLocaleString() }}</td>
              <td class="py-2 text-right font-medium">{{ formatMoney(d.total_cost) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

    </div>

    <!-- สรุปการใช้งานตามสัญญา -->
    <div class="mt-8 bg-white shadow rounded-lg p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-bold">สรุปการใช้งานตามสัญญา</h2>
        <RouterLink to="/admin/contracts" class="text-sm text-blue-600 hover:underline">
          จัดการสัญญา →
        </RouterLink>
      </div>

      <div v-if="highlightsLoading" class="text-gray-400 text-sm">กำลังโหลด...</div>

      <div v-else-if="highlights.contracts.length === 0" class="text-gray-400 text-sm">
        ยังไม่มีสัญญาในระบบ
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-gray-500 border-b">
              <th class="py-2">เลขที่สัญญา</th>
              <th class="py-2">ปีงบประมาณ</th>
              <th class="py-2 text-right">ราคา/แผ่น (บาท)</th>
              <th class="py-2 text-right">จำนวนเครื่อง</th>
              <th class="py-2 text-right">จำนวนหน้ารวม</th>
              <th class="py-2 text-right">ค่าใช้จ่ายรวม (บาท)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in highlights.contracts" :key="c.id" class="border-b last:border-0">
              <td class="py-2">{{ c.contract_no }}</td>
              <td class="py-2">{{ c.fiscal_year ? Number(c.fiscal_year) + 543 : "-" }}</td>
              <td class="py-2 text-right">{{ formatMoney(c.price_per_page) }}</td>
              <td class="py-2 text-right">{{ Number(c.device_count).toLocaleString() }}</td>
              <td class="py-2 text-right">{{ Number(c.total_pages).toLocaleString() }}</td>
              <td class="py-2 text-right font-medium">{{ formatMoney(c.total_cost) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { RouterLink } from "vue-router";
import api from "../services/api";

import MonthlyChart from "../components/MonthlyChart.vue";
import BuildingChart from "../components/BuildingChart.vue";
import BuildingCostChart from "../components/BuildingCostChart.vue";
import CostChart from "../components/CostChart.vue";
import DashboardFilter from "../components/DashboardFilter.vue";

// =====================
// State
// =====================

const loading = ref(true);
const error = ref(null);

const stats = ref({
  total_devices: 0,
  total_contracts: 0,
  total_transactions: 0,
  total_pages: 0,
});

const highlightsLoading = ref(true);

const highlights = ref({
  device_status: [],
  top_departments: [],
  contracts: [],
});

const deviceStatusMeta = {
  active: { label: "ใช้งานอยู่", bg: "bg-green-50", text: "text-green-600" },
  repair: { label: "ซ่อมบำรุง", bg: "bg-yellow-50", text: "text-yellow-600" },
  retired: { label: "ปลดระวาง", bg: "bg-gray-100", text: "text-gray-600" },
};

const dashboardFilter = ref({
  building_name: "",
  month: "",
});

function formatMoney(value) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// =====================
// Load KPI
// =====================

async function loadDashboard() {
  loading.value = true;
  error.value = null;

  try {
    const params = {};

    if (dashboardFilter.value.building_name) {
      params.building_name = dashboardFilter.value.building_name;
    }

    if (dashboardFilter.value.month) {
      params.month = dashboardFilter.value.month;
    }

    const res = await api.get("/dashboard/stats", { params });

    stats.value = {
      ...res.data,
      total_pages: Number(res.data.total_pages || 0),
    };
  } catch (err) {
    console.error("Dashboard error:", err);
    error.value = "ไม่สามารถโหลดข้อมูล Dashboard ได้";
  } finally {
    loading.value = false;
  }
}

// =====================
// Load Highlights (device status / top departments / contracts)
// =====================

async function loadHighlights() {
  highlightsLoading.value = true;

  try {
    const params = {};

    if (dashboardFilter.value.building_name) {
      params.building_name = dashboardFilter.value.building_name;
    }

    if (dashboardFilter.value.month) {
      params.month = dashboardFilter.value.month;
    }

    const res = await api.get("/dashboard/highlights", { params });

    highlights.value = {
      device_status: res.data.device_status || [],
      top_departments: res.data.top_departments || [],
      contracts: res.data.contracts || [],
    };
  } catch (err) {
    console.error("Highlights error:", err);
  } finally {
    highlightsLoading.value = false;
  }
}

// =====================
// Filter Event
// =====================

function handleFilter(filter) {
  if (
    dashboardFilter.value.building_name === filter.building_name &&
    dashboardFilter.value.month === filter.month
  ) {
    return;
  }

  dashboardFilter.value = { ...filter };

  loadDashboard();
  loadHighlights();
}

onMounted(() => {
  loadDashboard();
  loadHighlights();
});
</script>