<script setup>
import { computed, ref, watch } from "vue";
import { t } from "../lib/locale";
import { formatBahtValue, formatCompact, formatCount } from "../lib/format";
import { UiAlert, UiButton, UiCard, UiChart, UiCombobox, UiEmpty, UiField, UiFilterBar, UiSegmented, UiSkeleton } from "../ui";
import { MAX_ITEMS, SUGGESTED_ITEMS, comparisonChart, deviceSpread, dimensionLabel, stableSlots } from "./comparison";
import { comparisonTitle } from "./comparison-export";

/**
 * PrintComparison — พื้นที่เปรียบเทียบของหน้าภาพรวมการพิมพ์
 *
 * ตัวเลือกเรียงตามลำดับที่คนคิด: เปรียบเทียบตาม → รายการที่จะเทียบ → ตัวชี้วัด
 * (ช่วงเวลาอยู่ที่แถบตัวกรองบนสุดของหน้า เพราะเป็นขอบเขตของตัวเลขทั้งหน้า)
 *
 * สองมุมมองอยู่ในการ์ดเดียวและสลับกัน ไม่วางกราฟซ้อนสองชุด
 *   เลือกรายการมาเทียบ  ผู้ใช้หยิบหน่วยงานหรือสัญญาเอง — ดูแนวโน้มรายเดือนเป็นเส้น
 *   อันดับมาก–น้อย      ระบบจัด 5 หรือ 10 อันดับ — แท่งแนวนอนเพราะชื่อหน่วยงานยาว
 *
 * ตัวเลขทั้งหมดมาจาก `model` ตัวเดียวกับที่ตารางรายละเอียดและไฟล์ Excel ใช้
 */
