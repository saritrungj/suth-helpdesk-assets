<template>

<div class="p-6">

  <h1 class="text-2xl font-bold mb-6">
    {{ isEdit ? "แก้ไขทรัพย์สิน" : "เพิ่มทรัพย์สิน" }}
  </h1>


  <div class="grid grid-cols-2 gap-4">


    <!-- Serial -->
    <div>
      <label>
        Serial Number
      </label>

      <input
        v-model="form.serial_number"
        class="border p-2 w-full"
      />
    </div>



    <!-- Brand -->
    <div>

      <label>
        Brand
      </label>

      <select
        v-model="form.brand_id"
        class="border p-2 w-full"
      >

        <option
          disabled
          value=""
        >
          Select Brand
        </option>


        <option
          v-for="b in brands"
          :key="b.id"
          :value="b.id"
        >

          {{ b.name }}

        </option>

      </select>

    </div>




    <!-- Model -->
    <div>

      <label>
        Model
      </label>


      <input
        v-model="form.model"
        class="border p-2 w-full"
      />

    </div>





    <!-- Building -->
    <div>

      <label>
        Building
      </label>


      <select
        v-model="form.building_id"
        @change="onBuildingChange"
        class="border p-2 w-full"
      >

        <option
          v-for="b in buildings"
          :key="b.id"
          :value="b.id"
        >

          {{ b.name }}

        </option>


      </select>

    </div>





    <!-- Floor -->
    <div>

      <label>
        Floor
      </label>


      <select
        v-model="form.floor_id"
        :disabled="!form.building_id"
        class="border p-2 w-full"
      >

        <option
          v-if="!form.building_id"
          disabled
          value=""
        >
          เลือกอาคารก่อน
        </option>

        <option
          v-for="f in filteredFloors"
          :key="f.id"
          :value="f.id"
        >

          {{ f.name }}

        </option>


      </select>

    </div>





    <!-- Division -->
    <div>

      <label>
        Division
      </label>


      <select
        v-model="form.division_id"
        class="border p-2 w-full"
      >

        <option
          v-for="d in divisions"
          :key="d.id"
          :value="d.id"
        >

          {{ d.name }}

        </option>


      </select>


    </div>





    <!-- Department -->
    <div>

      <label>
        Department
      </label>


      <select
        v-model="form.department_id"
        class="border p-2 w-full"
      >

        <option
          v-for="d in departments"
          :key="d.id"
          :value="d.id"
        >

          {{ d.name }}

        </option>


      </select>


    </div>





    <!-- Contract -->
    <div>

      <label>
        Contract
      </label>


      <select
        v-model="form.contract_id"
        class="border p-2 w-full"
      >

        <option
          :value="null"
        >
          ไม่มี
        </option>


        <option
          v-for="c in contracts"
          :key="c.id"
          :value="c.id"
        >

          {{ c.contract_no }}

        </option>


      </select>


    </div>





    <!-- Price -->
    <div>

      <label>
        Override Price
      </label>


      <input
        type="number"
        v-model="form.price_override"
        class="border p-2 w-full"
      />


    </div>


  </div>





  <div class="mt-6 flex gap-3">


    <button
      @click="saveAsset"
      class="bg-blue-600 text-white px-4 py-2 rounded"
    >

      Save

    </button>



    <button
      @click="cancel"
      class="border px-4 py-2 rounded"
    >

      Cancel

    </button>


  </div>


</div>


</template>
<script setup>
import { ref, onMounted, computed } from "vue";
import { useRouter, useRoute } from "vue-router";
import axios from "axios";

const router = useRouter();
const route = useRoute();

const token = localStorage.getItem("token");

if (!token) {
  router.push("/login");
}

const isEdit = ref(false);


const form = ref({
  serial_number: "",
  brand_id: null,
  model: "",
  building_id: null,
  floor_id: null,
  division_id: null,
  department_id: null,
  contract_id: null,
  price_override: null,
});


const brands = ref([]);
const buildings = ref([]);
const floors = ref([]);
const divisions = ref([]);
const departments = ref([]);
const contracts = ref([]);


// floors ที่ backend คืนมามีของทุกอาคารรวมกัน (ผูกด้วย building_id)
// ต้องกรองตาม building ที่เลือกไว้ ไม่งั้นชื่อชั้นที่ซ้ำกันในแต่ละตึก
// (เช่น "ชั้น 1" ของทุกตึก) จะโชว์ปนกันเป็นรายการซ้ำๆ ใน dropdown เดียว
const filteredFloors = computed(() => {
  if (!form.value.building_id) return [];

  return floors.value.filter(
    (f) => Number(f.building_id) === Number(form.value.building_id)
  );
});

