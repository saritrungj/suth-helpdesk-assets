<script setup>
import { computed, ref, watch } from "vue";
import { t } from "../lib/locale";
import { formatBahtValue, formatCompact, formatCount } from "../lib/format";
import { UiAlert, UiButton, UiCard, UiChart, UiCombobox, UiEmpty, UiField, UiFilterBar, UiSegmented, UiSkeleton } from "../ui";
import { MAX_ITEMS, MAX_YEARS, comparisonChart, deviceSpread, dimensionLabel, stableSlots } from "./comparison";
import { comparisonTitle } from "./comparison-export";
import { modeMemory } from "../lib/session-memory";

/**
 * PrintComparison — พื้นที่เปรียบเทียบของหน้าภาพรวมการพิมพ์
 *
 * ตัวเลือกเรียงตามลำดับที่คนคิด: แยกข้อมูลตาม → รายการที่เลือก → ข้อมูลที่แสดง
 * (ช่วงเวลาอยู่ที่แถบตัวกรองบนสุดของหน้า เพราะเป็นขอบเขตของตัวเลขทั้งหน้า)
 *
 * ผู้ใช้หยิบหน่วยงานหรือสัญญามาเทียบเอง หากยังไม่เลือก Dashboard แสดงยอดรวมรายเดือน
 * โดยไม่เลือกอันดับให้แทนผู้ใช้ ส่วนตารางด้านล่างแสดงทุกรายการในขอบเขต
 *
 * ตัวเลขทั้งหมดมาจาก `model` ตัวเดียวกับที่ตารางรายละเอียดและไฟล์ Excel ใช้
 */
