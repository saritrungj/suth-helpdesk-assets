<script setup>

import { ref, computed, onMounted } from "vue";

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
import { useChartTheme } from "../composables/useChartTheme";

const { baseChartOptions } = useChartTheme();



ChartJS.register(
  Title,
  Tooltip,
  Legend,
  BarElement,
  CategoryScale,
  LinearScale
);



const loading = ref(true);

const error = ref(null);



const chartData = ref({

  labels: [],


  datasets: [

    {

      label: "ค่าใช้จ่าย (บาท)",


      data: [],


      backgroundColor: "#DC2626",


      borderWidth: 1

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
              "ค่าใช้จ่าย: " +
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

          callback(value){

            return Number(value)
            .toLocaleString();

          }

        }

      }

    }

  };
});







async function loadBuildingCost(){


  try {


    const res = await api.get(

      "/dashboard/summary-by-building"

    );



    console.log(

      "Building Cost:",

      res.data

    );




    chartData.value = {


      labels:

        res.data.map(

          item => item.building_name

        ),



      datasets:[


        {


          label:

            "ค่าใช้จ่าย (บาท)",



          data:

            res.data.map(

              item =>

                Number(

                  item.total_building_cost || 0

                )

            ),



          backgroundColor:

            "#DC2626",



          borderWidth:1


        }


      ]


    };



  }


  catch(err){


    console.error(

      "Building Cost Error:",

      err

    );


    error.value =

      "โหลดค่าใช้จ่ายรายอาคารไม่ได้";


  }


  finally{


    loading.value=false;


  }


}





onMounted(loadBuildingCost);


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




  <Bar

    v-else

    :data="chartData"

    :options="chartOptions"

  />


</div>


</template>