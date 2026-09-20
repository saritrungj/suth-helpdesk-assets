<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowUpRight, FileText, PanelRightOpen, RefreshCw } from 'lucide-vue-next';
import { useBuildings, useContracts, useDepartments, useDivisions, useMonthlyKpi, useOverview } from '../api/queries';
import { activeFiscalYear, activeFiscalYearRange, fiscalYearMonths, fiscalYearState } from '../store/fiscalYear';
import { t } from '../lib/locale';
import { formatMonth, yearLabel } from '../lib/locale-format';
import { formatBahtValue, formatCount, formatNetPages } from '../lib/format';
import { errorMessage } from '../lib/api-error';
import { UiAlert, UiButton, UiPageHeader, UiStat } from '../ui';
import DashboardFilter from './DashboardFilter.vue';
import DashboardScopeFilter from './DashboardScopeFilter.vue';
import ExecutiveDetails from './ExecutiveDetails.vue';
import ExportExcelButton from './ExportExcelButton.vue';
import PrintComparison from './PrintComparison.vue';
import ComparisonTable from './ComparisonTable.vue';
import { buildComparison, buildYearComparison, comparisonFromQuery, comparisonToQuery, defaultYearPair, dimensionLabel, fiscalPosition, fiscalYearsMonths, itemOptions, metricLabel, metricUnit, monthText, periodChange, periodLabel, summarize, yearComparisonOptions, yearRows } from './comparison';
import { comparisonSheet, comparisonTitle, conditionsSheet, detailSheet, exportFilename, monthlySheet, monthsSlug, priceStatusLine, qualitySheet, rankingSheet, saveWorkbook, standardNotes, summarySheet } from './comparison-export';
import { dashboardScopeFromQuery, dashboardScopeToQuery, filterDashboardRows } from './dashboard-scope';
import { dashboardCsv } from './dashboard-csv';

/**
 * ExecutiveDashboard — หน้าภาพรวมการพิมพ์
 *
 * โครงหน้าเรียงตามคำถาม: ตัวกรอง → ตัวเลขสำคัญ → พื้นที่เปรียบเทียบ → ตารางรายละเอียด
 *
 * อันดับมาก–น้อยไม่อยู่บนหน้าจอ แต่เป็นแผ่น "อันดับ" ในไฟล์ Excel ที่ส่งออก (#115)
 *
 * ตัวเลือกหลักมีชุดเดียว (ช่วงเวลา → แยกข้อมูลตาม → รายการ → ข้อมูลที่แสดง) และกราฟ ตาราง
 * กับไฟล์ Excel อ่านจากแบบจำลองตัวเดียวกัน (comparison.js) — เดิมหน้านี้มีตัวเลือกตัวชี้วัด
 * สามชุด (กราฟรายเดือน, การ์ดอันดับ, รายการแผนก/สัญญา) ที่เลือกแยกกันได้ แล้วตัวเลขชุด
 * เดียวกันขึ้นซ้ำสามที่ (#103)
 *
 * ตัวเลือกของพื้นที่เปรียบเทียบอยู่ใน URL เปิดรายละเอียดเครื่องแล้วกดย้อนกลับจึงได้มุมมองเดิม
 */
const route = useRoute();
const router = useRouter();

const filter = ref({ month: '', selected: [] });
const dashboardScope = ref(dashboardScopeFromQuery(route.query));
const state = ref(comparisonFromQuery(route.query));
const detailOpen = ref(false);
const detailScope = ref(null);
const detailGroup = ref('department');
const exportBusy = ref(false);
const exportError = ref('');

