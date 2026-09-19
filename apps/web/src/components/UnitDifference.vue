<script setup>
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Info, Minus, TrendingDown, TrendingUp } from "lucide-vue-next";
import { useDepartments, useDivisions, useMonthlyKpi } from "../api/queries";
import { activeFiscalYear, activeFiscalYearRange, fiscalYearMonths } from "../store/fiscalYear";
import { t } from "../lib/locale";
import { yearLabel } from "../lib/locale-format";
import { formatBahtValue, formatCompact, formatCount, formatNetPages, formatSigned, formatSignedPercent } from "../lib/format";
import { errorMessage } from "../lib/api-error";
import PeriodPicker from "./PeriodPicker.vue";
import ExportExcelButton from "./ExportExcelButton.vue";
import {
  UiAlert, UiBadge, UiButton, UiCard, UiChart, UiCombobox, UiDataTable, UiEmpty, UiField, UiFilterBar, UiSegmented, UiSelect, UiSkeleton,
} from "../ui";
import {
  MAX_ITEMS, SUGGESTED_ITEMS, buildDifference, dataStatus, deviceSpread, differenceChart, differenceFromQuery, differenceNote,
  differenceToQuery, dimensionLabel, itemOptions, metricLabel, metricUnit, metricValue, periodLabel, referenceMonths, statusLabel, summarize,
} from "./comparison";
import { conditionsSheet, detailSheet, differenceSheet, exportFilename, monthsSlug, priceStatusLine, saveWorkbook, standardNotes } from "./comparison-export";

/**
 * UnitDifference — หน้าเปรียบเทียบ → ฝ่าย / แผนก: ตรวจ "ความแตกต่าง" ให้ละเอียด
 *
 * หน้าภาพรวมใช้ดูและเทียบเร็วๆ ส่วนหน้านี้ตอบว่าต่างกันเท่าไร เทียบกับอะไร มีสองวิธี
 * ที่แยกกันชัดและไม่เปลี่ยนสองมิติพร้อมกันโดยผู้ใช้ไม่รู้ตัว
 *
 *   หน่วยงานในช่วงเดียวกัน  ช่วงเวลาเดียว หลายหน่วยงาน — ฐานคือหน่วยงานที่ผู้ใช้เลือก
 *   ช่วงเวลา A กับ B        หน่วยงานเดิม สองช่วง — ฐานคือช่วงฐาน (ช่วงเดียวกันของปีงบก่อน
 *                           หรือช่วงก่อนหน้าที่ยาวเท่ากัน)
 *
 * ตรรกะ (รวมยอด ส่วนต่าง ฐานศูนย์ ราคาไม่ครบ) และไฟล์ Excel ใช้ชุดเดียวกับหน้าภาพรวม
 */
const props = defineProps({
  types: { type: Array, required: true },
});
const type = defineModel("type", { type: String, required: true });

const route = useRoute();
const router = useRouter();
const state = ref(differenceFromQuery(route.query));
const fyMonths = computed(() => (activeFiscalYearRange.value ? fiscalYearMonths(activeFiscalYearRange.value) : []));
const normalizeMonths = (value) => {
  const valid = [...new Set(String(value || "").split(",").map((m) => m.trim())
    .filter((m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m)))].sort();
  if (!fyMonths.value.length) return valid;
  const inYear = new Set(fyMonths.value);
  return valid.filter((month) => inYear.has(month));
};
const monthsFromQuery = () => normalizeMonths(route.query.months);
const selectedMonths = ref(monthsFromQuery());

let syncing = false;
watch([state, selectedMonths], ([value, months]) => {
  if (syncing) return;
  router.replace({ query: { ...route.query, ...differenceToQuery(value), months: months.length ? months.join(",") : undefined } });
}, { deep: true, flush: "sync" });
watch(() => route.query, (query) => {
  const next = differenceFromQuery(query);
  const months = monthsFromQuery();
  if (JSON.stringify(next) !== JSON.stringify(state.value) || months.join(",") !== selectedMonths.value.join(",")) {
    syncing = true;
    state.value = next;
    selectedMonths.value = months;
    syncing = false;
  }
  normalizeDifferenceQuery(query, next, months);
});
const DIFFERENCE_QUERY_KEYS = ["level", "basis", "ref", "items", "base", "measure", "months"];
const queryText = (value) => String(Array.isArray(value) ? value[0] ?? "" : value ?? "");
function normalizeDifferenceQuery(query, value, months = selectedMonths.value) {
  const normalized = { ...differenceToQuery(value), months: months.length ? months.join(",") : undefined };
  if (DIFFERENCE_QUERY_KEYS.some((key) => queryText(query[key]) !== queryText(normalized[key]))) {
    router.replace({ query: { ...query, ...normalized } });
  }
}
normalizeDifferenceQuery(route.query, state.value, selectedMonths.value);
watch(activeFiscalYear, (year, previous) => {
  if (previous && year?.id !== previous.id) {
    selectedMonths.value = [];
    return;
  }
  const next = normalizeMonths(selectedMonths.value.join(","));
  if (next.join(",") !== selectedMonths.value.join(",")) selectedMonths.value = next;
}, { immediate: true });

