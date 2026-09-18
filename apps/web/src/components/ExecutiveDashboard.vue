<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowUpRight, PanelRightOpen, RefreshCw } from 'lucide-vue-next';
import { useContracts, useDepartments, useDivisions, useMonthlyKpi, useOverview } from '../api/queries';
import { activeFiscalYear, activeFiscalYearRange, fiscalYearMonths } from '../store/fiscalYear';
import { t } from '../lib/locale';
import { formatMonth, yearLabel } from '../lib/locale-format';
import { formatBahtValue, formatCount, formatNetPages } from '../lib/format';
import { errorMessage } from '../lib/api-error';
import { UiAlert, UiButton, UiPageHeader, UiStat } from '../ui';
import DashboardFilter from './DashboardFilter.vue';
import ExecutiveDetails from './ExecutiveDetails.vue';
import ExportExcelButton from './ExportExcelButton.vue';
import PrintComparison from './PrintComparison.vue';
import ComparisonTable from './ComparisonTable.vue';
import { buildComparison, comparisonFromQuery, comparisonToQuery, dimensionLabel, itemOptions, metricLabel, metricUnit, periodLabel, summarize } from './comparison';
import { comparisonSheet, comparisonTitle, conditionsSheet, detailSheet, exportFilename, monthsSlug, priceStatusLine, saveWorkbook, standardNotes } from './comparison-export';

/**
 * ExecutiveDashboard — หน้าภาพรวมการพิมพ์
 *
 * โครงหน้าเรียงตามคำถาม: ตัวกรอง → ตัวเลขสำคัญ → พื้นที่เปรียบเทียบ/อันดับ → ตารางรายละเอียด
 *
 * ตัวเลือกหลักมีชุดเดียว (ช่วงเวลา → เปรียบเทียบตาม → รายการ → ตัวชี้วัด) และกราฟ ตาราง
 * กับไฟล์ Excel อ่านจากแบบจำลองตัวเดียวกัน (comparison.js) — เดิมหน้านี้มีตัวเลือกตัวชี้วัด
 * สามชุด (กราฟรายเดือน, การ์ดอันดับ, รายการแผนก/สัญญา) ที่เลือกแยกกันได้ แล้วตัวเลขชุด
 * เดียวกันขึ้นซ้ำสามที่ (#103)
 *
 * ตัวเลือกของพื้นที่เปรียบเทียบอยู่ใน URL เปิดรายละเอียดเครื่องแล้วกดย้อนกลับจึงได้มุมมองเดิม
 */
const route = useRoute();
const router = useRouter();

const filter = ref({ month: '', selected: [] });
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
});
const COMPARISON_QUERY_KEYS = ['by', 'view', 'items', 'measure', 'dir', 'n', 'contract'];
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

const loading = computed(() => report.isPending.value || report.isPlaceholderData.value || overview.isPending.value || overview.isPlaceholderData.value);
const failed = computed(() => report.isError.value || overview.isError.value);
const ready = computed(() => !loading.value && !failed.value);
// ห้ามแสดงข้อมูลของช่วงเดิมใต้ชื่อช่วงที่เพิ่งเลือก — ระหว่างโหลดจึงเป็นแถวว่างเสมอ
const rows = computed(() => (loading.value || report.isError.value ? [] : (report.data.value || [])
  .filter((row) => !monthParam.value || monthParam.value.split(',').includes(row.month))));

const totals = computed(() => summarize(rows.value));
const fleet = computed(() => overview.data.value?.totals || {});
const coverage = computed(() => overview.data.value?.coverage || {});
const comparison = computed(() => overview.data.value?.comparison || {});
const change = computed(() => (totals.value.unpriced ? null : comparison.value.cost_change_percent));
const previousLabel = computed(() => {
  const list = comparison.value.previous_months || [];
  return list.length ? t('เทียบกับ {0}', [periodLabel(list)]) : t('ยังไม่มีข้อมูลช่วงเปรียบเทียบ');
});
const coverageLabel = computed(() => (coverage.value.verifiable === false ? t('รอยืนยันข้อมูล') : `${formatCount(coverage.value.annual_complete_months)} / ${formatCount(coverage.value.total_months)}`));
const money = (value) => (value == null ? '—' : formatBahtValue(value));
const costTitle = computed(() => (totals.value.unpriced ? t('ค่าใช้จ่ายที่ยืนยันแล้ว') : t('ค่าใช้จ่ายสุทธิ')));

