<script setup>
import { ref, onMounted, computed, watch } from "vue";
import * as XLSX from "xlsx";
import ChevronIcon from "../components/ChevronIcon.vue";
import AppIcon from "../components/AppIcon.vue";
import { Line } from "vue-chartjs";
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
} from "chart.js";
import api from "../services/api";
import DepartmentPicker from "../components/DepartmentPicker.vue";
import MonthPicker from "../components/MonthPicker.vue";
import SearchableSelect from "../components/SearchableSelect.vue";
import { useChartTheme } from "../composables/useChartTheme";
import { fiscalYearState, activeFiscalYear } from "../store/fiscalYear";

const { baseChartOptions } = useChartTheme();

ChartJS.register(Title, Tooltip, Legend, LineElement, PointElement, CategoryScale, LinearScale);

const loading = ref(false);
const error = ref(null);

const months = ref([]);
const search = ref("");
const chartMetric = ref("cost"); // cost | pages

// ช่วงที่เทียบแนวโน้ม — ใช้ MonthPicker แบบเดียวกับหน้าอื่นๆ (Compare/Report/DashboardFilter)
// เลือกได้หลายเดือน ไม่จำกัด max แล้ว จึงกดเลือกด่วนเป็น "ไตรมาส"/"ครึ่งปี" ได้ (เดิมจำกัดแค่ 1 เดือน)
// "เดือนก่อน" ที่เทียบด้วยจะกลายเป็น "ช่วงก่อนหน้า" ที่มีจำนวนเดือนเท่ากับช่วงที่เลือก (ดู backend)
const trendMonthSelection = ref([]);
const month = computed(() =>
  trendMonthSelection.value.length ? [...trendMonthSelection.value].sort().join(",") : ""
);

// เลือกฝ่าย และ แผนก แยกกันคนละ filter — เลือกได้ทั้งสองอย่างพร้อมกัน กราฟจะโชว์ตามที่เลือกทั้งหมด
const selectedDivisionIds = ref([]);
const selectedDepartmentIds = ref([]);

const divisions = ref([]);
const unassignedDevices = ref([]);

// เก็บสถานะเปิด/ปิดแยกจาก state หลัก จะได้ไม่ถูกรีเซ็ตตอนเปลี่ยนเดือน
const openDivisions = ref(new Set());
const openDepartments = ref(new Set());
const openDevices = ref(new Set());
const showUnassigned = ref(false);

// ช่วงเวลาที่แสดงในกราฟเส้น (zoom/pan)
const rangeStartIdx = ref(0);
const rangeEndIdx = ref(0);

function formatMoney(value) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPages(value) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatMonth(value) {
  if (!value) return "";
  const monthsTH = [
    "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.",
    "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.",
    "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
  ];
  const [y, m] = value.split("-");
  return `${monthsTH[Number(m) - 1]} ${Number(y) + 543}`;
}

async function loadMonths() {
  try {
    const res = await api.get("/dashboard/monthly-kpi");
    const unique = [...new Set(res.data.map((r) => r.month))].sort();
    months.value = unique;
  } catch (err) {
    console.error("Load months error:", err);
  }
}

async function loadByDepartment() {
  // อิงตามปีงบ global — ยังไม่มีปีงบ active ก็ยังไม่ต้องยิง (เหมือนหน้า Expense)
  if (!fiscalYearState.activeId) {
    divisions.value = [];
    unassignedDevices.value = [];
    return;
  }

  loading.value = true;
  error.value = null;

  try {
    const params = { fiscal_year_id: fiscalYearState.activeId };
    if (month.value) params.month = month.value;

    const res = await api.get("/dashboard/by-department", { params });

    divisions.value = res.data.divisions || [];
    unassignedDevices.value = res.data.unassignedDevices || [];
  } catch (err) {
    console.error("Load by-department error:", err);
    error.value = "โหลดข้อมูลไม่สำเร็จ";
    divisions.value = [];
    unassignedDevices.value = [];
  } finally {
    loading.value = false;
  }
}

// เปลี่ยนช่วงที่เทียบแนวโน้ม -> โหลดข้อมูลใหม่ (badge เพิ่มขึ้น/ลดลงของแต่ละแผนก)
watch(trendMonthSelection, () => {
  loadByDepartment();
});

// เปลี่ยนปีงบ (จาก Navbar, URL, หรือ back/forward) -> โหลดข้อมูลใหม่ทันที เหมือนหน้า Expense
watch(
  () => fiscalYearState.activeId,
  (id) => {
    if (id) loadByDepartment();
  },
  { immediate: true }
);

function toggleDivision(id) {
  const next = new Set(openDivisions.value);
  next.has(id) ? next.delete(id) : next.add(id);
  openDivisions.value = next;
}

function toggleDepartment(id) {
  const next = new Set(openDepartments.value);
  next.has(id) ? next.delete(id) : next.add(id);
  openDepartments.value = next;
}

function toggleDevice(id) {
  const next = new Set(openDevices.value);
  next.has(id) ? next.delete(id) : next.add(id);
  openDevices.value = next;
}

function toggleUnassigned() {
  showUnassigned.value = !showUnassigned.value;
}

// -------------------------------------------------------
// ค้นหา — กรองฝ่าย/แผนก/เครื่อง ตามคำค้น (ชื่อฝ่าย, ชื่อแผนก, รุ่น, S/N)
// -------------------------------------------------------
const filteredDivisions = computed(() => {
  const keyword = search.value.trim().toLowerCase();
  if (!keyword) return divisions.value;

  return divisions.value
    .map((division) => {
      const departments = (division.departments || [])
        .map((department) => {
          const deptMatches = department.name?.toLowerCase().includes(keyword);

          const devices = (department.devices || []).filter(
            (d) =>
              d.serial_number?.toLowerCase().includes(keyword) ||
              d.model?.toLowerCase().includes(keyword) ||
              d.brand_name?.toLowerCase().includes(keyword)
          );

          if (deptMatches || devices.length > 0) {
            return { ...department, devices: deptMatches ? department.devices : devices };
          }
          return null;
        })
        .filter(Boolean);

      const divisionMatches = division.name?.toLowerCase().includes(keyword);

      if (divisionMatches || departments.length > 0) {
        return { ...division, departments: divisionMatches ? division.departments : departments };
      }
      return null;
    })
    .filter(Boolean);
});

