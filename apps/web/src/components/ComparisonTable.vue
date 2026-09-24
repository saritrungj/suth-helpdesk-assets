<script setup>
import { computed } from "vue";
import { ArrowUpRight } from "lucide-vue-next";
import { t } from "../lib/locale";
import { formatBahtValue, formatCount, formatNetPages } from "../lib/format";
import { UiButton, UiCard, UiDataTable } from "../ui";
import { averagePerDevice, dimensionLabel } from "./comparison";

/**
 * ComparisonTable — ตารางรายละเอียดใต้พื้นที่เปรียบเทียบของหน้าภาพรวม
 *
 * แถวเดียวกับที่กราฟวาด (เดือน / รายการที่เทียบ) แต่แสดงครบทุกตัวเลข —
 * ยอดพิมพ์จริง หน้าสุทธิหลังหัก 2% ค่าใช้จ่าย จำนวนเครื่อง และค่าเฉลี่ย —
 * แล้วเปิดรายละเอียดรายเครื่องของแถวนั้นได้ แทนรายการ "ค่าใช้จ่ายตามแผนก/สัญญา" เดิม
 * ที่แสดงตัวเลขชุดเดียวกันซ้ำอีกรอบ
 */
const props = defineProps({
  model: { type: Object, required: true },
  loading: { type: Boolean, default: false },
  description: { type: String, default: "" },
});
const emit = defineEmits(["details"]);

const emptyText = computed(() => t("ไม่มีข้อมูลในช่วงที่เลือก"));
const money = (value) => (value === null || value === undefined ? "—" : formatBahtValue(value));
const noData = (summary) => !summary?.readings;

const columns = computed(() => {
  const list = [];
  list.push({ key: "label", label: props.model.view === "overall" ? t("เดือน") : dimensionLabel(props.model.dimension), value: (row) => row.displayLabel, sortable: props.model.view !== "overall" });
  list.push(
    { key: "rawPages", label: t("ยอดพิมพ์"), align: "right", value: (row) => (noData(row.summary) ? null : row.summary.rawPages) },
    { key: "netPages", label: t("ยอดพิมพ์หลังหัก 2%"), align: "right", value: (row) => (noData(row.summary) ? null : row.summary.netPages) },
    // ยอดเงินที่ยังไม่ครบห้ามถูกเรียงเป็นอันดับ (Q30) — ปิดการเรียงคอลัมน์นี้จนราคาครบ
    { key: "cost", label: t("ค่าใช้จ่าย (บาท)"), align: "right", value: (row) => row.summary.cost },
    { key: "devices", label: t("เครื่องที่มีข้อมูล"), align: "right", value: (row) => row.summary.devices },
    { key: "pagesPerDevice", label: t("หน้าต่อเครื่อง"), align: "right", value: (row) => averagePerDevice(row.summary, "rawPages") },
    { key: "costPerDevice", label: t("บาทต่อเครื่อง"), align: "right", value: (row) => averagePerDevice(row.summary, "cost") },
  );
  return list;
});
</script>

<template>
  <UiCard flush :title="t('ตารางรายละเอียด')" :description="description" :aria-busy="loading" :class="loading && model.entries.length && 'opacity-45'">
    <UiDataTable
      :rows="model.entries"
      :columns="columns"
      :loading="loading && !model.entries.length"
      row-key="key"
      :caption="t('ตารางรายละเอียดของการเปรียบเทียบ')"
      searchable
      :show-export="false"
      :show-fullscreen="false"
      :show-column-picker="false"
      max-height="none"
      :default-page-size="20"
      :empty-text="emptyText"
    >
      <template #cell-label="{ row }">
        <span class="font-medium text-ink">{{ row.displayLabel }}</span>
        <span v-if="row.hint && model.dimension === 'department'" class="block text-xs text-ink-mute">{{ row.hint }}</span>
      </template>
      <template #cell-rawPages="{ row }">{{ noData(row.summary) ? "—" : formatCount(row.summary.rawPages) }}</template>
      <template #cell-netPages="{ row }">{{ noData(row.summary) ? "—" : formatNetPages(row.summary.netPages) }}</template>
      <template #cell-cost="{ row }">
        {{ money(row.summary.cost) }}
      </template>
      <template #cell-devices="{ row }">{{ formatCount(row.summary.devices) }}</template>
      <template #cell-pagesPerDevice="{ row }">{{ averagePerDevice(row.summary, "rawPages") == null ? "—" : formatCount(averagePerDevice(row.summary, "rawPages")) }}</template>
      <template #cell-costPerDevice="{ row }">{{ money(averagePerDevice(row.summary, "cost")) }}</template>
      <template #actions="{ row }">
        <UiButton size="sm" variant="ghost" :disabled="loading || noData(row.summary)" :aria-label="t('ดูรายละเอียดของ {0}', [row.displayLabel])" @click="emit('details', row)">
          {{ t("ดูรายละเอียด") }}<template #trailing><ArrowUpRight :size="14" /></template>
        </UiButton>
      </template>
    </UiDataTable>
  </UiCard>
</template>
