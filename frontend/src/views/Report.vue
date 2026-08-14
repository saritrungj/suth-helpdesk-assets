<script setup>
import { ref, computed, watch, onMounted } from "vue";
import api from "../services/api";
import DataTable from "../components/DataTable.vue";
import SearchableSelect from "../components/SearchableSelect.vue";
import MonthPicker from "../components/MonthPicker.vue";
import {
  fiscalYearState,
  activeFiscalYear,
  activeFiscalYearRange,
  fiscalYearMonths,
  loadFiscalYears,
} from "../store/fiscalYear";

const loading = ref(false);
const error = ref(null);

// รายชื่อเครื่องทั้งหมด (จาก /devices — มี brand/model/อาคาร/แผนกให้แล้ว)
const devices = ref([]);

// ยอดพิมพ์รายเดือนของแต่ละเครื่อง: device_id -> { "YYYY-MM": pages }
const monthlyMap = ref({});

// -------------------------------------------------------
// Filter แบบเจาะจง — เหมือนหน้า "บันทึกยอดพิมพ์รายเดือน" (PrintTransactions)
// -------------------------------------------------------
const search = ref("");
const buildingFilter = ref("");
const floorFilter = ref("");
const divisionFilter = ref("");
const departmentFilter = ref("");
const brandFilter = ref("");
const deviceStatusFilter = ref("");
const fillStatusFilter = ref(""); // "" | done | partial | none

// Master data สำหรับตัวเลือก filter
const buildings = ref([]);
const floors = ref([]);
const divisions = ref([]);
const departments = ref([]);
const brands = ref([]);

const statusMeta = {
  active: { label: "ใช้งานอยู่", class: "bg-green-100 text-green-700" },
  repair: { label: "ซ่อมบำรุง", class: "bg-yellow-100 text-yellow-700" },
  retired: { label: "ปลดระวาง", class: "bg-gray-200 text-gray-600" },
};

function statusLabel(status) {
  return statusMeta[status]?.label || status || "-";
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

// Cascading filter — เลือกอาคารแล้วค่อยกรองชั้น, เลือกฝ่ายแล้วค่อยกรองแผนก
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
}

// ปีงบ พ.ศ. ที่ใช้แสดงในกล่อง "ปีงบ" และ label ของ filter สถานะการกรอก
const displayYearBE = computed(() => activeFiscalYear.value?.year ?? "-");

// เดือนทั้งหมดของปีงบที่เลือกอยู่ (ต.ค. - ก.ย. เสมอ) — ใช้ store กลางตัวเดียวกับหน้าอื่นๆ
const fyMonths = computed(() => fiscalYearMonths(activeFiscalYearRange.value));

// เดือนที่ "เลือกจะแสดง" ในตาราง — ไม่ว่างเปล่า = เอาแค่บางเดือนของปีงบนี้ (ให้ผู้ใช้เจาะจงเดือนได้
// ตามที่ขอในมีตติ้ง "ปีงบนี้เลือกเป็นรายเดือนได้ไหม") ว่างเปล่า = ยังไม่ได้เจาะจง แสดงทั้งปีงบตามเดิม
// (ดู displayMonths ด้านล่าง — MonthPicker เองมี watcher ที่ล้างค่านี้ให้อัตโนมัติเมื่อเปลี่ยนปีงบ)
const reportMonths = ref([]);

// เดือนที่ใช้จริงในการสร้างคอลัมน์ตาราง: ถ้าผู้ใช้เจาะจงไว้ใช้ตามนั้น ไม่งั้น fallback เป็นทั้งปีงบ
const displayMonths = computed(() =>
  reportMonths.value.length ? [...reportMonths.value].sort() : fyMonths.value
);

function formatMonthShort(value) {
  if (!value) return "";
  const monthsTH = [
    "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.",
    "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.",
    "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
  ];
  const [y, m] = value.split("-");
  return `${monthsTH[Number(m) - 1]} ${String(Number(y) + 543).slice(-2)}`;
}

