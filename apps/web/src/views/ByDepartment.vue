<script setup>
import { reportContext } from "../components/report-context";
import { yearLabel } from "../lib/locale-format";
import { deviceLocationLabel } from "../lib/device-location";
import { formatMonth } from "../lib/locale-format";

import { t } from "../lib/locale";

/**
 * ByDepartment — ค่าใช้จ่ายและยอดพิมพ์แยกตามฝ่าย/แผนก
 *
 * ใช้ตอนทำเรื่องเบิกภายใน: เงินก้อนเดียวกับหน้า "ตามสัญญา" แต่มองจากมุมของ
 * หน่วยงานที่ใช้ กางจากฝ่าย -> แผนก -> เครื่อง -> ยอดรายเดือน
 *
 * หน้านี้มีสามส่วนที่ตอบคนละคำถาม จึงแยกกันชัดเจนด้วยการ์ด
 *
 *   1. กราฟเปรียบเทียบ  เลือกฝ่าย/แผนกมาวางเทียบกันตามช่วงเวลา
 *   2. ต้นไม้รายละเอียด ไล่ดูตัวเลขจนถึงระดับเครื่องและเดือน
 *   3. อันดับรายเครื่อง เครื่องไหนใช้หนักที่สุด/เบาที่สุด พร้อมตัวกรองของตัวเอง
 *
 * ยอดรวมด้านบนอ้างอิง "ทั้งปีงบ" เสมอ ไม่ขึ้นกับช่วงที่เลือกเปรียบเทียบ —
 * ตั้งใจให้เป็นเลขนิ่งที่เอาไปอ้างอิงได้ตลอด และเขียนกำกับไว้ในการ์ด
 *
 * ป้ายแนวโน้มของแต่ละแผนกใช้สีคู่กับไอคอนและข้อความเสมอ เพราะ "เพิ่มขึ้น" ใน
 * บริบทค่าใช้จ่ายคือเรื่องไม่ดี ซึ่งตรงข้ามกับสัญชาตญาณของสีเขียว/แดงทั่วไป
 */
