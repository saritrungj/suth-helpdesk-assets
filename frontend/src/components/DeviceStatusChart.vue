<template>
  <div class="bg-white shadow rounded-lg p-6 h-full">
    <h2 class="text-xl font-bold mb-4">สถานะเครื่อง</h2>

    <p v-if="devices.length === 0" class="text-gray-500">ยังไม่มีข้อมูล</p>

    <div v-else class="h-[300px]">
      <Doughnut :data="chartData" :options="chartOptions" />
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";

import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import { Doughnut } from "vue-chartjs";

ChartJS.register(ArcElement, Tooltip, Legend);

const props = defineProps({
  // รายการเครื่องจาก /devices (ใช้ field status)
  devices: {
    type: Array,
    default: () => [],
  },
});

// สีสถานะ: ใช้งาน=teal ซ่อม=amber (คู่นี้ผ่าน CVD validator)
// ปลดระวาง=เทากลางโดยเจตนา (inactive) — ระบุตัวด้วยข้อความ+จำนวนใน legend เสมอ
const STATUS = [
  { key: "active", label: "ใช้งาน", color: "#0d9488" },
  { key: "repair", label: "ซ่อม", color: "#d97706" },
  { key: "retired", label: "ปลดระวาง", color: "#64748b" },
];

const counts = computed(() => {
  const c = { active: 0, repair: 0, retired: 0 };
  props.devices.forEach((d) => {
    if (c[d.status] !== undefined) c[d.status]++;
  });
  return c;
});

const chartData = computed(() => ({
  // legend มีข้อความ + จำนวนกำกับทุกชิ้น ไม่พึ่งสีอย่างเดียว
  labels: STATUS.map((s) => `${s.label} (${counts.value[s.key]})`),
  datasets: [
    {
      data: STATUS.map((s) => counts.value[s.key]),
      backgroundColor: STATUS.map((s) => s.color),
      // ช่องว่างขาวคั่นระหว่างชิ้น
      borderColor: "#ffffff",
      borderWidth: 2,
    },
  ],
}));

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: "60%",
  plugins: {
    legend: {
      position: "bottom",
    },
    tooltip: {
      callbacks: {
        label: (ctx) => ` ${ctx.parsed} เครื่อง`,
      },
    },
  },
};
</script>
