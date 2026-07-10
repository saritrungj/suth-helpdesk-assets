<script setup>

import { ref, onMounted, computed, watch } from "vue";
import { useRouter } from "vue-router";
import axios from "axios";


const router = useRouter();


const assets = ref([]);

const search = ref("");
const selectedBrand = ref("");
const selectedBuilding = ref("");
const selectedDepartment = ref("");
const brands = ref([]);
const buildings = ref([]);
const departments = ref([]);

// Pagination
const currentPage = ref(1);
const perPage = ref(10);

const token = localStorage.getItem("token");


const config = {
  headers:{
    Authorization:`Bearer ${token}`
  }
};



// ==========================
// Load Assets
// ==========================
async function loadAssets(){

  try{

    const res = await axios.get(
      "http://localhost:3000/api/devices",
      config
    );


    assets.value = res.data;
    console.log(
  "FIRST ASSET JSON:",
  JSON.stringify(
    assets.value[0],
    null,
    2
  )
);


    console.log(
      "Assets:",
      assets.value
    );


  }catch(err){

    console.error(err);

    alert(
      "โหลดข้อมูล Asset ไม่สำเร็จ"
    );

  }

}
async function loadFilterData(){

  try{


    const [
      brandRes,
      buildingRes,
      departmentRes

    ] = await Promise.all([


      axios.get(
        "http://localhost:3000/api/brands",
        config
      ),


      axios.get(
        "http://localhost:3000/api/buildings",
        config
      ),


      axios.get(
        "http://localhost:3000/api/departments",
        config
      )


    ]);



    brands.value = brandRes.data;

    buildings.value = buildingRes.data;

    departments.value = departmentRes.data;

    console.log(
  "BRANDS JSON:",
  JSON.stringify(
    brands.value[0],
    null,
    2
  )
);
    console.log("Buildings:", buildings.value);
    console.log("Departments:", departments.value);

  }catch(err){

    console.error(
      "Load filter error:",
      err
    );

  }

}


// ==========================
// Search
// ==========================
const filteredAssets = computed(()=>{

  const keyword =
    search.value.toLowerCase();


  return assets.value.filter(a=>{


    const matchSearch =

      !keyword ||

      a.serial_number
        ?.toLowerCase()
        .includes(keyword)

      ||

      a.model
        ?.toLowerCase()
        .includes(keyword)

      ||

      a.brand_name
        ?.toLowerCase()
        .includes(keyword);



    const matchBrand =

      !selectedBrand.value ||

      a.brand_name ===
      brands.value.find(
        b => b.id == selectedBrand.value
      )?.name;




    const matchBuilding =

      !selectedBuilding.value ||

      a.building_name ===
      buildings.value.find(
        b => b.id == selectedBuilding.value
      )?.name;




    const matchDepartment =

      !selectedDepartment.value ||

      a.department_name ===
      departments.value.find(
        d => d.id == selectedDepartment.value
      )?.name;



    return (

      matchSearch &&

      matchBrand &&

      matchBuilding &&

      matchDepartment

    );


  });


});

const totalPages = computed(()=>{

  return Math.ceil(
    filteredAssets.value.length / perPage.value
  );

});


const paginatedAssets = computed(()=>{


  const start =
    (currentPage.value - 1) * perPage.value;


  return filteredAssets.value.slice(
    start,
    start + perPage.value
  );


});



// ==========================
// Edit
// ==========================
function editAsset(id){

  router.push(
    `/edit-asset/${id}`
  );

}



// ==========================
// Delete
// ==========================
async function deleteAsset(id){


  if(!confirm(
    "ต้องการลบรายการนี้หรือไม่?"
  )){

    return;

  }



  try{


    await axios.delete(

      `http://localhost:3000/api/devices/${id}`,

      config

    );


    alert(
      "ลบข้อมูลสำเร็จ"
    );


    loadAssets();



  }catch(err){


    console.error(err);


    alert(
      err.response?.data?.error ||
      "ลบข้อมูลไม่สำเร็จ"
    );


  }


}




onMounted(async()=>{

  await loadAssets();

  await loadFilterData();

});


</script>



<template>


<div class="p-6">


<p class="mb-3">

จำนวนอุปกรณ์ทั้งหมด:

<strong>
{{ filteredAssets.length }}
</strong>

รายการ

</p>



<div class="flex gap-3 mb-4">


<input

v-model="search"

placeholder="ค้นหา Serial / Model / Brand"

class="border p-2 rounded w-80"

/>



<select

v-model="perPage"

class="border p-2 rounded"

>

<option :value="10">
10 รายการ
</option>


<option :value="20">
20 รายการ
</option>


<option :value="50">
50 รายการ
</option>


<option :value="100">
100 รายการ
</option>


</select>



<select

v-model="selectedBrand"

class="border p-2 rounded"

>

<option value="">
ทุก Brand
</option>


<option

v-for="b in brands"

:key="b.id"

:value="b.id"

>

{{ b.name }}

</option>


</select>





<select

v-model="selectedBuilding"

class="border p-2 rounded"

>

<option value="">
ทุกอาคาร
</option>


<option

v-for="b in buildings"

:key="b.id"

:value="b.id"

>

{{ b.name }}

</option>


</select>





<select

v-model="selectedDepartment"

class="border p-2 rounded"

>

<option value="">
ทุกแผนก
</option>


<option

v-for="d in departments"

:key="d.id"

:value="d.id"

>

{{ d.name }}

</option>


</select>





<button

@click="router.push('/add-asset')"

class="bg-blue-600 text-white px-4 py-2 rounded"

>

+ เพิ่มอุปกรณ์

</button>


</div>





<table class="w-full border">


<thead>


<tr class="bg-gray-100">


<th class="border p-2">
Serial
</th>


<th class="border p-2">
Brand
</th>


<th class="border p-2">
Model
</th>


<th class="border p-2">
Building
</th>


<th class="border p-2">
Department
</th>


<th class="border p-2">
จัดการ
</th>


</tr>


</thead>




<tbody>


<tr

v-for="a in paginatedAssets"

:key="a.id"

>


<td class="border p-2">

{{a.serial_number}}

</td>



<td class="border p-2">

{{a.brand_name}}

</td>



<td class="border p-2">

{{a.model}}

</td>



<td class="border p-2">

{{a.building_name}}

</td>



<td class="border p-2">

{{a.department_name}}

</td>




<td class="border p-2">


<button

@click="editAsset(a.id)"

class="bg-yellow-500 text-white px-3 py-1 rounded mr-2"

>

แก้ไข

</button>




<button

@click="deleteAsset(a.id)"

class="bg-red-600 text-white px-3 py-1 rounded"

>

ลบ

</button>



</td>


</tr>


</tbody>


</table>


</div>


</template>