<script setup>
import { computed, ref, watch } from "vue";
import { t } from "../lib/locale";
import { formatBahtValue, formatCompact, formatCount } from "../lib/format";
import { UiCard, UiEmpty, UiField, UiFilterBar, UiSegmented, UiSkeleton } from "../ui";
import UiChart from "../ui/UiChart.vue";
import { chartState, comparisonChart, deviceSpread, dimensionLabel, stableSlots } from "./comparison";
import { comparisonTitle } from "./comparison-export";

/**
 * PrintComparison — พื้นที่เปรียบเทียบของหน้าภาพรวมการพิมพ์
 *
 * มีตัวเลือกสองตัวเท่านั้น และทั้งคู่ไม่แตะขอบเขตข้อมูล
 *
 *   เปรียบเทียบตาม   แบ่งข้อมูลชุดที่ตัวกรองด้านบนเลือกไว้ เป็นเส้น/แท่งอะไร
 *   ตัวเลขที่ดู       ค่าใช้จ่าย หรือ ยอดพิมพ์จริง
 *
 * เดิมที่นี่มีช่อง "{มิติ}ที่เลือก" ให้หยิบรายการมาเทียบอีกชั้น ซึ่งชื่อซ้ำกับตัวกรองด้านบน
 * แต่ความหมายคนละอย่าง และยังมีตัวเลือก "ขอบเขต" ซ้อนอีกชั้นเฉพาะตอนเทียบปีงบ —
 * ตอนนี้หน้าที่เลือกข้อมูลเป็นของตัวกรองด้านบนทั้งหมด ที่นี่เหลือแค่วิธีแบ่ง
 *
 * ตัวเลขทั้งหมดมาจาก `model` ตัวเดียวกับที่ตารางด้านล่างและไฟล์ Excel ใช้
 */
const props = defineProps({
  model: { type: Object, required: true },
  loading: { type: Boolean, default: false },
  failed: { type: Boolean, default: false },
  /** บรรทัดบอกขอบเขตที่ตัวเลขชุดนี้มาจาก */
  scopeText: { type: String, default: "" },
});
const state = defineModel("state", { type: Object, required: true });
const emit = defineEmits(["details"]);

const DIMENSION_OPTIONS = [
  { value: "overall", label: t("ภาพรวม") },
  { value: "division", label: t("ฝ่าย") },
  { value: "department", label: t("แผนก") },
  { value: "contract", label: t("สัญญา") },
  { value: "building", label: t("อาคาร") },
  { value: "device", label: t("เครื่อง") },
  { value: "fiscalYear", label: t("ปีงบ") },
];
const METRIC_OPTIONS = [
  { value: "cost", label: t("ค่าใช้จ่าย") },
  { value: "rawPages", label: t("หน้าที่พิมพ์") },
];

const update = (patch) => { state.value = { ...state.value, ...patch }; };
const dimension = computed({ get: () => state.value.by, set: (value) => update({ by: value }) });
const metric = computed({ get: () => state.value.metric, set: (value) => update({ metric: value }) });
const noun = computed(() => dimensionLabel(state.value.by));

// ระหว่างโหลดชุดใหม่ ให้กราฟเดิมค้างไว้พร้อมคำอธิบายเดิม — ห้ามติดหัวข้อใหม่บนตัวเลขเก่า
const settledModel = ref(props.model);
const settledCaption = ref(props.scopeText);
watch([() => props.model, () => props.loading, () => props.scopeText], ([next, isLoading, caption]) => {
  if (!isLoading && !props.failed) {
    settledModel.value = next;
    settledCaption.value = caption;
  }
}, { immediate: true });
const displayModel = computed(() => (props.loading ? settledModel.value : props.model));
const displayCaption = computed(() => (props.loading ? settledCaption.value : props.scopeText));
const title = computed(() => comparisonTitle(displayModel.value));
const chart = computed(() => comparisonChart(displayModel.value));

