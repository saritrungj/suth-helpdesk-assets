<script setup>
import { formatFiscalYearRange } from "../lib/locale-format";

import { t } from "../lib/locale";

/**
 * DashboardFilter — แถบตัวกรองของหน้าแรก
 *
 * ตั้งใจให้เป็นแถบเดียวที่กระชับ ไม่ใช่การ์ดตัวกรองแบบเดิมที่กางไว้ตลอดเวลา
 * เพราะหน้านี้มีแค่สองตัวกรองจริง (สัญญา, เดือน) — ไม่ถึงจุด
 * ที่ต้องซ่อนตัวกรองส่วนเกินไว้หลังปุ่มแบบ UiFilterBar
 *
 * เดือนที่เลือกได้จำกัดเฉพาะเดือนที่ "มีข้อมูลจริง" ของปีงบที่ active อยู่ (จาก
 * useMonthlyKpi แบบไม่กรอง) ไม่ใช่เปิดให้เลือกทั้ง 12 เดือนเสมอไป — ป้องกันคนเลือก
 * เดือนที่ยังไม่มีใครกรอกยอดแล้วเห็นกราฟว่างโดยไม่รู้สาเหตุ
 */
import { useRoute, useRouter } from "vue-router";
import { computed, ref, watch } from "vue";
import { useContracts, useMonthlyKpi } from "../api/queries";
import { activeFiscalYearRange, fiscalYearMonths } from "../store/fiscalYear";
import PeriodPicker from "./PeriodPicker.vue";
import { UiCombobox, UiField } from "../ui";

const emit = defineEmits(["filter"]);

const route = useRoute();
const router = useRouter();
const contractId = ref(typeof route.query.contract === "string" ? route.query.contract : "");
const monthSelection = ref(String(route.query.months || "").split(",").filter((m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m)));
watch([contractId, monthSelection], () => {
  const { building: _removedBuilding, ...query } = route.query;
  router.replace({ query: { ...query, contract: contractId.value || undefined, months: monthSelection.value.length ? monthSelection.value.join(",") : undefined } });
});

// ช่วงเดือนตามปีงบที่ active อยู่ตอนนี้เสมอ (global, เลือกที่ Navbar)
const range = computed(() => activeFiscalYearRange.value);

const { data: contracts } = useContracts();
const contractOptions = computed(() =>
  (contracts.value ?? []).map((contract) => ({
    value: String(contract.id),
    label: contract.contract_no,
  }))
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
  emit("filter", { contract_id: contractId.value, month: month.value });
}

// immediate:true เพราะค่าเริ่มต้นของ month คือทั้งปีงบ (ไม่ใช่ "" ว่างๆ) ต้อง emit ให้
// Dashboard ตั้งแต่โหลดหน้าครั้งแรกเลย ไม่ใช่รอผู้ใช้แตะตัวกรองก่อน
watch([contractId, month], sendFilter, { immediate: true });

// ปีงบเปลี่ยน (จาก Navbar) → เดือนที่เคยเลือกไว้อาจเป็นของปีงบเก่า ใช้ต่อไม่ได้แล้ว
// ล้างทิ้งให้เริ่มเลือกใหม่ (PeriodPicker เองก็ watch ปีงบแล้วเคลียร์ตัวเองอยู่แล้ว
// แต่กันไว้เผื่อ options ยังไม่ทันอัปเดต)
watch(range, (value, previous) => {
  if (previous && monthSelection.value.length) monthSelection.value = [];
});
</script>

<template>
  <div class="card p-3 flex flex-wrap items-end gap-3" data-print="hide">
    <UiField :label="t(&quot;สัญญา&quot;)" class="w-56">
      <UiCombobox
        v-model="contractId"
        :options="contractOptions"
        :placeholder="t(&quot;ทุกสัญญา&quot;)"
        :any-label="t(&quot;ทุกสัญญา&quot;)"
      />
    </UiField>

    <UiField :label="t(&quot;เดือน (ปีงบ {0})&quot;, [formatFiscalYearRange(range)])" class="w-56">
      <PeriodPicker
        v-model="monthSelection"
        :options="monthOptions"
        mode="multi"
        :all-label="t(&quot;ดูทั้งปีงบ&quot;)"
      />
    </UiField>
  </div>
</template>
