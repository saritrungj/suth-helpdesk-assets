<template>
  <div class="max-w-xl mx-auto bg-white p-6 shadow rounded">
    <h1 class="text-2xl font-bold mb-6">
      {{ isEdit ? "แก้ไขทรัพย์สิน" : "เพิ่มทรัพย์สิน" }}
    </h1>

    <p v-if="loading" class="text-gray-500">กำลังโหลดข้อมูล...</p>

    <template v-else>
      <!-- Serial Number -->
      <div class="mb-4">
        <label class="block mb-1">Serial Number <span class="text-red-500">*</span></label>
        <input
          v-model="form.serial_number"
          class="border w-full p-2 rounded"
          placeholder="เช่น HP001"
        />
      </div>

      <!-- Brand -->
      <div class="mb-4">
        <label class="block mb-1">ยี่ห้อ (Brand)</label>
        <select v-model="form.brand_id" class="border w-full p-2 rounded">
          <option :value="null">- ไม่ระบุ -</option>
          <option v-for="b in brands" :key="b.id" :value="b.id">{{ b.name }}</option>
        </select>
      </div>

      <!-- Model -->
      <div class="mb-4">
        <label class="block mb-1">รุ่น (Model)</label>
        <input
          v-model="form.model"
          class="border w-full p-2 rounded"
          placeholder="รุ่นอุปกรณ์"
        />
      </div>

      <!-- Building / Floor -->
      <div class="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label class="block mb-1">อาคาร</label>
          <select
            v-model="form.building_id"
            class="border w-full p-2 rounded"
            @change="form.floor_id = null"
          >
            <option :value="null">- ไม่ระบุ -</option>
            <option v-for="b in buildings" :key="b.id" :value="b.id">{{ b.name }}</option>
          </select>
        </div>
        <div>
          <label class="block mb-1">ชั้น</label>
          <select
            v-model="form.floor_id"
            class="border w-full p-2 rounded"
            :disabled="!form.building_id"
          >
            <option :value="null">- ไม่ระบุ -</option>
            <option v-for="f in floorsOfBuilding" :key="f.id" :value="f.id">{{ f.name }}</option>
          </select>
        </div>
      </div>

      <!-- Division / Department -->
      <div class="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label class="block mb-1">ฝ่าย</label>
          <select
            v-model="form.division_id"
            class="border w-full p-2 rounded"
            @change="form.department_id = null"
          >
            <option :value="null">- ไม่ระบุ -</option>
            <option v-for="d in divisions" :key="d.id" :value="d.id">{{ d.name }}</option>
          </select>
        </div>
        <div>
          <label class="block mb-1">แผนก</label>
          <select
            v-model="form.department_id"
            class="border w-full p-2 rounded"
            :disabled="!form.division_id"
          >
            <option :value="null">- ไม่ระบุ -</option>
            <option v-for="d in departmentsOfDivision" :key="d.id" :value="d.id">{{ d.name }}</option>
          </select>
        </div>
      </div>

      <!-- Contract -->
      <div class="mb-4">
        <label class="block mb-1">สัญญา</label>
        <select v-model="form.contract_id" class="border w-full p-2 rounded">
          <option :value="null">- ไม่ระบุ -</option>
          <option v-for="c in contracts" :key="c.id" :value="c.id">
            {{ c.contract_no }}
            <template v-if="c.fiscal_year"> (ปีงบ {{ c.fiscal_year }})</template>
          </option>
        </select>
      </div>

      <!-- Price override -->
      <div class="mb-4">
        <label class="block mb-1">ราคาต่อแผ่นเฉพาะเครื่อง (บาท)</label>
        <input
          v-model="form.price_override"
          type="number"
          step="0.01"
          min="0"
          class="border w-full p-2 rounded"
          placeholder="เว้นว่าง = ใช้ราคาตามสัญญา"
        />
      </div>

      <!-- Status -->
      <div class="mb-6">
        <label class="block mb-1">สถานะ</label>
        <select v-model="form.status" class="border w-full p-2 rounded">
          <option value="active">ใช้งาน</option>
          <option value="repair">ซ่อม</option>
          <option value="retired">ปลดระวาง</option>
        </select>
      </div>

      <!-- Buttons -->
      <div class="flex gap-3">
        <button
          @click="saveAsset"
          :disabled="saving"
          class="bg-green-600 text-white px-4 py-2 rounded disabled:opacity-50"
        >
          {{ saving ? "กำลังบันทึก..." : "Save" }}
        </button>

        <button
          @click="cancel"
          class="bg-gray-500 text-white px-4 py-2 rounded"
        >
          Cancel
        </button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import api from "../services/api";

