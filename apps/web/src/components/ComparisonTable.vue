<script setup>
import { computed } from "vue";
import { ArrowUpRight } from "lucide-vue-next";
import { t } from "../lib/locale";
import { formatBahtValue, formatCount, formatNetPages } from "../lib/format";
import { UiButton, UiCard, UiDataTable } from "../ui";
import { dataStatus, dimensionLabel, statusLabel } from "./comparison";

/**
 * ComparisonTable — ตารางรายละเอียดใต้พื้นที่เปรียบเทียบของหน้าภาพรวม
 *
 * แถวเดียวกับที่กราฟวาด (เดือน / รายการที่เลือก / อันดับ) แต่แสดงครบทุกตัวเลข —
 * ยอดพิมพ์จริง หน้าสุทธิหลังหัก 2% ค่าใช้จ่ายที่ยืนยันแล้ว จำนวนเครื่อง และสถานะ —
 * แล้วเปิดรายละเอียดรายเครื่องของแถวนั้นได้ แทนรายการ "ค่าใช้จ่ายตามแผนก/สัญญา" เดิม
 * ที่แสดงตัวเลขชุดเดียวกันซ้ำอีกรอบ
 */
const props = defineProps({
  model: { type: Object, required: true },
  loading: { type: Boolean, default: false },
  description: { type: String, default: "" },
});
const emit = defineEmits(["details"]);

const emptyText = computed(() => ({
  "no-items": t("ยังไม่ได้เลือกรายการที่จะเทียบ"),
  unpriced: t("ยังจัดอันดับค่าใช้จ่ายไม่ได้จนกว่าราคาจะครบ — ดูอันดับตามยอดพิมพ์จริงได้"),
}[props.model.blocked] ?? t("ไม่มีข้อมูลในช่วงที่เลือก")));
const money = (value) => (value === null || value === undefined ? "—" : formatBahtValue(value));
const noData = (summary) => !summary?.readings;
const costComplete = computed(() => !props.model.scope.unpriced);

const columns = computed(() => {
  const list = [];
  if (props.model.view === "rank") list.push({ key: "rank", label: t("อันดับ"), align: "right", width: "5rem" });
  list.push({ key: "label", label: props.model.view === "overall" ? t("เดือน") : dimensionLabel(props.model.dimension), value: (row) => row.displayLabel, sortable: props.model.view !== "overall" });
  list.push(
    { key: "rawPages", label: t("ยอดพิมพ์จริง (หน้า)"), align: "right", value: (row) => (noData(row.summary) ? null : row.summary.rawPages) },
    { key: "netPages", label: t("สุทธิหลังหัก 2% (หน้า)"), align: "right", value: (row) => (noData(row.summary) ? null : row.summary.netPages) },
    // ยอดเงินที่ยังไม่ครบห้ามถูกเรียงเป็นอันดับ (Q30) — ปิดการเรียงคอลัมน์นี้จนราคาครบ
    { key: "cost", label: t("ค่าใช้จ่ายที่ยืนยันแล้ว (บาท)"), align: "right", value: (row) => row.summary.cost, sortable: costComplete.value },
    { key: "devices", label: t("เครื่องที่มีข้อมูล"), align: "right", value: (row) => row.summary.devices },
    { key: "status", label: t("สถานะข้อมูล"), value: (row) => statusLabel(row.summary), sortable: false },
  );
  return list;
});
</script>

<template>
  <UiCard flush :title="t('ตารางรายละเอียด')" :description="description">
    <UiDataTable
      :rows="model.entries"
      :columns="columns"
      :loading="loading"
      row-key="key"
      :caption="t('ตารางรายละเอียดของการเปรียบเทียบ')"
      :searchable="false"
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
        <span v-if="row.summary.unpriced && row.summary.cost !== null" class="block text-2xs text-warn-ink">{{ t("เฉพาะที่ยืนยันแล้ว") }}</span>
      </template>
      <template #cell-devices="{ row }">{{ formatCount(row.summary.devices) }}</template>
      <template #cell-status="{ row }">
        <span :class="dataStatus(row.summary) === 'complete' ? 'text-ink-mute' : 'text-warn-ink'">{{ statusLabel(row.summary) }}</span>
      </template>
      <template #actions="{ row }">
        <UiButton size="sm" variant="ghost" :disabled="noData(row.summary)" :aria-label="t('ดูรายละเอียดของ {0}', [row.displayLabel])" @click="emit('details', row)">
          {{ t("ดูรายละเอียด") }}<template #trailing><ArrowUpRight :size="14" /></template>
        </UiButton>
      </template>
    </UiDataTable>
  </UiCard>
</template>