const update = (patch) => { state.value = { ...state.value, ...patch }; };
const level = computed({ get: () => state.value.level, set: (value) => update({ level: value, items: [], base: "" }) });
const basis = computed({ get: () => state.value.basis, set: (value) => update({ basis: value }) });
const reference = computed({ get: () => state.value.reference, set: (value) => update({ reference: value }) });
const metric = computed({ get: () => state.value.metric, set: (value) => update({ metric: value }) });
const trimmed = ref(false);
const items = computed({
  get: () => state.value.items,
  set: (value) => {
    trimmed.value = value.length > MAX_ITEMS;
    const next = value.slice(0, MAX_ITEMS);
    update({ items: next, base: next.includes(state.value.base) ? state.value.base : next[0] ?? "" });
  },
});
const base = computed({ get: () => state.value.base || state.value.items[0] || "", set: (value) => update({ base: String(value) }) });

/* --------------------------------------------------------------------------
   ข้อมูล
   -------------------------------------------------------------------------- */
const currentMonths = computed(() => {
  const inYear = selectedMonths.value.filter((month) => fyMonths.value.includes(month));
  return inYear.length ? inYear : fyMonths.value;
});
const baseMonths = computed(() => (state.value.basis === "periods" ? referenceMonths(currentMonths.value, state.value.reference, activeFiscalYear.value) : []));

// ปีงบทั้งปีดึงครั้งเดียว ใช้ทั้งตัวเลือกเดือนและช่วงที่ดู — เปลี่ยนช่วงเวลาไม่ต้องยิงใหม่
const yearQuery = useMonthlyKpi(computed(() => ({ month: fyMonths.value.join(",") || undefined })));
const baseQuery = useMonthlyKpi(computed(() => ({ month: baseMonths.value.join(",") || undefined })), {
  enabled: computed(() => state.value.basis === "periods" && baseMonths.value.length > 0),
});
const divisions = useDivisions();
const departments = useDepartments();

const waiting = (query) => query.isPending.value || query.isPlaceholderData.value;
const loading = computed(() => waiting(yearQuery) || (state.value.basis === "periods" && baseMonths.value.length > 0 && waiting(baseQuery)));
const failed = computed(() => yearQuery.isError.value || (state.value.basis === "periods" && baseQuery.isError.value));
const ready = computed(() => !loading.value && !failed.value);
const yearRows = computed(() => (waiting(yearQuery) || yearQuery.isError.value ? [] : yearQuery.data.value ?? []));
const monthsWithData = computed(() => [...new Set(yearRows.value.map((row) => row.month))].sort());
const currentRows = computed(() => yearRows.value.filter((row) => currentMonths.value.includes(row.month)));
const baseRows = computed(() => (state.value.basis !== "periods" || waiting(baseQuery) || baseQuery.isError.value ? []
  : (baseQuery.data.value ?? []).filter((row) => baseMonths.value.includes(row.month))));

const options = computed(() => itemOptions(state.value.level, { divisions: divisions.data.value ?? [], departments: departments.data.value ?? [] }, [...currentRows.value, ...baseRows.value]));
const model = computed(() => buildDifference({
  dimension: state.value.level,
  basis: state.value.basis,
  items: state.value.items,
  baseKey: base.value,
  metric: state.value.metric,
  current: { months: currentMonths.value, rows: currentRows.value },
  reference: { months: baseMonths.value, rows: baseRows.value },
  options: options.value,
}));

/* --------------------------------------------------------------------------
   ข้อความ
   -------------------------------------------------------------------------- */
