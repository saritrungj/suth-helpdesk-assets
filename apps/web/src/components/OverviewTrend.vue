<script setup>
import { computed, ref, watch } from "vue";
import { t } from "../lib/locale";
import { formatBahtValue, formatCompact, formatCount } from "../lib/format";
import { UiCard, UiEmpty, UiSkeleton } from "../ui";
import UiChart from "../ui/UiChart.vue";
import { chartState, comparisonChart, monthsWithData } from "./comparison";

/**
 * OverviewTrend — กราฟเส้นสองกราฟของหน้าภาพรวม ค่าใช้จ่ายซ้าย ยอดพิมพ์ขวา (#206)
 *
 * หน้าภาพรวมตอบคำถามเดียว "ทั้งหมดเป็นอย่างไรเดือนต่อเดือน" จึงวาดสองตัวเลขที่คนถามคู่กันเสมอ
 * พร้อมกันบนแกนเดือนเดียวกัน แทนปุ่มสลับ "ตัวเลขที่ดู" ที่ต้องกดไปมาแล้วจำตัวเลขอีกกราฟไว้เอง
 * การแบ่งตามฝ่าย สัญญา อาคาร หรือหลายปีงบ อยู่ที่หน้าเปรียบเทียบ
 *
 * ทั้งสองกราฟอ่านจากแถวชุดเดียวกับการ์ดตัวเลขด้านบน (buildComparison มุมมองภาพรวม)
 */
const props = defineProps({
  /** แบบจำลองมุมมองภาพรวม ตัวชี้วัดค่าใช้จ่าย */
  cost: { type: Object, required: true },
  /** แบบจำลองมุมมองภาพรวม ตัวชี้วัดยอดพิมพ์ */
  pages: { type: Object, required: true },
  loading: { type: Boolean, default: false },
  failed: { type: Boolean, default: false },
  /** บรรทัดบอกขอบเขตที่ตัวเลขชุดนี้มาจาก */
  scopeText: { type: String, default: "" },
});
const emit = defineEmits(["details"]);

// ระหว่างโหลดชุดใหม่ ให้กราฟเดิมค้างไว้พร้อมคำอธิบายเดิม — ห้ามติดหัวข้อใหม่บนตัวเลขเก่า
const settled = ref({ cost: props.cost, pages: props.pages, caption: props.scopeText });
watch([() => props.cost, () => props.pages, () => props.loading, () => props.scopeText], ([cost, pages, isLoading, caption]) => {
  if (!isLoading && !props.failed) settled.value = { cost, pages, caption };
}, { immediate: true });
const shown = computed(() => (props.loading ? settled.value : { cost: props.cost, pages: props.pages, caption: props.scopeText }));

const CARDS = [
  { key: "cost", title: t("ค่าใช้จ่ายรายเดือน"), unit: t("บาท"), format: formatBahtValue, slot: 1 },
  { key: "pages", title: t("ยอดพิมพ์รายเดือน"), unit: t("หน้า"), format: formatCount, slot: 2 },
];

const charts = computed(() => CARDS.map((card) => {
  const model = shown.value[card.key];
  const chart = comparisonChart(model);
  return {
    ...card,
    model,
    ready: chartState(model) === "ready",
    labels: chart.labels,
    series: chart.series.map((item) => ({ ...item, label: card.title, slot: card.slot })),
  };
}));

function select(model, { index }) {
  if (props.loading) return;
  const entry = model.entries[index];
  if (entry) emit("details", entry);
}
</script>

<template>
  <section class="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4" role="region" :aria-label="t('แนวโน้มรายเดือน')" :aria-busy="loading">
    <UiCard v-for="chart in charts" :key="chart.key" :title="chart.title" :description="shown.caption" :data-testid="`overview-trend-${chart.key}`">
      <UiSkeleton v-if="loading && !chart.ready" height="16rem" />
      <UiEmpty v-else-if="failed" :title="t('โหลดข้อมูลไม่สำเร็จ')" compact />
      <UiEmpty v-else-if="!chart.ready" compact
        :title="t('ยังไม่มีการพิมพ์ในขอบเขตที่เลือก')"
        :description="t('เปลี่ยนช่วงเวลาหรือสัญญา แล้วลองใหม่')" />
      <UiChart v-else kind="line" :labels="chart.labels" :series="chart.series" height="16rem"
        :format-value="chart.format" :format-axis="formatCompact" :unit="chart.unit" :category-label="t('เดือน')"
        selectable :loading="loading" @select="(event) => select(chart.model, event)" />
      <template #footer>
        <div class="flex flex-wrap justify-between gap-2 text-xs text-ink-mute">
          <span>{{ t("กดจุดบนกราฟเพื่อดูรายเครื่องของเดือนนั้น") }}</span>
          <span>{{ t("แสดง {0} เดือนที่มีข้อมูล", [formatCount(monthsWithData(chart.model))]) }}</span>
        </div>
      </template>
    </UiCard>
  </section>
</template>