// -------------------------------------------------------
// ขยายทั้งหมด / ย่อทั้งหมด
// -------------------------------------------------------
function expandAll() {
  const divIds = new Set();
  const depIds = new Set();

  for (const division of filteredDivisions.value) {
    divIds.add(division.id);
    for (const department of division.departments || []) {
      depIds.add(department.id);
    }
  }

  openDivisions.value = divIds;
  openDepartments.value = depIds;
}

function collapseAll() {
  openDivisions.value = new Set();
  openDepartments.value = new Set();
  openDevices.value = new Set();
}

// -------------------------------------------------------
// Export Excel — hierarchy tree (ฝ่าย/แผนก/เครื่อง) 1 แถวต่อเครื่อง ยอดทั้งปีงบเสมอ
// (ตรงกับตัวเลขที่เห็นใน tree — ไม่ขึ้นกับ "ช่วงที่เทียบแนวโน้ม" เหมือนกับยอดรวมด้านบน)
// ใช้ divisions.value ทั้งหมด ไม่ตัดตามคำค้นหา ผู้ใช้มักอยากได้ข้อมูลครบไป export
// -------------------------------------------------------
function exportExcel() {
  const header = [
    "ฝ่าย",
    "แผนก",
    "S/N",
    "รุ่น",
    "ยี่ห้อ",
    "จำนวนหน้ารวม (ทั้งปีงบ)",
    "ค่าใช้จ่ายสุทธิรวม (ทั้งปีงบ)",
  ];

  const rows = [];
  for (const division of divisions.value) {
    for (const department of division.departments || []) {
      for (const device of department.devices || []) {
        rows.push([
          division.name,
          department.name,
          device.serial_number || "",
          device.model || "",
          device.brand_name || "",
          Number(device.total_pages || 0),
          Number(device.total_cost || 0),
        ]);
      }
    }
  }

  const worksheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "แยกตามฝ่าย-แผนก");
  XLSX.writeFile(workbook, "expense-by-department.xlsx");
}

// สีตามแนวโน้ม: แดง = ปริ้นเพิ่มขึ้น, เขียว = ปริ้นลดลง, เทา = เท่าเดิม, ไม่มีข้อมูล = ยังไม่มีใครกรอกเลย
function trendBadge(department) {
  const trend = department.trend;
  const pct = department.change_percent;

  const pctLabel = pct !== null && pct !== undefined ? ` ${Math.abs(pct).toFixed(1)}%` : "";

  if (trend === "up") return { icon: "trendUp", cls: "bg-red-100 text-red-700", label: `เพิ่มขึ้น${pctLabel}` };
  if (trend === "down") return { icon: "trendDown", cls: "bg-green-100 text-green-700", label: `ลดลง${pctLabel}` };
  if (trend === "no-data") return { icon: "questionCircle", cls: "bg-gray-100 text-gray-400", label: "ไม่มีข้อมูล" };

  if (pct === null && trend !== "no-data") {
    return { icon: "sparkles", cls: "bg-blue-100 text-[var(--brand-text)]", label: "ข้อมูลใหม่" };
  }

  return { icon: "minus", cls: "bg-gray-100 text-gray-600", label: "เท่าเดิม" };
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
    costChangePercent: department.cost_change_percent,
  };
}

const noDataCount = computed(() => {
  if (!month.value) return 0;
  let count = 0;
  for (const division of divisions.value) {
    for (const department of division.departments || []) {
      if (department.trend === "no-data") count++;
    }
  }
  return count;
});

const totalDepartmentCount = computed(() =>
  divisions.value.reduce((sum, d) => sum + (d.departments || []).length, 0)
);

const grandTotalCost = computed(() =>
  divisions.value.reduce((sum, d) => sum + Number(d.total_cost || 0), 0)
);

const grandTotalPages = computed(() =>
  divisions.value.reduce((sum, d) => sum + Number(d.total_pages || 0), 0)
);

// -------------------------------------------------------
// รายชื่อฝ่ายทั้งหมด และรายชื่อแผนกทั้งหมด ให้แต่ละ Picker เลือกแยกกัน
// -------------------------------------------------------
const divisionOptions = computed(() =>
  divisions.value.map((division) => ({ id: division.id, label: division.name }))
);

const departmentOptions = computed(() => {
  const opts = [];
  for (const division of divisions.value) {
    for (const department of division.departments || []) {
      opts.push({ id: department.id, label: `${department.name} (${division.name})` });
    }
  }
  return opts;
});

function findDepartment(id) {
  for (const division of divisions.value) {
    const dep = (division.departments || []).find((d) => d.id === id);
    if (dep) return { department: dep, division };
  }
  return null;
}

function findDivision(id) {
  return divisions.value.find((d) => d.id === id) || null;
}

// -------------------------------------------------------
// รวมรายการที่จะขึ้นกราฟ: ฝ่ายที่เลือก (รวมทุกแผนกในฝ่ายนั้น) + แผนกที่เลือกเจาะจง
// -------------------------------------------------------
const chartEntities = computed(() => {
  const list = [];

  for (const id of selectedDivisionIds.value) {
    const division = findDivision(id);
    if (!division) continue;
    const devices = (division.departments || []).flatMap((dep) => dep.devices || []);
    list.push({
      key: `div-${id}`,
      label: division.name,
      devices,
    });
  }

  for (const id of selectedDepartmentIds.value) {
    const found = findDepartment(id);
    if (!found) continue;
    list.push({
      key: `dep-${id}`,
      label: `${found.department.name} (${found.division.name})`,
      devices: found.department.devices || [],
    });
  }

  return list;
});

// -------------------------------------------------------
// กราฟเส้น: แนวโน้มค่าใช้จ่าย/จำนวนหน้าเป็นรายเดือน หนึ่งเส้นต่อฝ่าย/แผนกที่เลือก
// -------------------------------------------------------

