<template>
  <div class="bg-white shadow rounded-lg p-6 mt-8">
    <h2 class="text-xl font-bold mb-4">
      จำนวนหน้าที่พิมพ์รายเดือน
    </h2>

    <Bar :data="chartData" :options="chartOptions" />
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import axios from "axios";

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

const chartData = ref({
  labels: [],
  datasets: [
    {
      label: "Pages Printed",
      data: [],
    },
  ],
});

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
};

const loadChart = async () => {
  const res = await axios.get(
    "http://localhost:3000/api/dashboard/monthly-kpi"
  );

  const summary = {};

  res.data.forEach((row) => {
    if (!summary[row.month]) {
      summary[row.month] = 0;
    }

    summary[row.month] += row.pages_printed;
  });

  chartData.value = {
    labels: Object.keys(summary),
    datasets: [
      {
        label: "Pages Printed",
        data: Object.values(summary),
      },
    ],
  };
};

onMounted(loadChart);
</script>

<style scoped>
div {
  height: 400px;
}
</style>