// สถานะ → URL และ URL → สถานะ (ย้อนกลับ/เดินหน้า หรือกดลิงก์ของหน้าเดิม) — ธงกันวน
// ต้องทำงานแบบ sync ไม่งั้น watcher ของอีกฝั่งจะรันหลังธงถูกปลดไปแล้ว
let syncingFromRoute = false;
watch(state, (value) => {
  if (syncingFromRoute) return;
  router.replace({ query: { ...route.query, ...comparisonToQuery(value) } });
}, { deep: true, flush: 'sync' });
watch(() => route.query, (query) => {
  const next = comparisonFromQuery(query);
  if (JSON.stringify(next) !== JSON.stringify(state.value)) {
    syncingFromRoute = true;
    state.value = next;
    syncingFromRoute = false;
  }
  normalizeComparisonQuery(query, next);
  const nextScope = dashboardScopeFromQuery(query);
  if (JSON.stringify(nextScope) !== JSON.stringify(dashboardScope.value)) dashboardScope.value = nextScope;
});
watch(dashboardScope, (value) => {
  router.replace({ query: { ...route.query, ...dashboardScopeToQuery(value) } });
}, { deep: true });
const COMPARISON_QUERY_KEYS = ['by', 'items', 'measure', 'years', 'scope', 'scopeItem', 'view', 'dir', 'n', 'contract'];
const queryText = (value) => String(Array.isArray(value) ? value[0] ?? '' : value ?? '');
function normalizeComparisonQuery(query, value) {
  const normalized = comparisonToQuery(value);
  if (COMPARISON_QUERY_KEYS.some((key) => queryText(query[key]) !== queryText(normalized[key]))) {
    router.replace({ query: { ...query, ...normalized } });
  }
}
// ลิงก์เก่า ค่าที่ไม่รู้จัก และรายการเกินขีดจำกัด ถูกเขียนกลับให้ URL ตรงกับสิ่งที่หน้าใช้จริง
normalizeComparisonQuery(route.query, state.value);

const fyMonths = computed(() => (activeFiscalYearRange.value ? fiscalYearMonths(activeFiscalYearRange.value) : []));
const monthParam = computed(() => filter.value.month || fyMonths.value.join(',') || undefined);
const report = useMonthlyKpi(computed(() => ({ month: monthParam.value })));
const overview = useOverview(computed(() => ({ month: monthParam.value, fiscal_year_id: activeFiscalYear.value?.id })));
const divisions = useDivisions();
const departments = useDepartments();
const contracts = useContracts();
const buildings = useBuildings();

/*
 * เทียบข้ามปีงบ (#115) — โหลดแถวของทุกปีที่เลือกแยกจากแถวของปีงบที่ดูอยู่ เพราะการ์ดตัวเลข
 * ด้านบนยังเป็นของปีงบที่เลือกที่แถบบนสุด ส่วนกราฟวางหลายปีซ้อนกันตามเดือนของปีงบ
 * ไม่ได้เลือกปีเอง = ปีงบที่ดูอยู่กับปีก่อนหน้า (ถ้ามีในระบบ)
 */
const yearMode = computed(() => state.value.by === 'fiscalYear');
const defaultYears = computed(() => defaultYearPair(activeFiscalYear.value?.year));
const chosenYears = computed(() => (state.value.years.length ? state.value.years : defaultYears.value));
const yearOptions = computed(() => yearComparisonOptions(fiscalYearState.list, activeFiscalYear.value?.year));
const yearReport = useMonthlyKpi(
  computed(() => ({ month: fiscalYearsMonths(chosenYears.value).join(',') || undefined })),
  { enabled: computed(() => yearMode.value && chosenYears.value.length > 0) },
);
const yearSource = computed(() => (yearMode.value && !yearReport.isPlaceholderData.value
  ? filterDashboardRows(yearReport.data.value ?? [], dashboardScope.value) : []));

const loading = computed(() => report.isPending.value || report.isPlaceholderData.value || overview.isPending.value || overview.isPlaceholderData.value
  || (yearMode.value && (yearReport.isPending.value || yearReport.isPlaceholderData.value)));
const failed = computed(() => report.isError.value || overview.isError.value || (yearMode.value && yearReport.isError.value));
const ready = computed(() => !loading.value && !failed.value);
// ห้ามแสดงข้อมูลของช่วงเดิมใต้ชื่อช่วงที่เพิ่งเลือก — ระหว่างโหลดจึงเป็นแถวว่างเสมอ
const rawRows = computed(() => (loading.value || report.isError.value ? [] : (report.data.value || [])
  .filter((row) => !monthParam.value || monthParam.value.split(',').includes(row.month))));
const rows = computed(() => filterDashboardRows(rawRows.value, dashboardScope.value));

const money = (value) => (value == null ? '—' : formatBahtValue(value));
const average = (value, devices) => (devices > 0 && value != null ? value / devices : null);

