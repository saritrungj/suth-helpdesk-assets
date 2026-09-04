<template>
  <div>

    <!-- ============================================================
         Header — eyebrow label + title ใหญ่ + subtitle สั้นๆ
         ปรับสไตล์ตาม template ภาพรวมข้อมูล (การ์ดเล็ก / ป้ายอักษรพิมพ์เล็ก / ตัวเลขไฮไลต์)
         ============================================================ -->
    <div class="mb-6">
      <p class="text-[11px] font-semibold tracking-widest text-gray-400 uppercase">
        Data Overview{{ activeFiscalYear?.year ? ` · ปีงบประมาณ ${activeFiscalYear.year}` : "" }}
      </p>
      <h1 class="text-3xl font-bold mt-1">ภาพรวมข้อมูลเครื่องพิมพ์และค่าใช้จ่าย</h1>
      <p class="text-sm text-gray-500 mt-1">
        ค้นหาและตรวจสอบข้อมูลเครื่องพิมพ์ ค่าใช้จ่าย และแผนกที่ใช้งานทั้งหมด
      </p>
    </div>

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

      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">

        <div class="bg-gray-50 shadow rounded-xl border border-gray-100/60 p-4 hover:shadow-lg transition">
          <h2 class="text-[11px] font-semibold tracking-widest text-gray-400 uppercase">อุปกรณ์ทั้งหมด</h2>
          <SkeletonBlock v-if="loading" width="4rem" height="1.75rem" class="mt-1" />
          <p v-else class="text-2xl font-bold text-[var(--brand-text)] mt-1">
            {{ Number(stats.total_devices || 0).toLocaleString() }}
          </p>
        </div>

        <div class="bg-gray-50 shadow rounded-xl border border-gray-100/60 p-4 hover:shadow-lg transition">
          <h2 class="text-[11px] font-semibold tracking-widest text-gray-400 uppercase">สัญญาทั้งหมด</h2>
          <SkeletonBlock v-if="loading" width="4rem" height="1.75rem" class="mt-1" />
          <p v-else class="text-2xl font-bold text-green-600 mt-1">
            {{ Number(stats.total_contracts || 0).toLocaleString() }}
          </p>
        </div>

        <div class="bg-gray-50 shadow rounded-xl border border-gray-100/60 p-4 hover:shadow-lg transition">
          <h2 class="text-[11px] font-semibold tracking-widest text-gray-400 uppercase">รายการพิมพ์</h2>
          <SkeletonBlock v-if="loading" width="4rem" height="1.75rem" class="mt-1" />
          <p v-else class="text-2xl font-bold text-purple-600 mt-1">
            {{ Number(stats.total_transactions || 0).toLocaleString() }}
          </p>
        </div>

        <div class="bg-gray-50 shadow rounded-xl border border-gray-100/60 p-4 hover:shadow-lg transition">
          <h2 class="text-[11px] font-semibold tracking-widest text-gray-400 uppercase">จำนวนหน้าที่พิมพ์</h2>
          <SkeletonBlock v-if="loading" width="4rem" height="1.75rem" class="mt-1" />
          <p v-else class="text-2xl font-bold text-red-600 mt-1">
            {{ Number(stats.total_pages || 0).toLocaleString() }}
          </p>
        </div>

      </div>

      <!-- ตัวเลขไฮไลต์ค่าใช้จ่ายสุทธิรวม — รวมจากตาราง "สรุปการใช้งานตามสัญญา"
           สไตล์เดียวกับการ์ดตัวเลขไฮไลต์ตัวใหญ่ใน template อ้างอิง -->
      <div class="mt-4 bg-gray-50 shadow rounded-xl border border-gray-100/60 p-4">
        <h2 class="text-[11px] font-semibold tracking-widest text-gray-400 uppercase">
          ค่าใช้จ่ายสุทธิรวมทุกสัญญา (หัก 20%)
        </h2>
        <SkeletonBlock v-if="highlightsLoading" width="10rem" height="2.25rem" class="mt-1" />
        <p v-else class="text-3xl font-bold text-red-600 mt-1">
          {{ formatMoney(netCostTotal) }} <span class="text-base font-normal text-gray-400">บาท</span>
        </p>
      </div>
    </div>

    <!-- ============================================================
         Top departments — ranked bar list (สไตล์เดียวกับ "TOP PROVINCES")
         สลับมาก/น้อยได้ด้วยปุ่มเดียว
         ============================================================ -->
    <div class="mt-6 bg-gray-50 shadow rounded-xl border border-gray-100/60 p-6">
      <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 class="text-[11px] font-semibold tracking-widest text-gray-400 uppercase">Top Departments</h2>
          <p class="text-lg font-bold mt-0.5">
            แผนกที่ค่าใช้จ่ายสุทธิ{{ topDepartmentsOrder === "desc" ? "สูงสุด" : "น้อยสุด" }} (หัก 20%)
          </p>
        </div>

        <div class="flex items-center gap-3">
          <button
            type="button"
            @click="toggleTopDepartmentsOrder"
            class="text-sm border rounded px-3 py-1.5 hover:bg-gray-100 flex items-center gap-1"
          >
            {{ topDepartmentsOrder === "desc" ? "มากที่สุด" : "น้อยที่สุด" }}
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
              <path v-if="topDepartmentsOrder === 'desc'" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              <path v-else d="M4.5 15.75l7.5-7.5 7.5 7.5" />
            </svg>
          </button>

          <RouterLink to="/by-department" class="text-sm text-gray-500 hover:text-gray-700 underline whitespace-nowrap">
            ดูทั้งหมด →
          </RouterLink>
        </div>
      </div>

      <div v-if="highlightsError" class="text-sm text-red-600">{{ highlightsError }}</div>

      <div v-else-if="highlightsLoading" class="space-y-3">
        <SkeletonBlock v-for="n in 5" :key="n" height="2.5rem" />
      </div>

      <div v-else-if="highlights.top_departments.length === 0" class="text-gray-400 text-sm">
        ไม่มีข้อมูลในช่วงที่เลือก
      </div>

      <div v-else class="space-y-4">
        <div
          v-for="(d, idx) in highlights.top_departments"
          :key="d.department_id ?? d.department_name"
          class="flex items-center gap-3"
        >
          <span class="w-7 shrink-0 text-xs font-semibold text-gray-400 text-right">
            {{ String(idx + 1).padStart(2, "0") }}
          </span>

          <div class="flex-1 min-w-0">
            <div class="flex items-baseline justify-between gap-2">
              <p class="text-sm font-medium truncate">
                {{ d.department_name || "ไม่ระบุแผนก" }}
                <span class="text-gray-400 font-normal">{{ d.division_name ? `· ${d.division_name}` : "" }}</span>
              </p>
              <p class="text-sm font-semibold shrink-0">
                {{ formatMoney(d.total_cost) }} <span class="text-xs text-gray-400 font-normal">บาท</span>
              </p>
            </div>
            <div class="mt-1.5 h-2 rounded-full bg-gray-200/70 overflow-hidden">
              <div
                class="h-full rounded-full bg-[var(--brand-500)]"
                :style="{ width: deptBarWidth(d.total_cost) + '%' }"
              ></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ============================================================
         3 คอลัมน์ล่าง — เครื่องที่ปริ้นมาก/น้อย, สัญญา, สถานะเครื่องพิมพ์
         สไตล์เดียวกับ "TOP DISTRICTS / TOP AGENCIES / SCORE DISTRIBUTION"
         ============================================================ -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">

      <!-- เครื่องที่ปริ้นมากสุด/น้อยสุด -->
      <div class="bg-gray-50 shadow rounded-xl border border-gray-100/60 p-6">
        <div class="flex items-center justify-between mb-4 gap-2">
          <div>
            <h2 class="text-[11px] font-semibold tracking-widest text-gray-400 uppercase">Top Devices</h2>
            <p class="text-base font-bold mt-0.5">
              เครื่องที่ปริ้น{{ topDevicesOrder === "desc" ? "มากที่สุด" : "น้อยที่สุด" }}
            </p>
          </div>
          <button
            type="button"
            @click="toggleTopDevicesOrder"
            class="text-xs border rounded px-2 py-1 hover:bg-gray-100 flex items-center gap-1 shrink-0"
          >
            {{ topDevicesOrder === "desc" ? "มาก" : "น้อย" }}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="w-3 h-3"
            >
              <path v-if="topDevicesOrder === 'desc'" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              <path v-else d="M4.5 15.75l7.5-7.5 7.5 7.5" />
            </svg>
          </button>
        </div>

        <div v-if="highlightsError" class="text-sm text-red-600">{{ highlightsError }}</div>
        <div v-else-if="highlightsLoading" class="space-y-2">
          <SkeletonBlock v-for="n in 5" :key="n" height="2.25rem" />
        </div>
        <div v-else-if="highlights.top_devices.length === 0" class="text-gray-400 text-sm">
          ไม่มีข้อมูลในช่วงที่เลือก
        </div>
        <ul v-else class="divide-y divide-gray-200/60">
          <li v-for="(d, idx) in highlights.top_devices" :key="d.device_id" class="py-2.5 flex items-center gap-3">
            <span class="w-6 h-6 shrink-0 rounded-full bg-[var(--brand-100)] text-[var(--brand-700)] text-xs font-semibold flex items-center justify-center">
              {{ idx + 1 }}
            </span>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium truncate">{{ d.serial_number || "-" }}</p>
              <p class="text-xs text-gray-500 truncate">{{ d.department_name || "ไม่ระบุแผนก" }}</p>
            </div>
            <span class="text-sm font-semibold shrink-0">
              {{ Number(d.total_pages || 0).toLocaleString() }} <span class="text-xs text-gray-400 font-normal">หน้า</span>
            </span>
          </li>
        </ul>
        <RouterLink to="/by-department" class="text-xs text-gray-500 hover:text-gray-700 underline block mt-3">
          ดูทั้งหมด →
        </RouterLink>
      </div>

      <!-- สรุปการใช้งานตามสัญญา -->
      <div class="bg-gray-50 shadow rounded-xl border border-gray-100/60 p-6">
        <h2 class="text-[11px] font-semibold tracking-widest text-gray-400 uppercase">Top Contracts</h2>
        <p class="text-base font-bold mt-0.5 mb-4">สรุปการใช้งานตามสัญญา</p>

        <div v-if="highlightsError" class="text-sm text-red-600">{{ highlightsError }}</div>
        <div v-else-if="highlightsLoading" class="space-y-2">
          <SkeletonBlock v-for="n in 3" :key="n" height="2.25rem" />
        </div>
        <div v-else-if="highlights.contracts.length === 0" class="text-gray-400 text-sm">
          ยังไม่มีสัญญาในระบบ
        </div>
        <ul v-else class="divide-y divide-gray-200/60">
          <li v-for="(c, idx) in highlights.contracts" :key="c.id" class="py-2.5 flex items-center gap-3">
            <span class="w-6 h-6 shrink-0 rounded-full bg-[var(--brand-100)] text-[var(--brand-700)] text-xs font-semibold flex items-center justify-center">
              {{ idx + 1 }}
            </span>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium truncate">{{ c.contract_no }}</p>
              <p class="text-xs text-gray-500 truncate">
                ปีงบ {{ c.fiscal_year ? Number(c.fiscal_year) : "-" }} · {{ Number(c.device_count).toLocaleString() }} เครื่อง
              </p>
            </div>
            <span class="text-sm font-semibold shrink-0">
              {{ formatMoney(c.total_cost) }} <span class="text-xs text-gray-400 font-normal">บาท</span>
            </span>
          </li>
        </ul>
        <RouterLink to="/expense" class="text-xs text-gray-500 hover:text-gray-700 underline block mt-3">
          ดูทั้งหมด →
        </RouterLink>
      </div>

      <!-- สถานะเครื่องพิมพ์ — bar chart แบบเดียวกับ "SCORE DISTRIBUTION" -->
      <div class="bg-gray-50 shadow rounded-xl border border-gray-100/60 p-6">
        <h2 class="text-[11px] font-semibold tracking-widest text-gray-400 uppercase">Device Status</h2>
        <p class="text-base font-bold mt-0.5 mb-4">สถานะเครื่องพิมพ์</p>

        <div v-if="highlightsError" class="text-sm text-red-600 flex items-center justify-between gap-3">
          <span>{{ highlightsError }}</span>
          <button type="button" class="underline shrink-0" @click="loadHighlights">ลองใหม่</button>
        </div>

        <div v-else-if="highlightsLoading" class="h-40 flex items-end gap-3">
          <SkeletonBlock v-for="n in 3" :key="n" width="100%" height="6rem" />
        </div>

        <div v-else class="h-40 flex items-end gap-4 px-2">
          <div
            v-for="s in highlights.device_status"
            :key="s.status"
            class="flex-1 flex flex-col items-center justify-end h-full"
          >
            <span class="text-xs font-semibold mb-1" :class="deviceStatusMeta[s.status]?.barTextClass">
              {{ Number(s.count).toLocaleString() }}
            </span>
            <div
              class="w-full rounded-t-md transition-all"
              :class="deviceStatusMeta[s.status]?.barClass"
              :style="{ height: statusBarHeight(s.count) + '%' }"
            ></div>
            <span class="text-xs text-gray-500 mt-2 text-center">
              {{ deviceStatusMeta[s.status]?.label || s.status }}
            </span>
          </div>
        </div>
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
        <div class="bg-gray-50 shadow rounded-xl border border-gray-100/60 p-6">
          <h2 class="text-xl font-bold mb-4">ยอดพิมพ์รายเดือน</h2>
          <MonthlyChart :filter="dashboardFilter" />
        </div>

        <div class="mt-6 bg-gray-50 shadow rounded-xl border border-gray-100/60 p-6">
          <h2 class="text-xl font-bold mb-4">จำนวนหน้าพิมพ์รายอาคาร</h2>
          <BuildingChart :filter="dashboardFilter" />
        </div>
      </div>

      <div v-else>
        <div class="bg-gray-50 shadow rounded-xl border border-gray-100/60 p-6">
          <h2 class="text-xl font-bold mb-4">ค่าใช้จ่ายสุทธิรายเดือน (หัก 20%)</h2>
          <CostChart :filter="dashboardFilter" />
        </div>

        <div class="mt-6 bg-gray-50 shadow rounded-xl border border-gray-100/60 p-6">
          <h2 class="text-xl font-bold mb-4">ค่าใช้จ่ายสุทธิรายอาคาร (หัก 20%)</h2>
          <BuildingCostChart :filter="dashboardFilter" />
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, h } from "vue";
import { RouterLink } from "vue-router";
import api from "../services/api";
import { activeFiscalYear } from "../store/fiscalYear";

