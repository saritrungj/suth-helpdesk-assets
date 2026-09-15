<script setup>
import { deviceLocationLabel } from "../lib/device-location";
import { yearLabel } from "../lib/locale-format";
import { formatMonth } from "../lib/locale-format";

import { t } from "../lib/locale";

// Executive overview: totals, monthly trend, and detailed breakdowns.
import { computed, onMounted, ref } from "vue";
import { ArrowUpRight, RefreshCw, Printer, FileText, Info } from "lucide-vue-next";
import api from "../services/api";
import { errorMessage } from "../lib/api-error";
import { useOverview } from "../api/queries";
import { activeFiscalYear } from "../store/fiscalYear";
import { formatBahtValue, formatCount } from "../lib/format";
import { exportSheet } from "../lib/export-xlsx";
import DashboardFilter from "../components/DashboardFilter.vue";
import UsageTrendChart from "../components/UsageTrendChart.vue";
import {
  UiAlert,
  UiButton,
  UiDrawer,
  UiEmpty,
  UiSegmented,
  UiSkeleton,
  UiCard,
  UiMetric,
  UiRankList,
} from "../ui";

/* --------------------------------------------------------------------------
   สถานะ
   -------------------------------------------------------------------------- */
const filter = ref({ contract_id: "", month: "" });

const highlightsLoading = ref(true);
const highlightsError = ref("");
const highlights = ref({ device_status: [], top_departments: [], top_devices: [], contracts: [] });

/** หน่วยของกราฟ — ไม่เปลี่ยนขอบเขตข้อมูลของหน้า */
const chartMetric = ref("cost");

const departmentOrder = ref("desc");
const deviceOrder = ref("desc");
const detailOpen = ref(false);
const detailLoading = ref(false);
const detailError = ref("");
const detailKind = ref("device");
const detailRows = ref([]);

const ORDER_OPTIONS = [
  { value: "desc", label: t("สูงสุด") },
  { value: "asc", label: t("ต่ำสุด") },
];

/* --------------------------------------------------------------------------
   ค่าที่คำนวณจากข้อมูลที่โหลดมาแล้ว — ไม่ยิง API เพิ่ม
   -------------------------------------------------------------------------- */

const totalDeviceStatus = computed(() =>
  highlights.value.device_status.reduce((sum, s) => sum + Number(s.count || 0), 0)
);

const loading = computed(() => overviewLoading.value || highlightsLoading.value);

/**
 * ภาพรวมทั้งหน้าในคำขอเดียว
 *
 * เดิมหน้านี้ยิงสองคำขอแยกกัน (/dashboard/stats และ /dashboard/monthly-kpi)
 * แล้วเอามาประกอบเอง ตอนนี้ /dashboard/overview ตอบทุกอย่างในครั้งเดียว รวมถึง
 * "รายการที่ต้องลงมือทำ" ที่ของเดิมไม่มีทางคำนวณได้จากฝั่งเบราว์เซอร์เลย
 * (ต้องรู้ว่าเดือนไหนกรอกครบ ต้องรู้ว่าเครื่องไหนไม่มีราคา — ข้อมูลคนละก้อนกัน)
 */
const overviewParams = computed(() => ({
  fiscal_year_id: activeFiscalYear.value?.id || undefined,
  contract_id: filter.value.contract_id || undefined,
  month: filter.value.month || undefined,
}));

const {
  data: overview,
  isPending: overviewLoading,
  isError: overviewIsError,
  error: overviewError,
  refetch: refetchOverview,
} = useOverview(overviewParams);

const totals = computed(() => overview.value?.totals ?? {});
const comparison = computed(() => overview.value?.comparison ?? null);
const metricChange = computed(() => comparison.value?.[chartMetric.value === "cost" ? "cost_change_percent" : "pages_change_percent"]);
const coverage = computed(() => overview.value?.coverage ?? null);

/**
 * บอกว่า "เทียบกับช่วงไหน" ด้วยเดือนจริง ไม่ใช่คำว่า "ช่วงก่อนหน้า" ที่คลุมเครือ
 * ผู้ใช้ต้องรู้ว่าตัวเลข -12% ที่เห็นนั้นเทียบกับอะไร ถึงจะเชื่อมันได้
 */