const props = defineProps({
  model: { type: Object, required: true },
  options: { type: Array, default: () => [] },
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
];
const VIEW_OPTIONS = [
  { value: "select", label: t("เลือกรายการมาเทียบ") },
  { value: "rank", label: t("อันดับมาก–น้อย") },
];
const METRIC_OPTIONS = [
  { value: "cost", label: t("ค่าใช้จ่าย") },
  { value: "rawPages", label: t("ยอดพิมพ์จริง") },
];
const DIRECTION_OPTIONS = [
  { value: "high", label: t("มากสุด") },
  { value: "low", label: t("น้อยสุด") },
];
const LIMIT_OPTIONS = [{ value: 5, label: "5" }, { value: 10, label: "10" }];

const update = (patch) => { state.value = { ...state.value, ...patch }; };
const bind = (key) => computed({ get: () => state.value[key], set: (value) => update({ [key]: value }) });
const dimension = computed({
  get: () => state.value.by,
  // รายการที่เลือกเป็นของมิติเดิม (รหัสฝ่ายไม่ใช่รหัสแผนก) — เปลี่ยนมิติแล้วเริ่มเลือกใหม่
  set: (value) => update({ by: value, items: [] }),
});
const view = bind("view");
const metric = bind("metric");
const direction = bind("direction");
const limit = bind("limit");

/** เลือกเกินจำนวนสีของกราฟไม่ได้ — เก็บ 8 รายการแรกแล้วบอกเหตุผล ไม่ตัดทิ้งเงียบๆ */
const trimmed = ref(false);
const items = computed({
  get: () => state.value.items,
  set: (value) => {
    trimmed.value = value.length > MAX_ITEMS;
    update({ items: value.slice(0, MAX_ITEMS) });
  },
});
watch(() => [state.value.by, state.value.view], () => { trimmed.value = false; });

const noun = computed(() => dimensionLabel(state.value.by));
const title = computed(() => comparisonTitle(props.model));
const chart = computed(() => comparisonChart(props.model));

// สีผูกกับรายการ ไม่ใช่ลำดับ — เอารายการหนึ่งออกแล้วเส้นที่เหลือคงสีเดิม
const slots = ref(new Map());
watch(() => props.model.entries.map((entry) => entry.key), (keys) => { slots.value = stableSlots(slots.value, keys); }, { immediate: true });
const series = computed(() => chart.value.series.map((item) => ({
  ...item,
  slot: props.model.view === "select" && chart.value.kind === "line"
    ? slots.value.get(item.key)
    : props.model.view === "rank" ? (props.model.direction === "low" ? 5 : 2) : 1,
})));

const isCost = computed(() => props.model.metric === "cost");
const formatValue = (value) => (isCost.value ? formatBahtValue(value) : formatCount(value));
const unit = computed(() => (isCost.value ? t("บาท") : t("หน้า")));
const spread = computed(() => (props.model.view === "overall" ? null : deviceSpread(props.model.entries.map((entry) => entry.summary))));
const unpriced = computed(() => (isCost.value ? props.model.scope.unpriced : 0));
const hasChart = computed(() => !props.model.blocked && series.value.some((item) => item.data.some((value) => value !== null)));

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
        <UiField :label="t('เปรียบเทียบตาม')">
          <UiSegmented v-model="dimension" :options="DIMENSION_OPTIONS" size="sm" />
        </UiField>
        <UiField v-if="state.by !== 'overall'" :label="t('มุมมอง')">
          <UiSegmented v-model="view" :options="VIEW_OPTIONS" size="sm" />
        </UiField>
        <UiField v-if="state.by !== 'overall' && state.view === 'select'" :label="t('{0}ที่จะเทียบ', [noun])" class="w-full sm:w-80">
          <UiCombobox v-model="items" :options="options" multiple :placeholder="t('เลือก{0} (แนะนำ 2–{1} รายการ)', [noun, SUGGESTED_ITEMS])" :search-placeholder="t('พิมพ์เพื่อค้นหา…')" />
        </UiField>
        <template v-if="state.by !== 'overall' && state.view === 'rank'">
          <UiField :label="t('ลำดับ')">
            <UiSegmented v-model="direction" :options="DIRECTION_OPTIONS" size="sm" />
          </UiField>
          <UiField :label="t('จำนวนอันดับ')">
            <UiSegmented v-model="limit" :options="LIMIT_OPTIONS" size="sm" />
          </UiField>
        </template>
        <UiField :label="t('ตัวชี้วัด')">
          <UiSegmented v-model="metric" :options="METRIC_OPTIONS" size="sm" />
        </UiField>
      </template>
      <template #actions><slot name="actions" /></template>
    </UiFilterBar>
    <UiAlert v-if="trimmed" tone="info" class="mb-3">
      {{ t("เลือกได้สูงสุด {0} รายการ เพราะกราฟมี {0} สีที่แยกกันออก — เก็บ {0} รายการแรกไว้ แนะนำ 2–{1} รายการเพื่อให้อ่านง่าย", [MAX_ITEMS, SUGGESTED_ITEMS]) }}
    </UiAlert>

    <UiCard :title="title" :description="scopeText" :aria-busy="loading">
    <UiSkeleton v-if="loading" height="18rem" />
    <UiEmpty v-else-if="failed" :title="t('โหลดข้อมูลไม่สำเร็จ')" compact />
    <UiEmpty v-else-if="model.blocked === 'no-items'" compact
      :title="t('เลือก{0}ที่จะนำมาเทียบ', [noun])"
      :description="t('แนะนำ 2–{0} รายการ แต่ละรายการเป็นหนึ่งเส้นบนกราฟ หรือสลับไปดูอันดับมาก–น้อยที่ระบบจัดให้', [SUGGESTED_ITEMS])" />
    <UiAlert v-else-if="model.blocked === 'unpriced'" tone="warn">
      {{ t("ยังจัดอันดับค่าใช้จ่ายไม่ได้ เพราะช่วงนี้ยังยืนยันราคาไม่ครบ {0} รายการ — อันดับจากยอดเงินบางส่วนจะชี้ผิดหน่วยงาน", [formatCount(model.total.unpriced)]) }}
      <template #actions>
        <UiButton size="sm" variant="secondary" @click="update({ metric: 'rawPages' })">{{ t("จัดอันดับตามยอดพิมพ์จริง") }}</UiButton>
      </template>
    </UiAlert>
    <UiEmpty v-else-if="model.blocked === 'no-data' || !hasChart" compact
      :title="model.view === 'select' ? t('{0}ที่เลือกยังไม่มียอดพิมพ์ในช่วงนี้', [noun]) : t('ยังไม่มียอดพิมพ์ในช่วงที่เลือก')" />
    <UiChart v-else :kind="chart.kind" :horizontal="chart.horizontal" :labels="chart.labels" :series="series"
      :height="chart.horizontal ? `${Math.max(12, chart.labels.length * 2.6 + 4)}rem` : '18rem'"
      :format-value="formatValue" :format-axis="formatCompact" :unit="unit" :category-label="chart.categoryLabel"
      :selectable="!(model.view === 'select' && chart.kind === 'line')" :loading="loading" @select="select" />

    <ul v-if="!loading && !failed && !model.blocked && (model.view === 'rank' || unpriced || spread)" class="mt-3 flex flex-col gap-1 text-sm text-ink-soft list-none">
      <li v-if="model.view === 'rank'">{{ t("อันดับใช้เพื่อหาจุดที่ควรตรวจสอบ ไม่ได้หมายความว่ารายการที่มียอดสูงสิ้นเปลือง ให้ดูจำนวนเครื่องและลักษณะงานประกอบ") }}</li>
      <li v-if="unpriced">{{ t("ยังยืนยันราคาไม่ได้ {0} รายการ · ยอดเงินเป็นเฉพาะส่วนที่ยืนยันแล้ว ชื่อที่มีป้าย “รอราคา” ยังไม่ครบ", [formatCount(unpriced)]) }}</li>
      <li v-if="spread">{{ t("จำนวนเครื่องที่มีข้อมูลต่างกัน ({0}–{1} เครื่อง) ยอดรวมจึงต่างกันได้ตามจำนวนเครื่อง ไม่ได้แปลว่าแต่ละเครื่องใช้งานต่างกัน", [formatCount(spread.min), formatCount(spread.max)]) }}</li>
    </ul>

    <template #footer>
      <div class="flex flex-wrap justify-between gap-2 text-xs text-ink-mute">
        <span v-if="model.view === 'rank' && model.blocked">{{ t("ข้อมูลรายละเอียดยังส่งออกได้จากปุ่ม “ข้อมูลดิบอย่างเดียว”") }}</span>
        <span v-else-if="model.view === 'rank'">{{ t("จัดอันดับจาก {0} {1}ที่มีข้อมูลในช่วงนี้ · กดแท่งเพื่อดูรายละเอียด", [formatCount(model.rankedFrom ?? 0), noun]) }}</span>
        <span v-else-if="model.view === 'overall'">{{ t("กดแท่งกราฟหรือชื่อเดือนในตารางเพื่อเจาะรายละเอียด") }}</span>
        <span v-else>{{ t("ดูรายละเอียดของแต่ละรายการได้จากตารางด้านล่าง") }}</span>
        <span>{{ t("แสดง {0} เดือนที่มีข้อมูล", [formatCount(model.months.length)]) }}</span>
      </div>
    </template>
    </UiCard>
  </section>
</template>
