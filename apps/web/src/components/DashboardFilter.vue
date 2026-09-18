<script setup>
import { formatFiscalYearRange } from "../lib/locale-format";

import { t } from "../lib/locale";

/**
 * DashboardFilter — แถบตัวกรองของหน้าแรก
 *
 * ตั้งใจให้เป็นแถบเดียวที่กระชับ ไม่ใช่การ์ดตัวกรองแบบเดิมที่กางไว้ตลอดเวลา
 * เพราะหน้านี้มีตัวกรองจริงตัวเดียวคือช่วงเวลา — ไม่ถึงจุดที่ต้องซ่อนตัวกรอง
 * ส่วนเกินไว้หลังปุ่มแบบ UiFilterBar
 *
 * เดิมมีตัวกรอง "สัญญา" ด้วย แต่มันซ้ำกับ "เปรียบเทียบตาม: สัญญา" ในพื้นที่เปรียบเทียบ
 * และกรองด้วยสัญญาปัจจุบันของเครื่อง ไม่ใช่สัญญาที่คิดเงินของเดือนนั้น (ADR-0019)
 * จึงเหลือตัวเลือกชุดเดียว: ช่วงเวลา → เปรียบเทียบตาม → รายการ → ตัวชี้วัด (#103)
 *
 * เดือนที่เลือกได้จำกัดเฉพาะเดือนที่ "มีข้อมูลจริง" ของปีงบที่ active อยู่ (จาก
 * useMonthlyKpi แบบไม่กรอง) ไม่ใช่เปิดให้เลือกทั้ง 12 เดือนเสมอไป — ป้องกันคนเลือก
 * เดือนที่ยังไม่มีใครกรอกยอดแล้วเห็นกราฟว่างโดยไม่รู้สาเหตุ
 */
import { useRoute, useRouter } from "vue-router";
import { computed, ref, watch } from "vue";
import { useMonthlyKpi } from "../api/queries";
import { activeFiscalYearRange, fiscalYearMonths } from "../store/fiscalYear";
import PeriodPicker from "./PeriodPicker.vue";
import { UiField } from "../ui";

const emit = defineEmits(["filter"]);

/**
 * `bare` = ไม่มีกล่องของตัวเอง
 *
 * บนแดชบอร์ดแถบนี้อยู่บรรทัดเดียวกับหัวหน้า เพราะตัวกรองคือ "ขอบเขตของตัวเลข
 * ทั้งหน้า" ไม่ใช่เครื่องมือแยกที่ต้องมีกล่องมาคั่น — กล่องของมันเคยกินความสูง
 * 98px ก่อนจะถึงตัวเลขตัวแรก หน้าอื่นที่ยังวางมันเป็นก้อนแยกใช้ค่าเริ่มต้นเดิม
 */
defineProps({
  bare: { type: Boolean, default: false },
});

const route = useRoute();
const router = useRouter();
// ช่วงเดือนตามปีงบที่ active อยู่ตอนนี้เสมอ (global, เลือกที่ Navbar)
const range = computed(() => activeFiscalYearRange.value);
const normalizeMonths = (value) => {
  const valid = [...new Set(String(value || "").split(",").map((m) => m.trim())
    .filter((m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m)))].sort();
  if (!range.value) return valid;
  return valid.filter((m) => m >= range.value.startMonth && m <= range.value.endMonth);
};
const monthsFromQuery = () => normalizeMonths(route.query.months);
const monthSelection = ref(monthsFromQuery());
watch(monthSelection, () => {
  const { building: _removedBuilding, ...query } = route.query;
  router.replace({ query: { ...query, months: monthSelection.value.length ? monthSelection.value.join(",") : undefined } });
});
// ย้อนกลับ/เดินหน้าในเบราว์เซอร์เปลี่ยน ?months= โดยไม่ผ่านตัวเลือก — ให้ตัวเลือกตามลิงก์
watch(() => route.query.months, () => {
  const next = monthsFromQuery();
  if (next.join(",") !== monthSelection.value.join(",")) monthSelection.value = next;
});

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
  if (!range.value) return "";
  if (monthSelection.value.length) return monthSelection.value.join(",");
  return fiscalYearMonths(range.value).join(",");
});

function sendFilter() {
  emit("filter", { month: month.value, selected: [...monthSelection.value] });
}

// immediate:true เพราะค่าเริ่มต้นของ month คือทั้งปีงบ (ไม่ใช่ "" ว่างๆ) ต้อง emit ให้
// Dashboard ตั้งแต่โหลดหน้าครั้งแรกเลย ไม่ใช่รอผู้ใช้แตะตัวกรองก่อน
watch(month, sendFilter, { immediate: true });

// ปีงบเปลี่ยน (จาก Navbar) → เดือนที่เคยเลือกไว้อาจเป็นของปีงบเก่า ใช้ต่อไม่ได้แล้ว
// ล้างทิ้งให้เริ่มเลือกใหม่ (PeriodPicker เองก็ watch ปีงบแล้วเคลียร์ตัวเองอยู่แล้ว
// แต่กันไว้เผื่อ options ยังไม่ทันอัปเดต)
watch(range, (value, previous) => {
  if (previous && monthSelection.value.length) {
    monthSelection.value = [];
    return;
  }
  const next = normalizeMonths(monthSelection.value.join(","));
  if (next.join(",") !== monthSelection.value.join(",")) monthSelection.value = next;
}, { immediate: true });

// โหลดจากลิงก์ตรงอาจมีเดือนซ้ำ ผิดรูปแบบ หรือนอกปีงบ — URL ต้องตรงกับขอบเขตที่ใช้จริง
const canonicalMonths = monthSelection.value.join(",");
if (String(route.query.months || "") !== canonicalMonths) {
  router.replace({ query: { ...route.query, months: canonicalMonths || undefined } });
}
</script>

<template>
  <div
    class="flex flex-wrap items-end gap-3 min-w-0 max-w-full"
    :class="!bare && 'card p-3'"
    data-print="hide"
  >
    <UiField :label="t(&quot;ช่วงเวลา (ปีงบ {0})&quot;, [formatFiscalYearRange(range)])" class="w-80 max-w-full">
      <PeriodPicker
        v-model="monthSelection"
        :options="monthOptions"
        mode="multi"
        :all-label="t(&quot;ดูทั้งปีงบ&quot;)"
      />
    </UiField>
  </div>
</template>
