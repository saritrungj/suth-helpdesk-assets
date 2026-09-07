<script setup>
/**
 * BuildingBreakdownChart — เปรียบเทียบยอดระหว่างอาคาร
 *
 * เป็นแท่งแนวนอนเรียงจากมากไปน้อย ไม่ใช่กราฟเส้น เพราะข้อมูลชุดนี้ไม่ใช่อนุกรมเวลา —
 * การลากเส้นเชื่อม "อาคาร ก" กับ "อาคาร ข" สื่อความต่อเนื่องที่ไม่มีอยู่จริง
 *
 * แนวนอนเพราะชื่ออาคารภาษาไทยยาว ถ้าวางเป็นแท่งตั้งต้องเอียงตัวอักษรซึ่งอ่านยากกว่ามาก
 * และการเรียงจากมากไปน้อยทำให้ "อาคารไหนใช้เยอะสุด" ตอบได้ทันทีโดยไม่ต้องกวาดตา
 *
 * ทุกแท่งใช้สีเดียวกัน ไม่ไล่เฉดตามค่า — ความยาวของแท่งบอกค่าอยู่แล้ว การเอาสีมา
 * บอกซ้ำเป็นการใช้ช่องทางที่เหลืออยู่ช่องเดียวไปกับข้อมูลที่มีอยู่แล้ว
 */
import { computed } from "vue";
import { useSummaryByBuilding } from "../api/queries";
import { formatBahtValue, formatCompact, formatCount } from "../lib/format";
import { UiAlert, UiButton, UiChart, UiEmpty, UiSkeleton } from "../ui";

const props = defineProps({
  filter: { type: Object, default: () => ({ building_name: "", month: "" }) },
  metric: { type: String, default: "pages" },
  height: { type: String, default: "20rem" },
});

const isCost = computed(() => props.metric === "cost");

const params = computed(() => ({
  building_name: props.filter.building_name || undefined,
  month: props.filter.month || undefined,
}));

const { data, isPending, isFetching, isError, refetch } = useSummaryByBuilding(params);

const sorted = computed(() => {
  const key = isCost.value ? "total_building_cost" : "total_net_pages";
  return [...(data.value ?? [])].sort((a, b) => Number(b[key] || 0) - Number(a[key] || 0));
});
</script>

<template>
  <UiSkeleton v-if="isPending" width="100%" :height="height" />

  <UiAlert v-else-if="isError" tone="danger">
    โหลดกราฟรายอาคารไม่สำเร็จ
    <template #actions>
      <UiButton size="sm" variant="secondary" @click="refetch()">ลองใหม่</UiButton>
    </template>
  </UiAlert>

  <UiEmpty
    v-else-if="!sorted.length"
    title="ยังไม่มีข้อมูลรายอาคาร"
    description="ลองเปลี่ยนช่วงเดือนที่เลือกไว้ด้านบน"
    variant="search"
    compact
  />

  <UiChart
    v-else
    kind="bar"
    horizontal
    :labels="sorted.map((row) => row.building_name)"
    :series="[
      {
        key: metric,
        label: isCost ? 'ค่าใช้จ่ายสุทธิ' : 'จำนวนหน้าที่พิมพ์',
        data: sorted.map((row) => Number((isCost ? row.total_building_cost : row.total_net_pages) || 0)),
        slot: isCost ? 2 : 1,
      },
    ]"
    :height="height"
    :loading="isFetching"
    :unit="isCost ? 'บาท' : 'หน้า'"
    :format-value="isCost ? formatBahtValue : formatCount"
    :format-axis="formatCompact"
    category-label="อาคาร"
  />
</template>
