<script setup>
/**
 * UsageTrendChart — แนวโน้มรายเดือนตลอดปีงบ
 *
 * รวมกราฟ "จำนวนหน้า" กับ "ค่าใช้จ่าย" ที่เคยแยกเป็นสองไฟล์ไว้ด้วยกัน เพราะอ่าน
 * ข้อมูลชุดเดียวกัน ต่างแค่คอลัมน์ที่พล็อต
 *
 * ตัวเลือกว่าจะดูหน่วยไหน **ไม่ได้อยู่ในการ์ดนี้** แต่อยู่ในแถวตัวกรองของหน้า
 * เพราะตัวกรองที่ซ่อนอยู่ในการ์ดเดียวทำให้ตัวเลขในหน้าเดียวกันอ้างอิงคนละช่วง
 * โดยที่ผู้ใช้ไม่รู้ตัว — ทุกอย่างในหน้าต้องพูดถึงข้อมูลชุดเดียวกันเสมอ
 *
 * เติมเดือนที่ไม่มีข้อมูลเป็นช่องว่าง (null) ไม่ใช่ 0 และไม่ใช่ข้ามไป — ศูนย์แปลว่า
 * "เดือนนั้นไม่ได้พิมพ์เลย" ซึ่งคนละเรื่องกับ "ยังไม่ได้บันทึกยอดของเดือนนั้น"
 */
import { computed } from "vue";
import { formatMonthTH } from "@suth/domain";
import { useMonthlyKpi } from "../api/queries";
import { formatBahtValue, formatCompact, formatCount } from "../lib/format";
import { UiAlert, UiButton, UiChart, UiEmpty, UiSkeleton } from "../ui";

const props = defineProps({
  filter: { type: Object, default: () => ({ building_name: "", month: "" }) },
  /** "pages" = จำนวนหน้า | "cost" = ค่าใช้จ่าย */
  metric: { type: String, default: "pages" },
  height: { type: String, default: "18rem" },
});

const isCost = computed(() => props.metric === "cost");

// พารามิเตอร์เป็น computed จึงกลายเป็นส่วนหนึ่งของ cache key — เปลี่ยนตัวกรองแล้ว
// ดึงชุดใหม่เอง และถ้าเคยดึงชุดนี้ไปแล้วก็ได้ของจาก cache ทันทีโดยไม่ยิงซ้ำ
const params = computed(() => ({
  building_name: props.filter.building_name || undefined,
  month: props.filter.month || undefined,
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

  const months = [...byMonth.keys()].sort();
  return {
    labels: months.map((m) => formatMonthTH(m)),
    values: months.map((m) => byMonth.get(m)[isCost.value ? "cost" : "pages"]),
  };
});
</script>

<template>
  <UiSkeleton v-if="isPending" width="100%" :height="height" />

  <UiAlert v-else-if="isError" tone="danger">
    โหลดกราฟแนวโน้มรายเดือนไม่สำเร็จ
    <template #actions>
      <UiButton size="sm" variant="secondary" @click="refetch()">ลองใหม่</UiButton>
    </template>
  </UiAlert>

  <UiEmpty
    v-else-if="!series.labels.length"
    title="ยังไม่มียอดพิมพ์ในช่วงที่เลือก"
    description="ลองขยายช่วงเดือน หรือไปบันทึกยอดพิมพ์ของเดือนนี้ก่อน"
    compact
  />

  <UiChart
    v-else
    kind="line"
    :labels="series.labels"
    :series="[
      {
        key: metric,
        label: isCost ? 'ค่าใช้จ่ายสุทธิ' : 'จำนวนหน้าที่พิมพ์',
        data: series.values,
        slot: isCost ? 2 : 1,
      },
    ]"
    :height="height"
    :loading="isFetching"
    :unit="isCost ? 'บาท' : 'หน้า'"
    :format-value="isCost ? formatBahtValue : formatCount"
    :format-axis="formatCompact"
    category-label="เดือน"
  />
</template>
