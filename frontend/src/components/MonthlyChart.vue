<script setup>

import { ref, onMounted } from "vue";
import {
  Bar
} from "vue-chartjs";

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

  responsive:true,

  plugins:{

    legend:{

      display:true

    }

  }

};





async function loadMonthly(){


try{


const res = await api.get(
  "/dashboard/monthly-kpi"
);


console.log(
  JSON.stringify(res.data[0], null, 2)
);



const grouped = {};

res.data.forEach(item => {
  if (!grouped[item.month]) {
    grouped[item.month] = 0;
  }

  grouped[item.month] += Number(item.net_pages);
});

chartData.value = {
  labels: Object.keys(grouped),
  datasets: [
    {
      label: "จำนวนหน้าพิมพ์",
      data: Object.values(grouped)
    }
  ]
};



}catch(err){

console.error(
 "Monthly Chart Error:",
 err
);

}


}





onMounted(()=>{

 loadMonthly();

});


</script>



<template>


<div>


<Bar

:options="chartOptions"

:data="chartData"

/>


</div>


</template>