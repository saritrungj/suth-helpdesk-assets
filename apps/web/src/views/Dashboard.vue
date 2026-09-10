<script setup>
import { deviceLocationLabel } from "../lib/device-location";
import { yearLabel } from "../lib/locale-format";
import { formatMonth } from "../lib/locale-format";

import { t } from "../lib/locale";

/**
 * Dashboard — หน้าแรกหลังเข้าระบบ
 *
 * ลำดับของข้อมูลบนหน้านี้เรียงตาม "คำถามที่คนเปิดหน้านี้ถามจริง" ไล่จากกว้างไปแคบ
 *
 *   1. มีอะไรที่ฉันต้องทำไหม                                   -> แถบสิ่งที่ต้องจัดการ
 *   2. ตอนนี้เราจ่ายไปเท่าไหร่แล้ว และมีเครื่องอยู่กี่เครื่อง   -> การ์ดตัวเลขสรุป
 *   3. ยอดขึ้นหรือลงจากช่วงก่อน                                -> กราฟแนวโน้ม
 *   4. ใครใช้เยอะ                                              -> อันดับแผนก/อาคาร/เครื่อง
 *
 * ข้อ 1 เคยไม่มีอยู่บนหน้านี้เลย และเป็นคำถามที่คนถามก่อนคำถามอื่นทั้งหมด — ถ้า
 * ไม่มีอะไรค้าง เขาปิดหน้าไปทำงานอื่น ถ้ามี เขาต้องรู้ทันทีว่าคืออะไรและกดตรงไหน
 * แดชบอร์ดเดิมตอบได้แค่ "ตัวเลขตอนนี้เป็นเท่าไหร่" ซึ่งเป็นคำถามอันดับสอง
 *
 * ตัวเลขค่าใช้จ่ายบนหน้านี้เป็น "ค่าใช้จ่ายสุทธิ" ที่หัก 20% แล้วตามเงื่อนไขสัญญา
 * และเขียนกำกับไว้ทุกจุดที่แสดง เพราะเลขนี้ถูกเอาไปเทียบกับใบแจ้งหนี้จริง
 * ถ้าไม่บอกว่าหักแล้วจะกลายเป็นการรายงานผิด
 */
import { computed, onMounted, ref } from "vue";
import {
  ArrowUpRight,
  Boxes,
  FileText,
  Printer,
  ReceiptText,
  RefreshCw,
  Wallet,
} from "lucide-vue-next";
import { fromSatang, sumSatang, toSatang } from "@suth/domain";
import api from "../services/api";
import { errorMessage } from "../lib/api-error";
import { useOverview } from "../api/queries";
import { activeFiscalYear, activeFiscalYearRange } from "../store/fiscalYear";
import { formatBahtValue, formatCount, percentOf } from "../lib/format";
import BuildingBreakdownChart from "../components/BuildingBreakdownChart.vue";
import AttentionPanel from "../components/AttentionPanel.vue";
import DashboardHero from "../components/DashboardHero.vue";
import DashboardFilter from "../components/DashboardFilter.vue";
import UsageTrendChart from "../components/UsageTrendChart.vue";
import {
  UiAlert,
  UiBadge,
  UiButton,
  UiCard,
  UiEmpty,
  UiMeter,
  UiSegmented,
  UiSkeleton,
  UiStat,
} from "../ui";

/* --------------------------------------------------------------------------
   สถานะ
   -------------------------------------------------------------------------- */
const dashboardFilter = ref(null);
const filter = ref({ building_name: "", month: "" });

const highlightsLoading = ref(true);
const highlightsError = ref("");
const highlights = ref({ device_status: [], top_departments: [], top_devices: [], contracts: [] });

const departmentOrder = ref("desc");
const deviceOrder = ref("desc");
const chartMetric = ref("pages");

const ORDER_OPTIONS = [
  { value: "desc", label: t("มากสุด") },
  { value: "asc", label: t("น้อยสุด") },
];

/** สถานะของเครื่อง — ป้ายภาษาไทยและโทนสี กำหนดรวมไว้ที่เดียวเพื่อให้ทุกหน้าตรงกัน */
const STATUS_META = {
  active: { label: t("ใช้งานอยู่"), tone: "ok", bar: "bg-ok" },
  repair: { label: t("ซ่อมบำรุง"), tone: "warn", bar: "bg-warn" },
  retired: { label: t("ปลดระวาง"), tone: "neutral", bar: "bg-ink-faint" },
};

