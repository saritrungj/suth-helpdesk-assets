<script setup>
/**
 * Report — รายงานยอดพิมพ์รายเดือน หนึ่งแถวต่อหนึ่งเครื่อง หนึ่งคอลัมน์ต่อหนึ่งเดือน
 *
 * เป็นหน้าที่ถูกพิมพ์ออกกระดาษส่งผู้บริหารจริง จึงออกแบบให้เนื้อหาอยู่ในตารางเดียว
 * ที่อ่านรวดเดียวจบ และตัดเมนู/ปุ่มออกทั้งหมดตอนสั่งพิมพ์ (ดู base.css)
 *
 * ตัวเลขในหน้านี้เป็น "ยอดมิเตอร์ดิบ" ไม่ใช่ยอดคิดเงิน เพราะคำถามของหน้านี้คือ
 * "พิมพ์ไปเท่าไหร่" ไม่ใช่ "จ่ายเท่าไหร่" — ยอดคิดเงินอยู่ที่หน้าค่าใช้จ่าย
 *
 * เรื่องที่ยากที่สุดของหน้านี้คือเครื่องที่ย้ายที่ตั้งกลางปีงบ: ถ้าเหมายอดทั้งปีให้
 * ที่ตั้งปัจจุบัน แผนกใหม่จะถูกคิดยอดของแผนกเก่าไปด้วย จึงแตกเป็นหลายแถว
 * แถวละหนึ่งช่วงที่ตั้ง แต่ละแถวเห็นเฉพาะเดือนที่เครื่องอยู่ที่นั่นจริง และมีป้าย
 * บอกชัดว่าแถวไหนเป็นช่วงที่เท่าไหร่ของเครื่องเดียวกัน
 */
import { computed, onMounted, ref, watch } from "vue";
import { ChevronDown, ChevronUp, CornerDownRight, Repeat2, Search } from "lucide-vue-next";
import { formatDateTH, formatMonthTH } from "@suth/domain";
import api from "../services/api";
import {
  activeFiscalYear,
  activeFiscalYearRange,
  fiscalYearMonths,
  fiscalYearState,
  loadFiscalYears,
} from "../store/fiscalYear";
import { formatCount } from "../lib/format";
import PeriodPicker from "../components/PeriodPicker.vue";
import {
  UiAlert,
  UiBadge,
  UiButton,
  UiCard,
  UiCombobox,
  UiDataTable,
  UiEmpty,
  UiField,
  UiInput,
  UiPageHeader,
  UiSelect,
} from "../ui";

const loading = ref(false);
const loadError = ref("");

const devices = ref([]);
/** device_id -> { "YYYY-MM": pages } */
const monthlyMap = ref({});
const locationHistory = ref([]);

const buildings = ref([]);
const floors = ref([]);
const divisions = ref([]);
const departments = ref([]);
const brands = ref([]);

const search = ref("");
const reportMonths = ref([]);

const filters = ref({
  building: "",
  floor: "",
  division: "",
  department: "",
  brand: "",
  deviceStatus: "",
  fillStatus: "",
});

const FILL_STATUS_OPTIONS = [
  { value: "", label: "ทั้งหมด" },
  { value: "done", label: "กรอกครบทุกเดือน" },
  { value: "partial", label: "กรอกบางเดือน" },
  { value: "none", label: "ยังไม่ได้กรอกเลย" },
];

const DEVICE_STATUS_OPTIONS = [
  { value: "", label: "ทุกสถานะ" },
  { value: "active", label: "ใช้งานอยู่" },
  { value: "repair", label: "ซ่อมบำรุง" },
  { value: "retired", label: "ปลดระวาง" },
];

const displayYearBE = computed(() => activeFiscalYear.value?.year ?? "—");
const fyMonths = computed(() => fiscalYearMonths(activeFiscalYearRange.value));

/** เดือนที่ใช้สร้างคอลัมน์: เจาะจงไว้ใช้ตามนั้น ไม่ได้เจาะจง = ทั้งปีงบ */
const displayMonths = computed(() =>
  reportMonths.value.length ? [...reportMonths.value].sort() : fyMonths.value
);

/* --------------------------------------------------------------------------
   ตัวเลือกตัวกรอง
   -------------------------------------------------------------------------- */
const toOptions = (list) => list.map((item) => ({ value: item.name, label: item.name }));

const buildingOptions = computed(() => toOptions(buildings.value));
const divisionOptions = computed(() => toOptions(divisions.value));
const brandOptions = computed(() => toOptions(brands.value));

