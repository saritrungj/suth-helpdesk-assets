<script setup>
import { computed, ref, watch } from "vue";
import { t } from "../lib/locale";
import { formatBahtValue, formatCompact, formatCount } from "../lib/format";
import { UiCard, UiEmpty, UiField, UiFilterBar, UiSegmented, UiSkeleton } from "../ui";
import UiStockChart from "../ui/UiStockChart.vue";
import { deviceSpread, dimensionLabel, metricValue, monthText, monthsWithData } from "./comparison";
import { comparisonTitle } from "./comparison-export";

/**
 * PrintComparison — กราฟของหน้าเปรียบเทียบ แบบเทียบหุ้นหลายตัว (#212)
 *
 * เดิมวาดทุกกลุ่ม (สูงสุด 8 เส้น) หรือแท่งแนวนอน เส้นซ้อนกันจนอ่านไม่ออก ตอนนี้วาดเฉพาะรายการที่ติ๊กใน
 * watchlist ด้านล่าง (ค่าเริ่มต้น 3 อันดับแรก เลือกได้สูงสุด 5) เส้นล้วน มีเส้นเล็งและกล่องค่าของทุกเส้น ณ เดือนนั้น
 *
 * ตัวเลือกสองตัวไม่แตะขอบเขตข้อมูล: "เปรียบเทียบตาม" (แบ่งตามอะไร) และ "ตัวเลขที่ดู" (เงิน หรือ ยอดพิมพ์)
 * ตัวเลขทั้งหมดมาจาก `model` ตัวเดียวกับตารางและไฟล์ Excel
 */
const props = defineProps({
  model: { type: Object, required: true },
  loading: { type: Boolean, default: false },
  failed: { type: Boolean, default: false },
  scopeText: { type: String, default: "" },
  /** มิติที่หน้านี้ให้เลือก — ปีงบซ่อนไว้เมื่อมีข้อมูลปีงบเดียว */
  dimensions: { type: Array, default: null },
  /** key ของรายการที่ติ๊กไว้ใน watchlist ตามลำดับที่เลือก */
  selected: { type: Array, default: () => [] },
  /** key → สลอตสี 1–8 ใช้ร่วมกับตาราง เพื่อให้จุดสีในตารางตรงกับเส้น */
  slots: { type: Map, default: () => new Map() },
});
const state = defineModel("state", { type: Object, required: true });

const ALL_DIMENSION_OPTIONS = [
  { value: "overall", label: t("ภาพรวม") },
  { value: "division", label: t("ฝ่าย") },
  { value: "department", label: t("แผนก") },
  { value: "contract", label: t("สัญญา") },
  { value: "building", label: t("อาคาร") },
  { value: "device", label: t("เครื่อง") },
  { value: "fiscalYear", label: t("ปีงบ") },
];
const DIMENSION_OPTIONS = computed(() => (props.dimensions
  ? ALL_DIMENSION_OPTIONS.filter((option) => props.dimensions.includes(option.value))
  : ALL_DIMENSION_OPTIONS));
const METRIC_OPTIONS = [
  { value: "cost", label: t("ค่าใช้จ่าย") },
  { value: "rawPages", label: t("ยอดพิมพ์") },
];

const update = (patch) => { state.value = { ...state.value, ...patch }; };
const dimension = computed({ get: () => state.value.by, set: (value) => update({ by: value }) });
const metric = computed({ get: () => state.value.metric, set: (value) => update({ metric: value }) });
const noun = computed(() => dimensionLabel(state.value.by));

// ระหว่างโหลดชุดใหม่ ให้กราฟเดิมค้างไว้พร้อมคำอธิบายเดิม — ห้ามติดหัวข้อใหม่บนตัวเลขเก่า
const settled = ref({ model: props.model, caption: props.scopeText, selected: props.selected });
watch([() => props.model, () => props.loading, () => props.scopeText, () => props.selected], ([model, isLoading, caption, selected]) => {
  if (!isLoading && !props.failed) settled.value = { model, caption, selected };
}, { immediate: true });
const shown = computed(() => (props.loading ? settled.value : { model: props.model, caption: props.scopeText, selected: props.selected }));
const title = computed(() => comparisonTitle(shown.value.model));

