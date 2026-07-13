<script setup>

import { ref, onMounted } from "vue";
import api from "../services/api";


const month = ref("2025-03");

const devices = ref([]);

const transactions = ref([]);


const loading = ref(false);


// โหลดเครื่อง
async function loadDevices(){

  try{

    const res =
      await api.get("/devices");


    devices.value =
      res.data.map(device=>({

        ...device,

        pages:0

      }));


  }catch(err){

    console.error(
      "Load devices error",
      err
    );

  }

}



// โหลด transaction เดิม
async function loadTransactions(){

  try{

    const res =
      await api.get(
        "/print-transactions"
      );


    transactions.value =
      res.data;


    mergeData();


  }catch(err){

    console.error(err);

  }

}



// เอาข้อมูลเดิมมาใส่ form
function mergeData(){

  devices.value =
    devices.value.map(device=>{


      const old =
        transactions.value.find(
          t =>
          t.device_id === device.id &&
          t.month === month.value
        );


      return {

        ...device,

        pages:
          old
          ? old.pages
          : 0

      };


    });


}



// เปลี่ยนเดือน
function changeMonth(){

  mergeData();

}



// save
async function save(){

  try{

    loading.value=true;


    for(const d of devices.value){


      await api.post(
        "/print-transactions",
        {

          device_id:d.id,

          month:month.value,

          pages:Number(d.pages || 0)

        }
      );


    }


    alert(
      "บันทึกสำเร็จ"
    );


    loadTransactions();


  }
  catch(err){

    console.error(err);

    alert(
      "บันทึกไม่สำเร็จ"
    );

  }
  finally{

    loading.value=false;

  }

}



onMounted(async()=>{

 await loadDevices();

 await loadTransactions();

});


</script>



<template>

<div>

<h1 class="text-3xl font-bold mb-6">
บันทึกยอดพิมพ์รายเดือน
</h1>



<div class="bg-white shadow rounded-lg p-6">


<div class="mb-4">


<label>
เดือน
</label>


<select

v-model="month"

@change="changeMonth"

class="border rounded p-2 ml-3"

>

<option value="2025-01">
มกราคม 2568
</option>

<option value="2025-02">
กุมภาพันธ์ 2568
</option>

<option value="2025-03">
มีนาคม 2568
</option>


</select>


</div>





<table class="w-full border">


<thead>

<tr class="bg-gray-100">

<th class="border p-2">
SN
</th>

<th class="border p-2">
Model
</th>

<th class="border p-2">
จำนวนหน้า
</th>


</tr>

</thead>



<tbody>


<tr
v-for="d in devices"
:key="d.id"
>


<td class="border p-2">
{{d.serial_number}}
</td>


<td class="border p-2">
{{d.model}}
</td>


<td class="border p-2">

<input

type="number"

v-model="d.pages"

class="border rounded p-1 w-full"

/>

</td>


</tr>


</tbody>


</table>




<button

@click="save"

class="mt-5 bg-blue-600 text-white px-5 py-2 rounded"

>

บันทึก

</button>



</div>


</div>


</template>