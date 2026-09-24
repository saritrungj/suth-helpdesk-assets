<script setup>
import { computed, ref, watch } from "vue";
import { t } from "../lib/locale";
import { formatBahtValue, formatCompact, formatCount } from "../lib/format";
import { formatMonth } from "../lib/locale-format";
import { UiCard, UiEmpty, UiSkeleton } from "../ui";
import UiStockChart from "../ui/UiStockChart.vue";

/**
 * OverviewTrend — กราฟแบบแอปหุ้นสองกราฟของหน้าภาพรวม ค่าใช้จ่ายซ้าย ยอดพิมพ์ขวา (#206, #212)
 *
 * - แกนนอนคือทุกเดือนของปีงบ (หรือเดือนที่เลือก) เดือนที่ไม่มีข้อมูลเป็นช่องว่าง ไม่ใช่ศูนย์
 * - เดือนที่ผ่านไปแล้วแต่ยังกรอกไม่ครบทุกเครื่องมีเครื่องหมาย "ไม่ครบ" และกล่องค่าบอกว่ากรอกแล้วกี่จากกี่เครื่อง —
 *   ผู้อ่านแยกได้ว่ายอดต่ำเพราะใช้น้อย หรือเพราะข้อมูลยังเข้าไม่ครบ (เดิมดูเหมือนยอดตกทั้งที่ยังกรอกไม่ครบ)
 * - กราฟค่าใช้จ่ายมีเส้นยอดตามใบแจ้งหนี้ (ค่าพิมพ์ + ค่าเช่าคงที่ + VAT) ให้เทียบใบแจ้งหนี้ของผู้ให้เช่าได้บนหน้าเดียว
 * - หัวการ์ดบอกค่าเดือนล่าสุดและเปลี่ยนไปเท่าไรจากเดือนก่อนหน้า แบบหน้ารายการหุ้น
 */
const props = defineProps({
  /** แบบจำลองมุมมองภาพรวม ตัวชี้วัดค่าใช้จ่าย / ยอดพิมพ์ (buildComparison) */
  cost: { type: Object, required: true },
  pages: { type: Object, required: true },
  /** เดือนบนแกน ตามลำดับ */
  months: { type: Array, default: () => [] },
  /** [{ month, required_devices, filled_devices }] จาก /dashboard/overview */
  coverage: { type: Array, default: () => [] },
  /** [{ month, invoice_total, rental, vat }] — ว่าง = ไม่วาดเส้นใบแจ้งหนี้ (เช่นเลือกหลายสัญญา) */
  invoice: { type: Array, default: () => [] },
  /** เดือนปัจจุบัน "YYYY-MM" — เดือนนี้ยังไม่จบ จึงไม่นับว่ากรอกไม่ครบ */
  currentMonth: { type: String, default: "" },
  loading: { type: Boolean, default: false },
  failed: { type: Boolean, default: false },
  scopeText: { type: String, default: "" },
});
const emit = defineEmits(["details"]);

// ระหว่างโหลดชุดใหม่ ให้กราฟเดิมค้างไว้พร้อมคำอธิบายเดิม — ห้ามติดหัวข้อใหม่บนตัวเลขเก่า
const snapshot = () => ({ cost: props.cost, pages: props.pages, months: props.months, coverage: props.coverage, invoice: props.invoice, caption: props.scopeText });
const settled = ref(snapshot());
watch(() => [props.cost, props.pages, props.months, props.coverage, props.invoice, props.loading, props.scopeText], () => {
  if (!props.loading && !props.failed) settled.value = snapshot();
}, { immediate: true });
const shown = computed(() => (props.loading ? settled.value : snapshot()));

const valuesOf = (model, metric) => {
  const byMonth = new Map(model.entries.map((entry) => [entry.key, entry.summary]));
  return shown.value.months.map((month) => {
    const summary = byMonth.get(month);
    if (!summary?.readings) return null;
    return metric === "cost" ? summary.cost : summary.rawPages;
  });
};

/** เดือนที่ผ่านไปแล้วแต่กรอกไม่ครบทุกเครื่องที่ต้องกรอก */
const incomplete = computed(() => {
  const byMonth = new Map(shown.value.coverage.map((m) => [m.month, m]));
  const marks = [];
  const notes = {};
  shown.value.months.forEach((month, index) => {
    const m = byMonth.get(month);
    if (!m || !m.required_devices || m.filled_devices >= m.required_devices) return;
    if (props.currentMonth && month >= props.currentMonth) return;
    marks.push({ index });
    notes[index] = t("กรอกแล้ว {0} จาก {1} เครื่อง — ยอดของเดือนนี้ยังไม่ครบ", [formatCount(m.filled_devices), formatCount(m.required_devices)]);
  });
  return { marks, notes };
});

function headline(values, format) {
  const filled = values.map((value, index) => ({ value, index })).filter((point) => point.value !== null);
  const last = filled.at(-1);
  if (!last) return null;
  const previous = filled.at(-2);
  const change = previous && previous.value ? (last.value - previous.value) / previous.value : null;
  return {
    label: formatMonth(shown.value.months[last.index]),
    value: format(last.value),
    change,
    previousLabel: previous ? formatMonth(shown.value.months[previous.index]) : "",
    incomplete: incomplete.value.notes[last.index] !== undefined,
  };
}