const series = computed(() => {
  const byKey = new Map(shown.value.model.entries.map((entry) => [entry.key, entry]));
  return shown.value.selected
    .map((key) => byKey.get(key))
    .filter(Boolean)
    .map((entry) => ({
      key: entry.key,
      label: entry.displayLabel ?? entry.label,
      values: entry.monthly.map((summary) => metricValue(summary, shown.value.model.metric)),
      slot: props.slots.get(entry.key),
    }));
});
const hasChart = computed(() => series.value.some((s) => s.values.some((value) => value !== null)));
// เส้นที่มีจุดเดียวไม่บอกอะไร — เดือนเดียวให้อ่านสัดส่วนจากตาราง (เดิมเป็นแท่งแนวนอนซึ่งซ้ำกับตาราง)
const singleMonth = computed(() => shown.value.model.months.length < 2);

const isCost = computed(() => shown.value.model.metric === "cost");
const formatValue = (value) => (isCost.value ? formatBahtValue(value) : formatCount(value));
const unit = computed(() => (isCost.value ? t("บาท") : t("หน้า")));
const spread = computed(() => deviceSpread(series.value.length
  ? shown.value.model.entries.filter((entry) => shown.value.selected.includes(entry.key)).map((entry) => entry.summary)
  : []));
const isYears = computed(() => shown.value.model.dimension === "fiscalYear");
const axisLabel = (key) => (isYears.value ? monthText(key) : monthText(key, { shortYear: true }));
const pointLabel = (key) => (isYears.value ? monthText(key) : monthText(key, { long: true }));
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

    <UiCard :title="title" :description="shown.caption" :aria-busy="loading">
      <UiSkeleton v-if="loading && !hasChart" height="18rem" />
      <UiEmpty v-else-if="failed" :title="t('โหลดข้อมูลไม่สำเร็จ')" compact />
      <UiEmpty v-else-if="!shown.model.entries.length || shown.model.blocked" compact
        :title="t('ยังไม่มีการพิมพ์ในขอบเขตที่เลือก')"
        :description="t('เปลี่ยนช่วงเวลาหรือเอาตัวกรองบางตัวออก แล้วลองใหม่')" />
      <UiEmpty v-else-if="singleMonth" compact data-testid="compare-single-month"
        :title="t('ช่วงที่เลือกมีข้อมูลเดือนเดียว')"
        :description="t('ดูสัดส่วนของแต่ละรายการในตารางด้านล่าง หรือเลือกช่วงเวลาอย่างน้อย 2 เดือนเพื่อดูเป็นเส้นรายเดือน')" />
      <UiEmpty v-else-if="!hasChart" compact
        :title="t('ติ๊กรายการในตารางด้านล่างเพื่อวาดลงกราฟ')"
        :description="t('เลือกได้สูงสุด 5 รายการ เทียบกันบนแกนเดือนเดียวกัน')" />
      <UiStockChart v-else
        :domain="shown.model.months"
        :axis-label="axisLabel"
        :point-label="pointLabel"
        :series="series"
        :format-value="formatValue"
        :format-axis="formatCompact"
        :unit="unit"
        :category-label="t('เดือน')"
        height="20rem"
        :loading="loading"
        data-testid="compare-chart"
      />

      <p v-if="!loading && !failed && spread" class="mt-3 text-sm text-ink-soft">
        {{ t("จำนวนเครื่องต่างกัน ({0}–{1} เครื่อง) ผลรวมจึงต่างกันได้ ไม่ได้แปลว่าแต่ละเครื่องใช้งานต่างกัน", [formatCount(spread.min), formatCount(spread.max)]) }}
      </p>

      <template #footer>
        <div class="flex flex-wrap justify-between gap-2 text-xs text-ink-mute">
          <span>{{ t("ติ๊ก{0}ในตารางด้านล่างเพื่อเพิ่มหรือเอาเส้นออก (สูงสุด 5)", [noun]) }}</span>
          <span v-if="isYears">{{ t("แสดง {0} เดือนของปีงบ · มีข้อมูล {1} เดือน", [formatCount(shown.model.months.length), formatCount(monthsWithData(shown.model))]) }}</span>
          <span v-else>{{ t("แสดง {0} เดือนที่มีข้อมูล", [formatCount(monthsWithData(shown.model))]) }}</span>
        </div>
      </template>
    </UiCard>
  </section>
</template>
