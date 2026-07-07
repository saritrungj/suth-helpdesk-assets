<script setup>
import { ref, onMounted } from "vue"
import api from "../../services/api"

const devices = ref([])


// โหลดข้อมูล Device
async function loadDevices() {

  try {

    const res = await api.get("/devices")

    devices.value = res.data

  } catch (err) {

    console.error("Load devices error:", err)

  }

}


// Upload CSV
async function uploadCSV(event) {

  const file = event.target.files[0]

  if (!file) return


  const formData = new FormData()

  formData.append("file", file)


  try {

    const res = await api.post(
      "/devices/import",
      formData,
      {
        headers:{
          "Content-Type":"multipart/form-data"
        }
      }
    )


    alert(res.data.message)


    // โหลดข้อมูลใหม่หลัง import
    loadDevices()


  } catch (err) {

    console.error("Upload error:", err)

    alert("Upload failed")

  }

}



onMounted(() => {

  loadDevices()

})

</script>



<template>

<div class="p-6">


<h1 class="text-2xl font-bold mb-5">
  Device Management
</h1>



<!-- Upload -->

<div class="mb-5">

<label class="block mb-2 font-semibold">
  Import CSV
</label>


<input
  type="file"
  accept=".csv"
  @change="uploadCSV"
/>


</div>





<!-- Device Table -->

<table class="border-collapse border w-full">


<thead>

<tr>

<th class="border p-2">
Serial Number
</th>


<th class="border p-2">
Model
</th>


<th class="border p-2">
Brand
</th>


<th class="border p-2">
Building
</th>


<th class="border p-2">
Department
</th>


</tr>

</thead>



<tbody>


<tr
v-for="device in devices"
:key="device.id"
>


<td class="border p-2">
{{ device.serial_number }}
</td>


<td class="border p-2">
{{ device.model }}
</td>


<td class="border p-2">
{{ device.brand_name || "-" }}
</td>


<td class="border p-2">
{{ device.building_name || "-" }}
</td>


<td class="border p-2">
{{ device.department_name || "-" }}
</td>



</tr>


</tbody>


</table>



<p
v-if="devices.length === 0"
class="mt-4"
>
No devices found
</p>


</div>

</template>