const costValues = computed(() => valuesOf(shown.value.cost, "cost"));
const pagesValues = computed(() => valuesOf(shown.value.pages, "rawPages"));
const invoiceValues = computed(() => {
  if (!shown.value.invoice.length) return null;
  const byMonth = new Map(shown.value.invoice.map((row) => [row.month, row]));
  // เดือนที่ยังไม่จบและยังไม่มียอดพิมพ์มีแค่ค่าเช่า — ถ้าวาดไว้ ป้ายค่าล่าสุดจะเป็นค่าเช่าเดือนเดียวที่ดูเหมือนยอดตก
  const values = shown.value.months.map((month) => {
    const row = byMonth.get(month);
    if (!row) return null;
    if (props.currentMonth && month >= props.currentMonth && !row.print_cost) return null;
    return row.invoice_total;
  });
  return values.some((value) => value) ? values : null;
});

const CARDS = computed(() => [
  {
    key: "cost",
    title: t("ค่าใช้จ่ายรายเดือน"),
    unit: t("บาท"),
    format: formatBahtValue,
    headline: headline(costValues.value, formatBahtValue),
    series: [
      { key: "cost", label: t("ค่าพิมพ์ (หลังหัก 2%)"), values: costValues.value, slot: 1, area: true },
      ...(invoiceValues.value ? [{ key: "invoice", label: t("ตามใบแจ้งหนี้ (รวมค่าเช่า + VAT)"), values: invoiceValues.value, slot: 3 }] : []),
    ],
  },
  {
    key: "pages",
    title: t("ยอดพิมพ์รายเดือน"),
    unit: t("หน้า"),
    format: formatCount,
    headline: headline(pagesValues.value, formatCount),
    series: [{ key: "pages", label: t("ยอดพิมพ์"), values: pagesValues.value, slot: 2, area: true }],
  },
]);

const monthsWithData = (values) => values.filter((value) => value !== null).length;

function select(model, { index }) {
  if (props.loading) return;
  const entry = model.entries.find((item) => item.key === shown.value.months[index]);
  if (entry?.summary.readings) emit("details", entry);
}
</script>

<template>
  <section class="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4" role="region" :aria-label="t('แนวโน้มรายเดือน')" :aria-busy="loading">
    <UiCard v-for="card in CARDS" :key="card.key" :title="card.title" :description="shown.caption" :data-testid="`overview-trend-${card.key}`">
      <p v-if="card.headline" class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 -mt-1 mb-3" data-testid="trend-headline">
        <span class="text-2xl font-semibold text-ink numeral">{{ card.headline.value }}</span>
        <span class="text-sm text-ink-mute">{{ card.unit }} · {{ card.headline.label }}</span>
        <span
          v-if="card.headline.change !== null && Number.isFinite(card.headline.change)"
          class="text-sm font-medium numeral"
          :class="card.headline.change > 0 ? 'text-warn-ink' : 'text-ok-ink'"
        >
          {{ card.headline.change > 0 ? "▲" : "▼" }} {{ Math.abs(card.headline.change * 100).toFixed(1) }}%
          <span class="font-normal text-ink-mute">{{ t("จาก{0}", [card.headline.previousLabel]) }}</span>
        </span>
        <span v-if="card.headline.incomplete" class="text-xs text-warn-ink">{{ t("เดือนนี้ยังกรอกไม่ครบ") }}</span>
      </p>
      <UiSkeleton v-if="loading && !monthsWithData(card.series[0].values)" height="16rem" />
      <UiEmpty v-else-if="failed" :title="t('โหลดข้อมูลไม่สำเร็จ')" compact />
      <UiEmpty v-else-if="!monthsWithData(card.series[0].values)" compact
        :title="t('ยังไม่มีการพิมพ์ในขอบเขตที่เลือก')"
        :description="t('เปลี่ยนช่วงเวลาหรือสัญญา แล้วลองใหม่')" />
      <UiStockChart v-else
        :domain="shown.months"
        :axis-label="(month) => formatMonth(month, { shortYear: true })"
        :point-label="(month) => formatMonth(month, { long: true })"
        :series="card.series"
        :markers="card.key === 'cost' || card.key === 'pages' ? incomplete.marks : []"
        :notes="incomplete.notes"
        :format-value="card.format"
        :format-axis="formatCompact"
        :unit="card.unit"
        :category-label="t('เดือน')"
        height="16rem"
        selectable
        :loading="loading"
        @select="(event) => select(card.key === 'cost' ? shown.cost : shown.pages, event)"
      />
      <template #footer>
        <div class="flex flex-wrap justify-between gap-2 text-xs text-ink-mute">
          <span>
            {{ t("กดจุดบนกราฟเพื่อดูรายเครื่องของเดือนนั้น") }}
            <template v-if="incomplete.marks.length"> · <span class="text-warn-ink">●</span> {{ t("เดือนที่ยังกรอกไม่ครบ") }}</template>
          </span>
          <span>{{ t("แสดง {0} เดือนที่มีข้อมูล", [formatCount(monthsWithData(card.series[0].values))]) }}</span>
        </div>
      </template>
    </UiCard>
  </section>
</template>
