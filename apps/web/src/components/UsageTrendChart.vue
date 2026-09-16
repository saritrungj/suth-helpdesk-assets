<script setup>
import { t } from "../lib/locale";

import { formatMonth } from "../lib/locale-format";

/**
 * UsageTrendChart — แนวโน้มรายเดือนตลอดปีงบ
 *
 * รวมกราฟ "จำนวนหน้า" กับ "ค่าใช้จ่าย" ที่เคยแยกเป็นสองไฟล์ไว้ด้วยกัน เพราะอ่าน
 * ข้อมูลชุดเดียวกัน ต่างแค่คอลัมน์ที่พล็อต
 *
 * ตัวเลือกว่าจะดูหน่วยไหน **ไม่ได้อยู่ในการ์ดนี้** แต่เป็น prop ที่หน้าเป็นคนตั้ง
 * บนแดชบอร์ดผู้ใช้สลับหน่วยผ่านตัวเลือกที่หัวกราฟ
 *
 * ย้ำว่านี่ไม่ใช่ตัวกรอง — มันเลือกแค่ว่าจะพล็อตคอลัมน์ไหนจากข้อมูลชุดเดิม
 * ขอบเขตของข้อมูล (สัญญา, ช่วงเดือน) ยังมาจากแถวตัวกรองของหน้าที่เดียวเสมอ
 * ตัวกรองที่ซ่อนอยู่ในการ์ดเดียวจะทำให้ตัวเลขในหน้าเดียวกันอ้างอิงคนละช่วง
 * โดยที่ผู้ใช้ไม่รู้ตัว
 *
 * แสดงเฉพาะเดือนที่มีรายการจริง เดือนที่บันทึกเป็นศูนย์ยังคงแสดง
 * เพื่อแยก "ไม่มีการพิมพ์" ออกจาก "ยังไม่ได้บันทึก"
 */
import { activeFiscalYearRange, fiscalYearMonths } from "../store/fiscalYear";
import { computed, ref, watch } from "vue";

import { useMonthlyKpi } from "../api/queries";
import { formatBahtValue, formatCompact, formatCount } from "../lib/format";
import { UiAlert, UiButton, UiChart, UiEmpty, UiSkeleton } from "../ui";

const props = defineProps({
  filter: { type: Object, default: () => ({ contract_id: "", month: "" }) },
  /** "pages" = จำนวนหน้า | "cost" = ค่าใช้จ่าย */
  metric: { type: String, default: "pages" },
  height: { type: String, default: "18rem" },
  controlsTarget: { type: String, default: "" },
});

const isCost = computed(() => props.metric === "cost");
const selectedIndex = ref(-1);

// พารามิเตอร์เป็น computed จึงกลายเป็นส่วนหนึ่งของ cache key — เปลี่ยนตัวกรองแล้ว
// ดึงชุดใหม่เอง และถ้าเคยดึงชุดนี้ไปแล้วก็ได้ของจาก cache ทันทีโดยไม่ยิงซ้ำ
const params = computed(() => ({
  contract_id: props.filter.contract_id || undefined,
  month: props.filter.month || (activeFiscalYearRange.value ? fiscalYearMonths(activeFiscalYearRange.value).join(",") : undefined),
}));

const { data, isPending, isFetching, isError, refetch } = useMonthlyKpi(params);

const series = computed(() => {
  const byMonth = new Map();

  for (const row of data.value ?? []) {
    const current = byMonth.get(row.month) ?? { pages: 0, cost: 0 };
    current.pages += Number(row.net_pages || 0);
    current.cost += Number(row.total_cost || 0);
    byMonth.set(row.month, current);
  }

  const requestedMonths = String(props.filter.month || "").split(",").filter(Boolean);
  const scopedMonths = requestedMonths.length
    ? requestedMonths
    : activeFiscalYearRange.value
      ? fiscalYearMonths(activeFiscalYearRange.value)
      : [...byMonth.keys()].sort();
  const months = [...new Set(scopedMonths)].filter((month) => byMonth.has(month)).sort();
  return {
    months,
    labels: months.map((m) => formatMonth(m)),
    values: months.map((m) => byMonth.get(m)?.[isCost.value ? "cost" : "pages"] ?? null),
  };
});

const selectedPoint = computed(() => {
  if (selectedIndex.value < 0) return null;
  const month = series.value.months[selectedIndex.value];
  const value = series.value.values[selectedIndex.value];
  if (!month || value === null || value === undefined) return null;
  return { month, value };
});

function selectPoint({ index }) {
  selectedIndex.value = selectedIndex.value === index ? -1 : index;
}

watch(() => [props.filter.contract_id, props.filter.month, props.metric], () => {
  selectedIndex.value = -1;
});
</script>

<template>
  <UiSkeleton v-if="isPending" width="100%" :height="height" />

  <UiAlert v-else-if="isError" tone="danger"> {{ t("โหลดกราฟแนวโน้มรายเดือนไม่สำเร็จ") }} <template #actions>
      <UiButton size="sm" variant="secondary" @click="refetch()"> {{ t("ลองใหม่") }} </UiButton>
    </template>
  </UiAlert>

  <UiEmpty
    v-else-if="!series.labels.length"
    :title="t(&quot;ยังไม่มียอดพิมพ์ในช่วงที่เลือก&quot;)"
    :description="t(&quot;ลองขยายช่วงเดือน หรือไปบันทึกยอดพิมพ์ของเดือนนี้ก่อน&quot;)"
    compact
  />

  <UiChart
    v-else
    :kind="isCost ? 'bar' : 'line'"
    :labels="series.labels"
    :series="[
      {
        key: metric,
        label: isCost ? t(&quot;ค่าใช้จ่ายสุทธิ&quot;) : t(&quot;จำนวนหน้าที่พิมพ์&quot;),
        data: series.values,
        slot: 6,
      },
    ]"
    :height="height"
    :controls-target="controlsTarget"
    :max-bar-thickness="36"
    :loading="isFetching"
    :unit="isCost ? t(&quot;บาท&quot;) : t(&quot;หน้า&quot;)"
    :format-value="isCost ? formatBahtValue : formatCount"
    :format-axis="formatCompact"
    :selected-index="selectedIndex"
    selectable
    @select="selectPoint"
    :category-label="t(&quot;เดือน&quot;)"
  />

  <div
    v-if="selectedPoint"
    role="status"
    class="mt-3 flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-brand-line bg-brand-soft px-3 py-2"
  >
    <span class="text-sm font-medium text-brand-ink">{{ formatMonth(selectedPoint.month, { long: true }) }}</span>
    <span class="numeral text-sm font-semibold text-ink">
      {{ isCost ? formatBahtValue(selectedPoint.value) : formatCount(selectedPoint.value) }}
      {{ isCost ? t("บาท") : t("หน้า") }}
    </span>
  </div>
</template>