const router = useRouter();
const route = useRoute();

const isEdit = computed(() => !!route.params.id);

const loading = ref(true);
const saving = ref(false);

const brands = ref([]);
const buildings = ref([]);
const floors = ref([]);
const divisions = ref([]);
const departments = ref([]);
const contracts = ref([]);

const form = ref({
  serial_number: "",
  brand_id: null,
  model: "",
  building_id: null,
  floor_id: null,
  division_id: null,
  department_id: null,
  contract_id: null,
  price_override: "",
  status: "active",
});

const floorsOfBuilding = computed(() =>
  floors.value.filter((f) => f.building_id === form.value.building_id)
);

const departmentsOfDivision = computed(() =>
  departments.value.filter((d) => d.division_id === form.value.division_id)
);

async function load() {
  loading.value = true;
  try {
    const [brandRes, buildingRes, floorRes, divisionRes, departmentRes, contractRes] =
      await Promise.all([
        api.get("/brands"),
        api.get("/buildings"),
        api.get("/floors"),
        api.get("/divisions"),
        api.get("/departments"),
        api.get("/contracts"),
      ]);

    brands.value = brandRes.data;
    buildings.value = buildingRes.data;
    floors.value = floorRes.data;
    divisions.value = divisionRes.data;
    departments.value = departmentRes.data;
    contracts.value = contractRes.data;

    // โหมดแก้ไข: โหลดข้อมูลเครื่องเดิมมาใส่ฟอร์ม
    if (isEdit.value) {
      const res = await api.get(`/devices/${route.params.id}`);
      const d = res.data;
      form.value = {
        serial_number: d.serial_number || "",
        brand_id: d.brand_id ?? null,
        model: d.model || "",
        building_id: d.building_id ?? null,
        floor_id: d.floor_id ?? null,
        division_id: d.division_id ?? null,
        department_id: d.department_id ?? null,
        contract_id: d.contract_id ?? null,
        price_override: d.price_override ?? "",
        status: d.status || "active",
      };
    }
  } catch (err) {
    console.error(err);
    alert("โหลดข้อมูลไม่สำเร็จ");
  } finally {
    loading.value = false;
  }
}

async function saveAsset() {
  if (!form.value.serial_number.trim()) {
    alert("กรุณากรอก Serial Number");
    return;
  }

  // backend validate ด้วย zod — ต้องส่งตัวเลขจริงหรือ null เท่านั้น
  const payload = {
    serial_number: form.value.serial_number.trim(),
    brand_id: form.value.brand_id ? Number(form.value.brand_id) : null,
    model: form.value.model.trim() || null,
    building_id: form.value.building_id ? Number(form.value.building_id) : null,
    floor_id: form.value.floor_id ? Number(form.value.floor_id) : null,
    division_id: form.value.division_id ? Number(form.value.division_id) : null,
    department_id: form.value.department_id ? Number(form.value.department_id) : null,
    contract_id: form.value.contract_id ? Number(form.value.contract_id) : null,
    price_override:
      form.value.price_override !== "" && form.value.price_override !== null
        ? Number(form.value.price_override)
        : null,
    status: form.value.status,
  };

  saving.value = true;
  try {
    if (isEdit.value) {
      await api.put(`/devices/${route.params.id}`, payload);
      alert("แก้ไขข้อมูลสำเร็จ");
    } else {
      await api.post("/devices", payload);
      alert("เพิ่มทรัพย์สินสำเร็จ");
    }
    router.push("/assets");
  } catch (err) {
    console.error(err);
    alert(err.response?.data?.error || "บันทึกข้อมูลไม่สำเร็จ");
  } finally {
    saving.value = false;
  }
}

function cancel() {
  router.push("/assets");
}

onMounted(load);
</script>