const noun = computed(() => dimensionLabel(state.value.level));
const unit = computed(() => metricUnit(state.value.metric));
const isCost = computed(() => state.value.metric === "cost");
const incomplete = computed(() => isCost.value && (model.value.scope.unpriced > 0 || (model.value.referenceScope?.unpriced ?? 0) > 0));
const metricText = computed(() => metricLabel(state.value.metric, { incomplete: incomplete.value }));
const currentPeriod = computed(() => (selectedMonths.value.length ? periodLabel(currentMonths.value) : t("ทั้งปีงบ ({0})", [periodLabel(currentMonths.value)])));
const referenceModeLabel = (mode) => (mode === "previous-span" ? t("ช่วงก่อนหน้าที่ยาวเท่ากัน") : t("ช่วงเดียวกันของปีงบก่อน"));
const currentLabel = computed(() => (state.value.basis === "periods" ? t("ช่วงที่ดู {0}", [periodLabel(currentMonths.value)]) : periodLabel(currentMonths.value)));
const referenceLabel = computed(() => t("ช่วงฐาน {0}", [periodLabel(baseMonths.value)]));
const referenceOptions = computed(() => ["previous-year", "previous-span"].map((mode) => ({
  value: mode,
  label: `${referenceModeLabel(mode)} (${periodLabel(referenceMonths(currentMonths.value, mode, activeFiscalYear.value))})`,
})));
const baseOptions = computed(() => model.value.entries.map((entry) => ({ value: entry.key, label: entry.displayLabel })));

/** "เทียบกับอะไร" — ต้องอ่านได้ทุกครั้งโดยไม่ต้องเดาจากตัวเลือก */
const statement = computed(() => {
  if (state.value.basis === "periods") {
    return t("เทียบ{0}เดียวกันระหว่างสองช่วง: ช่วงที่ดู {1} เทียบกับช่วงฐาน {2} ({3})", [noun.value, periodLabel(currentMonths.value), periodLabel(baseMonths.value), referenceModeLabel(state.value.reference)]);
  }
  return model.value.baseEntry
    ? t("เทียบทุกรายการกับ {0} (ฐาน) ในช่วง {1}", [model.value.baseEntry.displayLabel, currentPeriod.value])
    : t("เลือก{0}อย่างน้อยสองรายการ แล้วเลือกหนึ่งรายการเป็นฐาน", [noun.value]);
});
const formula = t("ส่วนต่าง = ค่าของรายการ − ค่าฐาน · ส่วนต่าง % = ส่วนต่าง ÷ ค่าฐาน × 100 — ไม่คิดเปอร์เซ็นต์เมื่อฐานเป็นศูนย์ และไม่คิดส่วนต่างค่าใช้จ่ายเมื่อราคายังยืนยันไม่ครบ");
const title = computed(() => (state.value.basis === "periods"
  ? t("{0}ของ{1}ที่เลือก: ช่วงฐานกับช่วงที่ดู", [metricText.value, noun.value])
  : t("{0}ของ{1}ที่เลือก เทียบกับฐาน", [metricText.value, noun.value])));

const chart = computed(() => differenceChart(model.value, { currentLabel: currentLabel.value, referenceLabel: referenceLabel.value }));
const hasChart = computed(() => chart.value.series.some((series) => series.data.some((value) => value !== null)));
const valueText = (summary) => {
  const value = metricValue(summary, display.value.state.metric);
  if (value === null) return summary?.readings ? t("ยังไม่รู้ยอด") : t("ไม่มีข้อมูล");
  return display.value.isCost ? formatBahtValue(value) : formatCount(value);
};
const netText = (summary) => (summary?.readings ? formatNetPages(summary.netPages) : t("ไม่มีข้อมูล"));
const diffText = (result) => (result?.diff === null || result?.diff === undefined ? "—" : formatSigned(result.diff, display.value.isCost ? formatBahtValue : formatCount));
const ratioText = (result) => (result?.ratio === null || result?.ratio === undefined ? "—" : formatSignedPercent(result.ratio));
const trendIcon = (result) => (!result?.diff ? Minus : result.diff > 0 ? TrendingUp : TrendingDown);

