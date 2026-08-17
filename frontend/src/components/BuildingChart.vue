<script setup>
import { ref, computed, onMounted, watch } from "vue";
import { Line } from "vue-chartjs";

import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
} from "chart.js";

import api from "../services/api";
import { useChartTheme } from "../composables/useChartTheme";

const { baseChartOptions } = useChartTheme();


// รับ Filter จาก Dashboard
const props = defineProps({
  filter:{
    type:Object,
    default:()=>({
      building_name:"",
      month:""
    })
  }
});

ChartJS.register(
  Title,
  Tooltip,
  Legend,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale
);

// State
const loading = ref(true);
const error = ref(null);

const chartData = ref({
  labels: [],
  datasets: [
    {
      label: "จำนวนหน้าพิมพ์",
      data: [],
      borderColor: "#059669",
      backgroundColor: "#059669",
      pointBackgroundColor: "#059669",
      pointRadius: 3,
      pointHoverRadius: 5,
      borderWidth: 2,
      tension: 0.25,
      spanGaps: true,
    },
  ],
});

const chartOptions = computed(() => {
  const theme = baseChartOptions.value;

  return {
    responsive: true,
    maintainAspectRatio: false,

    plugins: {
      legend: {
        display: true,
        labels: theme.plugins.legend.labels,
      },

      tooltip: {
        ...theme.plugins.tooltip,
        callbacks: {
          label(context) {
            return (
              context.dataset.label +
              ": " +
              context.raw.toLocaleString() +
              " หน้า"
            );
          },
        },
      },
    },

    scales: {
      x: theme.scales.x,
      y: {
        ...theme.scales.y,
        beginAtZero: true,

        ticks: {
          ...theme.scales.y.ticks,
          callback(value) {
            return value.toLocaleString();
          },
        },
      },
    },
  };
});

// Load Data
async function loadBuilding() {

  loading.value = true;
  error.value = null;


  try {

    const res = await api.get(
  "/dashboard/summary-by-building",
  {
    params:{
      building_name:
        props.filter.building_name || undefined,

      month:
        props.filter.month || undefined
    }
  }
);


    console.log(
      "Building Summary:",
      res.data
    );


    chartData.value = {

      labels:
        res.data.map(
          item => item.building_name
        ),


      datasets:[

        {

          label:"จำนวนหน้าพิมพ์",


          data:
            res.data.map(
              item =>
                Number(
                  item.total_net_pages || 0
                )
            ),


          borderColor:"#059669",

          backgroundColor:"#059669",

          pointBackgroundColor:"#059669",

          pointRadius:3,

          pointHoverRadius:5,

          borderWidth:2,

          tension:0.25,

          spanGaps:true

        }

      ]

    };


  } catch(err) {


    console.error(
      "Building Chart Error:",
      err
    );


    error.value =
      "ไม่สามารถโหลดข้อมูลอาคารได้";


  } finally {


    loading.value=false;


  }

}
onMounted(loadBuilding);


watch(

  () => props.filter,

  () => {

    loadBuilding();

  },

  {
    deep:true
  }

);
</script>

<template>
  <div class="h-80">

    <div
      v-if="loading"
      class="flex justify-center items-center h-full text-gray-500"
    >
      กำลังโหลดกราฟ...
    </div>

    <div
      v-else-if="error"
      class="flex justify-center items-center h-full text-red-600"
    >
      {{ error }}
    </div>

    <Line
      v-else
      :data="chartData"
      :options="chartOptions"
    />

  </div>
</template>