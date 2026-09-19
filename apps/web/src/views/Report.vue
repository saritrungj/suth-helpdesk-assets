<script setup>
import { useReferenceQuery } from "../composables/use-reference-query";
import { usePageState } from "../composables/use-page-state";
import { useReferenceFilters } from "../composables/use-reference-filters";
import { reportContext } from "../components/report-context";
import { yearLabel } from "../lib/locale-format";
import { formatDate, formatMonth } from "../lib/locale-format";

import { t } from "../lib/locale";

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
 * บอกชัดว่าแถวไหนเป็นช่วงที่เท่าไหร่ของเครื่องเดียวกัน — กฎการแบ่งแถวอยู่ที่
 * components/report-rows.js
 */
import { computed, onMounted, ref, watch } from "vue";
import { ChevronDown, ChevronUp, CornerDownRight, Repeat2, Search } from "lucide-vue-next";

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
import { deviceReportRows, periodsByDevice, readingsByDevice } from "../components/report-rows";
import {
  UiAlert,
  UiBadge,
  UiButton,
  UiCard,
  UiFilterBar,
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
/** device_id -> { "YYYY-MM": { pages, locationHistoryId } } */
const readings = ref({});
const locationHistory = ref([]);

const referenceError = ref("");
const referencesReady = ref(false);
const buildings = ref([]);
const floors = ref([]);
const divisions = ref([]);
const departments = ref([]);
const brands = ref([]);
const contracts = ref([]);

const search = ref("");
const reportMonths = ref([]);

const filters = ref({
  building: "",
  floor: "",
  division: "",
  department: "",
  brand: "",
  contract: "",
  deviceStatus: "",
  fillStatus: "",
});

/**
 * ตัวกรองนี้บอกแค่ว่ามียอดบันทึกไว้ในเดือนที่แสดงของแถวนั้นหรือไม่ (#104)
 *
 * ไม่ใช่ความครบถ้วนตามหน้าที่ — หน้านี้ไม่รู้ว่าเครื่องต้องรับผิดชอบเดือนไหน
 * (ADR-0018) เดิมป้าย "กรอกครบทุกเดือน" ทำให้เครื่องที่รับผิดชอบหกเดือนและกรอก
 * ครบหกเดือนดูเหมือนงานค้าง งานค้างจริงอยู่ที่การแจ้งเตือน
 */
const FILL_STATUS_LABEL = t("ยอดในเดือนที่แสดง");
const FILL_STATUS_OPTIONS = [
  { value: "", label: t("ทั้งหมด") },
  { value: "done", label: t("มียอดครบทุกเดือน") },
  { value: "partial", label: t("ขาดยอดบางเดือน") },
  { value: "none", label: t("ยังไม่มียอด") },
];

const DEVICE_STATUS_OPTIONS = [
  { value: "", label: t("ทุกสถานะ") },
  { value: "active", label: t("ใช้งานอยู่") },
  { value: "repair", label: t("ซ่อมบำรุง") },
  { value: "retired", label: t("ปลดระวาง") },
];

const displayYearBE = computed(() => yearLabel(activeFiscalYear.value?.year));
const fyMonths = computed(() => fiscalYearMonths(activeFiscalYearRange.value));

/** เดือนที่ใช้สร้างคอลัมน์: เจาะจงไว้ใช้ตามนั้น ไม่ได้เจาะจง = ทั้งปีงบ */
const displayMonths = computed(() =>
  reportMonths.value.length ? [...reportMonths.value].sort() : fyMonths.value
);

/* --------------------------------------------------------------------------
   ตัวเลือกตัวกรอง
   -------------------------------------------------------------------------- */
const { buildingOptions, floorOptions, divisionOptions, departmentOptions, brandOptions, referenceLabel, normalizeReferences } =
  useReferenceFilters(filters, { buildings, floors, divisions, departments, brands });
const referenceNotice = useReferenceQuery(filters, referencesReady, normalizeReferences);

const contractOptions = computed(() =>
  contracts.value.map((contract) => ({ value: String(contract.id), label: contract.contract_no }))
);

const hasActiveFilter = computed(() => search.value !== "" || Object.values(filters.value).some(Boolean));

/**
 * ป้ายตัวกรองที่ใช้อยู่ ส่งให้ UiFilterBar
 *
 * ตัดเดือนกับสถานะการกรอกออก เพราะสองอันนั้นอยู่ในแถบหลักที่เห็นตลอดอยู่แล้ว
 * การมีป้ายซ้ำอีกทำให้มีสองที่ที่เอาตัวกรองเดียวกันออกได้ (เหตุผลเดียวกับหน้าทะเบียน)
 */
const CHIP_LABELS = {
  building: t("อาคาร"),
  floor: t("ชั้น"),
  division: t("ฝ่าย"),
  department: t("แผนก"),
  brand: t("ยี่ห้อ"),
  contract: t("สัญญา"),
  deviceStatus: t("สถานะเครื่อง"),
};

const chipValue = (key, value) => {
  if (key === "contract") return contractOptions.value.find((o) => o.value === value)?.label ?? value;
  if (key === "deviceStatus") return DEVICE_STATUS_OPTIONS.find((o) => o.value === value)?.label ?? value;
  return referenceLabel(key, value);
};

const filterChips = computed(() =>
  Object.entries(filters.value)
    .filter(([key, value]) => value && CHIP_LABELS[key])
    .map(([key, value]) => ({ key, label: `${CHIP_LABELS[key]}: ${chipValue(key, value)}` }))
);

/** ตัวกรองในไฟล์ Excel ใช้ป้ายและค่าเดียวกับบนจอ ไม่ใช่รหัสภายในอย่าง "done" หรือ id สัญญา */
const EXPORT_FILTER_LABELS = { ...CHIP_LABELS, fillStatus: FILL_STATUS_LABEL };

const exportFilters = computed(() =>
  Object.fromEntries(
    Object.entries(filters.value)
      .filter(([, value]) => value)
      .map(([key, value]) => [
        key,
        key === "fillStatus"
          ? FILL_STATUS_OPTIONS.find((o) => o.value === value)?.label ?? value
          : chipValue(key, value),
      ])
  )
);

function clearFilter(key) {
  filters.value[key] = "";
}

function resetFilters() {
  search.value = "";
  filters.value = {
    building: "",
    floor: "",
    division: "",
    department: "",
    brand: "",
    contract: "",
    deviceStatus: "",
    fillStatus: "",
  };
}

/* --------------------------------------------------------------------------
   โหลดข้อมูล
   -------------------------------------------------------------------------- */
async function loadMasterData() {
  referenceError.value = "";
  try {
    const [building, floor, division, department, brand, contract] = await Promise.all([
      api.get("/buildings"),
      api.get("/floors"),
      api.get("/divisions"),
      api.get("/departments"),
      api.get("/brands"),
      api.get("/contracts"),
    ]);

    buildings.value = building.data ?? [];
    floors.value = floor.data ?? [];
    divisions.value = division.data ?? [];
    departments.value = department.data ?? [];
    brands.value = brand.data ?? [];
    contracts.value = contract.data ?? [];
    referencesReady.value = true;
  } catch (err) {
    referenceError.value = t("โหลดข้อมูลอ้างอิงไม่สำเร็จ");
  }
}

/**
 * เลขของคำขอล่าสุด — สลับปีงบเร็วๆ แล้วคำตอบของปีก่อนมาถึงทีหลัง ต้องไม่ทับข้อมูล
 * ของปีที่เลือกอยู่ (#104) คำตอบที่ไม่ใช่ของคำขอล่าสุดถูกทิ้งทั้งหมด รวมถึง error
 */
let latestLoad = 0;

async function loadReport() {
  const request = ++latestLoad;

  if (!fiscalYearState.activeId || !fyMonths.value.length) {
    devices.value = [];
    readings.value = {};
    loading.value = false;
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
    if (request !== latestLoad) return;

    devices.value = deviceRes.data ?? [];
    readings.value = readingsByDevice(monthlyRes.data);
    locationHistory.value = historyRes.data ?? [];
  } catch (err) {
    if (request !== latestLoad) return;
    console.error("Load report error:", err);
    loadError.value = t("โหลดข้อมูลรายงานไม่สำเร็จ");
    devices.value = [];
    readings.value = {};
    locationHistory.value = [];
  } finally {
    if (request === latestLoad) loading.value = false;
  }
}

/* --------------------------------------------------------------------------
   ช่วงที่ตั้งของแต่ละเครื่อง
   -------------------------------------------------------------------------- */
/** ประวัติของแต่ละเครื่องเรียงตามเวลา — ใช้ทั้งแบ่งแถวและแสดงในแผงประวัติการย้าย */
const devicePeriods = computed(() => {
  const map = periodsByDevice(locationHistory.value);
  for (const id in map) {
    map[id].sort(
      (a, b) => String(a.effective_from).localeCompare(String(b.effective_from)) || a.id - b.id
    );
  }
  return map;
});

function formatDateShort(value) {
  return value ? formatDate(String(value).split("T")[0]) : "—";
}

function periodRange(period) {
  if (!period.effective_to) return t("ตั้งแต่ {0} ถึงปัจจุบัน", [formatDateShort(period.effective_from)]);
  return `${formatDateShort(period.effective_from)} – ${formatDateShort(period.effective_to)}`;
}

/**
 * ป้ายของแถวเป็นช่วง "เดือน" ที่ยอดเป็นของที่ตั้งนั้น ไม่ใช่วันที่ย้าย
 *
 * เครื่องที่ย้ายวันที่ 20 ม.ค. — ยอด ม.ค. ทั้งเดือนเป็นของที่ใหม่ ป้ายแบบวันที่
 * "1 ต.ค. – 20 ม.ค." ทำให้อ่านว่า ม.ค. ครึ่งหนึ่งอยู่ที่เก่า วันที่ย้ายจริงยังดูได้
 * จากปุ่ม "ดูประวัติ"
 */
function runLabel(months) {
  const first = formatMonth(months[0], { shortYear: true });
  const last = formatMonth(months[months.length - 1], { shortYear: true });
  return months.length === 1 ? first : `${first} – ${last}`;
}

/* --------------------------------------------------------------------------
   สร้างแถวแล้วกรอง — ตัวกรองที่ตั้งและหน่วยงานใช้ที่ตั้งของแถว (ของเดือนนั้น)
   ส่วนยี่ห้อ สัญญา และสถานะเครื่องเป็นคุณสมบัติของเครื่องวันนี้ ซึ่งแถวไม่ได้แทนที่
   -------------------------------------------------------------------------- */
const allRows = computed(() =>
  devices.value.flatMap((device) =>
    deviceReportRows({
      device,
      periods: devicePeriods.value[device.id],
      readings: readings.value[device.id],
      fyMonths: fyMonths.value,
      displayMonths: displayMonths.value,
      runLabel,
    })
  )
);

const reportRows = computed(() => {
  const keyword = search.value.trim().toLowerCase();
  const f = filters.value;

  return allRows.value.filter(
    (r) =>
      (!keyword ||
        r.serial_number?.toLowerCase().includes(keyword) ||
        r.model?.toLowerCase().includes(keyword) ||
        r.department_name?.toLowerCase().includes(keyword) ||
        r.contract_no?.toLowerCase().includes(keyword)) &&
      (!f.building || String(r.building_id) === f.building) &&
      (!f.floor || String(r.floor_id) === f.floor) &&
      (!f.division || String(r.division_id) === f.division) &&
      (!f.department || String(r.department_id) === f.department) &&
      (!f.brand || String(r.brand_id) === f.brand) &&
      (!f.contract || String(r.contract_id) === f.contract) &&
      (!f.deviceStatus || r.status === f.deviceStatus) &&
      (!f.fillStatus || r._record_status === f.fillStatus)
  );
});

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
    label: t("ยี่ห้อ / รุ่น"),
    value: (r) => `${r.brand_name || ""} ${r.model || ""}`.trim() || "—",
  },
  {
    key: "building_floor",
    label: t("อาคาร / ชั้น"),
    value: (r) => (r.floor_name ? `${r.building_name || "—"} / ${r.floor_name} / ${r.location || t("ไม่ระบุ")}` : [r.building_name, r.location].filter(Boolean).join(" / ") || t("ไม่ระบุ")),
  },
  {
    key: "division_department",
    label: t("ฝ่าย / แผนก"),
    value: (r) =>
      r.division_name ? `${r.division_name} / ${r.department_name || "—"}` : r.department_name || "—",
  },
  {
    key: "period_label",
    label: t("ช่วงที่ตั้ง"),
    value: (r) => r._period_label || "—",
  },
  ...displayMonths.value.map((m) => ({
    key: `m_${m}`,
    label: formatMonth(m, { shortYear: true }),
    align: "right",
    // เดือนที่ไม่มียอด (ยังไม่กรอก หรือเครื่องไม่ได้อยู่ที่นี่ในเดือนนั้น) แสดง "—"
    // ไม่ใช่ "0" ซึ่งอ่านได้ว่าพิมพ์ศูนย์หน้าจริง และมีตัวคั่นหลักเหมือนตารางอื่นทุกหน้า
    // ไฟล์ Excel เป็นช่องว่างเหมือนกัน — 0 ในไฟล์ต้องเป็นศูนย์ที่บันทึกจริงเท่านั้น
    value: (r) => (r._monthly[m] == null ? "—" : formatCount(r._monthly[m])),
    csv: (r) => r._monthly[m] ?? null,
    sortValue: (r) => r._monthly[m] ?? -1,
  })),
  {
    key: "total_pages",
    label: reportMonths.value.length ? t("รวมเดือนที่เลือก") : t("รวมทั้งปีงบ"),
    align: "right",
    value: (r) => (r._total == null ? "—" : formatCount(r._total)),
    sortValue: (r) => r._total ?? -1,
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

// คำค้น ตัวกรอง และแถวที่กางไว้ ยังอยู่เมื่อกลับมาหน้านี้ — ตัวกรองอ้างอิงใน URL ยังชนะเมื่อเปิดจากลิงก์ (#115)
usePageState({ search, filters, expandedDeviceIds });

onMounted(async () => {
  await loadFiscalYears();
  if (fiscalYearState.activeId) loadReport();
});
</script>

<template>
  <div>
    <UiPageHeader
      :title="t(&quot;รายงานสรุปยอดพิมพ์&quot;)"
      :description="t(&quot;ยอดมิเตอร์ดิบของแต่ละเครื่องในปีงบ {0} — เครื่องที่ย้ายที่ตั้งกลางปีจะถูกแยกเป็นคนละแถวตามช่วงที่ตั้ง&quot;, [displayYearBE])"
    />

    <!--
      ตัวกรองเป็นแถวเดียว ไม่ใช่การ์ดก้อนใหญ่ (#90)

      เดิมหน้านี้ใช้การ์ด "ตัวกรองรายงาน" สูงราว 420px ใส่ dropdown แปดตัวที่
      ส่วนใหญ่เป็น "ทุก..." ก่อนจะถึงตารางซึ่งเป็นเนื้อหาจริงของหน้า เหลือที่ให้
      ข้อมูลจริงเหนือเส้นพับแค่สี่แถว ขณะที่หน้าทะเบียนและหน้าบันทึกยอดซึ่งทำงาน
      แบบเดียวกันใช้แถบเดียวสูง ~56px แล้วเห็นแปดถึงเก้าแถว

      ระบบเดียวจึงมีสองแบบแผน คนที่เรียนแถบเดียวจากสามหน้าแรกต้องเรียนใหม่ที่นี่
      ตอนนี้ใช้ UiFilterBar ตัวเดียวกับหน้าทะเบียน และเครื่องมือตารางมาต่อท้ายแถว
    -->
    <UiAlert v-if="referenceError" tone="danger" class="mb-4">
      {{ t("โหลดข้อมูลอ้างอิงไม่สำเร็จ") }}
      <template #actions>
        <UiButton size="sm" variant="secondary" @click="loadMasterData()">{{ t("ลองใหม่") }}</UiButton>
      </template>
    </UiAlert>

    <UiAlert v-if="referenceNotice" tone="warn" class="mb-4">{{ referenceNotice }}</UiAlert>

    <UiFilterBar :chips="filterChips" data-print="hide" @remove="clearFilter" @clear="resetFilters">
      <template #primary>
        <UiField :label="t('ค้นหา')" class="flex-1 min-w-[14rem] max-w-md">
          <UiInput
            v-model="search"
            clearable
            :aria-label="t('ค้นหา Serial, รุ่น, แผนก หรือเลขที่สัญญา…')"
            :placeholder="t('ค้นหา Serial, รุ่น, แผนก หรือเลขที่สัญญา…')"
          >
            <template #icon><Search :size="15" /></template>
          </UiInput>
        </UiField>

        <!-- จำกัดความกว้าง ไม่งั้นตัวเลือกช่วงเวลายืดเต็มแถวแล้วดันตัวอื่นตกบรรทัด -->
        <UiField :label="t('เดือนที่แสดงในตาราง')" class="w-full sm:w-64">
          <PeriodPicker v-model="reportMonths" :options="fyMonths" />
        </UiField>

        <UiField :label="FILL_STATUS_LABEL" class="w-full sm:w-52">
          <UiSelect
            v-model="filters.fillStatus"
            :options="FILL_STATUS_OPTIONS"
            value-key="value"
            label-key="label"
            :aria-label="t('กรองตามยอดในเดือนที่แสดง')"
          />

        </UiField>
        <div id="report-table-tools" class="ml-auto"></div>
      </template>

      <UiField :label="t(&quot;สถานะเครื่อง&quot;)">
        <UiSelect v-model="filters.deviceStatus" :options="DEVICE_STATUS_OPTIONS" value-key="value" label-key="label" />
      </UiField>

      <UiField :label="t(&quot;ยี่ห้อ&quot;)">
        <UiCombobox v-model="filters.brand" :options="brandOptions" :placeholder="t(&quot;ทุกยี่ห้อ&quot;)" :any-label="t(&quot;ทุกยี่ห้อ&quot;)" />
      </UiField>

      <UiField :label="t(&quot;สัญญา&quot;)">
        <UiCombobox v-model="filters.contract" :options="contractOptions" :placeholder="t(&quot;ทุกสัญญา&quot;)" :any-label="t(&quot;ทุกสัญญา&quot;)" />
      </UiField>

      <UiField :label="t(&quot;อาคาร&quot;)">
        <UiCombobox v-model="filters.building" :options="buildingOptions" :placeholder="t(&quot;ทุกอาคาร&quot;)" :any-label="t(&quot;ทุกอาคาร&quot;)" />
      </UiField>

      <UiField :label="t(&quot;ชั้น&quot;)">
        <UiCombobox v-model="filters.floor" :options="floorOptions" :placeholder="t(&quot;ทุกชั้น&quot;)" :any-label="t(&quot;ทุกชั้น&quot;)" />
      </UiField>

      <UiField :label="t(&quot;ฝ่าย&quot;)">
        <UiCombobox v-model="filters.division" :options="divisionOptions" :placeholder="t(&quot;ทุกฝ่าย&quot;)" :any-label="t(&quot;ทุกฝ่าย&quot;)" />
      </UiField>

      <UiField :label="t(&quot;แผนก&quot;)">
        <UiCombobox v-model="filters.department" :options="departmentOptions" :placeholder="t(&quot;ทุกแผนก&quot;)" :any-label="t(&quot;ทุกแผนก&quot;)" />
      </UiField>
    </UiFilterBar>

    <UiCard v-if="!fiscalYearState.activeId">
      <UiEmpty
        :title="t(&quot;ยังไม่ได้เลือกปีงบประมาณ&quot;)"
        :description="t(&quot;เลือกปีงบจากแถบด้านบน รายงานจะสร้างคอลัมน์เดือนให้ตามปีงบนั้น&quot;)"
      />
    </UiCard>

    <template v-else>
      <UiAlert v-if="loadError" tone="danger" class="mb-4">
        {{ loadError }}
        <template #actions>
          <UiButton size="sm" variant="secondary" @click="loadReport"> {{ t("ลองใหม่") }} </UiButton>
        </template>
      </UiAlert>

      <UiDataTable
        tools-target="#report-table-tools"
        v-model:search-value="search"
        :searchable="false"
        :rows="reportRows"
        :columns="columns"
        :loading="loading"
        row-key="_row_key"
        export-filename="report-print-by-device"
        :export-context="reportContext({ months: displayMonths, filters: exportFilters, labels: EXPORT_FILTER_LABELS })"
        :search-placeholder="t(&quot;ค้นหาในตาราง…&quot;)"
        :caption="t(&quot;ยอดพิมพ์รายเดือนตามเครื่อง&quot;)"
        :empty-text="t(&quot;ไม่มีเครื่องที่ตรงกับตัวกรอง&quot;)"
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
            <RouterLink
              :to="`/assets/${row.id}`"
              class="inline-flex min-h-6 items-center font-mono text-sm text-ink hover:text-brand-ink hover:underline"
            >
              {{ row.serial_number }}
            </RouterLink>

            <UiBadge
              v-if="row._is_moved_group"
              tone="brand"
              size="sm"
              :title="t(&quot;เครื่องนี้ย้ายที่ตั้งระหว่างปีงบ จึงถูกแยกเป็น {0} แถว&quot;, [row._period_count])"
            >
              <Repeat2 :size="11" aria-hidden="true" /> {{ t("ช่วงที่") }} {{ row._period_index }}/{{ row._period_count }}
            </UiBadge>
          </span>
        </template>

        <template #cell-period_label="{ row }">
          <span v-if="!row._is_moved_group" class="text-ink-mute">—</span>

          <span v-else class="inline-flex items-center gap-2">
            <span class="text-xs text-ink-soft">{{ row._period_label }}</span>
            <button
              type="button"
              class="inline-flex min-h-6 items-center gap-0.5 text-2xs text-brand-ink hover:underline whitespace-nowrap"
              @click="toggleHistory(row.id)"
            >
              {{ expandedDeviceIds.has(row.id) ? t("ซ่อน") : t("ดูประวัติ") }}
              <component
                :is="expandedDeviceIds.has(row.id) ? ChevronUp : ChevronDown"
                :size="11"
                aria-hidden="true"
              />
            </button>
          </span>
        </template>

        <template #cell-total_pages="{ value }">
          <span class="font-semibold text-ink">{{ value }}</span>
        </template>
      </UiDataTable>

      <!-- ประวัติการย้ายเต็มของเครื่องที่กดดู — อยู่ในหน้าเดียวกัน ไม่ต้องเปิดหน้าต่างซ้อน
           เพียงเพื่อจะรู้ว่าทำไมเครื่องนี้ถึงมีหลายแถว -->
      <UiCard
        v-for="deviceId in [...expandedDeviceIds]"
        :key="`history-${deviceId}`"
        class="mt-3"
        :eyebrow="t(&quot;ประวัติการย้าย&quot;)"
        :title="devices.find((d) => d.id === deviceId)?.serial_number ?? ''"
      >
        <template #actions>
          <UiButton size="sm" variant="ghost" @click="toggleHistory(deviceId)"> {{ t("ปิด") }} </UiButton>
        </template>

        <ol class="flex flex-col gap-2 list-none">
          <li
            v-for="period in devicePeriods[deviceId] ?? []"
            :key="period.id"
            class="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm"
          >
            <span class="text-xs text-ink-mute whitespace-nowrap numeral">{{ periodRange(period) }}</span>
            <span class="text-ink-soft">
              {{ period.division_name || t("ไม่ระบุฝ่าย") }} / {{ period.department_name || t("ไม่ระบุแผนก") }}
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
