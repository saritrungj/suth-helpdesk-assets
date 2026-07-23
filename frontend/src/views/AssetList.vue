<script setup>

import { ref, onMounted, computed } from "vue";
import api from "../services/api";
import { authState } from "../store/auth";
import DataTable from "../components/DataTable.vue";
import AssetForm from "./AssetForm.vue";


const isAdmin = computed(() => authState.user?.role === "admin");


const assets = ref([]);

const search = ref(""); // ตัวกรองเฉพาะทาง (dropdown) — ยังทำเอง แยกจากช่องค้นหาทั่วไปใน DataTable
const selectedBrand = ref("");
const selectedBuilding = ref("");
const selectedFloor = ref("");
const selectedDivision = ref("");
const selectedDepartment = ref("");
const selectedStatus = ref("");

const brands = ref([]);
const buildings = ref([]);
const floors = ref([]);
const divisions = ref([]);
const departments = ref([]);

const loading = ref(true);
const error = ref(null);


// -------------------------------------------------------
// Modal เพิ่ม/แก้ไขทรัพย์สิน — ปุ่ม "เพิ่ม" และ "แก้ไข" เปิด Popup แทนการเปลี่ยนหน้า (ข้อ 6)
// -------------------------------------------------------
const showFormModal = ref(false);
const editingAssetId = ref(null); // null = โหมดเพิ่มใหม่, number = โหมดแก้ไข

function openAddModal() {
  editingAssetId.value = null;
  showFormModal.value = true;
}

function openEditModal(id) {
  editingAssetId.value = id;
  showFormModal.value = true;
}

function onAssetSaved() {
  loadAssets(); // refresh ตารางหลัง submit สำเร็จ (ไม่ต้อง reload ทั้งหน้า)
}


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
    const [brandRes, buildingRes, floorRes, divisionRes, departmentRes] = await Promise.all([
      api.get("/brands"),
      api.get("/buildings"),
      api.get("/floors"),
      api.get("/divisions"),
      api.get("/departments"),
    ]);

    brands.value = brandRes.data;
    buildings.value = buildingRes.data;
    floors.value = floorRes.data;
    divisions.value = divisionRes.data;
    departments.value = departmentRes.data;
  } catch (err) {
    console.error("Load filter error:", err);
  }
}


// ==========================
// Cascading filter options
// ==========================
const filteredFloorOptions = computed(() => {
  if (!selectedBuilding.value) return floors.value;
  return floors.value.filter((f) => Number(f.building_id) === Number(selectedBuilding.value));
});

const filteredDepartmentOptions = computed(() => {
  if (!selectedDivision.value) return departments.value;
  return departments.value.filter((d) => Number(d.division_id) === Number(selectedDivision.value));
});

function onFilterBuildingChange() {
  selectedFloor.value = "";
}

function onFilterDivisionChange() {
  selectedDepartment.value = "";
}


// ==========================
// Filter (เฉพาะทาง — dropdown) — DataTable จะรับผิดชอบ search ทั่วไป/sort/pagination/export ต่อ
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

    const matchFloor =
      !selectedFloor.value ||
      a.floor_name === floors.value.find((f) => f.id == selectedFloor.value)?.name;

    const matchDivision =
      !selectedDivision.value ||
      a.division_name === divisions.value.find((d) => d.id == selectedDivision.value)?.name;

    const matchDepartment =
      !selectedDepartment.value ||
      a.department_name === departments.value.find((d) => d.id == selectedDepartment.value)?.name;

    const matchStatus = !selectedStatus.value || a.status === selectedStatus.value;

    return matchSearch && matchBrand && matchBuilding && matchFloor && matchDivision && matchDepartment && matchStatus;
  });
});


// ==========================
// คอลัมน์ของ DataTable
// ==========================
const columns = computed(() => [
  { key: "serial_number", label: "Serial" },
  { key: "brand_name", label: "Brand / Model", value: (a) => `${a.brand_name || "-"} ${a.model || ""}` },
  { key: "building_name", label: "อาคาร" },
  { key: "floor_name", label: "ชั้น" },
  { key: "division_name", label: "ฝ่าย" },
  { key: "department_name", label: "แผนก" },
  { key: "contract_no", label: "สัญญา" },
  {
    key: "effective_price",
    label: "ราคา/แผ่น (บาท)",
    align: "right",
    value: (a) => effectivePrice(a),
    csv: (a) => effectivePrice(a) ?? "",
  },
  { key: "status", label: "สถานะ", align: "center", value: (a) => statusLabel(a.status), csv: (a) => statusLabel(a.status) },
]);


