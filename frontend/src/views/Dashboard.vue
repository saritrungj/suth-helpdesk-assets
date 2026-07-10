<template>
  <div>
    <h1 class="text-3xl font-bold mb-6">
      Dashboard
    </h1>

    <!-- KPI Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

      <div class="bg-white shadow rounded-lg p-6">
        <h2 class="text-gray-500 text-sm">
          อุปกรณ์ทั้งหมด
        </h2>

        <p class="text-3xl font-bold text-blue-600">
          {{ stats.total_devices }}
        </p>
      </div>

      <div class="bg-white shadow rounded-lg p-6">
        <h2 class="text-gray-500 text-sm">
          สัญญาทั้งหมด
        </h2>

        <p class="text-3xl font-bold text-green-600">
          {{ stats.total_contracts }}
        </p>
      </div>

      <div class="bg-white shadow rounded-lg p-6">
        <h2 class="text-gray-500 text-sm">
          รายการพิมพ์
        </h2>

        <p class="text-3xl font-bold text-purple-600">
          {{ stats.total_transactions }}
        </p>
      </div>

      <div class="bg-white shadow rounded-lg p-6">
        <h2 class="text-gray-500 text-sm">
          จำนวนหน้าที่พิมพ์
        </h2>

        <p class="text-3xl font-bold text-red-600">
          {{ stats.total_pages.toLocaleString() }}
        </p>
      </div>

    </div>

    <!-- Monthly Chart -->
    <div class="mt-8 bg-white shadow rounded-lg p-6">

      <h2 class="text-xl font-bold mb-4">
        Print Usage รายเดือน
      </h2>

      <MonthlyChart />

    </div>

    <!-- Building Chart -->
    <div class="mt-8 bg-white shadow rounded-lg p-6">

      <h2 class="text-xl font-bold mb-4">
        จำนวนหน้าพิมพ์แยกอาคาร
      </h2>

      <BuildingChart />

    </div>
    <!-- Cost Chart -->
<div class="mt-8 bg-white shadow rounded-lg p-6">

  <h2 class="text-xl font-bold mb-4">
    ค่าใช้จ่ายรายเดือน
  </h2>

  <CostChart />

</div>

  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import api from "../services/api";

import MonthlyChart from "../components/MonthlyChart.vue";
import BuildingChart from "../components/BuildingChart.vue";
import CostChart from "../components/CostChart.vue";

const stats = ref({
  total_devices: 0,
  total_contracts: 0,
  total_transactions: 0,
  total_pages: 0,
});

const loadDashboard = async () => {
  try {

    const res = await api.get("/dashboard/stats");

    console.log("Dashboard Stats:", res.data);

    stats.value = {
      ...res.data,
      total_pages: Number(res.data.total_pages),
    };

  } catch (err) {

    console.error("Dashboard error:", err);

  }
};

onMounted(() => {
  loadDashboard();
});
</script>