const comparisonHint = computed(() => {
  const months = comparison.value?.previous_months;
  if (!months?.length) return t("รวมทุกเครื่องในช่วงที่เลือก");

  const first = formatMonth(months[0]);
  const last = formatMonth(months[months.length - 1]);
  return months.length === 1 ? t("เทียบกับ {0}", [first]) : t("เทียบกับ {0} – {1}", [first, last]);
});

/**
 * ป้ายผลต่างจากช่วงก่อนหน้า
 *
 * `inverse` = การเพิ่มขึ้นเป็นเรื่องไม่ดี (ค่าใช้จ่าย) จึงกลับสี — ค่าใช้จ่ายที่
 * เพิ่มขึ้นต้องไม่ขึ้นเป็นสีเขียวเพียงเพราะกราฟชี้ขึ้น
 */
function deltaLabel(value) {
  if (value === null || value === undefined) return "";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toLocaleString("th-TH", { maximumFractionDigits: 1 })}%`;
}

function deltaTone(value, inverse = false) {
  if (value === null || value === undefined || value === 0) return "text-ink-mute bg-surface-3";
  const good = inverse ? value < 0 : value > 0;
  return good ? "text-ok-ink bg-ok-soft" : "text-danger-ink bg-danger-soft";
}

/* --------------------------------------------------------------------------
   โหลดข้อมูล
   -------------------------------------------------------------------------- */
function params(extra = {}) {
  return {
    contract_id: filter.value.contract_id || undefined,
    month: filter.value.month || undefined,
    ...extra,
  };
}

async function loadHighlights() {
  highlightsLoading.value = true;
  highlightsError.value = "";

  try {
    const res = await api.get("/dashboard/highlights", {
      params: params({ device_order: deviceOrder.value, department_order: departmentOrder.value }),
    });

    highlights.value = {
      device_status: res.data.device_status ?? [],
      top_departments: res.data.top_departments ?? [],
      top_devices: res.data.top_devices ?? [],
      contracts: res.data.contracts ?? [],
    };
  } catch (err) {
    console.error("Dashboard highlights error:", err);
    highlightsError.value = t("โหลดข้อมูลสรุปเชิงลึกไม่สำเร็จ");
  } finally {
    highlightsLoading.value = false;
  }
}

function reload() {
  refetchOverview();
  loadHighlights();
}

/** ตัวกรองเปลี่ยนจริงเท่านั้นถึงยิงใหม่ — component ลูก emit ตอน mount ด้วย */
function onFilter(next) {
  if (filter.value.contract_id === next.contract_id && filter.value.month === next.month) return;
  filter.value = { ...next };
  reload();
}

async function openDetails(kind) {
  detailKind.value = kind;
  detailOpen.value = true;
  detailLoading.value = true;
  detailError.value = "";
  detailRows.value = [];

  try {
    const response = await api.get("/dashboard/monthly-kpi", { params: params() });
    const groups = new Map();

    for (const row of response.data ?? []) {
      const key = kind === "device" ? row.device_id : (row.contract_id ?? "unassigned");
      if (!groups.has(key)) {
        groups.set(key, kind === "device"
          ? {
              key,
              serial_number: row.serial_number,
              model: row.model || "—",
              department_name: row.department_name || t("ไม่ระบุแผนก"),
              total_pages: 0,
              total_cost: 0,
            }
          : {
              key,
              contract_no: row.contract_no || t("ยังไม่ผูกสัญญา"),
              device_ids: new Set(),
              total_pages: 0,
              total_cost: 0,
            });
      }
      const target = groups.get(key);
      target.total_pages += Number(row.net_pages || 0);
      target.total_cost += Number(row.total_cost || 0);
      if (kind === "contract") target.device_ids.add(row.device_id);
    }

    detailRows.value = [...groups.values()]
      .map((row) => kind === "contract" ? { ...row, device_count: row.device_ids.size } : row)
      .sort((a, b) => b.total_pages - a.total_pages);
  } catch (err) {
    detailError.value = errorMessage(err, t("โหลดรายละเอียดไม่สำเร็จ"));
  } finally {
    detailLoading.value = false;
  }
}

async function exportDetails() {
  const isDevice = detailKind.value === "device";
  await exportSheet({
    header: isDevice
      ? ["Serial", t("รุ่น"), t("แผนก"), t("ยอดพิมพ์สุทธิ"), t("ค่าใช้จ่ายสุทธิ (บาท)")]
      : [t("สัญญา"), t("จำนวนเครื่อง"), t("ยอดพิมพ์สุทธิ"), t("ค่าใช้จ่ายสุทธิ (บาท)")],
    rows: detailRows.value.map((row) => isDevice
      ? [row.serial_number, row.model, row.department_name, row.total_pages, row.total_cost]
      : [row.contract_no, row.device_count, row.total_pages, row.total_cost]),
    sheetName: isDevice ? t("รายเครื่อง") : t("ตามสัญญา"),
    filename: isDevice ? "dashboard-filtered-devices" : "dashboard-filtered-contracts",
    context: [
      [t("ปีงบ"), yearLabel(activeFiscalYear.value?.year)],
      [t("เดือน"), filter.value.month || t("ดูทั้งปีงบ")],
      [t("สัญญา"), filter.value.contract_id || t("ทุกสัญญา")],
    ],
  });
}

const departmentRanks = computed(() => highlights.value.top_departments.map((row) => ({
  key: row.department_id ?? row.department_name,
  label: row.department_name || t("ไม่ระบุแผนก"),
  detail: row.division_name || "",
  value: Number(row.total_cost || 0),
  displayValue: formatBahtValue(row.total_cost),
})));
const contractPreview = computed(() => highlights.value.contracts.slice(0, 4));

onMounted(loadHighlights);
</script>

<template>
  <div class="flex flex-col gap-5">
    <header class="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 pt-1 pb-2">
      <div>
        <h1 class="text-3xl font-semibold tracking-tight text-ink">{{ t("ภาพรวมการพิมพ์") }}</h1>
        <p class="text-sm text-ink-mute mt-2">{{ t("ค่าใช้จ่ายและการใช้เครื่องพิมพ์") }}<span v-if="activeFiscalYear"> · {{ t("ปีงบ") }} {{ yearLabel(activeFiscalYear.year) }}</span></p>
      </div>
      <div class="flex flex-wrap items-end gap-2 min-w-0">
        <DashboardFilter bare class="min-w-0" @filter="onFilter" />
        <UiButton variant="secondary" icon-only :label="t('โหลดข้อมูลใหม่')" :loading="loading" @click="reload"><template #icon><RefreshCw :size="16" /></template></UiButton>
      </div>
    </header>

    <UiAlert v-if="overviewIsError" tone="danger">
      {{ errorMessage(overviewError, t("โหลดภาพรวมไม่สำเร็จ")) }}
      <template #actions><UiButton size="sm" variant="secondary" @click="refetchOverview">{{ t("ลองใหม่") }}</UiButton></template>
    </UiAlert>
    <UiAlert v-if="highlightsError" tone="danger">
      {{ highlightsError }}
      <template #actions><UiButton size="sm" variant="secondary" @click="loadHighlights">{{ t("ลองใหม่") }}</UiButton></template>
    </UiAlert>

    <div class="report-grid">
      <div class="report-column">
        <UiCard flush class="order-1">
          <div class="p-5 sm:p-6 pb-0 sm:pb-0">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <UiMetric :label="chartMetric === 'cost' ? t('ค่าใช้จ่ายสุทธิ') : t('ยอดพิมพ์สุทธิ')" :value="overviewIsError ? '—' : chartMetric === 'cost' ? formatBahtValue(totals.total_cost) : formatCount(totals.total_pages)" :unit="chartMetric === 'cost' ? t('บาท') : t('หน้า')" :loading="overviewLoading" size="hero">
                <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span v-if="metricChange != null" class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium" :class="chartMetric === 'cost' ? deltaTone(metricChange, true) : 'bg-surface-3 text-ink-soft'">{{ deltaLabel(metricChange) }}</span>
                  <span v-if="metricChange != null">{{ comparisonHint }}</span>
                  <span v-else>{{ t("รวมตามช่วงเวลาที่เลือก") }}</span>
                </div>
              </UiMetric>
              <UiSegmented v-model="chartMetric" :options="[{ value: 'cost', label: t('ค่าใช้จ่าย') }, { value: 'pages', label: t('ยอดพิมพ์') }]" :label="t('ข้อมูลที่แสดงในกราฟ')" size="sm" />
            </div>
            <div class="mt-6 mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 class="text-sm text-ink-soft font-medium">{{ chartMetric === 'cost' ? t("ค่าใช้จ่ายสุทธิรายเดือน") : t("ยอดพิมพ์รายเดือน") }}</h2>
              <div id="dashboard-chart-controls"></div>
            </div>
            <UsageTrendChart :filter="filter" :metric="chartMetric" height="15rem" controls-target="#dashboard-chart-controls" />
            <p class="mt-3 mb-5 text-xs text-ink-mute">{{ t("เฉพาะเดือนที่บันทึกข้อมูลแล้ว · ยอดสุทธิหลังหักจำนวนหน้า 2%") }}</p>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-3 border-t border-line divide-y sm:divide-y-0 sm:divide-x divide-line">
            <div class="p-5 sm:px-6">
              <UiMetric :label="chartMetric === 'cost' ? t('ยอดพิมพ์สุทธิ') : t('ค่าใช้จ่ายสุทธิ')" :value="overviewIsError ? '—' : chartMetric === 'cost' ? formatCount(totals.total_pages) : formatBahtValue(totals.total_cost)" :unit="chartMetric === 'cost' ? t('หน้า') : t('บาท')" :loading="overviewLoading" />
            </div>
            <div class="p-5 sm:px-6">
              <UiMetric :label="t('เครื่องพิมพ์ทั้งหมด')" :value="overviewIsError ? '—' : formatCount(totals.total_devices)" :unit="t('เครื่อง')" :loading="overviewLoading" />
              <p class="mt-1.5 text-xs text-ink-mute">{{ t("ใช้งานอยู่ {0} เครื่อง", [formatCount(totals.active_devices)]) }}</p>
            </div>
            <div class="p-5 sm:px-6">
              <UiMetric :label="t('เดือนที่บันทึกครบ')" :value="overviewIsError ? '—' : `${formatCount(coverage?.annual_complete_months)} / ${formatCount(coverage?.total_months)}`" :loading="overviewLoading" />
              <p class="mt-1.5 text-xs text-ink-mute">{{ totalDeviceStatus ? t("ทั้งปีงบ · รอยืนยันการติดตั้ง") : t("ความครบถ้วนของข้อมูลทั้งปีงบ") }}</p>
            </div>
          </div>
        </UiCard>
        <UiCard flush class="order-3">
          <div class="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6 mb-4">
            <div>
              <h2 class="text-lg font-semibold text-ink">{{ deviceOrder === 'desc' ? t("เครื่องที่ใช้งานมากที่สุด") : t("เครื่องที่ใช้งานน้อยที่สุด") }}</h2>
              <p class="text-xs text-ink-mute mt-1">{{ t("จัดอันดับจากยอดพิมพ์สุทธิในช่วงที่เลือก") }}</p>
            </div>
            <UiSegmented v-model="deviceOrder" :options="ORDER_OPTIONS" size="sm" :label="t('เรียงลำดับเครื่อง')" @update:model-value="loadHighlights" />
          </div>
          <div v-if="highlightsLoading" class="px-6 pb-6 flex flex-col gap-3"><UiSkeleton v-for="n in 5" :key="n" height="3rem" /></div>
          <UiEmpty v-else-if="!highlights.top_devices.length" :title="t('ไม่มีข้อมูลการพิมพ์ในช่วงที่เลือก')" compact />
          <div v-else class="overflow-x-auto px-5 sm:px-6">
            <table class="w-full text-sm">
              <caption class="sr-only">{{ t("ยอดพิมพ์ตามเครื่อง") }}</caption>
              <thead><tr class="text-ink-mute border-b border-line"><th scope="col" class="text-left py-2 font-normal">{{ t("เครื่อง / แผนก") }}</th><th scope="col" class="text-right py-2 font-normal whitespace-nowrap">{{ t("หน้าสุทธิ") }}</th></tr></thead>
              <tbody>
                <tr v-for="device in highlights.top_devices" :key="device.device_id" class="border-b border-line-soft last:border-0">
                  <td class="py-3 pr-3">
                    <div class="flex items-start gap-3">
                      <span class="hidden sm:grid size-9 shrink-0 place-items-center rounded-lg bg-surface-3 text-ink-mute"><Printer :size="17" aria-hidden="true" /></span>
                      <div class="min-w-0">
                        <RouterLink :to="{ path: `/assets/${device.device_id}`, query: { fy: activeFiscalYear?.id } }" class="text-ink font-medium underline underline-offset-4 decoration-line">{{ device.serial_number || device.asset_code || "—" }}</RouterLink>
                        <p class="text-xs text-ink-mute mt-0.5 break-words">{{ device.department_name || t("ไม่ระบุแผนก") }}</p>
                        <p v-if="device.locations?.length" class="text-xs text-ink-mute break-words">{{ deviceLocationLabel(device.locations) }}</p>
                      </div>
                    </div>
                  </td>
                  <td class="text-right font-semibold text-ink numeral whitespace-nowrap">{{ formatCount(device.total_pages) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="border-t border-line px-5 py-3 sm:px-6"><UiButton variant="ghost" size="sm" @click="openDetails('device')">{{ t("ดูทุกเครื่อง") }}<template #trailing><ArrowUpRight :size="14" /></template></UiButton></div>
        </UiCard>
      </div>
      <div class="report-column">
        <UiCard flush class="order-2">
          <div class="p-5 sm:p-6">
            <div class="flex items-start justify-between gap-3 mb-1">
              <h2 class="text-lg font-semibold text-ink">{{ t("ค่าใช้จ่ายตามแผนก") }}</h2>
              <UiButton to="/by-department" variant="ghost" size="sm" icon-only :label="t('ดูทุกแผนก')"><template #icon><ArrowUpRight :size="17" /></template></UiButton>
            </div>
            <div class="flex flex-wrap items-center justify-between gap-2 mb-5">
              <p class="text-xs text-ink-mute">{{ t("ค่าใช้จ่ายสุทธิ · บาท") }}</p>
              <UiSegmented v-model="departmentOrder" :options="ORDER_OPTIONS" size="sm" :label="t('เรียงลำดับแผนก')" @update:model-value="loadHighlights" />
            </div>
            <div v-if="highlightsLoading" class="flex flex-col gap-3"><UiSkeleton v-for="n in 5" :key="n" height="3rem" /></div>
            <UiEmpty v-else-if="!departmentRanks.length" :title="t('ไม่มีข้อมูลในช่วงที่เลือก')" compact />
            <UiRankList v-else :items="departmentRanks" :label="t('ค่าใช้จ่ายตามแผนก')" />
          </div>
          <div class="border-t border-line px-5 py-3 sm:px-6">
            <UiButton to="/by-department" variant="ghost" size="sm">{{ t("ดูทุกแผนก") }}<template #trailing><ArrowUpRight :size="14" /></template></UiButton>
          </div>
        </UiCard>
        <UiCard flush class="order-4">
          <div class="p-5 sm:p-6 pb-3 sm:pb-3">
            <div class="flex items-center justify-between gap-2"><h2 class="text-lg font-semibold text-ink">{{ t("ค่าใช้จ่ายตามสัญญา") }}</h2><FileText :size="18" class="text-ink-mute" aria-hidden="true" /></div>
            <p class="text-xs text-ink-mute mt-1">{{ t("ยอดสุทธิตามช่วงเวลาที่เลือก") }}</p>
          </div>
          <div v-if="highlightsLoading" class="px-6 pb-6 flex flex-col gap-3"><UiSkeleton v-for="n in 3" :key="n" height="3rem" /></div>
          <UiEmpty v-else-if="!contractPreview.length" :title="t('ไม่มีข้อมูลสัญญาในช่วงที่เลือก')" compact />
          <ul v-else class="list-none px-5 sm:px-6 divide-y divide-line-soft">
            <li v-for="contract in contractPreview" :key="contract.id" class="py-4">
              <div class="flex items-baseline justify-between gap-3"><p class="text-sm font-semibold text-ink break-all">{{ contract.contract_no }}</p><p class="text-sm font-semibold text-ink numeral shrink-0">{{ formatBahtValue(contract.total_cost) }}</p></div>
              <div class="flex justify-between gap-3 mt-1 text-xs text-ink-mute"><p>{{ formatCount(contract.device_count) }} {{ t("เครื่อง") }}<span v-if="contract.fiscal_year"> · {{ t("ปีงบ") }} {{ yearLabel(contract.fiscal_year) }}</span></p><span>{{ t("บาท") }}</span></div>
            </li>
          </ul>
          <div class="border-t border-line px-5 py-3 sm:px-6"><UiButton variant="ghost" size="sm" @click="openDetails('contract')">{{ t("ดูทุกสัญญา") }}<template #trailing><ArrowUpRight :size="14" /></template></UiButton></div>
        </UiCard>
      </div>
    </div>

    <div v-if="!highlightsLoading && totalDeviceStatus" class="flex items-start gap-2 text-xs text-ink-mute">
      <Info :size="14" class="shrink-0 mt-0.5" aria-hidden="true" />
      <p>{{ t("ความครบถ้วนของข้อมูลยังยืนยันไม่ได้ จนกว่าจะตรวจสถานะการติดตั้งเครื่องเดิม {0} เครื่อง", [formatCount(totalDeviceStatus)]) }} <RouterLink to="/assets" class="underline text-brand-ink">{{ t("ตรวจสอบทะเบียน") }}</RouterLink></p>
    </div>

    <UiDrawer
      v-model:open="detailOpen"
      size="lg"
      :title="detailKind === 'device' ? t(&quot;รายละเอียดรายเครื่อง&quot;) : t(&quot;รายละเอียดตามสัญญา&quot;)"
      :description="t(&quot;ข้อมูลทั้งหมดตามปีงบ เดือน และสัญญาที่เลือกบน Dashboard&quot;)"
      :pending="detailLoading"
    >
      <template #body>
        <UiAlert v-if="detailError" tone="danger">{{ detailError }}</UiAlert>
        <div v-else-if="detailLoading" class="flex flex-col gap-2"><UiSkeleton v-for="n in 6" :key="n" height="2.75rem" /></div>
        <UiEmpty v-else-if="!detailRows.length" :title="t(&quot;ไม่มีข้อมูลตามตัวกรองนี้&quot;)" compact />
        <div v-else class="overflow-x-auto">
          <table class="w-full text-base">
            <thead><tr class="border-b border-line-soft text-left text-ink-mute"><th class="py-2">{{ detailKind === 'device' ? 'Serial' : t('สัญญา') }}</th><th v-if="detailKind === 'device'">{{ t("รุ่น / แผนก") }}</th><th v-else class="text-right">{{ t("เครื่อง") }}</th><th class="text-right">{{ t("หน้าสุทธิ") }}</th><th class="text-right">{{ t("ค่าใช้จ่ายสุทธิ") }}</th></tr></thead>
            <tbody><tr v-for="row in detailRows" :key="row.key" class="border-b border-line-soft"><td class="py-2" :class="detailKind === 'device' && 'font-mono'">{{ detailKind === 'device' ? row.serial_number : row.contract_no }}</td><td v-if="detailKind === 'device'">{{ row.model }}<span class="block text-xs text-ink-mute">{{ row.department_name }}</span></td><td v-else class="text-right numeral">{{ formatCount(row.device_count) }}</td><td class="text-right numeral">{{ formatCount(row.total_pages) }}</td><td class="text-right numeral">{{ formatBahtValue(row.total_cost) }}</td></tr></tbody>
          </table>
        </div>
      </template>
      <template #footer>
        <UiButton variant="secondary" :disabled="!detailRows.length || detailLoading" @click="exportDetails">{{ t("ส่งออกผลที่กรอง") }}</UiButton>
      </template>
    </UiDrawer>
  </div>
</template>
