<script setup>
import { ref, computed, onMounted, watch } from "vue";
import api from "../services/api";
import { activeFiscalYearRange, fiscalYearMonths, fiscalYearState } from "../store/fiscalYear";
import SearchableSelect from "../components/SearchableSelect.vue";
import DataTable from "../components/DataTable.vue";
import AppIcon from "../components/AppIcon.vue";
import { authState } from "../store/auth";

// viewer = สิทธิ์ดูอย่างเดียว กรอก/แก้ไขยอดพิมพ์ไม่ได้ (backend บังคับด้วย staffMiddleware อยู่แล้ว
// ส่วนนี้แค่ซ่อน/ปิดการกรอกฝั่ง UI ไม่ให้พยายามกรอกแล้วเจอ error กลับมา)
const canEdit = computed(() => authState.user?.role !== "viewer");

const loading = ref(false);
const message = ref(null);
const messageType = ref("success"); // success | error

const search = ref("");

// -------------------------------------------------------
// Filter แบบเจาะจง — เดิมมีแค่ "แผนก" ตอนนี้เพิ่มมิติอื่นให้ค้นหา/กรองได้ตรงจุดขึ้น
// -------------------------------------------------------
const buildingFilter = ref("");
const floorFilter = ref("");
const divisionFilter = ref("");
const departmentFilter = ref("");
const brandFilter = ref("");
const deviceStatusFilter = ref("");
const fillStatusFilter = ref(""); // "" | done | partial | none
const monthFilter = ref("");

const devices = ref([]); // [{ id, serial_number, model, brand_name, building_name, floor_name, division_name, department_name, status, ... }]
const filledSummary = ref({}); // { [device_id]: { filled, total_pages } }
const monthPages = ref({}); // { [device_id]: pages } สำหรับเดือนที่ใช้กรอง

// Master data สำหรับตัวเลือก filter (ดึงจาก endpoint เดียวกับหน้า AssetList)
const buildings = ref([]);
const floors = ref([]);
const divisions = ref([]);
const departments = ref([]);
const brands = ref([]);

// ปีงบที่ active อยู่ตอนนี้เสมอ (เลือกที่ Navbar) — ไม่มี dropdown ปีแยกต่างหากอีกต่อไป
// ปีงบราชการไทยคือ ต.ค.-ก.ย. (คร่อม 2 ปีปฏิทิน) — เดิมที่นี่สมมติผิดว่าตรงกับปีปฏิทินเดียวกันเป๊ะ
const fiscalYearId = computed(() => fiscalYearState.activeId);
const range = computed(() => activeFiscalYearRange.value);
const displayYearBE = computed(() =>
  range.value ? Number(range.value.endMonth.split("-")[0]) + 543 : "-"
);

const monthsTH = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน",
  "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม",
  "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

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

// -------------------------------------------------------
// โหลดรายการเครื่อง + master data (ตัวเลือก filter) + สรุปจำนวนเดือนที่กรอกแล้วของปีที่เลือก
// -------------------------------------------------------
async function loadDevices() {
  const res = await api.get("/devices");
  devices.value = res.data;
}

async function loadMasterData() {
  try {
    const [buildingRes, floorRes, divisionRes, departmentRes, brandRes] = await Promise.all([
      api.get("/buildings"),
      api.get("/floors"),
      api.get("/divisions"),
      api.get("/departments"),
      api.get("/brands"),
    ]);

    buildings.value = buildingRes.data;
    floors.value = floorRes.data;
    divisions.value = divisionRes.data;
    departments.value = departmentRes.data;
    brands.value = brandRes.data;
  } catch (err) {
    console.error("Load master data error:", err);
  }
}

