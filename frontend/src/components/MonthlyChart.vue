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



ChartJS.register(
  Title,
  Tooltip,
  Legend,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale
);



// รับ Filter จาก Dashboard.vue
const props = defineProps({

  filter:{
    type:Object,
    default:()=>({
      building_id:"",
      month:""
    })
  }

});



// State

const loading = ref(true);

const error = ref(null);



const chartData = ref({

  labels: [],

  datasets:[

    {

      label:"จำนวนหน้าพิมพ์",

      data:[],

      borderColor:"#2563EB",

      backgroundColor:"#2563EB",

      pointBackgroundColor:"#2563EB",

      pointRadius:3,

      pointHoverRadius:5,

      borderWidth:2,

      tension:0.25,

      spanGaps:true

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
              "จำนวนหน้า: " +
              Number(context.raw)
              .toLocaleString()
              +
              " หน้า"
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





async function loadMonthly(){


  loading.value = true;

  error.value = null;


  try{


    const res = await api.get(

      "/dashboard/monthly-kpi",

      {

        params: props.filter

      }

    );



    const monthly = {};



    res.data.forEach(item=>{


      const month = item.month;



      if(!monthly[month]){

        monthly[month] = 0;

      }



      monthly[month] += Number(
        item.net_pages || 0
      );


    });



    const monthsTH = [
      "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.",
      "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.",
      "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
    ];
    const formatMonthLabel = (value) => {
      const [y, m] = value.split("-");
      return `${monthsTH[Number(m) - 1]} ${Number(y) + 543}`;
    };

    chartData.value = {


      labels:Object.keys(monthly).map(formatMonthLabel),


      datasets:[

        {

          label:"จำนวนหน้าพิมพ์",

          data:Object.values(monthly),

          borderColor:"#2563EB",

          backgroundColor:"#2563EB",

          pointBackgroundColor:"#2563EB",

          pointRadius:3,

          pointHoverRadius:5,

          borderWidth:2,

          tension:0.25,

          spanGaps:true

        }

      ]

    };



  }catch(err){


    console.error(
      "Monthly Chart Error:",
      err
    );


    error.value =
      "โหลดข้อมูลรายเดือนไม่ได้";


  }finally{


    loading.value=false;


  }


}





onMounted(()=>{

  loadMonthly();

});




// เมื่อเปลี่ยน Filter ให้โหลดใหม่

watch(

  ()=>props.filter,

  ()=>{

    loadMonthly();

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