import { computed, onMounted, ref, watch } from "vue";
import { exportSheet } from "../lib/export-xlsx";
import {
  Building2,
  ChevronRight,
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
import { activeFiscalYear, fiscalYearState } from "../store/fiscalYear";
import { formatBahtValue, formatCount } from "../lib/format";
import PeriodPicker from "../components/PeriodPicker.vue";
import {
  UiAlert,
  UiBadge,
  UiButton,
  UiExpandable,
  UiCard,
  UiChart,
  UiCombobox,
  UiDataTable,
  UiEmpty,
  UiField,
  UiInput,
  UiSegmented,
  UiSelect,
  UiSkeleton,
  UiStat,
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

const divisions = ref([]);
const unassignedDevices = ref([]);
const monthsWithData = ref([]);

const search = ref("");
const trendMonthSelection = ref([]);

const openDivisions = ref(new Set());
const openDepartments = ref(new Set());
const openDevices = ref(new Set());

const month = computed(() =>
  trendMonthSelection.value.length ? [...trendMonthSelection.value].sort().join(",") : ""
);

async function loadMonths() {
  try {
    const res = await api.get("/dashboard/monthly-kpi");
    monthsWithData.value = [...new Set((res.data ?? []).map((r) => r.month))].sort();
  } catch (err) {
    console.error("Load months error:", err);
  }
}

async function loadByDepartment() {
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
    divisions.value = res.data.divisions ?? [];
    unassignedDevices.value = res.data.unassignedDevices ?? [];
  } catch (err) {
    console.error("Load by-department error:", err);
    loadError.value = t("โหลดข้อมูลแยกตามฝ่าย/แผนกไม่สำเร็จ");
    divisions.value = [];
    unassignedDevices.value = [];
  } finally {
    loading.value = false;
  }
}

watch(trendMonthSelection, loadByDepartment);
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
   กราฟเปรียบเทียบฝ่าย/แผนก
   -------------------------------------------------------------------------- */
const selectedDivisionIds = ref([]);
const selectedDepartmentIds = ref([]);
const chartMetric = ref("cost");
const rangeStartIdx = ref(0);
const rangeEndIdx = ref(0);

const METRIC_OPTIONS = [
  { value: "cost", label: t("ค่าใช้จ่าย") },
  { value: "pages", label: t("จำนวนหน้า") },
];

const divisionOptions = computed(() =>
  divisions.value.map((division) => ({ value: division.id, label: division.name }))
);

const departmentOptions = computed(() =>
  divisions.value.flatMap((division) =>
    (division.departments ?? []).map((department) => ({
      value: department.id,
      label: department.name,
      hint: division.name,
      keywords: division.name,
    }))
  )
);

function findDivision(id) {
  return divisions.value.find((d) => d.id === id) ?? null;
}

function findDepartment(id) {
  for (const division of divisions.value) {
    const department = (division.departments ?? []).find((d) => d.id === id);
    if (department) return { department, division };
  }
  return null;
}

/** หนึ่งรายการ = หนึ่งเส้นในกราฟ (ฝ่ายรวมทุกแผนก หรือแผนกเดี่ยว) */
const chartEntities = computed(() => {
  const list = [];

  for (const id of selectedDivisionIds.value) {
    const division = findDivision(id);
    if (!division) continue;
    list.push({
      key: `div-${id}`,
      label: division.name,
      devices: (division.departments ?? []).flatMap((dep) => dep.devices ?? []),
    });
  }

  for (const id of selectedDepartmentIds.value) {
    const found = findDepartment(id);
    if (!found) continue;
    list.push({
      key: `dep-${id}`,
      label: `${found.department.name} (${found.division.name})`,
      devices: found.department.devices ?? [],
    });
  }

  return list;
});

/** รวมยอดรายเดือนของกลุ่มเครื่อง — สะสมเป็นสตางค์ก่อนแล้วค่อยแปลงเป็นบาทตอนท้าย */
function buildMonthlySeries(devices) {
  const byMonth = {};

  for (const device of devices) {
    for (const row of device.monthly ?? []) {
      if (!byMonth[row.month]) byMonth[row.month] = { costSatang: 0, pages: 0 };
      byMonth[row.month].costSatang += row.total_cost_satang ?? toSatang(row.total_cost);
      byMonth[row.month].pages += Number(row.net_pages || 0);
    }
  }

  for (const entry of Object.values(byMonth)) entry.cost = fromSatang(entry.costSatang);
  return byMonth;
}

const allChartMonths = computed(() => {
  const set = new Set();
  for (const entity of chartEntities.value) {
    for (const m of Object.keys(buildMonthlySeries(entity.devices))) set.add(m);
  }
  return [...set].sort();
});

function clampRange() {
  const max = Math.max(0, allChartMonths.value.length - 1);
  if (rangeEndIdx.value === 0 || rangeEndIdx.value > max) rangeEndIdx.value = max;
  if (rangeStartIdx.value > rangeEndIdx.value) rangeStartIdx.value = rangeEndIdx.value;
}

const visibleChartMonths = computed(() => {
  clampRange();
  return allChartMonths.value.slice(rangeStartIdx.value, rangeEndIdx.value + 1);
});

const monthRangeOptions = computed(() =>
  allChartMonths.value.map((m, index) => ({ value: index, label: formatMonth(m) }))
);

/**
 * สลอตสีของแต่ละฝ่าย/แผนก — จองไว้จนกว่าจะเอาออกจากกราฟ
 *
 * ต้องได้สองอย่างพร้อมกัน ซึ่งวิธีง่ายๆ ให้ได้แค่อย่างเดียว
 *
 *   ก. **เอารายการหนึ่งออกแล้วรายการที่เหลือต้องไม่เปลี่ยนสี** คนที่เพิ่งจำได้ว่า
 *      "ฝ่ายการพยาบาลคือเส้นสีส้ม" จะอ่านผิดทันทีถ้าสีสลับกันหลังกรอง
 *      -> ให้สีตามลำดับที่เลือกไม่ได้
 *   ข. **สองรายการที่แสดงอยู่พร้อมกันต้องไม่ได้สีเดียวกันเด็ดขาด** ชุดสีมี 8 สลอต
 *      แต่ฝ่ายกับแผนกรวมกันมีได้เป็นสิบ
 *      -> ให้สีตายตัวตามตำแหน่งในรายการทั้งหมดก็ไม่ได้ เพราะพอเกิน 8 จะวนมาชนกัน
 *
 * วิธีที่ได้ทั้งสองข้อ: จองสลอตตอนถูกเลือกครั้งแรก (หยิบเลขที่ว่างต่ำสุด) แล้ว
 * **ถือไว้จนกว่าจะถูกเอาออก** — รายการที่ยังอยู่จึงไม่มีวันเปลี่ยนสี และรายการที่
 * แสดงพร้อมกันก็ไม่มีวันชนกัน เพราะสลอตที่ถูกจองอยู่จะไม่ถูกแจกซ้ำ
 */
const slotAssignments = ref(new Map());

watch(
  () => chartEntities.value.map((entity) => entity.key),
  (keys) => {
    const next = new Map();
    const taken = new Set();

    // รอบแรก: รายการที่เคยได้สลอตไปแล้วรักษาสลอตเดิมไว้
    for (const key of keys) {
      const existing = slotAssignments.value.get(key);
      if (existing && !taken.has(existing)) {
        next.set(key, existing);
        taken.add(existing);
      }
    }

    // รอบสอง: รายการใหม่หยิบเลขที่ว่างต่ำสุด
    for (const key of keys) {
      if (next.has(key)) continue;
      let slot = 1;
      while (taken.has(slot) && slot <= 8) slot += 1;
      next.set(key, slot);
      taken.add(slot);
    }

    slotAssignments.value = next;
  },
  { immediate: true }
);

const chartLabels = computed(() => visibleChartMonths.value.map((m) => formatMonth(m)));

const chartSeries = computed(() => {
  const metricKey = chartMetric.value === "cost" ? "cost" : "pages";

  return chartEntities.value.map((entity) => {
    const byMonth = buildMonthlySeries(entity.devices);
    return {
      key: entity.key,
      label: entity.label,
      slot: slotAssignments.value.get(entity.key) ?? 1,
      // null = เดือนที่ยังไม่มีข้อมูล ต่างจาก 0 ที่แปลว่าเดือนนั้นไม่ได้พิมพ์เลย
      data: visibleChartMonths.value.map((m) => byMonth[m]?.[metricKey] ?? null),
    };
  });
});

/** ชุดสีมี 8 สลอตและห้ามวนซ้ำ เกินกว่านั้นสีจะเริ่มซ้ำจนแยกไม่ออก */
const tooManySeries = computed(() => chartEntities.value.length > 8);

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

const usageSort = ref("desc");
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

  rows.sort((a, b) =>
    usageSort.value === "desc"
      ? Number(b.total_pages || 0) - Number(a.total_pages || 0)
      : Number(a.total_pages || 0) - Number(b.total_pages || 0)
  );

  // ใส่อันดับหลังเรียงแล้ว เพื่อให้เลขอันดับสื่อ "อันดับตามยอดพิมพ์" เสมอ
  // แม้ผู้ใช้จะไปคลิกเรียงคอลัมน์อื่นในตารางภายหลัง
  return rows.map((device, index) => ({ ...device, rank: index + 1 }));
});