const options = computed(() => itemOptions(state.value.by, {
  divisions: divisions.data.value ?? [],
  departments: departments.data.value ?? [],
  contracts: contracts.data.value ?? [],
}, rows.value));
const model = computed(() => buildComparison({
  rows: rows.value,
  dimension: state.value.by,
  view: state.value.view,
  items: state.value.items,
  metric: state.value.metric,
  direction: state.value.direction,
  limit: state.value.limit,
  options: options.value,
}));

const periodText = computed(() => (filter.value.selected.length
  ? periodLabel(filter.value.selected)
  : t('ทั้งปีงบ ({0})', [periodLabel(fyMonths.value)])));
const noun = computed(() => dimensionLabel(state.value.by));
const metricText = computed(() => `${metricLabel(model.value.metric, { incomplete: model.value.metric === 'cost' && model.value.scope.unpriced > 0 })} (${metricUnit(model.value.metric)})`);
const itemsText = computed(() => {
  if (model.value.view === 'overall') return t('ทุกหน่วยงาน');
  if (model.value.view === 'rank') return t('{0} {1} อันดับจากทุก{2}', [model.value.direction === 'low' ? t('น้อยสุด') : t('มากสุด'), model.value.limit, noun.value]);
  return model.value.entries.length ? `${noun.value}: ${model.value.entries.map((entry) => entry.displayLabel).join(', ')}` : t('ยังไม่ได้เลือก{0}', [noun.value]);
});
const yearText = computed(() => t('ปีงบ {0}', [yearLabel(activeFiscalYear.value?.year)]));
const scopeText = computed(() => [yearText.value, periodText.value, itemsText.value, metricText.value].join(' · '));

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
  } else if (model.value.view === 'select' && model.value.entries.length) {
    detailScope.value = { dimension: state.value.by, keys: model.value.entries.map((item) => item.key), label: model.value.entries.map((item) => item.displayLabel).join(', ') };
    detailGroup.value = state.value.by === 'contract' ? 'contract' : state.value.by;
  } else {
    detailScope.value = null;
    detailGroup.value = group;
  }
  detailOpen.value = true;
}
function reload() { report.refetch(); overview.refetch(); }

/* --------------------------------------------------------------------------
   ส่งออก — ไฟล์เดียวสามแผ่น หรือข้อมูลดิบอย่างเดียว
   -------------------------------------------------------------------------- */
const blockedReason = computed(() => {
  if (!ready.value) return t('รอข้อมูลโหลดเสร็จ');
  switch (model.value.blocked) {
    case 'no-items': return t('เลือก{0}ที่จะเทียบก่อน', [noun.value]);
    case 'no-data': return t('ยังไม่มียอดพิมพ์ในขอบเขตนี้');
    case 'unpriced': return t('ยังจัดอันดับค่าใช้จ่ายไม่ได้ เพราะราคายังยืนยันไม่ครบ');
    default: return '';
  }
});

function filenameFor(kind) {
  const m = model.value;
  return exportFilename([
    kind === 'raw' ? 'print-usage-data' : 'print-comparison',
    `fy${activeFiscalYear.value?.year ?? 'all'}`,
    monthsSlug(filter.value.selected, fyMonths.value),
    m.dimension,
    m.view === 'overall' ? null : m.view,
    m.view === 'rank' ? `${m.direction}${m.limit}` : null,
    kind === 'raw' ? null : m.metric === 'rawPages' ? 'pages' : 'cost',
  ]);
}