const floorOptions = computed(() => {
  const building = buildings.value.find((b) => b.name === filters.value.building);
  const source = building
    ? floors.value.filter((f) => Number(f.building_id) === Number(building.id))
    : floors.value;

  const seen = new Set();
  return source.filter((f) => !seen.has(f.name) && seen.add(f.name)).map((f) => ({ value: f.name, label: f.name }));
});

const departmentOptions = computed(() => {
  const division = divisions.value.find((d) => d.name === filters.value.division);
  const source = division
    ? departments.value.filter((d) => Number(d.division_id) === Number(division.id))
    : departments.value;
  return toOptions(source);
});

watch(() => filters.value.building, () => (filters.value.floor = ""));
watch(() => filters.value.division, () => (filters.value.department = ""));

const hasActiveFilter = computed(() => search.value !== "" || Object.values(filters.value).some(Boolean));

function resetFilters() {
  search.value = "";
  filters.value = {
    building: "",
    floor: "",
    division: "",
    department: "",
    brand: "",
    deviceStatus: "",
    fillStatus: "",
  };
}

/* --------------------------------------------------------------------------
   โหลดข้อมูล
   -------------------------------------------------------------------------- */
async function loadMasterData() {
  try {
    const [building, floor, division, department, brand] = await Promise.all([
      api.get("/buildings"),
      api.get("/floors"),
      api.get("/divisions"),
      api.get("/departments"),
      api.get("/brands"),
    ]);

    buildings.value = building.data ?? [];
    floors.value = floor.data ?? [];
    divisions.value = division.data ?? [];
    departments.value = department.data ?? [];
    brands.value = brand.data ?? [];
  } catch (err) {
    console.error("Load master data error:", err);
  }
}

async function loadReport() {
  if (!fiscalYearState.activeId || !fyMonths.value.length) {
    devices.value = [];
    monthlyMap.value = {};
    return;
  }

  loading.value = true;
  loadError.value = "";

  try {
    const [deviceRes, monthlyRes, historyRes] = await Promise.all([
      api.get("/devices"),
      // ขอทุกเดือนของปีงบในครั้งเดียว (คั่นด้วย comma) แทนการยิงทีละเดือน 12 รอบ
      api.get("/dashboard/monthly-kpi", { params: { month: fyMonths.value.join(",") } }),
      api.get("/devices/location-history"),
      loadMasterData(),
    ]);

    devices.value = deviceRes.data ?? [];

    // ใช้ pages_printed (ยอดมิเตอร์ดิบ) ไม่ใช่ net_pages เพราะคำถามของหน้านี้คือ
    // "พิมพ์ไปเท่าไหร่" ไม่ใช่ยอดที่เอาไปคิดเงิน
    const map = {};
    for (const row of monthlyRes.data ?? []) {
      if (!map[row.device_id]) map[row.device_id] = {};
      map[row.device_id][row.month] = Number(row.pages_printed || 0);
    }

    monthlyMap.value = map;
    locationHistory.value = historyRes.data ?? [];
  } catch (err) {
    console.error("Load report error:", err);
    loadError.value = "โหลดข้อมูลรายงานไม่สำเร็จ";
    devices.value = [];
    monthlyMap.value = {};
    locationHistory.value = [];
  } finally {
    loading.value = false;
  }
}

/* --------------------------------------------------------------------------
   ช่วงที่ตั้งของแต่ละเครื่อง
   -------------------------------------------------------------------------- */
const devicePeriods = computed(() => {
  const map = {};

  for (const row of locationHistory.value) {
    if (!map[row.device_id]) map[row.device_id] = [];
    map[row.device_id].push(row);
  }

  for (const id in map) {
    map[id].sort(
      (a, b) => String(a.effective_from).localeCompare(String(b.effective_from)) || a.id - b.id
    );
  }

  return map;
});

/** ตัด ISO string ที่ mysql2 ส่งมาให้เหลือแค่ "YYYY-MM" */
function ymOf(value) {
  if (!value) return null;
  return String(value).split("T")[0].slice(0, 7);
}

/** เดือนไหนตกอยู่ในช่วงนี้ — เทียบระดับเดือนล้วน ตรรกะเดียวกับฝั่ง API */
function monthsInPeriod(months, period) {
  const from = ymOf(period.effective_from);
  const to = ymOf(period.effective_to);
  return months.filter((m) => m >= from && (!to || m < to));
}

function formatDateShort(value) {
  return value ? formatDateTH(String(value).split("T")[0]) : "—";
}

function periodRange(period) {
  if (!period.effective_to) return `ตั้งแต่ ${formatDateShort(period.effective_from)} ถึงปัจจุบัน`;
  return `${formatDateShort(period.effective_from)} – ${formatDateShort(period.effective_to)}`;
}

