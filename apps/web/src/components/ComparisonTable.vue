<script setup>
import { computed } from "vue";
import { ArrowUpRight } from "lucide-vue-next";
import { t } from "../lib/locale";
import { formatBahtValue, formatCount, formatNetPages } from "../lib/format";
import { UiButton, UiCard, UiCheckbox, UiDataTable } from "../ui";
import UiSparkline from "../ui/UiSparkline.vue";
import { averagePerDevice, dimensionLabel, metricLabel, metricValue } from "./comparison";

/**
 * ComparisonTable — ตารางรายละเอียดใต้พื้นที่เปรียบเทียบ แบบรายการหุ้น (watchlist) (#212)
 *
 * แถวเดียวกับที่กราฟวาด แต่แสดงครบทุกตัวเลข — ยอดพิมพ์จริง หน้าสุทธิหลังหัก 2% ค่าใช้จ่าย
 * จำนวนเครื่อง และค่าเฉลี่ย — พร้อม:
 *   - ช่องติ๊กสีเดียวกับเส้น เลือกว่ารายการไหนอยู่บนกราฟ (สูงสุด `max` รายการ)
 *   - สัดส่วนของรายการนั้นในยอดรวมของขอบเขตที่เลือก
 *   - เส้นจิ๋วบอกรูปทรงแนวโน้มรายเดือน โดยไม่ต้องวาดทุกรายการลงกราฟใหญ่
 * แล้วเปิดรายละเอียดรายเครื่องของแถวนั้นได้
 */
const props = defineProps({
  model: { type: Object, required: true },
  loading: { type: Boolean, default: false },
  description: { type: String, default: "" },
  /** key ที่อยู่บนกราฟ — null = ตารางนี้ไม่มีช่องติ๊ก */
  selected: { type: Array, default: null },
  /** key → สลอตสี 1–8 ของเส้น */
  slots: { type: Map, default: () => new Map() },
  max: { type: Number, default: 5 },
});
const emit = defineEmits(["details", "toggle"]);

const emptyText = computed(() => t("ไม่มีข้อมูลในช่วงที่เลือก"));
const money = (value) => (value === null || value === undefined ? "—" : formatBahtValue(value));
const noData = (summary) => !summary?.readings;

const isGroup = computed(() => props.model.view === "group");
const selectable = computed(() => Array.isArray(props.selected) && isGroup.value);
const isPicked = (row) => props.selected?.includes(row.key) ?? false;
const full = computed(() => (props.selected?.length ?? 0) >= props.max);
const colorOf = (row) => {
  const slot = props.slots.get(row.key);
  return slot ? `var(--chart-${((slot - 1) % 8) + 1})` : "";
};

const total = computed(() => metricValue(props.model.scope, props.model.metric));
const shareOf = (row) => {
  const value = metricValue(row.summary, props.model.metric);
  return value === null || !total.value ? null : value / total.value;
};
const showShare = computed(() => isGroup.value && props.model.dimension !== "fiscalYear");
const showTrend = computed(() => isGroup.value && (props.model.months?.length ?? 0) >= 2);
const trendOf = (row) => (row.monthly ?? []).map((summary) => metricValue(summary, props.model.metric));

const columns = computed(() => {
  const list = [];
  if (selectable.value) list.push({ key: "plot", label: t("บนกราฟ"), sortable: false, width: "4.5rem", value: (row) => (isPicked(row) ? 1 : 0) });
  list.push({ key: "label", label: props.model.view === "overall" ? t("เดือน") : dimensionLabel(props.model.dimension), value: (row) => row.displayLabel, sortable: props.model.view !== "overall" });
  list.push(
    { key: "rawPages", label: t("ยอดพิมพ์"), align: "right", value: (row) => (noData(row.summary) ? null : row.summary.rawPages) },
    { key: "netPages", label: t("ยอดพิมพ์หลังหัก 2%"), align: "right", value: (row) => (noData(row.summary) ? null : row.summary.netPages) },
    { key: "cost", label: t("ค่าใช้จ่าย (บาท)"), align: "right", value: (row) => row.summary.cost },
  );
  // ลำดับแบบรายการหุ้น: ชื่อ → ตัวเลข → สัดส่วน → รูปทรงรายเดือน แล้วค่อยค่าเฉลี่ย
  if (showShare.value) list.push({ key: "share", label: t("สัดส่วน{0}", [metricLabel(props.model.metric)]), align: "right", value: (row) => shareOf(row), csv: (row) => (shareOf(row) === null ? "" : (shareOf(row) * 100).toFixed(1)) });
  if (showTrend.value) list.push({ key: "trend", label: t("รายเดือน"), sortable: false, width: "7.5rem", value: () => null, csv: () => "" });
  list.push(
    { key: "devices", label: t("เครื่องที่มีข้อมูล"), align: "right", value: (row) => row.summary.devices },
    { key: "pagesPerDevice", label: t("หน้าต่อเครื่อง"), align: "right", value: (row) => averagePerDevice(row.summary, "rawPages") },
    { key: "costPerDevice", label: t("บาทต่อเครื่อง"), align: "right", value: (row) => averagePerDevice(row.summary, "cost") },
  );
  return list;
});
</script>

<template>
  <UiCard :title="t('ตารางรายละเอียด')" :description="description" :aria-busy="loading" :class="loading && model.entries.length && 'opacity-45'">
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
      <template #cell-plot="{ row }">
        <UiCheckbox
          :model-value="isPicked(row)"
          :disabled="loading || noData(row.summary) || (!isPicked(row) && full)"
          :aria-label="isPicked(row) ? t('ซ่อน {0} จากกราฟ', [row.displayLabel]) : t('แสดง {0} บนกราฟ', [row.displayLabel])"
          :color="colorOf(row)"
          :data-testid="`plot-${row.key}`"
          @update:model-value="emit('toggle', row.key)"
        />
      </template>
      <template #cell-label="{ row }">
        <span class="font-medium text-ink">{{ row.displayLabel }}</span>
        <span v-if="row.hint && model.dimension === 'department'" class="block text-xs text-ink-mute">{{ row.hint }}</span>
      </template>
      <template #cell-share="{ row }">
        <span v-if="shareOf(row) === null">—</span>
        <span v-else class="inline-flex items-center justify-end gap-2">
          <span class="hidden md:block w-12 h-1.5 rounded-full bg-line-soft overflow-hidden" aria-hidden="true">
            <span class="block h-full rounded-full bg-brand" :style="{ width: `${Math.max(2, shareOf(row) * 100)}%` }" />
          </span>
          {{ (shareOf(row) * 100).toFixed(1) }}%
        </span>
      </template>
      <template #cell-trend="{ row }">
        <!-- รูปทรงอย่างเดียว ตัวเลขรายเดือนอยู่ในกราฟและตารางของกราฟแล้ว — โปรแกรมอ่านจอข้ามไป -->
        <UiSparkline :values="trendOf(row)" :color="isPicked(row) ? colorOf(row) : ''" class="text-ink-mute" />
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