// สีผูกกับตัวตนของกลุ่ม ไม่ใช่ลำดับ — เอากลุ่มหนึ่งออกแล้วเส้นที่เหลือคงสีเดิม
const slots = ref(new Map());
watch(() => (displayModel.value.chartEntries ?? []).map((entry) => entry.key), (keys) => {
  slots.value = stableSlots(slots.value, keys);
}, { immediate: true });
const isLine = computed(() => displayModel.value.view === "group" && chart.value.kind === "line");
const series = computed(() => chart.value.series.map((item) => ({
  ...item,
  slot: isLine.value ? slots.value.get(item.key) : 1,
})));

const isCost = computed(() => displayModel.value.metric === "cost");
const formatValue = (value) => (isCost.value ? formatBahtValue(value) : formatCount(value));
const unit = computed(() => (isCost.value ? t("บาท") : t("หน้า")));
const spread = computed(() => (displayModel.value.view === "overall"
  ? null : deviceSpread((displayModel.value.chartEntries ?? []).map((entry) => entry.summary))));
const hidden = computed(() => displayModel.value.hidden ?? 0);
const status = computed(() => chartState(displayModel.value));
const hasChart = computed(() => status.value === "ready");

function select({ index }) {
  if (props.loading || isLine.value) return;
  const entry = (props.model.chartEntries ?? props.model.entries)[index];
  if (entry) emit("details", entry);
}
</script>

<template>
  <section class="mb-4" role="region" :aria-label="t('พื้นที่เปรียบเทียบ')" :aria-busy="loading">
    <UiFilterBar :collapsible="false">
      <template #primary>
        <UiField :label="t('เปรียบเทียบตาม')">
          <UiSegmented v-model="dimension" :options="DIMENSION_OPTIONS" size="sm" />
        </UiField>
        <UiField :label="t('ตัวเลขที่ดู')">
          <UiSegmented v-model="metric" :options="METRIC_OPTIONS" size="sm" />
        </UiField>
      </template>
    </UiFilterBar>

    <UiCard :title="title" :description="displayCaption" :aria-busy="loading">
      <UiSkeleton v-if="loading && !hasChart" height="18rem" />
      <UiEmpty v-else-if="failed" :title="t('โหลดข้อมูลไม่สำเร็จ')" compact />
      <UiEmpty v-else-if="!hasChart" compact
        :title="t('ยังไม่มีการพิมพ์ในขอบเขตที่เลือก')"
        :description="t('เปลี่ยนช่วงเวลาหรือเอาตัวกรองบางตัวออก แล้วลองใหม่')" />
      <UiChart v-else :kind="chart.kind" :horizontal="chart.horizontal" :labels="chart.labels" :series="series"
        :height="chart.horizontal ? `${Math.max(12, chart.labels.length * 2.6 + 4)}rem` : '18rem'"
        :format-value="formatValue" :format-axis="formatCompact" :unit="unit" :category-label="chart.categoryLabel"
        :selectable="!isLine" :loading="loading" @select="select" />

      <ul v-if="!loading && !failed && !displayModel.blocked && (hidden || spread)"
        class="mt-3 flex flex-col gap-1 text-sm text-ink-soft list-none">
        <li v-if="hidden">{{ t("กราฟแสดง {0} {1}แรกที่สูงสุด · อีก {2} รายการอยู่ในตารางและไฟล์ที่ส่งออก", [formatCount(displayModel.chartEntries.length), noun, formatCount(hidden)]) }}</li>
        <li v-if="spread">{{ t("จำนวนเครื่องต่างกัน ({0}–{1} เครื่อง) ผลรวมจึงต่างกันได้ ไม่ได้แปลว่าแต่ละเครื่องใช้งานต่างกัน", [formatCount(spread.min), formatCount(spread.max)]) }}</li>
      </ul>

      <template #footer>
        <div class="flex flex-wrap justify-between gap-2 text-xs text-ink-mute">
          <span v-if="displayModel.view === 'overall'">{{ t("กดแท่งกราฟหรือชื่อเดือนในตารางเพื่อเจาะรายละเอียด") }}</span>
          <span v-else>{{ t("ดูรายละเอียดของแต่ละรายการได้จากตารางด้านล่าง") }}</span>
          <span>{{ t("แสดง {0} เดือนที่มีข้อมูล", [formatCount(displayModel.months.length)]) }}</span>
        </div>
      </template>
    </UiCard>
  </section>
</template>
