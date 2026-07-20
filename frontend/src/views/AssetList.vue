<script setup>

import { ref, onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import api from "../services/api";
import { authState } from "../store/auth";


const router = useRouter();

const isAdmin = computed(() => authState.user?.role === "admin");


const assets = ref([]);

const search = ref("");
const selectedBrand = ref("");
const selectedBuilding = ref("");
const selectedDepartment = ref("");
const selectedStatus = ref("");

const brands = ref([]);
const buildings = ref([]);
const departments = ref([]);

const loading = ref(true);
const error = ref(null);

// Pagination
const currentPage = ref(1);
const perPage = ref(10);


// สถานะเครื่อง — label + สี badge
const statusMeta = {
  active: { label: "ใช้งานอยู่", class: "bg-green-100 text-green-700" },
  repair: { label: "ซ่อมบำรุง", class: "bg-yellow-100 text-yellow-700" },
  retired: { label: "ปลดระวาง", class: "bg-gray-200 text-gray-600" },
};

function statusLabel(status) {
  return statusMeta[status]?.label || status || "-";
}

function statusClass(status) {
  return statusMeta[status]?.class || "bg-gray-100 text-gray-600";
}


// ราคาต่อแผ่นที่ใช้จริง — price_override ทับสัญญาถ้ามีการตั้งไว้เฉพาะเครื่อง
function effectivePrice(asset) {
  const price = asset.price_override ?? asset.price_per_page;
  return price === null || price === undefined ? null : Number(price);
}

function formatMoney(value) {
  if (value === null || value === undefined) return "-";
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}


// ==========================
// Load Assets
// ==========================
async function loadAssets() {

  loading.value = true;
  error.value = null;

  try {

    const res = await api.get("/devices");
    assets.value = res.data;

  } catch (err) {

    console.error("Load assets error:", err);
    error.value = "โหลดข้อมูล Asset ไม่สำเร็จ";

  } finally {

    loading.value = false;

  }

}


async function loadFilterData() {

  try {

    const [brandRes, buildingRes, departmentRes] = await Promise.all([
      api.get("/brands"),
      api.get("/buildings"),
      api.get("/departments"),
    ]);

    brands.value = brandRes.data;
    buildings.value = buildingRes.data;
    departments.value = departmentRes.data;

  } catch (err) {

    console.error("Load filter error:", err);

  }

}


// ==========================
// Filter
// ==========================
const filteredAssets = computed(() => {

  const keyword = search.value.toLowerCase();

  return assets.value.filter((a) => {

    const matchSearch =
      !keyword ||
      a.serial_number?.toLowerCase().includes(keyword) ||
      a.model?.toLowerCase().includes(keyword) ||
      a.brand_name?.toLowerCase().includes(keyword) ||
      a.contract_no?.toLowerCase().includes(keyword);

    const matchBrand =
      !selectedBrand.value ||
      a.brand_name === brands.value.find((b) => b.id == selectedBrand.value)?.name;

    const matchBuilding =
      !selectedBuilding.value ||
      a.building_name === buildings.value.find((b) => b.id == selectedBuilding.value)?.name;

    const matchDepartment =
      !selectedDepartment.value ||
      a.department_name === departments.value.find((d) => d.id == selectedDepartment.value)?.name;

    const matchStatus =
      !selectedStatus.value ||
      a.status === selectedStatus.value;

    return matchSearch && matchBrand && matchBuilding && matchDepartment && matchStatus;

  });

});

const totalPages = computed(() => {
  return Math.max(1, Math.ceil(filteredAssets.value.length / perPage.value));
});

const paginatedAssets = computed(() => {
  const start = (currentPage.value - 1) * perPage.value;
  return filteredAssets.value.slice(start, start + perPage.value);
});


// ==========================
// Edit / Delete (admin เท่านั้น — backend บังคับอยู่แล้ว ฝั่ง UI ก็ซ่อนไม่ให้กดของที่ทำไม่ได้)
// ==========================
function editAsset(id) {
  router.push(`/admin/edit-asset/${id}`);
}

async function deleteAsset(id) {

  if (!confirm("ต้องการลบรายการนี้หรือไม่?")) {
    return;
  }

  try {

    await api.delete(`/devices/${id}`);
    alert("ลบข้อมูลสำเร็จ");
    loadAssets();

  } catch (err) {

    console.error(err);
    alert(err.response?.data?.error || "ลบข้อมูลไม่สำเร็จ");

  }

}


onMounted(async () => {
  await loadAssets();
  await loadFilterData();
});

</script>



<template>

<div class="p-6">

  <div class="flex items-center justify-between mb-4">
    <h1 class="text-2xl font-bold">ทรัพย์สิน (เครื่องพิมพ์ / เครื่องถ่ายเอกสาร)</h1>
  </div>

  <div v-if="error" class="bg-red-100 text-red-700 p-3 rounded mb-4">
    {{ error }}
  </div>

  <p class="mb-3">
    จำนวนอุปกรณ์ทั้งหมด:
    <strong>{{ filteredAssets.length }}</strong>
    รายการ
  </p>


  <div class="flex flex-wrap gap-3 mb-4">

    <input
      v-model="search"
      placeholder="ค้นหา Serial / Model / Brand / เลขที่สัญญา"
      class="border p-2 rounded w-72"
    />

    <select v-model="perPage" class="border p-2 rounded">
      <option :value="10">10 รายการ</option>
      <option :value="20">20 รายการ</option>
      <option :value="50">50 รายการ</option>
      <option :value="100">100 รายการ</option>
    </select>

    <select v-model="selectedBrand" class="border p-2 rounded">
      <option value="">ทุก Brand</option>
      <option v-for="b in brands" :key="b.id" :value="b.id">{{ b.name }}</option>
    </select>

    <select v-model="selectedBuilding" class="border p-2 rounded">
      <option value="">ทุกอาคาร</option>
      <option v-for="b in buildings" :key="b.id" :value="b.id">{{ b.name }}</option>
    </select>

    <select v-model="selectedDepartment" class="border p-2 rounded">
      <option value="">ทุกแผนก</option>
      <option v-for="d in departments" :key="d.id" :value="d.id">{{ d.name }}</option>
    </select>

    <select v-model="selectedStatus" class="border p-2 rounded">
      <option value="">ทุกสถานะ</option>
      <option value="active">ใช้งานอยู่</option>
      <option value="repair">ซ่อมบำรุง</option>
      <option value="retired">ปลดระวาง</option>
    </select>

    <button
      v-if="isAdmin"
      @click="router.push('/admin/add-asset')"
      class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
    >
      + เพิ่มอุปกรณ์
    </button>

  </div>


  <div v-if="loading" class="text-gray-500 py-6">กำลังโหลดข้อมูล...</div>

  <div v-else class="overflow-x-auto">
    <table class="w-full border bg-white text-sm">

      <thead>
        <tr class="bg-gray-100">
          <th class="border p-2 text-left">Serial</th>
          <th class="border p-2 text-left">Brand / Model</th>
          <th class="border p-2 text-left">อาคาร</th>
          <th class="border p-2 text-left">ชั้น</th>
          <th class="border p-2 text-left">ฝ่าย</th>
          <th class="border p-2 text-left">แผนก</th>
          <th class="border p-2 text-left">สัญญา</th>
          <th class="border p-2 text-right">ราคา/แผ่น (บาท)</th>
          <th class="border p-2 text-center">สถานะ</th>
          <th v-if="isAdmin" class="border p-2 text-center">จัดการ</th>
        </tr>
      </thead>

      <tbody>

        <tr v-if="paginatedAssets.length === 0">
          <td :colspan="isAdmin ? 10 : 9" class="border p-4 text-center text-gray-400">
            ไม่พบข้อมูลที่ตรงกับตัวกรอง
          </td>
        </tr>

        <tr v-for="a in paginatedAssets" :key="a.id" class="hover:bg-gray-50">

          <td class="border p-2 font-mono">{{ a.serial_number }}</td>

          <td class="border p-2">
            <div>{{ a.brand_name || "-" }}</div>
            <div class="text-gray-500">{{ a.model || "-" }}</div>
          </td>

          <td class="border p-2">{{ a.building_name || "-" }}</td>
          <td class="border p-2">{{ a.floor_name || "-" }}</td>
          <td class="border p-2">{{ a.division_name || "-" }}</td>
          <td class="border p-2">{{ a.department_name || "-" }}</td>

          <td class="border p-2">
            <div>{{ a.contract_no || "-" }}</div>
            <div v-if="a.fiscal_year" class="text-gray-500">ปีงบ {{ Number(a.fiscal_year) + 543 }}</div>
          </td>

          <td class="border p-2 text-right">
            {{ formatMoney(effectivePrice(a)) }}
            <span v-if="a.price_override !== null && a.price_override !== undefined" class="text-xs text-blue-600 block">
              (ราคาเฉพาะเครื่อง)
            </span>
          </td>

          <td class="border p-2 text-center">
            <span class="px-2 py-1 rounded text-xs font-medium" :class="statusClass(a.status)">
              {{ statusLabel(a.status) }}
            </span>
          </td>

          <td v-if="isAdmin" class="border p-2 text-center whitespace-nowrap">
            <button
              @click="editAsset(a.id)"
              class="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded mr-2"
            >
              แก้ไข
            </button>

            <button
              @click="deleteAsset(a.id)"
              class="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded"
            >
              ลบ
            </button>
          </td>

        </tr>

      </tbody>

    </table>
  </div>


  <div v-if="totalPages > 1" class="flex items-center justify-center gap-2 mt-4">
    <button
      class="border px-3 py-1 rounded disabled:opacity-40"
      :disabled="currentPage === 1"
      @click="currentPage--"
    >
      ก่อนหน้า
    </button>

    <span class="text-sm text-gray-600">หน้า {{ currentPage }} / {{ totalPages }}</span>

    <button
      class="border px-3 py-1 rounded disabled:opacity-40"
      :disabled="currentPage === totalPages"
      @click="currentPage++"
    >
      ถัดไป
    </button>
  </div>

</div>

</template>