async function loadSummary() {
  if (!fiscalYearId.value) {
    filledSummary.value = {};
    return;
  }

  try {
    const res = await api.get("/print-transactions/summary", {
      params: { fiscal_year_id: fiscalYearId.value },
    });
    filledSummary.value = Object.fromEntries(
      res.data.map((r) => [r.device_id, {
        filled: r.filled,
        totalPages: Number(r.total_pages || 0),
        latestMonth: r.latest_month || null,
        latestPages: Number(r.latest_pages || 0),
      }])
    );
  } catch (err) {
    console.error(err);
  }
}

async function loadMonthPages() {
  if (!monthFilter.value) {
    monthPages.value = {};
    return;
  }

  try {
    const res = await api.get("/print-transactions", { params: { month: monthFilter.value } });
    monthPages.value = Object.fromEntries(res.data.map((row) => [row.device_id, Number(row.pages || 0)]));
  } catch (err) {
    console.error("Load selected month error:", err);
    monthPages.value = {};
  }
}

async function init() {
  loading.value = true;
  try {
    await Promise.all([loadDevices(), loadMasterData(), loadSummary()]);
  } catch (err) {
    console.error(err);
    message.value = "โหลดข้อมูลไม่สำเร็จ";
    messageType.value = "error";
  } finally {
    loading.value = false;
  }
}

// ปีงบเปลี่ยน (จาก Navbar) → สรุปจำนวนเดือนที่กรอกแล้ว/ยอดรวมต้องโหลดใหม่
// immediate: true เผื่อปีงบโหลดเสร็จ/ถูกตั้งค่าเริ่มต้นหลังจาก init() ทำงานไปแล้ว
watch(
  fiscalYearId,
  () => {
    // เดือนที่เลือกอาจอยู่นอกช่วงของปีงบใหม่ จึงล้างก่อนโหลดข้อมูลสรุปใหม่
    monthFilter.value = "";
    loadSummary();
  },
  { immediate: true }
);
watch(monthFilter, loadMonthPages);

// -------------------------------------------------------
// Cascading filter — เลือกอาคารแล้วค่อยกรองชั้น, เลือกฝ่ายแล้วค่อยกรองแผนก (เหมือน AssetList)
// -------------------------------------------------------
const filteredFloorOptions = computed(() => {
  if (!buildingFilter.value) return floors.value;
  const bld = buildings.value.find((b) => b.name === buildingFilter.value);
  if (!bld) return floors.value;
  return floors.value.filter((f) => Number(f.building_id) === Number(bld.id));
});

const filteredDepartmentOptions = computed(() => {
  if (!divisionFilter.value) return departments.value;
  const div = divisions.value.find((d) => d.name === divisionFilter.value);
  if (!div) return departments.value;
  return departments.value.filter((d) => Number(d.division_id) === Number(div.id));
});

// ตัวเลือกสำหรับ SearchableSelect ของแต่ละ filter
const buildingFilterOptions = computed(() => buildings.value.map((b) => ({ value: b.name, label: b.name })));
const floorFilterOptions = computed(() => {
  const seen = new Set();
  const options = [];
  for (const f of filteredFloorOptions.value) {
    if (seen.has(f.name)) continue;
    seen.add(f.name);
    options.push({ value: f.name, label: f.name });
  }
  return options;
});
const divisionFilterOptions = computed(() => divisions.value.map((d) => ({ value: d.name, label: d.name })));
const departmentFilterOptions = computed(() => filteredDepartmentOptions.value.map((d) => ({ value: d.name, label: d.name })));
const brandFilterOptions = computed(() => brands.value.map((b) => ({ value: b.name, label: b.name })));

// เลือกอาคาร/ฝ่ายใหม่ → ค่าชั้น/แผนกที่เคยเลือกไว้อาจไม่ตรงกับตัวเลือกใหม่แล้ว รีเซ็ตทิ้งให้เลือกใหม่
watch(buildingFilter, () => {
  floorFilter.value = "";
});

watch(divisionFilter, () => {
  departmentFilter.value = "";
});

