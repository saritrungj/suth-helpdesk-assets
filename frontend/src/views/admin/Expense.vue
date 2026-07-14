<script setup>
import { ref, onMounted, computed } from "vue";
import api from "../services/api";


console.log("Expense component loaded");


const loading = ref(false);

const month = ref("2025-03");

const expenses = ref([]);



const months = [
  {
    value: "2025-01",
    label: "มกราคม 2568"
  },
  {
    value: "2025-02",
    label: "กุมภาพันธ์ 2568"
  },
  {
    value: "2025-03",
    label: "มีนาคม 2568"
  }
];



async function loadExpense(){

  try {

    loading.value = true;


    const res = await api.get(
      "/dashboard/expense",
      {
        params:{
          month: month.value
        }
      }
    );


    console.log(
      "Expense response:",
      res.data
    );


    expenses.value = res.data;


  }
  catch(error){

    console.error(
      "Expense Error:",
      error.response?.data || error
    );

  }
  finally{

    loading.value = false;

  }

}



function changeMonth(){

  loadExpense();

}



onMounted(loadExpense);



const totalPages = computed(()=>{

  return expenses.value.reduce(
    (sum,item)=>
      sum + Number(item.total_pages || 0),
    0
  );

});



const totalCost = computed(()=>{

  return expenses.value.reduce(
    (sum,item)=>
      sum + Number(item.total_cost || 0),
    0
  );

});

</script>



<template>

<div style="background:red; color:white; padding:50px; font-size:40px">

TEST EXPENSE RENDER

</div>

</template>