function conditions(m, kind) {
  const detailScopeText = m.view === 'select'
    ? t('เฉพาะ{0}ที่เลือก {1} รายการ', [noun.value, formatCount(m.entries.length)])
    : m.view === 'rank' ? t('ทุก{0}ในช่วงที่เลือก ก่อนตัดอันดับ', [noun.value]) : t('ทุกเครื่องในช่วงที่เลือก');
  return [
    [t('ปีงบประมาณ'), yearLabel(activeFiscalYear.value?.year)],
    [t('ช่วงเวลา'), periodText.value],
    [t('เดือนที่มีข้อมูล'), periodLabel(m.months) || t('ไม่มี')],
    [t('เปรียบเทียบตาม'), dimensionLabel(m.dimension)],
    [t('มุมมอง'), m.view === 'overall' ? t('ภาพรวมรายเดือน') : m.view === 'select' ? t('เลือกรายการมาเทียบ') : t('อันดับมาก–น้อย')],
    ...(m.view === 'select' ? [[t('รายการที่เปรียบเทียบ'), m.entries.map((entry) => entry.displayLabel).join(', ')]] : []),
    ...(m.view === 'rank' ? [[t('อันดับ'), t('{0} {1} อันดับ จาก {2} {3}ที่มีข้อมูล', [m.direction === 'low' ? t('น้อยสุด') : t('มากสุด'), m.limit, formatCount(m.rankedFrom ?? 0), noun.value])]] : []),
    ...(kind === 'raw' ? [] : [[t('ตัวชี้วัด'), metricText.value]]),
    ...(kind !== 'raw' && m.view === 'select' && m.months.length >= 2 ? [[t('ค่าในคอลัมน์รายเดือน'), metricText.value]] : []),
    [t('ขอบเขตข้อมูลรายละเอียด'), detailScopeText],
    [t('จำนวนรายการยอดพิมพ์'), formatCount(m.scopeRows.length)],
    [t('จำนวนเครื่องที่มีข้อมูล'), formatCount(summarize(m.scopeRows).devices)],
    [t('สถานะราคา'), priceStatusLine(summarize(m.scopeRows).unpriced)],
    ...standardNotes(),
  ];
}

async function runExport(kind) {
  if (kind === 'report' ? blockedReason.value : !ready.value || !model.value.scopeRows.length) return;
  exportBusy.value = true;
  exportError.value = '';
  // จับแบบจำลองชุดเดียวไว้ก่อน await — ถ้าผู้ใช้เปลี่ยนตัวเลือกระหว่างสร้างไฟล์ ไฟล์ยังเป็นชุดที่กด
  const m = model.value;
  const filename = filenameFor(kind);
  const sheets = kind === 'report'
    ? [comparisonSheet(m), detailSheet(m.scopeRows), conditionsSheet(filename, conditions(m, kind))]
    : [detailSheet(m.scopeRows), conditionsSheet(filename, conditions(m, kind))];
  try { await saveWorkbook(filename, sheets); }
  catch (error) { exportError.value = errorMessage(error, t('ส่งออกไม่สำเร็จ')); }
  finally { exportBusy.value = false; }
}
</script>

