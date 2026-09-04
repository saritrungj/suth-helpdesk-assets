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
import { formatMonthTH } from "@suth/domain";

const { baseChartOptions } = useChartTheme();



ChartJS.register(

  Title,
  Tooltip,
  Legend,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale

);



// รับ Filter จาก Dashboard

const props = defineProps({

  filter: {

    type: Object,

    default: () => ({

      building_name: "",
      month: ""

    })

  }

});



const loading = ref(true);

const error = ref(null);



const chartData = ref({

  labels: [],

  datasets: [

    {

      label: "ค่าใช้จ่ายสุทธิ (หัก 20%)",

      data: [],

      borderColor: "#DC2626",

      backgroundColor: "#DC2626",

      pointBackgroundColor: "#DC2626",

      pointRadius: 3,

      pointHoverRadius: 5,

      borderWidth: 2,

      tension: 0.25,

      spanGaps: true

    }

  ]

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
              "ค่าใช้จ่ายสุทธิ (หัก 20%): " +
              Number(context.raw)
                .toLocaleString(
                  undefined,
                  {
                    minimumFractionDigits: 2
                  }
                )
              +
              " บาท"
            );
          }
        }
      }
    },

    scales: {
      x: theme.scales.x,
      y: {
        ...theme.scales.y,
        beginAtZero: true,
        ticks: {
          ...theme.scales.y.ticks,
          callback(value) {
            return Number(value)
              .toLocaleString();
          }
        }
      }
    }
  };
});







async function loadCost(){


  loading.value = true;


  try {



    const res = await api.get(

      "/dashboard/compare",

      {

        params: {


          month:

            props.filter.month || undefined,



          building_name:

            props.filter.building_name || undefined


        }

      }

    );



    const monthly = {};



    res.data.forEach(item => {



      const month = item.month;



      if(!monthly[month]){


        monthly[month] = 0;


      }



      monthly[month] +=

        Number(

          item.total_cost || 0

        );



    });





    const formatMonthLabel = (value) => formatMonthTH(value);

    chartData.value = {



      labels:
        Object.keys(monthly).map(formatMonthLabel),



      datasets: [


        {


          label:

            "ค่าใช้จ่ายสุทธิ (หัก 20%)",



          data:

            Object.values(monthly),



          borderColor:

            "#DC2626",

          backgroundColor:

            "#DC2626",

          pointBackgroundColor:

            "#DC2626",

          pointRadius:3,

          pointHoverRadius:5,

          borderWidth:2,

          tension:0.25,

          spanGaps:true

        }


      ]



    };




  }


  catch(err){



    console.error(

      "Cost Chart Error:",

      err

    );



    error.value =

      "โหลดข้อมูลค่าใช้จ่ายรายเดือนไม่ได้";


  }


  finally{


    loading.value = false;


  }


}





// โหลดครั้งแรก

onMounted(loadCost);



// โหลดใหม่เมื่อ Filter เปลี่ยน

watch(

  () => props.filter,

  () => {

    loadCost();

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

    class="flex justify-center items-center h-full"

  >

    กำลังโหลดกราฟ...

  </div>





  <div

    v-else-if="error"

    class="text-red-600"

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