<script setup>
import { reportContext } from "../components/report-context";
import { usePageState } from "../composables/use-page-state";
import { deviceLocationLabel } from "../lib/device-location";
import { formatMonth } from "../lib/locale-format";

import { t } from "../lib/locale";

/**
 * ByDepartment — ค่าใช้จ่ายและยอดพิมพ์แยกตามฝ่าย/แผนก
 *
 * ใช้ตอนทำเรื่องเบิกภายใน: เงินก้อนเดียวกับหน้า "ตามสัญญา" แต่มองจากมุมของ
 * หน่วยงานที่ใช้ กางจากฝ่าย -> แผนก -> เครื่อง -> ยอดรายเดือน
 *
 * หน้านี้มีสองส่วนที่ตอบคนละคำถาม จึงแยกกันชัดเจนด้วยการ์ด
 *
 *   1. ต้นไม้รายละเอียด ไล่ดูตัวเลขจนถึงระดับเครื่องและเดือน
 *   2. อันดับรายเครื่อง เครื่องไหนใช้หนักที่สุด/เบาที่สุด พร้อมตัวกรองของตัวเอง
 *
 * การเปรียบเทียบฝ่าย/แผนก (กราฟและส่วนต่าง) อยู่ที่หน้าภาพรวมและหน้าเปรียบเทียบ ซึ่งใช้
 * ตรรกะชุดเดียวกันใน components/comparison.js (#103) ส่วนอันดับแผนกมาก–น้อยอยู่ในไฟล์
 * Excel ของหน้านี้ (แผ่น "อันดับ") ไม่ได้อยู่บนหน้าจอ (#115)
 *
 * ยอดรวมด้านบนอ้างอิง "ทั้งปีงบ" เสมอ ไม่ขึ้นกับช่วงที่เลือกเปรียบเทียบ —
 * ตั้งใจให้เป็นเลขนิ่งที่เอาไปอ้างอิงได้ตลอด และเขียนกำกับไว้ในการ์ด
 *
 * ป้ายแนวโน้มของแต่ละแผนกใช้สีคู่กับไอคอนและข้อความเสมอ เพราะ "เพิ่มขึ้น" ใน
 * บริบทค่าใช้จ่ายคือเรื่องไม่ดี ซึ่งตรงข้ามกับสัญชาตญาณของสีเขียว/แดงทั่วไป
 */
