<script setup>
import { ref, computed, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
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
import MonthPicker from "../components/MonthPicker.vue";
import SearchableSelect from "../components/SearchableSelect.vue";
import AppIcon from "../components/AppIcon.vue";
import { useChartTheme } from "../composables/useChartTheme";
import { formatMonthTH } from "@suth/domain";

const { baseChartOptions } = useChartTheme();

ChartJS.register(Title, Tooltip, Legend, LineElement, PointElement, CategoryScale, LinearScale);

const route = useRoute();
const router = useRouter();

const loading = ref(true);
const error = ref(null);

// เลือกได้หลายเดือน ไม่ตายตัวแค่ A/B อีกต่อไป
const selectedMonths = ref([]);

const rawRows = ref([]);
const months = ref([]);

// -------------------------------------------------------
// Filter แบบเจาะจง — เหมือนหน้า "บันทึกยอดพิมพ์รายเดือน" (PrintTransactions) และหน้า "รายงาน" (Report)
// อาคาร/ชั้น/ฝ่าย/แผนก/ยี่ห้อ/สถานะเครื่อง — กรองฝั่ง client จาก device_id ในข้อมูลดิบ เทียบกับ
// รายชื่อเครื่องเต็ม (/devices) เพื่อไม่ต้องแก้ query ฝั่ง backend
// -------------------------------------------------------
const buildingName = ref("");
const floorFilter = ref("");
const divisionFilter = ref("");
const departmentFilter = ref("");
const brandFilter = ref("");
const deviceStatusFilter = ref("");

const buildings = ref([]);
const floors = ref([]);
const divisions = ref([]);
const departments = ref([]);
const brands = ref([]);
const devices = ref([]); // ใช้แค่หา dimension (ชั้น/ฝ่าย/แผนก/ยี่ห้อ/สถานะ) ของแต่ละ device_id มา join กับ rawRows

const buildingOptions = computed(() => buildings.value.map((b) => ({ value: b.name, label: b.name })));

// Cascading filter — เลือกอาคารแล้วค่อยกรองชั้น, เลือกฝ่ายแล้วค่อยกรองแผนก (แบบเดียวกับหน้าอื่นๆ)
const filteredFloorOptions = computed(() => {
  if (!buildingName.value) return floors.value;
  const bld = buildings.value.find((b) => b.name === buildingName.value);
  if (!bld) return floors.value;
  return floors.value.filter((f) => Number(f.building_id) === Number(bld.id));
});

const filteredDepartmentOptions = computed(() => {
  if (!divisionFilter.value) return departments.value;
  const div = divisions.value.find((d) => d.name === divisionFilter.value);
  if (!div) return departments.value;
  return departments.value.filter((d) => Number(d.division_id) === Number(div.id));
});

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

watch(buildingName, () => {
  floorFilter.value = "";
});

watch(divisionFilter, () => {
  departmentFilter.value = "";
});

async function loadBuildings() {
  try {
    const res = await api.get("/buildings");
    buildings.value = res.data;
  } catch (err) {
    console.error("Load buildings error:", err);
  }
}

async function loadFilterMasterData() {
  try {
    const [floorRes, divisionRes, departmentRes, brandRes, deviceRes] = await Promise.all([
      api.get("/floors"),
      api.get("/divisions"),
      api.get("/departments"),
      api.get("/brands"),
      api.get("/devices"),
    ]);
    floors.value = floorRes.data;
    divisions.value = divisionRes.data;
    departments.value = departmentRes.data;
    brands.value = brandRes.data;
    devices.value = deviceRes.data;
  } catch (err) {
    console.error("Load filter master data error:", err);
  }
}

// device_id -> ข้อมูล dimension ของเครื่องนั้น (ใช้กรอง rawRows โดยไม่ต้องยิง API เพิ่ม)
const deviceById = computed(() => new Map(devices.value.map((d) => [d.id, d])));

// เครื่องไหนผ่าน filter ชั้น/ฝ่าย/แผนก/ยี่ห้อ/สถานะบ้าง (อาคาร + เดือน กรองที่ query/selectedMonths อยู่แล้ว)
function deviceMatchesFilters(deviceId) {
  const d = deviceById.value.get(deviceId);
  if (!d) return true; // ไม่มีข้อมูลเครื่องให้ join (เช่นเครื่องถูกลบไปแล้ว) — ไม่กรองออก กันข้อมูลหาย
  if (floorFilter.value && d.floor_name !== floorFilter.value) return false;
  if (divisionFilter.value && d.division_name !== divisionFilter.value) return false;
  if (departmentFilter.value && d.department_name !== departmentFilter.value) return false;
  if (brandFilter.value && d.brand_name !== brandFilter.value) return false;
  if (deviceStatusFilter.value && d.status !== deviceStatusFilter.value) return false;
  return true;
}

function resetFilter() {
  buildingName.value = "";
  floorFilter.value = "";
  divisionFilter.value = "";
  departmentFilter.value = "";
  brandFilter.value = "";
  deviceStatusFilter.value = "";
}

function formatMonth(value) {
  return value ? formatMonthTH(value, { long: true }) : "";
}

// -------------------------------------------------------
// sync กับ query param ?months=2026-01,2026-03
// -------------------------------------------------------
function readMonthsFromQuery(availableMonths) {
  const raw = route.query.months;
  if (!raw) return [];

  const list = String(raw).split(",").map((s) => s.trim());
  return list.filter((m) => availableMonths.includes(m)).sort();
}

let syncingFromRoute = false;

watch(selectedMonths, (val) => {
  if (syncingFromRoute) return;
  router.replace({
    query: { ...route.query, months: val.length ? val.join(",") : undefined },
  });
});

// true เฉพาะตอนโหลดครั้งแรก — ใช้แยกว่าจะอ่านเดือนจาก query string (?months=) หรือคงเดือนที่เลือกไว้
// (แค่ตัดเดือนที่ไม่มีข้อมูลในอาคารที่เพิ่งเปลี่ยนออก) ตอน filter เปลี่ยน
let initialLoad = true;

async function loadData() {
  loading.value = true;
  error.value = null;

  try {
    const params = {};
    if (buildingName.value) params.building_name = buildingName.value;

    const res = await api.get("/dashboard/monthly-kpi", { params });
    rawRows.value = res.data;

    const unique = [...new Set(res.data.map((r) => r.month))].sort();
    months.value = unique;

    syncingFromRoute = true;
    if (initialLoad) {
      // ถ้า URL มี ?months= อยู่แล้ว (refresh หรือ share link) ใช้ค่านั้นก่อน
      selectedMonths.value = readMonthsFromQuery(unique);
      initialLoad = false;
    } else {
      // เปลี่ยนตัวกรองอาคารแล้ว — เดือนที่เคยเลือกไว้บางเดือนอาจไม่มีข้อมูลในอาคารใหม่
      // ตัดเฉพาะเดือนที่ยังมีข้อมูลจริงออก แทนที่จะล้างเดือนที่เลือกไว้ทั้งหมด
      selectedMonths.value = selectedMonths.value.filter((m) => unique.includes(m));
    }
    syncingFromRoute = false;
  } catch (err) {
    console.error("Load compare data error:", err);
    error.value = "โหลดข้อมูลไม่สำเร็จ";
  } finally {
    loading.value = false;
  }
}

watch(buildingName, loadData);

// รวมยอดของเดือนหนึ่งๆ จากข้อมูลดิบ (กรองด้วย filter ชั้น/ฝ่าย/แผนก/ยี่ห้อ/สถานะเครื่องด้วย)
function aggregate(month) {
  if (!month) return null;

  const rows = rawRows.value.filter((r) => r.month === month && deviceMatchesFilters(r.device_id));
  if (rows.length === 0) return null;

  const totalPages = rows.reduce((s, r) => s + Number(r.pages_printed || 0), 0);
  const netPages = rows.reduce((s, r) => s + Number(r.net_pages || 0), 0);
  const totalCost = rows.reduce((s, r) => s + Number(r.total_cost || 0), 0);
  const activeDevices = new Set(rows.map((r) => r.device_id)).size;
  const costPerPage = totalPages > 0 ? totalCost / totalPages : 0;

  return { totalPages, netPages, totalCost, activeDevices, costPerPage };
}

// แถวข้อมูลต่อเดือนที่เลือก เรียงตามลำดับเวลา
const monthStats = computed(() =>
  selectedMonths.value.map((m) => ({
    month: m,
    label: formatMonth(m),
    stats: aggregate(m),
  }))
);

const metrics = computed(() => [
  {
    key: "totalPages",
    label: "จำนวนหน้าพิมพ์รวม",
    unit: "หน้า",
    color: "#2563EB",
    format: (v) => Number(v).toLocaleString(),
  },
  {
    key: "netPages",
    label: "จำนวนหน้าพิมพ์สุทธิ",
    unit: "หน้า",
    color: "#059669",
    format: (v) => Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 }),
  },
  {
    key: "totalCost",
    label: "ค่าใช้จ่ายสุทธิ (หัก 20%)",
    unit: "บาท",
    color: "#DC2626",
    format: (v) => Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 }),
  },
  {
    key: "activeDevices",
    label: "เครื่องที่มีการใช้งาน",
    unit: "เครื่อง",
    color: "#7C3AED",
    format: (v) => Number(v).toLocaleString(),
  },
  {
    key: "costPerPage",
    label: "ต้นทุนเฉลี่ยต่อหน้า (หัก 20%)",
    unit: "บาท/หน้า",
    color: "#D97706",
    format: (v) => Number(v).toFixed(3),
  },
]);

