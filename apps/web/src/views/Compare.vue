<script setup>
import { formatMonth } from "../lib/locale-format";

import { t } from "../lib/locale";

/**
 * Compare — เปรียบเทียบตัวชี้วัดระหว่างเดือน
 *
 * ใช้ตอบคำถามเดียว: "เดือนนี้ต่างจากเดือนก่อนยังไง และเพราะอะไร"
 * เลือกได้หลายเดือน ไม่จำกัดแค่คู่เดียว เพราะการดูสามสี่เดือนติดกันบอกได้ว่า
 * ตัวเลขที่กระโดดเป็นแนวโน้มจริงหรือเป็นเดือนที่ผิดปกติเดือนเดียว
 *
 * เดือนที่เลือกถูก sync กับ ?months= ใน URL เพื่อให้ส่งลิงก์ให้คนอื่นเปิดดูชุด
 * เดียวกันได้ — เป็นหน้าที่ถูกแชร์ในไลน์กลุ่มบ่อยที่สุด
 *
 * ทิศทางของสีในหน้านี้กลับด้านกับกราฟการเงินทั่วไป: ตัวเลขที่ "เพิ่มขึ้น" ใช้โทน
 * เตือน เพราะทุกตัวชี้วัดในหน้านี้คือต้นทุน ไม่ใช่รายได้
 *
 * "จำนวนหน้าดิบ" เป็นยอดที่กรอก ส่วน "สุทธิ" คือหลังหัก 2% ตามกฎธุรกิจ
 * ทั้งสองแสดงคู่กันเสมอ เพราะเป็นตัวเลขที่คนมักเอาไปสับสนกัน
 */
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { CircleAlert, Info, Minus, TrendingDown, TrendingUp } from "lucide-vue-next";
import { fiscalYearMonths, fromSatang, sumCostSatang } from "@suth/domain";
import { activeFiscalYear, activeFiscalYearRange } from "../store/fiscalYear";
import api from "../services/api";
import { useMonthlyKpi } from "../api/queries";
import { formatBahtValue, formatCount } from "../lib/format";
import PeriodPicker from "../components/PeriodPicker.vue";
import ByDepartment from "./ByDepartment.vue";
import {
  UiAlert,
  UiButton,
  UiCard,
  UiFilterBar,
  UiChart,
  UiCombobox,
  UiEmpty,
  UiField,
  UiPageHeader,
  UiSegmented,
  UiSkeleton,
} from "../ui";

const route = useRoute();
const router = useRouter();

/**
 * รวมค่าใช้จ่ายของแถว v_monthly_kpi พร้อมจำนวนรายการที่ยังยืนยันราคาไม่ได้
 *
 * เดิมบรรทัดนี้เป็น `sumSatang(rows.map((r) => toSatang(r.total_cost)))` ซึ่งอ่าน
 * แล้วดูถูกต้องทุกอย่าง แต่ `toSatang(null)` เป็น 0 — รายการที่ยังไม่รู้ราคาจึง
 * ถูกบวกเข้าไปเป็นศูนย์บาท แล้วหน้านี้ประกาศยอดที่ไม่ครบเป็นข้อสรุป ผิด Q27
 */
function sumCost(rows) {
  const { satang, unpriced } = sumCostSatang(
    (rows ?? []).map((r) => (r.total_cost_satang != null ? fromSatang(r.total_cost_satang) : r.total_cost))
  );
  return { cost: fromSatang(satang), unpriced };
}

/* --------------------------------------------------------------------------
   ข้อมูลและตัวกรอง
   -------------------------------------------------------------------------- */
const selectedMonths = ref(monthsFromQuery());
const comparisonType = ref(["contract", "department", "building"].includes(route.query.type) ? route.query.type : "contract");
const COMPARISON_TYPES = [
  { value: "contract", label: t("ตามสัญญา") },
  { value: "department", label: t("ตามฝ่าย / แผนก") },
  { value: "building", label: t("ตามอาคาร") },
];

const filters = ref({
  building: "",
  floor: "",
  division: "",
  department: "",
  contract: "",
});

const buildings = ref([]);
const floors = ref([]);
const divisions = ref([]);
const departments = ref([]);
const contracts = ref([]);

const toOptions = (list) => list.map((item) => ({ value: item.name, label: item.name }));