const references = computed(() => ({
  divisions: divisions.data.value ?? [],
  departments: departments.data.value ?? [],
  contracts: contracts.data.value ?? [],
  buildings: buildings.data.value ?? [],
}));
const scopeOptions = computed(() => ({
  divisions: itemOptions('division', references.value, rawRows.value),
  departments: itemOptions('department', references.value, rawRows.value),
  contracts: itemOptions('contract', references.value, rawRows.value),
  buildings: itemOptions('building', references.value, rawRows.value),
  devices: itemOptions('device', references.value, rawRows.value),
}));
const options = computed(() => (yearMode.value ? [] : itemOptions(state.value.by, references.value, rows.value)));
const yearScopeOptions = computed(() => (yearMode.value && state.value.scope !== 'overall'
  ? itemOptions(state.value.scope, references.value, yearSource.value) : []));
const yearScope = computed(() => (state.value.scope !== 'overall' && state.value.scopeItem
  ? { dimension: state.value.scope, key: state.value.scopeItem } : null));
const model = computed(() => (yearMode.value
  ? buildYearComparison({
    rows: yearSource.value,
    years: chosenYears.value,
    scope: yearScope.value,
    metric: state.value.metric,
    // เลือกช่วงเดือนไว้ที่แถบบนสุด = เทียบเฉพาะเดือนเหล่านั้นของทุกปี
    positions: filter.value.selected.map(fiscalPosition).filter(Boolean),
  })
  : buildComparison({
    rows: rows.value,
    dimension: state.value.by,
    items: state.value.items,
    metric: state.value.metric,
    options: options.value,
    autoPick: false,
  })));
const completeTableModel = computed(() => {
  if (yearMode.value || state.value.by === 'overall') return model.value;
  return buildComparison({
    rows: rows.value,
    dimension: state.value.by,
    items: options.value.map((option) => option.value),
    metric: state.value.metric,
    options: options.value,
    itemLimit: null,
  });
});
const yearScopeLabel = computed(() => (yearScope.value
  ? yearScopeOptions.value.find((option) => option.value === yearScope.value.key)?.label ?? yearScope.value.key : ''));

/*
 * การ์ดตัวเลขและช่วงก่อนหน้าอ่านจากตัวกรองขอบเขตด้านบนเท่านั้น รายการที่เลือกในกราฟ
 * มีหน้าที่เลือกเส้นมาเปรียบเทียบ ไม่เปลี่ยนยอดรวมของหน้าโดยเงียบ ๆ
 */
const totals = computed(() => summarize(rows.value));
const costTitle = computed(() => (totals.value.unpriced ? t('ค่าใช้จ่ายที่ยืนยันแล้ว') : t('ค่าใช้จ่ายสุทธิ')));

/*
 * ช่วงก่อนหน้า: เดือนมาจาก API (ยาวเท่ากันและอยู่ในปีงบเดียวกัน) แต่ยอดคิดที่นี่จาก
 * แถวรายเครื่องรายเดือนของรายการชุดเดียวกัน ด้วยกฎเดียวกับช่วงที่ดู — เดิมใช้เปอร์เซ็นต์
 * ทั้งองค์กรจาก API ซึ่งนับรายการที่ยังไม่รู้ราคาเป็นศูนย์ด้วย
 */
const previousMonths = computed(() => overview.data.value?.comparison?.previous_months ?? []);
const previousReport = useMonthlyKpi(
  computed(() => ({ month: previousMonths.value.join(',') || undefined })),
  { enabled: computed(() => previousMonths.value.length > 0) },
);
const previousTotals = computed(() => {
  if (!previousMonths.value.length || loading.value) return null;
  if (previousReport.isPending.value || previousReport.isPlaceholderData.value || previousReport.isError.value) return null;
  const months = new Set(previousMonths.value);
  const previousRows = filterDashboardRows(
    (previousReport.data.value ?? []).filter((row) => months.has(row.month)),
    dashboardScope.value,
  );
  return summarize(previousRows);
});
const change = computed(() => (previousTotals.value ? periodChange(previousTotals.value, totals.value, 'cost') : null));
const costHint = computed(() => {
  if (totals.value.unpriced) return t('ยังยืนยันราคาไม่ได้ {0} รายการ', [formatCount(totals.value.unpriced)]);
  if (!previousMonths.value.length) return t('ยังไม่มีข้อมูลช่วงเปรียบเทียบ');
  const previous = periodLabel(previousMonths.value);
  switch (change.value?.reason) {
    case 'unpriced': return t('{0} ยังยืนยันราคาไม่ครบ จึงยังไม่เทียบ', [previous]);
    case 'no-base-data': return t('{0} ไม่มียอดของขอบเขตนี้ จึงยังไม่เทียบ', [previous]);
    default: return t('เทียบกับ {0}', [previous]);
  }
});

