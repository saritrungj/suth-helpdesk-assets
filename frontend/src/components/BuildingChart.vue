<script setup>
import { ref, onMounted, watch } from "vue";
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
  BarElement,
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
      backgroundColor: "#10B981",
      borderColor: "#059669",
      borderWidth: 1,
    },
  ],
});

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,

  plugins: {
    legend: {
      display: true,
    },

    tooltip: {
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
    y: {
      beginAtZero: true,

      ticks: {
        callback(value) {
          return value.toLocaleString();
        },
      },
    },
  },
};

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


          backgroundColor:"#10B981",

          borderColor:"#059669",

          borderWidth:1

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

    <Bar
      v-else
      :data="chartData"
      :options="chartOptions"
    />

  </div>
</template>