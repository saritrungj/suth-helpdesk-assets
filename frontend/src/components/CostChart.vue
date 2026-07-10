<script setup>
import { ref, onMounted } from "vue";
import { Bar } from "vue-chartjs";
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  BarElement,
  CategoryScale,
  LinearScale,
} from "chart.js";
import api from "../services/api";

ChartJS.register(
  Title,
  Tooltip,
  Legend,
  BarElement,
  CategoryScale,
  LinearScale
);

const chartData = ref({
  labels: [],
  datasets: [
    {
      label: "ค่าใช้จ่าย (บาท)",
      data: [],
    },
  ],
});

const chartOptions = {
  responsive: true,
  plugins: {
    legend: {
      display: true,
    },
  },
};

async function loadCostChart() {
  try {
    const res = await api.get("/dashboard/compare");

    const grouped = {};

    res.data.forEach((item) => {
      if (!grouped[item.month]) {
        grouped[item.month] = 0;
      }

      grouped[item.month] += Number(item.total_cost);
    });

    chartData.value = {
      labels: Object.keys(grouped),

      datasets: [
        {
          label: "ค่าใช้จ่าย (บาท)",
          data: Object.values(grouped),
        },
      ],
    };
  } catch (err) {
    console.error("Cost Chart Error:", err);
  }
}

onMounted(loadCostChart);
</script>

<template>
  <Bar
    :data="chartData"
    :options="chartOptions"
  />
</template>