const periodText = computed(() => (filter.value.selected.length
  ? periodLabel(filter.value.selected)
  : t('ทั้งปีงบ ({0})', [periodLabel(fyMonths.value)])));
const noun = computed(() => dimensionLabel(yearMode.value ? state.value.scope : state.value.by));
const metricText = computed(() => `${metricLabel(model.value.metric, { incomplete: model.value.metric === 'cost' && model.value.scope.unpriced > 0 })} (${metricUnit(model.value.metric)})`);
const activeScopeCount = computed(() => Object.values(dashboardScope.value).reduce((count, values) => count + values.length, 0));
const scopeCaption = computed(() => (activeScopeCount.value
  ? t('ตัวกรองขอบเขต {0} รายการ', [formatCount(activeScopeCount.value)])
  : t('ทุกหน่วยงาน')));
const itemsText = computed(() => {
  if (yearMode.value) {
    const years = model.value.entries.map((entry) => entry.displayLabel).join(', ');
    return yearScope.value ? `${years} · ${noun.value}: ${yearScopeLabel.value}` : `${years} · ${t('ทั้งองค์กร')}`;
  }
  if (model.value.view === 'overall') return t('ทุกหน่วยงาน');
  if (model.value.autoPicked) return t('{0}ที่ยอดสูงสุด {1} รายการ', [noun.value, formatCount(model.value.entries.length)]);
  return model.value.entries.length ? `${noun.value}: ${model.value.entries.map((entry) => entry.displayLabel).join(', ')}` : t('ยังไม่ได้เลือก{0}', [noun.value]);
});
const yearText = computed(() => t('ปีงบ {0}', [yearLabel(activeFiscalYear.value?.year)]));
const scopeText = computed(() => (yearMode.value ? [periodText.value, itemsText.value, metricText.value] : [yearText.value, periodText.value, itemsText.value, metricText.value]).join(' · '));

// ระหว่างเปลี่ยนช่วง คงแบบจำลองพร้อมคำอธิบายเดิมไว้ด้วยกัน ไม่ติดหัวข้อใหม่บนยอดเก่า
const settledTable = ref(null);
watch([completeTableModel, periodText, ready], ([value, period, isReady]) => {
  if (isReady) settledTable.value = { model: value, description: `${comparisonTitle(value)} · ${period}` };
}, { immediate: true });
const tableView = computed(() => loading.value && settledTable.value
  ? settledTable.value : { model: model.value, description: `${comparisonTitle(model.value)} · ${periodText.value}` });
const stats = computed(() => ({
  totals: totals.value, costTitle: costTitle.value, costHint: costHint.value,
  caption: t('ตัวเลขของ {0} · {1}', [scopeCaption.value, periodText.value]), delta: change.value?.percent ?? null,
}));
const settledStats = ref(null);
watch([stats, ready], ([value, isReady]) => { if (isReady) settledStats.value = value; }, { immediate: true });
const shownStats = computed(() => loading.value && settledStats.value ? settledStats.value : stats.value);
const statsReady = computed(() => ready.value || (loading.value && Boolean(settledStats.value)));

/** เดือนล่าสุดที่มีข้อมูลของปีงบที่ดูอยู่ */
const latestMonth = computed(() => rows.value.reduce((latest, row) => (row.month > latest ? row.month : latest), ''));

/** แถวของทุกปีที่เทียบตามตัวกรองบนหน้า โดยคืนเดือนจริงให้แผงรายละเอียดและไฟล์ */
const comparedYearRows = computed(() => {
  if (!yearMode.value) return [];
  const positions = filter.value.selected.map(fiscalPosition).filter(Boolean);
  return yearRows(yearSource.value, chosenYears.value)
    .filter((row) => !positions.length || positions.includes(row.month));
});
const exportRows = computed(() => (yearMode.value ? comparedYearRows.value : rows.value));
const detailRows = computed(() => exportRows.value.map((row) => (
  row.calendar_month ? { ...row, month: row.calendar_month } : row
)));

watch(monthParam, () => { detailOpen.value = false; exportError.value = ''; });

/* --------------------------------------------------------------------------
   รายละเอียดรายเครื่อง
   -------------------------------------------------------------------------- */