/* --------------------------------------------------------------------------
   ค่าที่คำนวณจากข้อมูลที่โหลดมาแล้ว — ไม่ยิง API เพิ่ม
   -------------------------------------------------------------------------- */

/** รวมเงินในหน่วยสตางค์ที่เป็นจำนวนเต็ม ไม่บวกทศนิยมลอยตัวของบาท (ดู packages/domain/money.cjs) */
function sumCost(rows) {
  return fromSatang(sumSatang((rows ?? []).map((r) => r.total_cost_satang ?? toSatang(r.total_cost))));
}

const netCostTotal = computed(() => sumCost(highlights.value.contracts));

const topDepartmentMax = computed(() =>
  Math.max(1, ...highlights.value.top_departments.map((d) => Number(d.total_cost || 0)))
);

const totalDeviceStatus = computed(() =>
  highlights.value.device_status.reduce((sum, s) => sum + Number(s.count || 0), 0)
);

const topDeviceMax = computed(() =>
  Math.max(1, ...highlights.value.top_devices.map((d) => Number(d.total_pages || 0)))
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
  building_name: filter.value.building_name || undefined,
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
const attention = computed(() => overview.value?.attention ?? []);
const coverage = computed(() => overview.value?.coverage ?? null);

/**
 * เส้นแนวโน้มจิ๋วบนการ์ดตัวเลข
 *
 * ใช้ชุดข้อมูลก้อนเดียวกับที่การ์ดอื่นในหน้าใช้ จึงไม่มีคำขอเพิ่มแม้แต่คำขอเดียว
 * หน้าที่ของมันคือบอกว่าตัวเลขนี้กำลังขึ้นหรือลง ซึ่งเป็นบริบทที่ตัวเลขเดี่ยวๆ
 * ไม่มีทางบอกได้ — ตั้งใจไม่มีแกนและไม่มีตัวเลขกำกับ ค่าจริงอยู่ในกราฟใหญ่แล้ว
 *
 * ดึงทั้งปีงบเสมอ ไม่ใช่แค่ช่วงที่กรอง เพราะเส้นแนวโน้มที่มีจุดเดียว (ตอนเลือก
 * เดือนเดียว) ไม่ได้บอกอะไรเลย
 */
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
 * โทนสีของการ์ด "ความครบถ้วนของข้อมูล"
 *
 * นี่เป็นการวัดเทียบเพดานจริง (ควรกรอกครบทุกเดือนที่ผ่านไปแล้ว) ไม่ใช่การเทียบ
 * สัดส่วนระหว่างรายการ จึงใช้สีบอกสถานะได้อย่างถูกต้อง — ต่างจากแถบเทียบแผนก
 * ด้านล่างที่ห้ามใช้สีสถานะ เพราะการเป็นแผนกที่ใช้เยอะที่สุดไม่ใช่ "ความผิดพลาด"
 *
 * ⚠️ วัดจาก **เดือน** ไม่ใช่จาก reporting_active_devices/active_devices ซึ่งนับ
 * "เครื่องที่เคยมียอดอย่างน้อยหนึ่งเดือน" — เคยใช้ค่านั้นแล้วการ์ดขึ้นเขียวว่า
 * "18/18" ทั้งที่ยังกรอกไม่ครบ 5 เดือน
 */
const dataCompletenessTone = computed(() => {
  const elapsed = Number(coverage.value?.total_months || 0);
  const complete = Number(coverage.value?.annual_complete_months || 0);
  if (!elapsed || !coverage.value?.applicable) return "ink";
  if (complete >= elapsed) return "ok";
  return complete >= elapsed * 0.8 ? "warn" : "danger";
});

const trend = computed(() => {
  const series = overview.value?.series ?? [];
  return {
    pages: series.map((row) => row.net_pages),
    cost: series.map((row) => row.total_cost),
  };
});

/* --------------------------------------------------------------------------
   โหลดข้อมูล
   -------------------------------------------------------------------------- */
function params(extra = {}) {
  return {
    building_name: filter.value.building_name || undefined,
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
  if (filter.value.building_name === next.building_name && filter.value.month === next.month) return;
  filter.value = { ...next };
  reload();
}

onMounted(loadHighlights);
</script>

<template>
  <div>
    <DashboardHero
      :fiscal-year="activeFiscalYear"
      :range="activeFiscalYearRange"
      :coverage="coverage"
      :loading="overviewLoading"
    />

    <!--
      อยู่เหนือทุกอย่างเพราะเป็นคำถามแรกที่คนเปิดหน้านี้ถาม และอยู่เหนือแถวตัวกรอง
      เพราะ "งานที่ค้าง" ไม่ควรถูกซ่อนด้วยตัวกรองที่ผู้ใช้เผลอตั้งไว้จากครั้งก่อน
    -->
    <AttentionPanel :items="attention" :loading="overviewLoading" class="mb-5" />

    <!-- ปุ่มรีเฟรชอยู่ติดแถบตัวกรอง เพราะสิ่งที่มันโหลดใหม่คือข้อมูล "ของตัวกรอง
         ชุดที่ตั้งอยู่ตอนนี้" ไม่ใช่ทั้งหน้าแบบไม่มีเงื่อนไข -->
    <div class="flex items-start gap-3 mb-5">
      <DashboardFilter ref="dashboardFilter" v-model:metric="chartMetric" class="flex-1 min-w-0" @filter="onFilter" />

      <UiButton
        variant="secondary"
        icon-only
        :label="t(&quot;โหลดข้อมูลใหม่&quot;)"
        :loading="loading"
        class="mt-px shrink-0"
        @click="reload"
      >
        <template #icon><RefreshCw :size="15" /></template>
      </UiButton>
    </div>

    <UiAlert v-if="overviewIsError" tone="danger" class="mb-4">
      {{ errorMessage(overviewError, t("โหลดภาพรวมไม่สำเร็จ")) }}
      <template #actions>
        <UiButton size="sm" variant="secondary" @click="refetchOverview"> {{ t("ลองใหม่") }} </UiButton>
      </template>
    </UiAlert>

    <!-- ตัวเลขสรุป — ค่าใช้จ่ายสุทธิเป็นใบที่เน้น เพราะเป็นตัวเลขที่ผู้บริหารถามถึงก่อนเสมอ -->
    <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
      <UiStat
        :label="t(&quot;ค่าใช้จ่ายสุทธิรวม&quot;)"
        :unit="t(&quot;บาท&quot;)"
        :hint="t(&quot;ทุกสัญญา หลังหักส่วนลด 20%&quot;)"
        tone="ink"
        :loading="overviewLoading"
        :trend="trend.cost"
        :delta="comparison?.cost_change_percent ?? null"
        delta-inverse
      >
        {{ formatBahtValue(totals.total_cost) }}
        <template #icon><Wallet :size="16" class="text-brand-ink opacity-70" /></template>
      </UiStat>

      <UiStat
        :label="t(&quot;จำนวนหน้าที่พิมพ์&quot;)"
        :unit="t(&quot;หน้า&quot;)"
        :hint="comparisonHint"
        tone="ink"
        :loading="overviewLoading"
        :trend="trend.pages"
        :delta="comparison?.pages_change_percent ?? null"
        delta-inverse
      >
        {{ formatCount(totals.total_pages) }}
        <template #icon><Printer :size="16" class="text-ink-faint" /></template>
      </UiStat>

      <UiStat
        :label="t(&quot;อุปกรณ์ในทะเบียน&quot;)"
        :unit="t(&quot;เครื่อง&quot;)"
        :hint="t(&quot;ใช้งานอยู่ {0} เครื่อง&quot;, [formatCount(totals.active_devices)])"
        tone="ink"
        :loading="overviewLoading"
      >
        {{ formatCount(totals.total_devices) }}
        <template #icon><Boxes :size="16" class="text-ink-faint" /></template>
      </UiStat>

      <!--
        เดิมการ์ดใบนี้แสดง "จำนวนรายการที่บันทึกไว้" ซึ่งเป็นจำนวนแถวในฐานข้อมูล —
        เป็นตัวเลขที่ไม่ตอบคำถามอะไรของใครเลย เปลี่ยนเป็นความครบถ้วนของข้อมูลแทน
        ซึ่งบอกได้ทันทีว่าตัวเลขทั้งหน้านี้เชื่อถือได้แค่ไหน
      -->
      <UiStat
        :label="t(&quot;ความครบถ้วนของข้อมูล&quot;)"
        :unit="t(&quot;เดือน&quot;)"
        :hint="t(&quot;ทั้งปีงบ · ค้าง {0} เดือน · ยังไม่ถึงกำหนด {1} เดือน&quot;, [formatCount(coverage?.incomplete_months), formatCount(coverage?.not_due_months)])"
        :tone="dataCompletenessTone"
        :loading="overviewLoading"
      >
        {{ formatCount(coverage?.annual_complete_months) }}/{{ formatCount(coverage?.total_months) }}
        <template #icon><FileText :size="16" class="text-ink-faint" /></template>
      </UiStat>
    </div>

    <!-- แนวโน้มรายเดือน + สถานะเครื่อง -->
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
      <UiCard
        :eyebrow="t(&quot;แนวโน้มตลอดปีงบ&quot;)"
        :title="chartMetric === 'cost' ? t(&quot;ค่าใช้จ่ายรายเดือน&quot;) : t(&quot;ยอดพิมพ์รายเดือน&quot;)"
      >
        <UsageTrendChart :filter="filter" :metric="chartMetric" height="19rem" @select-month="dashboardFilter?.selectMonth($event)" />
      </UiCard>

      <UiCard
        :eyebrow="t(&quot;เปรียบเทียบรายอาคาร&quot;)"
        :title="chartMetric === 'cost' ? t(&quot;ค่าใช้จ่ายสุทธิรายอาคาร&quot;) : t(&quot;ยอดพิมพ์รายอาคาร&quot;)"
      >
        <BuildingBreakdownChart :filter="filter" :metric="chartMetric" height="19rem" />
      </UiCard>
    </div>
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
      <UiCard :eyebrow="t(&quot;ทะเบียนอุปกรณ์&quot;)" :title="t(&quot;สถานะเครื่องพิมพ์&quot;)">
        <div v-if="highlightsLoading" class="flex flex-col gap-3">
          <UiSkeleton height="0.75rem" />
          <UiSkeleton v-for="n in 3" :key="n" height="2.5rem" />
        </div>

        <div v-else-if="!totalDeviceStatus">
          <UiEmpty :title="t(&quot;ยังไม่มีเครื่องในทะเบียน&quot;)" compact />
        </div>

        <div v-else class="flex flex-col gap-4">
          <!-- แถบสัดส่วนรวม — เห็นภาพรวมทั้งกองในบรรทัดเดียวก่อนอ่านรายตัว -->
          <div class="flex h-2.5 gap-0.5 rounded-full overflow-hidden bg-surface-3" aria-hidden="true">
            <div
              v-for="status in highlights.device_status"
              :key="status.status"
              class="h-full transition-[width] duration-500 ease-out-quart"
              :class="STATUS_META[status.status]?.bar ?? 'bg-ink-faint'"
              :style="{ width: `${percentOf(status.count, totalDeviceStatus)}%` }"
            ></div>
          </div>

          <ul class="flex flex-col gap-3 list-none">
            <li
              v-for="status in highlights.device_status"
              :key="status.status"
              class="flex items-center justify-between gap-3"
            >
              <span class="flex items-center gap-2 min-w-0">
                <span
                  class="w-2.5 h-2.5 rounded-full shrink-0"
                  :class="STATUS_META[status.status]?.bar ?? 'bg-ink-faint'"
                  aria-hidden="true"
                ></span>
                <span class="text-sm text-ink-soft truncate">
                  {{ STATUS_META[status.status]?.label ?? status.status }}
                </span>
              </span>

              <span class="flex items-baseline gap-1.5 shrink-0">
                <span class="text-md font-semibold text-ink numeral">
                  {{ formatCount(status.count) }}
                </span>
                <span class="text-2xs text-ink-mute numeral">
                  {{ percentOf(status.count, totalDeviceStatus).toFixed(0) }}%
                </span>
              </span>
            </li>
          </ul>

          <UiButton to="/assets" variant="secondary" size="sm" block> {{ t("เปิดทะเบียนทรัพย์สิน") }} <template #trailing><ArrowUpRight :size="14" /></template>
          </UiButton>
        </div>
      </UiCard>
      <UiCard
        :eyebrow="t(&quot;ค่าใช้จ่ายสุทธิ (หัก 20%)&quot;)"
        :title="departmentOrder === 'desc' ? t(&quot;แผนกที่ใช้งบสูงสุด&quot;) : t(&quot;แผนกที่ใช้งบน้อยสุด&quot;)"
      >
        <template #actions>
          <UiSegmented
            v-model="departmentOrder"
            :options="ORDER_OPTIONS"
            size="sm"
            :label="t(&quot;เรียงลำดับแผนก&quot;)"
            @update:model-value="loadHighlights"
          />
        </template>

        <div v-if="highlightsLoading" class="flex flex-col gap-4">
          <UiSkeleton v-for="n in 5" :key="n" height="2.25rem" />
        </div>

        <UiEmpty
          v-else-if="!highlights.top_departments.length"
          :title="t(&quot;ไม่มีข้อมูลในช่วงที่เลือก&quot;)"
          :description="t(&quot;ลองขยายช่วงเดือน หรือเลือกทุกอาคาร&quot;)"
          variant="search"
          compact
        />

        <ol v-else class="flex flex-col gap-3.5 list-none">
          <li
            v-for="(dept, index) in highlights.top_departments"
            :key="dept.department_id ?? dept.department_name"
            class="flex items-start gap-3"
          >
            <span class="w-5 shrink-0 pt-0.5 text-2xs font-semibold text-ink-mute numeral text-right">
              {{ index + 1 }}
            </span>

            <div class="min-w-0 flex-1">
              <div class="flex items-baseline justify-between gap-3">
                <p class="text-sm text-ink-soft truncate">
                  {{ dept.department_name || t("ไม่ระบุแผนก") }}
                  <span v-if="dept.division_name" class="text-ink-mute">· {{ dept.division_name }}</span>
                </p>
                <p class="text-sm font-semibold text-ink numeral shrink-0">
                  {{ formatBahtValue(dept.total_cost) }}
                </p>
              </div>

              <!-- แถบนี้เทียบสัดส่วนระหว่างแผนก ไม่ใช่การใช้งบเทียบเพดาน
                   จึงใช้สีเดียวตลอด — สีแดงตรงนี้จะสื่อผิดว่าแผนกอันดับหนึ่งใช้เกิน -->
              <UiMeter
                :value="Number(dept.total_cost || 0)"
                :max="topDepartmentMax"
                size="sm"
                tone="brand"
                hide-value
                class="mt-1.5"
                :label="t(&quot;สัดส่วนของ {0}&quot;, [dept.department_name || 'แผนก'])"
              />
            </div>
          </li>
        </ol>

        <template #footer>
          <UiButton :to="{ path: '/expense', query: { tab: 'department' } }" variant="ghost" size="sm"> {{ t("ดูรายละเอียดทุกแผนก") }} <template #trailing><ArrowUpRight :size="14" /></template>
          </UiButton>
        </template>
      </UiCard>
    </div>

    <UiAlert v-if="highlightsError" tone="danger" class="mb-4">
      {{ highlightsError }}
      <template #actions>
        <UiButton size="sm" variant="secondary" @click="loadHighlights"> {{ t("ลองใหม่") }} </UiButton>
      </template>
    </UiAlert>

    <!-- อันดับแผนก + รายอาคาร -->
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">



    </div>

    <!-- เครื่องที่ใช้งานหนัก + สัญญา -->
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <UiCard
        :eyebrow="t(&quot;รายเครื่อง&quot;)"
        :title="deviceOrder === 'desc' ? t(&quot;เครื่องที่พิมพ์มากที่สุด&quot;) : t(&quot;เครื่องที่พิมพ์น้อยที่สุด&quot;)"
      >
        <template #actions>
          <UiSegmented
            v-model="deviceOrder"
            :options="ORDER_OPTIONS"
            size="sm"
            :label="t(&quot;เรียงลำดับเครื่อง&quot;)"
            @update:model-value="loadHighlights"
          />
        </template>

        <div v-if="highlightsLoading" class="flex flex-col gap-2">
          <UiSkeleton v-for="n in 5" :key="n" height="2.5rem" />
        </div>

        <UiEmpty
          v-else-if="!highlights.top_devices.length"
          :title="t(&quot;ไม่มีข้อมูลการพิมพ์ในช่วงที่เลือก&quot;)"
          variant="search"
          compact
        />

        <ol v-else class="flex flex-col list-none divide-y divide-line-soft">
          <li
            v-for="(device, index) in highlights.top_devices"
            :key="device.device_id"
            class="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
          >
            <span
              class="grid place-items-center shrink-0 w-6 h-6 rounded-md bg-brand-soft text-brand-ink text-2xs font-semibold numeral"
            >
              {{ index + 1 }}
            </span>

            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-ink-soft font-mono truncate">
                <RouterLink :to="{ path: `/assets/${device.device_id}`, query: { fy: activeFiscalYear?.id } }" class="inline-flex items-center min-h-6 underline">{{ device.serial_number || device.asset_code || "—" }}</RouterLink>
              </p>
              <!-- ชื่อแผนกตรงนี้พอดีบรรทัดที่ระยะห่างปกติ แต่ล้นเมื่อผู้ใช้เพิ่ม
                   letter/word-spacing ตาม 1.4.12 จึงให้ขึ้นบรรทัดใหม่แทนการตัดทิ้ง -->
              <p class="text-2xs text-ink-mute break-words">
                {{ device.department_name || t("ไม่ระบุแผนก") }}
                <span class="block whitespace-normal">{{ deviceLocationLabel(device.locations) }}</span>
              </p>
            </div>

            <div class="shrink-0 text-right">
              <p class="text-sm font-semibold text-ink numeral">
                {{ formatCount(device.total_pages) }}
                <span class="text-2xs font-normal text-ink-mute"> {{ t("หน้า") }} </span>
              </p>
              <div class="w-16 h-1 mt-1 rounded-full bg-surface-3 overflow-hidden ml-auto">
                <div
                  class="h-full rounded-full bg-brand"
                  :style="{ width: `${percentOf(device.total_pages, topDeviceMax)}%` }"
                  aria-hidden="true"
                ></div>
              </div>
            </div>
          </li>
        </ol>
      </UiCard>

      <UiCard :eyebrow="t(&quot;สัญญาเช่า&quot;)" :title="t(&quot;ค่าใช้จ่ายแยกตามสัญญา&quot;)">
        <div v-if="highlightsLoading" class="flex flex-col gap-2">
          <UiSkeleton v-for="n in 3" :key="n" height="2.75rem" />
        </div>

        <UiEmpty
          v-else-if="!highlights.contracts.length"
          :title="t(&quot;ยังไม่มีสัญญาในระบบ&quot;)"
          :description="t(&quot;สร้างสัญญาก่อนเพื่อให้ระบบคิดค่าใช้จ่ายต่อแผ่นได้&quot;)"
          compact
        >
          <template #actions>
            <UiButton to="/admin/contracts" variant="primary" size="sm"> {{ t("ไปสร้างสัญญา") }} </UiButton>
          </template>
        </UiEmpty>

        <ul v-else class="flex flex-col list-none divide-y divide-line-soft">
          <li
            v-for="contract in highlights.contracts"
            :key="contract.id"
            class="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
          >
            <span
              class="grid place-items-center shrink-0 w-8 h-8 rounded-lg bg-surface-3 text-ink-mute"
              aria-hidden="true"
            >
              <ReceiptText :size="15" />
            </span>

            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-ink-soft truncate">{{ contract.contract_no }}</p>
              <p class="flex items-center gap-1.5 text-2xs text-ink-mute">
                <UiBadge v-if="contract.fiscal_year" size="sm" tone="neutral"> {{ t("ปีงบ") }} {{ yearLabel(contract.fiscal_year) }}
                </UiBadge>
                <span class="numeral">{{ formatCount(contract.device_count) }} {{ t("เครื่อง") }} </span>
              </p>
            </div>

            <p class="shrink-0 text-sm font-semibold text-ink numeral">
              {{ formatBahtValue(contract.total_cost) }}
              <span class="text-2xs font-normal text-ink-mute"> {{ t("บาท") }} </span>
            </p>
          </li>
        </ul>

        <template #footer>
          <UiButton to="/expense" variant="ghost" size="sm"> {{ t("ดูรายละเอียดค่าใช้จ่าย") }} <template #trailing><ArrowUpRight :size="14" /></template>
          </UiButton>
        </template>
      </UiCard>
    </div>
  </div>
</template>
