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

    <!-- Compare Before/After -->
    <div class="mt-8">
      <ComparePeriods />
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

  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import api from "../services/api";

import MonthlyChart from "../components/MonthlyChart.vue";
import BuildingChart from "../components/BuildingChart.vue";
import BuildingCostChart from "../components/BuildingCostChart.vue";
import CostChart from "../components/CostChart.vue";
import DashboardFilter from "../components/DashboardFilter.vue";
import ComparePeriods from "../components/ComparePeriods.vue";

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

const dashboardFilter = ref({
  building_name: "",
  month: "",
});

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

    console.log("Dashboard Stats:", res.data);

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
// Filter Event
// =====================

function handleFilter(filter) {
  if (
    dashboardFilter.value.building_name === filter.building_name &&
    dashboardFilter.value.month === filter.month
  ) {
    return;
  }

  console.log("Selected Filter:", filter);

  dashboardFilter.value = { ...filter };

  loadDashboard();
}

onMounted(loadDashboard);
</script>