function diffPercent(before, after) {
  if (before === 0 || before == null) {
    return after > 0 ? 100 : 0;
  }
  return ((after - before) / before) * 100;
}

// ผลต่างเทียบกับเดือนก่อนหน้า "ในรายการที่เลือก" (ไม่ใช่เดือนก่อนหน้าตามปฏิทิน)
function deltaVsPrevious(metricKey, index) {
  if (index === 0) return null;
  const prev = monthStats.value[index - 1].stats;
  const curr = monthStats.value[index].stats;
  if (!prev || !curr) return null;
  return diffPercent(prev[metricKey], curr[metricKey]);
}

// สไตล์กราฟเดียวกับ "เปรียบเทียบฝ่าย/แผนก" ในหน้ายอดพิมพ์แยกตามฝ่าย/แผนก (ByDepartment.vue)
// เปลี่ยนจากกราฟแท่งเป็นกราฟเส้น พร้อม tooltip/point style ชุดเดียวกัน
function chartDataFor(metric) {
  return {
    labels: monthStats.value.map((s) => s.label),
    datasets: [
      {
        label: metric.label,
        data: monthStats.value.map((s) => s.stats?.[metric.key] ?? null),
        borderColor: metric.color,
        backgroundColor: metric.color,
        pointBackgroundColor: metric.color,
        pointRadius: 3,
        pointHoverRadius: 5,
        borderWidth: 2,
        tension: 0.25,
        spanGaps: true,
      },
    ],
  };
}