<template>
  <div>
    <UiPageHeader :title="t('ภาพรวมการพิมพ์')" :description="t('ค่าใช้จ่ายและยอดพิมพ์ของปีงบที่เลือก เปรียบเทียบตามฝ่าย แผนก หรือสัญญา แล้วส่งออกเป็น Excel')">
      <template #actions>
        <UiButton variant="secondary" :disabled="!ready || !rows.length" @click="openDetails()">
          <template #icon><PanelRightOpen :size="16" /></template>{{ t('ดูรายละเอียด') }}
        </UiButton>
      </template>
    </UiPageHeader>

    <!-- ตัวกรอง: ช่วงเวลาเป็นขอบเขตของตัวเลขทั้งหน้า จึงอยู่บนสุดแถวเดียว -->
    <div class="flex flex-wrap items-end gap-x-3 gap-y-2 mb-4" data-print="hide">
      <DashboardFilter bare @filter="(next) => (filter = { ...next })" />
      <p class="text-xs text-ink-mute ml-auto pb-2">{{ model.months.length ? t('ข้อมูลล่าสุด {0}', [formatMonth(model.months.at(-1))]) : '' }}</p>
      <UiButton variant="ghost" icon-only :label="t('โหลดข้อมูลใหม่')" :loading="report.isFetching.value || overview.isFetching.value" @click="reload"><RefreshCw :size="16" /></UiButton>
    </div>

    <UiAlert v-if="failed" tone="danger" class="mb-4">
      {{ errorMessage(report.error.value || overview.error.value, t('โหลดภาพรวมไม่สำเร็จ')) }}
      <template #actions><UiButton variant="secondary" @click="reload">{{ t('ลองใหม่') }}</UiButton></template>
    </UiAlert>
    <UiAlert v-if="exportError" tone="danger" class="mb-4">{{ exportError }}</UiAlert>

    <!-- ตัวเลขสำคัญของทั้งช่วงเวลา (ทุกหน่วยงาน) — ไม่ขึ้นกับรายการที่เลือกเปรียบเทียบด้านล่าง -->
    <section class="card grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-line-soft mb-4" :aria-label="t('สรุปตัวเลขสำคัญ')" :aria-busy="loading">
      <button class="text-left min-w-0 hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-brand-ring rounded-l-lg" :disabled="!ready || !rows.length" :aria-label="t('ดูที่มาของค่าใช้จ่าย')" @click="openDetails('department')">
        <UiStat plain :label="costTitle" :value="failed ? '—' : money(totals.cost)" :unit="t('บาท')" :loading="loading" :delta="ready ? change ?? null : null" delta-inverse
          :hint="totals.unpriced ? t('ยังยืนยันราคาไม่ได้ {0} รายการ', [formatCount(totals.unpriced)]) : previousLabel">
          <template #icon><ArrowUpRight :size="16" class="text-brand-ink" /></template>
        </UiStat>
      </button>
      <button class="text-left min-w-0 hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-brand-ring" :disabled="!ready || !rows.length" :aria-label="t('วิเคราะห์รายเครื่อง')" @click="openDetails('device')">
        <UiStat plain tone="ink" :label="t('ยอดพิมพ์จริง')" :value="ready ? formatCount(totals.rawPages) : '—'" :unit="t('หน้า')" :loading="loading"
          :hint="ready ? t('สุทธิหลังหัก 2% {0} หน้า', [formatNetPages(totals.netPages)]) : ''">
          <template #icon><ArrowUpRight :size="16" class="text-brand-ink" /></template>
        </UiStat>
      </button>
      <UiStat plain tone="ink" :label="t('เครื่องพิมพ์ทั้งหมด')" :value="ready ? formatCount(fleet.total_devices) : '—'" :unit="t('เครื่อง')" :loading="loading"
        :hint="ready ? `${t('มียอดในช่วงนี้ {0} เครื่อง', [formatCount(totals.devices)])} · ${t('ใช้งานอยู่ {0} เครื่อง', [formatCount(fleet.active_devices)])} · ${t('เดือนที่บันทึกครบ')} ${coverageLabel}` : ''" />
    </section>

    <PrintComparison v-model:state="state" :model="model" :options="options" :loading="loading" :failed="failed" :scope-text="scopeText"
      @details="(entry) => openDetails('device', entry)">
      <template #actions>
        <ExportExcelButton :disabled="Boolean(blockedReason)" :raw-disabled="!ready || !model.scopeRows.length" :busy="exportBusy" :reason="blockedReason"
          @report="runExport('report')" @raw="runExport('raw')" />
      </template>
    </PrintComparison>

    <ComparisonTable class="mb-4" :model="model" :loading="loading" :description="`${comparisonTitle(model)} · ${periodText}`"
      @details="(entry) => openDetails('device', entry)" />

    <!-- หมายเหตุขอบเขตของตัวเลขบนหน้านี้ ไม่ใช่ที่เก็บงานค้าง — งานค้างอยู่ในลิ้นชัก
         แจ้งเตือนที่เดียว ส่วนข้อจำกัดของตัวเลขแต่ละตัวติดอยู่กับตัวเลขนั้นเอง -->
    <footer class="text-xs text-ink-mute leading-relaxed">
      <p>{{ t('ข้อมูลเฉพาะเดือนที่บันทึกแล้ว') }} · {{ t('เดือนที่บันทึกเป็นศูนย์ยังแสดงในรายงาน') }} · {{ t('ยอดพิมพ์จริงคือจำนวนหน้าที่บันทึก ส่วนค่าใช้จ่ายคิดจากหน้าสุทธิหลังหัก 2%') }}</p>
    </footer>
    <ExecutiveDetails v-model:open="detailOpen" :rows="rows" :scope="detailScope" :context="`${yearText} · ${periodText}`" :initial-group="detailGroup" />
  </div>
</template>
