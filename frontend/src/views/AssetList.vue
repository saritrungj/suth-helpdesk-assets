<script setup>

import { ref, onMounted, computed, watch } from "vue";
import api from "../services/api";
import { authState } from "../store/auth";
import DataTable from "../components/DataTable.vue";
import AssetForm from "./AssetForm.vue";
import SearchableSelect from "../components/SearchableSelect.vue";
import { toastSuccess, toastError } from "../store/toast";
import { askConfirm } from "../store/confirmDialog";


const isAdmin = computed(() => authState.user?.role === "admin");


const assets = ref([]);

const search = ref(""); // ตัวกรองเฉพาะทาง (dropdown) — ยังทำเอง แยกจากช่องค้นหาทั่วไปใน DataTable
const selectedFiscalYear = ref("");
const selectedBrand = ref("");
const selectedBuilding = ref("");
const selectedFloor = ref("");
const selectedDivision = ref("");
const selectedDepartment = ref("");
const selectedStatus = ref("");

const fiscalYears = ref([]);
const brands = ref([]);
const buildings = ref([]);
const floors = ref([]);
const divisions = ref([]);
const departments = ref([]);

const loading = ref(true);
const error = ref(null);


// -------------------------------------------------------
// -------------------------------------------------------
// Modal แก้ไขทรัพย์สิน — ปุ่ม "แก้ไข" เปิด Popup แทนการเปลี่ยนหน้า (ข้อ 6)
// การ "เพิ่ม" ทรัพย์สินย้ายไปอยู่หน้าเดียวกับ Admin master data อื่นๆ แล้ว (ดู /admin/add-asset)
// -------------------------------------------------------
const showFormModal = ref(false);
const editingAssetId = ref(null);

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
    const [fiscalYearRes, brandRes, buildingRes, floorRes, divisionRes, departmentRes] = await Promise.all([
      api.get("/fiscal-years"),
      api.get("/brands"),
      api.get("/buildings"),
      api.get("/floors"),
      api.get("/divisions"),
      api.get("/departments"),
    ]);

    fiscalYears.value = fiscalYearRes.data;
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
// Cascading filter options (เลือกอาคาร/ฝ่ายจากรายการ ค่าจึงตรงเป๊ะเสมอ ไม่ต้องเดา)
// ==========================
const filteredFloorOptions = computed(() => {
  if (!selectedBuilding.value) return floors.value;
  const bld = buildings.value.find((b) => b.name === selectedBuilding.value);
  if (!bld) return floors.value;
  return floors.value.filter((f) => Number(f.building_id) === Number(bld.id));
});

const filteredDepartmentOptions = computed(() => {
  if (!selectedDivision.value) return departments.value;
  const div = divisions.value.find((d) => d.name === selectedDivision.value);
  if (!div) return departments.value;
  return departments.value.filter((d) => Number(d.division_id) === Number(div.id));
});

// ตัวเลือกสำหรับ SearchableSelect ของแต่ละ filter
const fiscalYearOptions = computed(() => fiscalYears.value.map((f) => ({ value: f.year, label: `ปีงบ ${f.year}` })));
const brandOptions = computed(() => brands.value.map((b) => ({ value: b.name, label: b.name })));
const buildingOptions = computed(() => buildings.value.map((b) => ({ value: b.name, label: b.name })));
const floorOptions = computed(() => {
  const seen = new Set();
  const options = [];
  for (const f of filteredFloorOptions.value) {
    if (seen.has(f.name)) continue;
    seen.add(f.name);
    options.push({ value: f.name, label: f.name });
  }
  return options;
});
const divisionOptions = computed(() => divisions.value.map((d) => ({ value: d.name, label: d.name })));
const departmentOptions = computed(() => filteredDepartmentOptions.value.map((d) => ({ value: d.name, label: d.name })));

// เลือกอาคาร/ฝ่ายใหม่ → ค่าชั้น/แผนกที่เคยเลือกไว้อาจไม่ตรงกับตัวเลือกใหม่แล้ว รีเซ็ตทิ้งให้เลือกใหม่
watch(selectedBuilding, () => {
  selectedFloor.value = "";
});

watch(selectedDivision, () => {
  selectedDepartment.value = "";
});