// รวมยอดรายเดือน (ทั้งค่าใช้จ่ายและจำนวนหน้า) จาก device.monthly ของทุกเครื่องในรายการนั้น
function buildMonthlySeries(devices) {
  const byMonth = {};
  for (const device of devices) {
    for (const m of device.monthly || []) {
      if (!byMonth[m.month]) byMonth[m.month] = { cost: 0, pages: 0 };
      byMonth[m.month].cost += Number(m.total_cost || 0);
      byMonth[m.month].pages += Number(m.net_pages || 0);
    }
  }
  return byMonth;
}

// รวมเดือนทั้งหมดที่มีข้อมูลของทุกรายการที่เลือก ไว้ใช้เป็นแกน X ร่วมกัน + ตัวเลือกช่วง (zoom/pan)
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

// สร้างเส้นแนวโน้ม ทีละฝ่าย/แผนกที่เลือก — คนละสีเพื่อแยกดูง่าย
const linePalette = ["#2563EB", "#7C3AED", "#059669", "#D97706", "#DC2626", "#0891B2", "#DB2777", "#4B5563"];

const lineChartData = computed(() => {
  const labels = visibleChartMonths.value.map(formatMonth);
  const metricKey = chartMetric.value === "cost" ? "cost" : "pages";

  const datasets = chartEntities.value.map((entity, idx) => {
    const byMonth = buildMonthlySeries(entity.devices);
    const color = linePalette[idx % linePalette.length];

    // ค่า null สำหรับเดือนที่ยังไม่มีข้อมูล — spanGaps จะลากเส้นข้ามช่องว่างนั้นให้เอง
    const points = visibleChartMonths.value.map((m) =>
      byMonth[m] === undefined ? null : byMonth[m][metricKey]
    );

    return {
      label: entity.label,
      data: points,
      borderColor: color,
      backgroundColor: color,
      pointBackgroundColor: color,
      pointRadius: 3,
      pointHoverRadius: 5,
      borderWidth: 2,
      tension: 0.25,
      spanGaps: true,
    };
  });

  return { labels, datasets };
});

const lineChartOptions = computed(() => {
  const theme = baseChartOptions.value;

  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: {
        display: true,
        position: "bottom",
        labels: theme.plugins.legend.labels,
      },
      tooltip: {
        ...theme.plugins.tooltip,
        callbacks: {
          label(ctx) {
            const v = ctx.raw;
            const unit = chartMetric.value === "cost" ? "บาท" : "หน้า";
            if (v === null || v === undefined) return `${ctx.dataset.label}: ไม่มีข้อมูล`;
            return `${ctx.dataset.label}: ${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit}`;
          },
        },
      },
    },
    scales: {
      x: theme.scales.x,
      y: {
        ...theme.scales.y,
        beginAtZero: false,
        ticks: {
          ...theme.scales.y.ticks,
          callback(value) {
            return Number(value).toLocaleString();
          },
        },
      },
    },
  };
});

// -------------------------------------------------------
// เครื่องที่ใช้งานมาก/น้อย — ย้ายมาจากหน้า "เปรียบเทียบข้อมูลรายเดือน" (Compare.vue)
// เพราะเนื้อหา (ยอดพิมพ์สุทธิ + ค่าใช้จ่ายสุทธิ รายเครื่อง) เข้ากับหน้านี้มากกว่า —
// ต่างจาก Compare ตรงที่นี่คือยอดรวม "ทั้งปีงบ" (ไม่ใช่ยอดของเดือนที่เลือกเทียบ)
//
// ข้อมูลอุปกรณ์จาก /dashboard/by-department (divisions/unassignedDevices) ยังไม่มี
// อาคาร/ชั้น/สถานะเครื่อง เลยต้องโหลด /devices, /buildings, /floors, /brands เพิ่ม
// มาต่อ (join) กับ device id เอา — เหมือนที่ Compare.vue ทำกับ deviceMatchesFilters()
// -------------------------------------------------------
const usageBuildingFilter = ref("");
const usageFloorFilter = ref("");
const usageDivisionFilter = ref("");
const usageDepartmentFilter = ref("");
const usageBrandFilter = ref("");
const usageStatusFilter = ref("");
const usageSort = ref("desc"); // "desc" = มากไปน้อย, "asc" = น้อยไปมาก

const usageBuildings = ref([]);
const usageFloors = ref([]);
const usageBrands = ref([]);
const deviceDimensionById = ref(new Map()); // device_id -> { building_name, floor_name, status }

async function loadUsageFilterMasterData() {
  try {
    const [buildingRes, floorRes, brandRes, deviceRes] = await Promise.all([
      api.get("/buildings"),
      api.get("/floors"),
      api.get("/brands"),
      api.get("/devices"),
    ]);
    usageBuildings.value = buildingRes.data;
    usageFloors.value = floorRes.data;
    usageBrands.value = brandRes.data;
    deviceDimensionById.value = new Map(
      deviceRes.data.map((d) => [
        d.id,
        { building_name: d.building_name, floor_name: d.floor_name, status: d.status },
      ])
    );
  } catch (err) {
    console.error("Load usage filter master data error:", err);
  }
}

const usageBuildingOptions = computed(() => usageBuildings.value.map((b) => ({ value: b.name, label: b.name })));
const usageFilteredFloorOptions = computed(() => {
  if (!usageBuildingFilter.value) return usageFloors.value;
  const bld = usageBuildings.value.find((b) => b.name === usageBuildingFilter.value);
  if (!bld) return usageFloors.value;
  return usageFloors.value.filter((f) => Number(f.building_id) === Number(bld.id));
});
const usageFloorOptions = computed(() => {
  const seen = new Set();
  const options = [];
  for (const f of usageFilteredFloorOptions.value) {
    if (seen.has(f.name)) continue;
    seen.add(f.name);
    options.push({ value: f.name, label: f.name });
  }
  return options;
});
const usageDivisionOptions = computed(() => divisions.value.map((d) => ({ value: d.name, label: d.name })));
const usageFilteredDepartmentOptions = computed(() => {
  if (!usageDivisionFilter.value) {
    return divisions.value.flatMap((d) => d.departments || []);
  }
  const div = divisions.value.find((d) => d.name === usageDivisionFilter.value);
  return div ? div.departments || [] : [];
});
const usageDepartmentOptions = computed(() =>
  usageFilteredDepartmentOptions.value.map((d) => ({ value: d.name, label: d.name }))
);
const usageBrandOptions = computed(() => usageBrands.value.map((b) => ({ value: b.name, label: b.name })));