const buildingOptions = computed(() => toOptions(buildings.value));
const divisionOptions = computed(() => toOptions(divisions.value));
const contractOptions = computed(() =>
  contracts.value.map((contract) => ({ value: String(contract.id), label: contract.contract_no }))
);

const floorOptions = computed(() => {
  const building = buildings.value.find((b) => b.name === filters.value.building);
  const source = building
    ? floors.value.filter((f) => Number(f.building_id) === Number(building.id))
    : floors.value;

  const seen = new Set();
  return source.filter((f) => !seen.has(f.name) && seen.add(f.name)).map((f) => ({ value: f.name, label: f.name }));
});

const departmentOptions = computed(() => {
  const division = divisions.value.find((d) => d.name === filters.value.division);
  const source = division
    ? departments.value.filter((d) => Number(d.division_id) === Number(division.id))
    : departments.value;
  return toOptions(source);
});

watch(() => filters.value.building, () => (filters.value.floor = ""));
watch(() => filters.value.division, () => (filters.value.department = ""));

const hasActiveFilter = computed(() => Object.values(filters.value).some(Boolean));

function resetFilters() {
  filters.value = { building: "", floor: "", division: "", department: "", contract: "" };
}

watch(comparisonType, (value) => {
  resetFilters();
  router.replace({ query: { ...route.query, type: value } });
});

/** มิติของแต่ละแถวมาจากประวัติที่มีผลในเดือนนั้นแล้ว */
function rowMatches(row) {
  const f = filters.value;
  return (
    (!f.building || row.building_name === f.building) &&
    (!f.floor || row.floor_name === f.floor) &&
    (!f.division || row.division_name === f.division) &&
    (!f.department || row.department_name === f.department) &&
    (!f.contract || String(row.contract_id) === f.contract)
  );
}

async function loadMasterData() {
  try {
    const [building, floor, division, department, contract] = await Promise.all([
      api.get("/buildings"),
      api.get("/floors"),
      api.get("/divisions"),
      api.get("/departments"),
      api.get("/contracts"),
    ]);

    buildings.value = building.data ?? [];
    floors.value = floor.data ?? [];
    divisions.value = division.data ?? [];
    departments.value = department.data ?? [];
    contracts.value = contract.data ?? [];
  } catch (err) {
    console.error("Load master data error:", err);
  }
}

/* --------------------------------------------------------------------------
   sync เดือนที่เลือกกับ ?months= ใน URL
   -------------------------------------------------------------------------- */
let syncingFromRoute = false;
watch(selectedMonths, (value) => {
  if (syncingFromRoute) return;
  router.replace({
    query: { ...route.query, months: value.length ? value.join(",") : undefined },
  });
}, { flush: "sync" });

function monthsFromQuery() {
  const raw = route.query.months;
  if (!raw) return [];
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter((m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m))
    .sort();
}

watch(activeFiscalYear, (year, previous) => {
  if (previous && year?.id !== previous.id) selectedMonths.value = [];
});
watch(() => route.query.months, () => {
  syncingFromRoute = true;
  selectedMonths.value = monthsFromQuery();
  syncingFromRoute = false;
});

const monthlyParams = computed(() => ({
  building_name: filters.value.building || undefined,
  month: activeFiscalYearRange.value ? fiscalYearMonths(activeFiscalYearRange.value).join(",") : undefined,
}));
const monthlyQuery = useMonthlyKpi(monthlyParams);
const rawRows = computed(() => (monthlyQuery.data.value ?? []).filter((row) =>
  !activeFiscalYearRange.value
  || (row.month >= activeFiscalYearRange.value.startMonth && row.month <= activeFiscalYearRange.value.endMonth)
));
const loading = computed(() => monthlyQuery.isPending.value);
const loadError = computed(() => monthlyQuery.isError.value ? t("โหลดข้อมูลเปรียบเทียบไม่สำเร็จ") : "");
const monthsWithData = computed(() => [...new Set(rawRows.value.filter(rowMatches).map((row) => row.month))].sort());

/* --------------------------------------------------------------------------
   ตัวชี้วัดและการคำนวณ
   -------------------------------------------------------------------------- */
