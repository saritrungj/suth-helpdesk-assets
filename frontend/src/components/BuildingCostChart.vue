<template>
  <div class="bg-white shadow rounded-lg p-6 h-full">
    <h2 class="text-xl font-bold mb-4">ค่าใช้จ่ายสะสมรายอาคาร (บาท)</h2>

    <p v-if="rows.length === 0" class="text-gray-500">ยังไม่มีข้อมูล</p>

    <div v-else class="h-[300px]">
      <Bar :data="chartData" :options="chartOptions" />
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from "chart.js";

import { Bar } from "vue-chartjs";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const props = defineProps({
  // แถวจาก /dashboard/summary-by-building (เรียงค่าใช้จ่ายมาก→น้อยจาก API แล้ว)
  rows: {
    type: Array,
    default: () => [],
  },
});

const chartData = computed(() => ({
  labels: props.rows.map((r) => r.building_name || "ไม่ระบุอาคาร"),
  datasets: [
    {
      label: "ค่าใช้จ่ายสะสม (บาท)",
      data: props.rows.map((r) => Number(r.total_building_cost)),
      // ข้อมูลเชิงปริมาณชุดเดียว → สีเดียวทุกแท่ง
      backgroundColor: "rgba(59, 130, 246, 0.7)",
      borderRadius: 4,
    },
  ],
}));

const chartOptions = {
  indexAxis: "y",
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx) =>
          ` ${Number(ctx.parsed.x).toLocaleString("th-TH", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })} บาท`,
      },
    },
  },
  scales: {
    x: {
      beginAtZero: true,
      ticks: {
        callback: (value) => Number(value).toLocaleString("th-TH"),
      },
    },
  },
};
</script>