import { computed, onActivated, onMounted, ref, watch } from "vue";
import { createWorkbook, downloadWorkbook, reportStamp } from "../lib/export-xlsx";
import { departmentRankingSheet } from "../components/comparison-export";
import { useExportTask } from "../composables/useExportTask";
import {
  Building2,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  CircleHelp,
  Download,
  FolderTree,
  Minus,
  Printer,
  Search,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-vue-next";
import { fromSatang, sumSatang, toSatang } from "@suth/domain";
import api from "../services/api";
import { fiscalYearState } from "../store/fiscalYear";
import { formatBahtValue, formatCount } from "../lib/format";
import PeriodPicker from "../components/PeriodPicker.vue";
import DeviceSerialLink from "../components/DeviceSerialLink.vue";
import {
  UiAlert,
  UiBadge,
  UiButton,
  UiFilterBar,
  UiCard,
  UiCombobox,
  UiDataTable,
  UiEmpty,
  UiField,
  UiInput,
  UiSelect,
  UiSkeleton,
  UiStat,
  UiTooltip,
} from "../ui";

/** บวกเงินในหน่วยสตางค์ที่เป็นจำนวนเต็มเสมอ ไม่บวกทศนิยมของบาท */
function sumCost(rows) {
  return fromSatang(sumSatang((rows ?? []).map((r) => r.total_cost_satang ?? toSatang(r.total_cost))));
}

/* --------------------------------------------------------------------------
   สถานะหลัก
   -------------------------------------------------------------------------- */
const loading = ref(false);
const loadError = ref("");
let loaded = false;
let requestId = 0;
let loadedContext = "";

const divisions = ref([]);
const unassignedDevices = ref([]);

/**
 * ยอดพิมพ์ที่ยังหาราคาที่มีผลไม่ได้ในขอบเขตนี้ (ADR-0019 Q27)
 *
 * มาจาก API เพราะฝั่งนี้มีแต่ยอดที่รวมแล้ว — ค่าใช้จ่ายที่เป็น NULL ถูกแปลงเป็น
 * 0 ไปตั้งแต่ตอนรวมยอดแล้ว จำนวนที่ยังไม่รู้ราคาจึงมองไม่เห็นจากตัวเลขที่ได้มา
 */
const unpricedReadings = ref(0);
const monthsWithData = ref([]);

const search = ref("");
const trendMonthSelection = ref([]);

const openDivisions = ref(new Set());
const openDepartments = ref(new Set());
const openDevices = ref(new Set());

const month = computed(() =>
  trendMonthSelection.value.length ? [...trendMonthSelection.value].sort().join(",") : ""
);

/* รายการเดือนที่ว่างเพราะโหลดล้ม ทำให้ตัวเลือกช่วงดูเหมือน "ยังไม่มีข้อมูล" — ต้องบอก (#50) */
const monthsError = ref(false);

async function loadMonths() {
  try {
    const res = await api.get("/dashboard/monthly-kpi");
    monthsWithData.value = [...new Set((res.data ?? []).map((r) => r.month))].sort();
    monthsError.value = false;
  } catch (err) {
    console.error("Load months error:", err);
    monthsError.value = true;
  }
}

async function loadByDepartment() {
  const request = ++requestId;
  const context = `${fiscalYearState.activeId}|${month.value}`;
  if (context !== loadedContext) { divisions.value = []; unassignedDevices.value = []; }
  if (!fiscalYearState.activeId) {
    divisions.value = [];
    unassignedDevices.value = [];
    return;
  }

  loading.value = true;
  loadError.value = "";

  try {
    const params = { fiscal_year_id: fiscalYearState.activeId };
    if (month.value) params.month = month.value;

    const res = await api.get("/dashboard/by-department", { params });
    if (request !== requestId) return;
    divisions.value = res.data.divisions ?? [];
    unassignedDevices.value = res.data.unassignedDevices ?? [];
    unpricedReadings.value = Number(res.data.unpriced_readings ?? 0);
    loadedContext = context;
  } catch (err) {
    if (request !== requestId) return;
    console.error("Load by-department error:", err);
    loadError.value = t("โหลดข้อมูลแยกตามฝ่าย/แผนกไม่สำเร็จ");
    divisions.value = [];
    unassignedDevices.value = [];
    unpricedReadings.value = 0;
  } finally {
    if (request === requestId) { loading.value = false; loaded = true; }
  }
}

watch(trendMonthSelection, loadByDepartment);
onActivated(() => {
  if (loaded) {
    loadByDepartment();
    loadMonths();
    loadUsageMasterData();
  }
});
watch(() => fiscalYearState.activeId, (id) => id && loadByDepartment(), { immediate: true });

/* --------------------------------------------------------------------------
   ค้นหาและการกาง/พับ
   -------------------------------------------------------------------------- */
const filteredDivisions = computed(() => {
  const keyword = search.value.trim().toLowerCase();
  if (!keyword) return divisions.value;

  return divisions.value
    .map((division) => {
      const departments = (division.departments ?? [])
        .map((department) => {
          const matched = department.name?.toLowerCase().includes(keyword);

          const devices = (department.devices ?? []).filter(
            (d) =>
              d.serial_number?.toLowerCase().includes(keyword) ||
              d.model?.toLowerCase().includes(keyword) ||
              d.brand_name?.toLowerCase().includes(keyword)
          );

          if (matched) return department;
          if (devices.length) return { ...department, devices };
          return null;
        })
        .filter(Boolean);

      if (division.name?.toLowerCase().includes(keyword)) return division;
      if (departments.length) return { ...division, departments };
      return null;
    })
    .filter(Boolean);
});

function toggle(setRef, id) {
  const next = new Set(setRef.value);
  next.has(id) ? next.delete(id) : next.add(id);
  setRef.value = next;
}

/*
 * เรียกจากเทมเพลตผ่านสามตัวนี้เท่านั้น ห้ามส่ง openDivisions ฯลฯ เข้า toggle() ตรงๆ จาก
 * เทมเพลต — ในเทมเพลต ref ถูกแกะเป็น Set แล้ว toggle จึงเขียน .value ลง Set ที่ไม่มีใคร
 * ติดตาม แถวทุกชั้นในแท็บนี้เคยคลิกกางไม่ติดเลยตั้งแต่ #22 ด้วยเหตุนี้ (#50)
 */
const toggleDivision = (id) => toggle(openDivisions, id);
const toggleDepartment = (id) => toggle(openDepartments, id);
const toggleDevice = (id) => toggle(openDevices, id);

function expandAll() {
  openDivisions.value = new Set(filteredDivisions.value.map((d) => d.id));
  openDepartments.value = new Set(
    filteredDivisions.value.flatMap((d) => (d.departments ?? []).map((dep) => dep.id))
  );
}

function collapseAll() {
  openDivisions.value = new Set();
  openDepartments.value = new Set();
  openDevices.value = new Set();
}

/* --------------------------------------------------------------------------
   ยอดรวมและแนวโน้ม
   -------------------------------------------------------------------------- */
const grandTotalCost = computed(() => sumCost(divisions.value));

const grandTotalPages = computed(() =>
  divisions.value.reduce((sum, d) => sum + Number(d.total_pages || 0), 0)
);

const totalDepartmentCount = computed(() =>
  divisions.value.reduce((sum, d) => sum + (d.departments ?? []).length, 0)
);

const noDataCount = computed(() => {
  if (!month.value) return 0;
  return divisions.value.reduce(
    (sum, d) => sum + (d.departments ?? []).filter((dep) => dep.trend === "no-data").length,
    0
  );
});

/**
 * ป้ายแนวโน้ม — ในบริบทค่าใช้จ่าย "พิมพ์เพิ่มขึ้น" คือสิ่งที่ต้องจับตา จึงใช้โทน
 * เตือน ส่วน "ลดลง" ใช้โทนสำเร็จ ตรงข้ามกับกราฟการเงินทั่วไปที่ขึ้น = ดี
 */
function trendBadge(department) {
  const percent = department.change_percent;
  const suffix =
    percent !== null && percent !== undefined ? ` ${Math.abs(percent).toFixed(1)}%` : "";

  if (department.trend === "up") return { icon: TrendingUp, tone: "danger", label: t("เพิ่มขึ้น{0}", [suffix]) };
  if (department.trend === "down") return { icon: TrendingDown, tone: "ok", label: t("ลดลง{0}", [suffix]) };
  if (department.trend === "no-data") return { icon: CircleHelp, tone: "neutral", label: t("ไม่มีข้อมูล") };
  if (percent === null) return { icon: Sparkles, tone: "brand", label: t("ข้อมูลใหม่") };
  return { icon: Minus, tone: "neutral", label: t("เท่าเดิม") };
}

function trendDetail(department) {
  if (department.trend === "no-data") return null;

  const currentPages = department.current_month_pages || 0;
  const previousPages = department.previous_month_pages || 0;
  const currentCost = department.current_month_cost || 0;
  const previousCost = department.previous_month_cost || 0;

  return {
    currentPages,
    previousPages,
    currentCost,
    previousCost,
    pagesDiff: currentPages - previousPages,
    costDiff: currentCost - previousCost,
  };
}

/* --------------------------------------------------------------------------
   อันดับการใช้งานรายเครื่อง
   ข้อมูลจาก /dashboard/by-department ไม่มีอาคาร/ชั้น/สถานะ จึงต้องดึง /devices
   มาต่อด้วย device id เพื่อให้กรองตามที่ตั้งได้
   -------------------------------------------------------------------------- */
const usageFilters = ref({
  building: "",
  floor: "",
  division: "",
  department: "",
  brand: "",
  status: "",
});

const usageBuildings = ref([]);
const usageFloors = ref([]);
const usageBrands = ref([]);
const deviceDimensions = ref(new Map());

const STATUS_OPTIONS = [
  { value: "", label: t("ทุกสถานะ") },
  { value: "active", label: t("ใช้งานอยู่") },
  { value: "repair", label: t("ซ่อมบำรุง") },
  { value: "retired", label: t("ปลดระวาง") },
];

async function loadUsageMasterData() {
  try {
    const [building, floor, brand, device] = await Promise.all([
      api.get("/buildings"),
      api.get("/floors"),
      api.get("/brands"),
      api.get("/devices"),
    ]);

    usageBuildings.value = building.data ?? [];
    usageFloors.value = floor.data ?? [];
    usageBrands.value = brand.data ?? [];
    deviceDimensions.value = new Map(
      (device.data ?? []).map((d) => [
        d.id,
        { building_name: d.building_name, floor_name: d.floor_name, status: d.status },
      ])
    );
  } catch (err) {
    console.error("Load usage master data error:", err);
  }
}

const toOptions = (list) => list.map((item) => ({ value: item.name, label: item.name }));

const usageBuildingOptions = computed(() => toOptions(usageBuildings.value));
const usageBrandOptions = computed(() => toOptions(usageBrands.value));
const usageDivisionOptions = computed(() => toOptions(divisions.value));

const usageFloorOptions = computed(() => {
  const building = usageBuildings.value.find((b) => b.name === usageFilters.value.building);
  const source = building
    ? usageFloors.value.filter((f) => Number(f.building_id) === Number(building.id))
    : usageFloors.value;

  const seen = new Set();
  return source.filter((f) => !seen.has(f.name) && seen.add(f.name)).map((f) => ({ value: f.name, label: f.name }));
});

const usageDepartmentOptions = computed(() => {
  const division = divisions.value.find((d) => d.name === usageFilters.value.division);
  const source = division ? division.departments ?? [] : divisions.value.flatMap((d) => d.departments ?? []);
  return toOptions(source);
});

watch(() => usageFilters.value.building, () => (usageFilters.value.floor = ""));
watch(() => usageFilters.value.division, () => (usageFilters.value.department = ""));

const hasUsageFilter = computed(() => Object.values(usageFilters.value).some(Boolean));

function resetUsageFilters() {
  usageFilters.value = { building: "", floor: "", division: "", department: "", brand: "", status: "" };
}

/** ป้ายของตัวกรองตารางอันดับที่เปิดอยู่ — ตัวกรองอยู่ในแผงพับ ป้ายจึงต้องบอกค่าเองให้อ่านรู้เรื่อง */
const USAGE_FILTER_LABELS = {
  building: t("อาคาร"),
  floor: t("ชั้น"),
  brand: t("ยี่ห้อ"),
  division: t("ฝ่าย"),
  department: t("แผนก"),
  status: t("สถานะเครื่อง"),
};
const usageChips = computed(() =>
  Object.entries(usageFilters.value)
    .filter(([, value]) => value)
    .map(([key, value]) => ({
      key,
      label: `${USAGE_FILTER_LABELS[key]}: ${key === "status" ? STATUS_OPTIONS.find((o) => o.value === value)?.label ?? value : value}`,
    }))
);

/** เครื่องทั้งหมดเป็นรายการแบนราบ รวมเครื่องที่ยังไม่ได้สังกัดแผนกด้วย */
const allDevicesFlat = computed(() => {
  const list = divisions.value.flatMap((division) =>
    (division.departments ?? []).flatMap((department) =>
      (department.devices ?? []).map((device) => ({
        ...device,
        reportKey: `${department.id}:${device.id}`,
        divisionName: division.name,
        departmentName: department.name,
      }))
    )
  );

  return [
    ...list,
    ...unassignedDevices.value.map((device) => ({ ...device, reportKey: `unassigned:${device.id}`, divisionName: "", departmentName: "" })),
  ];
});

const deviceUsageRows = computed(() => {
  const filters = usageFilters.value;

  const rows = allDevicesFlat.value
    .filter((device) => {
      const dim = deviceDimensions.value.get(device.id) ?? {};
      return (
        (!filters.building || dim.building_name === filters.building) &&
        (!filters.floor || dim.floor_name === filters.floor) &&
        (!filters.division || device.divisionName === filters.division) &&
        (!filters.department || device.departmentName === filters.department) &&
        (!filters.brand || device.brand_name === filters.brand) &&
        (!filters.status || dim.status === filters.status)
      );
    })
    .map((device) => ({
      ...device,
      buildingName: deviceDimensions.value.get(device.id)?.building_name ?? "",
    }));

  rows.sort((a, b) => Number(b.total_pages || 0) - Number(a.total_pages || 0));

  // ใส่อันดับหลังเรียงแล้ว เพื่อให้เลขอันดับสื่อ "อันดับตามยอดพิมพ์" เสมอ
  // แม้ผู้ใช้จะไปคลิกเรียงคอลัมน์อื่นในตารางภายหลัง
  return rows.map((device, index) => ({ ...device, rank: index + 1 }));
});

// อันดับมาก่อน แล้วตามด้วย Serial ที่คนอ่านออก (NN/g: คอลัมน์แรกคือตัวระบุที่คนอ่านได้)
// รุ่นอยู่ในเซลล์เดียวกับ Serial แล้ว คอลัมน์ "รุ่น" แยกจึงเป็นข้อมูลซ้ำ
const usageColumns = [
  { key: "rank", label: t("อันดับ"), align: "right", width: "5rem", sortable: false },
  // ค่าในเซลล์รวมยี่ห้อกับรุ่นไว้ให้ค้นหาเจอ (ตารางค้นจากค่าที่แสดง) แต่ไฟล์ Excel
  // ต้องแยกคอลัมน์ ไม่งั้นช่อง Serial กลายเป็น "SN HP M404" ก้อนเดียวและยี่ห้อหายไป
  {
    key: "serial_number",
    label: "Serial",
    value: (d) => [d.serial_number, d.brand_name, d.model].filter(Boolean).join(" "),
    csv: (d) => d.serial_number ?? "",
  },
  { key: "brand_model", label: t("ยี่ห้อ / รุ่น"), hidden: true, alwaysExport: true, value: (d) => [d.brand_name, d.model].filter(Boolean).join(" ") },
  { key: "locations", label: t("ตำแหน่งที่ตั้งตามเดือน"), value: (d) => deviceLocationLabel(d.locations) },
  { key: "divisionName", label: t("ฝ่าย") },
  { key: "departmentName", label: t("แผนก") },
  { key: "total_pages", label: t("จำนวนหน้าสุทธิ"), align: "right", value: (d) => Number(d.total_pages || 0) },
  { key: "total_cost", label: t("ค่าใช้จ่ายสุทธิ"), align: "right", value: (d) => Number(d.total_cost || 0) },
];

/* --------------------------------------------------------------------------
   ส่งออก Excel
   -------------------------------------------------------------------------- */
const { busy: exporting, error: exportError, run: runExport } = useExportTask();

async function exportTreeExcel() {
  const header = [
    t("ฝ่าย"),
    t("แผนก"),
    "Serial",
    t("รุ่น"),
    t("ยี่ห้อ"),
    // total_pages ของ API นี้รวมจาก net_pages (หลังหัก 2%) ไม่ใช่ยอดดิบ
    t("จำนวนหน้าสุทธิทั้งปีงบ"),
    t("ค่าใช้จ่ายสุทธิทั้งปีงบ"),
    // ยอดของแถวนี้ครบหรือยัง — ต้องไปกับแถว ไม่ใช่อยู่แค่ในแผ่นบริบท เพราะคนที่
    // เรียงหรือกรองตารางใน Excel จะเห็นแค่แถว (ADR-0019 Q27)
    t("รายการที่ยังยืนยันราคาไม่ได้"),
  ];

  const rows = filteredDivisions.value.flatMap((division) =>
    (division.departments ?? []).flatMap((department) =>
      (department.devices ?? []).map((device) => [
        division.name,
        department.name,
        device.serial_number || "",
        device.model || "",
        device.brand_name || "",
        Number(device.total_pages || 0),
        Number(device.total_cost || 0),
        Number(device.unpriced_readings || 0),
      ])
    )
  );

  // จับข้อมูลไว้ก่อน await — เปลี่ยนคำค้นระหว่างสร้างไฟล์ ไฟล์ยังเป็นชุดที่กด
  const filename = "expense-by-department";
  const ranking = departmentRankingSheet(filteredDivisions.value);
  const context = [
    ...reportContext({
      filters: { search: search.value },
      labels: { search: t("ค้นหา") },
      unpricedReadings: unpricedReadings.value,
    }),
    [t("อันดับ"), ranking.basis === "cost"
      ? t("ทุกแผนกที่มียอด {0} แผนก เรียงตามค่าใช้จ่ายสุทธิจากมากไปน้อย (แผ่น “อันดับ”)", [ranking.count])
      : t("ทุกแผนกที่มียอด {0} แผนก เรียงตามจำนวนหน้าสุทธิ เพราะราคายังยืนยันไม่ครบ จึงยังจัดอันดับค่าใช้จ่ายไม่ได้ (แผ่น “อันดับ”)", [ranking.count])],
  ];
  await runExport(async () => downloadWorkbook(await createWorkbook({
    sheets: [
      { name: t("แยกตามฝ่าย-แผนก"), header, rows },
      ranking.sheet,
      { name: t("บริบทรายงาน"), rows: [...reportStamp(filename), ...context] },
    ],
  }), filename));
}

// คำค้น ช่วงเดือน กิ่งที่กางไว้ และตัวกรองตารางอันดับ ยังอยู่เมื่อกลับมาหน้านี้ (#115)
usePageState({ search, trendMonthSelection, openDivisions, openDepartments, usageFilters }, { key: "department" });

onMounted(async () => {
  await loadMonths();
  await loadUsageMasterData();
});
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-end gap-2" data-print="hide">
      <UiField
        :label="t(&quot;ช่วงที่เทียบแนวโน้ม&quot;)"
        class="w-80"
      >
        <PeriodPicker v-model="trendMonthSelection" :options="monthsWithData" :all-label="t(&quot;ไม่เทียบแนวโน้ม&quot;)" inline />
      </UiField>

      <UiField :label="t(&quot;ค้นหาฝ่าย แผนก หรือเครื่อง&quot;)" class="flex-1 min-w-[14rem] max-w-sm">
        <UiInput v-model="search" clearable :placeholder="t(&quot;ชื่อฝ่าย, ชื่อแผนก, รุ่น, Serial…&quot;)">
          <template #icon><Search :size="15" /></template>
        </UiInput>
      </UiField>

      <div class="flex items-center gap-2 ml-auto">
        <UiTooltip :content="t(&quot;กางทั้งหมด&quot;)">
          <UiButton size="sm" variant="ghost" icon-only :label="t(&quot;กางทั้งหมด&quot;)" @click="expandAll"><ChevronsUpDown :size="15" /></UiButton>
        </UiTooltip>
        <UiTooltip :content="t(&quot;พับทั้งหมด&quot;)">
          <UiButton size="sm" variant="ghost" icon-only :label="t(&quot;พับทั้งหมด&quot;)" @click="collapseAll"><ChevronsDownUp :size="15" /></UiButton>
        </UiTooltip>
        <UiButton size="sm" variant="secondary" :disabled="!divisions.length || loading || !!loadError" :loading="exporting" @click="exportTreeExcel">
          <template #icon><Download :size="15" /></template>
          Excel
        </UiButton>
      </div>
    </div>

    <!-- ยอดรวมทั้งปีงบ — แถบเดียวแบ่งสามช่อง ไม่ใช่การ์ดสามใบ -->
    <div v-if="!loadError" class="card grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-line-soft">
      <!--
        ชื่อและคำอธิบายเปลี่ยนตามสถานะราคา ชุดเดียวกับแดชบอร์ดและหน้าค่าใช้จ่าย —
        ยอดที่รวมเฉพาะรายการที่ยืนยันราคาแล้ว ต้องไม่ใช้ชื่อเดียวกับยอดที่ครบ (Q27)
      -->
      <UiStat plain
        :label="unpricedReadings ? t(&quot;ค่าใช้จ่ายที่ยืนยันแล้ว&quot;) : t(&quot;ค่าใช้จ่ายสุทธิ&quot;)"
        :unit="t(&quot;บาท&quot;)"
        :hint="unpricedReadings
          ? t('ยังยืนยันราคาไม่ได้ {0} รายการ · ยอดนี้ยังไม่ครบ', [formatCount(unpricedReadings)])
          : t('หัก 2% แล้ว · ไม่ขึ้นกับช่วงที่เลือกเทียบ')"
        :loading="loading"
      >
        {{ formatBahtValue(grandTotalCost) }}
      </UiStat>

      <UiStat plain :label="t(&quot;จำนวนหน้าสุทธิ&quot;)" :unit="t(&quot;หน้า&quot;)" :hint="t(&quot;หลังหัก 2% แล้ว&quot;)" tone="ink" :loading="loading">
        {{ formatCount(grandTotalPages) }}
      </UiStat>

      <UiStat plain
        :label="t(&quot;แผนกที่มีข้อมูล&quot;)"
        :unit="t(&quot;แผนก&quot;)"
        tone="ink"
        :loading="loading"
      >
        {{ formatCount(totalDepartmentCount) }}
      </UiStat>
    </div>

    <UiAlert v-if="month && noDataCount > 0" tone="warn"> {{ t("มี") }} {{ formatCount(noDataCount) }} {{ t("จาก") }} {{ formatCount(totalDepartmentCount) }} {{ t("แผนก ที่ยังไม่มีการบันทึกยอดพิมพ์ทั้งในช่วงนี้และช่วงก่อนหน้า จึงเทียบแนวโน้มให้ไม่ได้") }} </UiAlert>

    <UiAlert v-if="exportError" tone="danger">
      {{ exportError }}
      <template #actions>
        <UiButton size="sm" variant="secondary" :loading="exporting" @click="exportTreeExcel"> {{ t("ลองใหม่") }} </UiButton>
      </template>
    </UiAlert>

    <UiAlert v-if="loadError" tone="danger">
      {{ loadError }}
      <template #actions>
        <UiButton size="sm" variant="secondary" @click="loadByDepartment"> {{ t("ลองใหม่") }} </UiButton>
      </template>
    </UiAlert>

    <UiAlert v-if="monthsError" tone="warn">
      {{ t("โหลดรายการเดือนที่มีข้อมูลไม่สำเร็จ ตัวเลือกช่วงเวลาอาจแสดงว่ายังไม่มีข้อมูลทั้งที่มี") }}
      <template #actions>
        <UiButton size="sm" variant="secondary" @click="loadMonths"> {{ t("ลองใหม่") }} </UiButton>
      </template>
    </UiAlert>

    <!-- ต้นไม้รายละเอียด -->
    <div v-if="loading && !divisions.length" class="flex flex-col gap-2">
      <UiSkeleton v-for="n in 4" :key="n" height="3.5rem" />
    </div>

    <UiCard v-else-if="!loadError && !filteredDivisions.length">
      <UiEmpty
        :variant="search ? 'search' : 'empty'"
        :title="search ? t(&quot;ไม่พบผลลัพธ์ที่ตรงกับ “{0}”&quot;, [search]) : t(&quot;ยังไม่มีข้อมูลฝ่าย/แผนก&quot;)"
        :description="search ? t(&quot;ลองใช้คำที่สั้นลง&quot;) : t(&quot;เพิ่มฝ่ายและแผนก แล้วผูกเครื่องเข้ากับแผนกก่อน&quot;)"
      />
    </UiCard>

    <div v-else-if="!loadError" class="flex flex-col gap-2">
      <section v-for="division in filteredDivisions" :key="division.id" class="card overflow-hidden">
        <!-- ระดับ 1: ฝ่าย
             เป็น h2 เพราะเป็นหัวข้อระดับบนสุดใต้ชื่อหน้า (h1 มาจาก UiPageHeader ของ
             UsageReport.vue) — เดิมเป็น h3 ทำให้โปรแกรมอ่านหน้าจอเจอลำดับหัวข้อ
             ที่ข้ามระดับ แล้วผู้ใช้ที่ไล่ฟังหัวข้อจะเข้าใจว่ามีหัวข้อที่ตัวเองพลาดไป -->
        <h2>
          <button
            type="button"
            class="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-surface-2 transition-colors"
            :aria-expanded="openDivisions.has(division.id)"
            @click="toggleDivision(division.id)"
          >
            <ChevronRight
              :size="16"
              class="shrink-0 text-ink-faint transition-transform duration-200"
              :class="openDivisions.has(division.id) && 'rotate-90'"
              aria-hidden="true"
            />
            <Building2 :size="16" class="shrink-0 text-ink-faint" aria-hidden="true" />

            <span class="min-w-0 flex-1">
              <span class="block font-medium text-ink truncate">{{ division.name }}</span>
              <span class="block text-xs text-ink-soft numeral">
                {{ formatCount((division.departments ?? []).length) }} {{ t("แผนก ·") }} {{ formatCount(division.total_pages) }} {{ t("หน้า") }} </span>
            </span>

            <span class="shrink-0 font-semibold text-brand-ink numeral">
              {{ formatBahtValue(division.total_cost) }}
              <span class="text-2xs font-normal text-ink-mute"> {{ t("บาท") }} </span>
            </span>
          </button>
        </h2>

        <!-- ระดับ 2: แผนก -->
        <div v-if="openDivisions.has(division.id)" class="border-t border-line-soft">
          <p v-if="!(division.departments ?? []).length" class="px-4 py-6 text-sm text-ink-mute text-center"> {{ t("ยังไม่มีแผนกในฝ่ายนี้") }} </p>

          <div
            v-for="department in division.departments"
            :key="department.id"
            class="border-b border-line-soft last:border-0"
          >
            <button
              type="button"
              class="w-full flex items-start gap-3 pl-10 pr-4 py-2.5 text-left hover:bg-surface-2 transition-colors"
              :aria-expanded="openDepartments.has(department.id)"
              @click="toggleDepartment(department.id)"
            >
              <ChevronRight
                :size="14"
                class="shrink-0 mt-1 text-ink-faint transition-transform duration-200"
                :class="openDepartments.has(department.id) && 'rotate-90'"
                aria-hidden="true"
              />
              <FolderTree :size="14" class="shrink-0 mt-1 text-ink-faint" aria-hidden="true" />

              <span class="min-w-0 flex-1">
                <span class="flex flex-wrap items-center gap-2">
                  <span class="text-sm text-ink-soft">{{ department.name }}</span>
                  <span class="text-xs text-ink-soft numeral">
                    {{ formatCount((department.devices ?? []).length) }} {{ t("เครื่อง") }} </span>

                  <UiBadge
                    v-if="month && department.trend"
                    :tone="trendBadge(department).tone"
                    size="sm"
                  >
                    <component :is="trendBadge(department).icon" :size="11" aria-hidden="true" />
                    {{ trendBadge(department).label }}
                  </UiBadge>
                </span>

                <span
                  v-if="month && trendDetail(department)"
                  class="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-ink-soft numeral"
                >
                  <span> {{ t("ช่วงนี้") }} {{ formatCount(trendDetail(department).currentPages) }} {{ t("หน้า (") }} {{ formatBahtValue(trendDetail(department).currentCost) }} {{ t("บาท)") }} </span>
                  <span> {{ t("ช่วงก่อน") }} {{ formatCount(trendDetail(department).previousPages) }} {{ t("หน้า (") }} {{ formatBahtValue(trendDetail(department).previousCost) }} {{ t("บาท)") }} </span>
                  <span
                    :class="
                      trendDetail(department).pagesDiff > 0
                        ? 'text-danger-ink'
                        : trendDetail(department).pagesDiff < 0
                          ? 'text-ok-ink'
                          : ''
                    "
                  > {{ t("ต่าง") }} {{ trendDetail(department).pagesDiff > 0 ? "+" : "" }}{{ formatCount(trendDetail(department).pagesDiff) }} {{ t("หน้า") }} </span>
                </span>
              </span>

              <span class="shrink-0 text-sm font-medium text-ink numeral">
                {{ formatBahtValue(department.total_cost) }}
              </span>
            </button>

            <!-- ระดับ 3: เครื่อง -->
            <div v-if="openDepartments.has(department.id)" class="pl-16 pr-4 pb-3">
              <p v-if="!(department.devices ?? []).length" class="text-sm text-ink-mute py-2"> {{ t("ยังไม่มีเครื่องในแผนกนี้") }} </p>

              <div
                v-for="device in department.devices"
                :key="device.id"
                class="border-b border-line-soft last:border-0"
              >
                <button
                  type="button"
                  class="w-full flex items-center gap-2.5 py-2 text-left hover:bg-surface-2 transition-colors"
                  :aria-expanded="openDevices.has(device.id)"
                  @click="toggleDevice(device.id)"
                >
                  <ChevronRight
                    :size="13"
                    class="shrink-0 text-ink-faint transition-transform duration-200"
                    :class="openDevices.has(device.id) && 'rotate-90'"
                    aria-hidden="true"
                  />
                  <Printer :size="13" class="shrink-0 text-ink-faint" aria-hidden="true" />

                  <span class="min-w-0 flex-1 flex flex-wrap items-center gap-2">
                    <span class="text-sm text-ink-soft">
                      {{ device.brand_name || "—" }} {{ device.model || "" }}
                      <span class="block text-xs text-ink-mute">{{ deviceLocationLabel(device.locations) }}</span>
                    </span>
                    <span class="text-xs text-ink-soft font-mono">{{ device.serial_number }}</span>

                    <UiBadge
                      v-if="device.moved_during_period"
                      tone="warn"
                      size="sm"
                      :title="t(&quot;เครื่องนี้ย้ายแผนกระหว่างช่วงที่ดูอยู่ ยอดแต่ละเดือนจึงแยกไปตามแผนกที่สังกัดตอนนั้น&quot;)"
                    > {{ t("ย้ายแผนกระหว่างช่วงนี้") }} </UiBadge>
                  </span>

                  <span class="shrink-0 text-sm text-ink numeral">
                    {{ formatBahtValue(device.total_cost) }}
                  </span>
                </button>

                <RouterLink
                  v-if="openDevices.has(device.id)"
                  :to="`/assets/${device.id}`"
                  class="ml-6 inline-flex min-h-6 items-center text-xs text-brand-ink hover:underline"
                >
                  {{ t("เปิดรายละเอียดเครื่อง") }} · {{ device.serial_number }}
                </RouterLink>

                <table
                  v-if="openDevices.has(device.id) && (device.monthly ?? []).length"
                  class="w-full text-sm mb-2 ml-6"
                >
                  <thead>
                    <tr class="text-xs text-ink-mute">
                      <th class="text-left font-medium py-1.5"> {{ t("เดือน") }} </th>
                      <th class="text-right font-medium py-1.5"> {{ t("หน้าสุทธิ") }} </th>
                      <th class="text-right font-medium py-1.5"> {{ t("ค่าใช้จ่าย") }} </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in device.monthly" :key="row.month" class="border-t border-line-soft">
                      <td class="py-1.5 text-ink-soft">{{ formatMonth(row.month) }}</td>
                      <td class="py-1.5 text-right numeral text-ink-soft">{{ formatCount(row.net_pages) }}</td>
                      <td class="py-1.5 text-right numeral text-ink">{{ formatBahtValue(row.total_cost) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- อันดับการใช้งานรายเครื่อง -->
    <UiCard
      v-if="!loadError"
      :title="t(&quot;เครื่องที่ใช้งานหนักที่สุด&quot;)"
      :description="t(&quot;ยอดพิมพ์และค่าใช้จ่ายสุทธิของแต่ละเครื่อง รวมทั้งปีงบที่เลือกไว้ด้านบน&quot;)"
    >


      <!-- ตัวกรองหกช่องของตารางนี้อยู่ในแผงพับ (รอบที่ 3 ของ #51) — เดิมกางค้างเหนือตาราง ป้ายตัวกรอง
           จึงเป็นทางที่เห็นว่ากำลังกรองอะไรอยู่ แบบเดียวกับหน้าทะเบียน -->
      <UiFilterBar :chips="usageChips" @remove="(key) => (usageFilters[key] = '')" @clear="resetUsageFilters">
        <UiField :label="t(&quot;อาคาร&quot;)">
          <UiCombobox v-model="usageFilters.building" :options="usageBuildingOptions" :placeholder="t(&quot;ทุกอาคาร&quot;)" :any-label="t(&quot;ทุกอาคาร&quot;)" />
        </UiField>

        <UiField :label="t(&quot;ชั้น&quot;)">
          <UiCombobox v-model="usageFilters.floor" :options="usageFloorOptions" :placeholder="t(&quot;ทุกชั้น&quot;)" :any-label="t(&quot;ทุกชั้น&quot;)" />
        </UiField>

        <UiField :label="t(&quot;ยี่ห้อ&quot;)">
          <UiCombobox v-model="usageFilters.brand" :options="usageBrandOptions" :placeholder="t(&quot;ทุกยี่ห้อ&quot;)" :any-label="t(&quot;ทุกยี่ห้อ&quot;)" />
        </UiField>

        <UiField :label="t(&quot;ฝ่าย&quot;)">
          <UiCombobox v-model="usageFilters.division" :options="usageDivisionOptions" :placeholder="t(&quot;ทุกฝ่าย&quot;)" :any-label="t(&quot;ทุกฝ่าย&quot;)" />
        </UiField>

        <UiField :label="t(&quot;แผนก&quot;)">
          <UiCombobox v-model="usageFilters.department" :options="usageDepartmentOptions" :placeholder="t(&quot;ทุกแผนก&quot;)" :any-label="t(&quot;ทุกแผนก&quot;)" />
        </UiField>

        <UiField :label="t(&quot;สถานะเครื่อง&quot;)">
          <UiSelect v-model="usageFilters.status" :options="STATUS_OPTIONS" value-key="value" label-key="label" />
        </UiField>

      </UiFilterBar>

      <UiDataTable
        :rows="deviceUsageRows"
        :columns="usageColumns"
        :loading="loading"
        :caption="t(&quot;อันดับรายเครื่อง&quot;)"
        row-key="reportKey"
        export-filename="device-usage-ranking"
        :export-context="reportContext({ filters: usageFilters })"
        :search-placeholder="t(&quot;ค้นหา Serial, รุ่น หรือแผนก…&quot;)"
        :empty-text="t(&quot;ไม่มีเครื่องที่ตรงกับตัวกรอง&quot;)"
        :show-column-picker="false"
      >
        <template #cell-rank="{ row }">
          <span class="numeral text-ink-mute">{{ row.rank }}</span>
        </template>

        <template #cell-serial_number="{ row }">
          <!-- Serial ทุกตารางลิงก์ไปหน้ารายละเอียดเครื่อง หน้าตาเดียวกัน -->
          <DeviceSerialLink :device-id="row.id" :serial-number="row.serial_number" />
          <span class="block text-xs text-ink-soft">{{ row.brand_name }} {{ row.model }}</span>
        </template>

        <template #cell-total_pages="{ row }">
          {{ formatCount(row.total_pages) }}
        </template>

        <template #cell-total_cost="{ row }">
          {{ formatBahtValue(row.total_cost) }}
          <span v-if="row.unpriced_readings > 0" class="block text-2xs text-warn-ink">
            {{ t("ยังยืนยันราคาไม่ได้ {0} รายการ", [formatCount(row.unpriced_readings)]) }}
          </span>
        </template>
      </UiDataTable>
    </UiCard>
  </div>
</template>