function aggregate(month) {
  const rows = rawRows.value.filter((row) => row.month === month && rowMatches(row));
  if (!rows.length) return null;

  const totalPages = rows.reduce((s, r) => s + Number(r.pages_printed || 0), 0);
  const netPages = rows.reduce((s, r) => s + Number(r.net_pages || 0), 0);
  const { cost: totalCost, unpriced } = sumCost(rows);

  return {
    totalPages,
    netPages,
    totalCost,
    unpriced,
    activeDevices: new Set(rows.map((r) => r.device_id)).size,

    // ค่าเฉลี่ยต่อหน้าคำนวณไม่ได้เมื่อตัวเศษยังไม่ครบ — ยอดเงินบางส่วนหารด้วย
    // จำนวนหน้าทั้งหมด ให้ตัวเลขที่ต่ำกว่าความจริงโดยไม่มีอะไรบอก (Q29)
    costPerPage: unpriced > 0 ? null : totalPages > 0 ? totalCost / totalPages : 0,
  };
}

const monthStats = computed(() =>
  (selectedMonths.value.length ? selectedMonths.value : monthsWithData.value).map((m) => ({
    month: m,
    label: formatMonth(m, { long: true }),
    stats: aggregate(m),
  }))
);

/**
 * ตัวชี้วัดทั้งห้าของหน้านี้
 *
 * "รวม" คือยอดที่กรอก ส่วน "สุทธิ" คือหลังหัก 2% ตามกฎธุรกิจ —
 * แสดงคู่กันเสมอเพราะเป็นสองตัวเลขที่คนเอาไปสับสนกันบ่อยที่สุด
 */
const METRICS = [
  {
    key: "totalPages",
    label: t("จำนวนหน้าดิบ"),
    unit: t("หน้า"),
    hint: t("ยอดตามที่กรอก ยังไม่หัก 2%"),
    format: formatCount,
  },
  {
    key: "netPages",
    label: t("จำนวนหน้าสุทธิ"),
    unit: t("หน้า"),
    hint: t("หลังหัก 2% แล้ว"),
    format: formatCount,
  },
  {
    key: "totalCost",
    label: t("ค่าใช้จ่ายสุทธิ"),
    unit: t("บาท"),
    hint: t("หลังหัก 2% แล้ว"),
    format: formatBahtValue,
    // ตัวชี้วัดที่ค่าขึ้นกับราคา — เทียบข้ามเดือนไม่ได้จนกว่าราคาจะครบทั้งสองเดือน
    needsPrice: true,
  },
  {
    key: "activeDevices",
    label: t("เครื่องที่มีการใช้งาน"),
    unit: t("เครื่อง"),
    hint: t("นับเฉพาะเครื่องที่มียอดในเดือนนั้น"),
    format: formatCount,
  },
  {
    key: "costPerPage",
    // ไม่ใช้คำว่า "ต้นทุนเฉลี่ย" เดี่ยวๆ เพราะ CONTEXT.md สงวนคำนั้นไว้ให้
    // "ต้นทุนเฉลี่ยต่อเครื่องที่บันทึกยอด" และระบุ "ต้นทุนเฉลี่ยต่อหน้า" ไว้ในช่อง
    // Avoid ตรงๆ — สองอย่างนี้เป็นคนละตัวเลขและเคยถูกอ่านสลับกันมาแล้ว
    label: t("ค่าใช้จ่ายต่อหน้าที่พิมพ์จริง"),
    unit: t("บาท/หน้า"),
    hint: t("ค่าใช้จ่ายสุทธิ หารด้วยจำนวนหน้าดิบ"),
    format: (v) => (v === null ? t("ยังคำนวณค่าเฉลี่ยครบไม่ได้") : Number(v).toFixed(3)),
    needsPrice: true,
  },
];

const METRIC_BY_KEY = Object.fromEntries(METRICS.map((metric) => [metric.key, metric]));

function diffPercent(before, after) {
  if (!before) return after > 0 ? 100 : 0;
  return ((after - before) / before) * 100;
}