/* --------------------------------------------------------------------------
   สถานะการกรอกและการกรอง
   -------------------------------------------------------------------------- */
function filledCount(deviceId) {
  return Object.keys(monthlyMap.value[deviceId] ?? {}).length;
}

function fillStatusOf(deviceId) {
  const count = filledCount(deviceId);
  if (fyMonths.value.length && count >= fyMonths.value.length) return "done";
  return count > 0 ? "partial" : "none";
}

const filteredDevices = computed(() => {
  const keyword = search.value.trim().toLowerCase();
  const f = filters.value;

  return devices.value.filter((d) => {
    const matchKeyword =
      !keyword ||
      d.serial_number?.toLowerCase().includes(keyword) ||
      d.model?.toLowerCase().includes(keyword) ||
      d.department_name?.toLowerCase().includes(keyword) ||
      d.contract_no?.toLowerCase().includes(keyword);

    return (
      matchKeyword &&
      (!f.building || d.building_name === f.building) &&
      (!f.floor || d.floor_name === f.floor) &&
      (!f.division || d.division_name === f.division) &&
      (!f.department || d.department_name === f.department) &&
      (!f.brand || d.brand_name === f.brand) &&
      (!f.deviceStatus || d.status === f.deviceStatus) &&
      (!f.fillStatus || fillStatusOf(d.id) === f.fillStatus)
    );
  });
});

/* --------------------------------------------------------------------------
   สร้างแถวของตาราง — เครื่องที่ย้ายกลางปีถูกแตกเป็นหลายแถว
   -------------------------------------------------------------------------- */
function singleDeviceRow(device, monthly) {
  return {
    ...device,
    _row_key: String(device.id),
    _monthly: monthly,
    _total: displayMonths.value.reduce((sum, m) => sum + (monthly[m] || 0), 0),
    _period_label: "",
    _is_moved_group: false,
    _period_index: 0,
    _period_count: 1,
  };
}

function devicePeriodRow(device, period, monthly, months, periodIndex, periodCount) {
  const monthSet = new Set(months);
  const periodMonthly = {};
  for (const m of months) periodMonthly[m] = monthly[m] || 0;

  return {
    ...device,
    _row_key: `${device.id}-h${period.id}`,
    // ที่ตั้งของ "ช่วงนี้" ไม่ใช่ที่ตั้งปัจจุบัน แถวของช่วงเก่าจึงแสดงที่เก่าจริงๆ
    building_name: period.building_name,
    floor_name: period.floor_name,
    division_name: period.division_name,
    department_name: period.department_name,
    _monthly: periodMonthly,
    _total: displayMonths.value.reduce(
      (sum, m) => sum + (monthSet.has(m) ? monthly[m] || 0 : 0),
      0
    ),
    _period_label: periodRange(period),
    _is_moved_group: true,
    _period_index: periodIndex,
    _period_count: periodCount,
  };
}

function buildDeviceRows(device) {
  const monthly = monthlyMap.value[device.id] ?? {};
  const periods = devicePeriods.value[device.id] ?? [];

  if (periods.length <= 1) return [singleDeviceRow(device, monthly)];

  const split = periods
    .map((period) => ({ period, months: monthsInPeriod(fyMonths.value, period) }))
    // ช่วงที่ไม่มีเดือนไหนตกอยู่ในปีงบนี้เลย ไม่ต้องแสดงเป็นแถวเปล่า
    .filter(({ months }) => months.length);

  const rows = split.map(({ period, months }, index) =>
    devicePeriodRow(device, period, monthly, months, index + 1, split.length)
  );

  // กันเครื่องหายจากรายงาน เผื่อทุกช่วงอยู่นอกปีงบนี้ทั้งหมด
  return rows.length ? rows : [singleDeviceRow(device, monthly)];
}

const reportRows = computed(() => filteredDevices.value.flatMap(buildDeviceRows));

const expandedDeviceIds = ref(new Set());

function toggleHistory(deviceId) {
  const next = new Set(expandedDeviceIds.value);
  next.has(deviceId) ? next.delete(deviceId) : next.add(deviceId);
  expandedDeviceIds.value = next;
}

/** ไฮไลต์แถวที่มาจากเครื่องเดียวกัน เพื่อไม่ให้อ่านเป็นคนละเครื่อง */
function rowClass(row) {
  if (!row._is_moved_group) return "";
  return row._period_index === 1
    ? "bg-brand-soft/40 border-t-2 border-t-brand-line"
    : "bg-brand-soft/40";
}

