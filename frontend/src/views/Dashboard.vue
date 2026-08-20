<template>
  <div>

    <h1 class="text-3xl font-bold mb-6">แดชบอร์ด</h1>

    <DashboardFilter @filter="handleFilter" />

    <!-- ============================================================
         KPI Cards — sticky ใต้ Navbar เสมอ (เห็นตัวเลขหลักตลอดเวลาที่เลื่อนดูกราฟด้านล่าง)
         ตอนโหลดใหม่ (เปลี่ยน filter) จะโชว์ skeleton แทนค่าเดิม/0 เพื่อไม่ให้ตัวเลขกระโดด
         ============================================================ -->
    <div class="sticky top-16 z-10 -mx-6 px-6 py-3 bg-[var(--body-bg)]/90 backdrop-blur">
      <div v-if="statsError" class="bg-red-100 text-red-700 p-3 rounded-lg mb-3 text-sm flex items-center justify-between gap-3">
        <span>{{ statsError }}</span>
        <button type="button" class="underline shrink-0" @click="loadDashboard">ลองใหม่</button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

        <div class="bg-gray-50 shadow rounded-lg p-6 hover:shadow-xl transition">
          <h2 class="text-gray-500 text-sm">อุปกรณ์ทั้งหมด</h2>
          <SkeletonBlock v-if="loading" width="5rem" height="2.25rem" class="mt-1" />
          <p v-else class="text-3xl font-bold text-[var(--brand-text)]">
            {{ Number(stats.total_devices || 0).toLocaleString() }}
          </p>
        </div>

        <div class="bg-gray-50 shadow rounded-lg p-6 hover:shadow-xl transition">
          <h2 class="text-gray-500 text-sm">สัญญาทั้งหมด</h2>
          <SkeletonBlock v-if="loading" width="5rem" height="2.25rem" class="mt-1" />
          <p v-else class="text-3xl font-bold text-green-600">
            {{ Number(stats.total_contracts || 0).toLocaleString() }}
          </p>
        </div>

        <div class="bg-gray-50 shadow rounded-lg p-6 hover:shadow-xl transition">
          <h2 class="text-gray-500 text-sm">รายการพิมพ์</h2>
          <SkeletonBlock v-if="loading" width="5rem" height="2.25rem" class="mt-1" />
          <p v-else class="text-3xl font-bold text-purple-600">
            {{ Number(stats.total_transactions || 0).toLocaleString() }}
          </p>
        </div>

        <div class="bg-gray-50 shadow rounded-lg p-6 hover:shadow-xl transition">
          <h2 class="text-gray-500 text-sm">จำนวนหน้าที่พิมพ์</h2>
          <SkeletonBlock v-if="loading" width="5rem" height="2.25rem" class="mt-1" />
          <p v-else class="text-3xl font-bold text-red-600">
            {{ Number(stats.total_pages || 0).toLocaleString() }}
          </p>
        </div>

      </div>
    </div>

    <!-- ============================================================
         ส่วนเสริม (Highlights) — ย้ายขึ้นมาไว้ใกล้ KPI แทนท้ายสุดของหน้า
         เพราะเป็นข้อมูลที่ช่วยตัดสินใจ (แผนกไหนใช้จ่ายเยอะ / สถานะเครื่อง)
         ไม่ควรถูกฝังอยู่หลังกราฟยาวๆ จนคนไม่ scroll ไปเจอ
         ============================================================ -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">

      <!-- สถานะเครื่องพิมพ์ -->
      <div class="bg-gray-50 shadow rounded-lg p-6">
        <h2 class="text-xl font-bold mb-4">สถานะเครื่องพิมพ์</h2>

        <div v-if="highlightsError" class="text-sm text-red-600 flex items-center justify-between gap-3">
          <span>{{ highlightsError }}</span>
          <button type="button" class="underline shrink-0" @click="loadHighlights">ลองใหม่</button>
        </div>

        <div v-else-if="highlightsLoading" class="grid grid-cols-3 gap-4">
          <SkeletonBlock v-for="n in 3" :key="n" height="4.5rem" />
        </div>

        <div v-else class="grid grid-cols-3 gap-4">
          <div
            v-for="s in highlights.device_status"
            :key="s.status"
            class="status-chip text-center p-4 rounded-lg"
            :class="deviceStatusMeta[s.status]?.chipClass"
          >
            <component
              :is="deviceStatusMeta[s.status]?.icon"
              class="w-4 h-4 mx-auto mb-1 status-chip__value"
            />
            <p class="text-2xl font-bold status-chip__value">
              {{ Number(s.count).toLocaleString() }}
            </p>
            <p class="text-sm text-gray-600 mt-1">
              {{ deviceStatusMeta[s.status]?.label || s.status }}
            </p>
          </div>
        </div>
      </div>

      <!-- Top 5 แผนกที่ค่าใช้จ่ายสูงสุด -->
      <div class="bg-gray-50 shadow rounded-lg p-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-bold">แผนกที่ค่าใช้จ่ายสุทธิสูงสุด (หัก 20%)</h2>
          <RouterLink to="/by-department" class="text-sm text-gray-500 hover:text-gray-700 underline whitespace-nowrap">
            ดูทั้งหมด →
          </RouterLink>
        </div>

        <div v-if="highlightsError" class="text-sm text-red-600">{{ highlightsError }}</div>

        <div v-else-if="highlightsLoading" class="space-y-2">
          <SkeletonBlock v-for="n in 5" :key="n" height="1.75rem" />
        </div>

        <div v-else-if="highlights.top_departments.length === 0" class="text-gray-400 text-sm">
          ไม่มีข้อมูลในช่วงที่เลือก
        </div>

        <table v-else class="w-full text-sm">
          <thead>
            <tr class="text-left text-gray-500 border-b">
              <th class="py-2">แผนก</th>
              <th class="py-2">ฝ่าย</th>
              <th class="py-2 text-right">หน้า</th>
              <th class="py-2 text-right">ค่าใช้จ่ายสุทธิ (หัก 20%)</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="d in highlights.top_departments"
              :key="d.department_id ?? d.department_name"
              class="border-b last:border-0"
            >
              <td class="py-2">{{ d.department_name || "ไม่ระบุแผนก" }}</td>
              <td class="py-2 text-gray-500">{{ d.division_name || "-" }}</td>
              <td class="py-2 text-right">{{ Number(d.total_pages || 0).toLocaleString() }}</td>
              <td class="py-2 text-right font-medium">{{ formatMoney(d.total_cost) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

    </div>

    <!-- ============================================================
         เครื่องที่ปริ้นมากสุด/น้อยสุด — ตอบโจทย์ "อยากดูว่าเครื่องไหนปริ้นน้อยที่สุด"
         สไตล์เดียวกับการ์ด "แผนกที่ค่าใช้จ่ายสุทธิสูงสุด" ด้านบน แต่สลับมาก/น้อยได้ด้วยปุ่มเดียว
         ============================================================ -->
    <div class="mt-6 bg-gray-50 shadow rounded-lg p-6">
      <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 class="text-xl font-bold">
          เครื่องที่ปริ้น{{ topDevicesOrder === "desc" ? "มากที่สุด" : "น้อยที่สุด" }} (หัก 20%)
        </h2>

        <div class="flex items-center gap-3">
          <button
            type="button"
            @click="toggleTopDevicesOrder"
            class="text-sm border rounded px-3 py-1.5 hover:bg-gray-100 flex items-center gap-1"
          >
            {{ topDevicesOrder === "desc" ? "มากที่สุด" : "น้อยที่สุด" }}
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
              <path v-if="topDevicesOrder === 'desc'" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              <path v-else d="M4.5 15.75l7.5-7.5 7.5 7.5" />
            </svg>
          </button>

          <!-- ลิงก์ไปตารางเต็มที่ "เครื่องที่ใช้งานมาก/น้อย" — ย้ายจาก Compare.vue ไปอยู่ในแท็บ
               "ค่าใช้จ่ายและยอดพิมพ์แยกตามฝ่าย/แผนก" (ByDepartment.vue) แล้ว ต้องลิงก์ไปที่นั่น
               ไม่ใช่ /compare เหมือนเดิม (หน้า /compare ไม่มีตารางนี้แล้ว) -->
          <RouterLink to="/by-department" class="text-sm text-gray-500 hover:text-gray-700 underline whitespace-nowrap">
            ดูทั้งหมด →
          </RouterLink>
        </div>
      </div>

      <div v-if="highlightsError" class="text-sm text-red-600">{{ highlightsError }}</div>

      <div v-else-if="highlightsLoading" class="space-y-2">
        <SkeletonBlock v-for="n in 5" :key="n" height="1.75rem" />
      </div>

      <div v-else-if="highlights.top_devices.length === 0" class="text-gray-400 text-sm">
        ไม่มีข้อมูลในช่วงที่เลือก
      </div>

      <table v-else class="w-full text-sm">
        <thead>
          <tr class="text-left text-gray-500 border-b">
            <th class="py-2">อันดับ</th>
            <th class="py-2">SN / รุ่น</th>
            <th class="py-2">อาคาร</th>
            <th class="py-2">แผนก</th>
            <th class="py-2">สถานะ</th>
            <th class="py-2 text-right">หน้า (สุทธิ)</th>
            <th class="py-2 text-right">ค่าใช้จ่ายสุทธิ (หัก 20%)</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(d, idx) in highlights.top_devices"
            :key="d.device_id"
            class="border-b last:border-0"
          >
            <td class="py-2 text-gray-400">{{ idx + 1 }}</td>
            <td class="py-2 font-medium">{{ d.serial_number || "-" }} <span class="text-gray-400 font-normal">{{ d.model }}</span></td>
            <td class="py-2 text-gray-500">{{ d.building_name || "-" }}</td>
            <td class="py-2 text-gray-500">{{ d.department_name || "-" }}</td>
            <td class="py-2">
              <span class="text-xs px-2 py-0.5 rounded-full" :class="deviceStatusBadgeMeta[d.status]?.class || 'bg-gray-100 text-gray-600'">
                {{ deviceStatusBadgeMeta[d.status]?.label || d.status || "-" }}
              </span>
            </td>
            <td class="py-2 text-right">{{ Number(d.total_pages || 0).toLocaleString() }}</td>
            <td class="py-2 text-right font-medium">{{ formatMoney(d.total_cost) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- สรุปการใช้งานตามสัญญา -->
    <div class="mt-6 bg-gray-50 shadow rounded-lg p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-bold">สรุปการใช้งานตามสัญญา</h2>
        <RouterLink
          to="/expense"
          class="text-sm text-gray-500 hover:text-gray-700 underline whitespace-nowrap"
        >
          ดูทั้งหมด →
        </RouterLink>
      </div>

      <div v-if="highlightsError" class="text-sm text-red-600">{{ highlightsError }}</div>

      <div v-else-if="highlightsLoading" class="space-y-2">
        <SkeletonBlock v-for="n in 3" :key="n" height="1.75rem" />
      </div>

      <div v-else-if="highlights.contracts.length === 0" class="text-gray-400 text-sm">
        ยังไม่มีสัญญาในระบบ
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-gray-500 border-b">
              <th class="py-2">เลขที่สัญญา</th>
              <th class="py-2">ปีงบประมาณ</th>
              <th class="py-2 text-right">ราคา/แผ่น (บาท)</th>
              <th class="py-2 text-right">จำนวนเครื่อง</th>
              <th class="py-2 text-right">จำนวนหน้ารวม</th>
              <th class="py-2 text-right">ค่าใช้จ่ายสุทธิรวม (หัก 20%)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in highlights.contracts" :key="c.id" class="border-b last:border-0">
              <td class="py-2">{{ c.contract_no }}</td>
              <td class="py-2">{{ c.fiscal_year ? Number(c.fiscal_year) : "-" }}</td>
              <td class="py-2 text-right">{{ formatMoney(c.price_per_page) }}</td>
              <td class="py-2 text-right">{{ Number(c.device_count).toLocaleString() }}</td>
              <td class="py-2 text-right">{{ Number(c.total_pages).toLocaleString() }}</td>
              <td class="py-2 text-right font-medium">{{ formatMoney(c.total_cost) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ============================================================
         กราฟ — แยกเป็น 2 แท็บ (การใช้งาน / ค่าใช้จ่าย) แทนวางต่อกันยาว 4 กราฟรวด
         เพราะคนดู dashboard นี้ปกติสนใจอย่างใดอย่างหนึ่งตามช่วงเวลา (ปิดงบ vs ดูแลระบบ)
         ============================================================ -->
    <div class="mt-8">
      <div class="flex gap-1 border-b border-gray-200 mb-6" role="tablist">
        <button
          type="button"
          role="tab"
          :aria-selected="chartTab === 'usage'"
          class="px-4 py-2.5 text-sm font-medium rounded-t-lg -mb-px border-b-2 transition-colors"
          :class="chartTab === 'usage'
            ? 'border-blue-600 text-[var(--brand-text)]'
            : 'border-transparent text-gray-500 hover:text-gray-700'"
          @click="chartTab = 'usage'"
        >
          การใช้งาน
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="chartTab === 'cost'"
          class="px-4 py-2.5 text-sm font-medium rounded-t-lg -mb-px border-b-2 transition-colors"
          :class="chartTab === 'cost'
            ? 'border-blue-600 text-[var(--brand-text)]'
            : 'border-transparent text-gray-500 hover:text-gray-700'"
          @click="chartTab = 'cost'"
        >
          ค่าใช้จ่าย
        </button>
      </div>

      <div v-if="chartTab === 'usage'">
        <div class="bg-gray-50 shadow rounded-lg p-6">
          <h2 class="text-xl font-bold mb-4">ยอดพิมพ์รายเดือน</h2>
          <MonthlyChart :filter="dashboardFilter" />
        </div>

        <div class="mt-6 bg-gray-50 shadow rounded-lg p-6">
          <h2 class="text-xl font-bold mb-4">จำนวนหน้าพิมพ์รายอาคาร</h2>
          <BuildingChart :filter="dashboardFilter" />
        </div>
      </div>

      <div v-else>
        <div class="bg-gray-50 shadow rounded-lg p-6">
          <h2 class="text-xl font-bold mb-4">ค่าใช้จ่ายสุทธิรายเดือน (หัก 20%)</h2>
          <CostChart :filter="dashboardFilter" />
        </div>

        <div class="mt-6 bg-gray-50 shadow rounded-lg p-6">
          <h2 class="text-xl font-bold mb-4">ค่าใช้จ่ายสุทธิรายอาคาร (หัก 20%)</h2>
          <BuildingCostChart :filter="dashboardFilter" />
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, onMounted, h } from "vue";
import { RouterLink } from "vue-router";
import api from "../services/api";

import MonthlyChart from "../components/MonthlyChart.vue";
import BuildingChart from "../components/BuildingChart.vue";
import BuildingCostChart from "../components/BuildingCostChart.vue";
import CostChart from "../components/CostChart.vue";
import DashboardFilter from "../components/DashboardFilter.vue";
import SkeletonBlock from "../components/SkeletonBlock.vue";

// =====================
// State
// =====================

const loading = ref(true);
const statsError = ref(null);

const stats = ref({
  total_devices: 0,
  total_contracts: 0,
  total_transactions: 0,
  total_pages: 0,
});

const highlightsLoading = ref(true);
const highlightsError = ref(null);

const highlights = ref({
  device_status: [],
  top_departments: [],
  top_devices: [],
  contracts: [],
});

// สลับอันดับเครื่อง "มากที่สุด" (desc, ค่าเริ่มต้น) / "น้อยที่สุด" (asc)
const topDevicesOrder = ref("desc"); // "desc" | "asc"

// ป้ายสถานะเครื่องแบบ pill เล็กๆ ในตาราง — ใช้ label/class เดียวกับหน้า PrintTransactions.vue,
// Report.vue, AssetList.vue เพื่อให้ป้ายสถานะเครื่องหน้าตาเหมือนกันทุกหน้าในระบบ
const deviceStatusBadgeMeta = {
  active: { label: "ใช้งานอยู่", class: "bg-green-100 text-green-700" },
  repair: { label: "ซ่อมบำรุง", class: "bg-yellow-100 text-yellow-700" },
  retired: { label: "ปลดระวาง", class: "bg-gray-200 text-gray-600" },
};

// ไอคอนเล็กๆ กำกับสถานะ ไม่ให้พึ่งสีอย่างเดียว (ช่วยผู้ใช้ตาบอดสี/พื้นหลังคอนทราสต์ต่ำ)
const CheckCircleIcon = () =>
  h(
    "svg",
    { viewBox: "0 0 20 20", fill: "currentColor", xmlns: "http://www.w3.org/2000/svg" },
    [
      h("path", {
        "fill-rule": "evenodd",
        "clip-rule": "evenodd",
        d: "M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z",
      }),
    ]
  );

const WrenchIcon = () =>
  h(
    "svg",
    { viewBox: "0 0 20 20", fill: "currentColor", xmlns: "http://www.w3.org/2000/svg" },
    [
      h("path", {
        d: "M14.5 2.134a1 1 0 011 0l3 1.732a1 1 0 01.5.866V8a1 1 0 01-.5.866l-3 1.732a1 1 0 01-1 0L13 9.856v1.288a2.75 2.75 0 01-.804 1.945l-6.708 6.708a2.625 2.625 0 11-3.712-3.712l6.708-6.708A2.75 2.75 0 0110.427 8.5h1.288L10.5 6.634a1 1 0 010-1.732l3-1.732a1 1 0 011-1.036z",
      }),
    ]
  );

const ArchiveBoxIcon = () =>
  h(
    "svg",
    { viewBox: "0 0 20 20", fill: "currentColor", xmlns: "http://www.w3.org/2000/svg" },
    [
      h("path", {
        d: "M2 3a1 1 0 00-1 1v1a1 1 0 001 1h16a1 1 0 001-1V4a1 1 0 00-1-1H2z",
      }),
      h("path", {
        "fill-rule": "evenodd",
        "clip-rule": "evenodd",
        d: "M2 7.5h16l-.811 7.71a2 2 0 01-1.99 1.79H4.8a2 2 0 01-1.99-1.79L2 7.5zM7 11a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1z",
      }),
    ]
  );

const deviceStatusMeta = {
  active: { label: "ใช้งานอยู่", chipClass: "status-chip--success", icon: CheckCircleIcon },
  repair: { label: "ซ่อมบำรุง", chipClass: "status-chip--warning", icon: WrenchIcon },
  retired: { label: "ปลดระวาง", chipClass: "status-chip--neutral", icon: ArchiveBoxIcon },
};

const dashboardFilter = ref({
  building_name: "",
  month: "",
});

const chartTab = ref("usage"); // "usage" | "cost"

function formatMoney(value) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// =====================
// Load KPI
// =====================

async function loadDashboard() {
  loading.value = true;
  statsError.value = null;

  try {
    const params = {};

    if (dashboardFilter.value.building_name) {
      params.building_name = dashboardFilter.value.building_name;
    }

    if (dashboardFilter.value.month) {
      params.month = dashboardFilter.value.month;
    }

    const res = await api.get("/dashboard/stats", { params });

    stats.value = {
      ...res.data,
      total_pages: Number(res.data.total_pages || 0),
    };
  } catch (err) {
    console.error("Dashboard error:", err);
    statsError.value = "ไม่สามารถโหลดข้อมูล KPI ได้";
  } finally {
    loading.value = false;
  }
}

// =====================
// Load Highlights (device status / top departments / contracts)
// =====================

async function loadHighlights() {
  highlightsLoading.value = true;
  highlightsError.value = null;

  try {
    const params = {};

    if (dashboardFilter.value.building_name) {
      params.building_name = dashboardFilter.value.building_name;
    }

    if (dashboardFilter.value.month) {
      params.month = dashboardFilter.value.month;
    }

    params.device_order = topDevicesOrder.value;

    const res = await api.get("/dashboard/highlights", { params });

    highlights.value = {
      device_status: res.data.device_status || [],
      top_departments: res.data.top_departments || [],
      top_devices: res.data.top_devices || [],
      contracts: res.data.contracts || [],
    };
  } catch (err) {
    console.error("Highlights error:", err);
    highlightsError.value = "ไม่สามารถโหลดข้อมูลสรุปได้";
  } finally {
    highlightsLoading.value = false;
  }
}

// สลับปุ่ม "มากที่สุด" / "น้อยที่สุด" ของตารางเครื่องปริ้นมาก/น้อย — โหลดใหม่แค่ highlights
// (ไม่ต้องโหลด stats card ซ้ำ เพราะ KPI ด้านบนไม่เกี่ยวกับลำดับมาก/น้อยของตารางนี้)
function toggleTopDevicesOrder() {
  topDevicesOrder.value = topDevicesOrder.value === "desc" ? "asc" : "desc";
  loadHighlights();
}

// =====================
// Filter Event
// =====================

function handleFilter(filter) {
  if (
    dashboardFilter.value.building_name === filter.building_name &&
    dashboardFilter.value.month === filter.month
  ) {
    return;
  }

  dashboardFilter.value = { ...filter };

  loadDashboard();
  loadHighlights();
}

onMounted(() => {
  loadDashboard();
  loadHighlights();
});
</script>

<style scoped>
/*
  สีสถานะเครื่องพิมพ์ (ใช้งานอยู่/ซ่อมบำรุง/ปลดระวาง)
  ใช้ CSS variable ของตัวเอง (--status-*) แทนการเรียก Tailwind bg-green-50/bg-yellow-50
  ตรงๆ เพราะสเกลสี green/yellow ของ Tailwind ในโปรเจกต์นี้ยังไม่ได้ถูก remap ตามโหมด
  มืด/สว่างเหมือน gray/red/blue (ดู style.css) — ถ้าใช้ bg-green-50 ตรงๆ การ์ดจะกลายเป็น
  แผ่นพื้นเขียวอ่อนจ้าโผล่ขึ้นมาท่ามกลางการ์ดโทนมืดอื่นๆ ตอนเปิดโหมดมืด
*/
.status-chip--success {
  background-color: var(--status-success-bg);
}
.status-chip--success .status-chip__value {
  color: var(--status-success-text);
}

.status-chip--warning {
  background-color: var(--status-warning-bg);
}
.status-chip--warning .status-chip__value {
  color: var(--status-warning-text);
}

.status-chip--neutral {
  /* เดิมใช้ --neutral-100 เหมือนพื้นหลังการ์ดทั่วไป ทำให้ "ปลดระวาง" กลืนหายไป
     เปลี่ยนเป็น --neutral-200 (เข้มขึ้นหนึ่งขั้น) ให้ยังแยกออกจากพื้นหลังได้ */
  background-color: var(--neutral-200);
}
.status-chip--neutral .status-chip__value {
  color: var(--neutral-600);
}

.status-chip__value {
  display: block;
}
</style>