async function loadReport() {
  if (!fiscalYearState.activeId || !fyMonths.value.length) {
    devices.value = [];
    monthlyMap.value = {};
    return;
  }

  loading.value = true;
  error.value = null;

  try {
    const [deviceRes, monthlyRes] = await Promise.all([
      api.get("/devices"),
      // ยิงขอทีเดียวทุกเดือนของปีงบนี้ (เดือนคั่นด้วย comma) แทนที่จะยิงทีละเดือน
      api.get("/dashboard/monthly-kpi", { params: { month: fyMonths.value.join(",") } }),
      loadMasterData(),
    ]);

    devices.value = deviceRes.data;

    // จัดกลุ่ม: device_id -> { month: pages_printed }
    // ใช้ pages_printed (ยอดมิเตอร์ดิบ) ไม่ใช่ net_pages เพราะโจทย์คือ "พิมพ์เท่าไหร่" ไม่ใช่ยอดคิดเงิน
    const map = {};
    for (const row of monthlyRes.data) {
      if (!map[row.device_id]) map[row.device_id] = {};
      map[row.device_id][row.month] = Number(row.pages_printed || 0);
    }
    monthlyMap.value = map;
  } catch (err) {
    console.error("Load report error:", err);
    error.value = "โหลดข้อมูลรายงานไม่สำเร็จ";
    devices.value = [];
    monthlyMap.value = {};
  } finally {
    loading.value = false;
  }
}

// -------------------------------------------------------
// สถานะการกรอกของเครื่องหนึ่งๆ ในปีงบที่เลือก — ครบ 12 / กรอกบางส่วน / ยังไม่กรอกเลย
// (นับจาก monthlyMap ที่ backend ส่งมาเฉพาะเดือนที่มีการกรอกข้อมูลจริงเท่านั้น)
// -------------------------------------------------------
function filledCount(deviceId) {
  return Object.keys(monthlyMap.value[deviceId] || {}).length;
}

function fillStatusOf(deviceId) {
  const n = filledCount(deviceId);
  if (fyMonths.value.length && n >= fyMonths.value.length) return "done";
  if (n > 0) return "partial";
  return "none";
}

// กรองรายการเครื่องตาม filter ที่เลือก (ค้นหา/อาคาร/ชั้น/ฝ่าย/แผนก/ยี่ห้อ/สถานะเครื่อง/สถานะการกรอก)
const filteredDevices = computed(() => {
  const keyword = search.value.trim().toLowerCase();

  return devices.value.filter((d) => {
    const matchKeyword =
      !keyword ||
      d.serial_number?.toLowerCase().includes(keyword) ||
      d.model?.toLowerCase().includes(keyword) ||
      d.department_name?.toLowerCase().includes(keyword) ||
      d.contract_no?.toLowerCase().includes(keyword);

    const matchBuilding = !buildingFilter.value || d.building_name === buildingFilter.value;
    const matchFloor = !floorFilter.value || d.floor_name === floorFilter.value;
    const matchDivision = !divisionFilter.value || d.division_name === divisionFilter.value;
    const matchDepartment = !departmentFilter.value || d.department_name === departmentFilter.value;
    const matchBrand = !brandFilter.value || d.brand_name === brandFilter.value;
    const matchDeviceStatus = !deviceStatusFilter.value || d.status === deviceStatusFilter.value;
    const matchFillStatus = !fillStatusFilter.value || fillStatusOf(d.id) === fillStatusFilter.value;

    return (
      matchKeyword &&
      matchBuilding &&
      matchFloor &&
      matchDivision &&
      matchDepartment &&
      matchBrand &&
      matchDeviceStatus &&
      matchFillStatus
    );
  });
});

// แถวของตาราง: ข้อมูลเครื่อง + ยอดพิมพ์รายเดือน (_monthly) + รวมเฉพาะเดือนที่เลือกแสดง (_total)
const reportRows = computed(() =>
  filteredDevices.value.map((d) => {
    const monthly = monthlyMap.value[d.id] || {};
    const total = displayMonths.value.reduce((sum, m) => sum + (monthly[m] || 0), 0);
    return { ...d, _monthly: monthly, _total: total };
  })
);

// คอลัมน์ของ DataTable — คอลัมน์ข้อมูลเครื่อง + 1 คอลัมน์ต่อเดือนที่เลือกแสดง + คอลัมน์รวม
const columns = computed(() => {
  const base = [
    { key: "serial_number", label: "Serial" },
    {
      key: "brand_model",
      label: "ยี่ห้อ / รุ่น",
      value: (r) => `${r.brand_name || "-"} ${r.model || ""}`.trim(),
    },
    { key: "building_name", label: "อาคาร" },
    { key: "department_name", label: "แผนก" },
  ];

  const monthCols = displayMonths.value.map((m) => ({
    key: `m_${m}`,
    label: formatMonthShort(m),
    align: "right",
    value: (r) => r._monthly[m] || 0,
    csv: (r) => r._monthly[m] || 0,
  }));

  const totalCol = {
    key: "total_pages",
    label: reportMonths.value.length ? "รวมเดือนที่เลือก" : "รวมทั้งปีงบ",
    align: "right",
    value: (r) => r._total,
    csv: (r) => r._total,
  };

  return [...base, ...monthCols, totalCol];
});