const usageColumns = [
  { key: "model", label: t("รุ่น") },
  { key: "rank", label: t("อันดับ"), align: "right", width: "5rem", sortable: false },
  { key: "serial_number", label: "Serial" },
  { key: "locations", label: t("ตำแหน่งที่ตั้งตามเดือน"), value: (d) => deviceLocationLabel(d.locations) },
  { key: "divisionName", label: t("ฝ่าย") },
  { key: "departmentName", label: t("แผนก") },
  { key: "total_pages", label: t("ยอดพิมพ์สุทธิ"), align: "right", value: (d) => Number(d.total_pages || 0) },
  { key: "total_cost", label: t("ค่าใช้จ่ายสุทธิ"), align: "right", value: (d) => Number(d.total_cost || 0) },
];

/* --------------------------------------------------------------------------
   ส่งออก Excel
   -------------------------------------------------------------------------- */
async function exportTreeExcel() {
  const header = [t("ฝ่าย"), t("แผนก"), "Serial", t("รุ่น"), t("ยี่ห้อ"), t("จำนวนหน้ารวมทั้งปีงบ"), t("ค่าใช้จ่ายสุทธิทั้งปีงบ")];

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
      ])
    )
  );

  await exportSheet({
    header,
    rows,
    sheetName: t("แยกตามฝ่าย-แผนก"),
    filename: "expense-by-department",
    context: reportContext({ filters: { search: search.value }, labels: { search: t("ค้นหา") } }),
  });
}