const columns = computed(() => [
  { key: "serial_number", label: "Serial", width: "13rem" },
  {
    key: "brand_model",
    label: "ยี่ห้อ / รุ่น",
    value: (r) => `${r.brand_name || ""} ${r.model || ""}`.trim() || "—",
  },
  {
    key: "building_floor",
    label: "อาคาร / ชั้น",
    value: (r) => (r.floor_name ? `${r.building_name || "—"} / ${r.floor_name}` : r.building_name || "—"),
  },
  {
    key: "division_department",
    label: "ฝ่าย / แผนก",
    value: (r) =>
      r.division_name ? `${r.division_name} / ${r.department_name || "—"}` : r.department_name || "—",
  },
  {
    key: "period_label",
    label: "ช่วงที่ตั้ง",
    value: (r) => r._period_label || "—",
  },
  ...displayMonths.value.map((m) => ({
    key: `m_${m}`,
    label: formatMonthTH(m, { shortYear: true }),
    align: "right",
    value: (r) => r._monthly[m] || 0,
    csv: (r) => r._monthly[m] || 0,
  })),
  {
    key: "total_pages",
    label: reportMonths.value.length ? "รวมเดือนที่เลือก" : "รวมทั้งปีงบ",
    align: "right",
    value: (r) => r._total,
    csv: (r) => r._total,
  },
]);

/**
 * เปลี่ยนปีงบหลังจากเปิดหน้าแล้ว -> โหลดใหม่
 *
 * การโหลดครั้งแรกไม่พึ่ง watcher (ไม่ใช้ immediate) เพราะเคยเจอว่าตอนรีเฟรชหน้านี้
 * ตรงๆ จังหวะที่ activeId ถูกเซ็ตกับตอนที่ watcher ถูกติดตั้งไม่ตรงกัน ทำให้ตาราง
 * ค้างว่างทั้งที่เลือกปีงบไว้ถูกแล้ว — onMounted จึง await ปีงบให้เสร็จก่อนแล้วสั่งเอง
 */
watch(() => fiscalYearState.activeId, (id) => id && loadReport());

onMounted(async () => {
  await loadFiscalYears();
  if (fiscalYearState.activeId) loadReport();
});
</script>