watch(usageBuildingFilter, () => {
  usageFloorFilter.value = "";
});
watch(usageDivisionFilter, () => {
  usageDepartmentFilter.value = "";
});

const hasActiveUsageFilter = computed(
  () =>
    !!(
      usageBuildingFilter.value ||
      usageFloorFilter.value ||
      usageDivisionFilter.value ||
      usageDepartmentFilter.value ||
      usageBrandFilter.value ||
      usageStatusFilter.value
    )
);

function resetUsageFilter() {
  usageBuildingFilter.value = "";
  usageFloorFilter.value = "";
  usageDivisionFilter.value = "";
  usageDepartmentFilter.value = "";
  usageBrandFilter.value = "";
  usageStatusFilter.value = "";
}

// รวมเครื่องทั้งหมดจากทุกฝ่าย/แผนก (รวมเครื่องที่ยังไม่ได้ผูกฝ่าย/แผนกด้วย) เป็น list แบนราบเดียว
const allDevicesFlat = computed(() => {
  const list = [];
  for (const division of divisions.value) {
    for (const department of division.departments || []) {
      for (const device of department.devices || []) {
        list.push({ ...device, divisionName: division.name, departmentName: department.name });
      }
    }
  }
  for (const device of unassignedDevices.value) {
    list.push({ ...device, divisionName: "", departmentName: "" });
  }
  return list;
});

function usageDeviceMatchesFilters(device) {
  const dim = deviceDimensionById.value.get(device.id) || {};
  if (usageBuildingFilter.value && dim.building_name !== usageBuildingFilter.value) return false;
  if (usageFloorFilter.value && dim.floor_name !== usageFloorFilter.value) return false;
  if (usageDivisionFilter.value && device.divisionName !== usageDivisionFilter.value) return false;
  if (usageDepartmentFilter.value && device.departmentName !== usageDepartmentFilter.value) return false;
  if (usageBrandFilter.value && device.brand_name !== usageBrandFilter.value) return false;
  if (usageStatusFilter.value && dim.status !== usageStatusFilter.value) return false;
  return true;
}

const deviceUsageFiltered = computed(() =>
  allDevicesFlat.value
    .filter((d) => usageDeviceMatchesFilters(d))
    .map((d) => ({
      ...d,
      buildingName: deviceDimensionById.value.get(d.id)?.building_name || "",
    }))
);

const deviceUsageSorted = computed(() => {
  const list = [...deviceUsageFiltered.value];
  list.sort((a, b) =>
    usageSort.value === "desc" ? b.total_pages - a.total_pages : a.total_pages - b.total_pages
  );
  return list;
});

function toggleUsageSort() {
  usageSort.value = usageSort.value === "desc" ? "asc" : "desc";
}

// -------------------------------------------------------
// Export Excel — ตาราง "เครื่องที่ใช้งานมาก/น้อย" ใช้ deviceUsageSorted (กรอง+เรียงแล้ว
// ตามตัวกรองเจาะจงด้านล่าง/ปุ่มมาก-น้อย) ไม่ตัดตาม pagination เหมือน DataTable.vue
// -------------------------------------------------------
function exportUsageExcel() {
  const header = [
    "อันดับ",
    "หมายเลขเครื่อง",
    "อาคาร",
    "ฝ่าย",
    "แผนก",
    "ยอดพิมพ์สุทธิ (หน้า)",
    "ค่าใช้จ่ายสุทธิ (บาท)",
  ];

  const rows = deviceUsageSorted.value.map((d, idx) => [
    idx + 1,
    d.serial_number || "",
    d.buildingName || "",
    d.divisionName || "",
    d.departmentName || "",
    Number(d.total_pages || 0),
    Number(d.total_cost || 0),
  ]);

  const worksheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "เครื่องมาก-น้อย");
  XLSX.writeFile(workbook, `device-usage-ranking-${usageSort.value}.xlsx`);
}

// -------------------------------------------------------
// Pagination — 10 รายการ/หน้า (ตามค่า default ของ DataTable.vue ที่หน้าอื่นๆ ใช้)
// ตารางนี้ไม่ได้ใช้ DataTable.vue เพราะคอลัมน์ "อันดับ" ต้องอิงลำดับตาม usageSort เดิม
// (มากไปน้อย/น้อยไปมาก) ไม่ใช่ sort ทั่วไปแบบคลิกหัวคอลัมน์ของ DataTable
// -------------------------------------------------------
const usagePageSizeOptions = [10, 20, 50, 100];
const usagePageSize = ref(10);
const usagePage = ref(1);

const usageTotalPages = computed(() =>
  Math.max(1, Math.ceil(deviceUsageSorted.value.length / usagePageSize.value))
);

const deviceUsagePaginated = computed(() => {
  const start = (usagePage.value - 1) * usagePageSize.value;
  return deviceUsageSorted.value.slice(start, start + usagePageSize.value);
});

// รีเซ็ตกลับหน้า 1 ทุกครั้งที่ filter/sort/ขนาดหน้าเปลี่ยน ไม่งั้นอาจค้างอยู่หน้าที่ไม่มีข้อมูลแล้ว
watch([deviceUsageFiltered, usageSort, usagePageSize], () => {
  usagePage.value = 1;
});

watch(usageTotalPages, (tp) => {
  if (usagePage.value > tp) usagePage.value = tp;
});

onMounted(async () => {
  // โหลดข้อมูลหลักผ่าน watch(fiscalYearState.activeId, { immediate: true }) ด้านบนแล้ว
  // (แบบเดียวกับหน้า Expense) ตรงนี้แค่โหลดรายชื่อเดือนสำหรับ MonthPicker เพิ่ม
  await loadMonths();
  await loadUsageFilterMasterData();
});
</script>

