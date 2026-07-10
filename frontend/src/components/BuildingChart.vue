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
  LinearScale
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
      label: "จำนวนหน้าพิมพ์",
      data: []
    }
  ]
});

const chartOptions = {
  responsive: true,
  plugins: {
    legend: {
      display: true
    }
  }
};

async function loadBuildingChart() {
  try {
    const res = await api.get("/dashboard/summary-by-building");

    chartData.value = {
      labels: res.data.map(r => r.building_name),

      datasets: [
        {
          label: "Net Pages",
          data: res.data.map(r => Number(r.total_net_pages))
        }
      ]
    };

  } catch (err) {
    console.error(err);
  }
}

onMounted(loadBuildingChart);
</script>

<template>

<Bar
:data="chartData"
:options="chartOptions"
/>

</template>