function resetFilters() {
  search.value = "";
  buildingFilter.value = "";
  floorFilter.value = "";
  divisionFilter.value = "";
  departmentFilter.value = "";
  brandFilter.value = "";
  deviceStatusFilter.value = "";
  fillStatusFilter.value = "";
  monthFilter.value = "";
}

// -------------------------------------------------------
// สถานะการกรอกของเครื่องหนึ่งๆ ในปีที่เลือก — ครบ 12 / กรอกบางส่วน / ยังไม่กรอกเลย
// -------------------------------------------------------
function fillInfo(deviceId) {
  return filledSummary.value[deviceId] || { filled: 0, totalPages: 0, latestMonth: null, latestPages: 0 };
}

function formatMonth(month) {
  if (!month) return "-";
  const [year, monthNumber] = month.split("-").map(Number);
  return `${monthsTH[monthNumber - 1]} ${year + 543}`;
}

function selectedMonthPages(deviceId) {
  return monthPages.value[deviceId] ?? 0;
}

function filledCount(deviceId) {
  return fillInfo(deviceId).filled || 0;
}

function totalPages(deviceId) {
  return fillInfo(deviceId).totalPages || 0;
}

function fillStatusOf(deviceId) {
  const n = filledCount(deviceId);
  if (n === 12) return "done";
  if (n > 0) return "partial";
  return "none";
}

// -------------------------------------------------------
// ค้นหา / กรองแบบเจาะจง (อาคาร, ชั้น, ฝ่าย, แผนก, ยี่ห้อ, สถานะเครื่อง, สถานะการกรอก)
// -------------------------------------------------------
const filteredDevices = computed(() => {
  const keyword = search.value.trim().toLowerCase();

  return devices.value.filter((d) => {
    const matchKeyword =
      !keyword ||
      d.serial_number?.toLowerCase().includes(keyword) ||
      d.model?.toLowerCase().includes(keyword) ||
      d.location?.toLowerCase().includes(keyword) ||
      d.department_name?.toLowerCase().includes(keyword) ||
      d.contract_no?.toLowerCase().includes(keyword);

    const matchBuilding = !buildingFilter.value || d.building_name === buildingFilter.value;

    const matchFloor = !floorFilter.value || d.floor_name === floorFilter.value;

    const matchDivision = !divisionFilter.value || d.division_name === divisionFilter.value;

    const matchDepartment = !departmentFilter.value || d.department_name === departmentFilter.value;

    const matchBrand = !brandFilter.value || d.brand_name === brandFilter.value;

    const matchDeviceStatus = !deviceStatusFilter.value || d.status === deviceStatusFilter.value;

    const matchFillStatus = !fillStatusFilter.value || fillStatusOf(d.id) === fillStatusFilter.value;
    const matchMonth = !monthFilter.value || Object.hasOwn(monthPages.value, d.id);

    return (
      matchKeyword &&
      matchBuilding &&
      matchFloor &&
      matchDivision &&
      matchDepartment &&
      matchBrand &&
      matchDeviceStatus &&
      matchFillStatus &&
      matchMonth
    );
  });
});


// -------------------------------------------------------
// Modal กรอกข้อมูล 12 เดือน (Jan–Dec) ของเครื่องเดียว
// -------------------------------------------------------
const showModal = ref(false);
const modalDevice = ref(null);
const modalLoading = ref(false);
const modalSaving = ref(false);
const modalError = ref(null);

// state เป็น array ตาม index เดือน (0 = ม.ค. ... 11 = ธ.ค.)
const modalMonths = ref([]);

function buildMonthRows(fiscalRange) {
  return fiscalYearMonths(fiscalRange).map((month) => {
    const [year, monthNum] = month.split("-").map(Number);
    // ต่อท้ายปี พ.ศ. ให้เดือนด้วยเสมอ เพราะปีงบราชการไทยคร่อม 2 ปีปฏิทิน (ต.ค.-ธ.ค. ของปีก่อนหน้า
    // + ม.ค.-ก.ย. ของปีถัดไป) แค่ชื่อเดือนเฉยๆ จะกำกวมว่าเป็นเดือนของปีไหน (เช่น "ธันวาคม" ปีไหนแน่)
    return {
      month,
      label: `${monthsTH[monthNum - 1]} ${year + 543}`,
      pages: null,
    };
  });
}

