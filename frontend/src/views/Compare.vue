<script setup>
import { ref, computed, onMounted } from "vue";
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

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale);

const loading = ref(true);
const error = ref(null);

const monthA = ref("");
const monthB = ref("");

// ข้อมูลดิบทั้งหมดจาก v_monthly_kpi (device_id, month, pages_printed, net_pages, total_cost)
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

async function loadData() {
  loading.value = true;
  error.value = null;

  try {
    const res = await api.get("/dashboard/monthly-kpi");
    rawRows.value = res.data;

    const unique = [...new Set(res.data.map((r) => r.month))].sort();
    months.value = unique;

    // Default เป็น "ไม่มีข้อมูล (ว่างเปล่า)" ทั้งสองช่อง ให้ผู้ใช้เลือกเดือนเอง
    // แทนที่จะเดาให้อัตโนมัติว่าอยากเทียบเดือนไหนกับเดือนไหน
    monthA.value = "";
    monthB.value = "";
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

const statsA = computed(() => aggregate(monthA.value));
const statsB = computed(() => aggregate(monthB.value));

const labelA = computed(() => (monthA.value ? formatMonth(monthA.value) : "ไม่มีข้อมูล"));
const labelB = computed(() => (monthB.value ? formatMonth(monthB.value) : "ไม่มีข้อมูล"));

// -------------------------------------------------------
// เมตริกที่จะแสดง (การ์ด + กราฟแยกต่อหมวด)
// -------------------------------------------------------
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

function chartDataFor(metric) {
  return {
    labels: [labelA.value, labelB.value],
    datasets: [
      {
        label: metric.label,
        data: [statsA.value?.[metric.key] || 0, statsB.value?.[metric.key] || 0],
        backgroundColor: [metric.color + "80", metric.color],
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

// -------------------------------------------------------
// บทสรุปอัตโนมัติ
// -------------------------------------------------------
const summarySentences = computed(() => {
  if (!statsA.value || !statsB.value) return [];

  const lines = [];

  for (const m of metrics.value) {
    const before = statsA.value[m.key];
    const after = statsB.value[m.key];
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
        เลือก 2 เดือนเพื่อเปรียบเทียบยอดพิมพ์และค่าใช้จ่าย
      </p>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm text-gray-500 mb-1">เดือนที่ 1</label>
          <select v-model="monthA" class="border rounded p-2 w-full">
            <option value="">-- ไม่มีข้อมูล --</option>
            <option v-for="m in months" :key="m" :value="m">{{ formatMonth(m) }}</option>
          </select>
        </div>

        <div>
          <label class="block text-sm text-gray-500 mb-1">เดือนที่ 2</label>
          <select v-model="monthB" class="border rounded p-2 w-full">
            <option value="">-- ไม่มีข้อมูล --</option>
            <option v-for="m in months" :key="m" :value="m">{{ formatMonth(m) }}</option>
          </select>
        </div>
      </div>
    </div>

    <div v-if="loading" class="text-center text-gray-500 py-10">กำลังโหลดข้อมูล...</div>
    <div v-else-if="error" class="bg-red-100 text-red-700 p-4 rounded">{{ error }}</div>

    <template v-else>
      <div
        v-if="!statsA && !statsB"
        class="text-center text-gray-400 border border-dashed rounded-lg py-10"
      >
        ยังไม่มีข้อมูลยอดพิมพ์ — เลือกเดือนด้านบนเพื่อเปรียบเทียบ
      </div>

      <template v-else>
        <!-- บทสรุปอัตโนมัติ -->
        <div
          v-if="statsA && statsB"
          class="bg-blue-50 border border-blue-200 rounded-lg p-5 mb-6"
        >
          <h2 class="font-bold text-blue-800 mb-2">📝 สรุปการเปลี่ยนแปลง</h2>
          <p class="text-sm text-gray-600 mb-3">
            เปรียบเทียบ {{ labelA }} กับ {{ labelB }}
          </p>
          <ul class="space-y-1 text-sm">
            <li v-for="(line, idx) in summarySentences" :key="idx">{{ line }}</li>
          </ul>
        </div>
        <div
          v-else
          class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 text-sm text-yellow-800"
        >
          ⚠️ มีข้อมูลแค่ช่วงเดียว ({{ statsA ? labelA : labelB }}) — เลือกอีกเดือนเพื่อดูบทสรุปการเปลี่ยนแปลง
        </div>

        <!-- การ์ด KPI เปรียบเทียบ -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <div
            v-for="m in metrics"
            :key="m.key"
            class="bg-white shadow rounded-lg p-4"
          >
            <h3 class="text-xs text-gray-500 mb-2">{{ m.label }}</h3>

            <div class="flex items-baseline gap-2 mb-1">
              <span class="text-sm text-gray-400">{{ labelA }}</span>
              <span class="font-semibold">
                {{ statsA ? m.format(statsA[m.key]) : "-" }}
              </span>
            </div>

            <div class="flex items-baseline gap-2 mb-2">
              <span class="text-sm text-blue-500">{{ labelB }}</span>
              <span class="font-bold text-lg">
                {{ statsB ? m.format(statsB[m.key]) : "-" }}
              </span>
            </div>

            <div
              v-if="statsA && statsB"
              class="text-xs font-semibold"
              :class="statsB[m.key] >= statsA[m.key] ? 'text-green-600' : 'text-red-600'"
            >
              {{ statsB[m.key] >= statsA[m.key] ? "▲" : "▼" }}
              {{ Math.abs(diffPercent(statsA[m.key], statsB[m.key])).toFixed(1) }}%
            </div>
          </div>
        </div>

        <!-- กราฟแยกตามหมวดหมู่ (เพราะสเกลตัวเลขต่างกันมาก) -->
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