// ==========================
// Edit / Delete (admin เท่านั้น — backend บังคับอยู่แล้ว ฝั่ง UI ก็ซ่อนไม่ให้กดของที่ทำไม่ได้)
// ==========================
function editAsset(id) {
  openEditModal(id);
}

async function deleteAsset(id) {
  if (!confirm("ต้องการลบรายการนี้หรือไม่?")) return;

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

  <!-- Filter เฉพาะทาง (dropdown) — ยังอยู่เหนือ DataTable เหมือนเดิม -->
  <div class="flex flex-wrap gap-3 mb-4">

    <input
      v-model="search"
      placeholder="ค้นหา Serial / Model / Brand / เลขที่สัญญา (แบบเฉพาะเจาะจง)"
      class="border p-2 rounded w-72"
    />

    <select v-model="selectedBrand" class="border p-2 rounded">
      <option value="">ทุก Brand</option>
      <option v-for="b in brands" :key="b.id" :value="b.id">{{ b.name }}</option>
    </select>

    <select v-model="selectedBuilding" @change="onFilterBuildingChange" class="border p-2 rounded">
      <option value="">ทุกอาคาร</option>
      <option v-for="b in buildings" :key="b.id" :value="b.id">{{ b.name }}</option>
    </select>

    <select v-model="selectedFloor" class="border p-2 rounded">
      <option value="">ทุกชั้น</option>
      <option v-for="f in filteredFloorOptions" :key="f.id" :value="f.id">{{ f.name }}</option>
    </select>

    <select v-model="selectedDivision" @change="onFilterDivisionChange" class="border p-2 rounded">
      <option value="">ทุกฝ่าย</option>
      <option v-for="d in divisions" :key="d.id" :value="d.id">{{ d.name }}</option>
    </select>

    <select v-model="selectedDepartment" class="border p-2 rounded">
      <option value="">ทุกแผนก</option>
      <option v-for="d in filteredDepartmentOptions" :key="d.id" :value="d.id">{{ d.name }}</option>
    </select>

    <select v-model="selectedStatus" class="border p-2 rounded">
      <option value="">ทุกสถานะ</option>
      <option value="active">ใช้งานอยู่</option>
      <option value="repair">ซ่อมบำรุง</option>
      <option value="retired">ปลดระวาง</option>
    </select>

    <button
      v-if="isAdmin"
      @click="openAddModal"
      class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded ml-auto"
    >
      + เพิ่มอุปกรณ์
    </button>

  </div>


  <div v-if="loading" class="text-gray-500 py-6">กำลังโหลดข้อมูล...</div>

  <!-- ตารางเดิม -> DataTable (มี sort/ค้นหาทั่วไป/pagination/export CSV/sticky header ในตัว) -->
  <DataTable
    v-else
    :rows="filteredAssets"
    :columns="columns"
    row-key="id"
    export-filename="assets"
    search-placeholder="ค้นหาทุกคอลัมน์..."
    empty-text="ไม่พบข้อมูลที่ตรงกับตัวกรอง"
    max-height="65vh"
  >
    <template #cell-brand_name="{ row }">
      <div>{{ row.brand_name || "-" }}</div>
      <div class="text-gray-500">{{ row.model || "-" }}</div>
    </template>

    <template #cell-contract_no="{ row }">
      <div>{{ row.contract_no || "-" }}</div>
      <div v-if="row.fiscal_year" class="text-gray-500">ปีงบ {{ Number(row.fiscal_year) + 543 }}</div>
    </template>

    <template #cell-effective_price="{ row }">
      {{ formatMoney(effectivePrice(row)) }}
      <span v-if="row.price_override !== null && row.price_override !== undefined" class="text-xs text-blue-600 block">
        (ราคาเฉพาะเครื่อง)
      </span>
    </template>

    <template #cell-status="{ row }">
      <span class="px-2 py-1 rounded text-xs font-medium" :class="statusClass(row.status)">
        {{ statusLabel(row.status) }}
      </span>
    </template>

    <template v-if="isAdmin" #actions="{ row }">
      <button
        @click="editAsset(row.id)"
        class="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded mr-2"
      >
        แก้ไข
      </button>

      <button
        @click="deleteAsset(row.id)"
        class="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded"
      >
        ลบ
      </button>
    </template>
  </DataTable>

  <!-- Modal เพิ่ม/แก้ไขทรัพย์สิน -->
  <AssetForm
    v-model="showFormModal"
    :asset-id="editingAssetId"
    @saved="onAssetSaved"
  />

</div>

</template>