// ล้างตัวกรองเฉพาะทาง (dropdown) ทั้งหมดกลับเป็นค่าเริ่มต้นในคลิกเดียว — เหมือนหน้า Report
function resetFilters() {
  search.value = "";
  selectedFiscalYear.value = "";
  selectedBrand.value = "";
  selectedBuilding.value = "";
  selectedFloor.value = "";
  selectedDivision.value = "";
  selectedDepartment.value = "";
  selectedStatus.value = "";
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

    const matchFiscalYear = !selectedFiscalYear.value || String(a.fiscal_year) === String(selectedFiscalYear.value);

    const matchBrand = !selectedBrand.value || a.brand_name === selectedBrand.value;

    const matchBuilding = !selectedBuilding.value || a.building_name === selectedBuilding.value;

    const matchFloor = !selectedFloor.value || a.floor_name === selectedFloor.value;

    const matchDivision = !selectedDivision.value || a.division_name === selectedDivision.value;

    const matchDepartment = !selectedDepartment.value || a.department_name === selectedDepartment.value;

    const matchStatus = !selectedStatus.value || a.status === selectedStatus.value;

    return matchSearch && matchFiscalYear && matchBrand && matchBuilding && matchFloor && matchDivision && matchDepartment && matchStatus;
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
  if (!(await askConfirm("ต้องการลบรายการนี้หรือไม่?"))) return;

  try {
    await api.delete(`/devices/${id}`);
    toastSuccess("ลบข้อมูลสำเร็จ");
    loadAssets();
  } catch (err) {
    console.error(err);
    toastError(err.response?.data?.error || "ลบข้อมูลไม่สำเร็จ");
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
      class="border p-2 rounded w-72 bg-gray-50"
    />

    <SearchableSelect
      v-model="selectedBrand"
      :options="brandOptions"
      placeholder="ทุก Brand"
      search-placeholder="พิมพ์/เลือก Brand"
    />

    <SearchableSelect
      v-model="selectedBuilding"
      :options="buildingOptions"
      placeholder="ทุกอาคาร"
      search-placeholder="พิมพ์/เลือกอาคาร"
    />

    <SearchableSelect
      v-model="selectedFloor"
      :options="floorOptions"
      placeholder="ทุกชั้น"
      search-placeholder="พิมพ์/เลือกชั้น"
    />

    <SearchableSelect
      v-model="selectedDivision"
      :options="divisionOptions"
      placeholder="ทุกฝ่าย"
      search-placeholder="พิมพ์/เลือกฝ่าย"
    />

    <SearchableSelect
      v-model="selectedDepartment"
      :options="departmentOptions"
      placeholder="ทุกแผนก"
      search-placeholder="พิมพ์/เลือกแผนก"
    />

    <SearchableSelect
      v-model="selectedFiscalYear"
      :options="fiscalYearOptions"
      placeholder="ทุกปีงบ"
      search-placeholder="พิมพ์/เลือกปีงบ"
    />

    <select v-model="selectedStatus" class="border p-2 rounded bg-gray-50">
      <option value="">ทุกสถานะ</option>
      <option value="active">ใช้งานอยู่</option>
      <option value="repair">ซ่อมบำรุง</option>
      <option value="retired">ปลดระวาง</option>
    </select>

    <button
      type="button"
      @click="resetFilters"
      class="text-sm text-red-500 hover:text-gray-700 underline whitespace-nowrap"
    >
      ล้างตัวกรองทั้งหมด
    </button>

    <RouterLink
      v-if="isAdmin"
      to="/admin/add-asset"
      title="เพิ่มอุปกรณ์"
      class="inline-flex items-center justify-center bg-blue-600 text-white w-10 h-10 rounded-full text-xl leading-none hover:bg-blue-700 ml-auto shrink-0"
    >
      +
    </RouterLink>

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
      <div v-if="row.fiscal_year" class="text-gray-500">ปีงบ {{ Number(row.fiscal_year) }}</div>
    </template>

    <template #cell-effective_price="{ row }">
      {{ formatMoney(effectivePrice(row)) }}
      <span v-if="row.price_override !== null && row.price_override !== undefined" class="text-xs text-[var(--brand-text)] block">
        (ราคาเฉพาะเครื่อง)
      </span>
    </template>

    <template #cell-status="{ row }">
      <span class="px-2 py-1 rounded text-xs font-medium" :class="statusClass(row.status)">
        {{ statusLabel(row.status) }}
      </span>
    </template>

    <template #empty="{ search: searchTerm }">
      <div v-if="searchTerm">ไม่พบข้อมูลที่ตรงกับ "{{ searchTerm }}"</div>
      <div v-else class="flex flex-col items-center gap-3">
        <span>ยังไม่มีอุปกรณ์ในระบบ</span>
        <RouterLink
          v-if="isAdmin"
          to="/admin/import-devices"
          class="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
        >
          นำเข้าอุปกรณ์จากไฟล์ CSV/Excel
        </RouterLink>
      </div>
    </template>

    <template v-if="isAdmin" #actions="{ row }">
      <button
        @click="editAsset(row.id)"
        title="แก้ไข"
        class="bg-yellow-500 hover:bg-yellow-600 text-white p-1.5 rounded mr-2"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          <path d="M15 5l4 4" />
        </svg>
      </button>

      <button
        @click="deleteAsset(row.id)"
        title="ลบ"
        class="bg-red-600 hover:bg-red-700 text-white p-1.5 rounded"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 6h18" />
          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
        </svg>
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