function openDetails(group = 'department', entry = null) {
  if (!ready.value || !rows.value.length) return;
  if (entry) {
    const dimension = model.value.view === 'overall' ? 'month' : state.value.by;
    detailScope.value = { dimension, key: entry.key, label: entry.displayLabel };
    detailGroup.value = 'device';
  } else {
    detailScope.value = null;
    detailGroup.value = yearMode.value ? 'fiscalYear' : group;
  }
  detailOpen.value = true;
}
function openTableDetails(entry) {
  if (!entry) return;
  detailScope.value = { dimension: state.value.by === 'overall' ? 'month' : state.value.by, key: entry.key, label: entry.displayLabel };
  detailGroup.value = 'device';
  detailOpen.value = true;
}
function reload() { report.refetch(); overview.refetch(); if (yearMode.value) yearReport.refetch(); }

function runCsvExport() {
  if (!ready.value || !rows.value.length) return;
  const content = dashboardCsv(rows.value);
  const blob = new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `dashboard-details-${monthsSlug(filter.value.selected.length ? filter.value.selected : fyMonths.value)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/* --------------------------------------------------------------------------
   ส่งออก — ไฟล์เดียวสามแผ่น หรือข้อมูลดิบอย่างเดียว
   -------------------------------------------------------------------------- */
const blockedReason = computed(() => {
  if (!ready.value) return t('รอข้อมูลโหลดเสร็จ');
  return model.value.blocked === 'no-data' ? t('ยังไม่มียอดพิมพ์ในขอบเขตนี้') : '';
});

function filenameFor(kind) {
  const m = model.value;
  return exportFilename([
    kind === 'raw' ? 'print-usage-data' : 'print-comparison',
    yearMode.value ? `fy${m.years.join('_')}` : `fy${activeFiscalYear.value?.year ?? 'all'}`,
    monthsSlug(filter.value.selected, fyMonths.value),
    m.dimension,
    kind === 'raw' ? null : m.metric === 'rawPages' ? 'pages' : 'cost',
  ]);
}

function conditions(m, kind, includedRows) {
  const detailScopeText = t('ทุกเครื่องตามตัวกรองบนหน้า');
  const ranking = m.ranking && !m.ranking.blocked
    ? t('ทุก{0} {1} รายการ เรียงตาม{2}จากมากไปน้อย (แผ่น “อันดับ”)', [noun.value, formatCount(m.ranking.from), metricLabel(m.metric)])
    : m.ranking?.blocked === 'unpriced' ? t('ยังจัดอันดับค่าใช้จ่ายไม่ได้ เพราะราคายังยืนยันไม่ครบ') : '';
  const yearRows = yearMode.value ? [
    [t('ปีงบที่เปรียบเทียบ'), m.entries.map((entry) => entry.displayLabel).join(', ')],
    [t('เดือนของปีงบบนแกน'), m.months.map((month) => monthText(month)).join(', ') || t('ไม่มี')],
    [t('ขอบเขต'), yearScope.value ? `${noun.value}: ${yearScopeLabel.value}` : t('ทั้งองค์กร')],
  ] : [
    [t('ปีงบประมาณ'), yearLabel(activeFiscalYear.value?.year)],
    [t('เดือนที่มีข้อมูล'), periodLabel(m.months) || t('ไม่มี')],
  ];
  return [
    ...yearRows,
    [t('ช่วงเวลา'), periodText.value],
    [t('แยกข้อมูลตาม'), dimensionLabel(m.dimension)],
    ...(m.view === 'select' && !yearMode.value ? [[t('รายการที่เปรียบเทียบ'), m.entries.map((entry) => entry.displayLabel).join(', ')]] : []),
    ...(m.autoPicked ? [[t('วิธีเลือกรายการ'), t('ไม่ได้เลือกเอง — {0} รายการที่ยอดสูงสุดตามข้อมูลที่แสดง', [formatCount(m.entries.length)])]] : []),
    ...(kind !== 'raw' && ranking ? [[t('อันดับ'), ranking]] : []),
    ...(kind === 'raw' ? [] : [[t('ข้อมูลที่แสดง'), metricText.value]]),
    ...(kind !== 'raw' && m.view === 'select' && m.months.length >= 2 ? [[t('ค่าในคอลัมน์รายเดือน'), metricText.value]] : []),
    [t('ขอบเขตข้อมูลรายละเอียด'), detailScopeText],
    [t('จำนวนรายการยอดพิมพ์'), formatCount(includedRows.length)],
    [t('จำนวนเครื่องที่มีข้อมูล'), formatCount(summarize(includedRows).devices)],
    [t('สถานะราคา'), priceStatusLine(summarize(includedRows).unpriced)],
    ...standardNotes(),
  ];
}

async function runExport(kind) {
  if (kind === 'report' ? blockedReason.value : !ready.value || !exportRows.value.length) return;
  exportBusy.value = true;
  exportError.value = '';
  // จับแบบจำลองชุดเดียวไว้ก่อน await — ถ้าผู้ใช้เปลี่ยนตัวเลือกระหว่างสร้างไฟล์ ไฟล์ยังเป็นชุดที่กด
  const m = model.value;
  const includedRows = exportRows.value;
  const filename = filenameFor(kind);
  const ranking = kind === 'report' ? rankingSheet(m) : null;
  const sheets = kind === 'report'
    ? [summarySheet(includedRows), monthlySheet(includedRows), comparisonSheet(m), ...(ranking ? [ranking] : []), detailSheet(includedRows), qualitySheet(includedRows), conditionsSheet(filename, conditions(m, kind, includedRows))]
    : [detailSheet(includedRows), conditionsSheet(filename, conditions(m, kind, includedRows))];
  try { await saveWorkbook(filename, sheets); }
  catch (error) { exportError.value = errorMessage(error, t('ส่งออกไม่สำเร็จ')); }
  finally { exportBusy.value = false; }
}
</script>

<template>
  <div class="w-full min-w-0 max-w-[calc(100vw-2rem)] overflow-x-clip">
    <UiPageHeader :title="t('ภาพรวมการพิมพ์')" :description="t('ดูข้อมูลปัจจุบันและย้อนหลัง เลือกขอบเขต แยกข้อมูล และส่งออกเพื่อใช้ตัดสินใจลดต้นทุน')">
      <template #actions>
        <UiButton variant="secondary" :disabled="!ready || !rows.length" @click="openDetails()">
          <template #icon><PanelRightOpen :size="16" /></template>{{ t('ดูรายละเอียด') }}
        </UiButton>
      </template>
    </UiPageHeader>

    <!-- ตัวกรอง: ช่วงเวลาเป็นขอบเขตของตัวเลขทั้งหน้า จึงอยู่บนสุดแถวเดียว -->
    <div class="flex flex-wrap items-end gap-x-3 gap-y-2 mb-4" data-print="hide">
      <DashboardFilter bare @filter="(next) => (filter = { ...next })" />
      <p class="text-xs text-ink-mute ml-auto pb-2">{{ latestMonth ? t('ข้อมูลล่าสุด {0}', [formatMonth(latestMonth)]) : '' }}</p>
      <UiButton variant="ghost" icon-only :label="t('โหลดข้อมูลใหม่')" :loading="report.isFetching.value || overview.isFetching.value || yearReport.isFetching.value" @click="reload"><RefreshCw :size="16" /></UiButton>
    </div>

    <DashboardScopeFilter v-model="dashboardScope" :options="scopeOptions" />

    <UiAlert v-if="failed" tone="danger" class="mb-4">
      {{ errorMessage(report.error.value || overview.error.value || yearReport.error.value, t('โหลดภาพรวมไม่สำเร็จ')) }}
      <template #actions><UiButton variant="secondary" @click="reload">{{ t('ลองใหม่') }}</UiButton></template>
    </UiAlert>
    <UiAlert v-if="exportError" tone="danger" class="mb-4">{{ exportError }}</UiAlert>

    <!-- ตัวเลขสำคัญอ่านจากตัวกรองขอบเขตด้านบน รายการที่เลือกด้านล่างใช้เลือกเส้นในกราฟ -->
    <p class="text-xs text-ink-mute mb-1.5">{{ shownStats.caption }}</p>
    <section class="card grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-line-soft mb-4" :aria-label="t('สรุปตัวเลขสำคัญ')" :aria-busy="loading" :class="loading && settledStats && 'opacity-45'">
      <button class="text-left min-w-0 hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-brand-ring rounded-l-lg" :disabled="!ready || !rows.length" :aria-label="t('ดูที่มาของค่าใช้จ่าย')" @click="openDetails('department')">
        <UiStat plain :label="shownStats.costTitle" :value="failed ? '—' : money(shownStats.totals.cost)" :unit="t('บาท')" :loading="loading && !settledStats" :delta="statsReady ? shownStats.delta : null" delta-inverse
          :hint="shownStats.costHint">
          <template #icon><ArrowUpRight :size="16" class="text-brand-ink" /></template>
        </UiStat>
      </button>
      <button class="text-left min-w-0 hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-brand-ring" :disabled="!ready || !rows.length" :aria-label="t('วิเคราะห์รายเครื่อง')" @click="openDetails('device')">
        <UiStat plain tone="ink" :label="t('ยอดพิมพ์จริง')" :value="statsReady ? formatCount(shownStats.totals.rawPages) : '—'" :unit="t('หน้า')" :loading="loading && !settledStats"
          :hint="statsReady ? t('สุทธิหลังหัก 2% {0} หน้า', [formatNetPages(shownStats.totals.netPages)]) : ''">
          <template #icon><ArrowUpRight :size="16" class="text-brand-ink" /></template>
        </UiStat>
      </button>
      <UiStat plain tone="ink" :label="t('เครื่องที่มียอดในช่วงนี้')" :value="statsReady ? formatCount(shownStats.totals.devices) : '—'" :unit="t('เครื่อง')" :loading="loading && !settledStats"
        :hint="statsReady ? `${t('{0} รายการยอดพิมพ์', [formatCount(shownStats.totals.readings)])}${shownStats.totals.unpriced ? ` · ${t('รอราคา {0}', [formatCount(shownStats.totals.unpriced)])}` : ''}` : ''" />
      <UiStat plain tone="ink" :label="t('ยอดพิมพ์เฉลี่ยต่อเครื่อง')" :value="statsReady && shownStats.totals.devices ? formatCount(average(shownStats.totals.rawPages, shownStats.totals.devices)) : '—'" :unit="t('หน้า')" :loading="loading && !settledStats" />
      <UiStat plain tone="ink" :label="t('ค่าใช้จ่ายเฉลี่ยต่อเครื่อง')" :value="statsReady ? money(average(shownStats.totals.cost, shownStats.totals.devices)) : '—'" :unit="t('บาท')" :loading="loading && !settledStats"
        :hint="shownStats.totals.unpriced ? t('คำนวณจากรายการที่ยืนยันราคาแล้ว') : ''" />
    </section>

    <PrintComparison v-model:state="state" :model="model" :options="options" :year-options="yearOptions" :scope-options="yearScopeOptions" :loading="loading" :failed="failed" :scope-text="scopeText"
      @details="(entry) => openDetails('device', entry)">
      <template #actions>
        <ExportExcelButton :disabled="Boolean(blockedReason)" :raw-disabled="!ready || !exportRows.length" :busy="exportBusy" :reason="blockedReason"
          @report="runExport('report')" @raw="runExport('raw')" />
        <UiButton variant="secondary" :disabled="!ready || !rows.length" @click="runCsvExport">
          <template #icon><FileText :size="16" /></template>{{ t('ส่งออก CSV') }}
        </UiButton>
      </template>
    </PrintComparison>

    <ComparisonTable class="mb-4" :model="tableView.model" :loading="loading" :description="tableView.description"
      @details="openTableDetails" />

    <!-- หมายเหตุขอบเขตของตัวเลขบนหน้านี้ ไม่ใช่ที่เก็บงานค้าง — งานค้างอยู่ในลิ้นชัก
         แจ้งเตือนที่เดียว ส่วนข้อจำกัดของตัวเลขแต่ละตัวติดอยู่กับตัวเลขนั้นเอง -->
    <footer class="text-xs text-ink-mute leading-relaxed">
      <p>{{ t('ข้อมูลเฉพาะเดือนที่บันทึกแล้ว') }} · {{ t('เดือนที่บันทึกเป็นศูนย์ยังแสดงในรายงาน') }} · {{ t('ยอดพิมพ์จริงคือจำนวนหน้าที่บันทึก ส่วนค่าใช้จ่ายคิดจากหน้าสุทธิหลังหัก 2%') }}</p>
    </footer>
    <ExecutiveDetails v-model:open="detailOpen" :rows="detailRows" :scope="detailScope" :context="yearMode ? scopeText : `${yearText} · ${periodText}`" :initial-group="detailGroup" />
  </div>
</template>