async function openModal(device) {
  if (!fiscalYearId.value || !range.value) {
    message.value = "กรุณาเลือกปีงบก่อน (มุมขวาบน)";
    messageType.value = "error";
    return;
  }

  modalDevice.value = device;
  modalError.value = null;
  modalMonths.value = buildMonthRows(range.value);
  showModal.value = true;

  modalLoading.value = true;
  try {
    const res = await api.get(`/print-transactions/by-device/${device.id}`, {
      params: { fiscal_year_id: fiscalYearId.value },
    });

    const byMonth = Object.fromEntries(res.data.map((r) => [r.month, Number(r.pages)]));

    modalMonths.value = modalMonths.value.map((row) => ({
      ...row,
      pages: byMonth[row.month] ?? null,
    }));
  } catch (err) {
    console.error(err);
    modalError.value = "โหลดข้อมูลเดือนเดิมไม่สำเร็จ";
  } finally {
    modalLoading.value = false;
  }
}

function closeModal() {
  showModal.value = false;
  modalDevice.value = null;
  modalMonths.value = [];
  modalError.value = null;
}

function isFilled(pages) {
  return pages !== null && pages !== undefined && pages !== "";
}

async function saveModal() {
  modalError.value = null;

  // validate: ห้ามติดลบ (เดือนที่ว่างไว้ = ยังไม่กรอก ไม่ต้องเช็ค)
  const invalid = modalMonths.value.find((row) => isFilled(row.pages) && Number(row.pages) < 0);
  if (invalid) {
    modalError.value = `จำนวนหน้าของเดือน ${invalid.label} ต้องไม่ติดลบ`;
    return;
  }

  // ส่งครบทั้ง 12 เดือนเสมอ (ไม่ filter เดือนที่ว่างออก) เพราะเดือนที่ "ลบออกจนว่าง"
  // ก็ต้องแจ้ง backend ไปด้วยว่าให้ลบค่าที่เคยบันทึกไว้ทิ้ง ไม่ใช่แค่ไม่พูดถึงเดือนนั้นเฉยๆ
  // (ไม่งั้น backend จะไม่รู้ว่าต้องลบ ค่าที่เคยกรอกไว้ก่อนหน้าจะยังค้างอยู่ในฐานข้อมูล
  // ทั้งที่หน้าจอโชว์ว่าช่องนั้นว่างแล้ว — ดู comment ที่ backend bulk-device)
  const items = modalMonths.value.map((row) => ({
    month: row.month,
    pages: isFilled(row.pages) ? Number(row.pages) : null,
  }));

  modalSaving.value = true;
  try {
    const res = await api.post("/print-transactions/bulk-device", {
      device_id: modalDevice.value.id,
      items,
    });

    message.value = `${modalDevice.value.serial_number}: ${res.data.message}`;
    messageType.value = "success";

    await loadSummary();
    closeModal();
  } catch (err) {
    console.error(err);
    modalError.value = err.response?.data?.error || "บันทึกไม่สำเร็จ กรุณาลองใหม่";
  } finally {
    modalSaving.value = false;
  }
}