/**
 * เทียบสองเดือนนี้ได้จริงหรือยัง สำหรับตัวชี้วัดตัวนี้
 *
 * ตัวชี้วัดที่ขึ้นกับราคา เทียบกันไม่ได้เมื่อเดือนใดเดือนหนึ่งยังมีรายการที่ยืนยัน
 * ราคาไม่ได้ — ยอดที่เอามาเทียบเป็นยอด "เท่าที่รู้" ของคนละสัดส่วนกัน เปอร์เซ็นต์
 * ที่ได้จึงไม่ได้วัดการเปลี่ยนแปลงของค่าใช้จ่าย แต่วัดว่าเดือนไหนยืนยันราคาไปได้
 * มากกว่ากัน ซึ่งเป็นคนละคำถามโดยสิ้นเชิง (Q30)
 */
function comparable(metric, before, after) {
  if (!before || !after) return false;
  if (before[metric.key] === null || after[metric.key] === null) return false;
  if (metric.needsPrice && (before.unpriced > 0 || after.unpriced > 0)) return false;
  return true;
}

/** ผลต่างเทียบกับเดือนก่อนหน้า "ในรายการที่เลือก" ไม่ใช่เดือนก่อนหน้าตามปฏิทิน */
function deltaVsPrevious(metricKey, index) {
  if (index === 0) return null;
  const previous = monthStats.value[index - 1].stats;
  const current = monthStats.value[index].stats;
  if (!comparable(METRIC_BY_KEY[metricKey], previous, current)) return null;
  return diffPercent(previous[metricKey], current[metricKey]);
}

/** รายการที่ยืนยันราคาไม่ได้ในทุกเดือนที่กำลังดูอยู่ ไม่ใช่แค่สองเดือนที่เอามาเทียบ */
const unpricedInSelection = computed(() =>
  monthStats.value.reduce((sum, entry) => sum + (entry.stats?.unpriced || 0), 0)
);

const summaryFirst = computed(() => monthStats.value[0] ?? null);
const summaryLast = computed(() =>
  monthStats.value.length > 1 ? monthStats.value[monthStats.value.length - 1] : null
);

const summaryLines = computed(() => {
  if (!summaryFirst.value?.stats || !summaryLast.value?.stats) return [];

  const first = summaryFirst.value.stats;
  const last = summaryLast.value.stats;

  return METRICS.map((metric) => {
    const before = first[metric.key];
    const after = last[metric.key];

    // เทียบไม่ได้ = บอกยอดของแต่ละเดือนไปตามตรงพร้อมเหตุผล ไม่ใช่เงียบหายไปทั้ง
    // บรรทัด (ซึ่งทำให้ดูเหมือนตัวชี้วัดนี้ไม่มีอยู่) และไม่ใช่สรุปเปอร์เซ็นต์จาก
    // ยอดที่ยังไม่ครบ (ซึ่งเป็นการสรุปที่ข้อมูลยังไม่พอจะพูด — Q30)
    if (!comparable(metric, first, last)) {
      return {
        trend: null,
        incomplete: true,
        text: t("{0}: {1} → {2} — ยังสรุปไม่ได้เพราะมีรายการที่ยืนยันราคาไม่ได้อยู่", [
          metric.label,
          metric.format(before),
          metric.format(after),
        ]),
      };
    }

    const percent = diffPercent(before, after);

    if (Math.abs(percent) < 0.05) {
      return {
        trend: null,
        text: t("{0}แทบไม่เปลี่ยน ({1} → {2} {3})", [metric.label, metric.format(before), metric.format(after), metric.unit]),
      };
    }

    return {
      trend: percent > 0 ? "up" : "down",
      text:
        `${metric.label}${percent > 0 ? t("เพิ่มขึ้น") : t("ลดลง")} ${Math.abs(percent).toFixed(1)}% ` +
        t("(จาก {0} เป็น {1} {2})", [metric.format(before), metric.format(after), metric.unit]),
    };
  });
});

/**
 * ข้อเท็จจริงที่ต้องอ่านคู่กับบทสรุปเสมอ ไม่ใช่เชิงอรรถที่จะละไว้ก็ได้
 *
 * ## ทำไมจำนวนเครื่องที่ต่างกันถึงสำคัญกว่าที่เห็น
 *
 * บทสรุปของหน้านี้เทียบ "เดือนแรกกับเดือนสุดท้าย" ของยอดรวม โดยไม่เคยบอกว่าสอง
 * เดือนนั้นมาจากเครื่องคนละจำนวนกัน เดือนที่บันทึกยอดไป 12 เครื่องกับเดือนที่
 * บันทึกไป 20 เครื่อง ย่อมมียอดรวมต่างกันแน่นอนแม้ทุกเครื่องพิมพ์เท่าเดิมทุกแผ่น
 * — "ค่าใช้จ่ายเพิ่มขึ้น 67%" ในกรณีนั้นวัดความคืบหน้าของการกรอกข้อมูล ไม่ได้วัด
 * ค่าใช้จ่าย แต่คนอ่านไม่มีทางรู้ (Q30)
 */