import MonthlyChart from "../components/MonthlyChart.vue";
import BuildingChart from "../components/BuildingChart.vue";
import BuildingCostChart from "../components/BuildingCostChart.vue";
import CostChart from "../components/CostChart.vue";
import DashboardFilter from "../components/DashboardFilter.vue";
import SkeletonBlock from "../components/SkeletonBlock.vue";
import { fromSatang, sumSatang, toSatang } from "@suth/domain";

// รวมเงินหลายรายการ — บวกในหน่วยสตางค์ที่เป็นจำนวนเต็ม ไม่บวก float ของบาท
// ใช้ total_cost_satang ที่ API ส่งมาก่อน ถ้าไม่มีก็แปลงจาก total_cost แบบไม่ผ่านทศนิยมลอยตัว
// ดูเหตุผลใน packages/domain/money.cjs
function sumCost(rows) {
  return fromSatang(
    sumSatang(
      (rows || []).map((r) => r.total_cost_satang ?? toSatang(r.total_cost))
    )
  );
}


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

// สลับอันดับแผนก "มากที่สุด" (desc, ค่าเริ่มต้น) / "น้อยที่สุด" (asc)
const topDepartmentsOrder = ref("desc"); // "desc" | "asc"

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
  active: {
    label: "ใช้งานอยู่",
    chipClass: "status-chip--success",
    icon: CheckCircleIcon,
    barClass: "status-bar--success",
    barTextClass: "status-bar__text--success",
  },
  repair: {
    label: "ซ่อมบำรุง",
    chipClass: "status-chip--warning",
    icon: WrenchIcon,
    barClass: "status-bar--warning",
    barTextClass: "status-bar__text--warning",
  },
  retired: {
    label: "ปลดระวาง",
    chipClass: "status-chip--neutral",
    icon: ArchiveBoxIcon,
    barClass: "status-bar--neutral",
    barTextClass: "status-bar__text--neutral",
  },
};