const spread = computed(() => {
  if (state.value.basis === "periods") {
    const changed = model.value.entries.filter((entry) => entry.reference.readings && entry.summary.readings && entry.reference.devices !== entry.summary.devices);
    return changed.length ? { periods: changed.map((entry) => `${entry.displayLabel} ${formatCount(entry.reference.devices)} → ${formatCount(entry.summary.devices)}`) } : null;
  }
  return deviceSpread(model.value.entries.map((entry) => entry.summary));
});
const unpricedCount = computed(() => (isCost.value ? model.value.scope.unpriced + (model.value.referenceScope?.unpriced ?? 0) : 0));

const columns = computed(() => {
  const label = { key: "label", label: noun.value, value: (row) => row.displayLabel };
  const status = { key: "note", label: t("หมายเหตุ"), sortable: false, value: (row) => differenceNote(row.difference, { isBase: row.isBase }) };
  const diff = [
    { key: "diff", label: t("ส่วนต่าง ({0})", [unit.value]), align: "right", sortable: false, value: (row) => row.difference?.diff ?? null },
    { key: "ratio", label: t("ส่วนต่าง (%)"), align: "right", sortable: false, value: (row) => row.difference?.ratio ?? null },
  ];
  if (state.value.basis === "periods") {
    return [
      label,
      { key: "reference", label: `${t("ช่วงฐาน")} (${unit.value})`, align: "right", sortable: false, value: (row) => metricValue(row.reference, state.value.metric) },
      ...(isCost.value ? [] : [{ key: "referenceNet", label: `${t("สุทธิหลังหัก 2%")} — ${t("ช่วงฐาน")} (${t("หน้า")})`, align: "right", sortable: false, value: (row) => row.reference.netPages }]),
      { key: "current", label: `${t("ช่วงที่ดู")} (${unit.value})`, align: "right", sortable: false, value: (row) => metricValue(row.summary, state.value.metric) },
      ...(isCost.value ? [] : [{ key: "currentNet", label: `${t("สุทธิหลังหัก 2%")} — ${t("ช่วงที่ดู")} (${t("หน้า")})`, align: "right", sortable: false, value: (row) => row.summary.netPages }]),
      ...diff,
      { key: "devices", label: t("เครื่องที่มีข้อมูล ฐาน → ช่วงที่ดู"), align: "right", sortable: false, value: (row) => row.summary.devices },
      status,
    ];
  }
  return [
    label,
    { key: "current", label: `${metricText.value} (${unit.value})`, align: "right", sortable: false, value: (row) => metricValue(row.summary, state.value.metric) },
    ...(isCost.value ? [] : [{ key: "currentNet", label: t("สุทธิหลังหัก 2% (หน้า)"), align: "right", sortable: false, value: (row) => row.summary.netPages }]),
    ...diff,
    { key: "devices", label: t("เครื่องที่มีข้อมูล"), align: "right", sortable: false, value: (row) => row.summary.devices },
    status,
  ];
});

/* --------------------------------------------------------------------------
   ส่งออก
   -------------------------------------------------------------------------- */
// ภาพที่อ่านอยู่กับคำอธิบายต้องเปลี่ยนพร้อมกันหลังคำขอช่วงใหม่เสร็จ
const currentDisplay = computed(() => ({
  model: model.value, chart: chart.value, title: title.value, statement: statement.value,
  year: activeFiscalYear.value?.year, columns: columns.value, hasChart: hasChart.value,
  isCost: isCost.value, unit: unit.value, noun: noun.value, state: { ...state.value },
  spread: spread.value, unpricedCount: unpricedCount.value,
}));
const settledDisplay = ref(null);
watch([currentDisplay, ready], ([value, isReady]) => { if (isReady) settledDisplay.value = value; }, { immediate: true });
const display = computed(() => loading.value && settledDisplay.value ? settledDisplay.value : currentDisplay.value);
const exportBusy = ref(false);
const exportError = ref("");
const blockedReason = computed(() => {
  if (!ready.value) return t("รอข้อมูลโหลดเสร็จ");
  if (model.value.blocked === "no-items") return state.value.basis === "periods" ? t("เลือก{0}ที่จะเทียบก่อน", [noun.value]) : t("เลือก{0}อย่างน้อยสองรายการ", [noun.value]);
  if (model.value.blocked === "no-data") return t("ยังไม่มียอดพิมพ์ในขอบเขตนี้");
  return "";
});