<template>
  <div>
    <UiPageHeader
      eyebrow="รายงาน"
      title="ยอดพิมพ์รายเดือนตามเครื่อง"
      :description="`ยอดมิเตอร์ดิบของแต่ละเครื่องในปีงบ ${displayYearBE} — เครื่องที่ย้ายที่ตั้งกลางปีจะถูกแยกเป็นคนละแถวตามช่วงที่ตั้ง`"
    />

    <UiCard class="mb-4" title="ตัวกรองรายงาน" data-print="hide">
      <template #actions>
        <UiButton v-if="hasActiveFilter" size="sm" variant="ghost" @click="resetFilters">
          ล้างตัวกรองทั้งหมด
        </UiButton>
      </template>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <UiField label="เดือนที่แสดงในตาราง" hint="ไม่เลือก = แสดงครบทั้งปีงบ">
          <PeriodPicker v-model="reportMonths" :options="fyMonths" />
        </UiField>

        <UiField label="ค้นหา" class="lg:col-span-2">
          <UiInput v-model="search" clearable placeholder="Serial, รุ่น, แผนก หรือเลขที่สัญญา…">
            <template #icon><Search :size="15" /></template>
          </UiInput>
        </UiField>
      </div>

      <div class="grid grid-cols-2 lg:grid-cols-3 gap-3 mt-4 pt-4 border-t border-line-soft">
        <UiField :label="`สถานะการกรอก (ปีงบ ${displayYearBE})`">
          <UiSelect
            v-model="filters.fillStatus"
            :options="FILL_STATUS_OPTIONS"
            value-key="value"
            label-key="label"
          />
        </UiField>

        <UiField label="สถานะเครื่อง">
          <UiSelect
            v-model="filters.deviceStatus"
            :options="DEVICE_STATUS_OPTIONS"
            value-key="value"
            label-key="label"
          />
        </UiField>

        <UiField label="ยี่ห้อ">
          <UiCombobox v-model="filters.brand" :options="brandOptions" placeholder="ทุกยี่ห้อ" any-label="ทุกยี่ห้อ" />
        </UiField>

        <UiField label="อาคาร">
          <UiCombobox v-model="filters.building" :options="buildingOptions" placeholder="ทุกอาคาร" any-label="ทุกอาคาร" />
        </UiField>

        <UiField label="ชั้น">
          <UiCombobox v-model="filters.floor" :options="floorOptions" placeholder="ทุกชั้น" any-label="ทุกชั้น" />
        </UiField>

        <UiField label="ฝ่าย">
          <UiCombobox v-model="filters.division" :options="divisionOptions" placeholder="ทุกฝ่าย" any-label="ทุกฝ่าย" />
        </UiField>

        <UiField label="แผนก" class="lg:col-span-1">
          <UiCombobox
            v-model="filters.department"
            :options="departmentOptions"
            placeholder="ทุกแผนก"
            any-label="ทุกแผนก"
          />
        </UiField>
      </div>
    </UiCard>

    <UiCard v-if="!fiscalYearState.activeId">
      <UiEmpty
        title="ยังไม่ได้เลือกปีงบประมาณ"
        description="เลือกปีงบจากแถบด้านบน รายงานจะสร้างคอลัมน์เดือนให้ตามปีงบนั้น"
      />
    </UiCard>

    <template v-else>
      <UiAlert v-if="loadError" tone="danger" class="mb-4">
        {{ loadError }}
        <template #actions>
          <UiButton size="sm" variant="secondary" @click="loadReport">ลองใหม่</UiButton>
        </template>
      </UiAlert>

      <UiDataTable
        :rows="reportRows"
        :columns="columns"
        :loading="loading"
        row-key="_row_key"
        export-filename="report-print-by-device"
        search-placeholder="ค้นหาในตาราง…"
        empty-text="ไม่มีเครื่องที่ตรงกับตัวกรอง"
        max-height="68vh"
        sticky-first
        :row-class="rowClass"
      >
        <template #cell-serial_number="{ row }">
          <span class="inline-flex items-center gap-1.5">
            <CornerDownRight
              v-if="row._is_moved_group && row._period_index > 1"
              :size="13"
              class="shrink-0 text-brand-ink opacity-60"
              aria-hidden="true"
            />
            <span class="font-mono text-sm text-ink">{{ row.serial_number }}</span>

            <UiBadge
              v-if="row._is_moved_group"
              tone="brand"
              size="sm"
              :title="`เครื่องนี้ย้ายที่ตั้งระหว่างปีงบ จึงถูกแยกเป็น ${row._period_count} แถว`"
            >
              <Repeat2 :size="11" aria-hidden="true" />
              ช่วงที่ {{ row._period_index }}/{{ row._period_count }}
            </UiBadge>
          </span>
        </template>

        <template #cell-period_label="{ row }">
          <span v-if="!row._is_moved_group" class="text-ink-mute">—</span>

          <span v-else class="inline-flex items-center gap-2">
            <span class="text-xs text-ink-soft">{{ row._period_label }}</span>
            <button
              type="button"
              class="inline-flex items-center gap-0.5 text-2xs text-brand-ink hover:underline whitespace-nowrap"
              @click="toggleHistory(row.id)"
            >
              {{ expandedDeviceIds.has(row.id) ? "ซ่อน" : "ดูประวัติ" }}
              <component
                :is="expandedDeviceIds.has(row.id) ? ChevronUp : ChevronDown"
                :size="11"
                aria-hidden="true"
              />
            </button>
          </span>
        </template>

        <template #cell-total_pages="{ value }">
          <span class="font-semibold text-ink">{{ formatCount(value) }}</span>
        </template>
      </UiDataTable>

      <!-- ประวัติการย้ายเต็มของเครื่องที่กดดู — อยู่ในหน้าเดียวกัน ไม่ต้องเปิดหน้าต่างซ้อน
           เพียงเพื่อจะรู้ว่าทำไมเครื่องนี้ถึงมีหลายแถว -->
      <UiCard
        v-for="deviceId in [...expandedDeviceIds]"
        :key="`history-${deviceId}`"
        class="mt-3"
        eyebrow="ประวัติการย้าย"
        :title="devices.find((d) => d.id === deviceId)?.serial_number ?? ''"
      >
        <template #actions>
          <UiButton size="sm" variant="ghost" @click="toggleHistory(deviceId)">ปิด</UiButton>
        </template>

        <ol class="flex flex-col gap-2 list-none">
          <li
            v-for="period in devicePeriods[deviceId] ?? []"
            :key="period.id"
            class="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm"
          >
            <span class="text-xs text-ink-mute whitespace-nowrap numeral">{{ periodRange(period) }}</span>
            <span class="text-ink-soft">
              {{ period.division_name || "ไม่ระบุฝ่าย" }} / {{ period.department_name || "ไม่ระบุแผนก" }}
            </span>
            <span class="text-xs text-ink-mute">
              {{ period.building_name || "—" }}{{ period.floor_name ? ` · ${period.floor_name}` : "" }}
            </span>
          </li>
        </ol>
      </UiCard>
    </template>
  </div>
</template>