onMounted(async () => {
  await loadMonths();
  await loadUsageMasterData();
});
</script>

<template>
  <UiExpandable class="flex flex-col gap-4">
    <!-- แถบเครื่องมือ -->
    <div class="card p-3 flex flex-wrap items-end gap-3" data-print="hide">
      <UiField
        :label="t(&quot;ช่วงที่เทียบแนวโน้ม&quot;)"
        class="w-56"
      >
        <PeriodPicker v-model="trendMonthSelection" :options="monthsWithData" :all-label="t(&quot;ไม่เทียบแนวโน้ม&quot;)" />
      </UiField>

      <UiField :label="t(&quot;ค้นหาฝ่าย แผนก หรือเครื่อง&quot;)" class="flex-1 min-w-[14rem] max-w-sm">
        <UiInput v-model="search" clearable :placeholder="t(&quot;ชื่อฝ่าย, ชื่อแผนก, รุ่น, Serial…&quot;)">
          <template #icon><Search :size="15" /></template>
        </UiInput>
      </UiField>

      <div class="flex items-center gap-2 ml-auto">
        <UiButton size="sm" variant="ghost" @click="expandAll"> {{ t("กางทั้งหมด") }} </UiButton>
        <UiButton size="sm" variant="ghost" @click="collapseAll"> {{ t("พับทั้งหมด") }} </UiButton>
        <UiButton size="sm" variant="secondary" :disabled="!divisions.length" @click="exportTreeExcel">
          <template #icon><Download :size="15" /></template>
          Excel
        </UiButton>
      </div>
    </div>

    <!-- ยอดรวมทั้งปีงบ -->
    <div class="grid-fit">
      <UiStat
        :label="t(&quot;ค่าใช้จ่ายสุทธิรวม&quot;)"
        :unit="t(&quot;บาท&quot;)"
        :hint="t(&quot;ทั้งปีงบ · หัก 20% แล้ว · ไม่ขึ้นกับช่วงที่เลือกเทียบ&quot;)"
        :loading="loading"
      >
        {{ formatBahtValue(grandTotalCost) }}
      </UiStat>

      <UiStat :label="t(&quot;จำนวนหน้าสุทธิรวม&quot;)" :unit="t(&quot;หน้า&quot;)" :hint="t(&quot;ทั้งปีงบ&quot;)" tone="ink" :loading="loading">
        {{ formatCount(grandTotalPages) }}
      </UiStat>

      <UiStat
        :label="t(&quot;แผนกที่มีข้อมูล&quot;)"
        :unit="t(&quot;แผนก&quot;)"
        :hint="t(&quot;ปีงบ {0}&quot;, [yearLabel(activeFiscalYear?.year)])"
        tone="ink"
        :loading="loading"
      >
        {{ formatCount(totalDepartmentCount) }}
      </UiStat>
    </div>

    <UiAlert v-if="month && noDataCount > 0" tone="warn"> {{ t("มี") }} {{ formatCount(noDataCount) }} {{ t("จาก") }} {{ formatCount(totalDepartmentCount) }} {{ t("แผนก ที่ยังไม่มีการบันทึกยอดพิมพ์ทั้งในช่วงนี้และช่วงก่อนหน้า จึงเทียบแนวโน้มให้ไม่ได้") }} </UiAlert>

    <UiAlert v-if="loadError" tone="danger">
      {{ loadError }}
      <template #actions>
        <UiButton size="sm" variant="secondary" @click="loadByDepartment"> {{ t("ลองใหม่") }} </UiButton>
      </template>
    </UiAlert>

    <!-- กราฟเปรียบเทียบ -->
    <UiCard :eyebrow="t(&quot;เปรียบเทียบ&quot;)" :title="t(&quot;แนวโน้มของฝ่าย / แผนกที่เลือก&quot;)">
      <template #actions>
        <UiSegmented
          v-model="chartMetric"
          :options="METRIC_OPTIONS"
          size="sm"
          :label="t(&quot;สิ่งที่แสดงบนกราฟ&quot;)"
        />
      </template>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <UiField :label="t(&quot;ฝ่ายที่จะนำมาเทียบ&quot;)">
          <UiCombobox
            v-model="selectedDivisionIds"
            :options="divisionOptions"
            multiple
            :placeholder="t(&quot;เลือกฝ่าย&quot;)"
            :search-placeholder="t(&quot;พิมพ์ชื่อฝ่าย…&quot;)"
          />
        </UiField>

        <UiField :label="t(&quot;แผนกที่จะนำมาเทียบ&quot;)">
          <UiCombobox
            v-model="selectedDepartmentIds"
            :options="departmentOptions"
            multiple
            :placeholder="t(&quot;เลือกแผนก&quot;)"
            :search-placeholder="t(&quot;พิมพ์ชื่อแผนก…&quot;)"
          />
        </UiField>
      </div>

      <UiEmpty
        v-if="!chartEntities.length"
        :title="t(&quot;ยังไม่ได้เลือกอะไรมาเทียบ&quot;)"
        :description="t(&quot;เลือกฝ่ายหรือแผนกอย่างน้อยหนึ่งรายการด้านบน แต่ละรายการจะกลายเป็นหนึ่งเส้นบนกราฟ&quot;)"
        compact
      />

      <UiEmpty
        v-else-if="!allChartMonths.length"
        :title="t(&quot;รายการที่เลือกยังไม่มียอดรายเดือน&quot;)"
        :description="t(&quot;ลองเลือกฝ่าย/แผนกอื่น หรือตรวจว่าบันทึกยอดพิมพ์ของเดือนนั้นแล้วหรือยัง&quot;)"
        variant="search"
        compact
      />

      <template v-else>
        <UiAlert v-if="tooManySeries" tone="warn" class="mb-3"> {{ t("เลือกไว้") }} {{ chartEntities.length }} {{ t("รายการ — ชุดสีมี 8 สีและไม่วนซ้ำ เพราะสีที่ซ้ำกันทำให้แยกเส้นไม่ออก ลองเอาบางรายการออก หรือสลับไปดูเป็นตาราง") }} </UiAlert>

        <div class="flex flex-wrap items-center gap-2 mb-3 text-xs text-ink-mute">
          <span> {{ t("ช่วงที่แสดง") }} </span>
          <UiSelect
            :model-value="rangeStartIdx"
            :options="monthRangeOptions"
            value-key="value"
            label-key="label"
            size="sm"
            class="w-auto"
            :aria-label="t(&quot;เดือนเริ่มต้นของช่วงที่แสดง&quot;)"
            @update:model-value="rangeStartIdx = Number($event)"
          />
          <span> {{ t("ถึง") }} </span>
          <UiSelect
            :model-value="rangeEndIdx"
            :options="monthRangeOptions"
            value-key="value"
            label-key="label"
            size="sm"
            class="w-auto"
            :aria-label="t(&quot;เดือนสิ้นสุดของช่วงที่แสดง&quot;)"
            @update:model-value="rangeEndIdx = Number($event)"
          />
        </div>

        <UiChart
          kind="line"
          :labels="chartLabels"
          :series="chartSeries"
          height="20rem"
          :loading="loading"
          :unit="chartMetric === 'cost' ? t(&quot;บาท&quot;) : t(&quot;หน้า&quot;)"
          :format-value="chartMetric === 'cost' ? formatBahtValue : formatCount"
          :category-label="t(&quot;เดือน&quot;)"
        />
      </template>
    </UiCard>

    <!-- ต้นไม้รายละเอียด -->
    <div v-if="loading" class="flex flex-col gap-2">
      <UiSkeleton v-for="n in 4" :key="n" height="3.5rem" />
    </div>

    <UiCard v-else-if="!filteredDivisions.length">
      <UiEmpty
        :variant="search ? 'search' : 'empty'"
        :title="search ? t(&quot;ไม่พบผลลัพธ์ที่ตรงกับ “{0}”&quot;, [search]) : t(&quot;ยังไม่มีข้อมูลฝ่าย/แผนก&quot;)"
        :description="search ? t(&quot;ลองใช้คำที่สั้นลง&quot;) : t(&quot;เพิ่มฝ่ายและแผนก แล้วผูกเครื่องเข้ากับแผนกก่อน&quot;)"
      />
    </UiCard>

    <div v-else class="flex flex-col gap-2">
      <section v-for="division in filteredDivisions" :key="division.id" class="card overflow-hidden">
        <!-- ระดับ 1: ฝ่าย -->
        <h3>
          <button
            type="button"
            class="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-surface-2 transition-colors"
            :aria-expanded="openDivisions.has(division.id)"
            @click="toggle(openDivisions, division.id)"
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
              <span class="block text-2xs text-ink-mute numeral">
                {{ formatCount((division.departments ?? []).length) }} {{ t("แผนก ·") }} {{ formatCount(division.total_pages) }} {{ t("หน้า") }} </span>
            </span>

            <span class="shrink-0 font-semibold text-brand-ink numeral">
              {{ formatBahtValue(division.total_cost) }}
              <span class="text-2xs font-normal text-ink-mute"> {{ t("บาท") }} </span>
            </span>
          </button>
        </h3>

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
              @click="toggle(openDepartments, department.id)"
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
                  <span class="text-2xs text-ink-mute numeral">
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
                  class="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-2xs text-ink-mute numeral"
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
                  @click="toggle(openDevices, device.id)"
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
                    <span class="text-2xs text-ink-mute font-mono">{{ device.serial_number }}</span>

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
      :eyebrow="t(&quot;อันดับรายเครื่อง&quot;)"
      :title="t(&quot;เครื่องที่ใช้งานหนักที่สุด&quot;)"
      :description="t(&quot;ยอดพิมพ์และค่าใช้จ่ายสุทธิของแต่ละเครื่อง รวมทั้งปีงบที่เลือกไว้ด้านบน&quot;)"
    >
      <template #actions>
        <UiSegmented
          v-model="usageSort"
          :options="[
            { value: 'desc', label: t(&quot;มากไปน้อย&quot;) },
            { value: 'asc', label: t(&quot;น้อยไปมาก&quot;) },
          ]"
          size="sm"
          :label="t(&quot;ลำดับการเรียง&quot;)"
        />
      </template>

      <div class="grid grid-cols-2 lg:grid-cols-3 gap-3 pb-4 mb-4 border-b border-line-soft">
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

        <div class="col-span-full flex justify-end">
          <UiButton size="sm" variant="ghost" :disabled="!hasUsageFilter" @click="resetUsageFilters"> {{ t("ล้างตัวกรองของตารางนี้") }} </UiButton>
        </div>
      </div>

      <UiDataTable
        :rows="deviceUsageRows"
        :columns="usageColumns"
        :loading="loading"
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
          <span class="font-mono text-sm text-ink">{{ row.serial_number || "—" }}</span>
          <span class="block text-2xs text-ink-mute">{{ row.brand_name }} {{ row.model }}</span>
        </template>

        <template #cell-total_pages="{ row }">
          {{ formatCount(row.total_pages) }}
        </template>

        <template #cell-total_cost="{ row }">
          {{ formatBahtValue(row.total_cost) }}
        </template>
      </UiDataTable>
    </UiCard>
  </UiExpandable>
</template>