// เปลี่ยนปีงบ "หลังจากหน้าเปิดมาแล้ว" (กด dropdown ที่ Navbar, กด back/forward, หรือ setActiveFiscalYear
// ถูกเรียกจากที่อื่น) -> โหลดข้อมูลใหม่ทันที
// หมายเหตุ: ไม่ใช้ immediate:true แล้ว — การโหลดครั้งแรกตอนเปิดหน้าย้ายไปให้ onMounted ด้านล่าง
// เป็นคน await + สั่ง loadReport() เองแบบ sequential ชัดเจนแทน (ดูเหตุผลด้านล่าง)
watch(
  () => fiscalYearState.activeId,
  (id) => {
    if (id) loadReport();
  }
);

// เดิมหน้านี้พึ่งพา watch({immediate:true}) ตัวเดียวเพื่อโหลดข้อมูลตอนเปิดหน้า โดยหวังว่า
// fiscalYearState.activeId จะ "reactive trigger" ทันเวลาตอนที่ fetchFiscalYears() (เรียกจาก
// Navbar.vue หรือหน้านี้ก็ได้ แล้วแต่ใคร mount ก่อน) เซ็ตค่าเสร็จ — ปกติทำงานได้ เพราะ Vue
// จะ flush watcher callback ให้เองตอน reactive property เปลี่ยน แต่ในทางปฏิบัติพบว่าตอน refresh
// หน้า /report ตรงๆ (ต่างจากตอนกดเปลี่ยนปีงบเองที่หน้าโหลดพร้อมข้อมูลอยู่แล้ว) มีจังหวะที่
// loadReport() ไม่ถูกยิงตามทันจริง ทำให้ตารางค้างว่าง "ไม่มีข้อมูลเครื่องพิมพ์" ทั้งที่ปีงบเลือกถูกแล้ว
// จนกว่าจะมีคนเปลี่ยนปีงบเองอีกที (ซึ่งไป trigger loadReport() ตรงๆ ผ่าน watcher ด้านบน)
//
// แก้โดยไม่พึ่งพา timing ของ reactive watcher สำหรับการโหลด "ครั้งแรก" อีกต่อไป — ให้ onMounted
// await loadFiscalYears() ให้เสร็จตรงๆ ก่อน แล้วค่อยเรียก loadReport() เองทันทีถ้ามี activeId
// อยู่แล้ว (ครอบคลุมทั้งกรณี list/activeId โหลดจาก store เดิมอยู่แล้ว และกรณีเพิ่งโหลดเสร็จใหม่ๆ)
// ส่วน watcher ด้านบนยังอยู่ ไว้จับการเปลี่ยนปีงบ "หลังจากนี้" ต่อไปตามปกติ
onMounted(async () => {
  await loadFiscalYears();
  if (fiscalYearState.activeId) {
    loadReport();
  }
});
</script>

<template>
  <div>
    <h1 class="text-3xl font-bold mb-6">รายงานยอดพิมพ์รายเดือนตามเครื่อง</h1>

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

        <div class="min-w-[200px]">
          <label class="block text-sm text-gray-500 mb-1">เดือนที่แสดง</label>
          <MonthPicker v-model="reportMonths" :options="fyMonths" />
          <p class="text-xs text-gray-400 mt-1">ไม่เลือก = แสดงทั้งปีงบ</p>
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

      <div
        v-if="!fiscalYearState.activeId"
        class="text-center text-gray-400 border border-dashed rounded-lg py-10"
      >
        กรุณาเลือกปีงบประมาณด้านบนก่อน
      </div>

      <template v-else>
        <div class="text-sm text-gray-500 mb-3">
          ปีงบ {{ displayYearBE }}
        </div>

        <div v-if="loading" class="text-center text-gray-500 py-10">กำลังโหลดข้อมูล...</div>
        <div v-else-if="error" class="bg-red-100 text-red-700 p-4 rounded">{{ error }}</div>

        <DataTable
          v-else
          :rows="reportRows"
          :columns="columns"
          row-key="id"
          export-filename="report-print-by-device"
          search-placeholder="ค้นหาทุกคอลัมน์..."
          empty-text="ไม่มีข้อมูลเครื่องพิมพ์"
          max-height="65vh"
        >
          <template #cell-serial_number="{ row }">
            <span class="font-medium">{{ row.serial_number }}</span>
          </template>

          <template #cell-total_pages="{ value }">
            <span class="font-semibold">{{ Number(value).toLocaleString() }}</span>
          </template>
        </DataTable>
      </template>
    </div>
  </div>
</template>