const summaryCaveats = computed(() => {
  const first = summaryFirst.value?.stats;
  const last = summaryLast.value?.stats;
  if (!first || !last) return [];

  const notes = [];

  if (first.activeDevices !== last.activeDevices) {
    notes.push(
      t("สองเดือนนี้มีเครื่องที่บันทึกยอดไม่เท่ากัน ({0} เทียบกับ {1} เครื่อง) ยอดรวมจึงต่างกันได้เองโดยที่การใช้งานไม่เปลี่ยน", [
        formatCount(first.activeDevices),
        formatCount(last.activeDevices),
      ])
    );
  }

  const unpriced = (first.unpriced || 0) + (last.unpriced || 0);
  if (unpriced > 0) {
    notes.push(
      t("ยังยืนยันราคาไม่ได้ {0} รายการในสองเดือนนี้ — ตัวเลขค่าใช้จ่ายเป็นยอดเฉพาะส่วนที่ยืนยันแล้ว", [formatCount(unpriced)])
    );
  }

  return notes;
});

onMounted(async () => {
  await loadMasterData();
});
</script>

<template>
  <div>
    <UiPageHeader
      :title="t(&quot;เปรียบเทียบ&quot;)"
      :description="t(&quot;ยอดรวมของสองเดือนต่างกันได้เองเมื่อจำนวนเครื่องที่บันทึกยอดไม่เท่ากัน หรือเมื่อยังยืนยันราคาไม่ครบ&quot;)"
    />

    <!--
      ตัวกรองเป็นแถวเดียว ไม่ใช่การ์ด (#90)

      เดิมหน้านี้ใช้การ์ด "เลือกช่วงที่จะเปรียบเทียบ" สูงราว 290px ใส่ตัวกรองแค่
      สองตัว โดยมีที่ว่างเปล่าเกินครึ่งการ์ด ผลคือสรุปและตารางเปรียบเทียบซึ่งเป็น
      เนื้อหาจริงของหน้า ตกไปอยู่ใต้เส้นพับทั้งหมด

      ใช้ UiFilterBar ตัวเดียวกับหน้าอื่น แต่ปิด collapsible เพราะตัวกรองของหน้านี้
      มีน้อยและขึ้นกับรูปแบบที่เลือก ไม่มีอะไรเหลือให้ซ่อนในแผงพับ
    -->
    <UiFilterBar :collapsible="false" class="mb-4">
      <template #primary>
        <UiSegmented v-model="comparisonType" :options="COMPARISON_TYPES" size="sm" :label="t(&quot;รูปแบบการเปรียบเทียบ&quot;)" />

        <div v-if="comparisonType !== 'department'" class="w-full sm:w-72">
          <PeriodPicker
            v-model="selectedMonths"
            :options="monthsWithData"
            mode="multi"
            :all-label="t(&quot;ทุกเดือนที่มีข้อมูล&quot;)"
            :all-emits-empty="false"
            :aria-label="t('เดือนที่จะเปรียบเทียบ')"
          />
        </div>

        <UiCombobox
          v-if="comparisonType === 'building'"
          v-model="filters.building"
          class="w-full sm:w-52"
          :options="buildingOptions"
          :placeholder="t(&quot;ทุกอาคาร&quot;)"
          :any-label="t(&quot;ทุกอาคาร&quot;)"
          :aria-label="t(&quot;กรองตามอาคาร&quot;)"
        />

        <UiCombobox
          v-if="comparisonType === 'building'"
          v-model="filters.floor"
          class="w-full sm:w-44"
          :options="floorOptions"
          :placeholder="t(&quot;ทุกชั้น&quot;)"
          :any-label="t(&quot;ทุกชั้น&quot;)"
          :aria-label="t(&quot;กรองตามชั้น&quot;)"
        />

        <UiCombobox
          v-if="comparisonType === 'contract'"
          v-model="filters.contract"
          class="w-full sm:w-56"
          :options="contractOptions"
          :placeholder="t(&quot;ทุกสัญญา&quot;)"
          :any-label="t(&quot;ทุกสัญญา&quot;)"
          :aria-label="t(&quot;กรองตามสัญญา&quot;)"
        />

        <UiButton v-if="hasActiveFilter" size="sm" variant="danger-ghost" class="ml-auto" @click="resetFilters">
          {{ t("ล้างตัวกรอง") }}
        </UiButton>
      </template>
    </UiFilterBar>

    <!-- มุมมองฝ่าย/แผนกมีหน้าของตัวเอง ใช้ตัวกรองและกราฟชุดของ ByDepartment -->
    <ByDepartment v-if="comparisonType === 'department'" comparison-only />

    <template v-else>
    <UiAlert v-if="loadError" tone="danger" class="mb-4">
      {{ loadError }}
      <template #actions>
        <UiButton size="sm" variant="secondary" @click="monthlyQuery.refetch()"> {{ t("ลองใหม่") }} </UiButton>
      </template>
    </UiAlert>

    <div v-if="loading" class="flex flex-col gap-3">
      <UiSkeleton height="8rem" />
      <UiSkeleton height="14rem" />
    </div>

    <UiCard v-else-if="!monthStats.some((month) => month.stats)">
      <UiEmpty
        :title="t(&quot;ยังไม่มีข้อมูลในช่วงที่เลือก&quot;)"
        :description="t(&quot;ยังไม่มียอดพิมพ์สำหรับปีงบและตัวกรองนี้&quot;)"
      />
    </UiCard>

    <template v-else>
      <!-- บทสรุปอัตโนมัติ -->
      <UiCard
        v-if="summaryFirst && summaryLast"
        class="mb-4"
        :eyebrow="t(&quot;สรุปอัตโนมัติ&quot;)"
        :title="t(&quot;{0} เทียบกับ {1}&quot;, [summaryFirst.label, summaryLast.label])"
        :description="monthStats.length > 2 ? t(&quot;จากทั้งหมด {0} เดือนที่เลือก&quot;, [monthStats.length]) : ''"
      >
        <ul class="flex flex-col gap-2 list-none">
          <li v-for="(line, index) in summaryLines" :key="index" class="flex items-start gap-2 text-sm">
            <component
              :is="line.incomplete ? CircleAlert : line.trend === 'up' ? TrendingUp : line.trend === 'down' ? TrendingDown : Minus"
              :size="15"
              class="shrink-0 mt-0.5"
              :class="
                line.incomplete ? 'text-warn-ink'
                : line.trend === 'up' ? 'text-danger-ink'
                : line.trend === 'down' ? 'text-ok-ink' : 'text-ink-mute'
              "
              aria-hidden="true"
            />
            <span class="text-ink-soft">{{ line.text }}</span>
          </li>
        </ul>

        <!--
          ข้อจำกัดของการเทียบครั้งนี้ อยู่ในการ์ดเดียวกับบทสรุปโดยตั้งใจ — เป็น
          เงื่อนไขของตัวเลขข้างบน ไม่ใช่ข้อมูลเสริมที่จะย้ายไปไว้ที่อื่นก็ได้
        -->
        <ul v-if="summaryCaveats.length" class="mt-3 pt-3 border-t border-line-soft flex flex-col gap-1.5 list-none">
          <li v-for="(note, index) in summaryCaveats" :key="`caveat-${index}`" class="flex items-start gap-2 text-sm text-ink-mute">
            <Info :size="15" class="shrink-0 mt-0.5" aria-hidden="true" />
            <span>{{ note }}</span>
          </li>
        </ul>
      </UiCard>

      <UiAlert v-else tone="warn" class="mb-4"> {{ t("ตอนนี้เลือกไว้เดือนเดียว (") }} {{ summaryFirst?.label }} {{ t(") — เลือกอีกเดือนเพื่อให้ระบบเทียบให้") }} </UiAlert>

      <!-- ตารางเปรียบเทียบ -->
      <UiCard flush class="mb-4" :title="t(&quot;ตารางเปรียบเทียบ&quot;)">
        <div class="overflow-x-auto scroll-hint-x">
          <table class="w-full text-sm min-w-max">
            <thead>
              <tr class="bg-surface-2">
                <th
                  scope="col"
                  class="sticky left-0 z-[1] bg-surface-2 text-left text-xs font-semibold text-ink-mute px-4 py-2.5 border-b border-line-soft shadow-[1px_0_0_var(--line-soft)]"
                > {{ t("ตัวชี้วัด") }} </th>
                <th
                  v-for="stat in monthStats"
                  :key="stat.month"
                  scope="col"
                  class="text-right text-xs font-semibold text-ink-mute px-4 py-2.5 whitespace-nowrap border-b border-line-soft"
                >
                  {{ stat.label }}
                </th>
              </tr>
            </thead>

            <tbody>
              <tr v-for="metric in METRICS" :key="metric.key" class="border-b border-line-soft last:border-0">
                <th
                  scope="row"
                  class="sticky left-0 z-[1] bg-surface text-left font-normal px-4 py-2.5 shadow-[1px_0_0_var(--line-soft)]"
                >
                  <span class="block text-ink-soft">{{ metric.label }}</span>
                  <span class="block text-2xs text-ink-mute">{{ metric.hint }}</span>
                </th>

                <td v-for="(stat, index) in monthStats" :key="stat.month" class="px-4 py-2.5 text-right">
                  <span class="block font-semibold text-ink numeral">
                    {{ stat.stats ? metric.format(stat.stats[metric.key]) : "—" }}
                  </span>

                  <span
                    v-if="deltaVsPrevious(metric.key, index) !== null"
                    class="inline-flex items-center gap-0.5 text-2xs font-medium numeral"
                    :class="deltaVsPrevious(metric.key, index) >= 0 ? 'text-danger-ink' : 'text-ok-ink'"
                  >
                    <component
                      :is="deltaVsPrevious(metric.key, index) >= 0 ? TrendingUp : TrendingDown"
                      :size="11"
                      aria-hidden="true"
                    />
                    {{ Math.abs(deltaVsPrevious(metric.key, index)).toFixed(1) }}%
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </UiCard>
      <!--
        กราฟของตัวชี้วัดที่ขึ้นกับราคา วาดจากยอดเฉพาะส่วนที่ยืนยันราคาแล้ว —
        รูปทรงของเส้นจึงสะท้อนความคืบหน้าของการยืนยันราคาปนอยู่ด้วย ไม่ใช่การใช้งาน
        อย่างเดียว บอกไว้ครั้งเดียวเหนือกราฟทั้งชุด ดีกว่าเขียนซ้ำบนทุกใบ
      -->
      <UiAlert v-if="unpricedInSelection > 0" tone="warn" class="mb-4">
        {{ t("ยังยืนยันราคาไม่ได้ {0} รายการในช่วงที่เลือก เส้นค่าใช้จ่ายด้านล่างจึงเป็นยอดเฉพาะส่วนที่ยืนยันแล้ว", [formatCount(unpricedInSelection)]) }}
      </UiAlert>

      <!-- กราฟรายตัวชี้วัด -->
      <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <!-- กราฟย่อยชุดเดียวกันหลายใบ (small multiples) — ทุกใบมีชุดข้อมูลเดียว
             จึงใช้สีเดียวกันทั้งหมด หัวการ์ดเป็นตัวบอกว่าใบไหนคือตัวชี้วัดอะไร
             การให้สีต่างกันทั้งที่ไม่ได้ใช้สีสื่อความหมายคือการเปลืองช่องทางสีไปเปล่าๆ -->
        <UiCard v-for="metric in METRICS" :key="`chart-${metric.key}`" :title="metric.label" :eyebrow="metric.unit">
          <UiChart
            kind="line"
            :labels="monthStats.map((s) => s.label)"
            :series="[
              {
                key: metric.key,
                label: metric.label,
                slot: 1,
                data: monthStats.map((s) => s.stats?.[metric.key] ?? null),
              },
            ]"
            height="13rem"
            :loading="loading"
            :unit="metric.unit"
            :format-value="metric.format"
            :category-label="t(&quot;เดือน&quot;)"
          />
        </UiCard>
      </div>
    </template>
    </template>
  </div>
</template>