// เมื่อผู้ใช้เปลี่ยนอาคารเอง ให้ล้างชั้นเดิมทิ้ง เพราะชั้นเดิมอาจไม่ได้
// อยู่ในอาคารใหม่ (ใช้ @change แทน watch เพื่อไม่ให้ทำงานตอน loadAsset
// เซ็ตค่า building_id/floor_id พร้อมกันตอนโหลดข้อมูลมาแก้ไข)
function onBuildingChange() {
  form.value.floor_id = null;
}

const config = {
  headers: {
    Authorization: `Bearer ${token}`,
  },
};



// ==========================
// Load Master Data
// ==========================
async function loadMasterData() {

  try {

    const [
      brandRes,
      buildingRes,
      floorRes,
      divisionRes,
      departmentRes,
      contractRes

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
        "http://localhost:3000/api/floors",
        config
      ),

      axios.get(
        "http://localhost:3000/api/divisions",
        config
      ),

      axios.get(
        "http://localhost:3000/api/departments",
        config
      ),

      axios.get(
        "http://localhost:3000/api/contracts",
        config
      )

    ]);


    brands.value = brandRes.data;
    buildings.value = buildingRes.data;
    floors.value = floorRes.data;
    divisions.value = divisionRes.data;
    departments.value = departmentRes.data;
    contracts.value = contractRes.data;


  } catch(err){

    console.error(
      "Load master error:",
      err
    );

    alert("โหลด Master Data ไม่สำเร็จ");

  }

}




// ==========================
// Load Asset for Edit
// ==========================
async function loadAsset(){

  if(!route.params.id){
    return;
  }


  try{

    isEdit.value = true;


    const res = await axios.get(
      `http://localhost:3000/api/devices/${route.params.id}`,
      config
    );


    console.log(
      "API DEVICE:",
      res.data
    );


    const d = res.data.data ?? res.data;


    form.value = {

      serial_number: d.serial_number ?? "",

      brand_id: d.brand_id ?? null,

      model: d.model ?? "",

      building_id: d.building_id ?? null,

      floor_id: d.floor_id ?? null,

      division_id: d.division_id ?? null,

      department_id: d.department_id ?? null,

      contract_id: d.contract_id ?? null,

      price_override: d.price_override ?? null

    };


    console.log(
      "Edit data:",
      form.value
    );


  }catch(err){

    console.error(
      "Load asset error:",
      err
    );

    alert("โหลดข้อมูลทรัพย์สินไม่สำเร็จ");

  }

}





// ==========================
// Save Create / Update
// ==========================
async function saveAsset(){

try{


const data = {

  serial_number:
    form.value.serial_number,


  brand_id:
    Number(form.value.brand_id),


  model:
    form.value.model,


  building_id:
    form.value.building_id
      ? Number(form.value.building_id)
      : null,


  floor_id:
    form.value.floor_id
      ? Number(form.value.floor_id)
      : null,


  division_id:
    form.value.division_id
      ? Number(form.value.division_id)
      : null,


  department_id:
    form.value.department_id
      ? Number(form.value.department_id)
      : null,


  contract_id:
    form.value.contract_id
      ? Number(form.value.contract_id)
      : null,


  price_override:
    form.value.price_override !== ""
      && form.value.price_override !== null
      ? Number(form.value.price_override)
      : null

};



console.log(
  "SEND DATA:",
  data
);



if(isEdit.value){


  console.log(
    "PUT:",
    `/api/devices/${route.params.id}`
  );


  await axios.put(

    `http://localhost:3000/api/devices/${route.params.id}`,

    data,

    config

  );


  alert(
    "แก้ไขข้อมูลสำเร็จ"
  );


}else{


  await axios.post(

    "http://localhost:3000/api/devices",

    data,

    config

  );


  alert(
    "บันทึกข้อมูลสำเร็จ"
  );


}



router.push("/assets");



}catch(err){


console.log(
  "STATUS:",
  err.response?.status
);


console.log(
  "BACKEND ERROR:",
  err.response?.data
);


alert(
  err.response?.data?.error ||
  "บันทึกข้อมูลไม่สำเร็จ"
);


}

}





function cancel(){

 router.push("/assets");

}





onMounted(async()=>{

 await loadMasterData();

 await loadAsset();

});

</script>