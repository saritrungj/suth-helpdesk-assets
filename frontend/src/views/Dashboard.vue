<template>
  <div>
    <h1 class="text-3xl font-bold mb-6">Dashboard</h1>

    <!-- การ์ดสถิติรวม -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
      <div class="bg-white shadow rounded-lg p-6">
        <h2 class="text-gray-500 text-sm">อุปกรณ์ทั้งหมด</h2>
        <p class="text-3xl font-bold text-blue-600">
          {{ fmt(stats.total_devices) }}
        </p>
      </div>

      <div class="bg-white shadow rounded-lg p-6">
        <h2 class="text-gray-500 text-sm">สัญญาทั้งหมด</h2>
        <p class="text-3xl font-bold text-green-600">
          {{ fmt(stats.total_contracts) }}
        </p>
      </div>

      <div class="bg-white shadow rounded-lg p-6">
        <h2 class="text-gray-500 text-sm">รายการพิมพ์</h2>
        <p class="text-3xl font-bold text-purple-600">
          {{ fmt(stats.total_transactions) }}
        </p>
      </div>

      <div class="bg-white shadow rounded-lg p-6">
        <h2 class="text-gray-500 text-sm">จำนวนหน้าที่พิมพ์</h2>
        <p class="text-3xl font-bold text-red-600">
          {{ fmt(stats.total_pages) }}
        </p>
      </div>
    </div>

    <p v-if="loading" class="text-gray-500">กำลังโหลดข้อมูล...</p>

    <!-- Empty state: ยังไม่มียอดพิมพ์ -->
    <div
      v-else-if="summary.length === 0"
      class="bg-white shadow rounded-lg p-12 text-center"
    >
      <p class="text-5xl mb-4">📊</p>
      <h2 class="text-xl font-bold mb-2">ยังไม่มีข้อมูลยอดพิมพ์</h2>
      <p class="text-gray-500 mb-6">
        เมื่อนำเข้าข้อมูลยอดพิมพ์แล้ว กราฟและการเปรียบเทียบจะแสดงที่นี่ทันที
      </p>
      <RouterLink
        to="/import-devices"
        class="inline-block bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
      >
        ไปหน้า Import ข้อมูล
      </RouterLink>
    </div>

    <template v-else>
      <!-- ส่วนเปรียบเทียบ 2 ช่วงเวลา -->
      <div class="bg-white shadow rounded-lg p-6 mb-6">
        <div class="flex flex-wrap items-end justify-between gap-4 mb-4">
          <h2 class="text-xl font-bold">เปรียบเทียบรายเดือน</h2>

          <div class="flex flex-wrap items-end gap-3">
            <div>
              <label class="block text-sm text-gray-500 mb-1">เดือนฐาน</label>
              <select v-model="monthA" class="border rounded px-3 py-2">
                <option v-for="m in months" :key="m" :value="m">{{ m }}</option>
              </select>
            </div>

            <span class="pb-2 text-gray-400">เทียบกับ</span>

            <div>
              <label class="block text-sm text-gray-500 mb-1">เดือนเปรียบเทียบ</label>
              <select v-model="monthB" class="border rounded px-3 py-2">
                <option v-for="m in months" :key="m" :value="m">{{ m }}</option>
              </select>
            </div>
          </div>
        </div>

        <p v-if="months.length < 2" class="text-gray-500">
          ต้องมีข้อมูลอย่างน้อย 2 เดือนจึงจะเปรียบเทียบได้
          (ตอนนี้มี {{ months.length }} เดือน)
        </p>

        <div v-else-if="compareItems.length" class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div
            v-for="item in compareItems"
            :key="item.label"
            class="border rounded-lg p-4"
          >
            <p class="text-sm text-gray-500">{{ item.label }}</p>

            <p class="text-2xl font-bold mt-1">
              {{ fmt(item.b, item.decimals) }}
            </p>

            <p class="text-sm text-gray-500 mt-1">
              จาก {{ fmt(item.a, item.decimals) }} ({{ monthA }})
            </p>

            <p class="mt-2 font-semibold" :class="diffClass(item.diff)">
              <template v-if="item.diff > 0">▲</template>
              <template v-else-if="item.diff < 0">▼</template>
              <template v-else>—</template>
              {{ fmt(Math.abs(item.diff), item.decimals) }}
              <span v-if="item.pct !== null">
                ({{ item.pct > 0 ? "+" : "" }}{{ item.pct.toFixed(1) }}%)
              </span>
            </p>
          </div>
        </div>
      </div>

      <!-- กราฟรายเดือน (สลับ แผ่น/บาท ได้) -->
      <MonthlyChart :summary="summary" :month-a="monthA" :month-b="monthB" class="mb-6" />

      <!-- รายอาคาร + สถานะเครื่อง -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div class="lg:col-span-2">
          <BuildingCostChart :rows="buildingSummary" />
        </div>
        <DeviceStatusChart :devices="devices" />
      </div>

      <!-- Top 5 เครื่องค่าใช้จ่ายสูงสุด -->
      <div class="bg-white shadow rounded-lg p-6">
        <h2 class="text-xl font-bold mb-4">
          Top {{ topDevices.length }} เครื่องที่ค่าใช้จ่ายสะสมสูงสุด
        </h2>

        <p v-if="topDevices.length === 0" class="text-gray-500">ยังไม่มีข้อมูล</p>

        <table v-else class="w-full border-collapse border text-sm">
          <thead>
            <tr class="bg-gray-100">
              <th class="border p-2 w-16">อันดับ</th>
              <th class="border p-2">Serial Number</th>
              <th class="border p-2">ยี่ห้อ / รุ่น</th>
              <th class="border p-2">แผนก</th>
              <th class="border p-2">อาคาร</th>
              <th class="border p-2 text-right">ยอดสุทธิ (แผ่น)</th>
              <th class="border p-2 text-right">ค่าใช้จ่ายสะสม (บาท)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(d, i) in topDevices" :key="d.device_id">
              <td class="border p-2 text-center font-semibold">{{ i + 1 }}</td>
              <td class="border p-2">{{ d.serial_number }}</td>
              <td class="border p-2">{{ d.brand_name || "-" }} {{ d.model || "" }}</td>
              <td class="border p-2">{{ d.department_name || "-" }}</td>
              <td class="border p-2">{{ d.building_name || "-" }}</td>
              <td class="border p-2 text-right">{{ fmt(d.net_pages, 1) }}</td>
              <td class="border p-2 text-right font-semibold text-red-600">
                {{ fmt(d.total_cost, 2) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import api from "../services/api";
import MonthlyChart from "../components/MonthlyChart.vue";
import BuildingCostChart from "../components/BuildingCostChart.vue";
import DeviceStatusChart from "../components/DeviceStatusChart.vue";

const stats = ref({
  total_devices: 0,
  total_contracts: 0,
  total_transactions: 0,
  total_pages: 0,
});

const summary = ref([]);
const buildingSummary = ref([]);
const topDevices = ref([]);
const devices = ref([]);
const loading = ref(true);

// เดือนที่เลือกเปรียบเทียบ (A = ฐาน, B = เดือนที่ต้องการดู)
const monthA = ref("");
const monthB = ref("");

const months = computed(() =>
  [...summary.value].map((r) => r.month).sort((a, b) => a.localeCompare(b))
);

function rowOf(month) {
  return summary.value.find((r) => r.month === month) || null;
}

const compareItems = computed(() => {
  const a = rowOf(monthA.value);
  const b = rowOf(monthB.value);
  if (!a || !b) return [];

  return [
    { label: "ยอดพิมพ์ (แผ่น)", a: a.pages, b: b.pages, decimals: 0 },
    { label: "ยอดพิมพ์สุทธิ ×0.8 (แผ่น)", a: a.net_pages, b: b.net_pages, decimals: 1 },
    { label: "ค่าใช้จ่าย (บาท)", a: a.total_cost, b: b.total_cost, decimals: 2 },
  ].map((item) => ({
    ...item,
    diff: item.b - item.a,
    pct: item.a !== 0 ? ((item.b - item.a) / item.a) * 100 : null,
  }));
});

// เพิ่มขึ้น = แดง (ใช้งาน/จ่ายมากขึ้น), ลดลง = เขียว
function diffClass(diff) {
  if (diff > 0) return "text-red-600";
  if (diff < 0) return "text-green-600";
  return "text-gray-400";
}

function fmt(n, decimals = 0) {
  return Number(n).toLocaleString("th-TH", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

const loadDashboard = async () => {
  loading.value = true;
  try {
    const [statsRes, summaryRes, buildingRes, topRes, devicesRes] = await Promise.all([
      api.get("/dashboard/stats"),
      api.get("/dashboard/monthly-summary"),
      api.get("/dashboard/summary-by-building"),
      api.get("/dashboard/top-devices"),
      api.get("/devices"),
    ]);

    stats.value = statsRes.data;
    summary.value = summaryRes.data;
    buildingSummary.value = buildingRes.data;
    topDevices.value = topRes.data;
    devices.value = devicesRes.data;

    // default: เดือนล่าสุด vs เดือนก่อนหน้า
    const m = months.value;
    if (m.length >= 2) {
      monthA.value = m[m.length - 2];
      monthB.value = m[m.length - 1];
    } else if (m.length === 1) {
      monthA.value = m[0];
      monthB.value = m[0];
    }
  } catch (err) {
    console.error(err);
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  loadDashboard();
});
</script>
