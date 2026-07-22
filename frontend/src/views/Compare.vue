<script setup>
import { ref, computed, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Bar } from "vue-chartjs";
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  BarElement,
  CategoryScale,
  LinearScale,
} from "chart.js";
import api from "../services/api";
import MonthPicker from "../components/MonthPicker.vue";

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale);

const route = useRoute();
const router = useRouter();

const loading = ref(true);
const error = ref(null);

// เลือกได้หลายเดือน ไม่ตายตัวแค่ A/B อีกต่อไป
const selectedMonths = ref([]);

const rawRows = ref([]);
const months = ref([]);

function formatMonth(value) {
  if (!value) return "";
  const monthsTH = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน",
    "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม",
    "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
  ];
  const [y, m] = value.split("-");
  return `${monthsTH[Number(m) - 1]} ${Number(y) + 543}`;
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

async function loadData() {
  loading.value = true;
  error.value = null;

  try {
    const res = await api.get("/dashboard/monthly-kpi");
    rawRows.value = res.data;

    const unique = [...new Set(res.data.map((r) => r.month))].sort();
    months.value = unique;

    // ถ้า URL มี ?months= อยู่แล้ว (refresh หรือ share link) ใช้ค่านั้นก่อน
    syncingFromRoute = true;
    selectedMonths.value = readMonthsFromQuery(unique);
    syncingFromRoute = false;
  } catch (err) {
    console.error("Load compare data error:", err);
    error.value = "โหลดข้อมูลไม่สำเร็จ";
  } finally {
    loading.value = false;
  }
}

// รวมยอดของเดือนหนึ่งๆ จากข้อมูลดิบ
function aggregate(month) {
  if (!month) return null;

  const rows = rawRows.value.filter((r) => r.month === month);
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
    label: "ค่าใช้จ่ายรวม",
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
    label: "ต้นทุนเฉลี่ยต่อหน้า",
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

function chartDataFor(metric) {
  return {
    labels: monthStats.value.map((s) => s.label),
    datasets: [
      {
        label: metric.label,
        data: monthStats.value.map((s) => s.stats?.[metric.key] || 0),
        backgroundColor: metric.color,
        borderRadius: 6,
      },
    ],
  };
}

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    y: {
      beginAtZero: true,
      ticks: {
        callback(value) {
          return Number(value).toLocaleString();
        },
      },
    },
  },
};

// บทสรุปอัตโนมัติ: เทียบเดือนแรกกับเดือนสุดท้ายที่เลือก (ถ้าเลือกมากกว่า 2 เดือน จะสรุปภาพรวมทั้งช่วง)
const summaryFirst = computed(() => monthStats.value[0] || null);
const summaryLast = computed(() =>
  monthStats.value.length > 1 ? monthStats.value[monthStats.value.length - 1] : null
);

const summarySentences = computed(() => {
  if (!summaryFirst.value?.stats || !summaryLast.value?.stats) return [];

  const lines = [];
  for (const m of metrics.value) {
    const before = summaryFirst.value.stats[m.key];
    const after = summaryLast.value.stats[m.key];
    const pct = diffPercent(before, after);

    if (Math.abs(pct) < 0.05) {
      lines.push(`${m.label}ไม่เปลี่ยนแปลงมากนัก (${m.format(before)} → ${m.format(after)} ${m.unit})`);
      continue;
    }

    const direction = pct > 0 ? "เพิ่มขึ้น" : "ลดลง";
    const arrow = pct > 0 ? "📈" : "📉";

    lines.push(
      `${arrow} ${m.label}${direction} ${Math.abs(pct).toFixed(1)}% ` +
        `(จาก ${m.format(before)} เป็น ${m.format(after)} ${m.unit})`
    );
  }
  return lines;
});

onMounted(loadData);
</script>

<template>
  <div>
    <h1 class="text-3xl font-bold mb-6">เปรียบเทียบข้อมูลรายเดือน</h1>

    <div class="bg-white shadow rounded-lg p-6 mb-6">
      <p class="text-sm text-gray-500 mb-4">
        เลือกเดือนที่ต้องการเปรียบเทียบ (เลือกได้มากกว่า 2 เดือน)
      </p>

      <div class="max-w-sm">
        <MonthPicker v-model="selectedMonths" :options="months" />
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
          class="bg-blue-50 border border-blue-200 rounded-lg p-5 mb-6"
        >
          <h2 class="font-bold text-blue-800 mb-2">📝 สรุปการเปลี่ยนแปลง</h2>
          <p class="text-sm text-gray-600 mb-3">
            เปรียบเทียบ {{ summaryFirst.label }} กับ {{ summaryLast.label }}
            <span v-if="monthStats.length > 2">(รวม {{ monthStats.length }} เดือนที่เลือก)</span>
          </p>
          <ul class="space-y-1 text-sm">
            <li v-for="(line, idx) in summarySentences" :key="idx">{{ line }}</li>
          </ul>
        </div>
        <div
          v-else
          class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 text-sm text-yellow-800"
        >
          ⚠️ เลือกแค่เดือนเดียว ({{ summaryFirst?.label }}) — เลือกอีกเดือนเพื่อดูบทสรุปการเปลี่ยนแปลง
        </div>

        <!-- ตารางเปรียบเทียบทุกเดือนที่เลือก -->
        <div class="bg-white shadow rounded-lg p-4 mb-8 overflow-x-auto">
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
                    class="text-xs font-medium"
                    :class="deltaVsPrevious(m.key, i) >= 0 ? 'text-red-600' : 'text-green-600'"
                  >
                    {{ deltaVsPrevious(m.key, i) >= 0 ? "▲" : "▼" }}
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
            class="bg-white shadow rounded-lg p-4"
          >
            <h3 class="font-semibold mb-3">{{ m.label }}</h3>
            <div class="h-56">
              <Bar :data="chartDataFor(m)" :options="chartOptions" />
            </div>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>