const props = defineProps({
  model: { type: Object, required: true },
  options: { type: Array, default: () => [] },
  /** ปีงบที่เลือกมาเทียบได้ (เทียบข้ามปีงบ) */
  yearOptions: { type: Array, default: () => [] },
  /** ตัวเลือกของขอบเขตเดียวในการเทียบข้ามปีงบ เช่น ทุกฝ่ายเมื่อขอบเขตคือฝ่าย */
  scopeOptions: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  failed: { type: Boolean, default: false },
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
/** ขอบเขตของการเทียบข้ามปีงบ — ไม่มีสัญญา เพราะสัญญาผูกกับปีงบเดียว */
const YEAR_SCOPE_OPTIONS = [
  { value: "overall", label: t("ทั้งองค์กร") },
  { value: "division", label: t("ฝ่าย") },
  { value: "department", label: t("แผนก") },
  { value: "building", label: t("อาคาร") },
  { value: "device", label: t("เครื่อง") },
];
const METRIC_OPTIONS = [
  { value: "cost", label: t("ค่าใช้จ่าย") },
  { value: "rawPages", label: t("ยอดพิมพ์จริง") },
];

const update = (patch) => { state.value = { ...state.value, ...patch }; };
const bind = (key) => computed({ get: () => state.value[key], set: (value) => update({ [key]: value }) });
/**
 * รายการที่เลือกเป็นของมิติเดิม (รหัสฝ่ายไม่ใช่รหัสแผนก) แต่ละมิติจึงจำชุดของตัวเองไว้ (#115)
 * เลือกฝ่าย A, B แล้วสลับไปดูสัญญา กลับมาที่ฝ่ายต้องยังเห็น A, B ไม่ใช่เริ่มเลือกใหม่
 */
const memory = modeMemory("dashboard-dimension");
const dimension = computed({
  get: () => state.value.by,
  set: (value) => {
    const { items, years, scope, scopeItem } = state.value;
    memory.save(state.value.by, { items, years, scope, scopeItem });
    const saved = memory.restore(value) ?? {};
    update({ by: value, items: saved.items ?? [], years: saved.years ?? [], scope: saved.scope ?? "overall", scopeItem: saved.scopeItem ?? "" });
  },
});
const metric = bind("metric");

/** ปีงบที่เทียบ — เกินสามปีเก็บสามปีหลังสุดแล้วบอกเหตุผล ไม่ตัดทิ้งเงียบๆ */
const yearsTrimmed = ref(false);
const years = computed({
  get: () => state.value.years ?? [],
  set: (value) => {
    yearsTrimmed.value = value.length > MAX_YEARS;
    update({ years: [...value].sort().slice(-MAX_YEARS) });
  },
});
// ขอบเขตเปลี่ยนแล้วรายการเดิมใช้ต่อไม่ได้ (รหัสฝ่ายไม่ใช่รหัสอาคาร)
const yearScope = computed({ get: () => state.value.scope ?? "overall", set: (value) => update({ scope: value, scopeItem: "" }) });
const scopeItem = bind("scopeItem");
const scopeNoun = computed(() => dimensionLabel(yearScope.value));

/** ปุ่ม "ล้างตัวเลือก" เป็นทางเดียวที่กลับไปค่าเริ่มต้น รวมทั้งลืมรายการที่แต่ละมิติจำไว้ (#115) */
const customized = computed(() => state.value.by !== "overall" || state.value.metric !== "cost");
function resetAll() {
  memory.clear();
  trimmed.value = false;
  yearsTrimmed.value = false;
  update({ by: "overall", items: [], metric: "cost", years: [], scope: "overall", scopeItem: "" });
}

/** เลือกเกินจำนวนสีของกราฟไม่ได้ — เก็บ 8 รายการแรกแล้วบอกเหตุผล ไม่ตัดทิ้งเงียบๆ */
const trimmed = ref(false);
const items = computed({
  get: () => state.value.items,
  set: (value) => {
    trimmed.value = value.length > MAX_ITEMS;
    update({ items: value.slice(0, MAX_ITEMS) });
  },
});
watch(() => state.value.by, () => { trimmed.value = false; yearsTrimmed.value = false; });

const noun = computed(() => dimensionLabel(state.value.by));
const settledModel = ref(props.model);
const settledCaption = ref(props.scopeText);
watch([() => props.model, () => props.loading, () => props.scopeText], ([next, isLoading, caption]) => {
  if (!isLoading && !props.failed) {
    settledModel.value = next;
    settledCaption.value = caption;
  }
}, { immediate: true });
const displayModel = computed(() => (props.loading ? settledModel.value : props.model));
const displayCaption = computed(() => props.loading ? settledCaption.value : props.scopeText);
const title = computed(() => comparisonTitle(displayModel.value));
const chart = computed(() => comparisonChart(displayModel.value));

// สีผูกกับรายการ ไม่ใช่ลำดับ — เอารายการหนึ่งออกแล้วเส้นที่เหลือคงสีเดิม
const slots = ref(new Map());
watch(() => displayModel.value.entries.map((entry) => entry.key), (keys) => { slots.value = stableSlots(slots.value, keys); }, { immediate: true });
const series = computed(() => chart.value.series.map((item) => ({
  ...item,
  slot: displayModel.value.view === "select" && chart.value.kind === "line" ? slots.value.get(item.key) : 1,
})));

const isCost = computed(() => displayModel.value.metric === "cost");
const formatValue = (value) => (isCost.value ? formatBahtValue(value) : formatCount(value));
const unit = computed(() => (isCost.value ? t("บาท") : t("หน้า")));
const spread = computed(() => (displayModel.value.view === "overall" ? null : deviceSpread(displayModel.value.entries.map((entry) => entry.summary))));
const unpriced = computed(() => (isCost.value ? displayModel.value.scope.unpriced : 0));
const hasChart = computed(() => !displayModel.value.blocked && series.value.some((item) => item.data.some((value) => value !== null)));

function select({ index }) {
  if (props.loading) return;
  if (props.model.view === "select" && chart.value.kind === "line") return;
  const entry = props.model.entries[index];
  if (entry) emit("details", entry);
}
</script>

<template>
  <section class="mb-4" role="region" :aria-label="t('พื้นที่เปรียบเทียบ')" :aria-busy="loading">
    <UiFilterBar :collapsible="false">
      <template #primary>
        <UiField :label="t('แยกข้อมูลตาม')">
          <UiSegmented v-model="dimension" :options="DIMENSION_OPTIONS" size="sm" />
        </UiField>
        <template v-if="state.by === 'fiscalYear'">
          <UiField :label="t('ปีงบที่เลือก')" class="w-full sm:w-64">
            <UiCombobox v-model="years" :options="yearOptions" multiple :placeholder="t('ปีงบนี้กับปีก่อน')" :search-placeholder="t('พิมพ์เพื่อค้นหา…')" />
          </UiField>
          <UiField :label="t('ขอบเขต')">
            <UiSegmented v-model="yearScope" :options="YEAR_SCOPE_OPTIONS" size="sm" />
          </UiField>
          <UiField v-if="yearScope !== 'overall'" :label="t('{0}ที่จะดู', [scopeNoun])" class="w-full sm:w-72">
            <UiCombobox v-model="scopeItem" :options="scopeOptions" :placeholder="t('เลือก{0}', [scopeNoun])" :search-placeholder="t('พิมพ์เพื่อค้นหา…')" />
          </UiField>
        </template>
        <UiField v-else-if="state.by !== 'overall'" :label="t('{0}ที่เลือก', [noun])" class="w-full sm:w-80">
          <UiCombobox v-model="items" :options="options" multiple :placeholder="t('ไม่เลือก = ดูยอดรวม')" :search-placeholder="t('พิมพ์เพื่อค้นหา…')" />
        </UiField>
        <UiField :label="t('ข้อมูลที่แสดง')">
          <UiSegmented v-model="metric" :options="METRIC_OPTIONS" size="sm" />
        </UiField>
        <UiButton v-if="customized" size="sm" variant="danger-ghost" class="self-end" @click="resetAll">{{ t("ล้างตัวเลือก") }}</UiButton>
      </template>
      <template #actions><slot name="actions" /></template>
    </UiFilterBar>
    <UiAlert v-if="yearsTrimmed" tone="info" class="mb-3">
      {{ t("เทียบได้ครั้งละไม่เกิน {0} ปีงบ เพื่อให้เส้นบนกราฟยังอ่านออก — เก็บ {0} ปีหลังสุดไว้", [MAX_YEARS]) }}
    </UiAlert>
    <UiAlert v-if="trimmed" tone="info" class="mb-3">
      {{ t("เลือกได้สูงสุด {0} รายการ เพราะกราฟมี {0} สีที่แยกกันออก — เก็บ {0} รายการแรกไว้ แนะนำ 2–{1} รายการเพื่อให้อ่านง่าย", [MAX_ITEMS, SUGGESTED_ITEMS]) }}
    </UiAlert>

    <UiCard :title="title" :description="displayCaption" :aria-busy="loading">
    <UiSkeleton v-if="loading && !hasChart" height="18rem" />
    <UiEmpty v-else-if="failed" :title="t('โหลดข้อมูลไม่สำเร็จ')" compact />
    <UiEmpty v-else-if="displayModel.blocked === 'no-data' || !hasChart" compact
      :title="displayModel.view === 'select' && !displayModel.autoPicked ? t('{0}ที่เลือกยังไม่มียอดพิมพ์ในช่วงนี้', [noun]) : t('ยังไม่มียอดพิมพ์ในช่วงที่เลือก')" />
    <UiChart v-else :kind="chart.kind" :horizontal="chart.horizontal" :labels="chart.labels" :series="series"
      :height="chart.horizontal ? `${Math.max(12, chart.labels.length * 2.6 + 4)}rem` : '18rem'"
      :format-value="formatValue" :format-axis="formatCompact" :unit="unit" :category-label="chart.categoryLabel"
      :selectable="!(displayModel.view === 'select' && chart.kind === 'line')" :loading="loading" @select="select" />

    <ul v-if="!loading && !failed && !displayModel.blocked && (displayModel.autoPicked || unpriced || spread)" class="mt-3 flex flex-col gap-1 text-sm text-ink-soft list-none">
      <li v-if="displayModel.autoPicked">{{ t("ระบบเลือก {0} รายการที่ยอดสูงสุดให้ — เลือกเองได้จากช่อง “{1}ที่จะเทียบ” ส่วนอันดับของทุกรายการอยู่ในไฟล์ Excel", [formatCount(displayModel.entries.length), noun]) }}</li>
      <li v-if="unpriced">{{ t("ยังยืนยันราคาไม่ได้ {0} รายการ · ยอดเงินเป็นเฉพาะส่วนที่ยืนยันแล้ว ชื่อที่มีป้าย “รอราคา” ยังไม่ครบ", [formatCount(unpriced)]) }}</li>
      <li v-if="spread">{{ t("จำนวนเครื่องที่มีข้อมูลต่างกัน ({0}–{1} เครื่อง) ยอดรวมจึงต่างกันได้ตามจำนวนเครื่อง ไม่ได้แปลว่าแต่ละเครื่องใช้งานต่างกัน", [formatCount(spread.min), formatCount(spread.max)]) }}</li>
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
