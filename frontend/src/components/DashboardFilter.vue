<script setup>
import { ref, onMounted, watch } from "vue";
import api from "../services/api";

const emit = defineEmits(["filter"]);

const building_name = ref("");
const month = ref("");

const buildings = ref([]);
const months = ref([]);


// โหลดอาคาร
async function loadBuildings() {

  try {

    const res = await api.get("/buildings");

    buildings.value = res.data;

  } catch(err){

    console.error("Load buildings error", err);

  }

}



// แปลงเดือน
function formatMonth(value){

  if(!value || typeof value !== "string"){
    return "";
  }


  const monthsTH = [
    "มกราคม",
    "กุมภาพันธ์",
    "มีนาคม",
    "เมษายน",
    "พฤษภาคม",
    "มิถุนายน",
    "กรกฎาคม",
    "สิงหาคม",
    "กันยายน",
    "ตุลาคม",
    "พฤศจิกายน",
    "ธันวาคม"
  ];


  const [year,m] = value.split("-");


  return `${monthsTH[Number(m)-1]} ${Number(year)+543}`;

}



// โหลดเดือน
async function loadMonths(){

  try{

    const res = await api.get(
      "/dashboard/monthly-kpi"
    );


    const unique = [
      ...new Set(
        res.data.map(
          item => item.month
        )
      )
    ];


    months.value = unique.map(m => ({

      value:m,

      label:formatMonth(m)

    }));


  }catch(err){

    console.error(
      "Load months error",
      err
    );

  }

}



// ส่ง Filter
function sendFilter(){

  const filter = {

    building_name: building_name.value,

    month: month.value

  };


  console.log(
    "Filter Update:",
    filter
  );


  emit(
    "filter",
    filter
  );

}



// จับการเปลี่ยนค่า
watch(
  [
    building_name,
    month
  ],
  () => {

    sendFilter();

  }
);




// Reset
function resetFilter(){

  building_name.value = "";

  month.value = "";

}



onMounted(async()=>{

  await loadBuildings();

  await loadMonths();

});

</script>


<template>

<div class="bg-white shadow rounded-lg p-4 mb-6">

<h2 class="font-bold mb-3">
Filter Dashboard
</h2>


<div class="grid grid-cols-1 md:grid-cols-4 gap-4">


<!-- อาคาร -->

<select

v-model="building_name"

class="border rounded p-2"

>

<option value="">
ทุกอาคาร
</option>


<option

v-for="b in buildings"

:key="b.id"

:value="b.name"

>

{{ b.name }}

</option>


</select>




<!-- เดือน -->

<select

v-model="month"

class="border rounded p-2"

>


<option value="">
ทุกเดือน
</option>


<option

v-for="m in months"

:key="m.value"

:value="m.value"

>

{{ m.label }}

</option>


</select>




<button

@click="resetFilter"

class="bg-gray-500 hover:bg-gray-600 text-white rounded px-4 py-2"

>

ล้างตัวกรอง

</button>


</div>


</div>

</template>