// -------------------------------------------------------
// คอลัมน์ของ DataTable (เหมือนหน้าทรัพย์สิน)
// -------------------------------------------------------
const columns = computed(() => [
  { key: "serial_number", label: "SN" },
  { key: "brand_name", label: "ยี่ห้อ / รุ่น", value: (d) => `${d.brand_name || "-"} ${d.model || ""}` },
  { key: "building_name", label: "อาคาร / ชั้น", value: (d) => [d.building_name, d.floor_name].filter(Boolean).join(" / ") || "-" },
  { key: "location", label: "ตำแหน่งที่เครื่องอยู่", value: (d) => d.location || "-" },
  { key: "division_name", label: "ฝ่าย / แผนก", value: (d) => `${d.division_name || "-"} ${d.department_name || ""}` },
  { key: "status", label: "สถานะเครื่อง", align: "center", value: (d) => statusLabel(d.status), csv: (d) => statusLabel(d.status) },
  {
    key: "latest_transaction",
    label: "ยอดล่าสุดที่กรอก",
    align: "right",
    value: (d) => fillInfo(d.id).latestMonth ? `${formatMonth(fillInfo(d.id).latestMonth)}: ${fillInfo(d.id).latestPages.toLocaleString()} หน้า` : "-",
    csv: (d) => fillInfo(d.id).latestMonth ? `${fillInfo(d.id).latestMonth}: ${fillInfo(d.id).latestPages}` : "",
  },
  {
    key: "total_pages",
    label: monthFilter.value ? `ยอดเดือน ${formatMonth(monthFilter.value)} (หน้า)` : "ยอดรวมปีนี้ (หน้า)",
    align: "right",
    value: (d) => monthFilter.value ? selectedMonthPages(d.id) : totalPages(d.id),
    csv: (d) => monthFilter.value ? selectedMonthPages(d.id) : totalPages(d.id),
  },
  { key: "fill_status", label: "สถานะการกรอก", align: "center", value: (d) => `${filledCount(d.id)}/12 เดือน`, csv: (d) => `${filledCount(d.id)}/12` },
]);

onMounted(init);
</script>

