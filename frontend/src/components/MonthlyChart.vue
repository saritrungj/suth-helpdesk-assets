<template>
  <div class="bg-white shadow rounded-lg p-6">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-xl font-bold">
        {{ metric === "pages" ? "จำนวนหน้าที่พิมพ์รายเดือน" : "ค่าใช้จ่ายรายเดือน (บาท)" }}
      </h2>

      <!-- สลับหน่วย: แผ่น / บาท -->
      <div class="flex rounded border overflow-hidden text-sm">
        <button
          @click="metric = 'pages'"
          class="px-3 py-1.5"
          :class="metric === 'pages' ? 'bg-blue-600 text-white' : 'bg-white hover:bg-gray-50'"
        >
          แผ่น
        </button>
        <button
          @click="metric = 'cost'"
          class="px-3 py-1.5 border-l"
          :class="metric === 'cost' ? 'bg-blue-600 text-white' : 'bg-white hover:bg-gray-50'"
        >
          บาท
        </button>
      </div>
    </div>

    <div class="h-[400px]">
      <Bar :data="chartData" :options="chartOptions" />
    </div>

    <p v-if="monthA || monthB" class="text-sm text-gray-500 mt-3">
      <span v-if="monthA" class="inline-flex items-center mr-4">
        <span class="inline-block w-3 h-3 rounded-sm mr-1" style="background: rgba(245, 158, 11, 0.9)"></span>
        เดือนฐาน: {{ monthA }}
      </span>
      <span v-if="monthB" class="inline-flex items-center">
        <span class="inline-block w-3 h-3 rounded-sm mr-1" style="background: rgba(37, 99, 235, 0.9)"></span>
        เดือนเปรียบเทียบ: {{ monthB }}
      </span>
    </p>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

import { Bar } from "vue-chartjs";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

const props = defineProps({
  // แถวสรุปรายเดือนจาก /dashboard/monthly-summary (เรียงเดือนจากเก่าไปใหม่)
  summary: {
    type: Array,
    default: () => [],
  },
  // เดือนที่ถูกเลือกเปรียบเทียบ — จะถูกไฮไลต์สีต่างจากแท่งอื่น
  monthA: {
    type: String,
    default: "",
  },
  monthB: {
    type: String,
    default: "",
  },
});

// หน่วยที่แสดง: "pages" (แผ่น) หรือ "cost" (บาท)
const metric = ref("pages");

const COLOR_DEFAULT = "rgba(59, 130, 246, 0.35)";
const COLOR_A = "rgba(245, 158, 11, 0.9)";
const COLOR_B = "rgba(37, 99, 235, 0.9)";

const chartData = computed(() => {
  const rows = [...props.summary].sort((a, b) =>
    a.month.localeCompare(b.month)
  );

  return {
    labels: rows.map((r) => r.month),
    datasets: [
      {
        label: metric.value === "pages" ? "Pages Printed" : "Total Cost (THB)",
        data: rows.map((r) => (metric.value === "pages" ? r.pages : r.total_cost)),
        backgroundColor: rows.map((r) => {
          if (r.month === props.monthA) return COLOR_A;
          if (r.month === props.monthB) return COLOR_B;
          return COLOR_DEFAULT;
        }),
        borderRadius: 4,
      },
    ],
  };
});

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx) => {
          const v = Number(ctx.parsed.y);
          return metric.value === "pages"
            ? ` ${v.toLocaleString("th-TH")} แผ่น`
            : ` ${v.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`;
        },
      },
    },
  },
  scales: {
    y: {
      beginAtZero: true,
      ticks: {
        callback: (value) => Number(value).toLocaleString("th-TH"),
      },
    },
  },
}));
</script>