const chartOptions = computed(() => {
  const theme = baseChartOptions.value;

  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        ...theme.plugins.tooltip,
        callbacks: {
          label(ctx) {
            const v = ctx.raw;
            if (v === null || v === undefined) return `${ctx.dataset.label}: ไม่มีข้อมูล`;
            return `${ctx.dataset.label}: ${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
          },
        },
      },
    },
    scales: {
      x: theme.scales.x,
      y: {
        ...theme.scales.y,
        beginAtZero: true,
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

// บทสรุปอัตโนมัติ: เทียบเดือนแรกกับเดือนสุดท้ายที่เลือก (ถ้าเลือกมากกว่า 2 เดือน จะสรุปภาพรวมทั้งช่วง)
const summaryFirst = computed(() => monthStats.value[0] || null);
const summaryLast = computed(() =>
  monthStats.value.length > 1 ? monthStats.value[monthStats.value.length - 1] : null
);

// แต่ละบรรทัด: { trend: "up" | "down" | null, text } — เดิมฝัง emoji ไว้ในสตริงตรงๆ
// เปลี่ยนมาแยก trend ออกมาต่างหาก เพื่อให้ template render เป็นไอคอน AppIcon แทน emoji
const summarySentences = computed(() => {
  if (!summaryFirst.value?.stats || !summaryLast.value?.stats) return [];

  const lines = [];
  for (const m of metrics.value) {
    const before = summaryFirst.value.stats[m.key];
    const after = summaryLast.value.stats[m.key];
    const pct = diffPercent(before, after);

    if (Math.abs(pct) < 0.05) {
      lines.push({
        trend: null,
        text: `${m.label}ไม่เปลี่ยนแปลงมากนัก (${m.format(before)} → ${m.format(after)} ${m.unit})`,
      });
      continue;
    }

    const direction = pct > 0 ? "เพิ่มขึ้น" : "ลดลง";

    lines.push({
      trend: pct > 0 ? "up" : "down",
      text:
        `${m.label}${direction} ${Math.abs(pct).toFixed(1)}% ` +
        `(จาก ${m.format(before)} เป็น ${m.format(after)} ${m.unit})`,
    });
  }
  return lines;
});

// ตาราง "เครื่องที่ใช้งานมาก/น้อย" ย้ายไปอยู่หน้า "ค่าใช้จ่ายและยอดพิมพ์แยกตามฝ่าย/แผนก"
// (ByDepartment.vue) แล้ว เพราะเนื้อหา (ยอดพิมพ์+ค่าใช้จ่ายรายเครื่อง) เข้ากับหน้านั้นมากกว่า
// — filter อาคาร/ชั้น/ฝ่าย/แผนก/ยี่ห้อ/สถานะด้านล่างนี้ยังใช้อยู่ (aggregate()/monthStats/กราฟ)

const hasActiveFilter = computed(
  () =>
    !!(
      buildingName.value ||
      floorFilter.value ||
      divisionFilter.value ||
      departmentFilter.value ||
      brandFilter.value ||
      deviceStatusFilter.value
    )
);

onMounted(() => {
  loadBuildings();
  loadFilterMasterData();
  loadData();
});
</script>

<template>
  <div>
    <h1 class="text-3xl font-bold mb-6">เปรียบเทียบข้อมูลรายเดือน</h1>
    <p class="text-sm text-gray-500 -mt-4 mb-6">"จำนวนหน้าพิมพ์สุทธิ" และ "ค่าใช้จ่ายสุทธิ" เป็นยอดหลังหัก 20% ส่วน "จำนวนหน้าพิมพ์รวม" เป็นยอดดิบตามที่กรอกจริง ยังไม่หัก</p>

    <div class="bg-gray-50 shadow rounded-lg p-6 mb-6">
      <p class="text-sm text-gray-500 mb-4">
        เลือกเดือนที่ต้องการเปรียบเทียบ (เลือกได้มากกว่า 2 เดือน)
      </p>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end mb-4">
        <div>
          <label class="block text-xs text-gray-500 mb-1">เดือน</label>
          <MonthPicker v-model="selectedMonths" :options="months" />
        </div>
      </div>

      <!-- Filter เจาะจง — อาคาร/ชั้น/ฝ่าย/แผนก/ยี่ห้อ/สถานะเครื่อง เหมือนหน้าบันทึกยอด/รายงาน -->
      <div class="flex flex-wrap items-end gap-3 pt-4 border-t">
        <div>
          <label class="block text-xs text-gray-500 mb-1">อาคาร</label>
          <SearchableSelect
            v-model="buildingName"
            :options="buildingOptions"
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

        <button
          v-if="hasActiveFilter"
          @click="resetFilter"
          class="text-sm text-red-500 hover:text-gray-700 underline whitespace-nowrap"
        >
          ล้างตัวกรองทั้งหมด
        </button>
      </div>
    </div>

    <div v-if="loading" class="text-center text-gray-500 py-10">กำลังโหลดข้อมูล...</div>
    <div v-else-if="error" class="bg-red-100 text-red-700 p-4 rounded">{{ error }}</div>

    <template v-else>
      <div
        v-if="!monthStats.length"
        class="text-center text-gray-400 border border-dashed rounded-lg py-10"
      >
        ยังไม่ได้เลือกเดือน — เลือกอย่างน้อย 1 เดือนด้านบนเพื่อดูข้อมูล
      </div>

      <template v-else>
        <!-- บทสรุปอัตโนมัติ -->
        <div
          v-if="summaryFirst && summaryLast"
          class="summary-box rounded-lg p-5 mb-6"
        >
          <h2 class="summary-box__title font-bold mb-2 flex items-center gap-1.5">
            <AppIcon name="document" class="w-5 h-5 shrink-0" />
            สรุปการเปลี่ยนแปลง
          </h2>
          <p class="text-sm text-gray-600 mb-3">
            เปรียบเทียบ {{ summaryFirst.label }} กับ {{ summaryLast.label }}
            <span v-if="monthStats.length > 2">(รวม {{ monthStats.length }} เดือนที่เลือก)</span>
          </p>
          <ul class="space-y-1.5 text-sm">
            <li v-for="(line, idx) in summarySentences" :key="idx" class="flex items-center gap-1.5">
              <AppIcon
                v-if="line.trend"
                :name="line.trend === 'up' ? 'trendUp' : 'trendDown'"
                class="w-3.5 h-3.5 shrink-0"
                :class="line.trend === 'up' ? 'text-red-600' : 'text-green-600'"
              />
              <span>{{ line.text }}</span>
            </li>
          </ul>
        </div>
        <div
          v-else
          class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 text-sm text-yellow-800 flex items-center gap-1.5"
        >
          <AppIcon name="warning" class="w-4 h-4 shrink-0" />
          <span>เลือกแค่เดือนเดียว ({{ summaryFirst?.label }}) — เลือกอีกเดือนเพื่อดูบทสรุปการเปลี่ยนแปลง</span>
        </div>

        <!-- ตารางเปรียบเทียบทุกเดือนที่เลือก -->
        <div class="bg-gray-50 shadow rounded-lg p-4 mb-8 overflow-x-auto">
          <table class="w-full text-sm border-collapse min-w-max">
            <thead>
              <tr class="text-left text-gray-500 border-b">
                <th class="py-2 pr-4">ตัวชี้วัด</th>
                <th v-for="s in monthStats" :key="s.month" class="py-2 pr-4 whitespace-nowrap">
                  {{ s.label }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in metrics" :key="m.key" class="border-b">
                <td class="py-2 pr-4 text-gray-500">{{ m.label }}</td>
                <td v-for="(s, i) in monthStats" :key="s.month" class="py-2 pr-4">
                  <div class="font-semibold">
                    {{ s.stats ? m.format(s.stats[m.key]) : "-" }}
                  </div>
                  <div
                    v-if="deltaVsPrevious(m.key, i) !== null"
                    class="flex items-center gap-0.5 text-xs font-medium"
                    :class="deltaVsPrevious(m.key, i) >= 0 ? 'text-red-600' : 'text-green-600'"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      class="w-3 h-3 shrink-0"
                    >
                      <path v-if="deltaVsPrevious(m.key, i) >= 0" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                      <path v-else d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                    {{ Math.abs(deltaVsPrevious(m.key, i)).toFixed(1) }}%
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- กราฟแยกตามหมวดหมู่ -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div
            v-for="m in metrics"
            :key="'chart-' + m.key"
            class="bg-gray-50 shadow rounded-lg p-4"
          >
            <h3 class="font-semibold mb-3">{{ m.label }}</h3>
            <div class="h-56">
              <Line :data="chartDataFor(m)" :options="chartOptions" />
            </div>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
/*
  กล่อง "สรุปการเปลี่ยนแปลง" — เดิมใช้ bg-blue-50/border-blue-200/text-blue-800 ตรงๆ
  ซึ่ง map ไปที่สเกล --brand-* ที่ "คงที่ไม่พลิกตามโหมด" (ดู style.css) ต่างจาก gray/red
  ผลคือพอเปิดโหมดมืด กล่องนี้ยังเป็นพื้นฟ้าอ่อนจ้าเหมือนเดิม ไม่กลืนกับกล่องอื่นๆ
  เปลี่ยนมาใช้ --status-info-* (ตัวแปรใหม่ที่พลิกตามโหมดแบบเดียวกับ success/warning) แทน
*/
.summary-box {
  background-color: var(--status-info-bg);
  border: 1px solid var(--status-info-border);
}
.summary-box__title {
  color: var(--status-info-text);
}
</style>