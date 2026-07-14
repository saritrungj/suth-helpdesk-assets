<script setup>
import { ref, onMounted, computed } from "vue";
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

// เดือนที่เลือกเปรียบเทียบ (A = ก่อน, B = หลัง)
const monthA = ref("");
const monthB = ref("");

const months = ref([]);
const loading = ref(false);
const error = ref(null);

const statsA = ref(null); // null = ยังไม่มีข้อมูล (ว่างเปล่า)
const statsB = ref(null);

// แปลงเดือนเป็นภาษาไทย
function formatMonth(value) {
  if (!value || typeof value !== "string") return "";

  const monthsTH = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน",
    "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม",
    "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
  ];

  const [year, m] = value.split("-");
  return `${monthsTH[Number(m) - 1]} ${Number(year) + 543}`;
}

async function loadMonths() {
  try {
    const res = await api.get("/dashboard/monthly-kpi");

    const unique = [...new Set(res.data.map((item) => item.month))].sort();

    months.value = unique.map((m) => ({
      value: m,
      label: formatMonth(m),
    }));

    // ตั้งค่าเริ่มต้น: เดือนล่าสุด vs เดือนก่อนหน้า (ถ้ามี)
    if (unique.length >= 2) {
      monthA.value = unique[unique.length - 2];
      monthB.value = unique[unique.length - 1];
    } else if (unique.length === 1) {
      monthB.value = unique[0];
    }
  } catch (err) {
    console.error("Load months error (compare)", err);
  }
}

async function fetchStats(month) {
  // ถ้ายังไม่เลือกเดือน = ยังไม่มีข้อมูล ให้ถือว่า "ว่างเปล่า"
  if (!month) return null;

  const res = await api.get("/dashboard/stats", { params: { month } });

  return {
    total_devices: Number(res.data.total_devices || 0),
    total_contracts: Number(res.data.total_contracts || 0),
    total_transactions: Number(res.data.total_transactions || 0),
    total_pages: Number(res.data.total_pages || 0),
  };
}

async function loadCompare() {
  loading.value = true;
  error.value = null;

  try {
    const [a, b] = await Promise.all([fetchStats(monthA.value), fetchStats(monthB.value)]);

    statsA.value = a;
    statsB.value = b;
  } catch (err) {
    console.error("Compare periods error:", err);
    error.value = "โหลดข้อมูลเปรียบเทียบไม่สำเร็จ";
  } finally {
    loading.value = false;
  }
}

// คำนวณ % เปลี่ยนแปลง
function diffPercent(before, after) {
  if (!before || before === 0) {
    return after > 0 ? "+100%" : "0%";
  }

  const pct = ((after - before) / before) * 100;
  const sign = pct >= 0 ? "+" : "";

  return `${sign}${pct.toFixed(1)}%`;
}

const chartData = computed(() => ({
  labels: ["จำนวนหน้าพิมพ์ (หน้า)", "รายการพิมพ์"],
  datasets: [
    {
      label: monthA.value ? formatMonth(monthA.value) : "ก่อนใส่ข้อมูล",
      data: [statsA.value?.total_pages || 0, statsA.value?.total_transactions || 0],
      backgroundColor: "#94A3B8",
      borderWidth: 1,
    },
    {
      label: monthB.value ? formatMonth(monthB.value) : "หลังใส่ข้อมูล",
      data: [statsB.value?.total_pages || 0, statsB.value?.total_transactions || 0],
      backgroundColor: "#2563EB",
      borderWidth: 1,
    },
  ],
}));

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: true },
  },
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

onMounted(async () => {
  await loadMonths();
  await loadCompare();
});
</script>