<template>
  <div>
    <!-- ไม่มี h1 ซ้ำแล้ว — ชื่อหน้านี้ขึ้นเป็นแท็บ "ยอดพิมพ์แยกตามฝ่าย/แผนก" ใน UsageReport.vue อยู่แล้ว -->
    <p class="text-sm text-gray-500 mb-6">ตัวเลขในหน้านี้ (ทั้งจำนวนหน้าและค่าใช้จ่าย) เป็นยอดสุทธิหลังหัก 20% ทั้งหมด</p>

    <!-- แถบควบคุม — ย้ายมาไว้ก่อนสรุปยอดรวม (control ก่อนผลลัพธ์) ให้เรียงลำดับแบบเดียวกับ
         Dashboard/Compare/Report ทั้งแอป: เลือกตัวกรองก่อน แล้วค่อยเห็นตัวเลข ไม่ใช่เจอยอดรวม
         ก่อนแล้วมาเจอตัวกรองข้างล่างที่ทำให้ยอดรวมด้านบน "กระโดด" เปลี่ยนโดยไม่ทันสังเกต -->
    <div class="bg-gray-50 shadow rounded-lg p-4 mb-6 flex items-center gap-4 flex-wrap">
      <div class="w-64">
        <label class="block text-xs text-gray-500 mb-1">ช่วงที่เทียบแนวโน้ม</label>
        <MonthPicker v-model="trendMonthSelection" :options="months" />
      </div>

      <div class="flex-1 min-w-[200px]">
        <label class="block text-xs text-gray-500 mb-1">ค้นหา (ฝ่าย/แผนก/รุ่น/S-N)</label>
        <input
          v-model="search"
          type="text"
          placeholder="พิมพ์เพื่อค้นหา..."
          class="border rounded p-2 w-full bg-gray-50"
        />
      </div>

      <div class="flex gap-2">
        <button
          @click="expandAll"
          type="button"
          class="border border-gray-300 text-gray-600 px-3 py-2 rounded hover:bg-gray-50 text-sm"
        >
          ขยายทั้งหมด
        </button>
        <button
          @click="collapseAll"
          type="button"
          class="border border-gray-300 text-gray-600 px-3 py-2 rounded hover:bg-gray-50 text-sm"
        >
          ย่อทั้งหมด
        </button>
        <button
          v-if="divisions.length"
          @click="exportExcel"
          type="button"
          class="border border-gray-300 text-gray-600 px-3 py-2 rounded hover:bg-gray-50 text-sm whitespace-nowrap"
          title="ดาวน์โหลดเป็นไฟล์ Excel (.xlsx)"
        >
          ⬇ Export Excel
        </button>
      </div>
    </div>

    <!-- สรุปยอดรวมทั้งหมด — ยอดนี้อ้างอิงทั้งปีงบเสมอ ไม่ขึ้นกับ "ช่วงที่เทียบแนวโน้ม" ด้านบน
         (backend ไม่กรองยอดนี้ตาม month) จึงเป็นเลขนิ่งๆ ไว้เทียบอ้างอิงได้ตลอด -->
    <div
      v-if="!loading && divisions.length"
      class="bg-gray-50 shadow rounded-lg p-5 mb-6 flex flex-wrap items-center gap-6"
    >
      <div class="flex items-center gap-3">
        <div class="w-11 h-11 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center shrink-0">
          <AppIcon name="building" class="w-5 h-5" />
        </div>
        <div>
          <div class="text-sm text-gray-500">ปีงบ</div>
          <div class="text-2xl font-bold text-gray-700 leading-tight">
            {{ activeFiscalYear?.year ?? "-" }}
          </div>
        </div>
      </div>

      <div class="w-px h-10 bg-gray-200 hidden sm:block"></div>

      <div class="flex items-center gap-3">
        <div class="w-11 h-11 rounded-full bg-blue-100 text-[var(--brand-text)] flex items-center justify-center shrink-0">
          <AppIcon name="folder" class="w-5 h-5" />
        </div>
        <div>
          <div class="text-sm text-gray-500">รวมค่าใช้จ่ายสุทธิ (หัก 20%)</div>
          <div class="text-2xl font-bold text-[var(--brand-text)] leading-tight">
            {{ formatMoney(grandTotalCost) }} <span class="text-base font-medium text-gray-500">บาท</span>
          </div>
        </div>
      </div>

      <div class="w-px h-10 bg-gray-200 hidden sm:block"></div>

      <div class="flex items-center gap-3">
        <div class="w-11 h-11 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center shrink-0">
          <AppIcon name="printer" class="w-5 h-5" />
        </div>
        <div>
          <div class="text-sm text-gray-500">รวมจำนวนหน้าสุทธิ</div>
          <div class="text-2xl font-bold text-gray-700 leading-tight">
            {{ grandTotalPages.toLocaleString() }} <span class="text-base font-medium text-gray-500">หน้า</span>
          </div>
        </div>
      </div>
    </div>

    <!-- สรุปแผนกที่ยังไม่มีข้อมูลในช่วงนี้ -->
    <div
      v-if="month && noDataCount > 0"
      class="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-6 text-sm text-yellow-800 flex items-center gap-1.5"
    >
      <AppIcon name="warning" class="w-4 h-4 shrink-0" />
      มี {{ noDataCount }} จาก {{ totalDepartmentCount }} แผนก ที่ยังไม่มีข้อมูลยอดพิมพ์ในช่วงนี้ (ทั้งช่วงนี้และช่วงก่อนหน้า)
    </div>

    <div v-if="loading" class="text-center text-gray-500 py-10">กำลังโหลดข้อมูล...</div>
    <div v-else-if="error" class="bg-red-100 text-red-700 p-4 rounded">{{ error }}</div>

    <template v-else>
      <!-- เปรียบเทียบฝ่าย/แผนก — เลือกฝ่ายและแผนกแยกกันคนละ filter แล้วแสดงเป็นกราฟเส้นตามที่เลือก -->
      <div class="bg-gray-50 shadow rounded-lg p-4 mb-6">
        <div class="flex items-center justify-between mb-3 flex-wrap gap-3">
          <h2 class="font-semibold">เปรียบเทียบฝ่าย/แผนก</h2>

          <div class="flex items-center gap-3 flex-wrap">
            <div class="w-64">
              <label class="block text-xs text-gray-500 mb-1">เลือกฝ่าย</label>
              <DepartmentPicker v-model="selectedDivisionIds" :options="divisionOptions" />
            </div>

            <div class="w-64">
              <label class="block text-xs text-gray-500 mb-1">เลือกแผนก</label>
              <DepartmentPicker v-model="selectedDepartmentIds" :options="departmentOptions" />
            </div>

            <div class="flex gap-2 text-sm self-end">
              <button
                @click="chartMetric = 'cost'"
                class="px-3 py-1 rounded-full"
                :class="chartMetric === 'cost' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'"
              >
                ค่าใช้จ่าย
              </button>
              <button
                @click="chartMetric = 'pages'"
                class="px-3 py-1 rounded-full"
                :class="chartMetric === 'pages' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'"
              >
                จำนวนหน้า
              </button>
            </div>
          </div>
        </div>

        <div v-if="!chartEntities.length" class="text-center text-gray-400 py-10 border border-dashed rounded-lg">
          เลือกฝ่ายและ/หรือแผนกอย่างน้อย 1 รายการด้านบนเพื่อเปรียบเทียบ
        </div>

        <div v-else-if="!allChartMonths.length" class="text-center text-gray-400 py-10 border border-dashed rounded-lg">
          รายการที่เลือกยังไม่มีข้อมูลรายเดือนพอที่จะสร้างกราฟ
        </div>

        <template v-else>
          <div class="flex items-center gap-3 flex-wrap mb-3 text-sm">
            <span class="text-gray-500">ช่วงที่แสดง (zoom/pan):</span>
            <select v-model.number="rangeStartIdx" class="border rounded px-2 py-1 bg-gray-50">
              <option v-for="(m, i) in allChartMonths" :key="'s' + m" :value="i">{{ formatMonth(m) }}</option>
            </select>
            <span class="text-gray-400">ถึง</span>
            <select v-model.number="rangeEndIdx" class="border rounded px-2 py-1 bg-gray-50">
              <option v-for="(m, i) in allChartMonths" :key="'e' + m" :value="i">{{ formatMonth(m) }}</option>
            </select>
            <span class="text-xs text-gray-400">
              แต่ละเส้น = 1 ฝ่าย/แผนก &nbsp;•&nbsp; ชี้ที่จุดเพื่อดูค่าของเดือนนั้น
            </span>
          </div>
          <div class="h-80">
            <Line :data="lineChartData" :options="lineChartOptions" />
          </div>
        </template>
      </div>

      <div v-if="!filteredDivisions.length" class="text-center text-gray-400 border border-dashed rounded-lg py-10">
        {{ search ? "ไม่พบผลลัพธ์ที่ตรงกับคำค้นหา" : "ยังไม่มีข้อมูลฝ่าย/แผนก" }}
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="division in filteredDivisions"
          :key="division.id"
          class="bg-gray-50 shadow rounded-lg overflow-hidden"
        >
          <!-- ระดับ 1: ฝ่าย -->
          <button
            @click="toggleDivision(division.id)"
            class="w-full flex items-center justify-between p-4 hover:bg-gray-50 text-left"
          >
            <div class="flex items-center gap-2">
              <AppIcon name="building" class="w-4 h-4 text-gray-400 shrink-0" />
              <span class="font-semibold">{{ division.name }}</span>
              <span class="text-xs text-gray-400">
                ({{ (division.departments || []).length }} แผนก)
              </span>
            </div>
            <div class="flex items-center gap-4">
              <span class="font-bold text-[var(--brand-text)]">{{ formatMoney(division.total_cost) }} บาท</span>
              <ChevronIcon :open="openDivisions.has(division.id)" />
            </div>
          </button>

          <!-- ระดับ 2: แผนก (เรียงค่าใช้จ่ายมาก -> น้อยจาก backend แล้ว) -->
          <div v-if="openDivisions.has(division.id)" class="border-t divide-y">
            <div v-if="!(division.departments || []).length" class="p-4 text-gray-400 text-sm">
              ไม่มีแผนกในฝ่ายนี้
            </div>

            <div v-for="department in division.departments" :key="department.id">
              <button
                @click="toggleDepartment(department.id)"
                class="w-full flex items-center justify-between p-3 pl-8 hover:bg-gray-50 text-left"
              >
                <div class="flex-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <AppIcon name="folder" class="w-4 h-4 text-gray-400 shrink-0" />
                    <span class="font-medium">{{ department.name }}</span>
                    <span class="text-xs text-gray-400">
                      ({{ (department.devices || []).length }} เครื่อง)
                    </span>
                    <span
                      v-if="month && department.trend"
                      class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full whitespace-nowrap"
                      :class="trendBadge(department).cls"
                    >
                      <AppIcon :name="trendBadge(department).icon" class="w-3 h-3 shrink-0" />
                      {{ trendBadge(department).label }}
                    </span>
                  </div>

                  <div
                    v-if="month && trendDetail(department)"
                    class="text-xs text-gray-500 mt-1 flex flex-wrap gap-x-4 gap-y-0.5"
                  >
                    <span>
                      ช่วงนี้ {{ formatPages(trendDetail(department).currentPages) }} หน้า
                      ({{ formatMoney(trendDetail(department).currentCost) }} บาท)
                    </span>
                    <span>
                      ช่วงก่อนหน้า {{ formatPages(trendDetail(department).previousPages) }} หน้า
                      ({{ formatMoney(trendDetail(department).previousCost) }} บาท)
                    </span>
                    <span
                      :class="trendDetail(department).pagesDiff > 0 ? 'text-red-600' : trendDetail(department).pagesDiff < 0 ? 'text-green-600' : ''"
                    >
                      ต่างกัน {{ trendDetail(department).pagesDiff > 0 ? '+' : '' }}{{ formatPages(trendDetail(department).pagesDiff) }} หน้า
                      ({{ trendDetail(department).costDiff > 0 ? '+' : '' }}{{ formatMoney(trendDetail(department).costDiff) }} บาท)
                    </span>
                  </div>
                </div>
                <div class="flex items-center gap-4">
                  <span class="font-semibold text-gray-700">{{ formatMoney(department.total_cost) }} บาท</span>
                  <ChevronIcon :open="openDepartments.has(department.id)" />
                </div>
              </button>

              <!-- ระดับ 3: เครื่อง -->
              <div v-if="openDepartments.has(department.id)" class="pl-14 pr-4 pb-3 divide-y">
                <div v-if="!(department.devices || []).length" class="text-gray-400 text-sm py-2">
                  ไม่มีเครื่องในแผนกนี้
                </div>

                <div v-for="device in department.devices" :key="device.id">
                  <button
                    @click="toggleDevice(device.id)"
                    class="w-full flex items-center justify-between py-2 hover:bg-gray-50 text-left"
                  >
                    <div class="flex items-center gap-2">
                      <AppIcon name="printer" class="w-4 h-4 text-gray-400 shrink-0" />
                      <span>{{ device.brand_name || "-" }} {{ device.model || "" }}</span>
                      <span class="text-xs text-gray-400">S/N: {{ device.serial_number }}</span>
                      <span
                        v-if="device.moved_during_period"
                        class="text-xs bg-amber-100 text-amber-700 rounded px-1.5 py-0.5"
                        title="เครื่องนี้ย้ายแผนกระหว่างช่วงเวลาที่ดูอยู่ — ยอดพิมพ์แต่ละเดือนแยกไปตามแผนกที่สังกัดตอนนั้นจริงๆ"
                      >
                        ย้ายแผนกระหว่างช่วงนี้
                      </span>
                    </div>
                    <div class="flex items-center gap-4">
                      <span class="text-sm text-gray-700">{{ formatMoney(device.total_cost) }} บาท</span>
                      <ChevronIcon :open="openDevices.has(device.id)" />
                    </div>
                  </button>

                  <table v-if="openDevices.has(device.id) && (device.monthly || []).length" class="w-full text-sm border-collapse mb-2">
                    <thead>
                      <tr class="text-gray-500 text-left">
                        <th class="py-1">เดือน</th>
                        <th class="py-1 text-right">หน้าสุทธิ</th>
                        <th class="py-1 text-right">ค่าใช้จ่าย</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="m in device.monthly" :key="m.month" class="border-t">
                        <td class="py-1">{{ formatMonth(m.month) }}</td>
                        <td class="py-1 text-right">{{ Number(m.net_pages).toLocaleString(undefined, {maximumFractionDigits:0}) }}</td>
                        <td class="py-1 text-right">{{ formatMoney(m.total_cost) }} บาท</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- เครื่องที่ใช้งานมาก/น้อย — ย้ายมาจากหน้า "เปรียบเทียบข้อมูลรายเดือน" พร้อม filter ชุดเดียวกัน -->
    <div class="bg-gray-50 shadow rounded-lg p-4 mt-8">
      <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 class="font-bold flex items-center gap-1.5">
          <AppIcon name="printer" class="w-5 h-5 shrink-0" />
          เครื่องที่ใช้งานมาก / น้อย
        </h2>

        <!-- ตัวเลือกจำนวนแถว/หน้า อยู่บนสุดคู่กับปุ่มเรียง — เห็นและปรับได้ทันทีก่อนไล่ดูตารางยาวๆ ด้านล่าง -->
        <div class="flex items-center gap-2 flex-wrap">
          <div v-if="deviceUsageSorted.length" class="flex items-center gap-2 text-sm text-gray-500">
            <span>พบ {{ deviceUsageSorted.length.toLocaleString() }} เครื่อง</span>
            <select v-model="usagePageSize" class="border rounded px-2 py-1 text-sm bg-gray-50">
              <option v-for="n in usagePageSizeOptions" :key="n" :value="n">{{ n }} รายการ/หน้า</option>
            </select>
          </div>

          <button
            @click="toggleUsageSort"
            class="text-sm border rounded px-3 py-1.5 hover:bg-gray-100 flex items-center gap-1"
          >
            {{ usageSort === "desc" ? "เรียง: ใช้มากไปน้อย" : "เรียง: ใช้น้อยไปมาก" }}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="w-3.5 h-3.5"
            >
              <path v-if="usageSort === 'desc'" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              <path v-else d="M4.5 15.75l7.5-7.5 7.5 7.5" />
            </svg>
          </button>

          <button
            v-if="deviceUsageSorted.length"
            @click="exportUsageExcel"
            type="button"
            class="text-sm border rounded px-3 py-1.5 hover:bg-gray-100 whitespace-nowrap"
            title="ดาวน์โหลดเป็นไฟล์ Excel (.xlsx)"
          >
            ⬇ Export Excel
          </button>
        </div>
      </div>

      <p class="text-xs text-gray-500 mb-3">
        รวมยอดพิมพ์สุทธิและค่าใช้จ่ายสุทธิของแต่ละเครื่องตลอดปีงบที่เลือกไว้ด้านบน
      </p>

      <!-- Filter เจาะจง — อาคาร/ชั้น/ฝ่าย/แผนก/ยี่ห้อ/สถานะเครื่อง เหมือนหน้าเปรียบเทียบข้อมูลรายเดือน -->
      <div class="flex flex-wrap items-end gap-3 mb-4 pb-4 border-b">
        <div>
          <label class="block text-xs text-gray-500 mb-1">อาคาร</label>
          <SearchableSelect
            v-model="usageBuildingFilter"
            :options="usageBuildingOptions"
            placeholder="ทุกอาคาร"
            search-placeholder="พิมพ์ชื่ออาคาร..."
          />
        </div>

        <div>
          <label class="block text-xs text-gray-500 mb-1">ชั้น</label>
          <SearchableSelect
            v-model="usageFloorFilter"
            :options="usageFloorOptions"
            placeholder="ทุกชั้น"
            search-placeholder="พิมพ์ชื่อชั้น..."
          />
        </div>

        <div>
          <label class="block text-xs text-gray-500 mb-1">ฝ่าย</label>
          <SearchableSelect
            v-model="usageDivisionFilter"
            :options="usageDivisionOptions"
            placeholder="ทุกฝ่าย"
            search-placeholder="พิมพ์ชื่อฝ่าย..."
          />
        </div>

        <div>
          <label class="block text-xs text-gray-500 mb-1">แผนก</label>
          <SearchableSelect
            v-model="usageDepartmentFilter"
            :options="usageDepartmentOptions"
            placeholder="ทุกแผนก"
            search-placeholder="พิมพ์ชื่อแผนก..."
          />
        </div>

        <div>
          <label class="block text-xs text-gray-500 mb-1">ยี่ห้อ</label>
          <SearchableSelect
            v-model="usageBrandFilter"
            :options="usageBrandOptions"
            placeholder="ทุกยี่ห้อ"
            search-placeholder="พิมพ์ชื่อยี่ห้อ..."
          />
        </div>

        <div>
          <label class="block text-xs text-gray-500 mb-1">สถานะเครื่อง</label>
          <select v-model="usageStatusFilter" class="border rounded p-2 text-sm bg-gray-50">
            <option value="">ทุกสถานะ</option>
            <option value="active">ใช้งานอยู่</option>
            <option value="repair">ซ่อมบำรุง</option>
            <option value="retired">ปลดระวาง</option>
          </select>
        </div>

        <button
          v-if="hasActiveUsageFilter"
          @click="resetUsageFilter"
          class="text-sm text-red-500 hover:text-gray-700 underline whitespace-nowrap"
        >
          ล้างตัวกรองทั้งหมด
        </button>
        
      </div>

      <div v-if="!deviceUsageSorted.length" class="text-center text-gray-400 py-6 text-sm">
        ไม่มีข้อมูลเครื่องตรงกับตัวกรองที่เลือก
      </div>

      
      <template v-else>
        <div class="overflow-x-auto">
          <table class="w-full text-sm border-collapse min-w-max">
            <thead>
              <tr class="text-left text-gray-500 border-b">
                <th class="py-2 pr-4">อันดับ</th>
                <th class="py-2 pr-4">หมายเลขเครื่อง</th>
                <th class="py-2 pr-4">อาคาร</th>
                <th class="py-2 pr-4">ฝ่าย/แผนก</th>
                <th class="py-2 pr-4 text-right">ยอดพิมพ์สุทธิ (หน้า)</th>
                <th class="py-2 pr-4 text-right">ค่าใช้จ่ายสุทธิ (บาท)</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(d, idx) in deviceUsagePaginated"
                :key="d.id"
                class="border-b"
              >
                <td class="py-2 pr-4 text-gray-400">{{ (usagePage - 1) * usagePageSize + idx + 1 }}</td>
                <td class="py-2 pr-4 font-medium">{{ d.serial_number || "-" }}</td>
                <td class="py-2 pr-4 text-gray-500">{{ d.buildingName || "-" }}</td>
                <td class="py-2 pr-4 text-gray-500">
                  {{ d.departmentName ? `${d.departmentName} (${d.divisionName})` : "ไม่ได้ผูกฝ่าย/แผนก" }}
                </td>
                <td class="py-2 pr-4 text-right">
                  {{ Number(d.total_pages || 0).toLocaleString(undefined, { maximumFractionDigits: 0 }) }}
                </td>
                <td class="py-2 pr-4 text-right">
                  {{ formatMoney(d.total_cost) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination — ตัวเลือกจำนวนแถว/หน้าย้ายขึ้นไปอยู่บนสุดแล้ว เหลือแค่ปุ่มเปลี่ยนหน้าตรงนี้ -->
        <div v-if="usageTotalPages > 1" class="flex items-center justify-center gap-2 mt-4">
          <button
            class="border px-3 py-1 rounded disabled:opacity-40"
            :disabled="usagePage === 1"
            @click="usagePage = 1"
          >
            « แรก
          </button>
          <button
            class="border px-3 py-1 rounded disabled:opacity-40"
            :disabled="usagePage === 1"
            @click="usagePage--"
          >
            ก่อนหน้า
          </button>

          <span class="text-sm text-gray-600 px-2">หน้า {{ usagePage }} / {{ usageTotalPages }}</span>

          <button
            class="border px-3 py-1 rounded disabled:opacity-40"
            :disabled="usagePage === usageTotalPages"
            @click="usagePage++"
          >
            ถัดไป
          </button>
          <button
            class="border px-3 py-1 rounded disabled:opacity-40"
            :disabled="usagePage === usageTotalPages"
            @click="usagePage = usageTotalPages"
          >
            สุดท้าย »
          </button>
        </div>
      </template>
    </div>

    <!-- เครื่องที่ยังไม่ได้ผูกฝ่าย/แผนก -->
    <div v-if="unassignedDevices.length" class="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg overflow-hidden">
      <button
        @click="toggleUnassigned"
        class="w-full flex items-center justify-between p-4 hover:bg-yellow-100 text-left"
      >
        <div class="flex items-center gap-2">
          <AppIcon name="warning" class="w-4 h-4 text-yellow-600 shrink-0" />
          <span class="font-semibold text-yellow-800">
            เครื่องที่ยังไม่ได้ผูกฝ่าย/แผนก ({{ unassignedDevices.length }} เครื่อง)
          </span>
        </div>
        <div class="flex items-center gap-4">
          <span class="font-bold text-yellow-800">
            {{ formatMoney(unassignedDevices.reduce((s, d) => s + Number(d.total_cost || 0), 0)) }} บาท
          </span>
          <ChevronIcon :open="showUnassigned" class="text-yellow-700" />
        </div>
      </button>

      <div v-if="showUnassigned" class="border-t divide-y bg-gray-50">
        <div v-for="device in unassignedDevices" :key="device.id" class="p-3 pl-8 flex items-center justify-between">
          <div>
            <span class="font-medium">{{ device.brand_name || "-" }} {{ device.model || "" }}</span>
            <span class="text-xs text-gray-400 ml-2">S/N: {{ device.serial_number }}</span>
          </div>
          <span class="text-gray-700">{{ formatMoney(device.total_cost) }} บาท</span>
        </div>
      </div>
    </div>
  </div>
</template>