async function runExport(kind) {
  if (kind === "report" ? blockedReason.value : !ready.value || !model.value.scopeRows.length) return;
  exportBusy.value = true;
  exportError.value = "";
  const m = model.value;
  const labels = { title: title.value, currentLabel: currentLabel.value, referenceLabel: referenceLabel.value };
  const filename = exportFilename([
    kind === "raw" ? "print-difference-data" : "print-difference",
    `fy${activeFiscalYear.value?.year ?? "all"}`,
    monthsSlug(selectedMonths.value, fyMonths.value),
    m.dimension,
    m.basis === "periods" ? `vs-${state.value.reference}` : "units",
    kind === "raw" ? null : m.metric === "rawPages" ? "pages" : "cost",
  ]);
  const all = summarize(m.scopeRows);
  const pairs = [
    [t("ปีงบประมาณ"), yearLabel(activeFiscalYear.value?.year)],
    [t("วิธีเทียบ"), m.basis === "periods" ? t("ช่วงเวลา A กับ B") : t("หน่วยงานในช่วงเดียวกัน")],
    [t("ระดับ"), noun.value],
    [m.basis === "periods" ? t("ช่วงที่ดู") : t("ช่วงเวลา"), currentPeriod.value],
    ...(m.basis === "periods" ? [[t("ช่วงฐาน"), `${periodLabel(m.referenceMonths)} (${referenceModeLabel(state.value.reference)})`]] : []),
    [t("รายการที่เปรียบเทียบ"), m.entries.map((entry) => entry.displayLabel).join(", ")],
    ...(m.basis === "units" ? [[t("รายการฐาน"), m.baseEntry?.displayLabel ?? ""]] : []),
    [t("ตัวชี้วัด"), `${metricText.value} (${unit.value})`],
    [t("เทียบกับ"), statement.value],
    [t("สูตรส่วนต่าง"), formula],
    [t("ขอบเขตข้อมูลรายละเอียด"), m.basis === "periods" ? t("เฉพาะ{0}ที่เลือก ทั้งช่วงฐานและช่วงที่ดู", [noun.value]) : t("เฉพาะ{0}ที่เลือก {1} รายการ", [noun.value, formatCount(m.entries.length)])],
    [t("จำนวนรายการยอดพิมพ์"), formatCount(m.scopeRows.length)],
    [t("จำนวนเครื่องที่มีข้อมูล"), formatCount(all.devices)],
    [t("สถานะราคา"), priceStatusLine(all.unpriced)],
    ...standardNotes(),
  ];
  const sheets = kind === "report"
    ? [differenceSheet(m, labels), detailSheet(m.scopeRows), conditionsSheet(filename, pairs)]
    : [detailSheet(m.scopeRows), conditionsSheet(filename, pairs)];
  try { await saveWorkbook(filename, sheets); }
  catch (error) { exportError.value = errorMessage(error, t("ส่งออกไม่สำเร็จ")); }
  finally { exportBusy.value = false; }
}
function reload() { yearQuery.refetch(); if (state.value.basis === "periods") baseQuery.refetch(); }
</script>