<template>
  <div class="bg-white shadow rounded-lg p-6">
    <h2 class="text-xl font-bold mb-1">เปรียบเทียบก่อน–หลังใส่ข้อมูล</h2>
    <p class="text-sm text-gray-500 mb-4">
      เลือก 2 ช่วงเวลาเพื่อดูว่าหลังจากใส่ข้อมูลยอดพิมพ์แล้ว ตัวเลขและกราฟเปลี่ยนไปอย่างไร
    </p>

    <!-- ตัวเลือกช่วงเวลา -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
      <div>
        <label class="block text-sm text-gray-500 mb-1">ช่วงที่ 1 (ก่อน)</label>
        <select v-model="monthA" @change="loadCompare" class="border rounded p-2 w-full">
          <option value="">-- ไม่มีข้อมูล (ว่างเปล่า) --</option>
          <option v-for="m in months" :key="m.value" :value="m.value">
            {{ m.label }}
          </option>
        </select>
      </div>

      <div>
        <label class="block text-sm text-gray-500 mb-1">ช่วงที่ 2 (หลัง)</label>
        <select v-model="monthB" @change="loadCompare" class="border rounded p-2 w-full">
          <option value="">-- ไม่มีข้อมูล (ว่างเปล่า) --</option>
          <option v-for="m in months" :key="m.value" :value="m.value">
            {{ m.label }}
          </option>
        </select>
      </div>
    </div>

    <div v-if="loading" class="text-center text-gray-500 py-6">กำลังเปรียบเทียบข้อมูล...</div>
    <div v-else-if="error" class="bg-red-100 text-red-700 p-3 rounded mb-4">{{ error }}</div>

    <template v-else>
      <!-- กรณีทั้งสองช่วงว่างเปล่า -->
      <div
        v-if="!statsA && !statsB"
        class="text-center text-gray-400 border border-dashed rounded-lg py-10"
      >
        ยังไม่มีข้อมูลยอดพิมพ์ — เลือกช่วงเวลาด้านบนเพื่อเปรียบเทียบ
      </div>

      <template v-else>
        <!-- การ์ดเปรียบเทียบตัวเลข -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div
            v-for="(s, idx) in [
              { data: statsA, label: monthA ? formatMonth(monthA) : 'ก่อนใส่ข้อมูล' },
              { data: statsB, label: monthB ? formatMonth(monthB) : 'หลังใส่ข้อมูล' },
            ]"
            :key="idx"
            class="border rounded-lg p-4"
            :class="idx === 1 ? 'border-blue-300 bg-blue-50' : 'border-gray-200'"
          >
            <h3 class="font-semibold mb-3">{{ s.label }}</h3>

            <div v-if="!s.data" class="text-gray-400 italic py-6 text-center">
              (ว่างเปล่า — ยังไม่ได้ใส่ข้อมูล)
            </div>

            <div v-else class="space-y-2 text-sm">
              <div class="flex justify-between">
                <span class="text-gray-500">จำนวนหน้าพิมพ์</span>
                <span class="font-bold">{{ s.data.total_pages.toLocaleString() }} หน้า</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-500">รายการพิมพ์</span>
                <span class="font-bold">{{ s.data.total_transactions.toLocaleString() }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-500">อุปกรณ์ทั้งหมด</span>
                <span class="font-bold">{{ s.data.total_devices.toLocaleString() }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-500">สัญญาทั้งหมด</span>
                <span class="font-bold">{{ s.data.total_contracts.toLocaleString() }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- % เปลี่ยนแปลง -->
        <div
          v-if="statsA && statsB"
          class="flex flex-wrap gap-4 mb-6 text-sm"
        >
          <div class="bg-gray-100 rounded px-3 py-2">
            จำนวนหน้าพิมพ์เปลี่ยนแปลง:
            <span
              class="font-bold"
              :class="statsB.total_pages >= statsA.total_pages ? 'text-green-600' : 'text-red-600'"
            >
              {{ diffPercent(statsA.total_pages, statsB.total_pages) }}
            </span>
          </div>

          <div class="bg-gray-100 rounded px-3 py-2">
            รายการพิมพ์เปลี่ยนแปลง:
            <span
              class="font-bold"
              :class="statsB.total_transactions >= statsA.total_transactions ? 'text-green-600' : 'text-red-600'"
            >
              {{ diffPercent(statsA.total_transactions, statsB.total_transactions) }}
            </span>
          </div>
        </div>

        <!-- กราฟเปรียบเทียบ -->
        <div class="h-72">
          <Bar :data="chartData" :options="chartOptions" />
        </div>
      </template>
    </template>
  </div>
</template>