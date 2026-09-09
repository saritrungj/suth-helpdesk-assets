<script setup>
import { formatFiscalYearRange } from "../lib/locale-format";

import { t } from "../lib/locale";

/**
 * DashboardFilter — แถบตัวกรองของหน้าแรก
 *
 * ตั้งใจให้เป็นแถบเดียวที่กระชับ ไม่ใช่การ์ดตัวกรองแบบเดิมที่กางไว้ตลอดเวลา
 * เพราะหน้านี้มีแค่สองตัวกรองจริง (อาคาร, เดือน) บวกตัวสลับหน่วยของกราฟ — ไม่ถึงจุด
 * ที่ต้องซ่อนตัวกรองส่วนเกินไว้หลังปุ่มแบบ UiFilterBar
 *
 * ตัวสลับหน่วย (จำนวนหน้า/ค่าใช้จ่าย) อยู่ในแถบนี้ ไม่ใช่ในการ์ดกราฟแต่ละใบ เพราะ
 * ทั้งกราฟแนวโน้มและกราฟรายอาคารต้องพูดถึงหน่วยเดียวกันเสมอ ให้สลับที่เดียวคุมทั้งคู่
 *
 * เดือนที่เลือกได้จำกัดเฉพาะเดือนที่ "มีข้อมูลจริง" ของปีงบที่ active อยู่ (จาก
 * useMonthlyKpi แบบไม่กรอง) ไม่ใช่เปิดให้เลือกทั้ง 12 เดือนเสมอไป — ป้องกันคนเลือก
 * เดือนที่ยังไม่มีใครกรอกยอดแล้วเห็นกราฟว่างโดยไม่รู้สาเหตุ
 */
import { useRoute, useRouter } from "vue-router";
import { computed, ref, watch } from "vue";
import { Printer, Wallet } from "lucide-vue-next";

import { useBuildings, useMonthlyKpi } from "../api/queries";
import { activeFiscalYearRange, fiscalYearMonths } from "../store/fiscalYear";
import PeriodPicker from "./PeriodPicker.vue";
import { UiCombobox, UiField, UiSegmented } from "../ui";

defineProps({
  /** "pages" = จำนวนหน้า | "cost" = ค่าใช้จ่าย — คุมทั้งกราฟแนวโน้มและกราฟรายอาคาร */
  metric: { type: String, default: "pages" },
});

const emit = defineEmits(["update:metric", "filter"]);

const METRIC_OPTIONS = [
  { value: "pages", label: t("จำนวนหน้า"), icon: Printer },
  { value: "cost", label: t("ค่าใช้จ่าย"), icon: Wallet },
];

const route = useRoute();
const router = useRouter();
const buildingName = ref(typeof route.query.building === "string" ? route.query.building : "");
const monthSelection = ref(String(route.query.months || "").split(",").filter((m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m)));
watch([buildingName, monthSelection], () => {
  router.replace({ query: { ...route.query, building: buildingName.value || undefined, months: monthSelection.value.length ? monthSelection.value.join(",") : undefined } });
});
defineExpose({ selectMonth: (month) => { monthSelection.value = [month]; } });

// ช่วงเดือนตามปีงบที่ active อยู่ตอนนี้เสมอ (global, เลือกที่ Navbar)
const range = computed(() => activeFiscalYearRange.value);

const { data: buildings } = useBuildings();
const buildingOptions = computed(() =>
  (buildings.value ?? []).map((b) => ({ value: b.name, label: b.name }))
);

// เดือนทั้งหมดที่เคยมีข้อมูลจริง (ทุกอาคาร ทุกปี) — ยิงแบบไม่กรอง ใช้จำกัดตัวเลือกใน
// PeriodPicker เท่านั้น ไม่ใช่ตัวกรองของกราฟ (นั่นมาจาก sendFilter ด้านล่าง)
const { data: allRows } = useMonthlyKpi();
const monthsWithData = computed(() => [...new Set((allRows.value ?? []).map((r) => r.month))].sort());

// จำกัดตัวเลือกเดือนเหลือเฉพาะปีงบปัจจุบัน — เทียบเป็นช่วง (BETWEEN) ไม่ใช่ prefix ปีเดียว
// เพราะปีงบราชการไทยคร่อม 2 ปีปฏิทิน (ต.ค.-ก.ย.)
const monthOptions = computed(() => {
  if (!range.value) return [];
  return monthsWithData.value.filter((m) => m >= range.value.startMonth && m <= range.value.endMonth);
});

// ไม่ได้เจาะจงเดือน = ทั้งปีงบที่ active อยู่ (เรียงตามปีงบจริง ต.ค.-ก.ย.) แทนการส่ง ""
// ว่างๆ ซึ่งเดิมแปลว่า "ไม่กรองเดือนเลย" ทำให้กราฟไปดึงข้อมูลทุกเดือนย้อนหลังข้ามปีงบมาปน
const month = computed(() => {
  if (monthSelection.value.length) return monthSelection.value.join(",");
  if (!range.value) return "";
  return fiscalYearMonths(range.value).join(",");
});

function sendFilter() {
  emit("filter", { building_name: buildingName.value, month: month.value });
}

// immediate:true เพราะค่าเริ่มต้นของ month คือทั้งปีงบ (ไม่ใช่ "" ว่างๆ) ต้อง emit ให้
// Dashboard ตั้งแต่โหลดหน้าครั้งแรกเลย ไม่ใช่รอผู้ใช้แตะตัวกรองก่อน
watch([buildingName, month], sendFilter, { immediate: true });

// ปีงบเปลี่ยน (จาก Navbar) → เดือนที่เคยเลือกไว้อาจเป็นของปีงบเก่า ใช้ต่อไม่ได้แล้ว
// ล้างทิ้งให้เริ่มเลือกใหม่ (PeriodPicker เองก็ watch ปีงบแล้วเคลียร์ตัวเองอยู่แล้ว
// แต่กันไว้เผื่อ options ยังไม่ทันอัปเดต)
watch(range, (value, previous) => {
  if (previous && monthSelection.value.length) monthSelection.value = [];
});
</script>

<template>
  <div class="card p-3 flex flex-wrap items-end gap-3" data-print="hide">
    <UiField :label="t(&quot;อาคาร&quot;)" class="w-48">
      <UiCombobox
        v-model="buildingName"
        :options="buildingOptions"
        :placeholder="t(&quot;ทุกอาคาร&quot;)"
        :any-label="t(&quot;ทุกอาคาร&quot;)"
      />
    </UiField>

    <UiField :label="t(&quot;เดือน (ปีงบ {0})&quot;, [formatFiscalYearRange(range)])" class="w-56">
      <PeriodPicker v-model="monthSelection" :options="monthOptions" />
    </UiField>

    <UiSegmented
      :model-value="metric"
      :options="METRIC_OPTIONS"
      :label="t(&quot;หน่วยของกราฟ&quot;)"
      class="ml-auto"
      @update:model-value="emit('update:metric', $event)"
    />
  </div>
</template>
