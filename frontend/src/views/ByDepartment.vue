<script setup>
import { ref, onMounted, computed, watch } from "vue";
import ChevronIcon from "../components/ChevronIcon.vue";
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
import { useChartTheme } from "../composables/useChartTheme";

const { baseChartOptions } = useChartTheme();

ChartJS.register(Title, Tooltip, Legend, LineElement, PointElement, CategoryScale, LinearScale);

const loading = ref(false);
const error = ref(null);

const months = ref([]);
const search = ref("");
const chartMetric = ref("cost"); // cost | pages

// เดือนที่เทียบแนวโน้ม — ใช้ MonthPicker แบบเดียวกับหน้า "เปรียบเทียบข้อมูลรายเดือน" (จำกัดเลือกได้ 1 เดือน)
const trendMonthSelection = ref([]);
const month = computed(() => trendMonthSelection.value[0] || "");

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
  loading.value = true;
  error.value = null;

  try {
    const params = {};
    if (month.value) params.month = month.value;

    const res = await api.get("/dashboard/by-department", { params });

    divisions.value = res.data.divisions || [];
    unassignedDevices.value = res.data.unassignedDevices || [];
  } catch (err) {
    console.error("Load by-department error:", err);
    error.value = "โหลดข้อมูลไม่สำเร็จ";
  } finally {
    loading.value = false;
  }
}

// เปลี่ยนเดือนที่เทียบแนวโน้ม -> โหลดข้อมูลใหม่ (badge เพิ่มขึ้น/ลดลงของแต่ละแผนก)
watch(trendMonthSelection, () => {
  loadByDepartment();
});

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

// สีตามแนวโน้ม: แดง = ปริ้นเพิ่มขึ้น, เขียว = ปริ้นลดลง, เทา = เท่าเดิม, ไม่มีข้อมูล = ยังไม่มีใครกรอกเลย
function trendBadge(department) {
  const trend = department.trend;
  const pct = department.change_percent;

  const pctLabel = pct !== null && pct !== undefined ? ` ${Math.abs(pct).toFixed(1)}%` : "";

  if (trend === "up") return { icon: "📈", cls: "bg-red-100 text-red-700", label: `เพิ่มขึ้น${pctLabel}` };
  if (trend === "down") return { icon: "📉", cls: "bg-green-100 text-green-700", label: `ลดลง${pctLabel}` };
  if (trend === "no-data") return { icon: "❔", cls: "bg-gray-100 text-gray-400", label: "ไม่มีข้อมูล" };

  if (pct === null && trend !== "no-data") {
    return { icon: "🆕", cls: "bg-blue-100 text-[var(--brand-text)]", label: "ข้อมูลใหม่" };
  }

  return { icon: "➖", cls: "bg-gray-100 text-gray-600", label: "เท่าเดิม" };
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
      label: `🏢 ${division.name}`,
      devices,
    });
  }

  for (const id of selectedDepartmentIds.value) {
    const found = findDepartment(id);
    if (!found) continue;
    list.push({
      key: `dep-${id}`,
      label: `📁 ${found.department.name} (${found.division.name})`,
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

onMounted(async () => {
  await loadMonths();
  await loadByDepartment();
});
</script>

<template>
  <div>
    <h1 class="text-2xl font-bold mb-6">ยอดพิมพ์แยกตามฝ่าย/แผนก</h1>

    <!-- แถบควบคุม -->
    <div class="bg-gray-50 shadow rounded-lg p-4 mb-6 flex items-center gap-4 flex-wrap">
      <div class="w-64">
        <label class="block text-xs text-gray-500 mb-1">เดือนที่เทียบแนวโน้ม</label>
        <MonthPicker v-model="trendMonthSelection" :options="months" :max="1" />
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
      </div>

      <div v-if="!loading && divisions.length" class="ml-auto text-right">
        <div class="text-sm text-gray-500">รวมค่าใช้จ่ายทั้งหมด</div>
        <div class="text-xl font-bold text-[var(--brand-text)]">{{ formatMoney(grandTotalCost) }} บาท</div>
        <div class="text-xs text-gray-400">รวม {{ grandTotalPages.toLocaleString() }} หน้า</div>
      </div>
    </div>

    <!-- สรุปแผนกที่ยังไม่มีข้อมูลเดือนนี้ -->
    <div
      v-if="month && noDataCount > 0"
      class="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-6 text-sm text-yellow-800"
    >
      ⚠️ มี {{ noDataCount }} จาก {{ totalDepartmentCount }} แผนก ที่ยังไม่มีข้อมูลยอดพิมพ์ในเดือนนี้ (ทั้งเดือนนี้และเดือนก่อน)
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
              <span class="text-lg">🏢</span>
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
                    <span>📁</span>
                    <span class="font-medium">{{ department.name }}</span>
                    <span class="text-xs text-gray-400">
                      ({{ (department.devices || []).length }} เครื่อง)
                    </span>
                    <span
                      v-if="month && department.trend"
                      class="text-xs px-2 py-0.5 rounded-full whitespace-nowrap"
                      :class="trendBadge(department).cls"
                    >
                      {{ trendBadge(department).icon }} {{ trendBadge(department).label }}
                    </span>
                  </div>

                  <div
                    v-if="month && trendDetail(department)"
                    class="text-xs text-gray-500 mt-1 flex flex-wrap gap-x-4 gap-y-0.5"
                  >
                    <span>
                      เดือนนี้ {{ formatPages(trendDetail(department).currentPages) }} หน้า
                      ({{ formatMoney(trendDetail(department).currentCost) }} บาท)
                    </span>
                    <span>
                      เดือนก่อน {{ formatPages(trendDetail(department).previousPages) }} หน้า
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
                      <span>🖨️</span>
                      <span>{{ device.brand_name || "-" }} {{ device.model || "" }}</span>
                      <span class="text-xs text-gray-400">S/N: {{ device.serial_number }}</span>
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

    <!-- เครื่องที่ยังไม่ได้ผูกฝ่าย/แผนก -->
    <div v-if="unassignedDevices.length" class="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg overflow-hidden">
      <button
        @click="toggleUnassigned"
        class="w-full flex items-center justify-between p-4 hover:bg-yellow-100 text-left"
      >
        <div class="flex items-center gap-2">
          <span>⚠️</span>
          <span class="font-semibold text-yellow-800">
            เครื่องที่ยังไม่ได้ผูกฝ่าย/แผนก ({{ unassignedDevices.length }} เครื่อง)
          </span>
        </div>
        <ChevronIcon :open="showUnassigned" />
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