<template>
  <div>
    <UiFilterBar :collapsible="false" class="mb-4">
      <template #primary>
        <UiField :label="t('เทียบระหว่าง')">
          <UiSegmented v-model="type" :options="props.types" />
        </UiField>
        <UiField :label="t('วิธีเทียบ')">
          <UiSegmented v-model="basis" :options="[{ value: 'units', label: t('หน่วยงานในช่วงเดียวกัน') }, { value: 'periods', label: t('ช่วงเวลา A กับ B') }]" size="sm" />
        </UiField>
        <UiField :label="state.basis === 'periods' ? t('ช่วงที่ดู') : t('ช่วงเวลา')" class="w-full sm:w-72">
          <PeriodPicker v-model="selectedMonths" :options="monthsWithData" :all-label="t('ทั้งปีงบ')" />
        </UiField>
        <UiField v-if="state.basis === 'periods'" :label="t('ช่วงฐาน')" class="w-full sm:w-96">
          <UiSelect v-model="reference" :options="referenceOptions" value-key="value" label-key="label" />
        </UiField>
        <UiField :label="t('ระดับ')">
          <UiSegmented v-model="level" :options="[{ value: 'division', label: t('ฝ่าย') }, { value: 'department', label: t('แผนก') }]" size="sm" />
        </UiField>
        <UiField :label="t('{0}ที่จะเทียบ', [noun])" class="w-full sm:w-80">
          <UiCombobox v-model="items" :options="options" multiple :placeholder="t('เลือก{0} (แนะนำ 2–{1} รายการ)', [noun, SUGGESTED_ITEMS])" :search-placeholder="t('พิมพ์เพื่อค้นหา…')" />
        </UiField>
        <UiField v-if="state.basis === 'units'" :label="t('ฐานของการเทียบ')" class="w-full sm:w-56">
          <UiSelect v-model="base" :options="baseOptions" value-key="value" label-key="label" :disabled="baseOptions.length < 2" />
        </UiField>
        <UiField :label="t('ตัวชี้วัด')">
          <UiSegmented v-model="metric" :options="[{ value: 'cost', label: t('ค่าใช้จ่าย') }, { value: 'rawPages', label: t('ยอดพิมพ์จริง') }]" size="sm" />
        </UiField>
      </template>
      <template #actions>
        <ExportExcelButton :disabled="Boolean(blockedReason)" :raw-disabled="!ready || !model.scopeRows.length" :busy="exportBusy" :reason="blockedReason"
          @report="runExport('report')" @raw="runExport('raw')" />
      </template>
    </UiFilterBar>

    <UiAlert v-if="trimmed" tone="info" class="mb-4">
      {{ t("เลือกได้สูงสุด {0} รายการ เพราะกราฟมี {0} สีที่แยกกันออก — เก็บ {0} รายการแรกไว้ แนะนำ 2–{1} รายการเพื่อให้อ่านง่าย", [MAX_ITEMS, SUGGESTED_ITEMS]) }}
    </UiAlert>
    <UiAlert v-if="failed" tone="danger" class="mb-4">
      {{ errorMessage(yearQuery.error.value || baseQuery.error.value, t("โหลดข้อมูลเปรียบเทียบไม่สำเร็จ")) }}
      <template #actions><UiButton size="sm" variant="secondary" @click="reload">{{ t("ลองใหม่") }}</UiButton></template>
    </UiAlert>
    <UiAlert v-if="exportError" tone="danger" class="mb-4">{{ exportError }}</UiAlert>

    <UiCard class="mb-4" :class="loading && settledDisplay && 'opacity-45'" :title="display.title" :description="`${t('ปีงบ {0}', [yearLabel(display.year)])} · ${display.statement}`" :aria-busy="loading">

      <UiSkeleton v-if="loading && !settledDisplay" height="16rem" />
      <UiEmpty v-else-if="failed" :title="t('โหลดข้อมูลไม่สำเร็จ')" compact />
      <UiEmpty v-else-if="display.model.blocked === 'no-items'" compact
        :title="display.state.basis === 'periods' ? t('เลือก{0}ที่จะเทียบระหว่างสองช่วง', [display.noun]) : t('เลือก{0}อย่างน้อยสองรายการ', [display.noun])"
        :description="display.state.basis === 'periods' ? t('แต่ละรายการแสดงยอดของช่วงฐานคู่กับช่วงที่ดู') : t('รายการแรกเป็นฐานของการเทียบ เปลี่ยนฐานได้จากช่อง “ฐานของการเทียบ”')" />
      <UiEmpty v-else-if="display.model.blocked === 'no-data' || !display.hasChart" compact :title="t('{0}ที่เลือกยังไม่มียอดพิมพ์ในช่วงนี้', [display.noun])" />
      <UiChart v-else :loading="loading" kind="bar" horizontal :labels="display.chart.labels" :series="display.chart.series"
        :height="`${Math.max(10, display.chart.labels.length * (display.chart.series.length > 1 ? 3.6 : 2.6) + 4)}rem`"
        :format-value="display.isCost ? formatBahtValue : formatCount" :format-axis="formatCompact" :unit="display.unit" :category-label="display.noun" />

      <template #footer><p class="text-xs text-ink-mute">{{ formula }}</p></template>
    </UiCard>

    <UiCard v-if="!failed && display.model.entries.length" :aria-busy="loading" flush class="mb-4" :class="loading && settledDisplay && 'opacity-45'" :title="t('ตารางความแตกต่าง')" :description="display.statement">
      <UiDataTable :rows="display.model.entries" :columns="display.columns" row-key="key" :caption="t('ตารางความแตกต่าง')"
        :searchable="false" :show-export="false" :show-fullscreen="false" :show-column-picker="false" max-height="none">
        <template #cell-label="{ row }">
          <span class="font-medium text-ink">{{ row.displayLabel }}</span>
          <UiBadge v-if="row.isBase" tone="brand" size="sm" class="ml-2">{{ t("ฐาน") }}</UiBadge>
          <span v-if="row.hint && display.state.level === 'department'" class="block text-xs text-ink-mute">{{ row.hint }}</span>
        </template>
        <template #cell-reference="{ row }">{{ valueText(row.reference) }}</template>
        <template #cell-referenceNet="{ row }">{{ netText(row.reference) }}</template>
        <template #cell-current="{ row }">
          {{ valueText(row.summary) }}
          <span v-if="display.isCost && row.summary.unpriced && row.summary.cost !== null" class="block text-2xs text-warn-ink">{{ t("เฉพาะที่ยืนยันแล้ว") }}</span>
        </template>
        <template #cell-currentNet="{ row }">{{ netText(row.summary) }}</template>
        <template #cell-diff="{ row }">
          <span class="inline-flex items-center gap-1">
            <component :is="trendIcon(row.difference)" v-if="row.difference?.diff !== null && row.difference?.diff !== undefined" :size="13" aria-hidden="true" class="text-ink-mute" />
            {{ row.isBase ? "—" : diffText(row.difference) }}
          </span>
        </template>
        <template #cell-ratio="{ row }">{{ row.isBase ? "—" : ratioText(row.difference) }}</template>
        <template #cell-devices="{ row }">
          <template v-if="display.state.basis === 'periods'">{{ formatCount(row.reference.devices) }} → {{ formatCount(row.summary.devices) }}</template>
          <template v-else>{{ formatCount(row.summary.devices) }}</template>
        </template>
        <template #cell-note="{ row }">
          <span class="text-xs" :class="row.difference?.reason && row.difference.reason !== 'zero-base' ? 'text-warn-ink' : 'text-ink-mute'">
            {{ differenceNote(row.difference, { isBase: row.isBase }) || statusLabel(row.summary) }}
          </span>
          <span v-if="display.state.basis === 'periods' && dataStatus(row.reference) !== 'complete'" class="block text-2xs text-ink-mute">{{ t("ช่วงฐาน: {0}", [statusLabel(row.reference)]) }}</span>
        </template>
      </UiDataTable>

      <template #footer>
        <ul class="flex flex-col gap-1.5 text-xs text-ink-mute list-none">
          <li v-if="display.unpricedCount" class="flex gap-2"><Info :size="14" class="shrink-0 mt-0.5" aria-hidden="true" />{{ t("ยังยืนยันราคาไม่ได้ {0} รายการ — ยอดเงินเป็นเฉพาะส่วนที่ยืนยันแล้ว และยังไม่คิดส่วนต่างค่าใช้จ่ายของขอบเขตนี้", [formatCount(display.unpricedCount)]) }}</li>
          <li v-if="display.spread && !display.spread.periods" class="flex gap-2"><Info :size="14" class="shrink-0 mt-0.5" aria-hidden="true" />{{ t("จำนวนเครื่องที่มีข้อมูลต่างกัน ({0}–{1} เครื่อง) ยอดรวมจึงต่างกันได้ตามจำนวนเครื่อง ไม่ได้แปลว่าแต่ละเครื่องใช้งานต่างกัน", [formatCount(display.spread.min), formatCount(display.spread.max)]) }}</li>
          <li v-if="display.spread?.periods" class="flex gap-2"><Info :size="14" class="shrink-0 mt-0.5" aria-hidden="true" />{{ t("จำนวนเครื่องที่มีข้อมูลของสองช่วงไม่เท่ากัน ({0}) ยอดรวมจึงต่างกันได้เองโดยที่การใช้งานต่อเครื่องไม่เปลี่ยน", [display.spread.periods.join(", ")]) }}</li>
          <li class="flex gap-2"><Info :size="14" class="shrink-0 mt-0.5" aria-hidden="true" />{{ t("ยอดที่สูงกว่าไม่ได้แปลว่าสิ้นเปลือง และยอดที่ลดลงไม่ได้แปลว่าประหยัดเสมอ ให้อ่านคู่กับจำนวนเครื่องและลักษณะงานของหน่วยงาน") }}</li>
        </ul>
      </template>
    </UiCard>
  </div>
</template>