<template>
  <div>
    <h1 class="text-3xl font-bold mb-6">บันทึกยอดพิมพ์รายเดือน</h1>

    <div class="bg-gray-50 shadow rounded-lg p-6">
      <!-- แถบควบคุมด้านบน -->
      <div class="flex flex-wrap items-end gap-4 mb-4">
        <div>
          <label class="block text-sm text-gray-500 mb-1">ปีงบ</label>
          <div class="border rounded p-2 bg-gray-50 text-gray-700 min-w-[80px]">
            {{ displayYearBE }}
          </div>
          <p class="text-xs text-gray-400 mt-1">เปลี่ยนปีงบได้ที่มุมขวาบน</p>
        </div>

        <div class="flex-1 min-w-[200px]">
          <label class="block text-sm text-gray-500 mb-1">ค้นหา (SN / รุ่น / แผนก / เลขที่สัญญา)</label>
          <input
            v-model="search"
            type="text"
            placeholder="พิมพ์เพื่อค้นหา..."
            class="border rounded p-2 w-full bg-gray-50"
          />
        </div>

        <div class="min-w-[180px]">
          <label class="block text-sm text-gray-500 mb-1">ดูข้อมูลเดือน</label>
          <select v-model="monthFilter" class="border rounded p-2 w-full bg-gray-50">
            <option value="">ทุกเดือนในปีงบ</option>
            <option v-for="month in fiscalYearMonths(range)" :key="month" :value="month">
              {{ formatMonth(month) }}
            </option>
          </select>
        </div>
      </div>

      <!-- Filter เจาะจง — อาคาร/ชั้น/ฝ่าย/แผนก/ยี่ห้อ/สถานะเครื่อง/สถานะการกรอก -->
      <div class="flex flex-wrap items-end gap-3 mb-4 pt-4 border-t">
        <div>
          <label class="block text-xs text-gray-500 mb-1">อาคาร</label>
          <SearchableSelect
            v-model="buildingFilter"
            :options="buildingFilterOptions"
            placeholder="ทุกอาคาร"
            search-placeholder="พิมพ์ชื่ออาคาร..."
          />
        </div>

        <div>
          <label class="block text-xs text-gray-500 mb-1">ชั้น</label>
          <SearchableSelect
            v-model="floorFilter"
            :options="floorFilterOptions"
            placeholder="ทุกชั้น"
            search-placeholder="พิมพ์ชื่อชั้น..."
          />
        </div>

        <div>
          <label class="block text-xs text-gray-500 mb-1">ฝ่าย</label>
          <SearchableSelect
            v-model="divisionFilter"
            :options="divisionFilterOptions"
            placeholder="ทุกฝ่าย"
            search-placeholder="พิมพ์ชื่อฝ่าย..."
          />
        </div>

        <div>
          <label class="block text-xs text-gray-500 mb-1">แผนก</label>
          <SearchableSelect
            v-model="departmentFilter"
            :options="departmentFilterOptions"
            placeholder="ทุกแผนก"
            search-placeholder="พิมพ์ชื่อแผนก..."
          />
        </div>

        <div>
          <label class="block text-xs text-gray-500 mb-1">ยี่ห้อ</label>
          <SearchableSelect
            v-model="brandFilter"
            :options="brandFilterOptions"
            placeholder="ทุกยี่ห้อ"
            search-placeholder="พิมพ์ชื่อยี่ห้อ..."
          />
        </div>

        <div>
          <label class="block text-xs text-gray-500 mb-1">สถานะเครื่อง</label>
          <select v-model="deviceStatusFilter" class="border rounded p-2 text-sm bg-gray-50">
            <option value="">ทุกสถานะ</option>
            <option value="active">ใช้งานอยู่</option>
            <option value="repair">ซ่อมบำรุง</option>
            <option value="retired">ปลดระวาง</option>
          </select>
        </div>

        <div>
          <label class="block text-xs text-gray-500 mb-1">สถานะการกรอก (ปีงบ {{ displayYearBE }})</label>
          <select v-model="fillStatusFilter" class="border rounded p-2 text-sm bg-gray-50">
            <option value="">ทั้งหมด</option>
            <option value="done">กรอกครบ 12 เดือน</option>
            <option value="partial">กรอกบางส่วน</option>
            <option value="none">ยังไม่ได้กรอกเลย</option>
          </select>
        </div>

        <button
          type="button"
          @click="resetFilters"
          class="text-sm text-red-500 hover:text-gray-700 underline whitespace-nowrap"
        >
          ล้างตัวกรองทั้งหมด
        </button>
      </div>

      <!-- สถานะ -->
      <div
        v-if="message"
        class="mb-4 p-3 rounded text-sm"
        :class="messageType === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'"
      >
        {{ message }}
      </div>

      <div class="text-sm text-gray-500 mb-3">
        ปีงบ {{ displayYearBE }}
      </div>

      <div v-if="loading" class="text-center text-gray-500 py-10">กำลังโหลดข้อมูล...</div>

      <!-- ตาราง -> DataTable (มี sort/ค้นหาทั่วไป/pagination/export CSV/sticky header ในตัว เหมือนหน้าทรัพย์สิน) -->
      <DataTable
        v-else
        :rows="filteredDevices"
        :columns="columns"
        row-key="id"
        export-filename="print-transactions"
        search-placeholder="ค้นหาทุกคอลัมน์..."
        empty-text="ไม่พบเครื่องที่ตรงกับเงื่อนไขค้นหา"
        max-height="65vh"
      >
        <template #cell-brand_name="{ row }">
          <div>{{ row.brand_name || "-" }}</div>
          <div class="text-gray-500">{{ row.model || "-" }}</div>
        </template>

        <template #cell-building_name="{ row }">
          <div>{{ row.building_name || "-" }}</div>
          <div class="text-gray-500">{{ row.floor_name || "-" }}</div>
        </template>

        <template #cell-location="{ row }">
          {{ row.location || "-" }}
        </template>

        <template #cell-division_name="{ row }">
          <div>{{ row.division_name || "-" }}</div>
          <div class="text-gray-500">{{ row.department_name || "-" }}</div>
        </template>

        <template #cell-total_pages="{ row }">
          {{ (monthFilter ? selectedMonthPages(row.id) : totalPages(row.id)).toLocaleString() }}
        </template>

        <template #cell-latest_transaction="{ row }">
          <template v-if="fillInfo(row.id).latestMonth">
            <div>{{ formatMonth(fillInfo(row.id).latestMonth) }}</div>
            <div class="text-gray-500">{{ fillInfo(row.id).latestPages.toLocaleString() }} หน้า</div>
          </template>
          <span v-else>-</span>
        </template>

        <template #cell-status="{ row }">
          <span class="px-2 py-1 rounded text-xs font-medium" :class="statusClass(row.status)">
            {{ statusLabel(row.status) }}
          </span>
        </template>

        <template #cell-fill_status="{ row }">
          <span
            class="px-2 py-1 rounded text-xs font-medium"
            :class="
              filledCount(row.id) === 12
                ? 'bg-green-100 text-green-700'
                : filledCount(row.id) > 0
                ? 'bg-orange-100 text-orange-700'
                : 'bg-gray-100 text-gray-500'
            "
          >
            {{ filledCount(row.id) }}/12 เดือน
          </span>
        </template>

        <template #actions="{ row }">
          <button
            @click="openModal(row)"
            :class="canEdit ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-500 hover:bg-gray-600'"
            class="text-white px-3 py-1 rounded"
          >
            {{ canEdit ? "กรอกข้อมูล" : "ดูข้อมูล" }}
          </button>
        </template>
      </DataTable>
    </div>

    <!-- Modal: กรอก 12 เดือน (Jan–Dec) ของเครื่องเดียว -->
    <div
      v-if="showModal"
      class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      @click.self="closeModal"
    >
      <div class="bg-gray-50 rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div class="p-5 border-b flex items-center justify-between">
          <div>
            <h2 class="text-lg font-bold">{{ canEdit ? "กรอกยอดพิมพ์รายเดือน" : "ดูยอดพิมพ์รายเดือน" }}</h2>
            <p class="text-sm text-gray-500">
              {{ modalDevice?.serial_number }} — {{ modalDevice?.brand_name }} {{ modalDevice?.model }}
              (ปีงบ {{ displayYearBE }})
            </p>
          </div>
          <button @click="closeModal" class="text-gray-400 hover:text-gray-700 text-xl leading-none">
            &times;
          </button>
        </div>

        <div class="p-5">
          <div v-if="modalLoading" class="text-center text-gray-500 py-6">กำลังโหลดข้อมูลเดิม...</div>

          <table v-else class="w-full text-sm border-collapse">
            <thead>
              <tr class="text-left text-gray-500">
                <th class="py-1">เดือน</th>
                <th class="py-1 text-right">จำนวนหน้า</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in modalMonths" :key="row.month" class="border-t">
                <td class="py-2">{{ row.label }}</td>
                <td class="py-2 text-right">
                  <input
                    type="number"
                    min="0"
                    v-model.number="modalMonths[i].pages"
                    placeholder="ยังไม่กรอก"
                    :disabled="!canEdit"
                    class="border rounded p-1 w-28 text-right bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </td>
              </tr>
            </tbody>
          </table>

          <div v-if="modalError" class="mt-4 bg-red-100 text-red-700 p-3 rounded text-sm">
            {{ modalError }}
          </div>
        </div>

        <div class="p-5 border-t flex justify-end gap-2">
          <button
            @click="closeModal"
            :disabled="modalSaving"
            class="border px-4 py-2 rounded hover:bg-gray-50"
          >
            {{ canEdit ? "ยกเลิก" : "ปิด" }}
          </button>
          <button
            v-if="canEdit"
            @click="saveModal"
            :disabled="modalSaving || modalLoading"
            class="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            <AppIcon v-if="!modalSaving" name="check" class="w-4 h-4 shrink-0" />
            {{ modalSaving ? "กำลังบันทึก..." : "บันทึกทั้ง 12 เดือน" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