// =====================
// Derived / computed สำหรับการ์ดสไตล์ template (ranked bar list / highlight number / distribution bar chart)
// =====================

// ค่าใช้จ่ายสุทธิรวมทุกสัญญา — รวมจาก highlights.contracts ที่โหลดมาแล้ว ไม่ต้องยิง API เพิ่ม
const netCostTotal = computed(() =>
  sumCost(highlights.value.contracts)
);

// ความกว้าง (%) ของแถบในการ์ด "แผนกที่ค่าใช้จ่ายสุทธิสูงสุด/น้อยสุด" เทียบกับค่าที่มากที่สุดในลิสต์
// ป้องกันหารด้วย 0 ตอนไม่มีข้อมูล/ทุกแผนกค่าใช้จ่ายเป็น 0
function deptBarWidth(cost) {
  const max = Math.max(1, ...highlights.value.top_departments.map((d) => Number(d.total_cost || 0)));
  return Math.max(2, (Number(cost || 0) / max) * 100);
}

// ความสูง (%) ของแท่งกราฟในการ์ด "สถานะเครื่องพิมพ์" เทียบกับสถานะที่มีจำนวนเครื่องมากที่สุด
function statusBarHeight(count) {
  const max = Math.max(1, ...highlights.value.device_status.map((s) => Number(s.count || 0)));
  return Math.max(4, (Number(count || 0) / max) * 100);
}

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
    params.department_order = topDepartmentsOrder.value;

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

// สลับปุ่ม "มากที่สุด" / "น้อยที่สุด" ของการ์ดแผนกค่าใช้จ่ายสุทธิ — โหลดใหม่แค่ highlights
function toggleTopDepartmentsOrder() {
  topDepartmentsOrder.value = topDepartmentsOrder.value === "desc" ? "asc" : "desc";
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

/*
  แท่งกราฟในการ์ด "สถานะเครื่องพิมพ์" (สไตล์เดียวกับ SCORE DISTRIBUTION ใน template อ้างอิง)
  ใช้ CSS variable ชุดเดียวกับ status-chip ด้านบน เพื่อให้สีสถานะตรงกันทั้งหน้า
*/
.status-bar--success {
  background-color: var(--status-success-text);
  opacity: 0.85;
}
.status-bar__text--success {
  color: var(--status-success-text);
}

.status-bar--warning {
  background-color: var(--status-warning-text);
  opacity: 0.85;
}
.status-bar__text--warning {
  color: var(--status-warning-text);
}

.status-bar--neutral {
  background-color: var(--neutral-400);
}
.status-bar__text--neutral {
  color: var(--neutral-500);
}
</style>